/**
 * Pure pivot / cross-tab expansion from a row array.
 * Used by field mapping when the target schema type is `pivotTable`.
 */

export type PivotAggregation = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'first';
export type PivotSort = 'asc' | 'desc' | 'none';

export interface PivotTableSchemaLike {
  rowProperty?: string;
  columnProperty?: string;
  valueProperty?: string;
  aggregation?: PivotAggregation | string;
  showRowTotals?: boolean;
  showColumnTotals?: boolean;
  showGrandTotal?: boolean;
  emptyCell?: string;
  sortRows?: PivotSort | string;
  sortColumns?: PivotSort | string;
}

export interface PivotColumn {
  key: string;
  label: string;
}

export interface PivotRow {
  key: string;
  label: string;
  cells: Record<string, number | string | null>;
  rowTotal?: number | string | null;
}

export interface PivotTableValue {
  columns: PivotColumn[];
  rows: PivotRow[];
  columnTotals?: Record<string, number | string | null>;
  grandTotal?: number | string | null;
}

function getByPath(obj: unknown, path: string): unknown {
  const trimmed = String(path ?? '').trim();
  if (!trimmed) return undefined;
  if (!trimmed.includes('.')) {
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
    return (obj as Record<string, unknown>)[trimmed];
  }
  let cur: unknown = obj;
  for (const part of trimmed.split('.')) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function labelKey(label: string): string {
  const base = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base || !/^[a-zA-Z_]/.test(base)) {
    return /^[0-9]/.test(base) ? `_${base || 'col'}` : base || 'col';
  }
  return base;
}

function uniqueKey(label: string, used: Set<string>): string {
  let key = labelKey(label) || 'col';
  if (!/^[a-zA-Z_]/.test(key)) key = `_${key}`;
  let out = key;
  let i = 2;
  while (used.has(out)) {
    out = `${key}_${i}`;
    i += 1;
  }
  used.add(out);
  return out;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeAgg(raw: unknown): PivotAggregation {
  const v = String(raw ?? 'sum').toLowerCase();
  if (
    v === 'sum' ||
    v === 'count' ||
    v === 'avg' ||
    v === 'min' ||
    v === 'max' ||
    v === 'first'
  ) {
    return v;
  }
  return 'sum';
}

function normalizeSort(raw: unknown): PivotSort {
  const v = String(raw ?? 'asc').toLowerCase();
  if (v === 'asc' || v === 'desc' || v === 'none') return v;
  return 'asc';
}

function sortLabels(labels: string[], sort: PivotSort): string[] {
  if (sort === 'none') return labels;
  const copy = [...labels];
  copy.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  if (sort === 'desc') copy.reverse();
  return copy;
}

type Bucket = { values: unknown[]; first: unknown };

function finalizeBucket(bucket: Bucket | undefined, aggregation: PivotAggregation): number | string | null {
  if (!bucket || bucket.values.length === 0) return null;
  if (aggregation === 'count') return bucket.values.length;
  if (aggregation === 'first') {
    const first = bucket.first;
    if (first == null) return null;
    if (typeof first === 'number' || typeof first === 'string') return first;
    return String(first);
  }

  const nums = bucket.values.map(toNumber).filter((n): n is number => n != null);
  if (!nums.length) return null;
  if (aggregation === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (aggregation === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (aggregation === 'min') return Math.min(...nums);
  if (aggregation === 'max') return Math.max(...nums);
  return null;
}

function sumNumeric(cells: Array<number | string | null | undefined>): number | null {
  let total = 0;
  let any = false;
  for (const v of cells) {
    const n = toNumber(v);
    if (n == null) continue;
    total += n;
    any = true;
  }
  return any ? total : null;
}

/**
 * Expand a source row array into a pivot matrix value.
 */
export function pivotExpand(
  sourceRows: unknown,
  schema: PivotTableSchemaLike | null | undefined,
): PivotTableValue {
  const rowsIn = Array.isArray(sourceRows) ? sourceRows : [];
  const aggregation = normalizeAgg(schema?.aggregation);
  const sortRows = normalizeSort(schema?.sortRows ?? 'asc');
  const sortColumns = normalizeSort(schema?.sortColumns ?? 'asc');
  const rowProp = String(schema?.rowProperty ?? '').trim();
  const colProp = String(schema?.columnProperty ?? '').trim();
  const valueProp = String(schema?.valueProperty ?? '').trim();
  const emptyCell = schema?.emptyCell != null ? String(schema.emptyCell) : '';

  const matrix = new Map<string, Map<string, Bucket>>();
  const rowLabels = new Set<string>();
  const colLabels = new Set<string>();

  for (const raw of rowsIn) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const rowLabel = String(getByPath(raw, rowProp) ?? '').trim() || '(blank)';
    const colLabel = String(getByPath(raw, colProp) ?? '').trim() || '(blank)';
    const value = aggregation === 'count' ? 1 : getByPath(raw, valueProp);

    rowLabels.add(rowLabel);
    colLabels.add(colLabel);

    if (!matrix.has(rowLabel)) matrix.set(rowLabel, new Map());
    const rowMap = matrix.get(rowLabel)!;
    if (!rowMap.has(colLabel)) {
      rowMap.set(colLabel, { values: [], first: value });
    }
    rowMap.get(colLabel)!.values.push(value);
  }

  const orderedCols = sortLabels([...colLabels], sortColumns);
  const orderedRows = sortLabels([...rowLabels], sortRows);
  const usedKeys = new Set<string>();
  const columns: PivotColumn[] = orderedCols.map((label) => ({
    key: uniqueKey(label, usedKeys),
    label,
  }));

  const resultRows: PivotRow[] = orderedRows.map((rowLabel) => {
    const cells: Record<string, number | string | null> = {};
    for (const col of columns) {
      const bucket = matrix.get(rowLabel)?.get(col.label);
      const cell = finalizeBucket(bucket, aggregation);
      cells[col.key] = cell == null ? (emptyCell === '' ? null : emptyCell) : cell;
    }
    const row: PivotRow = {
      key: uniqueKey(rowLabel, new Set()),
      label: rowLabel,
      cells,
    };
    if (schema?.showRowTotals) {
      row.rowTotal = sumNumeric(Object.values(cells));
    }
    return row;
  });

  // Stabilize row keys with a dedicated used set (avoid collision with column keys).
  const rowKeys = new Set<string>();
  for (const row of resultRows) {
    row.key = uniqueKey(row.label, rowKeys);
  }

  const result: PivotTableValue = { columns, rows: resultRows };

  if (resultRows.length && (schema?.showColumnTotals || schema?.showGrandTotal)) {
    const columnTotals: Record<string, number | string | null> = {};
    for (const col of columns) {
      columnTotals[col.key] = sumNumeric(resultRows.map((r) => r.cells[col.key]));
    }
    if (schema?.showColumnTotals) result.columnTotals = columnTotals;
    if (schema?.showGrandTotal) {
      result.grandTotal = sumNumeric(Object.values(columnTotals));
    }
  }

  return result;
}

export function isPivotTableValue(value: unknown): value is PivotTableValue {
  return !!(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as PivotTableValue).columns) &&
    Array.isArray((value as PivotTableValue).rows)
  );
}

export function createEmptyPivotValue(): PivotTableValue {
  return { columns: [], rows: [] };
}
