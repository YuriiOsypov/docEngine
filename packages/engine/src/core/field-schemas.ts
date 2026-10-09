import { createEmptyImageValue } from '../utils/image-values.js';
import { findFieldPlacement } from './field-id.js';
import { mapSegments } from './segment-tree.js';
import {
  renameFieldNameInFormulas,
  renameTableColumnInFormulas,
} from './formula-field-index.js';
import type { FieldHandler, FieldSchema } from '../types.js';

type TableRow = { key: string; label?: string };
/** Soft schema bag — plugins add many optional keys beyond FieldSchema. */
type SoftSchema = FieldSchema & Record<string, any>;
type SoftHandler = Partial<FieldHandler> & Record<string, any>;

let getFieldHandlerFn: (type: string) => SoftHandler | undefined = () => undefined;

/**
 * Optional FieldHandler bridge for hosts that register plugins (e.g. @docengine/editor).
 * Headless consumers can omit this and use builtin schema defaults.
 */
export function configureFieldHandlers(api: { getFieldHandler?: (type: string) => unknown } = {}) {
  getFieldHandlerFn =
    typeof api.getFieldHandler === 'function'
      ? (api.getFieldHandler as (type: string) => SoftHandler | undefined)
      : () => undefined;
}

function getFieldHandler(type: string): SoftHandler | undefined {
  return getFieldHandlerFn(type);
}

export function generateFieldId( prefix: any = 'field') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function isValidFieldId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id);
}

const DEFAULT_INLINE_TABLE_ROWS: TableRow[] = [{ key: 'row1', label: '' }];

/** Slugify a column label into a valid field key; dedupe within usedKeys. */
export function labelToFieldKey(label: unknown, usedKeys: Set<string> = new Set()) {
  let base = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!base || !/^[a-zA-Z_]/.test(base)) {
    base = /^[0-9]/.test(base) ? `_${base}` : 'column';
  }
  if (!/^[a-zA-Z_]/.test(base)) base = 'column';

  let key = base;
  let index = 2;
  while (usedKeys.has(key)) {
    key = `${base}_${index}`;
    index += 1;
  }
  return key;
}

/** Store unitless numbers as percentages (`40` → `40%`). `auto` is omitted. */
export function normalizeStoredColumnWidth(width: any) {
  const value = String(width ?? '').trim();
  if (!value || value === 'auto') return '';
  if (/^\d+(\.\d+)?$/.test(value)) return `${value}%`;
  return value;
}

export function buildTableColumnsFromLabels( labels: any, widths: any = [], previousColumns: any = [], columnNames: any = [],) {
  const usedKeys = new Set<string>();
  const columns: Array<{ key: string; label: string; name: string; width?: string }> = [];

  for (let i = 0; i < labels.length; i += 1) {
    const label = String(labels[i] ?? '').trim();
    if (!label) continue;

    const nameInput = String(columnNames[i] ?? '').trim();
    const name = nameInput || label;
    const prev = previousColumns[i];
    const prevName = prev?.name ?? prev?.label;
    let key;
    if (prev && prevName === name && prev.key) {
      key = prev.key;
    } else {
      key = labelToFieldKey(name, usedKeys);
    }

    if (usedKeys.has(key)) {
      throw new Error(`Duplicate column field ID: ${key}`);
    }
    usedKeys.add(key);

    const col: { key: string; label: string; name: string; width?: string } = { key, label, name };
    const width = normalizeStoredColumnWidth(widths[i]);
    if (width) col.width = width;
    columns.push(col);
  }

  return columns;
}

function collectRowKeysForTableColumn( tableFieldId: any, colKey: any, fieldSchemas: any, blocks: any) {
  const rowKeys = new Set();
  const suffix = `_${colKey}`;
  const prefix = `${tableFieldId}_`;

  for (const id of Object.keys(fieldSchemas ?? {})) {
    if (!id.startsWith(prefix) || !id.endsWith(suffix)) continue;
    const rowKey = id.slice(prefix.length, id.length - suffix.length);
    if (rowKey) rowKeys.add(rowKey);
  }

  for (const block of blocks ?? []) {
    const maps = [];
    if (block.type === 'documentSection' && block.data?.fieldValues) {
      maps.push(block.data.fieldValues);
    }
    if (block.data?.cells && typeof block.data.cells === 'object') {
      maps.push(block.data.cells);
    }
    for (const map of maps) {
      for (const id of Object.keys(map)) {
        if (!id.startsWith(prefix) || !id.endsWith(suffix)) continue;
        const rowKey = id.slice(prefix.length, id.length - suffix.length);
        if (rowKey) rowKeys.add(rowKey);
      }
    }
  }

  return rowKeys;
}

function renameCellKeyInMap( map: any, oldId: any, newId: any) {
  if (!map || !Object.prototype.hasOwnProperty.call(map, oldId)) return;
  map[newId] = map[oldId];
  delete map[oldId];
}

/**
 * Clear cell values that only echoed the previous column label/name.
 * Those are design-mode placeholders; after a rename they must not stick as
 * real values (e.g. "Column 1" under a column now named "name").
 */
function clearStaleColumnPlaceholderValue(map: any, cellId: any, oldPlaceholders: any) {
  if (!map || !Object.prototype.hasOwnProperty.call(map, cellId)) return;
  const value = map[cellId];
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  for (const placeholder of oldPlaceholders ?? []) {
    if (placeholder && trimmed === placeholder) {
      map[cellId] = '';
      return;
    }
  }
}

function columnPlaceholderStrings(col: any) {
  const labels = [
    String(col?.label ?? '').trim(),
    String(col?.name ?? '').trim(),
  ];
  return [...new Set(labels.filter(Boolean))];
}

/** Rename cell schemas and values when table column keys change. */
export function syncTableColumnKeyChanges( tableFieldId: any, oldColumns: any, newColumns: any, fieldSchemas: any, blocks: any) {
  const keyRenames = [];
  const nameRenames = [];
  const labelUpdates = [];
  const maxLen = Math.max(oldColumns?.length ?? 0, newColumns?.length ?? 0);

  for (let i = 0; i < maxLen; i += 1) {
    const oldCol = oldColumns?.[i];
    const newCol = newColumns?.[i];
    if (oldCol?.key && newCol?.key && oldCol.key !== newCol.key) {
      keyRenames.push({
        oldKey: oldCol.key,
        newKey: newCol.key,
        label: newCol.label,
        name: newCol.name ?? newCol.label,
        oldPlaceholders: columnPlaceholderStrings(oldCol),
      });
    }
    const oldName = String(oldCol?.name ?? oldCol?.label ?? '').trim();
    const newName = String(newCol?.name ?? newCol?.label ?? '').trim();
    if (oldName && newName && oldName !== newName) {
      nameRenames.push({ oldName, newName });
    }
    // Same key, but display label/name changed — drop stale placeholder values.
    if (
      oldCol?.key &&
      newCol?.key &&
      oldCol.key === newCol.key &&
      (String(oldCol.label ?? '') !== String(newCol.label ?? '') ||
        String(oldCol.name ?? oldCol.label ?? '') !== String(newCol.name ?? newCol.label ?? ''))
    ) {
      labelUpdates.push({
        colKey: oldCol.key,
        label: newCol.label,
        name: newCol.name ?? newCol.label,
        oldPlaceholders: columnPlaceholderStrings(oldCol),
      });
    }
  }

  if (!keyRenames.length && !nameRenames.length && !labelUpdates.length) {
    return { fieldSchemas: { ...(fieldSchemas ?? {}) }, blocks: JSON.parse(JSON.stringify(blocks ?? [])) };
  }

  let nextSchemas = { ...(fieldSchemas ?? {}) };
  const nextBlocks = JSON.parse(JSON.stringify(blocks ?? []));

  if (nameRenames.length) {
    const placement = findFieldPlacement(tableFieldId, blocks);
    const tableSchema = fieldSchemas?.[tableFieldId];
    const tableName = String(tableSchema?.name ?? tableSchema?.label ?? '').trim();
    for (const { oldName, newName } of nameRenames) {
      nextSchemas = renameTableColumnInFormulas(
        nextSchemas,
        placement.sectionName,
        tableName,
        oldName,
        newName,
      );
    }
  }

  for (const { oldKey, newKey, label, name, oldPlaceholders } of keyRenames) {
    const rowKeys = collectRowKeysForTableColumn(tableFieldId, oldKey, nextSchemas, nextBlocks);
    if (!rowKeys.size) rowKeys.add('row1');

    for (const rowKey of rowKeys) {
      const oldId = cellFieldId(tableFieldId, rowKey, oldKey);
      const newId = cellFieldId(tableFieldId, rowKey, newKey);

      if (nextSchemas[oldId]) {
        nextSchemas[newId] = {
          ...nextSchemas[oldId],
          label: label ?? nextSchemas[oldId].label,
          name: name ?? nextSchemas[oldId].name ?? label ?? nextSchemas[oldId].label,
        };
        delete nextSchemas[oldId];
      }

      for (const block of nextBlocks) {
        if (block.type === 'documentSection' && block.data?.fieldValues) {
          renameCellKeyInMap(block.data.fieldValues, oldId, newId);
          clearStaleColumnPlaceholderValue(block.data.fieldValues, newId, oldPlaceholders);
        }
        if (block.data?.cells && typeof block.data.cells === 'object') {
          renameCellKeyInMap(block.data.cells, oldId, newId);
          clearStaleColumnPlaceholderValue(block.data.cells, newId, oldPlaceholders);
        }
      }
    }
  }

  for (const { colKey, label, name, oldPlaceholders } of labelUpdates) {
    const rowKeys = collectRowKeysForTableColumn(tableFieldId, colKey, nextSchemas, nextBlocks);
    if (!rowKeys.size) rowKeys.add('row1');

    for (const rowKey of rowKeys) {
      const cellId = cellFieldId(tableFieldId, rowKey, colKey);
      if (nextSchemas[cellId]) {
        nextSchemas[cellId] = {
          ...nextSchemas[cellId],
          label: label ?? nextSchemas[cellId].label,
          name: name ?? nextSchemas[cellId].name ?? label ?? nextSchemas[cellId].label,
        };
      }
      for (const block of nextBlocks) {
        if (block.type === 'documentSection' && block.data?.fieldValues) {
          clearStaleColumnPlaceholderValue(block.data.fieldValues, cellId, oldPlaceholders);
        }
        if (block.data?.cells && typeof block.data.cells === 'object') {
          clearStaleColumnPlaceholderValue(block.data.cells, cellId, oldPlaceholders);
        }
      }
    }
  }

  return { fieldSchemas: nextSchemas, blocks: nextBlocks };
}

function escapeRegExp( str: any) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renameIdInFormula( formula: any, oldId: any, newId: any) {
  if (!formula || oldId === newId) return formula;
  return formula.replace(new RegExp(`\\{${escapeRegExp(oldId)}\\}`, 'g'), `{${newId}}`);
}

function renameKey( obj: any, oldId: any, newId: any) {
  if (!obj || !Object.prototype.hasOwnProperty.call(obj, oldId)) return obj;
  const next = { ...obj };
  next[newId] = next[oldId];
  delete next[oldId];
  return next;
}

function renameTableCellKeys(cells: any, oldTableId: any, newTableId: any) {
  if (!cells || typeof cells !== 'object') return cells;
  const oldPrefix = `${oldTableId}_`;
  const next: Record<string, any> = {};
  for (const [key, val] of Object.entries(cells)) {
    if (key.startsWith(oldPrefix)) {
      next[`${newTableId}_${key.slice(oldPrefix.length)}`] = val;
    } else {
      next[key] = val;
    }
  }
  return next;
}

function renameFieldIdInSchemas( oldId: any, newId: any, updatedSchema: any, fieldSchemas: any) {
  const next = { ...fieldSchemas };
  delete next[oldId];
  next[newId] = { ...updatedSchema };

  if (updatedSchema.type === 'table') {
    const oldPrefix = `${oldId}_`;
    for (const key of [...Object.keys(next)]) {
      if (key.startsWith(oldPrefix)) {
        next[`${newId}_${key.slice(oldPrefix.length)}`] = next[key];
        delete next[key];
      }
    }
  }

  for (const [id, schemaRaw] of Object.entries(next)) {
    if (id === newId) continue;

    const schema = schemaRaw as SoftSchema;
    let patched: SoftSchema = schema;
    let changed = false;

    if (schema.type === 'computed' && String(schema.formula ?? '').includes(`{${oldId}}`)) {
      patched = { ...patched, formula: renameIdInFormula(schema.formula, oldId, newId) };
      changed = true;
    }

    if (changed) next[id] = patched;
  }

  return next;
}

function renameFieldIdInBlock( block: any, oldId: any, newId: any, renamedIsTable: any) {
  const data = block.data;
  if (!data) return block;

  const nextData = { ...data };

  if (block.type === 'documentSection') {
    nextData.segments = mapSegments(data.segments ?? [], (seg) => {
      if (seg.type === 'field' && seg.id === oldId) return { ...seg, id: newId };
      if (seg.type === 'table' && seg.id === oldId) return { ...seg, id: newId };
      return seg;
    });
    if (renamedIsTable) {
      nextData.fieldValues = renameTableCellKeys(data.fieldValues, oldId, newId);
    } else {
      nextData.fieldValues = renameKey(data.fieldValues, oldId, newId);
    }
  }

  if (data.fieldId === oldId) {
    nextData.fieldId = newId;
  }

  if (data.cells && typeof data.cells === 'object') {
    if (renamedIsTable && data.fieldId === oldId) {
      nextData.cells = renameTableCellKeys(data.cells, oldId, newId);
    } else if (!renamedIsTable) {
      nextData.cells = renameKey(data.cells, oldId, newId);
    }
  }

  return { ...block, data: nextData };
}

export function applyFieldIdChange( oldId: any, newId: any, updatedSchema: any, fieldSchemas: any, blocks: any) {
  if (oldId === newId) {
    return {
      fieldSchemas: { ...fieldSchemas, [oldId]: updatedSchema },
      blocks,
    };
  }

  if (!isValidFieldId(newId)) {
    throw new Error('Invalid field ID. Use letters, numbers, and underscores; start with a letter or underscore.');
  }

  if (fieldSchemas[newId]) {
    throw new Error(`Field ID "${newId}" is already in use.`);
  }

  if (!fieldSchemas[oldId]) {
    throw new Error(`Field "${oldId}" not found.`);
  }

  const renamedIsTable = updatedSchema.type === 'table';
  const oldSchema = fieldSchemas[oldId];
  let nextSchemas = renameFieldIdInSchemas(oldId, newId, updatedSchema, fieldSchemas);
  const placement = findFieldPlacement(oldId, blocks);
  const oldName = String(oldSchema?.name ?? oldSchema?.label ?? '').trim();
  const newName = String(updatedSchema?.name ?? updatedSchema?.label ?? '').trim();
  nextSchemas = renameFieldNameInFormulas(
    nextSchemas,
    placement.sectionName,
    oldName,
    newName,
  );

  return {
    fieldSchemas: nextSchemas,
    blocks: (blocks ?? []).map((block: any) => renameFieldIdInBlock(block, oldId, newId, renamedIsTable)),
  };
}

function flattenTreeToItems(nodes: any, ancestors: any = []): Array<{ id: string; label: string }> {
  const items: Array<{ id: string; label: string }> = [];
  for (const node of nodes ?? []) {
    const path = [...ancestors, node.label].join(' ');
    if (node.children?.length) {
      items.push(...flattenTreeToItems(node.children, [...ancestors, node.label]));
    } else {
      items.push({ id: node.id ?? path, label: path });
    }
  }
  return items;
}

function getBuiltinEmptyValue( type: any) {
  if (type === 'list' || type === 'tree') return [];
  if (type === 'integer' || type === 'date' || type === 'barcode') return '';
  if (type === 'logical') return null;
  if (type === 'image') return createEmptyImageValue();
  if (type === 'signature') return '';
  if (type === 'child') return {};
  if (type === 'pivotTable') return { columns: [], rows: [] };
  return '';
}

function resolveBuiltinDefaultValue( schema: any, { forTemplate = false } = {}) {
  if (!schema) return '';

  switch (schema.type) {
    case 'text':
      return schema.defaultText ?? '';
    case 'integer': {
      const value = schema.defaultValue;
      return value === '' || value == null ? '' : String(value);
    }
    case 'date':
      if (schema.defaultMode === 'fixed' && schema.defaultDate) return schema.defaultDate;
      if (!forTemplate && (schema.defaultMode ?? 'today') === 'today') {
        return localTodayIso();
      }
      return '';
    case 'choice':
      return schema.defaultValue ?? '';
    case 'list':
      return Array.isArray(schema.defaultValue) ? [...schema.defaultValue] : [];
    case 'tree':
      return Array.isArray(schema.defaultValue) ? [...schema.defaultValue] : [];
    case 'child':
      return {};
    case 'image':
      return createEmptyImageValue();
    case 'logical': {
      const value = schema.defaultValue;
      return value === true || value === false ? value : null;
    }
    case 'signature':
      return '';
    case 'barcode':
      return '';
    case 'pivotTable':
      return { columns: [], rows: [] };
    default:
      return getBuiltinEmptyValue(schema.type);
  }
}

function createBuiltinDefaultSchema(type: any, label: any = 'New field', name: any = label): SoftSchema {
  const base: SoftSchema = { type, label, name: name || label, required: false };

  switch (type) {
    case 'text':
      return { ...base, defaultText: '' };
    case 'integer':
      return {
        ...base,
        min: 0,
        max: 999,
        defaultValue: '',
        suffix: '',
        displayFormat: 'plain',
        currencyCode: 'EUR',
      };
    case 'date':
      return {
        ...base,
        defaultMode: 'today',
        defaultDate: '',
        dateFormat: 'dd/mm/yyyy',
        customDateFormat: '',
      };
    case 'image':
      return { ...base, maxWidth: 320, altText: '' };
    case 'logical':
      return { ...base, defaultValue: null, trueMark: 'yesNo' };
    case 'signature':
      return { ...base, maxWidth: 320 };
    case 'barcode':
      return {
        ...base,
        symbology: 'code128',
        maxWidth: 180,
        height: 10,
        displayValue: true,
        quietZone: true,
      };
    case 'list':
      return {
        ...base,
        multi: true,
        itemLayout: 'inline',
        itemPrefix: '',
        items: [{ id: 'item1', label: 'Option 1' }],
        defaultValue: [],
      };
    case 'choice':
      return { ...base, multi: false, items: [{ id: 'item1', label: 'Option 1' }], defaultValue: '' };
    case 'tree':
      return {
        ...base,
        tree: [{ label: 'Node 1', children: [{ label: 'Leaf 1' }] }],
        defaultValue: [],
      };
    case 'table': {
      const usedKeys = new Set<string>();
      const col1Key = labelToFieldKey('Column 1', usedKeys);
      usedKeys.add(col1Key);
      const col2Key = labelToFieldKey('Column 2', usedKeys);
      return {
        ...base,
        columns: [
          { key: col1Key, label: 'Column 1' },
          { key: col2Key, label: 'Column 2' },
        ],
        cellType: 'text',
      };
    }
    case 'pivotTable':
      return {
        ...base,
        rowProperty: 'Region',
        columnProperty: 'Product',
        valueProperty: 'Amount',
        aggregation: 'sum',
        showRowTotals: true,
        showColumnTotals: true,
        showGrandTotal: true,
        emptyCell: '',
        sortRows: 'asc',
        sortColumns: 'asc',
      };
    case 'child':
      return {
        ...base,
        fieldSchemas: {},
      };
    case 'computed':
      return { ...base, formula: '' };
    default:
      return base;
  }
}

function createBuiltinBlockData( fieldType: any) {
  const fieldId = generateFieldId(fieldType);
  const labels: Record<string, string> = {
    text: 'Text',
    integer: 'Number',
    logical: 'Logical',
    list: 'List',
    choice: 'Choice',
    tree: 'Tree',
    image: 'Image',
    signature: 'Signature',
    barcode: 'Barcode',
    table: 'Table',
    pivotTable: 'Pivot Table',
    child: 'Child',
  };
  const label = labels[fieldType] ?? 'Field';

  return {
    fieldType,
    fieldId,
    label,
    prefixText: '',
    value:
      fieldType === 'child'
        ? {}
        : fieldType === 'pivotTable'
          ? { columns: [], rows: [] }
        : fieldType === 'list' || fieldType === 'tree'
          ? []
          : fieldType === 'logical'
            ? null
            : fieldType === 'integer'
            ? ''
            : fieldType === 'image'
              ? createEmptyImageValue()
              : fieldType === 'signature'
                ? ''
              : '',
    cells: fieldType === 'table' ? {} : undefined,
  };
}

export function getDefaultFieldValue(type: any) {
  const handler = getFieldHandler(type);
  if (handler?.getEmptyValue) return handler.getEmptyValue();
  return getBuiltinEmptyValue(type);
}

export function getEmptyFieldValue( type: any) {
  return getDefaultFieldValue(type);
}

export function localTodayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveSchemaDefaultValue(schema: any, { forTemplate = false }: { forTemplate?: boolean } = {}) {
  if (!schema) return '';
  const handler = getFieldHandler(schema.type);
  if (handler?.resolveDefaultValue) return handler.resolveDefaultValue(schema, { forTemplate });
  return resolveBuiltinDefaultValue(schema, { forTemplate });
}

export function isSchemaRequired( schema: any) {
  return !!schema?.required;
}

export function isSchemaReadonly( schema: any) {
  return !!schema?.readonly;
}

/**
 * True when a table cell inherits read-only from its parent table schema.
 * Table-level `readonly` applies to all cells in fill mode.
 */
export function isTableCellInheritedReadonly(fieldId: any, fieldSchemas: any = {}) {
  if (!fieldId) return false;
  const cellRef = parseCellFieldId(fieldId, fieldSchemas);
  if (!cellRef) return false;
  return !!fieldSchemas?.[cellRef.tableFieldId]?.readonly;
}

/**
 * @param {object} [options]
 * @param {string} [options.fieldId] When set with fieldSchemas, table cells also
 *   respect the parent table's `readonly` flag.
 * @param {Record<string, object>} [options.fieldSchemas]
 */
export function isFieldEditableInFillMode(schema: any, options: any = undefined) {
  if (schema) {
    const handler = getFieldHandler(schema.type);
    if (handler && handler.editableInFill === false) return false;
    if (schema.readonly) return false;
  }
  if (
    options?.fieldId &&
    isTableCellInheritedReadonly(options.fieldId, options.fieldSchemas)
  ) {
    return false;
  }
  return true;
}

export function convertSchemaType(schema: any, newType: any, catalogProvider: any = null): SoftSchema | null | undefined {
  if (!schema || schema.type === newType) {
    if (!schema) return schema;
    return schema.name ? { ...schema } : { ...schema, name: schema.label ?? 'Field' };
  }

  const label = schema.label ?? 'New field';
  const next: SoftSchema = createDefaultSchema(newType, label, schema.name ?? label);
  next.required = !!schema.required;
  next.readonly = !!schema.readonly;
  if (schema.displayStyle) next.displayStyle = { ...schema.displayStyle };

  const manualTypes = ['list', 'choice', 'tree'];
  if (manualTypes.includes(schema.type) && manualTypes.includes(newType) && schema.allowManualEdit) {
    next.allowManualEdit = true;
  }

  if (
    (schema.type === 'list' || schema.type === 'choice') &&
    (newType === 'list' || newType === 'choice')
  ) {
    if (schema.listSource === 'remote') {
      next.listSource = 'remote';
      delete next.items;
      delete next.commonListId;
      if (schema.sourceCollection) next.sourceCollection = schema.sourceCollection;
      else delete next.sourceCollection;
      if (schema.sourceLabelField) next.sourceLabelField = schema.sourceLabelField;
      else delete next.sourceLabelField;
      if (schema.sourcePresetId) next.sourcePresetId = schema.sourcePresetId;
      else delete next.sourcePresetId;
      if (schema.withCode != null) next.withCode = schema.withCode;
    } else if (schema.commonListId) {
      next.commonListId = schema.commonListId;
      delete next.items;
    } else {
      next.items = schema.items?.length ? [...schema.items] : next.items;
      if (schema.withCode != null) next.withCode = schema.withCode;
    }
    if (newType === 'list' && schema.itemLayout) next.itemLayout = schema.itemLayout;
    if (newType === 'list' && schema.itemPrefix != null) next.itemPrefix = schema.itemPrefix;
  }

  if (
    newType === 'tree' &&
    (schema.type === 'list' || schema.type === 'choice') &&
    !schema.commonListId &&
    schema.items?.length
  ) {
    next.tree = schema.items.map((item: any, i: any) => ({
      id: item.id ?? `leaf_${i}`,
      label: item.label,
    }));
  }

  if ((newType === 'list' || newType === 'choice') && schema.type === 'tree') {
    delete next.commonListId;
    if (schema.commonTreeId && catalogProvider) {
      next.items = flattenTreeToItems(catalogProvider.resolveSchemaTree(schema));
    } else if (schema.tree?.length) {
      next.items = flattenTreeToItems(schema.tree);
    }
  }

  if (newType === 'text' && schema.type === 'text') {
    next.defaultText = schema.defaultText ?? '';
    if (schema.htmlEditor) next.htmlEditor = true;
    else delete next.htmlEditor;
  }

  if (newType === 'integer' && schema.type === 'integer') {
    next.min = schema.min ?? 0;
    next.max = schema.max ?? 999;
    next.defaultValue = schema.defaultValue ?? '';
    if (schema.suffix != null) next.suffix = schema.suffix;
    next.displayFormat = schema.displayFormat ?? 'plain';
    next.currencyCode = schema.currencyCode ?? 'EUR';
    if (schema.fractionDigits != null && schema.fractionDigits !== '') {
      next.fractionDigits = schema.fractionDigits;
    }
  }

  if (newType === 'choice' && schema.type === 'choice') {
    next.defaultValue = schema.defaultValue ?? '';
  }

  if (newType === 'list' && schema.type === 'list') {
    next.defaultValue = Array.isArray(schema.defaultValue) ? [...schema.defaultValue] : [];
  }

  if (newType === 'date' && schema.type === 'date') {
    next.defaultMode = schema.defaultMode ?? 'today';
    next.defaultDate = schema.defaultDate ?? '';
    next.dateFormat = schema.dateFormat ?? 'dd/mm/yyyy';
    next.customDateFormat = schema.customDateFormat ?? '';
  }

  if (newType === 'tree' && schema.type === 'tree') {
    if (schema.commonTreeId) {
      next.commonTreeId = schema.commonTreeId;
      delete next.tree;
    } else {
      next.tree = schema.tree?.length ? JSON.parse(JSON.stringify(schema.tree)) : next.tree;
    }
    next.defaultValue = Array.isArray(schema.defaultValue) ? [...schema.defaultValue] : [];
  }

  if (newType === 'table' && schema.type === 'table') {
    next.columns = schema.columns ?? next.columns;
    next.rows = schema.rows ?? next.rows;
    next.cellType = schema.cellType ?? next.cellType;
    next.cellItems = schema.cellItems ?? next.cellItems;
    if (schema.hideHeader) next.hideHeader = true;
    if (schema.hideBorders) next.hideBorders = true;
    if (schema.allowAddRows) next.allowAddRows = true;
  }

  if (newType === 'computed' && schema.type === 'computed') {
    next.formula = schema.formula ?? '';
  }

  return next;
}

export function createDefaultSchema( type: any, label: any = 'New field', name: any = label): SoftSchema {
  const handler = getFieldHandler(type);
  if (handler?.createSchema) return handler.createSchema(label, name) as SoftSchema;
  return createBuiltinDefaultSchema(type, label, name);
}

export function createDefaultBlockData( fieldType: any) {
  const handler = getFieldHandler(fieldType);
  if (handler) {
    const fieldId = generateFieldId(fieldType);
    const label = handler.blockLabel ?? handler.label ?? 'Field';
    const value = handler.getEmptyValue?.() ?? '';
    const insertion = handler.insertion ?? 'inline';
    return {
      fieldType,
      fieldId,
      label,
      prefixText: '',
      value,
      cells: insertion === 'table' ? {} : undefined,
    };
  }
  return createBuiltinBlockData(fieldType);
}

export function syncBlocksAfterSchemaChange( blocks: any, fieldId: any, newSchema: any) {
  const defaultValue = resolveSchemaDefaultValue(newSchema, { forTemplate: true });

  return (blocks ?? []).map((block: any) => {
    if (block.type === 'templateBlock' && block.data?.fieldId === fieldId) {
      return {
        ...block,
        data: {
          ...block.data,
          fieldType: newSchema.type,
          label: newSchema.label,
          value:
            newSchema.type === 'child'
              ? {}
              : defaultValue,
          cells: newSchema.type === 'table' ? (block.data.cells ?? {}) : undefined,
        },
      };
    }

    if (block.type === 'documentSection' && block.data?.fieldValues?.[fieldId] !== undefined) {
      return {
        ...block,
        data: {
          ...block.data,
          fieldValues: {
            ...block.data.fieldValues,
            [fieldId]: defaultValue,
          },
        },
      };
    }

    if (block.data?.cells && Object.prototype.hasOwnProperty.call(block.data.cells, fieldId)) {
      return {
        ...block,
        data: {
          ...block.data,
          cells: {
            ...block.data.cells,
            [fieldId]: defaultValue,
          },
        },
      };
    }

    return block;
  });
}

export function cellFieldId( tableFieldId: any, rowKey: any, colKey: any) {
  return `${tableFieldId}_${rowKey}_${colKey}`;
}

/**
 * @param {string} fieldId
 * @param {Record<string, import('../types.d.ts').FieldSchema>} [fieldSchemas]
 * @returns {{ tableFieldId: string, rowKey: string, colKey: string } | null}
 */
export function parseCellFieldId( fieldId: any, fieldSchemas: any = {}) {
  for (const [tableId, schemaRaw] of Object.entries(fieldSchemas ?? {})) {
    const schema = schemaRaw as SoftSchema;
    if (schema?.type !== 'table') continue;
    const prefix = `${tableId}_`;
    if (!fieldId.startsWith(prefix)) continue;
    const rest = fieldId.slice(prefix.length);
    for (const col of (schema.columns as any[]) ?? []) {
      const suffix = `_${col.key}`;
      if (!rest.endsWith(suffix)) continue;
      const rowKey = rest.slice(0, rest.length - suffix.length);
      if (!rowKey) continue;
      return { tableFieldId: tableId, rowKey, colKey: col.key };
    }
  }
  return null;
}

/**
 * @param {string} fieldId
 * @param {Record<string, import('../types.d.ts').FieldSchema>} [fieldSchemas]
 * @returns {boolean}
 */
export function isCellFieldId( fieldId: any, fieldSchemas: any = {}) {
  return parseCellFieldId(fieldId, fieldSchemas) !== null;
}

/** All cell field IDs for one table column (every row). */
export function listColumnCellFieldIds( tableFieldId: any, colKey: any, fieldSchemas: any = {}) {
  const prefix = `${tableFieldId}_`;
  const suffix = `_${colKey}`;
  return Object.keys(fieldSchemas).filter((id) => {
    if (!id.startsWith(prefix) || !id.endsWith(suffix)) return false;
    const rowPart = id.slice(prefix.length, id.length - suffix.length);
    return rowPart.length > 0;
  });
}

/** Copies list/choice option source settings from one table cell to every cell in the same column. */
export function syncColumnListSourceSettings( fieldId: any, updated: any, fieldSchemas: any = {}) {
  const cellRef = parseCellFieldId(fieldId, fieldSchemas);
  if (!cellRef) return fieldSchemas;
  if (updated.type !== 'list' && updated.type !== 'choice') return fieldSchemas;

  const next = { ...fieldSchemas, [fieldId]: updated };
  const columnIds = listColumnCellFieldIds(cellRef.tableFieldId, cellRef.colKey, next);

  for (const id of columnIds) {
    if (id === fieldId) continue;
    const existing = next[id];
    if (!existing || (existing.type !== 'list' && existing.type !== 'choice')) continue;

    const patched = { ...existing };
    if (updated.listSource === 'remote') {
      patched.listSource = 'remote';
      if (updated.sourceCollection) patched.sourceCollection = updated.sourceCollection;
      else delete patched.sourceCollection;
      if (updated.sourceLabelField) patched.sourceLabelField = updated.sourceLabelField;
      else delete patched.sourceLabelField;
      if (updated.sourcePresetId) patched.sourcePresetId = updated.sourcePresetId;
      else delete patched.sourcePresetId;
      if (updated.withCode) patched.withCode = true;
      else delete patched.withCode;
      delete patched.commonListId;
      delete patched.items;
    } else if (updated.commonListId) {
      delete patched.listSource;
      delete patched.sourceCollection;
      delete patched.sourceLabelField;
      delete patched.sourcePresetId;
      patched.commonListId = updated.commonListId;
      delete patched.withCode;
      delete patched.items;
    } else {
      delete patched.listSource;
      delete patched.sourceCollection;
      delete patched.sourceLabelField;
      delete patched.sourcePresetId;
      delete patched.commonListId;
      patched.items = updated.items?.length ? [...updated.items] : (existing.items ?? []);
      if (updated.withCode != null) patched.withCode = updated.withCode;
    }
    next[id] = patched;
  }

  return next;
}

export function findColumnDisplayStyle( tableFieldId: any, colKey: any, fieldSchemas: any) {
  for (const id of listColumnCellFieldIds(tableFieldId, colKey, fieldSchemas)) {
    const style = fieldSchemas[id]?.displayStyle;
    if (style && typeof style === 'object' && Object.keys(style).length > 0) {
      return { ...style };
    }
  }
  return null;
}

function createDefaultCellSchema( tableSchema: any, col: any, tableFieldId: any, fieldSchemas: any): SoftSchema {
  const cellType = tableSchema.cellType ?? 'text';
  const columnLabel = col.label ?? col.name ?? col.key;
  const columnName = col.name ?? col.label ?? col.key;
  const cellSchema: SoftSchema = {
    type: cellType,
    label: columnLabel,
    name: columnName,
    multi: false,
    required: false,
  };
  if (cellType === 'list') {
    cellSchema.multi = true;
  }
  if (cellType === 'choice' || cellType === 'list') {
    if (tableSchema.cellListSource === 'remote') {
      cellSchema.listSource = 'remote';
      if (tableSchema.cellSourceCollection) {
        cellSchema.sourceCollection = tableSchema.cellSourceCollection;
      }
      if (tableSchema.cellSourceLabelField) {
        cellSchema.sourceLabelField = tableSchema.cellSourceLabelField;
      }
    } else if (tableSchema.cellCommonListId) {
      cellSchema.commonListId = tableSchema.cellCommonListId;
    } else {
      cellSchema.items = tableSchema.cellItems ?? [{ id: 'empty', label: '—' }];
    }
  } else if (cellType === 'text') {
    cellSchema.defaultText = '';
  }
  const columnStyle = findColumnDisplayStyle(tableFieldId, col.key, fieldSchemas);
  if (columnStyle) {
    cellSchema.displayStyle = columnStyle;
  }
  return cellSchema;
}

/**
 * Remap Child template / storage ids when cloning a table cell schema to a new row.
 * Prefers longer/prefixed forms so `row1` does not clobber `row10`.
 * @param {string} text
 * @param {string} fromFieldId
 * @param {string} toFieldId
 */
function remapRepeaterIdString( text: any, fromFieldId: any, toFieldId: any) {
  if (typeof text !== 'string' || !fromFieldId || fromFieldId === toFieldId) return text;
  const fromEditor = `_repeater_${fromFieldId}_`;
  const toEditor = `_repeater_${toFieldId}_`;
  let next = text;
  if (next.includes(fromEditor)) next = next.split(fromEditor).join(toEditor);
  const fromExact = `_repeater_${fromFieldId}`;
  const toExact = `_repeater_${toFieldId}`;
  if (next === fromExact || next.startsWith(`${fromExact}_`)) {
    next = toExact + next.slice(fromExact.length);
  }
  const fromKey = `${fromFieldId}_`;
  const toKey = `${toFieldId}_`;
  if (next.includes(fromKey)) next = next.split(fromKey).join(toKey);
  if (next === fromFieldId) next = toFieldId;
  return next;
}

/**
 * Deep-remap string keys/ids that embed the previous Child cell field id.
 * @param {unknown} value
 * @param {string} fromFieldId
 * @param {string} toFieldId
 * @returns {unknown}
 */
function remapRepeaterIdsDeep( value: any, fromFieldId: any, toFieldId: any): unknown {
  if (Array.isArray(value)) {
    return value.map((entry: any) => remapRepeaterIdsDeep(entry, fromFieldId, toFieldId));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const nextKey = remapRepeaterIdString(key, fromFieldId, toFieldId);
      out[nextKey] = remapRepeaterIdsDeep(entry, fromFieldId, toFieldId);
    }
    return out;
  }
  if (typeof value === 'string') {
    return remapRepeaterIdString(value, fromFieldId, toFieldId);
  }
  return value;
}

/**
 * Collapse nested table instance rows in a Child template back to the seed
 * listed on the nested table schema (design template), not the last fill.
 * @param {import('../types.d.ts').FieldSchema} schema
 * @returns {import('../types.d.ts').FieldSchema}
 */
function resetChildTemplateSeedRows( schema: any) {
  if (!schema || schema.type !== 'child' || !schema.template?.blocks?.length) {
    return schema;
  }

  const fieldSchemas = { ...(schema.template.fieldSchemas ?? {}) };
  const blocks = JSON.parse(JSON.stringify(schema.template.blocks));

  for (const block of blocks) {
    if (block.type !== 'documentSection') continue;
    block.data = {
      ...block.data,
      segments: mapSegments(block.data?.segments ?? [], (seg) => {
        if (seg.type !== 'table' || !seg.id) return seg;
        const tableSchema = fieldSchemas[seg.id];
        const seedRows =
          Array.isArray(tableSchema?.rows) && tableSchema.rows.length
            ? tableSchema.rows.map((row: any) => ({
                key: String(row.key),
                label: String(row.label ?? ''),
              }))
            : [...DEFAULT_INLINE_TABLE_ROWS];
        const seedKeys = new Set(seedRows.map((row: any) => row.key));
        const columns = tableSchema?.columns ?? [];
        for (const key of Object.keys(fieldSchemas)) {
          if (!key.startsWith(`${seg.id}_`)) continue;
          let keep = false;
          for (const col of columns) {
            const suffix = `_${col.key}`;
            if (!key.endsWith(suffix)) continue;
            const rowKey = key.slice(seg.id.length + 1, key.length - suffix.length);
            if (seedKeys.has(rowKey)) keep = true;
            break;
          }
          if (!keep) delete fieldSchemas[key];
        }
        return { ...seg, rows: seedRows };
      }),
      fieldValues: {},
    };
  }

  return {
    ...schema,
    template: {
      ...schema.template,
      fieldSchemas,
      blocks,
    },
  };
}

/**
 * @param {import('../types.d.ts').FieldSchema | null | undefined} template
 * @param {string} colLabel
 * @param {{ fromFieldId?: string, toFieldId?: string }} [remap]
 */
function cloneCellSchema( template: any, colLabel: any, remap: any = {}) {
  if (!template) return null;
  let cellSchema = JSON.parse(JSON.stringify(template));
  cellSchema.label = colLabel;

  if (
    remap.fromFieldId &&
    remap.toFieldId &&
    remap.fromFieldId !== remap.toFieldId
  ) {
    if (cellSchema.type === 'computed' && typeof cellSchema.formula === 'string') {
      cellSchema.formula = renameIdInFormula(
        cellSchema.formula,
        remap.fromFieldId,
        remap.toFieldId,
      );
      if (remap.tableFieldId && remap.fromRowKey && remap.toRowKey) {
        const fromRowPrefix = `${remap.tableFieldId}_${remap.fromRowKey}_`;
        const toRowPrefix = `${remap.tableFieldId}_${remap.toRowKey}_`;
        if (fromRowPrefix !== toRowPrefix) {
          cellSchema.formula = cellSchema.formula.split(fromRowPrefix).join(toRowPrefix);
        }
      }
    }

    if (cellSchema.type === 'child') {
      cellSchema = /** @type {import('../types.d.ts').FieldSchema} */ (
        remapRepeaterIdsDeep(cellSchema, remap.fromFieldId, remap.toFieldId)
      );
      cellSchema = resetChildTemplateSeedRows(cellSchema);
      // Flattened storage keys are derived later; clear so normalize rebuilds from seed template.
      if (cellSchema.fieldSchemas) {
        cellSchema.fieldSchemas = {};
      }
    }
  }

  return cellSchema;
}

export function tagTableCellToken( token: any, tableFieldId: any, rowKey: any, colKey: any) {
  if (!token) return;
  token.dataset.tableId = tableFieldId;
  token.dataset.rowKey = rowKey;
  token.dataset.colKey = colKey;
}

export function generateTableRowKey( existingRows: any = []) {
  const used = new Set<string>((existingRows ?? []).map((row: any) => row.key));
  let index = 1;
  while (used.has(`row${index}`)) index += 1;
  return `row${index}`;
}

export function resolveTableInstanceRows( segmentRows: any, tableSchema: any) {
  if (Array.isArray(segmentRows) && segmentRows.length > 0) {
    return segmentRows.map((row: any) => ({
      key: String(row.key),
      label: String(row.label ?? ''),
    }));
  }
  if (tableSchema?.rows?.length) {
    return tableSchema.rows.map((row: any) => ({
      key: row.key,
      label: row.label ?? '',
    }));
  }
  return DEFAULT_INLINE_TABLE_ROWS.map((row) => ({ ...row }));
}

/** Row keys referenced by cell value keys for one table (`{tableId}_{rowKey}_{colKey}`). */
export function extractRowKeysFromTableValues( tableId: any, tableSchema: any, values: any) {
  const columns = [...(tableSchema?.columns ?? [])].sort(
    (a, b) => String(b.key).length - String(a.key).length,
  );
  const prefix = `${tableId}_`;
  const rowKeys = new Set<string>();

  for (const key of Object.keys(values ?? {})) {
    if (!key.startsWith(prefix) || key === tableId) continue;
    const rest = key.slice(prefix.length);
    let matched = false;
    for (const col of columns) {
      const suffix = `_${col.key}`;
      if (!rest.endsWith(suffix)) continue;
      const rowKey = rest.slice(0, rest.length - suffix.length);
      if (rowKey) rowKeys.add(rowKey);
      matched = true;
      break;
    }
    // Fallback: payload keys that were not projected onto schema columns
    // (e.g. `table_1_row2_name` while the column key is still `column_1`).
    if (!matched) {
      const rowMatch = rest.match(/^(row\d+)(?:_|$)/i);
      if (rowMatch?.[1]) rowKeys.add(rowMatch[1]);
    }
  }

  return rowKeys;
}

/** Keep existing row order; append newly discovered row keys (sorted). */
export function mergeTableInstanceRows( existingRows: any, discoveredRowKeys: any, tableSchema: any) {
  const existing = resolveTableInstanceRows(existingRows, tableSchema);
  const byKey = new Map(existing.map((row: any) => [row.key, row]));
  const existingKeys = existing.map((row: any) => row.key);

  const newKeys = [...(discoveredRowKeys ?? [])]
    .filter((key: any) => !byKey.has(key))
    .sort((a: any, b: any) => a.localeCompare(b, undefined, { numeric: true }));

  for (const key of newKeys) {
    byKey.set(key, { key, label: '' });
  }

  return [...existingKeys, ...newKeys].map((key: any) => byKey.get(key));
}

export function ensureCellSchemas( tableSchema: any, tableFieldId: any, fieldSchemas: any, rows: any) {
  const effectiveRows =
    rows ??
    (tableSchema?.rows?.length ? tableSchema.rows : DEFAULT_INLINE_TABLE_ROWS);
  return ensureCellSchemasForRows(
    tableSchema,
    tableFieldId,
    fieldSchemas,
    effectiveRows,
  );
}

export function ensureCellSchemasForRows( tableSchema: any, tableFieldId: any, fieldSchemas: any, rows: any) {
  const next = { ...fieldSchemas };
  const rowList = rows ?? [];

  for (let rowIndex = 0; rowIndex < rowList.length; rowIndex += 1) {
    const row = rowList[rowIndex];
    const templateRow = rowIndex > 0 ? rowList[rowIndex - 1] : null;

    for (const col of tableSchema?.columns ?? []) {
      const id = cellFieldId(tableFieldId, row.key, col.key);
      if (!next[id]) {
        let cellSchema = null;
        if (templateRow) {
          const templateId = cellFieldId(tableFieldId, templateRow.key, col.key);
          cellSchema = cloneCellSchema(next[templateId], col.label, {
            fromFieldId: templateId,
            toFieldId: id,
            tableFieldId,
            fromRowKey: templateRow.key,
            toRowKey: row.key,
          });
        }
        next[id] = cellSchema ?? createDefaultCellSchema(tableSchema, col, tableFieldId, next);
      }
    }
  }
  return next;
}

/**
 * Ensure a (possibly missing) table-cell schema exists so the properties panel
 * can open for a selected cell/column.
 *
 * @param {string} fieldId
 * @param {Record<string, import('../types.d.ts').FieldSchema>} fieldSchemas
 * @param {{ tableId?: string, rowKey?: string, colKey?: string, rows?: Array<{ key: string, label?: string }> }} [hint]
 * @returns {{ fieldSchemas: Record<string, import('../types.d.ts').FieldSchema>, schema: import('../types.d.ts').FieldSchema | null }}
 */
export function ensureSchemaForFieldProperties( fieldId: any, fieldSchemas: any = {}, hint: any = {}) {
  if (fieldSchemas[fieldId]) {
    return { fieldSchemas, schema: fieldSchemas[fieldId] };
  }

  const { tableId, rowKey, colKey, rows } = hint;
  const cellRef =
    tableId && rowKey && colKey
      ? { tableFieldId: tableId, rowKey, colKey }
      : parseCellFieldId(fieldId, fieldSchemas);
  if (!cellRef) return { fieldSchemas, schema: null };

  const tableSchema = fieldSchemas[cellRef.tableFieldId];
  if (!tableSchema || tableSchema.type !== 'table') {
    return { fieldSchemas, schema: null };
  }

  const rowList = [...(rows ?? tableSchema.rows ?? [])];
  if (!rowList.some((row) => row.key === cellRef.rowKey)) {
    rowList.push({ key: cellRef.rowKey, label: '' });
  }

  const merged = ensureCellSchemasForRows(
    tableSchema,
    cellRef.tableFieldId,
    fieldSchemas,
    rowList,
  );
  return { fieldSchemas: merged, schema: merged[fieldId] ?? null };
}

export function removeTableRowCellData( tableFieldId: any, rowKey: any, fieldValues: any, fieldSchemas: any) {
  const tableSchema = fieldSchemas?.[tableFieldId];
  const nextValues = { ...fieldValues };
  const nextSchemas = { ...fieldSchemas };
  for (const col of tableSchema?.columns ?? []) {
    const id = cellFieldId(tableFieldId, rowKey, col.key);
    delete nextValues[id];
    delete nextSchemas[id];
  }
  return { fieldValues: nextValues, fieldSchemas: nextSchemas };
}

/** Drop cell values and schemas for table rows that are no longer active. */
export function pruneTableCellDataForRows( tableFieldId: any, activeRowKeys: any, fieldValues: any, fieldSchemas: any) {
  const active = new Set(activeRowKeys ?? []);
  const nextValues = { ...(fieldValues ?? {}) };
  const nextSchemas = { ...(fieldSchemas ?? {}) };

  for (const id of Object.keys(nextSchemas)) {
    const ref = parseCellFieldId(id, nextSchemas);
    if (!ref || ref.tableFieldId !== tableFieldId) continue;
    if (active.has(ref.rowKey)) continue;
    delete nextValues[id];
    delete nextSchemas[id];
  }

  return { fieldValues: nextValues, fieldSchemas: nextSchemas };
}

export function buildRepeaterInstancesFromLabels( labels: any, previousInstances: any = []) {
  const usedKeys = new Set<string>();
  const instances: Array<{ key: string; label: string }> = [];

  for (let i = 0; i < labels.length; i += 1) {
    const label = String(labels[i] ?? '').trim();
    if (!label) continue;

    const prev = previousInstances[i];
    let key;
    if (prev && prev.label === label && prev.key) {
      key = prev.key;
    } else {
      key = labelToFieldKey(label, usedKeys);
    }
    if (usedKeys.has(key)) {
      key = labelToFieldKey(label, usedKeys);
    }
    usedKeys.add(key);
    instances.push({ key, label });
  }

  return instances;
}
