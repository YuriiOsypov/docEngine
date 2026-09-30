/**
 * Read-only pivot / cross-tab table DOM (design placeholder + filled matrix).
 */
import { isPivotTableValue, createEmptyPivotValue, formatNumericDisplay } from '@docengine/engine';
import { createDragHandle } from '../ui/drag-handle.js';

/** Default first-column width (row labels). Wider than vision-table's 3em row index. */
export const PIVOT_ROW_LABEL_DEFAULT_WIDTH = '8em';
const MIN_ROW_LABEL_WIDTH_PX = 48;

function escapeText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveValueAlign(schema: Record<string, any> = {}): 'left' | 'center' | 'right' {
  const align = schema.valueAlign;
  if (align === 'left' || align === 'center' || align === 'right') return align;
  return 'right';
}

function formatCell(value: unknown, emptyCell = '', schema: Record<string, any> = {}): string {
  if (value == null || value === '') return emptyCell;
  const formatted = formatNumericDisplay(value, {
    displayFormat: schema.displayFormat,
    currencyCode: schema.currencyCode,
    fractionDigits: schema.fractionDigits,
    suffix: schema.suffix,
  });
  if (formatted !== '') return formatted;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  return String(value);
}

function applyValueAlign(el: HTMLElement, align: 'left' | 'center' | 'right') {
  el.style.textAlign = align;
}

function resolveRowLabelWidth(schema: Record<string, any> = {}): string {
  const raw = String(schema.rowLabelWidth ?? '').trim();
  if (!raw) return PIVOT_ROW_LABEL_DEFAULT_WIDTH;
  if (/^\d+(\.\d+)?(px|em|%)$/i.test(raw)) return raw;
  const asNum = Number.parseFloat(raw);
  if (Number.isFinite(asNum) && asNum > 0) return `${asNum}px`;
  return PIVOT_ROW_LABEL_DEFAULT_WIDTH;
}

function applyRowLabelWidth(table: HTMLTableElement, width: string) {
  table.style.setProperty('--pivot-row-label-width', width);
  const col = table.querySelector(
    ':scope > colgroup > .vision-table__row-label-col',
  ) as HTMLElement | null;
  if (col) {
    col.style.width = width;
    col.style.minWidth = width;
    col.setAttribute('width', width);
  }
  table.querySelectorAll(
    ':scope > thead th.vision-table__row-label-head, :scope > tbody th.vision-table__row-label',
  ).forEach((el: Element) => {
    const cell = el as HTMLElement;
    cell.style.width = width;
    cell.style.minWidth = width;
  });
}

const SAMPLE_PIVOT = {
  columns: [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
  ],
  rows: [
    { key: 'r1', label: 'Row 1', cells: { a: 10, b: 5 }, rowTotal: 15 },
    { key: 'r2', label: 'Row 2', cells: { a: 7, b: null }, rowTotal: 7 },
  ],
  columnTotals: { a: 17, b: 5 },
  grandTotal: 22,
};

function appendRowLabelResizer(th: HTMLElement) {
  const handle = document.createElement('span');
  handle.className = 'vision-table__col-resizer pivot-table__row-label-resizer';
  handle.dataset.pivotRowLabel = 'true';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize row label column');
  handle.title = 'Drag to resize row labels';
  th.appendChild(handle);
}

/**
 * Build a vision-table HTML element for a pivot value (PDF-compatible classes).
 */
export function buildPivotTableElement(
  fieldId: string,
  value: unknown,
  schema: Record<string, any> = {},
  options: { designMode?: boolean; previewMode?: boolean } = {},
): HTMLTableElement {
  const emptyCell = schema.emptyCell != null ? String(schema.emptyCell) : '';
  let pivot = isPivotTableValue(value) ? value : createEmptyPivotValue();
  const isEmpty = !pivot.rows?.length;

  if (isEmpty && options.designMode) {
    pivot = SAMPLE_PIVOT as any;
  }

  const showRowTotals = !!schema.showRowTotals;
  const showColumnTotals = !!schema.showColumnTotals;
  const showGrandTotal = !!schema.showGrandTotal;
  const columns = pivot.columns ?? [];
  const rowLabelWidth = resolveRowLabelWidth(schema);
  const valueAlign = resolveValueAlign(schema);

  const table = document.createElement('table');
  table.className = 'vision-table document-table__grid pivot-table';
  table.dataset.tableId = fieldId;
  table.dataset.pivotFieldId = fieldId;
  table.style.width = '100%';
  table.style.tableLayout = 'fixed';
  if (schema.hideBorders) table.classList.add('vision-table--borderless');

  const colgroup = document.createElement('colgroup');
  const labelCol = document.createElement('col');
  labelCol.className = 'vision-table__row-label-col';
  colgroup.appendChild(labelCol);
  for (let i = 0; i < columns.length; i += 1) {
    colgroup.appendChild(document.createElement('col'));
  }
  if (showRowTotals) colgroup.appendChild(document.createElement('col'));
  table.appendChild(colgroup);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'vision-table__row-label-head';
  // Keep corner empty — long labels crush into a 3em column and wrap vertically.
  corner.setAttribute('aria-label', schema.label || 'Row labels');
  if (options.designMode) appendRowLabelResizer(corner);
  headRow.appendChild(corner);
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col.label;
    headRow.appendChild(th);
  }
  if (showRowTotals) {
    const th = document.createElement('th');
    th.textContent = 'Total';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of pivot.rows ?? []) {
    const tr = document.createElement('tr');
    const labelTd = document.createElement('th');
    labelTd.scope = 'row';
    labelTd.className = 'vision-table__row-label';
    labelTd.textContent = row.label;
    tr.appendChild(labelTd);
    for (const col of columns) {
      const td = document.createElement('td');
      td.textContent = formatCell(row.cells?.[col.key], emptyCell, schema);
      applyValueAlign(td, valueAlign);
      tr.appendChild(td);
    }
    if (showRowTotals) {
      const td = document.createElement('td');
      td.className = 'pivot-table__total';
      td.textContent = formatCell(row.rowTotal, emptyCell, schema);
      applyValueAlign(td, valueAlign);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  if (showColumnTotals || showGrandTotal) {
    const tr = document.createElement('tr');
    tr.className = 'pivot-table__totals-row';
    const labelTd = document.createElement('th');
    labelTd.scope = 'row';
    labelTd.className = 'vision-table__row-label';
    labelTd.textContent = 'Total';
    tr.appendChild(labelTd);
    for (const col of columns) {
      const td = document.createElement('td');
      td.className = 'pivot-table__total';
      td.textContent = showColumnTotals
        ? formatCell(pivot.columnTotals?.[col.key], emptyCell, schema)
        : emptyCell;
      applyValueAlign(td, valueAlign);
      tr.appendChild(td);
    }
    if (showRowTotals) {
      const td = document.createElement('td');
      td.className = 'pivot-table__total pivot-table__grand-total';
      td.textContent = showGrandTotal ? formatCell(pivot.grandTotal, emptyCell, schema) : emptyCell;
      applyValueAlign(td, valueAlign);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  if (isEmpty && !options.designMode) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 1 + columns.length + (showRowTotals ? 1 : 0);
    td.className = 'pivot-table__empty';
    td.textContent = options.previewMode ? '' : 'No pivot data — map a source array.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  applyRowLabelWidth(table, rowLabelWidth);
  return table;
}

/**
 * Drag splitter on the pivot row-label column (design mode).
 * Persists `schema.rowLabelWidth` as px.
 */
export function wirePivotRowLabelResize(tableEl: HTMLElement | null | undefined, options: any = {}) {
  if (!tableEl?.querySelector) return;
  if ((tableEl as HTMLElement).dataset.pivotRowLabelResizeWired === 'true') return;

  const handle = tableEl.querySelector(
    '.pivot-table__row-label-resizer, .vision-table__col-resizer[data-pivot-row-label="true"]',
  ) as HTMLElement | null;
  if (!handle) return;

  (tableEl as HTMLElement).dataset.pivotRowLabelResizeWired = 'true';

  handle.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button != null && event.button !== 0) return;
    if (event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    const startX = Number(event.clientX) || 0;
    const corner = tableEl.querySelector(
      ':scope > thead th.vision-table__row-label-head',
    ) as HTMLElement | null;
    const startWidth =
      corner?.getBoundingClientRect?.()?.width ||
      Number.parseFloat(String(getComputedStyle(tableEl).getPropertyValue('--pivot-row-label-width'))) ||
      96;
    let liveWidth = startWidth;
    let didDrag = false;

    handle.classList.add('vision-table__col-resizer--active');
    tableEl.classList.add('vision-table--resizing');
    document.body.classList.add('vision-table-col-resize-active');
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // ignore
    }

    const tableId =
      options.tableId ??
      (tableEl as HTMLElement).dataset?.tableId ??
      (tableEl as HTMLElement).dataset?.pivotFieldId ??
      tableEl.closest?.('.document-table')?.getAttribute?.('data-table-id');

    options.onTableColumnResizeStart?.(tableId);

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      const clientX = Number(moveEvent.clientX) || 0;
      if (Math.abs(clientX - startX) > 2) didDrag = true;
      liveWidth = Math.max(MIN_ROW_LABEL_WIDTH_PX, Math.round(startWidth + (clientX - startX)));
      applyRowLabelWidth(tableEl as HTMLTableElement, `${liveWidth}px`);
    }

    function suppressNextClick() {
      const suppress = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('click', suppress, true);
      };
      document.addEventListener('click', suppress, true);
      setTimeout(() => document.removeEventListener('click', suppress, true), 0);
    }

    function onUp(upEvent: PointerEvent) {
      if (upEvent.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      handle.classList.remove('vision-table__col-resizer--active');
      tableEl.classList.remove('vision-table--resizing');
      document.body.classList.remove('vision-table-col-resize-active');
      try {
        if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }

      upEvent?.preventDefault?.();
      upEvent?.stopPropagation?.();
      if (!didDrag || !tableId) return;
      suppressNextClick();

      const widthCss = `${liveWidth}px`;
      applyRowLabelWidth(tableEl as HTMLTableElement, widthCss);

      const registry = options.getRegistry?.();
      const schemas = registry?.getFieldSchemas?.() ?? {};
      const schema = schemas[tableId];
      if (!schema || schema.type !== 'pivotTable') return;

      registry.updateFieldSchema?.(tableId, { ...schema, rowLabelWidth: widthCss });
      options.onSchemaChange?.(registry.getFieldSchemas?.() ?? schemas);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}

export function renderPivotTableSegment(
  seg: { id: string; type?: string },
  fieldValues: Record<string, unknown> = {},
  options: Record<string, any> = {},
): HTMLElement {
  const fieldId = seg.id;
  const schema =
    options.fieldSchemas?.[fieldId] ??
    options.getRegistry?.()?.getFieldSchemas?.()?.[fieldId] ??
    {};
  const value = fieldValues?.[fieldId];

  const wrapper = document.createElement('div');
  wrapper.className = 'document-table document-table--pivot';
  wrapper.contentEditable = 'false';
  wrapper.dataset.tableId = fieldId;
  wrapper.dataset.pivotFieldId = fieldId;

  if (options.designMode) {
    const toolbar = document.createElement('div');
    toolbar.className = 'document-table__toolbar';
    const label = document.createElement('span');
    label.className = 'document-table__label';
    label.textContent = 'Pivot Table';
    const dragHandle = createDragHandle({ dataset: { action: 'drag-table' } });
    dragHandle.draggable = true;
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'document-table__delete';
    deleteBtn.dataset.action = 'delete-table';
    deleteBtn.title = 'Remove pivot table';
    deleteBtn.textContent = '×';
    toolbar.appendChild(label);
    toolbar.appendChild(dragHandle);
    toolbar.appendChild(deleteBtn);
    wrapper.appendChild(toolbar);
  }

  wrapper.appendChild(
    buildPivotTableElement(fieldId, value, schema, {
      designMode: !!options.designMode,
      previewMode: !!options.previewMode,
    }),
  );

  // Keep a JSON snapshot for extract / export (read-only field).
  try {
    wrapper.dataset.pivotValue = JSON.stringify(
      isPivotTableValue(value) ? value : createEmptyPivotValue(),
    );
  } catch {
    wrapper.dataset.pivotValue = '{"columns":[],"rows":[]}';
  }

  void escapeText;
  return wrapper;
}

/**
 * Rebuild pivot table grids in the DOM after schema property changes
 * (totals, alignment, format, etc.) without remounting the editor.
 */
export function refreshPivotTableInDom(
  fieldId: string,
  options: Record<string, any> = {},
  root: ParentNode | Document = document,
) {
  if (!fieldId) return;
  const registry = options.getRegistry?.();
  const schema =
    options.fieldSchemas?.[fieldId] ?? registry?.getFieldSchemas?.()?.[fieldId] ?? null;
  if (!schema || schema.type !== 'pivotTable') return;

  const scope: ParentNode = (root as any)?.querySelector ? (root as ParentNode) : document;
  const selector = `.document-table--pivot[data-pivot-field-id="${CSS.escape(fieldId)}"], .document-table--pivot[data-table-id="${CSS.escape(fieldId)}"]`;
  const wrappers = [...((scope as Document | Element).querySelectorAll?.(selector) ?? [])];

  for (const wrapper of wrappers) {
    const el = wrapper as HTMLElement;
    const designMode =
      !!options.designMode || !!el.querySelector(':scope > .document-table__toolbar');
    const value =
      options.fieldValues?.[fieldId] ??
      readPivotValueFromDom(el);

    const nextTable = buildPivotTableElement(fieldId, value, schema, {
      designMode,
      previewMode: !!options.previewMode,
    });
    const prevTable = el.querySelector(':scope > .pivot-table, :scope > .vision-table');
    if (prevTable) prevTable.replaceWith(nextTable);
    else el.appendChild(nextTable);

    try {
      el.dataset.pivotValue = JSON.stringify(
        isPivotTableValue(value) ? value : createEmptyPivotValue(),
      );
    } catch {
      el.dataset.pivotValue = '{"columns":[],"rows":[]}';
    }

    const toolbarLabel = el.querySelector('.document-table__label');
    if (toolbarLabel && schema.label) {
      toolbarLabel.textContent = String(schema.label);
    }

    if (designMode) {
      delete (nextTable as HTMLElement).dataset.pivotRowLabelResizeWired;
      wirePivotRowLabelResize(nextTable, {
        tableId: fieldId,
        getRegistry: options.getRegistry,
        onSchemaChange: options.onSchemaChange,
        onTableColumnResizeStart: options.onTableColumnResizeStart,
      });
    }
  }
}

export function readPivotValueFromDom(wrapper: Element | null | undefined): unknown {
  if (!wrapper) return createEmptyPivotValue();
  const raw = (wrapper as HTMLElement).dataset?.pivotValue;
  if (!raw) return createEmptyPivotValue();
  try {
    const parsed = JSON.parse(raw);
    return isPivotTableValue(parsed) ? parsed : createEmptyPivotValue();
  } catch {
    return createEmptyPivotValue();
  }
}
