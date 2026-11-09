import {
  extractFormulaReferences,
  extractFormulaDependencyFieldIds,
  resolveFormulaReference,
} from './formula-field-index.js';
import { cellFieldId, parseCellFieldId } from './field-schemas.js';
import type { EditorBlock, FieldSchema } from '../types.js';
import {
  getFormulaFunction,
  invokeFormulaFunction,
  type FormulaFunctionDef,
} from './formula-functions.js';
import { parseNumericValue } from './currency-format.js';

export { extractFormulaDependencyFieldIds } from './formula-field-index.js';
export {
  registerFormulaFunction,
  unregisterFormulaFunction,
  resetFormulaFunctions,
  getFormulaFunction,
  listFormulaFunctions,
  listFormulaPickerFunctions,
  type FormulaFunctionDef,
  type FormulaFunctionKind,
  type FormulaFunctionArity,
} from './formula-functions.js';

type FieldSchemaMap = Record<string, FieldSchema>;
type ValueMap = Record<string, unknown>;

type Token =
  | { type: 'FIELD'; value: string }
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: number }
  | { type: 'IDENT'; value: string }
  | { type: 'OP'; value: string }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'COMMA' }
  | { type: 'EOF' };

type FormulaResult = { value: string; error: string | null };

type FormulaRuntime = {
  values: ValueMap;
  fieldSchemas: FieldSchemaMap;
  evaluating: Set<string>;
  blocks: EditorBlock[];
  selfId?: string;
  selfCellRef?: { tableFieldId: string; rowKey: string; colKey: string } | null;
  formulaFunctions?: FormulaFunctionDef[];
};

type EvaluateOptions = {
  evaluating?: Iterable<string>;
  selfId?: string;
  blocks?: EditorBlock[];
  /** Per-call overlay; merged on top of built-ins and registerFormulaFunction. */
  formulaFunctions?: FormulaFunctionDef[];
};

/** Raw reference strings inside `{…}` braces (field IDs or dot paths). */
export function extractFormulaDependencies(formula: string): string[] {
  return extractFormulaReferences(formula);
}

export function detectCircularDependency(
  fieldId: string,
  formula: string,
  fieldSchemas: FieldSchemaMap,
  blocks: EditorBlock[] = [],
): boolean {
  if (!fieldId || !formula) return false;

  const depIds = extractFormulaDependencyFieldIds(formula, blocks, fieldSchemas);
  if (depIds.includes(fieldId)) return true;

  const processingFieldIds = new Set([fieldId]);
  function hasCycle(depId: string): boolean {
    if (processingFieldIds.has(depId)) return true;
    const schema = fieldSchemas?.[depId];
    if (schema?.type !== 'computed') return false;
    processingFieldIds.add(depId);
    const nested = extractFormulaDependencyFieldIds(
      (schema.formula as string | undefined) ?? '',
      blocks,
      fieldSchemas,
    );
    const cyclic = nested.some(hasCycle);
    processingFieldIds.delete(depId);
    return cyclic;
  }

  return depIds.some(hasCycle);
}

function scalarizeRawValue(value: unknown): unknown {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'object') return '';
  return value;
}

function isNumericValue(value: unknown): boolean {
  if (value === '' || value == null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return parseNumericValue(value) != null;
}

function toNumber(value: unknown): number {
  if (value === '' || value == null) throw new Error('Expected number');
  const num = parseNumericValue(value);
  if (num == null) throw new Error('Expected number');
  return num;
}

function formatResult(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  }
  return String(value);
}

function resolveScalarFieldValue(fieldId: string, runtime: FormulaRuntime): unknown {
  if (runtime.evaluating.has(fieldId)) {
    throw new Error('Circular reference');
  }

  const schema = runtime.fieldSchemas?.[fieldId];
  if (schema?.type === 'computed') {
    runtime.evaluating.add(fieldId);
    const prevSelfId = runtime.selfId;
    const prevSelfCellRef = runtime.selfCellRef;
    runtime.selfId = fieldId;
    runtime.selfCellRef = parseCellFieldId(fieldId, runtime.fieldSchemas);
    try {
      const { value, error } = evaluateFormulaInternal(
        (schema.formula as string | undefined) ?? '',
        runtime,
      );
      if (error) throw new Error(error);
      return scalarizeRawValue(value);
    } finally {
      runtime.selfId = prevSelfId;
      runtime.selfCellRef = prevSelfCellRef;
      runtime.evaluating.delete(fieldId);
    }
  }

  return scalarizeRawValue(runtime.values?.[fieldId]);
}

function resolveReferenceValues(ref: string, runtime: FormulaRuntime): unknown[] {
  const resolved = resolveFormulaReference(ref, runtime.blocks, runtime.fieldSchemas);

  if (!resolved) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ref) && runtime.fieldSchemas?.[ref]) {
      return [resolveScalarFieldValue(ref, runtime)];
    }
    throw new Error(`Unknown field reference: ${ref}`);
  }

  if (resolved.kind === 'scalar') {
    return [resolveScalarFieldValue(resolved.fieldId, runtime)];
  }

  const selfCellRef = runtime.selfCellRef;
  if (selfCellRef && resolved.tableId === selfCellRef.tableFieldId) {
    const sameRowCellId = cellFieldId(resolved.tableId, selfCellRef.rowKey, resolved.colKey);
    if (runtime.fieldSchemas?.[sameRowCellId]) {
      return [resolveScalarFieldValue(sameRowCellId, runtime)];
    }
  }

  return resolved.cellIds.map((cellId) => resolveScalarFieldValue(cellId, runtime));
}

function resolveReferenceDisplay(ref: string, runtime: FormulaRuntime): string {
  const rawValues = resolveReferenceValues(ref, runtime);
  const nonEmpty = rawValues.filter((value) => value != null && value !== '');
  return nonEmpty.join('; ');
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }

    if (c === '{') {
      const end = src.indexOf('}', i + 1);
      if (end === -1) throw new Error('Unclosed field reference');
      tokens.push({ type: 'FIELD', value: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (c === '"') {
      let j = i + 1;
      let str = '';
      while (j < src.length) {
        if (src[j] === '\\' && j + 1 < src.length) {
          str += src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === '"') break;
        str += src[j];
        j += 1;
      }
      if (src[j] !== '"') throw new Error('Unclosed string');
      tokens.push({ type: 'STRING', value: str });
      i = j + 1;
      continue;
    }

    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j += 1;
      tokens.push({ type: 'NUMBER', value: Number(src.slice(i, j)) });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j]!)) j += 1;
      tokens.push({ type: 'IDENT', value: src.slice(i, j) });
      i = j;
      continue;
    }

    if ('+-*/()'.includes(c)) {
      if (c === '(') tokens.push({ type: 'LPAREN' });
      else if (c === ')') tokens.push({ type: 'RPAREN' });
      else tokens.push({ type: 'OP', value: c });
      i += 1;
      continue;
    }

    if (c === ',') {
      tokens.push({ type: 'COMMA' });
      i += 1;
      continue;
    }

    throw new Error(`Unexpected character: ${c}`);
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}

class Parser {
  tokens: Token[];
  pos: number;
  runtime: FormulaRuntime;

  constructor(tokens: Token[], runtime: FormulaRuntime) {
    this.tokens = tokens;
    this.pos = 0;
    this.runtime = runtime;
  }

  peek(): Token {
    return this.tokens[this.pos]!;
  }

  consume(type: Token['type'], value?: string): Token {
    const token = this.peek();
    if (
      token.type !== type ||
      (value != null && 'value' in token && token.value !== value)
    ) {
      throw new Error('Invalid formula syntax');
    }
    this.pos += 1;
    return token;
  }

  parseExpression(): unknown {
    let left: unknown = this.parseTerm();
    while (true) {
      const token = this.peek();
      if (token.type !== 'OP' || (token.value !== '+' && token.value !== '-')) break;
      const op = (this.consume('OP') as { type: 'OP'; value: string }).value;
      const right = this.parseTerm();
      if (op === '+') {
        if (isNumericValue(left) && isNumericValue(right)) {
          left = toNumber(left) + toNumber(right);
        } else {
          left = `${left ?? ''}${right ?? ''}`;
        }
      } else {
        left = toNumber(left) - toNumber(right);
      }
    }
    return left;
  }

  parseTerm(): unknown {
    let left: unknown = this.parseFactor();
    while (true) {
      const token = this.peek();
      if (token.type !== 'OP' || (token.value !== '*' && token.value !== '/')) break;
      const op = (this.consume('OP') as { type: 'OP'; value: string }).value;
      const right = this.parseFactor();
      if (op === '*') {
        left = toNumber(left) * toNumber(right);
      } else {
        const divisor = toNumber(right);
        if (divisor === 0) throw new Error('Division by zero');
        left = toNumber(left) / divisor;
      }
    }
    return left;
  }

  parseFactor(): unknown {
    const token = this.peek();

    if (token.type === 'NUMBER') {
      this.pos += 1;
      return token.value;
    }

    if (token.type === 'STRING') {
      this.pos += 1;
      return token.value;
    }

    if (token.type === 'FIELD') {
      this.pos += 1;
      return resolveReferenceDisplay(token.value, this.runtime);
    }

    if (token.type === 'IDENT') {
      const name = token.value;
      this.pos += 1;
      if (this.peek().type !== 'LPAREN') {
        throw new Error(`Unknown identifier: ${name}`);
      }
      return this.parseCall(name);
    }

    if (token.type === 'LPAREN') {
      this.consume('LPAREN');
      const value = this.parseExpression();
      this.consume('RPAREN');
      return value;
    }

    throw new Error('Invalid formula syntax');
  }

  parseCall(name: string): unknown {
    const def = getFormulaFunction(name, this.runtime.formulaFunctions);
    if (!def) {
      throw new Error(`Unknown function: ${name}`);
    }

    this.consume('LPAREN');

    if ((def.kind ?? 'scalar') === 'aggregate') {
      const token = this.peek();
      if (token.type !== 'FIELD') {
        throw new Error(`${name}() expects a field reference`);
      }
      this.pos += 1;
      const refValues = resolveReferenceValues(token.value, this.runtime);
      this.consume('RPAREN');
      return def.impl(refValues);
    }

    const args: unknown[] = [];
    if (this.peek().type !== 'RPAREN') {
      args.push(this.parseExpression());
      while (this.peek().type === 'COMMA') {
        this.consume('COMMA');
        args.push(this.parseExpression());
      }
    }
    this.consume('RPAREN');
    return invokeFormulaFunction(def, args);
  }

  parse(): unknown {
    const value = this.parseExpression();
    if (this.peek().type !== 'EOF') throw new Error('Invalid formula syntax');
    return value;
  }
}

function evaluateFormulaInternal(
  formula: string | null | undefined,
  runtime: FormulaRuntime,
): FormulaResult {
  if (!formula?.trim()) return { value: '', error: null };

  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens, runtime);
    const result = parser.parse();
    return { value: formatResult(result), error: null };
  } catch (err) {
    return { value: '—', error: (err as Error).message ?? 'Formula error' };
  }
}

export function evaluateFormula(
  formula: string,
  values: ValueMap,
  fieldSchemas: FieldSchemaMap,
  options: EvaluateOptions = {},
): FormulaResult {
  const evaluating = new Set(options.evaluating ?? []);
  if (options.selfId) evaluating.add(options.selfId);
  const selfCellRef = options.selfId
    ? parseCellFieldId(options.selfId, fieldSchemas)
    : null;
  return evaluateFormulaInternal(formula, {
    values,
    fieldSchemas,
    evaluating,
    blocks: options.blocks ?? [],
    selfId: options.selfId,
    selfCellRef,
    formulaFunctions: options.formulaFunctions,
  });
}

export function evaluateComputedField(
  fieldId: string,
  values: ValueMap,
  fieldSchemas: FieldSchemaMap,
  options: { blocks?: EditorBlock[]; formulaFunctions?: FormulaFunctionDef[] } = {},
): FormulaResult {
  const schema = fieldSchemas?.[fieldId];
  if (!schema || schema.type !== 'computed') return { value: '', error: null };
  return evaluateFormula((schema.formula as string | undefined) ?? '', values, fieldSchemas, {
    selfId: fieldId,
    blocks: options.blocks ?? [],
    formulaFunctions: options.formulaFunctions,
  });
}
