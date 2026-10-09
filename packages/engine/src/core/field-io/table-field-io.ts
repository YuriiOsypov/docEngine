import {
  cellFieldId,
  generateTableRowKey,
  resolveTableInstanceRows,
  extractRowKeysFromTableValues,
  mergeTableInstanceRows,
} from '../field-schemas.js';
import { isFieldEmpty, isTableCellDisplayPlaceholder } from '../../utils/field-values.js';
import type { EditorBlock, FieldSchema, TableRowInstance } from '../../types.js';

type FieldSchemaMap = Record<string, FieldSchema>;
type ValueMap = Record<string, unknown>;
type TableRow = Record<string, unknown>;

type TableColumn = {
  key: string;
  label?: string;
  [key: string]: unknown;
};

type TableSchema = FieldSchema & {
  type: 'table';
  columns?: TableColumn[];
  rows?: TableRowInstance[];
};

export type TableInstanceRef = {
  tableId: string;
  rows?: TableRowInstance[];
};

export function isTableRowArray(value: unknown): value is TableRow[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (row) => row != null && typeof row === 'object' && !Array.isArray(row),
  );
}

/**
 * Match a table column to a source-row property (exact key, then case-insensitive
 * key, then case-insensitive label). Used when a whole array is mapped onto a
 * table whose column keys differ from the payload keys (e.g. column_1 ← name).
 */
function matchSourcePropertyForColumn(
  sourceKeys: string[],
  column: TableColumn,
  used: Set<string>,
): string | null {
  const available = sourceKeys.filter((key) => !used.has(key));
  if (!available.length) return null;

  if (available.includes(column.key)) return column.key;

  const keyLower = String(column.key ?? '').toLowerCase();
  const byKey = available.find((key) => key.toLowerCase() === keyLower);
  if (byKey) return byKey;

  const label = String(column.label ?? '').trim();
  if (label) {
    const labelLower = label.toLowerCase();
    const byLabel = available.find((key) => key.toLowerCase() === labelLower);
    if (byLabel) return byLabel;
  }

  return null;
}

/**
 * Remap raw payload row objects onto table column keys when keys differ.
 * No-op when rows already use the schema column keys (or schema has no columns).
 */
export function projectTableRowsOntoColumns(
  rows: unknown,
  tableSchema: TableSchema | null | undefined,
): TableRow[] {
  if (!isTableRowArray(rows)) return [];
  const columns = tableSchema?.columns ?? [];
  if (!columns.length) return rows.map((row) => ({ ...row }));

  const sample =
    rows.find((row) => row && typeof row === 'object' && Object.keys(row).length > 0) ?? {};
  const sourceKeys = Object.keys(sample);
  if (!sourceKeys.length) return rows.map((row) => ({ ...row }));

  // Already aligned with schema — keep as-is (preserves extra keys).
  if (columns.every((col) => sourceKeys.includes(col.key))) {
    return rows.map((row) => ({ ...row }));
  }

  const keyMap = new Map<string, string>();
  const used = new Set<string>();
  for (const col of columns) {
    const sourceKey = matchSourcePropertyForColumn(sourceKeys, col, used);
    if (sourceKey) {
      keyMap.set(col.key, sourceKey);
      used.add(sourceKey);
    }
  }

  // Single-column table with no label/key match: take the first unused source key.
  if (columns.length === 1 && !keyMap.has(columns[0].key)) {
    const fallback = sourceKeys.find((key) => !used.has(key));
    if (fallback) keyMap.set(columns[0].key, fallback);
  }

  if (!keyMap.size) return rows.map((row) => ({ ...row }));

  return rows.map((row) => {
    const next: TableRow = {};
    for (const [colKey, sourceKey] of keyMap) {
      if (Object.prototype.hasOwnProperty.call(row, sourceKey)) {
        next[colKey] = row[sourceKey];
      }
    }
    return next;
  });
}

export function collectTableInstancesInBlocks(
  blocks: EditorBlock[] | null | undefined,
  fieldSchemas: FieldSchemaMap = {},
): TableInstanceRef[] {
  const instances: TableInstanceRef[] = [];
  const seen = new Set<string>();

  for (const block of blocks ?? []) {
    const data = block.data ?? {};

    if (block.type === 'documentSection') {
      for (const seg of data.segments ?? []) {
        if (seg.type !== 'table' || !seg.id || seen.has(seg.id)) continue;
        seen.add(seg.id);
        const tableSchema = fieldSchemas[seg.id] as TableSchema | undefined;
        instances.push({
          tableId: seg.id,
          rows: resolveTableInstanceRows(seg.rows, tableSchema),
        });
      }
    }

    const isTableBlock =
      block.type === 'visionTable' ||
      (block.type === 'templateBlock' && data.fieldType === 'table');

    if (isTableBlock) {
      const tableId =
        data.fieldId ?? (block.type === 'visionTable' ? 'visionTable' : null);
      if (!tableId || seen.has(tableId)) continue;
      seen.add(tableId);
      const tableSchema = fieldSchemas[tableId] as TableSchema | undefined;
      instances.push({
        tableId,
        rows: resolveTableInstanceRows(undefined, tableSchema),
      });
    }
  }

  return instances;
}

export function assignRowKeysForImport(
  tableSchema: TableSchema | null | undefined,
  rowCount: number,
): string[] {
  const schemaRows = tableSchema?.rows ?? [];
  const keys: string[] = [];
  const used = new Set<string>();

  for (let index = 0; index < rowCount; index += 1) {
    const schemaKey = schemaRows[index]?.key;
    if (schemaKey && !used.has(schemaKey)) {
      keys.push(schemaKey);
      used.add(schemaKey);
      continue;
    }

    const generated = generateTableRowKey([...used].map((key) => ({ key })));
    keys.push(generated);
    used.add(generated);
  }

  return keys;
}

export function tableRowsToFlatValues(
  tableId: string,
  rows: TableRow[],
  tableSchema: TableSchema,
  rowKeys?: string[],
): ValueMap {
  const effectiveRowKeys =
    rowKeys ?? assignRowKeysForImport(tableSchema, rows.length);
  const flat: ValueMap = {};

  for (let index = 0; index < rows.length; index += 1) {
    const rowKey = effectiveRowKeys[index];
    const row = rows[index] ?? {};

    for (const [colKey, value] of Object.entries(row)) {
      if (!colKey) continue;
      flat[cellFieldId(tableId, rowKey, colKey)] = value;
    }
  }

  return flat;
}

export function flatValuesToTableRows(
  tableId: string,
  flatValues: ValueMap,
  tableSchema: TableSchema,
  instanceRows?: TableRowInstance[],
): TableRow[] {
  const discovered = extractRowKeysFromTableValues(tableId, tableSchema, flatValues) as Set<string>;
  const orderedRows = mergeTableInstanceRows(instanceRows, discovered, tableSchema) as TableRowInstance[];
  const columnKeys = new Set((tableSchema?.columns ?? []).map((col) => col.key));

  return orderedRows.map((row) => {
    const rowObj: TableRow = {};

    for (const colKey of columnKeys) {
      const cellId = cellFieldId(tableId, row.key, colKey);
      const value = flatValues[cellId];
      if (!isFieldEmpty(value)) {
        rowObj[colKey] = value;
      }
    }

    for (const key of Object.keys(flatValues)) {
      const prefix = `${tableId}_${row.key}_`;
      if (!key.startsWith(prefix)) continue;
      const colKey = key.slice(prefix.length);
      if (!colKey || columnKeys.has(colKey)) continue;
      const value = flatValues[key];
      if (!isFieldEmpty(value)) {
        rowObj[colKey] = value;
      }
    }

    return rowObj;
  });
}

export function clearTableFlatKeysInRecord(
  tableId: string,
  values: ValueMap,
  tableSchema?: TableSchema | null,
): void {
  stripFlatKeysForTable(tableId, values, tableSchema);
  delete values[tableId];
}

/**
 * Rows with at least one non-empty cell, ignoring column-label placeholder values.
 * Matches preview and PDF table row visibility.
 */
export function filterTableRowsWithContent(
  rows: TableRow[] | null | undefined,
  tableSchema?: TableSchema | null,
): TableRow[] {
  const columns = tableSchema?.columns ?? [];
  if (!columns.length) {
    return (rows ?? []).filter((row) =>
      Object.values(row ?? {}).some((value) => value != null && value !== ''),
    );
  }

  return (rows ?? []).filter((row) =>
    columns.some((col) => {
      const value = row?.[col.key];
      if (isTableCellDisplayPlaceholder(value, col.label)) return false;
      return !isFieldEmpty(value);
    }),
  );
}

export function expandedValuesIncludeTable(
  tableId: string,
  expandedValues: ValueMap | null | undefined,
): boolean {
  if (isTableRowArray(expandedValues?.[tableId])) return true;
  const prefix = `${tableId}_`;
  return Object.keys(expandedValues ?? {}).some((key) => key.startsWith(prefix));
}

function stripFlatKeysForTable(
  tableId: string,
  values: ValueMap,
  tableSchema?: TableSchema | null,
): void {
  const prefix = `${tableId}_`;
  const columns = [...(tableSchema?.columns ?? [])].sort(
    (a, b) => String(b.key).length - String(a.key).length,
  );

  for (const key of Object.keys(values)) {
    if (key === tableId || !key.startsWith(prefix)) continue;

    if (!columns.length) {
      delete values[key];
      continue;
    }

    for (const col of columns) {
      const suffix = `_${col.key}`;
      if (key.endsWith(suffix)) {
        delete values[key];
        break;
      }
    }
  }
}

export function expandTableArraysInValues(
  values: ValueMap | null | undefined,
  fieldSchemas: FieldSchemaMap = {},
): ValueMap {
  const next: ValueMap = { ...(values ?? {}) };

  for (const [fieldId, schema] of Object.entries(fieldSchemas)) {
    if (schema?.type !== 'table') continue;
    if (!isTableRowArray(next[fieldId])) continue;

    const tableSchema = schema as TableSchema;
    // Always project payload keys onto column keys before flattening so
    // `$values` arrays ({ name }) bind to columns like column_1 / "Name".
    const rows = projectTableRowsOntoColumns(next[fieldId], tableSchema);
    stripFlatKeysForTable(fieldId, next, tableSchema);
    delete next[fieldId];

    Object.assign(next, tableRowsToFlatValues(fieldId, rows, tableSchema));
  }

  return next;
}

export function collapseTablesInValues(
  values: ValueMap | null | undefined,
  fieldSchemas: FieldSchemaMap = {},
  blocks: EditorBlock[] = [],
): ValueMap {
  const next: ValueMap = { ...(values ?? {}) };
  const instances = collectTableInstancesInBlocks(blocks, fieldSchemas);

  for (const { tableId, rows } of instances) {
    const tableSchema = fieldSchemas[tableId] as TableSchema | undefined;
    if (tableSchema?.type !== 'table') continue;

    const tableRows = flatValuesToTableRows(tableId, next, tableSchema, rows);
    stripFlatKeysForTable(tableId, next, tableSchema);
    next[tableId] = tableRows;
  }

  return next;
}

/**
 * Clone a visionTable or templateBlock table so only one row is filled.
 */
export function cloneTableBlockForRow(
  block: EditorBlock,
  tableId: string,
  rowData: TableRow,
  rowIndex: number,
  fieldSchemas: FieldSchemaMap,
): EditorBlock {
  const tableSchema = fieldSchemas[tableId] as TableSchema | undefined;
  if (!tableSchema || tableSchema.type !== 'table') {
    return block;
  }

  const schemaRows = tableSchema.rows ?? [];
  const rowKey = schemaRows[rowIndex]?.key ?? schemaRows[0]?.key;
  if (!rowKey) return block;

  const cells: ValueMap = {};
  for (const col of tableSchema.columns ?? []) {
    const cellId = cellFieldId(tableId, rowKey, col.key);
    const value = rowData[col.key];
    if (!isFieldEmpty(value)) {
      cells[cellId] = value;
    }
  }

  return {
    ...block,
    data: {
      ...block.data,
      fieldId: tableId,
      cells,
    },
  };
}
