/**
 * Computed-formula function registry.
 *
 * Built-ins (concat, age, sum, avg, min, max, count) live here. Hosts and plugins
 * add or replace functions with registerFormulaFunction. Templates store only the
 * formula string — never function bodies.
 */

import { parseNumericValue } from './currency-format.js';

export type FormulaFunctionKind = 'scalar' | 'aggregate';

export type FormulaFunctionArity = number | { min?: number; max?: number };

export interface FormulaFunctionDef {
  /** Identifier used in formulas (`round`, `ifEmpty`, …). */
  name: string;
  /**
   * `aggregate` takes one `{Field}` / column reference (like `sum`).
   * `scalar` takes comma-separated expressions (like `concat` / `age`).
   */
  kind?: FormulaFunctionKind;
  /** Argument count for scalar functions. Aggregates always take one field ref. */
  arity?: FormulaFunctionArity;
  /**
   * Scalar: evaluated argument values.
   * Aggregate: resolved cell/field values from the referenced column or field.
   */
  impl: (args: unknown[]) => unknown;
  /** Formula-picker button label. Defaults to `name`. */
  label?: string;
  description?: string;
  /** When false, omit from the formula picker wrap buttons. Default true. */
  picker?: boolean;
}

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const customFunctions = new Map<string, FormulaFunctionDef>();

function normalizeName(name: unknown): string {
  return String(name ?? '').trim();
}

export function isValidFormulaFunctionName(name: unknown): name is string {
  return typeof name === 'string' && NAME_RE.test(name.trim());
}

function assertValidDef(def: FormulaFunctionDef): string {
  const name = normalizeName(def.name);
  if (!isValidFormulaFunctionName(name)) {
    throw new Error(`Invalid formula function name: ${String(def?.name ?? '')}`);
  }
  if (typeof def.impl !== 'function') {
    throw new Error(`Formula function "${name}" needs impl()`);
  }
  return name;
}

function ageFromIsoDate(value: unknown): number | string {
  const str = String(value ?? '').trim();
  if (!str) return '';
  const date = new Date(`${str}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date for age()');
  const today = new Date();
  let years = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    years -= 1;
  }
  return years;
}

function numericValues(values: unknown[]): number[] {
  const nums: number[] = [];
  for (const value of values) {
    if (typeof value === 'string' && value.trim() === '') continue;
    const num = parseNumericValue(value);
    if (num == null) continue;
    nums.push(num);
  }
  return nums;
}

function applyNumericAggregate(
  values: unknown[],
  reduce: (nums: number[]) => number,
): number | string {
  const nonEmpty = values.filter((value) => value != null && value !== '');
  const nums = numericValues(nonEmpty);
  if (!nums.length) return '';
  return reduce(nums);
}

const BUILTIN_FORMULA_FUNCTIONS: FormulaFunctionDef[] = [
  {
    name: 'concat',
    kind: 'scalar',
    impl: (args) => args.map((arg) => arg ?? '').join(''),
    description: 'Join arguments as strings',
  },
  {
    name: 'age',
    kind: 'scalar',
    arity: 1,
    impl: (args) => ageFromIsoDate(args[0]),
    description: 'Age in years from an ISO date',
  },
  {
    name: 'sum',
    kind: 'aggregate',
    impl: (values) => applyNumericAggregate(values, (nums) => nums.reduce((t, n) => t + n, 0)),
    description: 'Sum numeric values in a field or column',
  },
  {
    name: 'avg',
    kind: 'aggregate',
    impl: (values) =>
      applyNumericAggregate(values, (nums) => nums.reduce((t, n) => t + n, 0) / nums.length),
    description: 'Average of numeric values in a field or column',
  },
  {
    name: 'min',
    kind: 'aggregate',
    impl: (values) => applyNumericAggregate(values, (nums) => Math.min(...nums)),
    description: 'Minimum numeric value in a field or column',
  },
  {
    name: 'max',
    kind: 'aggregate',
    impl: (values) => applyNumericAggregate(values, (nums) => Math.max(...nums)),
    description: 'Maximum numeric value in a field or column',
  },
  {
    name: 'count',
    kind: 'aggregate',
    impl: (values) => values.filter((value) => value != null && value !== '').length,
    description: 'Count of non-empty values in a field or column',
  },
];

const builtinByName = new Map(BUILTIN_FORMULA_FUNCTIONS.map((def) => [def.name, def]));

function defFromOverlay(overlay: FormulaFunctionDef[] | undefined, name: string): FormulaFunctionDef | undefined {
  if (!overlay?.length) return undefined;
  for (let i = overlay.length - 1; i >= 0; i -= 1) {
    const def = overlay[i];
    if (def && normalizeName(def.name) === name) return { ...def, name };
  }
  return undefined;
}

/**
 * Add or replace a formula function. Same name as a built-in overrides it
 * until unregisterFormulaFunction restores the built-in.
 */
export function registerFormulaFunction(def: FormulaFunctionDef): FormulaFunctionDef {
  const name = assertValidDef(def);
  const stored: FormulaFunctionDef = { ...def, name };
  customFunctions.set(name, stored);
  return stored;
}

/** Remove a plugin/host override. Built-ins are not deleted. */
export function unregisterFormulaFunction(name: string): boolean {
  return customFunctions.delete(normalizeName(name));
}

/** Drop all plugin/host overrides (tests / host teardown). Built-ins remain. */
export function resetFormulaFunctions(): void {
  customFunctions.clear();
}

export function getFormulaFunction(
  name: string,
  overlay?: FormulaFunctionDef[],
): FormulaFunctionDef | undefined {
  const key = normalizeName(name);
  if (!key) return undefined;
  return defFromOverlay(overlay, key) ?? customFunctions.get(key) ?? builtinByName.get(key);
}

export function listFormulaFunctions(overlay?: FormulaFunctionDef[]): FormulaFunctionDef[] {
  const byName = new Map<string, FormulaFunctionDef>();
  for (const def of BUILTIN_FORMULA_FUNCTIONS) {
    byName.set(def.name, def);
  }
  for (const def of customFunctions.values()) {
    byName.set(def.name, def);
  }
  if (overlay) {
    for (const def of overlay) {
      if (!def) continue;
      const name = normalizeName(def.name);
      if (!isValidFormulaFunctionName(name)) continue;
      byName.set(name, { ...def, name });
    }
  }
  return [...byName.values()].sort((a, b) => {
    const ak = a.kind === 'aggregate' ? 0 : 1;
    const bk = b.kind === 'aggregate' ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return a.name.localeCompare(b.name);
  });
}

export function listFormulaPickerFunctions(overlay?: FormulaFunctionDef[]): FormulaFunctionDef[] {
  return listFormulaFunctions(overlay).filter((def) => def.picker !== false);
}

export function checkFormulaArity(name: string, arity: FormulaFunctionArity | undefined, count: number): void {
  if (arity == null) return;
  if (typeof arity === 'number') {
    if (count !== arity) {
      throw new Error(`${name}() expects ${arity} argument${arity === 1 ? '' : 's'}`);
    }
    return;
  }
  if (arity.min != null && count < arity.min) {
    throw new Error(`${name}() expects at least ${arity.min} argument${arity.min === 1 ? '' : 's'}`);
  }
  if (arity.max != null && count > arity.max) {
    throw new Error(`${name}() expects at most ${arity.max} argument${arity.max === 1 ? '' : 's'}`);
  }
}

export function invokeFormulaFunction(def: FormulaFunctionDef, args: unknown[]): unknown {
  checkFormulaArity(def.name, def.arity, args.length);
  return def.impl(args);
}
