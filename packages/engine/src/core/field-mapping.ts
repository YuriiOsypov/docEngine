import { IO_VERSION } from './document-io.js';
import { resolveSectionName, findFieldPlacement } from './field-id.js';
import { resolveFieldIdByName } from './field-id.js';
import { walkSegments } from './segment-tree.js';
import { getRepeaterFieldSchemas } from './repeater-io.js';
import { isTableRowArray } from './field-io/table-field-io.js';
import { normalizeDocumentValues, applyDocumentValues } from './document-io.js';
import { parseCellFieldId } from './field-schemas.js';
import { parseMappingSourcePath } from './date-format.js';
import { applyMappingFormatSuffix, looksLikeMappingFormatSuffix } from './mapping-format.js';
import type { FieldSchema } from '../types.js';

export {
  parseMappingSourcePath,
  formatDateValue,
  parseDateParts,
  toIsoDateString,
  applyCustomDatePattern,
  looksLikeDateFormatSuffix,
  DEFAULT_DATE_FORMAT,
  DEFAULT_CUSTOM_DATE_FORMAT,
} from './date-format.js';
export type {
  DateDisplayFormat,
  DateParts,
  FormatDateValueOptions,
  ParsedMappingSourcePath,
} from './date-format.js';
export {
  formatCurrencyValue,
  formatNumericDisplay,
  parseCurrencyFormatSuffix,
  parseNumericValue,
  looksLikeCurrencyFormatSuffix,
  DEFAULT_MAPPING_CURRENCY,
  DEFAULT_MAPPING_LOCALE,
} from './currency-format.js';
export type {
  CurrencyFormatSpec,
  FormatCurrencyValueOptions,
  IntegerDisplayFormat,
  NumericDisplayOptions,
} from './currency-format.js';
export { applyMappingFormatSuffix, looksLikeMappingFormatSuffix } from './mapping-format.js';

export const FIELD_MAPPING_KIND = 'fieldMapping';
export const FIELD_MAPPING_VERSION = 1;

type SoftSchema = FieldSchema & Record<string, any>;
type FieldMappingRule = {
  section: string;
  field: string;
  childField?: string;
  childFieldPath?: string;
  columnKey?: string;
  sourcePath: string;
  sourceArrayPath?: string;
  fieldId?: string;
  childFieldId?: string;
  [key: string]: any;
};
type SourceTreeNode = {
  key: string;
  path: string;
  type: string;
  children?: SourceTreeNode[];
};

/**
 * @param {unknown} data
 * @returns {data is import('../types.d.ts').FieldMappingSpec}
 */
export function isFieldMappingSpec( data: any) {
  if (!data || typeof data !== 'object' || /** @type {{ kind?: string }} */ (data).kind !== FIELD_MAPPING_KIND) {
    return false;
  }
  const spec = /** @type {{ expression?: unknown; rules?: unknown }} */ (data);
  if (typeof spec.expression === 'string' && spec.expression.trim()) return true;
  if (Array.isArray(spec.rules)) return true;
  return typeof spec.expression === 'string';
}

/**
 * @param {string} path
 * @param {unknown} data
 * @returns {unknown}
 */
export function getPayloadByPath( path: any, data: any) {
  const trimmed = String(path ?? '').trim();
  if (!trimmed) return data;

  /** @type {string[]} */
  const parts = [];
  let rest = trimmed;
  while (rest.length > 0) {
    const bracket = rest.match(/^(\[[^\]]+\])/);
    if (bracket) {
      parts.push(bracket[1]);
      rest = rest.slice(bracket[1].length).replace(/^\./, '');
      continue;
    }
    const dot = rest.match(/^([^.\[]+)(?:\.|$)/);
    if (dot) {
      parts.push(dot[1]);
      rest = rest.slice(dot[1].length).replace(/^\./, '');
      continue;
    }
    break;
  }

  let current = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    if (part.startsWith('[')) {
      const keyMatch = part.match(/^\["(.+)"\]$/) ?? part.match(/^\['(.+)'\]$/);
      const indexMatch = part.match(/^\[(\d+)\]$/);
      if (keyMatch) {
        current = /** @type {Record<string, unknown>} */ (current)[keyMatch[1]];
      } else if (indexMatch) {
        current = /** @type {unknown[]} */ (current)[Number(indexMatch[1])];
      } else {
        return undefined;
      }
      continue;
    }
    current = /** @type {Record<string, unknown>} */ (current)[part];
  }
  return current;
}

/**
 * Whether a dotted/$payload path exists on the payload object (missing key ≠ undefined value).
 * @param {string} path
 * @param {unknown} data
 */
export function payloadPathExists(path: any, data: any) {
  const trimmed = String(path ?? '').trim();
  if (!trimmed) return data !== undefined;

  /** @type {string[]} */
  const parts = [];
  let rest = trimmed;
  while (rest.length > 0) {
    const bracket = rest.match(/^(\[[^\]]+\])/);
    if (bracket) {
      parts.push(bracket[1]);
      rest = rest.slice(bracket[1].length).replace(/^\./, '');
      continue;
    }
    const dot = rest.match(/^([^.\[]+)(?:\.|$)/);
    if (dot) {
      parts.push(dot[1]);
      rest = rest.slice(dot[1].length).replace(/^\./, '');
      continue;
    }
    break;
  }

  let current = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return false;
    if (part.startsWith('[')) {
      const keyMatch = part.match(/^\["(.+)"\]$/) ?? part.match(/^\['(.+)'\]$/);
      const indexMatch = part.match(/^\[(\d+)\]$/);
      if (keyMatch) {
        const next = resolvePathProperty(current, keyMatch[1]);
        if (!next.ok) return false;
        current = next.value;
      } else if (indexMatch) {
        const index = Number(indexMatch[1]);
        if (!Array.isArray(current) || index < 0 || index >= current.length) return false;
        current = current[index];
      } else {
        return false;
      }
      continue;
    }
    const next = resolvePathProperty(current, part);
    if (!next.ok) return false;
    current = next.value;
  }
  return true;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value: any) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} rows
 * @returns {boolean}
 */
function isObjectRowArray(rows: any) {
  return Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every((row) => isPlainObject(row));
}

/**
 * Resolve a property on a plain object, or an index-free column on a table-style
 * array of row objects (same convention as buildArrayColumnFields).
 * @param {unknown} current
 * @param {string} key
 * @returns {{ ok: true; value: unknown } | { ok: false }}
 */
function resolvePathProperty(current: any, key: string): { ok: true; value: unknown } | { ok: false } {
  if (current != null && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, key)) {
    return { ok: true, value: /** @type {Record<string, unknown>} */ (current)[key] };
  }
  if (isObjectRowArray(current) && Object.prototype.hasOwnProperty.call(current[0], key)) {
    return { ok: true, value: current[0][key] };
  }
  return { ok: false };
}

/**
 * @param {string} sourcePath
 * @param {unknown} payload
 */
export function sourcePathExists(sourcePath: any, payload: any) {
  const { path } = parseMappingSourcePath(sourcePath);
  if (!path) return false;
  if (path.startsWith('$payload')) {
    const stripped = path.replace(/^\$payload\.?/, '');
    if (!stripped) return payload !== undefined;
    return payloadPathExists(stripped, payload);
  }
  return payloadPathExists(path, payload);
}

/**
 * @param {string} sourcePath
 * @param {unknown} payload
 * @returns {unknown}
 */
export function resolveSourcePath( sourcePath: any, payload: any) {
  const { path } = parseMappingSourcePath(sourcePath);
  if (!path) return undefined;
  if (path.startsWith('$payload')) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('$payload', `"use strict"; return (${path});`);
      return fn(payload);
    } catch {
      const stripped = path.replace(/^\$payload\.?/, '');
      return stripped ? getPayloadByPath(stripped, payload) : payload;
    }
  }
  return getPayloadByPath(path, payload);
}

/**
 * Resolve a mapping source path and apply an optional `#format` suffix
 * (date or currency), e.g. `$payload.CreatedDate#dd/mm/yyyy` or `$payload.Amount#EUR`.
 */
export function resolveMappedSourceValue(sourcePath: any, payload: any): unknown {
  const { path, dateFormat } = parseMappingSourcePath(sourcePath);
  const value = resolveSourcePath(path || sourcePath, payload);
  if (!dateFormat || !looksLikeMappingFormatSuffix(dateFormat)) return value;
  return applyMappingFormatSuffix(value, dateFormat);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describePayloadType( value: any) {
  if (value == null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

/**
 * @param {unknown} payload
 * @param {string} [basePath]
 * @returns {Array<{ key: string; path: string; type: string; children?: ReturnType<typeof buildSourcePayloadTree> }>}
 */
export function buildSourcePayloadTree( payload: any, basePath: any = '$payload'): SourceTreeNode[] {
  if (payload == null || typeof payload !== 'object') {
    return [{
      key: String(payload),
      path: basePath,
      type: describePayloadType(payload),
    }];
  }

  if (Array.isArray(payload)) {
    const columnFields = buildArrayColumnFields(basePath, payload);
    if (columnFields?.length) {
      return columnFields.map((field: SourceTreeNode) => ({
        key: field.key,
        path: field.path,
        type: field.type,
        children: field.children,
      }));
    }

    return payload.slice(0, 5).map((item: any, index: number) => ({
      key: `[${index}]`,
      path: `${basePath}[${index}]`,
      type: describePayloadType(item),
      children:
        item != null && typeof item === 'object' && !Array.isArray(item)
          ? buildSourcePayloadTree(item, `${basePath}[${index}]`)
          : undefined,
    }));
  }

  return Object.entries(payload).map(([key, value]) => {
    const path = /^[a-zA-Z_$][\w$]*$/.test(key)
      ? `${basePath}.${key}`
      : `${basePath}[${JSON.stringify(key)}]`;
    const type = describePayloadType(value);
    return {
      key,
      path,
      type,
      children:
        value != null && typeof value === 'object'
          ? buildSourcePayloadTree(value, path)
          : undefined,
    };
  });
}

/**
 * @param {string} expression
 * @returns {string}
 */
export function unwrapMappingExpression( expression: any) {
  let expr = String(expression ?? '').trim();
  if (expr.startsWith('{{') && expr.endsWith('}}')) {
    expr = expr.slice(2, -2).trim();
  }
  return expr;
}

/**
 * @param {string} expression
 * @param {unknown} payload
 * @param {{ blocks?: import('../types.d.ts').EditorBlock[]; fieldSchemas?: Record<string, import('../types.d.ts').FieldSchema> }} [template]
 * @returns {unknown}
 */
export function evaluateFieldMappingExpression( expression: any, payload: any, template: any = {}) {
  const expr = unwrapMappingExpression(expression);
  if (!expr) {
    throw new Error('Field mapping expression is empty.');
  }

  const $payload = payload;
  const $template = template;
  const $get = (path: any) => getPayloadByPath(path, $payload);

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('$payload', '$template', '$get', `"use strict"; return (${expr});`);
    return fn($payload, $template, $get);
  } catch (err) {
    throw new Error(`Field mapping expression failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @returns {Map<string, string>}
 */
function buildFieldNameToSectionMap( blocks: any, fieldSchemas: any) {
  /** @type {Map<string, string>} */
  const map = new Map();

  const register = (sectionName: any, fieldName: any) => {
    const normalized = String(fieldName ?? '').trim();
    if (!normalized) return;
    if (!map.has(normalized)) {
      map.set(normalized, sectionName);
    }
  };

  for (const block of blocks ?? []) {
    const data = block.data ?? {};

    if (block.type === 'documentSection') {
      const sectionName = resolveSectionName(data);
      walkSegments(data.segments ?? [], (seg) => {
        if ((seg.type === 'field' || seg.type === 'child' || seg.type === 'table') && seg.id) {
          const schema = fieldSchemas[seg.id];
          register(sectionName, schema?.name ?? schema?.label ?? seg.id);
        }
      });
      continue;
    }

    if (block.type === 'visionTable' || block.type === 'templateBlock') {
      const fieldId = data.fieldId;
      if (!fieldId) continue;
      const schema = fieldSchemas[fieldId];
      register('_root', schema?.name ?? schema?.label ?? fieldId);
    }
  }

  return map;
}

/**
 * @param {unknown} raw
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @returns {import('../types.d.ts').FieldsExport}
 */
export function normalizeMappingResult( raw: any, blocks: any, fieldSchemas: any) {
  if (isFieldsExportShape(raw)) {
    return {
      kind: 'field',
      version: IO_VERSION,
      time: Date.now(),
      sections: raw.sections ?? undefined,
      values: raw.values ?? undefined,
    };
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.sections && typeof raw.sections === 'object') {
    return {
      kind: 'field',
      version: IO_VERSION,
      time: Date.now(),
      sections: /** @type {Record<string, import('../types.d.ts').DocumentSectionValues>} */ (raw.sections),
    };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Field mapping must return an object.');
  }

  const fieldMap = /** @type {Record<string, unknown>} */ (raw);
  const nameToSection = buildFieldNameToSectionMap(blocks, fieldSchemas);
  const sections: Record<string, Record<string, unknown>> = {};

  for (const [fieldName, value] of Object.entries(fieldMap)) {
    const sectionName = nameToSection.get(fieldName);
    if (!sectionName) continue;
    if (!sections[sectionName]) sections[sectionName] = {};
    sections[sectionName][fieldName] = value;
  }

  if (!Object.keys(sections).length) {
    throw new Error('Field mapping result did not match any template field names.');
  }

  return {
    kind: 'field',
    version: IO_VERSION,
    time: Date.now(),
    sections,
  };
}

/**
 * @param {unknown} data
 */
function isFieldsExportShape( data: any) {
  return (
    !!data &&
    typeof data === 'object' &&
    (/** @type {{ kind?: string }} */ (data).kind === 'field' ||
      (/** @type {{ kind?: string; blocks?: unknown[] }} */ (data).kind === 'document' &&
        !Array.isArray(/** @type {{ blocks?: unknown[] }} */ (data).blocks)))
  );
}

/**
 * @param {import('../types.d.ts').FieldSchema | undefined} schema
 * @param {unknown} value
 * @returns {string | null}
 */
function validateMappedFieldValue( schema: any, value: any) {
  if (!schema) return null;

  switch (schema.type) {
    case 'child':
      if (value == null) return null;
      if (typeof value !== 'object' || Array.isArray(value)) {
        return `Field "${schema.name ?? schema.label}" is a child field and requires a nested object value.`;
      }
      return null;
    case 'list':
    case 'tree':
      if (value == null || value === '') return null;
      if (!Array.isArray(value)) {
        return `Field "${schema.name ?? schema.label}" expects an array value.`;
      }
      return null;
    case 'table':
      if (value == null) return null;
      if (!isTableRowArray(value)) {
        return `Field "${schema.name ?? schema.label}" expects a table row array.`;
      }
      return null;
    case 'integer':
      if (value == null || value === '') return null;
      if (typeof value !== 'string' && typeof value !== 'number') {
        return `Field "${schema.name ?? schema.label}" expects a string or number.`;
      }
      return null;
    case 'logical':
      if (value == null) return null;
      if (typeof value !== 'boolean') {
        return `Field "${schema.name ?? schema.label}" expects a boolean value.`;
      }
      return null;
    case 'signature':
      if (value == null || value === '') return null;
      if (typeof value === 'string') return null;
      if (typeof value === 'object' && !Array.isArray(value) && 'url' in value) return null;
      return `Field "${schema.name ?? schema.label}" expects a signature data URL string.`;
    default:
      return null;
  }
}

/**
 * @param {Record<string, import('../types.d.ts').FieldSchema>} childSchemas
 * @param {Record<string, unknown>} value
 * @param {string} sectionName
 * @param {string} fieldPrefix
 * @param {Array<{ section: string; field: string; message: string }>} errors
 * @param {Array<{ section: string; field: string; message: string }>} warnings
 */
function validateChildMappedObject( childSchemas: any, value: any, sectionName: any, fieldPrefix: any, errors: any, warnings: any) {
  for (const [childKey, childValue] of Object.entries(value ?? {})) {
    let childSchema = childSchemas[childKey] as SoftSchema | undefined;
    if (!childSchema) {
      for (const schemaRaw of Object.values(childSchemas)) {
        const schema = schemaRaw as SoftSchema;
        const name = schema.name ?? schema.label;
        if (name === childKey) {
          childSchema = schema;
          break;
        }
      }
    }

    if (!childSchema) {
      warnings.push({
        section: sectionName,
        field: `${fieldPrefix}.${childKey}`,
        message: `Unknown child field "${childKey}".`,
      });
      continue;
    }

    if (
      childSchema.type === 'child' &&
      childValue &&
      typeof childValue === 'object' &&
      !Array.isArray(childValue)
    ) {
      validateChildMappedObject(
        getRepeaterFieldSchemas(childSchema),
        /** @type {Record<string, unknown>} */ (childValue),
        sectionName,
        `${fieldPrefix}.${childKey}`,
        errors,
        warnings,
      );
      continue;
    }

    const childError = validateMappedFieldValue(childSchema, childValue);
    if (childError) {
      errors.push({
        section: sectionName,
        field: `${fieldPrefix}.${childKey}`,
        message: childError,
      });
    }
  }
}

/**
 * @param {import('../types.d.ts').FieldsExport} fieldsExport
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 */
export function validateMappedValues( fieldsExport: any, blocks: any, fieldSchemas: any) {
  /** @type {Array<{ section: string; field: string; message: string }>} */
  const errors = [];
  /** @type {Array<{ section: string; field: string; message: string }>} */
  const warnings = [];

  const sections = fieldsExport.sections ?? {};
  for (const [sectionName, fields] of Object.entries(sections)) {
    if (Array.isArray(fields)) continue;
    if (!fields || typeof fields !== 'object') continue;

    for (const [fieldName, value] of Object.entries(fields)) {
      const fieldId = resolveFieldIdByName(sectionName, fieldName, blocks, fieldSchemas);
      if (!fieldId) {
        warnings.push({
          section: sectionName,
          field: fieldName,
          message: `Unknown template field "${fieldName}" in section "${sectionName}".`,
        });
        continue;
      }

      const schema = fieldSchemas[fieldId];
      const error = validateMappedFieldValue(schema, value);
      if (error) {
        errors.push({ section: sectionName, field: fieldName, message: error });
      }

      if (schema?.type === 'child' && value && typeof value === 'object' && !Array.isArray(value)) {
        validateChildMappedObject(
          getRepeaterFieldSchemas(schema),
          /** @type {Record<string, unknown>} */ (value),
          sectionName,
          fieldName,
          errors,
          warnings,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Apex/Field Mapping lazy relationship stub: `{ __lazy: true }` or `[{ __lazy: true }]`.
 * @param {unknown} value
 */
function isLazyStubValue(value: any): boolean {
  if (Array.isArray(value) && value.length === 1) {
    return isLazyStubValue(value[0]);
  }
  return !!(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    /** @type {{ __lazy?: unknown }} */ (value).__lazy === true
  );
}

/**
 * True when a $payload path crosses an unexpanded lazy stub in the sample JSON.
 * Those branches are incomplete by design — skip missing-path warnings until expand.
 * @param {string} sourcePath
 * @param {unknown} payload
 */
function sourcePathUnderLazyStub(sourcePath: any, payload: any): boolean {
  const { path } = parseMappingSourcePath(sourcePath);
  const trimmed = path || String(sourcePath ?? '').trim();
  if (!trimmed || payload == null) return false;

  const stripped = trimmed.startsWith('$payload.')
    ? trimmed.slice('$payload.'.length)
    : trimmed === '$payload'
      ? ''
      : trimmed.replace(/^\$payload\.?/, '');
  if (!stripped) return isLazyStubValue(payload);

  /** @type {string[]} */
  const parts = [];
  let rest = stripped;
  while (rest.length > 0) {
    const bracket = rest.match(/^(\[[^\]]+\])/);
    if (bracket) {
      parts.push(bracket[1]);
      rest = rest.slice(bracket[1].length).replace(/^\./, '');
      continue;
    }
    const dot = rest.match(/^([^.\[]+)(?:\.|$)/);
    if (dot) {
      parts.push(dot[1]);
      rest = rest.slice(dot[1].length).replace(/^\./, '');
      continue;
    }
    break;
  }

  let current: any = payload;
  for (const part of parts) {
    if (isLazyStubValue(current)) return true;
    if (current == null || typeof current !== 'object') return false;

    if (part.startsWith('[')) {
      const indexMatch = part.match(/^\[(\d+)\]$/);
      if (!indexMatch || !Array.isArray(current)) return false;
      current = current[Number(indexMatch[1])];
      continue;
    }

    const next = resolvePathProperty(current, part);
    if (!next.ok) {
      // Missing leaf under a lazy child array → treat as incomplete sample
      if (Array.isArray(current) && isLazyStubValue(current)) return true;
      return false;
    }
    current = next.value;
  }
  return isLazyStubValue(current);
}

/**
 * Walk back a mistaken nested sourceArrayPath (…Lines__r.Item__r) to the real array path.
 * @param {string} sourceArrayPath
 * @param {unknown} payload
 */
function coerceToExistingArrayPath(sourceArrayPath: any, payload: any): string | null {
  let path = String(sourceArrayPath ?? '').trim();
  if (!path) return null;

  while (path) {
    const value = resolveSourcePath(path, payload);
    if (Array.isArray(value) || isLazyStubValue(value)) {
      return path;
    }
    if (sourcePathUnderLazyStub(path, payload)) {
      return path;
    }
    const stripped = path.replace(/^\$payload\.?/, '');
    const lastDot = stripped.lastIndexOf('.');
    if (lastDot <= 0) break;
    path = path.startsWith('$payload')
      ? `$payload.${stripped.slice(0, lastDot)}`
      : stripped.slice(0, lastDot);
  }
  return null;
}

/**
 * Warn when mapping rules point at source paths missing from the payload.
 * Skips warnings for:
 * - paths under unexpanded lazy relationship stubs (Salesforce sample JSON)
 * - nested sourceArrayPath values that are objects on a row (…Item__r) when the
 *   parent child array (…Sales_Lines__r) exists
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {unknown} payload
 */
export function validateMappingSourcePaths(rules: any, payload: any) {
  /** @type {Array<{ section: string; field: string; message: string; sourcePath?: string }>} */
  const warnings = [];
  const seen = new Set();

  for (const rule of rules ?? []) {
    /** @type {string[]} */
    const paths = [];
    const sourcePath = String(rule?.sourcePath ?? '').trim();
    const sourceArrayPath = String(rule?.sourceArrayPath ?? '').trim();

    if (sourcePath.startsWith('$')) {
      paths.push(sourcePath);
    }
    if (sourceArrayPath.startsWith('$')) {
      const coerced = coerceToExistingArrayPath(sourceArrayPath, payload);
      // Validate the real child array when nested lookup paths mis-infer Item__r as array
      paths.push(coerced && coerced !== sourceArrayPath ? coerced : sourceArrayPath);
    }

    for (const path of paths) {
      const dedupeKey = `${rule.section ?? ''}\0${rule.field ?? ''}\0${path}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (sourcePathExists(path, payload)) continue;
      if (sourcePathUnderLazyStub(path, payload)) continue;
      warnings.push({
        section: String(rule.section ?? ''),
        field: String(rule.field ?? ''),
        sourcePath: path,
        message: `Source path "${path}" does not exist in the payload.`,
      });
    }
  }

  return {
    valid: true,
    errors: [],
    warnings,
  };
}

function mergeMappingValidation(base: any, extra: any) {
  const errors = [...(base?.errors ?? []), ...(extra?.errors ?? [])];
  const warnings = [...(base?.warnings ?? []), ...(extra?.warnings ?? [])];
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 */
export function buildTargetSchemaTree( blocks: any, fieldSchemas: any) {
  const sections: Array<{
    name: string;
    fields: Array<{ name: string; type: string; fieldId: string; children?: Array<{ name: string; type: string }> }>;
  }> = [];

  for (const block of blocks ?? []) {
    if (block.type !== 'documentSection') continue;
    const sectionName = resolveSectionName(block.data ?? {});
    const fields: Array<{
      name: string;
      type: string;
      fieldId: string;
      children?: Array<{ name: string; type: string }>;
    }> = [];

    walkSegments(block.data?.segments ?? [], (seg) => {
      if ((seg.type !== 'field' && seg.type !== 'child' && seg.type !== 'table') || !seg.id) return;
      const schema = fieldSchemas[seg.id] as SoftSchema | undefined;
      if (!schema) return;

      const entry: {
        name: string;
        type: string;
        fieldId: string;
        children?: Array<{ name: string; type: string }>;
      } = {
        name: schema.name ?? schema.label ?? seg.id,
        type: schema.type,
        fieldId: seg.id,
      };

      if (schema.type === 'child') {
        entry.children = Object.entries(getRepeaterFieldSchemas(schema)).map(([key, childSchemaRaw]) => {
          const childSchema = childSchemaRaw as SoftSchema;
          return {
            name: childSchema.name ?? childSchema.label ?? key,
            type: childSchema.type,
          };
        });
      }

      if (schema.type === 'table') {
        entry.children = ((schema.columns as any[]) ?? []).map((col: any) => ({
          name: col.label ?? col.key,
          type: 'text',
        }));
      }

      fields.push(entry);
    });

    sections.push({ name: sectionName, fields });
  }

  return { sections };
}

/**
 * @param {string} fieldId
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @param {string | null} [childFieldId]
 */
export function resolveFieldMappingTarget( fieldId: any, blocks: any, fieldSchemas: any, childFieldId: any = null) {
  const placement = findFieldPlacement(fieldId, blocks);
  const section = placement.sectionName === '_root' ? placement.sectionName : placement.sectionName;
  const schema = fieldSchemas[fieldId];
  if (!schema) return null;

  if (childFieldId) {
    const childSchema = fieldSchemas[childFieldId];
    return {
      section,
      field: schema.name ?? schema.label ?? fieldId,
      childField: childSchema?.name ?? childSchema?.label ?? childFieldId,
      fieldId,
      childFieldId,
    };
  }

  return {
    section,
    field: schema.name ?? schema.label ?? fieldId,
    fieldId,
  };
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {import('../types.d.ts').FieldMappingRule} rule
 */
export function upsertMappingRule( rules: any, rule: any) {
  const next = [...(rules ?? [])];
  const ruleChildPath = rule.childFieldPath ?? rule.childField ?? '';
  const index = next.findIndex(
    (entry) =>
      entry.section === rule.section &&
      entry.field === rule.field &&
      (entry.childFieldPath ?? entry.childField ?? '') === ruleChildPath &&
      (entry.columnKey ?? '') === (rule.columnKey ?? ''),
  );
  if (index >= 0) next[index] = rule;
  else next.push(rule);
  return next;
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {import('../types.d.ts').FieldMappingRule[]} incoming
 */
export function upsertMappingRules( rules: any, incoming: any) {
  let next = [...(rules ?? [])];
  for (const rule of incoming ?? []) {
    next = upsertMappingRule(next, rule);
  }
  return next;
}

/**
 * @param {import('../types.d.ts').FieldMappingRule} rule
 * @returns {string[]}
 */
function getRuleChildPathNames( rule: any) {
  if (rule.childFieldPath) {
    return rule.childFieldPath.split('.').filter(Boolean);
  }
  if (rule.childField) return [rule.childField];
  return [];
}

/**
 * @param {Record<string, unknown>} root
 * @param {string[]} pathNames
 * @param {unknown} value
 */
function setNestedChildMappingValue( root: any, pathNames: any, value: any) {
  if (!pathNames.length) return;
  let current = root;
  for (let index = 0; index < pathNames.length - 1; index += 1) {
    const key = pathNames[index];
    const existing = current[key];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[key] = {};
    }
    current = /** @type {Record<string, unknown>} */ (current[key]);
  }
  current[pathNames[pathNames.length - 1]] = value;
}

/**
 * @param {import('../types.d.ts').RepeaterFieldSchema | import('../types.d.ts').FieldSchema} repeaterSchema
 * @param {string[]} [pathNames]
 * @param {string[]} [pathIds]
 * @returns {Array<{ pathNames: string[]; pathIds: string[] }>}
 */
export function collectRepeaterLeafFields(
  repeaterSchema: any,
  pathNames: string[] = [],
  pathIds: string[] = [],
): Array<{ pathNames: string[]; pathIds: string[] }> {
  const leaves: Array<{ pathNames: string[]; pathIds: string[] }> = [];

  for (const [childId, childSchemaRaw] of Object.entries(getRepeaterFieldSchemas(repeaterSchema))) {
    const childSchema = childSchemaRaw as SoftSchema;
    const name = childSchema.name ?? childSchema.label ?? childId;
    const nextNames = [...pathNames, name];
    const nextIds = [...pathIds, childId];

    if (childSchema.type === 'child') {
      leaves.push(...collectRepeaterLeafFields(childSchema, nextNames, nextIds));
      continue;
    }

    if (childSchema.type === 'computed') continue;
    leaves.push({ pathNames: nextNames, pathIds: nextIds });
  }

  return leaves;
}

/**
 * @param {string} parentFieldId
 * @param {string[]} childFieldIds
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @returns {string[] | null}
 */
function resolveChildPathNamesFromIds( parentFieldId: any, childFieldIds: any, fieldSchemas: any) {
  const parentSchema = fieldSchemas[parentFieldId];
  if (!parentSchema || parentSchema.type !== 'child' || !childFieldIds.length) return null;

  /** @type {string[]} */
  const pathNames = [];
  let currentSchema = parentSchema;

  for (const childId of childFieldIds) {
    const childSchema = getRepeaterFieldSchemas(currentSchema)[childId];
    if (!childSchema) return null;
    pathNames.push(childSchema.name ?? childSchema.label ?? childId);
    currentSchema = childSchema;
  }

  return pathNames;
}

/**
 * Strip array index from a dragged source path and derive the table array base path.
 * @param {string} sourcePath
 * @returns {{ sourcePath: string; sourceArrayPath: string }}
 */
export function normalizeTableColumnSourcePath( sourcePath: any) {
  const { path, dateFormat } = parseMappingSourcePath(sourcePath);
  const raw = path || String(sourcePath ?? '').trim();
  const indexMatch = raw.match(/^(.*)\[\d+\](.*)$/);
  let normalizedPath: string;
  let sourceArrayPath: string;
  if (indexMatch) {
    normalizedPath = `${indexMatch[1]}${indexMatch[2]}`;
    sourceArrayPath = indexMatch[1];
  } else {
    const lastDot = raw.lastIndexOf('.');
    sourceArrayPath = lastDot > 0 ? raw.slice(0, lastDot) : raw;
    normalizedPath = raw;
  }
  return {
    sourcePath: dateFormat ? `${normalizedPath}#${dateFormat}` : normalizedPath,
    sourceArrayPath,
  };
}

/**
 * @param {string} sourcePath
 * @param {string} sourceArrayPath
 */
function getColumnPropertyFromPaths( sourcePath: any, sourceArrayPath: any) {
  const { path } = parseMappingSourcePath(sourcePath);
  const cleanPath = path || String(sourcePath ?? '');
  if (sourceArrayPath && cleanPath.startsWith(sourceArrayPath)) {
    const suffix = cleanPath.slice(sourceArrayPath.length);
    if (suffix.startsWith('.')) return suffix.slice(1);
    const bracket = suffix.match(/^\[["'](.+)["']\]$/);
    if (bracket) return bracket[1];
  }

  const stripped = cleanPath.replace(/^\$payload\.?/, '');
  const segments = stripped.split('.');
  const last = segments[segments.length - 1] ?? '';
  return last.replace(/\[\d+\]$/, '').replace(/^\[["']|["']\]$/g, '');
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} tableRules
 * @param {unknown} payload
 * @returns {Array<Record<string, unknown>>}
 */
function resolveTableRowsFromRules( tableRules: any, payload: any) {
  if (!tableRules.length) return [];

  let sourceArrayPath =
    tableRules.find((rule: any) => rule.sourceArrayPath)?.sourceArrayPath ??
    inferSourceArrayPathFromColumnRules(tableRules);

  let sourceRows = resolveSourcePath(sourceArrayPath, payload);
  // Nested column paths (Lines__r.Item__r.Name) may infer Item__r as the array —
  // walk back until a real array is found on the payload.
  while (!Array.isArray(sourceRows) && typeof sourceArrayPath === 'string' && sourceArrayPath.includes('.')) {
    const stripped = String(sourceArrayPath).replace(/^\$payload\.?/, '');
    const lastDot = stripped.lastIndexOf('.');
    if (lastDot <= 0) break;
    sourceArrayPath = String(sourceArrayPath).startsWith('$payload')
      ? `$payload.${stripped.slice(0, lastDot)}`
      : stripped.slice(0, lastDot);
    sourceRows = resolveSourcePath(sourceArrayPath, payload);
  }
  if (!Array.isArray(sourceRows)) return [];

  return sourceRows.map((sourceRow: any) => {
    if (sourceRow == null || typeof sourceRow !== 'object' || Array.isArray(sourceRow)) {
      return {};
    }

    const targetRow: Record<string, unknown> = {};
    const rowObject = sourceRow as Record<string, unknown>;

    for (const rule of tableRules) {
      if (!rule.columnKey) continue;
      const arrayPath = sourceArrayPath;
      const { path, dateFormat } = parseMappingSourcePath(rule.sourcePath);
      const prop = getColumnPropertyFromPaths(path || rule.sourcePath, arrayPath);
      let value =
        prop && prop.includes('.')
          ? getPayloadByPath(prop, rowObject)
          : rowObject[prop];
      if (dateFormat && looksLikeMappingFormatSuffix(dateFormat)) {
        value = applyMappingFormatSuffix(value, dateFormat);
      }
      targetRow[rule.columnKey] = value;
    }

    return targetRow;
  });
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} tableRules
 */
function inferSourceArrayPathFromColumnRules( tableRules: any) {
  const firstPath = tableRules.find((rule: any) => rule.sourcePath)?.sourcePath ?? '';
  return normalizeTableColumnSourcePath(firstPath).sourceArrayPath;
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {boolean} [resolved=false]
 * @param {unknown} [payload=null]
 */
function buildSectionsFromRules( rules: any, resolved: any = false, payload: any = null) {
  const sections: Record<string, Record<string, unknown>> = {};

  const tableRuleGroups = new Map<string, FieldMappingRule[]>();

  for (const rule of rules ?? []) {
    if (!rule?.section || !rule?.field || !rule?.sourcePath) continue;

    if (rule.columnKey) {
      const groupKey = `${rule.section}\0${rule.field}`;
      if (!tableRuleGroups.has(groupKey)) tableRuleGroups.set(groupKey, []);
      tableRuleGroups.get(groupKey)?.push(rule);
      continue;
    }

    if (!sections[rule.section]) sections[rule.section] = {};
    const value = resolved ? resolveMappedSourceValue(rule.sourcePath, payload) : rule.sourcePath;
    const childPathNames = getRuleChildPathNames(rule);
    if (childPathNames.length) {
      const current = sections[rule.section][rule.field];
      const childMap =
        current && typeof current === 'object' && !Array.isArray(current)
          ? JSON.parse(JSON.stringify(current))
          : {};
      setNestedChildMappingValue(childMap, childPathNames, value);
      sections[rule.section][rule.field] = childMap;
    } else {
      sections[rule.section][rule.field] = value;
    }
  }

  for (const [groupKey, tableRules] of tableRuleGroups) {
    const [section, field] = groupKey.split('\0');
    if (!sections[section]) sections[section] = {};

    if (resolved) {
      sections[section][field] = resolveTableRowsFromRules(tableRules, payload);
      continue;
    }

    const templateRow: Record<string, unknown> = {};
    for (const rule of tableRules) {
      if (rule.columnKey) templateRow[rule.columnKey] = rule.sourcePath;
    }
    sections[section][field] = [templateRow];
  }

  return sections;
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 */
export function buildMappingResultFromRules( rules: any) {
  return {
    kind: 'field',
    version: IO_VERSION,
    sections: buildSectionsFromRules(rules, false),
  };
}

/**
 * @param {string} value
 */
function isMappingExpressionValue( value: any) {
  return typeof value === 'string' && value.startsWith('$');
}

/**
 * @param {string} parentFieldId
 * @param {string[]} pathNames
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @returns {string | null}
 */
function resolveChildFieldIdByPath( parentFieldId: any, pathNames: any, fieldSchemas: any) {
  let currentSchema = fieldSchemas[parentFieldId] as SoftSchema | undefined;
  if (!currentSchema || currentSchema.type !== 'child') return null;

  let currentId: string | null = null;
  for (const segment of pathNames) {
    currentId = null;
    for (const [childFieldId, childSchemaRaw] of Object.entries(getRepeaterFieldSchemas(currentSchema))) {
      const childSchema = childSchemaRaw as SoftSchema;
      const name = childSchema.name ?? childSchema.label ?? childFieldId;
      if (name === segment) {
        currentId = childFieldId;
        currentSchema = childSchema;
        break;
      }
    }
    if (!currentId) return null;
  }

  return currentId;
}

/**
 * @param {string} sectionName
 * @param {string} fieldName
 * @param {string | null} fieldId
 * @param {Record<string, unknown>} childMap
 * @param {string[]} pathPrefix
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 */
function parseChildMappingObject( sectionName: any, fieldName: any, fieldId: any, childMap: any, pathPrefix: any, blocks: any, fieldSchemas: any, rules: any,) {
  for (const [childName, childValue] of Object.entries(childMap)) {
    const pathNames = [...pathPrefix, childName];

    if (isMappingExpressionValue(childValue)) {
      const childFieldId = fieldId ? resolveChildFieldIdByPath(fieldId, pathNames, fieldSchemas) : null;
      rules.push({
        section: sectionName,
        field: fieldName,
        childField: childName,
        childFieldPath: pathNames.join('.'),
        sourcePath: childValue,
        fieldId: fieldId ?? undefined,
        childFieldId: childFieldId ?? undefined,
      });
      continue;
    }

    if (childValue && typeof childValue === 'object' && !Array.isArray(childValue)) {
      parseChildMappingObject(
        sectionName,
        fieldName,
        fieldId,
        /** @type {Record<string, unknown>} */ (childValue),
        pathNames,
        blocks,
        fieldSchemas,
        rules,
      );
    }
  }
}

/**
 * Flatten source payload tree nodes into path strings for autocomplete.
 * @param {unknown} payload
 * @returns {string[]}
 */
export function flattenSourcePayloadPaths( payload: any) {
  const paths: string[] = [];

  function walk(nodes: SourceTreeNode[] | null | undefined) {
    for (const node of nodes ?? []) {
      if (node?.path) paths.push(node.path);
      if (Array.isArray(node?.children)) walk(node.children);
    }
  }

  walk(buildSourcePayloadTree(payload));
  return paths;
}

/**
 * @param {string} token
 * @returns {{ basePath: string; segmentPrefix: string; segmentStartInToken: number } | null}
 */
export function parsePathTokenContext( token: any) {
  const text = String(token ?? '').trim();
  if (!text.startsWith('$')) return null;

  if (text === '$payload') {
    return { basePath: '$payload', segmentPrefix: '', segmentStartInToken: text.length };
  }

  const lastDot = text.lastIndexOf('.');
  if (lastDot < 0) {
    const root = '$payload';
    if (!text.startsWith(root)) return null;
    const segmentPrefix = text.slice(root.length);
    return { basePath: root, segmentPrefix, segmentStartInToken: root.length };
  }

  const basePath = text.slice(0, lastDot);
  const segmentPrefix = text.slice(lastDot + 1);
  return { basePath, segmentPrefix, segmentStartInToken: lastDot + 1 };
}

/**
 * @param {ReturnType<typeof buildSourcePayloadTree>} nodes
 * @param {string} targetPath
 * @returns {ReturnType<typeof buildSourcePayloadTree> | null}
 */
function findSourceTreeNode( nodes: any, targetPath: any): SourceTreeNode[] | null {
  const normalized = targetPath.replace(/\.$/, '');
  for (const node of nodes ?? []) {
    if (node.path === normalized || node.path === targetPath) {
      return node.children ?? [];
    }
    if (Array.isArray(node.children)) {
      const found: SourceTreeNode[] | null = findSourceTreeNode(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Column fields for table-style arrays (index-free paths).
 * @param {string} lookupPath
 * @param {unknown[]} rows
 * @returns {Array<{ key: string; path: string; type: string; children?: ReturnType<typeof buildSourcePayloadTree> }> | null}
 */
function buildArrayColumnFields( lookupPath: any, rows: any): SourceTreeNode[] | null {
  if (!isObjectRowArray(rows)) return null;

  const first = rows[0];
  return Object.entries(first).map(([key, value]) => {
    const path = /^[a-zA-Z_$][\w$]*$/.test(key)
      ? `${lookupPath}.${key}`
      : `${lookupPath}[${JSON.stringify(key)}]`;
    const type = describePayloadType(value);
    return {
      key,
      path,
      type,
      children:
        value != null && typeof value === 'object' && !Array.isArray(value)
          ? buildSourcePayloadTree(value, path)
          : undefined,
    };
  });
}

/**
 * @param {ReturnType<typeof buildSourcePayloadTree>} children
 * @returns {boolean}
 */
function isArrayIndexChildren( children: any) {
  return Boolean(children?.length) &&
    children.every((node: any) => /^\[\d+\]$/.test(node.key));
}

/**
 * Fields at the current path level (n8n-style FIELDS list).
 * @param {unknown} payload
 * @param {string} pathToken
 * @returns {Array<{ key: string; path: string; type: string }>}
 */
export function getSourceFieldsAtPath( payload: any, pathToken: any) {
  const context = parsePathTokenContext(pathToken);
  if (!context) return [];

  const tree = buildSourcePayloadTree(payload);
  const lookupPath = context.basePath === '$payload' && !context.segmentPrefix
    ? '$payload'
    : context.basePath;

  const resolved = resolveSourcePath(lookupPath, payload);
  const columnFields = Array.isArray(resolved)
    ? buildArrayColumnFields(lookupPath, resolved)
    : null;

  let children = findSourceTreeNode(tree, lookupPath);

  if (columnFields?.length && (!children?.length || isArrayIndexChildren(children))) {
    return columnFields;
  }

  if (!children) {
    if (columnFields?.length) {
      return columnFields;
    }
    if (isPlainObject(resolved)) {
      children = buildSourcePayloadTree(resolved, lookupPath);
    } else if (Array.isArray(resolved) && resolved.length > 0) {
      const first = resolved[0];
      if (isPlainObject(first)) {
        children = buildSourcePayloadTree(first, `${lookupPath}[0]`);
      }
    }
  }

  if (!children?.length && lookupPath === '$payload') {
    children = tree;
  }

  return (children ?? []).map((node: any) => ({
    key: node.key,
    path: node.path,
    type: node.type,
  }));
}

/**
 * @param {unknown} mappingResult
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @returns {import('../types.d.ts').FieldMappingRule[]}
 */
export function parseMappingResultToRules( mappingResult: any, blocks: any, fieldSchemas: any) {
  const sections =
    mappingResult &&
    typeof mappingResult === 'object' &&
    !Array.isArray(mappingResult) &&
    /** @type {{ sections?: unknown }} */ (mappingResult).sections &&
    typeof /** @type {{ sections?: unknown }} */ (mappingResult).sections === 'object' &&
    !Array.isArray(/** @type {{ sections: unknown }} */ (mappingResult).sections)
      ? /** @type {Record<string, Record<string, unknown>>} */ (
          /** @type {{ sections: Record<string, Record<string, unknown>> }} */ (mappingResult).sections
        )
      : null;

  if (!sections) return [];

  /** @type {import('../types.d.ts').FieldMappingRule[]} */
  const rules = [];

  for (const [sectionName, fields] of Object.entries(sections)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;

    for (const [fieldName, value] of Object.entries(fields)) {
      const fieldId = resolveFieldIdByName(sectionName, fieldName, blocks, fieldSchemas);

      if (isMappingExpressionValue(value)) {
        rules.push({
          section: sectionName,
          field: fieldName,
          sourcePath: value,
          fieldId: fieldId ?? undefined,
        });
        continue;
      }

      if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object') {
        const schema = fieldId ? fieldSchemas[fieldId] : null;
        const templateRow = /** @type {Record<string, unknown>} */ (value[0]);
        const hasColumnMappings = Object.values(templateRow).some(isMappingExpressionValue);
        if (schema?.type === 'table' && hasColumnMappings) {
          for (const [columnKey, columnValue] of Object.entries(templateRow)) {
            if (!isMappingExpressionValue(columnValue)) continue;
            const normalized = normalizeTableColumnSourcePath(String(columnValue));
            rules.push({
              section: sectionName,
              field: fieldName,
              fieldId: fieldId ?? undefined,
              columnKey,
              sourcePath: normalized.sourcePath,
              sourceArrayPath: normalized.sourceArrayPath,
            });
          }
          continue;
        }
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parseChildMappingObject(
          sectionName,
          fieldName,
          fieldId,
          /** @type {Record<string, unknown>} */ (value),
          [],
          blocks,
          fieldSchemas,
          rules,
        );
      }
    }
  }

  return rules;
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {unknown} payload
 * @param {{ blocks: import('../types.d.ts').EditorBlock[]; fieldSchemas: Record<string, import('../types.d.ts').FieldSchema> }} template
 */
export function resolveRulesToFieldsExport( rules: any, payload: any, _template: any) {
  const sections = buildSectionsFromRules(rules, true, payload);
  return {
    kind: 'field',
    version: IO_VERSION,
    time: Date.now(),
    sections,
  };
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @param {string} fieldId
 * @param {string | null} [childFieldId]
 */
export function createMappingRuleFromDrop( fieldId: any, sourcePath: any, blocks: any, fieldSchemas: any, childFieldId: any = null) {
  const rules = createMappingRulesFromDrop(fieldId, sourcePath, blocks, fieldSchemas, {
    childFieldIds: childFieldId ? [childFieldId] : [],
  });
  return rules[0] ?? null;
}

/**
 * @param {string} fieldId
 * @param {string} sourcePath
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @param {{ childFieldIds?: string[]; bulkChild?: boolean }} [options]
 * @returns {import('../types.d.ts').FieldMappingRule[]}
 */
export function createMappingRulesFromDrop( fieldId: any, sourcePath: any, blocks: any, fieldSchemas: any, options: any = {}) {
  const { childFieldIds = [], bulkChild = false } = options;

  const cellRef = parseCellFieldId(fieldId, fieldSchemas);
  if (cellRef) {
    const tableSchema = fieldSchemas[cellRef.tableFieldId];
    if (!tableSchema || tableSchema.type !== 'table') return [];

    const target = resolveFieldMappingTarget(cellRef.tableFieldId, blocks, fieldSchemas);
    if (!target) return [];

    const normalized = normalizeTableColumnSourcePath(sourcePath);
    return [
      {
        section: target.section,
        field: target.field,
        fieldId: cellRef.tableFieldId,
        columnKey: cellRef.colKey,
        sourcePath: normalized.sourcePath,
        sourceArrayPath: normalized.sourceArrayPath,
      },
    ];
  }

  const parentSchema = fieldSchemas[fieldId];
  if (bulkChild && parentSchema?.type === 'child') {
    const target = resolveFieldMappingTarget(fieldId, blocks, fieldSchemas);
    if (!target) return [];

    return collectRepeaterLeafFields(parentSchema).map((leaf: { pathNames: string[]; pathIds: string[] }) => ({
      section: target.section,
      field: target.field,
      fieldId,
      childFieldPath: leaf.pathNames.join('.'),
      childField: leaf.pathNames[leaf.pathNames.length - 1],
      childFieldId: leaf.pathIds[leaf.pathIds.length - 1],
      sourcePath,
    }));
  }

  if (childFieldIds.length) {
    const target = resolveFieldMappingTarget(fieldId, blocks, fieldSchemas);
    if (!target) return [];

    const pathNames = resolveChildPathNamesFromIds(fieldId, childFieldIds, fieldSchemas);
    if (!pathNames?.length) return [];

    const leafId = childFieldIds[childFieldIds.length - 1];
    const leafSchema = fieldSchemas[leafId];
    if (leafSchema?.type === 'computed') return [];

    return [
      {
        section: target.section,
        field: target.field,
        fieldId,
        childFieldPath: pathNames.join('.'),
        childField: pathNames[pathNames.length - 1],
        childFieldId: leafId,
        sourcePath,
      },
    ];
  }

  const target = resolveFieldMappingTarget(fieldId, blocks, fieldSchemas);
  if (!target) return [];
  const schema = fieldSchemas[fieldId];
  if (schema?.type === 'computed') return [];

  return [
    {
      section: target.section,
      field: target.field,
      sourcePath,
      fieldId: target.fieldId,
    },
  ];
}

/**
 * @param {import('../types.d.ts').FieldMappingSpec} mappingSpec
 * @param {unknown} payload
 * @param {{ blocks: import('../types.d.ts').EditorBlock[]; fieldSchemas: Record<string, import('../types.d.ts').FieldSchema> }} template
 */
function resolveMappingSpecToFieldsExport( mappingSpec: any, payload: any, template: any) {
  const blocks = template.blocks ?? [];
  const fieldSchemas = template.fieldSchemas ?? {};

  if (Array.isArray(mappingSpec.rules) && mappingSpec.rules.length > 0) {
    return resolveRulesToFieldsExport(mappingSpec.rules, payload, template);
  }

  if (mappingSpec.expression?.trim()) {
    const raw = evaluateFieldMappingExpression(mappingSpec.expression, payload, template);
    return normalizeMappingResult(raw, blocks, fieldSchemas);
  }

  throw new Error('Field mapping has no rules or expression.');
}

/**
 * @param {unknown} payload
 * @param {import('../types.d.ts').FieldMappingSpec} mappingSpec
 * @param {{ blocks: import('../types.d.ts').EditorBlock[]; fieldSchemas: Record<string, import('../types.d.ts').FieldSchema> }} template
 */
export function applyFieldMapping( payload: any, mappingSpec: any, template: any) {
  if (!isFieldMappingSpec(mappingSpec)) {
    throw new Error('Invalid field mapping spec.');
  }

  const blocks = template.blocks ?? [];
  const fieldSchemas = template.fieldSchemas ?? {};

  const fieldsExport = resolveMappingSpecToFieldsExport(mappingSpec, payload, template);
  const validation = mergeMappingValidation(
    validateMappedValues(fieldsExport, blocks, fieldSchemas),
    validateMappingSourcePaths(mappingSpec.rules ?? [], payload),
  );

  if (!validation.valid) {
    const message = validation.errors.map((e) => e.message).join(' ');
    throw new Error(message || 'Field mapping validation failed.');
  }

  const values = normalizeDocumentValues(fieldsExport, blocks, fieldSchemas);
  const merged = applyDocumentValues(blocks, values, fieldSchemas);

  return {
    fieldsExport,
    validation,
    mappingResult: Array.isArray(mappingSpec.rules) ? buildMappingResultFromRules(mappingSpec.rules) : null,
    ...merged,
  };
}

/**
 * Preview mapping without applying to blocks.
 * @param {unknown} payload
 * @param {import('../types.d.ts').FieldMappingSpec} mappingSpec
 * @param {{ blocks: import('../types.d.ts').EditorBlock[]; fieldSchemas: Record<string, import('../types.d.ts').FieldSchema> }} template
 */
export function previewFieldMapping( payload: any, mappingSpec: any, template: any) {
  if (!isFieldMappingSpec(mappingSpec)) {
    throw new Error('Invalid field mapping spec.');
  }

  const blocks = template.blocks ?? [];
  const fieldSchemas = template.fieldSchemas ?? {};
  const fieldsExport = resolveMappingSpecToFieldsExport(mappingSpec, payload, template);
  const validation = mergeMappingValidation(
    validateMappedValues(fieldsExport, blocks, fieldSchemas),
    validateMappingSourcePaths(mappingSpec.rules ?? [], payload),
  );
  const mappingResult = Array.isArray(mappingSpec.rules)
    ? buildMappingResultFromRules(mappingSpec.rules)
    : null;

  return { fieldsExport, validation, mappingResult, raw: mappingResult ?? fieldsExport };
}

/**
 * @param {import('../types.d.ts').FieldMappingSpec | null | undefined} spec
 * @returns {import('../types.d.ts').FieldMappingSpec}
 */
export function normalizeFieldMappingSpec( spec: any) {
  if (!spec || typeof spec !== 'object') {
    return {
      kind: FIELD_MAPPING_KIND,
      version: FIELD_MAPPING_VERSION,
      expression: '',
      rules: [],
    };
  }

  return {
    kind: FIELD_MAPPING_KIND,
    version: FIELD_MAPPING_VERSION,
    expression: String(spec.expression ?? ''),
    sourceSample: spec.sourceSample,
    rules: Array.isArray(spec.rules) ? spec.rules.map((rule: any) => ({ ...rule })) : [],
  };
}

/**
 * Build a set of `section\0field` keys targeted by any mapping rule.
 * Child / column / table rules mark the whole parent field as mapped.
 */
export function collectMappedSectionFieldKeys(mappingSpec: any): Set<string> {
  const keys = new Set<string>();
  const rules = Array.isArray(mappingSpec?.rules) ? mappingSpec.rules : [];
  for (const rule of rules) {
    const section = rule?.section;
    const field = rule?.field;
    if (typeof section !== 'string' || !section.trim()) continue;
    if (typeof field !== 'string' || !field.trim()) continue;
    keys.add(`${section}\0${field}`);
  }
  return keys;
}

function omitMappedFromFieldMap(
  fieldMap: Record<string, unknown> | null | undefined,
  sectionName: string,
  mappedKeys: Set<string>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [fieldName, value] of Object.entries(fieldMap ?? {})) {
    if (mappedKeys.has(`${sectionName}\0${fieldName}`)) continue;
    next[fieldName] = value;
  }
  return next;
}

/**
 * Drop fields that have any mapping rule from a fields export.
 * Used for scenario value packs (manual / unmapped fields only).
 * Returns a deep clone; does not mutate the input.
 */
export function omitMappedFields(fieldsExport: any, mappingSpec: any) {
  if (!fieldsExport || typeof fieldsExport !== 'object') {
    return fieldsExport;
  }

  const mappedKeys = collectMappedSectionFieldKeys(mappingSpec);
  const clone = JSON.parse(JSON.stringify(fieldsExport));
  if (mappedKeys.size === 0) {
    return clone;
  }

  const sections = clone.sections;
  if (!sections || typeof sections !== 'object') {
    return clone;
  }

  const nextSections: Record<string, unknown> = {};
  for (const [sectionName, sectionValue] of Object.entries(sections)) {
    // Repeatable sections: array of per-instance field maps.
    if (
      Array.isArray(sectionValue) &&
      sectionValue.length > 0 &&
      sectionValue.every(
        (item) => item != null && typeof item === 'object' && !Array.isArray(item),
      )
    ) {
      const filteredInstances = sectionValue
        .map((instance) =>
          omitMappedFromFieldMap(instance as Record<string, unknown>, sectionName, mappedKeys),
        )
        .filter((instance) => Object.keys(instance).length > 0);
      if (filteredInstances.length > 0) {
        nextSections[sectionName] = filteredInstances;
      }
      continue;
    }
    if (sectionValue != null && typeof sectionValue === 'object' && !Array.isArray(sectionValue)) {
      const filtered = omitMappedFromFieldMap(
        sectionValue as Record<string, unknown>,
        sectionName,
        mappedKeys,
      );
      if (Object.keys(filtered).length > 0) {
        nextSections[sectionName] = filtered;
      }
      continue;
    }
    nextSections[sectionName] = sectionValue;
  }

  clone.sections = nextSections;
  return clone;
}
