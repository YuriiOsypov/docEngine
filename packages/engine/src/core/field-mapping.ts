import { IO_VERSION } from './document-io.js';
import { resolveSectionName, findFieldPlacement } from './field-id.js';
import { resolveFieldIdByName } from './field-id.js';
import { walkSegments } from './segment-tree.js';
import { getRepeaterFieldSchemas } from './repeater-io.js';
import { isTableRowArray, projectTableRowsOntoColumns } from './field-io/table-field-io.js';
import { normalizeDocumentValues, applyDocumentValues } from './document-io.js';
import { parseCellFieldId, labelToFieldKey } from './field-schemas.js';
import { parseMappingSourcePath } from './date-format.js';
import { applyMappingFormatSuffix, looksLikeMappingFormatSuffix } from './mapping-format.js';
import { pivotExpand, isPivotTableValue } from './pivot.js';
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

/** Reserved section-map key / rule field for array-sourced (repeatable) sections. */
export const SECTION_SOURCE_KEY = '_source';

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
    // Allow `Table[0]` (identifier immediately followed by subscript).
    const ident = rest.match(/^([^.\[]+)/);
    if (ident) {
      parts.push(ident[1]);
      rest = rest.slice(ident[1].length).replace(/^\./, '');
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
        const next = resolvePathProperty(current, keyMatch[1]);
        if (!next.ok) return undefined;
        current = next.value;
      } else if (indexMatch) {
        current = /** @type {unknown[]} */ (current)[Number(indexMatch[1])];
      } else {
        return undefined;
      }
      continue;
    }
    // Use own-property / row-column lookup — never Array.prototype.values/keys/…
    const next = resolvePathProperty(current, part);
    if (!next.ok) return undefined;
    current = next.value;
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
    // Allow `Table[0]` (identifier immediately followed by subscript).
    const ident = rest.match(/^([^.\[]+)/);
    if (ident) {
      parts.push(ident[1]);
      rest = rest.slice(ident[1].length).replace(/^\./, '');
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
  // Always walk with getPayloadByPath / resolvePathProperty. Evaluating the path
  // via `new Function` returns Array.prototype methods for keys like `values`
  // (`arr.values` is the iterator), which breaks nested `$values.amount` drops.
  if (path.startsWith('$payload')) {
    const stripped = path.replace(/^\$payload\.?/, '');
    return stripped ? getPayloadByPath(stripped, payload) : payload;
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
    case 'pivotTable':
      if (value == null) return null;
      if (!isPivotTableValue(value) && !Array.isArray(value)) {
        return `Field "${schema.name ?? schema.label}" expects a pivot table value or source row array.`;
      }
      return null;
    case 'barcode':
      if (value == null || value === '') return null;
      if (typeof value !== 'string' && typeof value !== 'number') {
        return `Field "${schema.name ?? schema.label}" expects a string barcode value.`;
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
    /** @type {Array<Record<string, unknown>>} */
    const fieldMaps = [];
    if (
      Array.isArray(fields) &&
      fields.every((item) => item != null && typeof item === 'object' && !Array.isArray(item))
    ) {
      for (const item of fields) fieldMaps.push(/** @type {Record<string, unknown>} */ (item));
    } else if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      fieldMaps.push(/** @type {Record<string, unknown>} */ (fields));
    } else {
      continue;
    }

    for (const fieldMap of fieldMaps) {
      for (const [fieldName, value] of Object.entries(fieldMap)) {
        if (fieldName === SECTION_SOURCE_KEY) continue;
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

  const sourcedSections = new Set(
    (rules ?? [])
      .filter(isSectionSourceRule)
      .map((rule: any) => String(rule.section ?? ''))
      .filter(Boolean),
  );

  for (const rule of rules ?? []) {
    /** @type {string[]} */
    const paths = [];
    const sourcePath = String(rule?.sourcePath ?? '').trim();
    const sourceArrayPath = String(rule?.sourceArrayPath ?? '').trim();
    const sectionSource = isSectionSourceRule(rule);
    const sectionIsSourced = sourcedSections.has(String(rule?.section ?? ''));

    // Relative field paths under a sourced section resolve against each array item — skip root checks.
    if (
      !sectionSource &&
      sectionIsSourced &&
      sourcePath &&
      !isAbsoluteMappingPath(sourcePath) &&
      !sourceArrayPath
    ) {
      continue;
    }

    if (sourcePath.startsWith('$') && (sectionSource || isAbsoluteMappingPath(sourcePath) || !sectionIsSourced)) {
      paths.push(sourcePath);
    }
    if (sourceArrayPath.startsWith('$')) {
      const coerced = coerceToExistingArrayPath(sourceArrayPath, payload);
      // Validate the real child array when nested lookup paths mis-infer Item__r as array
      const checkPath = coerced && coerced !== sourceArrayPath ? coerced : sourceArrayPath;
      if (!paths.includes(checkPath)) paths.push(checkPath);
    }

    for (const path of paths) {
      const dedupeKey = `${rule.section ?? ''}\0${rule.field ?? ''}\0${path}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (sourcePathUnderLazyStub(path, payload)) continue;
      if (!sourcePathExists(path, payload)) {
        warnings.push({
          section: String(rule.section ?? ''),
          field: String(rule.field ?? ''),
          sourcePath: path,
          message: `Source path "${path}" does not exist in the payload.`,
        });
        continue;
      }
      if (sectionSource) {
        const value = resolveSourcePath(path, payload);
        if (!Array.isArray(value)) {
          warnings.push({
            section: String(rule.section ?? ''),
            field: SECTION_SOURCE_KEY,
            sourcePath: path,
            message: `Section source "${path}" is not an array in the payload.`,
          });
        }
      }
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
    const childPath = findRepeaterChildPathById(schema, childFieldId);
    const childSchema =
      (childPath && resolveChildSchemaByPath(schema, childPath.pathIds)) ||
      fieldSchemas[childFieldId];
    const childField =
      childPath?.pathNames?.[childPath.pathNames.length - 1] ??
      childSchema?.name ??
      childSchema?.label ??
      childFieldId;
    return {
      section,
      field: schema.name ?? schema.label ?? fieldId,
      childField,
      childFieldPath: childPath?.pathNames?.join('.') || undefined,
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
 * Walk a repeater schema tree to locate a child field id.
 * @param {import('../types.d.ts').FieldSchema | undefined} repeaterSchema
 * @param {string} targetChildId
 * @param {string[]} [pathNames]
 * @param {string[]} [pathIds]
 * @returns {{ pathNames: string[]; pathIds: string[] } | null}
 */
function findRepeaterChildPathById(
  repeaterSchema: any,
  targetChildId: any,
  pathNames: string[] = [],
  pathIds: string[] = [],
): { pathNames: string[]; pathIds: string[] } | null {
  if (!repeaterSchema || !targetChildId) return null;

  for (const [childId, childSchemaRaw] of Object.entries(getRepeaterFieldSchemas(repeaterSchema))) {
    const childSchema = childSchemaRaw as SoftSchema;
    const nextNames = [...pathNames, childSchema.name ?? childSchema.label ?? childId];
    const nextIds = [...pathIds, childId];
    if (childId === targetChildId) {
      return { pathNames: nextNames, pathIds: nextIds };
    }
    if (childSchema.type === 'child') {
      const found = findRepeaterChildPathById(childSchema, targetChildId, nextNames, nextIds);
      if (found) return found;
    }
  }
  return null;
}

/**
 * @param {import('../types.d.ts').FieldSchema | undefined} repeaterSchema
 * @param {string[]} pathIds
 */
function resolveChildSchemaByPath(repeaterSchema: any, pathIds: any) {
  let current = repeaterSchema as SoftSchema | undefined;
  let leaf: SoftSchema | undefined;
  for (const childId of pathIds ?? []) {
    if (!current || current.type !== 'child') return null;
    leaf = getRepeaterFieldSchemas(current)[childId] as SoftSchema | undefined;
    if (!leaf) return null;
    current = leaf;
  }
  return leaf ?? null;
}

/**
 * Remap a field/child id through an old→new rename map (supports short chains).
 * @param {string | undefined} id
 * @param {Record<string, string> | Map<string, string> | null | undefined} fieldIdRenames
 */
function remapFieldId(id: any, fieldIdRenames: any) {
  if (!id || !fieldIdRenames) return id;
  let current = String(id);
  for (let i = 0; i < 8; i += 1) {
    const next =
      fieldIdRenames instanceof Map ? fieldIdRenames.get(current) : fieldIdRenames[current];
    if (!next || next === current) break;
    current = String(next);
  }
  return current;
}

/**
 * Rewrite mapping rule section/field/child names (and fieldIds) to match the
 * current template after a section or field rename.
 *
 * Prefers `rule.fieldId` / `rule.childFieldId`. Optional `fieldIdRenames` covers
 * cases where ids were rebuilt (section rename / field name → new id).
 *
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @param {{ fieldIdRenames?: Record<string, string> | Map<string, string> }} [options]
 * @returns {import('../types.d.ts').FieldMappingRule[]}
 */
export function syncMappingRulesToSchema(rules: any, blocks: any, fieldSchemas: any, options: any = {}) {
  const fieldIdRenames = options?.fieldIdRenames;
  if (!Array.isArray(rules) || !rules.length) return Array.isArray(rules) ? [] : [];

  return rules.map((rule: any) => {
    if (!rule || typeof rule !== 'object') return rule;
    if (isSectionSourceRule(rule)) {
      const path = String(rule.sourceArrayPath || rule.sourcePath || '').trim();
      return createSectionSourceRule(rule.section, path);
    }

    const fieldId = remapFieldId(rule.fieldId, fieldIdRenames);
    const childFieldId = remapFieldId(rule.childFieldId, fieldIdRenames);
    const schema = fieldId ? fieldSchemas?.[fieldId] : null;

    if (!fieldId || !schema) {
      if (fieldId === rule.fieldId && childFieldId === rule.childFieldId) return rule;
      const patched = { ...rule, fieldId: fieldId || rule.fieldId };
      if (childFieldId) patched.childFieldId = childFieldId;
      else if ('childFieldId' in patched && !childFieldId) delete patched.childFieldId;
      return patched;
    }

    const target = resolveFieldMappingTarget(
      fieldId,
      blocks,
      fieldSchemas,
      childFieldId || null,
    );
    if (!target) {
      const patched = { ...rule, fieldId };
      if (childFieldId) patched.childFieldId = childFieldId;
      return patched;
    }

    const next = {
      ...rule,
      section: target.section,
      field: target.field,
      fieldId: target.fieldId,
    };

    if (childFieldId || rule.childField || rule.childFieldPath) {
      if (target.childFieldId || childFieldId) {
        next.childFieldId = target.childFieldId ?? childFieldId;
      }
      if (target.childField) {
        next.childField = target.childField;
      }
      if (target.childFieldPath) {
        next.childFieldPath = target.childFieldPath;
      } else if (target.childField && rule.childFieldPath) {
        const parts = String(rule.childFieldPath).split('.').filter(Boolean);
        if (parts.length) {
          parts[parts.length - 1] = target.childField;
          next.childFieldPath = parts.join('.');
        }
      }
    }

    return next;
  });
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
 * Array path on an unresolved table mapping object.
 * Prefers `_source` (same key as section maps); accepts legacy `source`.
 * @param {unknown} value
 */
export function getTableMappingSourcePath(value: any): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const fromPreferred = value[SECTION_SOURCE_KEY];
  if (typeof fromPreferred === 'string' && fromPreferred.trim().startsWith('$')) {
    return fromPreferred.trim();
  }
  const legacy = /** @type {{ source?: unknown }} */ (value).source;
  if (typeof legacy === 'string' && legacy.trim().startsWith('$')) {
    return legacy.trim();
  }
  return '';
}

/**
 * Unresolved table mapping in Mapping result JSON:
 * `{ _source: "$payload.records", items: { name: "$name", … } }`.
 * Legacy `{ source, items }` is still accepted when reading.
 * @param {unknown} value
 */
export function isTableMappingObject(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = getTableMappingSourcePath(value);
  const items = /** @type {{ items?: unknown }} */ (value).items;
  return (
    !!source &&
    items != null &&
    typeof items === 'object' &&
    !Array.isArray(items)
  );
}

/**
 * @param {unknown} rule
 */
export function isSectionSourceRule(rule: any): boolean {
  return !!rule && String(rule.field ?? '') === SECTION_SOURCE_KEY;
}

/**
 * Absolute mapping paths resolve against the root payload (`$payload…`).
 * @param {string} sourcePath
 */
export function isAbsoluteMappingPath(sourcePath: any): boolean {
  const full = String(sourcePath ?? '').trim();
  if (!full) return false;
  const { path } = parseMappingSourcePath(full);
  return String(path || full).startsWith('$payload');
}

/**
 * Relative paths resolve against the current section-source array item.
 * @param {string} sourcePath
 */
export function isRelativeMappingPath(sourcePath: any): boolean {
  const full = String(sourcePath ?? '').trim();
  if (!full) return false;
  return !isAbsoluteMappingPath(full);
}

/**
 * Build the reserved `_source` rule for a section.
 * @param {string} sectionName
 * @param {string} sourceArrayPath
 * @returns {import('../types.d.ts').FieldMappingRule}
 */
export function createSectionSourceRule(sectionName: any, sourceArrayPath: any) {
  const path = String(sourceArrayPath ?? '').trim();
  return {
    section: String(sectionName ?? ''),
    field: SECTION_SOURCE_KEY,
    sourcePath: path,
    sourceArrayPath: path,
  };
}

/**
 * Resolve a mapping path for one section-source array item.
 * Absolute (`$payload…`) → root payload; relative (`$Name`, `Name`, `$item.Foo`) → item.
 * @param {string} sourcePath
 * @param {unknown} payload
 * @param {unknown} item
 */
export function resolvePathForSectionItem(sourcePath: any, payload: any, item: any): unknown {
  const full = String(sourcePath ?? '').trim();
  if (!full) return undefined;

  if (isAbsoluteMappingPath(full)) {
    return resolveMappedSourceValue(full, payload);
  }

  const { path, dateFormat } = parseMappingSourcePath(full);
  let relative = String(path || full).trim();
  if (relative.startsWith('$item.')) {
    relative = relative.slice('$item.'.length);
  } else if (relative.startsWith('$item')) {
    relative = relative.slice('$item'.length).replace(/^\./, '');
  } else if (relative.startsWith('$')) {
    relative = relative.slice(1);
  }

  let value: unknown;
  if (item != null && typeof item === 'object' && !Array.isArray(item)) {
    value =
      relative.includes('.') || relative.startsWith('[')
        ? getPayloadByPath(relative, item)
        : /** @type {Record<string, unknown>} */ (item)[relative];
    if (value === undefined && relative) {
      value = getPayloadByPath(relative, item);
    }
  }

  if (dateFormat && looksLikeMappingFormatSuffix(dateFormat)) {
    value = applyMappingFormatSuffix(value, dateFormat);
  }
  return value;
}

/**
 * Walk back a path until `resolveSourcePath` yields an array (table coerce helper).
 * @param {string} sourceArrayPath
 * @param {unknown} payload
 * @returns {{ path: string; rows: unknown[] }}
 */
function resolveArrayPathRows(sourceArrayPath: any, payload: any) {
  let path = String(sourceArrayPath ?? '').trim();
  let rows = resolveSourcePath(path, payload);
  while (!Array.isArray(rows) && typeof path === 'string' && path.includes('.')) {
    const stripped = String(path).replace(/^\$payload\.?/, '');
    const lastDot = stripped.lastIndexOf('.');
    if (lastDot <= 0) break;
    path = String(path).startsWith('$payload')
      ? `$payload.${stripped.slice(0, lastDot)}`
      : stripped.slice(0, lastDot);
    rows = resolveSourcePath(path, payload);
  }
  return { path, rows: Array.isArray(rows) ? rows : [] };
}

/**
 * True when a string looks like a mapping path (absolute `$payload…`, relative `$Name`, or bare `Name`).
 * @param {string} value
 */
function looksLikeMappingPathString(value: any): boolean {
  const s = String(value ?? '').trim();
  if (!s) return false;
  if (s.startsWith('$')) return true;
  return /^[A-Za-z_][\w.[\]'"]*$/.test(s);
}

/**
 * Resolve an unresolved field template value against payload + current array item.
 * @param {unknown} value
 * @param {unknown} payload
 * @param {unknown} item
 */
function resolveSourcedSectionFieldValue(value: any, payload: any, item: any): unknown {
  if (typeof value === 'string' && looksLikeMappingPathString(value)) {
    return resolvePathForSectionItem(value, payload, item);
  }

  if (isTableMappingObject(value)) {
    const source = getTableMappingSourcePath(value);
    const items = /** @type {{ items: Record<string, unknown> }} */ (value).items ?? {};
    let sourceRows: unknown[];
    if (isAbsoluteMappingPath(source)) {
      sourceRows = resolveArrayPathRows(source, payload).rows;
    } else {
      const relative = source.startsWith('$') ? source.slice(1) : source;
      const fromItem =
        item != null && typeof item === 'object'
          ? getPayloadByPath(relative, item)
          : undefined;
      sourceRows = Array.isArray(fromItem) ? fromItem : [];
    }

    return sourceRows.map((sourceRow: any) => {
      if (sourceRow == null || typeof sourceRow !== 'object' || Array.isArray(sourceRow)) {
        return {};
      }
      const targetRow: Record<string, unknown> = {};
      for (const [columnKey, columnValue] of Object.entries(items)) {
        if (typeof columnValue !== 'string') continue;
        targetRow[columnKey] = resolvePathForSectionItem(columnValue, payload, sourceRow);
      }
      return targetRow;
    });
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = resolveSourcedSectionFieldValue(child, payload, item);
    }
    return out;
  }

  return value;
}

/**
 * Pick the payload property to bind to a table column when a whole array is
 * mapped onto the table. Prefer a label slug for generic keys like column_1
 * so "Name" → $name matches nested values[].name.
 */
function inferSourcePropForTableColumn(col: any): string {
  const key = String(col?.key ?? '').trim();
  const label = String(col?.label ?? col?.name ?? '').trim();
  if (/^column_\d+$/i.test(key) && label) {
    return labelToFieldKey(label);
  }
  if (key) return key;
  if (label) return labelToFieldKey(label);
  return 'value';
}

/**
 * True when a column rule accidentally points at the array itself
 * (e.g. drop `$values` onto a cell → sourcePath === sourceArrayPath === `$values`)
 * instead of a row property like `$name`.
 */
function isColumnBoundToArrayItself(rule: any): boolean {
  const sourcePath = String(rule?.sourcePath ?? '').trim();
  const arrayPath = String(rule?.sourceArrayPath ?? '').trim();
  if (!sourcePath || !arrayPath) return false;
  const { path: cleanSource } = parseMappingSourcePath(sourcePath);
  const { path: cleanArray } = parseMappingSourcePath(arrayPath);
  return String(cleanSource || sourcePath) === String(cleanArray || arrayPath);
}

/**
 * Build per-column rules that project an array of row objects onto a table.
 */
function buildTableColumnRulesForArrayPath(
  target: { section: string; field: string; fieldId?: string },
  tableFieldId: string,
  schema: any,
  arrayPath: string,
): FieldMappingRule[] {
  const path = String(arrayPath ?? '').trim();
  if (!path || !Array.isArray(schema?.columns) || !schema.columns.length) return [];
  return schema.columns.map((col: any) => {
    const colKey = String(col?.key ?? '').trim();
    const prop = inferSourcePropForTableColumn(col);
    return {
      section: target.section,
      field: target.field,
      fieldId: tableFieldId,
      columnKey: colKey,
      sourcePath: toAbsoluteColumnPath(path, `$${prop}`),
      sourceArrayPath: path,
    };
  });
}

/**
 * Expand an unresolved section field map (with `_source`) into instance array.
 * @param {Record<string, unknown>} fieldTemplate
 * @param {string} sourceArrayPath
 * @param {unknown} payload
 * @param {Record<string, import('../types.d.ts').FieldSchema>} [fieldSchemas]
 * @param {import('../types.d.ts').EditorBlock[]} [blocks]
 * @param {string} [sectionName]
 * @returns {Array<Record<string, unknown>>}
 */
function findSoleTableSchema(
  blocks: any,
  fieldSchemas: any,
  sectionName: any,
): { fieldId: string; schema: any } | null {
  const matches: Array<{ fieldId: string; schema: any }> = [];
  for (const block of blocks ?? []) {
    if (block?.type !== 'documentSection') continue;
    const name = resolveSectionName(block.data ?? {});
    if (
      name !== sectionName &&
      String(name).toLowerCase() !== String(sectionName ?? '').toLowerCase()
    ) {
      continue;
    }
    walkSegments(block.data?.segments ?? [], (seg: any) => {
      if (seg?.type !== 'table' || !seg.id) return;
      const schema = fieldSchemas?.[seg.id];
      if (schema?.type === 'table') matches.push({ fieldId: seg.id, schema });
    });
  }
  return matches.length === 1 ? matches[0] : null;
}

function expandSourcedSectionInstances(
  fieldTemplate: any,
  sourceArrayPath: any,
  payload: any,
  fieldSchemas: any = {},
  blocks: any = [],
  sectionName: any = '',
) {
  const { rows } = resolveArrayPathRows(sourceArrayPath, payload);
  const soleTable = findSoleTableSchema(blocks, fieldSchemas, sectionName);
  return rows.map((item: any) => {
    const instance: Record<string, unknown> = {};
    for (const [fieldName, value] of Object.entries(fieldTemplate ?? {})) {
      if (fieldName === SECTION_SOURCE_KEY) continue;
      let resolved = resolveSourcedSectionFieldValue(value, payload, item);
      let fieldId = resolveFieldIdByName(sectionName, fieldName, blocks, fieldSchemas);
      let schema = fieldId ? fieldSchemas?.[fieldId] : null;
      if ((!schema || schema.type !== 'table') && soleTable && isTableRowArray(resolved)) {
        fieldId = soleTable.fieldId;
        schema = soleTable.schema;
      }
      if (schema?.type === 'table' && isTableRowArray(resolved)) {
        resolved = projectTableRowsOntoColumns(resolved, schema);
      }
      instance[fieldName] = resolved;
    }
    return instance;
  });
}

/**
 * No-op: `_source` mapping must not flip "Show on each page" (`repeatable`).
 * Instance cloning uses loaded section arrays via `resolveRepeatablePagePlan`.
 * Kept for API compatibility with older callers.
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {import('../types.d.ts').FieldMappingRule[] | null | undefined} _rules
 */
export function applySectionSourceRepeatable(blocks: any, _rules: any) {
  return blocks;
}

/**
 * Absolute column path → relative `$prop` item path when under `sourceArrayPath`.
 * Preserves `#format` suffixes. Falls back to the original absolute path.
 * @param {string} sourcePath
 * @param {string} sourceArrayPath
 */
export function toRelativeItemPath(sourcePath: any, sourceArrayPath: any) {
  const full = String(sourcePath ?? '').trim();
  const { path, dateFormat } = parseMappingSourcePath(full);
  const cleanPath = path || full;
  const arrayPath = String(sourceArrayPath ?? '').trim();

  if (!arrayPath || !cleanPath.startsWith(arrayPath)) return full;

  const suffix = cleanPath.slice(arrayPath.length);
  if (suffix.startsWith('.')) {
    const relative = `$${suffix.slice(1)}`;
    return dateFormat ? `${relative}#${dateFormat}` : relative;
  }

  const onlyBracket = suffix.match(/^\[["'](.+)["']\]$/);
  if (onlyBracket && /^[a-zA-Z_$][\w$]*$/.test(onlyBracket[1])) {
    const relative = `$${onlyBracket[1]}`;
    return dateFormat ? `${relative}#${dateFormat}` : relative;
  }

  return full;
}

/**
 * Join table `source` with a relative (`$name`) or absolute (`$payload…`) item path.
 * Preserves `#format` suffixes.
 * @param {string} source
 * @param {string} itemPath
 */
export function toAbsoluteColumnPath(source: any, itemPath: any) {
  const full = String(itemPath ?? '').trim();
  const { path, dateFormat } = parseMappingSourcePath(full);
  const cleanItem = path || full;
  const arrayPath = String(source ?? '').trim();

  if (cleanItem.startsWith('$payload')) {
    return dateFormat ? `${cleanItem}#${dateFormat}` : cleanItem;
  }

  const relative = cleanItem.startsWith('$') ? cleanItem.slice(1) : cleanItem;
  if (!arrayPath) {
    const abs = relative.startsWith('$') ? relative : `$${relative}`;
    return dateFormat ? `${abs}#${dateFormat}` : abs;
  }

  const absolute = relative.startsWith('[')
    ? `${arrayPath}${relative}`
    : `${arrayPath}.${relative}`;
  return dateFormat ? `${absolute}#${dateFormat}` : absolute;
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
 * @param {Record<string, import('../types.d.ts').FieldSchema>} [fieldSchemas={}]
 * @param {import('../types.d.ts').EditorBlock[]} [blocks=[]]
 */
function buildSectionsFromRules(
  rules: any,
  resolved: any = false,
  payload: any = null,
  fieldSchemas: any = {},
  blocks: any = [],
) {
  const sections: Record<string, Record<string, unknown>> = {};

  /** @type {Map<string, string>} */
  const sectionSources = new Map();
  for (const rule of rules ?? []) {
    if (!isSectionSourceRule(rule)) continue;
    const path = String(rule.sourceArrayPath || rule.sourcePath || '').trim();
    if (path) sectionSources.set(String(rule.section), path);
  }

  const tableRuleGroups = new Map<string, FieldMappingRule[]>();
  /** @type {FieldMappingRule[]} */
  const pivotRules = [];

  for (const rule of rules ?? []) {
    if (!rule?.section || !rule?.field) continue;
    if (isSectionSourceRule(rule)) continue;

    const sourcePath = String(rule.sourcePath ?? '').trim();
    const sourceArrayPath = String(rule.sourceArrayPath ?? '').trim();
    const sectionIsSourced = sectionSources.has(String(rule.section));

    // Pivot: sourceArrayPath without columnKey; confirmed via schema or array-only rule.
    if (sourceArrayPath && !rule.columnKey) {
      const fieldId =
        rule.fieldId ||
        resolveFieldIdByName(rule.section, rule.field, blocks, fieldSchemas);
      const schema = (fieldId && fieldSchemas?.[fieldId]) || null;
      if (schema?.type === 'pivotTable' || (!sourcePath && !schema)) {
        pivotRules.push(rule);
        continue;
      }
    }

    if (!sourcePath) continue;

    if (rule.columnKey) {
      const groupKey = `${rule.section}\0${rule.field}`;
      if (!tableRuleGroups.has(groupKey)) tableRuleGroups.set(groupKey, []);
      tableRuleGroups.get(groupKey)?.push(rule);
      continue;
    }

    // Whole-array path on a table field (e.g. "Table": "$values") → expand into
    // { source, items } column rules so nested master-detail rows resolve correctly.
    {
      const fieldId =
        rule.fieldId ||
        resolveFieldIdByName(rule.section, rule.field, blocks, fieldSchemas);
      const schema = (fieldId && fieldSchemas?.[fieldId]) || null;
      if (schema?.type === 'table' && Array.isArray(schema.columns) && schema.columns.length) {
        let arrayPath = sourcePath;
        if (sectionIsSourced) {
          const sectionSourcePath = sectionSources.get(String(rule.section));
          if (sectionSourcePath && isAbsoluteMappingPath(arrayPath)) {
            arrayPath = toRelativeItemPath(arrayPath, sectionSourcePath);
          }
        }
        const synthetic = buildTableColumnRulesForArrayPath(
          { section: rule.section, field: rule.field, fieldId: fieldId ?? rule.fieldId },
          fieldId ?? rule.fieldId,
          schema,
          arrayPath,
        );
        const groupKey = `${rule.section}\0${rule.field}`;
        if (!tableRuleGroups.has(groupKey)) tableRuleGroups.set(groupKey, []);
        tableRuleGroups.get(groupKey)?.push(...synthetic);
        continue;
      }
    }

    if (!sections[rule.section]) sections[rule.section] = {};
    // Sourced sections keep unresolved paths so each array item can resolve relative/absolute.
    let storedPath = rule.sourcePath;
    if (sectionIsSourced && !(resolved && !sectionIsSourced)) {
      const sectionSourcePath = sectionSources.get(String(rule.section));
      if (sectionSourcePath && isAbsoluteMappingPath(storedPath)) {
        storedPath = toRelativeItemPath(storedPath, sectionSourcePath);
      }
    }
    let value =
      resolved && !sectionIsSourced
        ? resolveMappedSourceValue(rule.sourcePath, payload)
        : storedPath;
    if (resolved && !sectionIsSourced && isTableRowArray(value)) {
      const fieldId =
        rule.fieldId ||
        resolveFieldIdByName(rule.section, rule.field, blocks, fieldSchemas);
      const schema = (fieldId && fieldSchemas?.[fieldId]) || null;
      if (schema?.type === 'table') {
        value = projectTableRowsOntoColumns(value, schema);
      }
    }
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
    const sectionIsSourced = sectionSources.has(section);

    // Heal cell-drops of a whole array (`column_1: "$values"`) into real row props.
    const fieldId: string | undefined =
      tableRules.find((r: any) => r.fieldId)?.fieldId ||
      resolveFieldIdByName(section, field, blocks, fieldSchemas) ||
      undefined;
    const tableSchema = (fieldId && fieldSchemas?.[fieldId]) || null;
    const healedRules =
      fieldId &&
      tableSchema?.type === 'table' &&
      tableRules.some(isColumnBoundToArrayItself)
        ? (() => {
            const arrayPath =
              tableRules.find((r: any) => r.sourceArrayPath)?.sourceArrayPath ||
              tableRules.find((r: any) => r.sourcePath)?.sourcePath ||
              '';
            const rebuilt = buildTableColumnRulesForArrayPath(
              { section, field, fieldId },
              fieldId,
              tableSchema,
              arrayPath,
            );
            return rebuilt.length ? rebuilt : tableRules;
          })()
        : tableRules;

    if (resolved && !sectionIsSourced) {
      sections[section][field] = resolveTableRowsFromRules(healedRules, payload);
      continue;
    }

    let sourceArrayPath =
      healedRules.find((rule: any) => rule.sourceArrayPath)?.sourceArrayPath ??
      inferSourceArrayPathFromColumnRules(healedRules);
    const sectionSourcePath = sectionIsSourced
      ? sectionSources.get(section)
      : undefined;
    // Under a section `_source`, prefer table source relative to each array item.
    if (sectionSourcePath && isAbsoluteMappingPath(sourceArrayPath)) {
      sourceArrayPath = toRelativeItemPath(sourceArrayPath, sectionSourcePath);
    }
    const items: Record<string, unknown> = {};
    for (const rule of healedRules) {
      if (!rule.columnKey) continue;
      // Peel absolute → section-relative → row-relative (`$amount` under `$values`).
      // Using only the first rule's sourceArrayPath left later absolute drops
      // (e.g. `$payload…Table.values.amount`) unshortened next to `$name`.
      let itemPath = String(rule.sourcePath ?? '').trim();
      if (sectionSourcePath && isAbsoluteMappingPath(itemPath)) {
        itemPath = toRelativeItemPath(itemPath, sectionSourcePath);
      }
      let ruleArrayPath = String(rule.sourceArrayPath ?? sourceArrayPath ?? '').trim();
      if (sectionSourcePath && isAbsoluteMappingPath(ruleArrayPath)) {
        ruleArrayPath = toRelativeItemPath(ruleArrayPath, sectionSourcePath);
      }
      if (ruleArrayPath) {
        itemPath = toRelativeItemPath(itemPath, ruleArrayPath);
      }
      if (sourceArrayPath) {
        itemPath = toRelativeItemPath(itemPath, sourceArrayPath);
      }
      items[rule.columnKey] = itemPath;
    }
    sections[section][field] = {
      [SECTION_SOURCE_KEY]: sourceArrayPath,
      items,
    };
  }

  for (const rule of pivotRules) {
    if (!sections[rule.section]) sections[rule.section] = {};
    const fieldId =
      rule.fieldId ||
      resolveFieldIdByName(rule.section, rule.field, blocks, fieldSchemas);
    const schema = (fieldId && fieldSchemas?.[fieldId]) || null;
    const sectionIsSourced = sectionSources.has(String(rule.section));

    if (resolved && !sectionIsSourced) {
      let sourceRows = resolveSourcePath(rule.sourceArrayPath, payload);
      if (!Array.isArray(sourceRows)) sourceRows = [];
      if (schema?.type === 'pivotTable') {
        sections[rule.section][rule.field] = pivotExpand(sourceRows, schema);
      } else {
        sections[rule.section][rule.field] = sourceRows;
      }
    } else {
      sections[rule.section][rule.field] = rule.sourceArrayPath;
    }
  }

  for (const [sectionName, sourcePath] of sectionSources) {
    if (!sections[sectionName]) sections[sectionName] = {};
    if (!resolved) {
      sections[sectionName][SECTION_SOURCE_KEY] = sourcePath;
    }
  }

  if (resolved && sectionSources.size > 0) {
    /** @type {Record<string, unknown>} */
    const expanded: Record<string, unknown> = { ...sections };
    for (const [sectionName, sourcePath] of sectionSources) {
      expanded[sectionName] = expandSourcedSectionInstances(
        sections[sectionName] ?? {},
        sourcePath,
        payload,
        fieldSchemas,
        blocks,
        sectionName,
      );
    }
    return /** @type {Record<string, Record<string, unknown>>} */ (expanded);
  }

  return sections;
}

/**
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {{ blocks?: import('../types.d.ts').EditorBlock[]; fieldSchemas?: Record<string, import('../types.d.ts').FieldSchema> }} [template]
 */
export function buildMappingResultFromRules(rules: any, template: any = {}) {
  const blocks = template?.blocks ?? [];
  const fieldSchemas = template?.fieldSchemas ?? {};
  return {
    kind: 'field',
    version: IO_VERSION,
    sections: buildSectionsFromRules(rules, false, null, fieldSchemas, blocks),
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
      // Recurse into nested objects and arrays so nested table columns
      // (e.g. Table.values[].name) appear in the source fields tree.
      children:
        value != null && typeof value === 'object'
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
      if (fieldName === SECTION_SOURCE_KEY) {
        if (typeof value === 'string' && value.trim().startsWith('$')) {
          rules.push(createSectionSourceRule(sectionName, value.trim()));
        }
        continue;
      }

      const fieldId = resolveFieldIdByName(sectionName, fieldName, blocks, fieldSchemas);

      if (isMappingExpressionValue(value)) {
        const schema = fieldId ? fieldSchemas[fieldId] : null;
        if (schema?.type === 'pivotTable') {
          rules.push({
            section: sectionName,
            field: fieldName,
            fieldId: fieldId ?? undefined,
            sourceArrayPath: value,
          });
        } else {
          rules.push({
            section: sectionName,
            field: fieldName,
            sourcePath: value,
            fieldId: fieldId ?? undefined,
          });
        }
        continue;
      }

      if (isTableMappingObject(value)) {
        const schema = fieldId ? fieldSchemas[fieldId] : null;
        if (!schema || schema.type === 'table') {
          const source = getTableMappingSourcePath(value);
          const items = /** @type {{ items: Record<string, unknown> }} */ (value).items;
          for (const [columnKey, columnValue] of Object.entries(items)) {
            if (!isMappingExpressionValue(columnValue)) continue;
            const absolute = toAbsoluteColumnPath(source, String(columnValue));
            const normalized = normalizeTableColumnSourcePath(absolute);
            rules.push({
              section: sectionName,
              field: fieldName,
              fieldId: fieldId ?? undefined,
              columnKey,
              sourcePath: normalized.sourcePath,
              sourceArrayPath: source,
            });
          }
          continue;
        }
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
export function resolveRulesToFieldsExport( rules: any, payload: any, template: any) {
  const fieldSchemas = template?.fieldSchemas ?? {};
  const blocks = template?.blocks ?? [];
  const sections = buildSectionsFromRules(rules, true, payload, fieldSchemas, blocks);
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
  const { childFieldIds = [], bulkChild = false, sourceType = '' } = options;
  const dropType = String(sourceType ?? '').trim().toLowerCase();

  const cellRef = parseCellFieldId(fieldId, fieldSchemas);
  if (cellRef) {
    const tableSchema = fieldSchemas[cellRef.tableFieldId];
    if (!tableSchema || tableSchema.type !== 'table') return [];

    const target = resolveFieldMappingTarget(cellRef.tableFieldId, blocks, fieldSchemas);
    if (!target) return [];

    const normalized = normalizeTableColumnSourcePath(sourcePath);
    // Dropping a whole array onto a cell must project onto table columns
    // (`$values` → column_1: $name), not bind the array into one column.
    if (dropType === 'array') {
      const arrayPath = normalized.sourceArrayPath || normalized.sourcePath || sourcePath;
      const columnRules = buildTableColumnRulesForArrayPath(
        target,
        cellRef.tableFieldId,
        tableSchema,
        arrayPath,
      );
      if (columnRules.length) return columnRules;
    }

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
  if (parentSchema?.type === 'pivotTable') {
    const target = resolveFieldMappingTarget(fieldId, blocks, fieldSchemas);
    if (!target) return [];
    const normalized = normalizeTableColumnSourcePath(sourcePath);
    const arrayPath = normalized.sourceArrayPath || normalized.sourcePath || sourcePath;
    return [
      {
        section: target.section,
        field: target.field,
        fieldId,
        sourceArrayPath: arrayPath,
      },
    ];
  }

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

  // Dropping an array onto a whole table → per-column rules under that array path.
  if (schema?.type === 'table' && Array.isArray(schema.columns) && schema.columns.length) {
    const arrayPath = String(sourcePath ?? '').trim();
    const columnRules = buildTableColumnRulesForArrayPath(
      target,
      target.fieldId ?? fieldId,
      schema,
      arrayPath,
    );
    if (columnRules.length) return columnRules;
  }

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
 * @param {import('../types.d.ts').FieldMappingSpec | null | undefined} spec
 * @param {import('../types.d.ts').EditorBlock[]} blocks
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @param {{ fieldIdRenames?: Record<string, string> | Map<string, string> }} [options]
 */
export function syncFieldMappingSpecToSchema(spec: any, blocks: any, fieldSchemas: any, options: any = {}) {
  const normalized = normalizeFieldMappingSpec(spec);
  return {
    ...normalized,
    rules: syncMappingRulesToSchema(normalized.rules, blocks, fieldSchemas, options),
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
    if (field === SECTION_SOURCE_KEY) continue;
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
