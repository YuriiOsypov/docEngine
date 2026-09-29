import { resolveRegistry } from '../registry/registry-context.js';
import { getFieldSelectionContainer, selectDesignTableColumn } from './field-selection.js';
import {
  cellFieldId,
  ensureCellSchemasForRows,
  generateTableRowKey,
  labelToFieldKey,
  resolveTableInstanceRows,
  tagTableCellToken,
  isFieldEditableInFillMode,
  isSchemaReadonly,
} from '../core/field-schemas.js';
import { evaluateComputedField } from '../core/computed-formula.js';
import {
  applyFieldDisplayStyle,
    resolveTableColumnDisplayStyle,
} from './field-display-style.js';
import {
  createFieldToken,
  updateFieldToken,
  readTokenValue,
  pickFillFieldFromToken,
    isFieldEmpty,
  isTableCellDisplayPlaceholder,
  resolveValueOrFillDefault,
} from './inline-fields.js';
import { createInlineRepeaterSeedValue } from './repeater-field.js';
import {
  TABLE_ROW_LABEL_COL_WIDTH,
  getTableDataColElements,
  getTableDataHeaderCells,
  scalePercentCssWidthsToFill,
  schemaWidthToColCss,
  wireTableColumnResize,
} from './wire-table-column-resize.js';

function tableHasRowLabels(rows: any): boolean {
  return (rows ?? []).some((row: any) => String(row?.label ?? '').trim() !== '');
}

function shouldShowRowLabels(tableSchema: any, rows: any): boolean {
  return tableSchema?.showRowLabels === true && tableHasRowLabels(rows);
}

function createTableCellFieldToken(cellId: any, value: any, label: any, context: any, classNames: any = []) {
  const fieldSchemas =
    context?.fieldSchemas ?? context?.getRegistry?.()?.getFieldSchemas?.() ?? {};
  const cellContext = { ...context, fieldSchemas, isTableCell: true };
  const token = createFieldToken(cellId, value, label, cellContext);
  for (const className of classNames) token.classList.add(className);
  // Design class must be present before updateFieldToken so empty cells use
  // the same highlight look as fill mode (not the filled value color).
  if (context?.designMode) token.classList.add('field-token--design');
  updateFieldToken(token, value, label, cellContext);
  return token;
}

const DEFAULT_TABLE_SCHEMA = {
  columns: [
    { key: 'col1', label: 'Col1' },
    { key: 'col2', label: 'Col2' },
  ],
  rows: [
    { key: 'row1', label: 'Row1' },
    { key: 'row2', label: 'Row2' },
  ],
};

export function getTableSchema(tableFieldId: any, options: any = {}) {
  if (options.fieldSchemas?.[tableFieldId]) {
    return options.fieldSchemas[tableFieldId];
  }
  const registry = resolveRegistry(options);
  return registry?.getFieldSchemas()?.[tableFieldId] ?? DEFAULT_TABLE_SCHEMA;
}

function resolveCellValue(cellId: any, fieldValues: any, fieldSchemas: any, blocks: any = [], options: any = {}) {
  const schema = fieldSchemas?.[cellId];
  if (schema?.type === 'computed') {
    return evaluateComputedField(cellId, fieldValues, fieldSchemas, { blocks }).value;
  }
  const current = fieldValues?.[cellId];
  const filled = resolveValueOrFillDefault(schema, current, {
    designMode: !!options.designMode,
  });
  if (
    fieldValues &&
    filled !== current &&
    !isFieldEmpty(filled, { schema })
  ) {
    fieldValues[cellId] = filled;
  }
  return filled;
}

function applyColumnWidthCss(el: any, width: any, { pin = false }: any = {}) {
  if (!width) return;
  el.style.width = width;
  if (el.tagName === 'COL') el.setAttribute('width', width);
  if (!pin) return;
  el.style.minWidth = width;
  el.style.maxWidth = '';
}

function clearColumnWidthCss(el: any) {
  if (!el) return;
  el.style.width = '';
  el.style.minWidth = '';
  el.style.maxWidth = '';
  if (el.tagName === 'COL') el.removeAttribute('width');
}

function applyScaledWidthsToCols(colEls: any, scaledWidths: any) {
  colEls.forEach((colEl: any, index: any) => {
    clearColumnWidthCss(colEl);
    applyColumnWidthCss(colEl, scaledWidths[index], { pin: true });
  });
}

function syncHeaderWidthsFromColgroup(table: any) {
  const widths = getTableDataColElements(table).map((colEl: any) =>
    String(colEl?.style?.width ?? '').trim(),
  );
  getTableDataHeaderCells(table).forEach((th: any, index: any) => {
    if (widths[index]) th.style.width = widths[index];
  });
}

function buildColgroup(tableSchema: any, includeRowLabels = false) {
  const colgroup = document.createElement('colgroup');
  if (includeRowLabels) {
    const labelCol = document.createElement('col');
    labelCol.className = 'vision-table__row-label-col';
    labelCol.style.width = TABLE_ROW_LABEL_COL_WIDTH;
    colgroup.appendChild(labelCol);
  }
  const dataCols = tableSchema.columns ?? [];
  const scaledWidths = scalePercentCssWidthsToFill(
    dataCols.map((col: any) => schemaWidthToColCss(col?.width)),
  );
  const colEls = dataCols.map(() => document.createElement('col'));
  applyScaledWidthsToCols(colEls, scaledWidths);
  colEls.forEach((colEl: any) => colgroup.appendChild(colEl));
  return colgroup;
}

export function applyTableColumnWidthsToElement(tableOrWrapper: any, columns: any) {
  const table = tableOrWrapper?.matches?.('table.vision-table')
    ? tableOrWrapper
    : tableOrWrapper?.querySelector?.('.vision-table');
  if (!table) return;
  const colEls = getTableDataColElements(table);
  const scaledWidths = scalePercentCssWidthsToFill(
    (columns ?? []).map((col: any) => schemaWidthToColCss(col?.width)),
  );
  (columns ?? []).forEach((_col: any, index: any) => {
    const colEl = colEls[index];
    if (!colEl) return;
    clearColumnWidthCss(colEl);
  });
  applyScaledWidthsToCols(colEls, scaledWidths);
  syncHeaderWidthsFromColgroup(table);
}

export function syncTableRowsDataset(tableWrapper: any, rows: any) {
  if (!tableWrapper) return;
  tableWrapper.dataset.tableRows = JSON.stringify(rows ?? []);
}

export function readTableRowsFromDom(tableWrapper: any) {
  const rows: any[] = [];
  const table = tableWrapper?.querySelector('.vision-table');
  // Scope to the outer table's own rows. `querySelectorAll('tbody tr')` would
  // also match rows of nested `.vision-table`s rendered inside Child-field
  // cells, which would inflate/duplicate the row count on every design toggle.
  table?.querySelectorAll(':scope > tbody > tr[data-row-key]').forEach((tr: any) => {
    const key = tr.dataset.rowKey;
    if (!key) return;
    rows.push({ key, label: tr.dataset.rowLabel ?? '' });
  });
  if (rows.length) return rows;

  try {
    const raw = tableWrapper?.dataset.tableRows;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((row: any) => ({ key: String(row.key), label: String(row.label ?? '') }))
      : [];
  } catch {
    return [];
  }
}

function tableCellHasContent(cellId: any, value: any, fieldSchemas: any, col: any) {
  const schema = fieldSchemas?.[cellId];
  const label = schema?.label ?? col?.label;
  if (isTableCellDisplayPlaceholder(value, label)) return false;
  return !isFieldEmpty(value, {
    htmlEditor: !!schema?.htmlEditor,
    repeaterSchema: schema?.type === 'child' ? schema : undefined,
  });
}

function tableCellIsRequiredEmpty(cellId: any, value: any, fieldSchemas: any, col: any) {
  const schema = fieldSchemas?.[cellId];
  if (!schema?.required) return false;
  return !tableCellHasContent(cellId, value, fieldSchemas, col);
}

export function tableSegmentHasContent(tableFieldId: any, fieldValues: any, fieldSchemas: any, segmentRows: any) {
  const tableSchema = getTableSchema(tableFieldId, { fieldSchemas });
  const rows = resolveTableInstanceRows(segmentRows, tableSchema);
  for (const row of rows) {
    for (const col of tableSchema.columns ?? []) {
      const cellId = cellFieldId(tableFieldId, row.key, col.key);
      const value = resolveCellValue(cellId, fieldValues, fieldSchemas);
      if (tableCellHasContent(cellId, value, fieldSchemas, col)) return true;
    }
  }
  return false;
}

/** True when the table has at least one required empty cell (shown as placeholder). */
export function tableSegmentHasRequiredEmpty(tableFieldId: any, fieldValues: any, fieldSchemas: any, segmentRows: any) {
  const tableSchema = getTableSchema(tableFieldId, { fieldSchemas });
  const rows = resolveTableInstanceRows(segmentRows, tableSchema);
  for (const row of rows) {
    for (const col of tableSchema.columns ?? []) {
      const cellId = cellFieldId(tableFieldId, row.key, col.key);
      const value = resolveCellValue(cellId, fieldValues, fieldSchemas);
      if (tableCellIsRequiredEmpty(cellId, value, fieldSchemas, col)) return true;
    }
  }
  return false;
}

function attachDesignCellToken(token: any, fieldId: any, tableFieldId: any, rowKey: any, colKey: any, options: any) {
  tagTableCellToken(token, tableFieldId, rowKey, colKey);
  token.removeAttribute('title');

  token.addEventListener('click', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    const container = getFieldSelectionContainer(token);
    selectDesignTableColumn(token, container, { additive: e.ctrlKey || e.metaKey });
    if (options.designPropertiesPanel && !e.ctrlKey && !e.metaKey) {
      options.onEditSchema?.(fieldId);
    }
  });

  token.addEventListener('dblclick', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    options.onEditSchema?.(fieldId);
  });
}

function attachFillCellToken(token: any, fieldId: any, colLabel: any, options: any, onCellValueChange: any) {
  const cellContext = {
    ...options,
    fieldSchemas:
      options.fieldSchemas ?? options.getRegistry?.()?.getFieldSchemas?.() ?? {},
    isTableCell: true,
  };

  token.addEventListener('click', async (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    const fieldSchemas =
      options.getRegistry?.()?.getFieldSchemas?.() ?? options.fieldSchemas ?? {};
    const schema = fieldSchemas?.[fieldId];
    if (!isFieldEditableInFillMode(schema, { fieldId, fieldSchemas })) return;

    await pickFillFieldFromToken(
      token,
      options,
      (id: any, value: any) => {
        onCellValueChange?.(id, value);
      },
      {
        schema,
        placeholder: colLabel,
        currentValue: readTokenValue(token),
        updateContext: {
          ...cellContext,
          fieldSchemas:
            options.getRegistry?.()?.getFieldSchemas?.() ?? cellContext.fieldSchemas,
        },
      },
    );
  });
}

function buildTableRowElement(row: any, tableFieldId: any, tableSchema: any, fieldValues: any, options: any = {}) {
  const { designMode, previewMode, mappingMode, onCellValueChange } = options;
  // Design mode always allows structural edits; fill mode respects table readonly.
  const editable =
    !previewMode && !mappingMode && (designMode || !isSchemaReadonly(tableSchema));
  const includeRowLabels = options.includeRowLabels === true;

  const tr = document.createElement('tr');
  tr.dataset.rowKey = row.key;
  if (row.label) tr.dataset.rowLabel = String(row.label);

  if (includeRowLabels) {
    const labelTd = document.createElement('td');
    labelTd.className = 'vision-table__row-label';
    labelTd.textContent = row.label ?? '';
    tr.appendChild(labelTd);
  }

  for (const col of tableSchema.columns ?? []) {
    const td = document.createElement('td');
    const fieldSchemas =
      options.fieldSchemas ?? options.getRegistry?.()?.getFieldSchemas?.() ?? {};
    const cellId = cellFieldId(tableFieldId, row.key, col.key);
    const cellSchema = fieldSchemas?.[cellId];
    const blocks = options.blocks ?? options.getRegistry?.()?.getBlocks?.() ?? [];
    const value = resolveCellValue(cellId, fieldValues, fieldSchemas, blocks, {
      designMode: !!designMode,
    });
    if (
      fieldValues &&
      value !== fieldValues[cellId] &&
      (cellSchema?.type === 'computed' || !isFieldEmpty(value, { schema: cellSchema }))
    ) {
      fieldValues[cellId] = value;
    }
    const token = createTableCellFieldToken(cellId, value ?? '', col.label, options, ['field-token--cell']);

    if (!previewMode) {
      if (designMode) {
        token.classList.add('field-token--design');
        attachDesignCellToken(token, cellId, tableFieldId, row.key, col.key, options);
      } else if (mappingMode) {
        tagTableCellToken(token, tableFieldId, row.key, col.key);
      } else {
        tagTableCellToken(token, tableFieldId, row.key, col.key);
        attachFillCellToken(
          token,
          cellId,
          col.label,
          {
            ...options,
            fieldSchemas,
            isTableCell: true,
            tableFieldId,
            rowKey: row.key,
            colKey: col.key,
          },
          (fieldId: any, value: any) => {
            onCellValueChange?.(fieldId, value);
            const schema =
              options.getRegistry?.()?.getFieldSchemas?.()?.[fieldId]
              ?? options.fieldSchemas?.[fieldId];
            // Avoid serialize/extract races that can blank a just-saved Child cell.
            if (schema?.type !== 'child') {
              options.onStructureChange?.();
            }
          },
        );
      }
    }

    td.appendChild(token);
    tr.appendChild(td);
  }

  if (editable) {
    const dataCells = [...tr.querySelectorAll(':scope > td')].filter(
      (td: any) => !td.classList.contains('vision-table__row-label'),
    );
    const lastTd = dataCells[dataCells.length - 1];
    if (lastTd) {
      lastTd.classList.add('vision-table__cell--with-remove');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'vision-table__row-remove';
      removeBtn.dataset.action = 'remove-table-row';
      removeBtn.dataset.rowKey = row.key;
      removeBtn.title = 'Remove row';
      removeBtn.setAttribute('aria-label', 'Remove row');
      removeBtn.textContent = '×';
      lastTd.appendChild(removeBtn);
    }
  }

  return tr;
}

function appendColumnResizer(th: any, colIndex: any) {
  const handle = document.createElement('span');
  handle.className = 'vision-table__col-resizer';
  handle.dataset.colIndex = String(colIndex);
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize column');
  handle.title = 'Drag to resize column';
  th.appendChild(handle);
}

function buildTableHead(tableFieldId: any, tableSchema: any, options: any = {}) {
  const fieldSchemas =
    options.fieldSchemas ?? options.getRegistry?.()?.getFieldSchemas?.() ?? {};
  const documentTextStyle =
    options.documentTextStyle ?? options.getDocumentTextStyle?.() ?? null;
  const withResizers = !!options.withResizers;
  const resizeOnly = !!options.resizeOnly;
  const includeRowLabels = options.includeRowLabels === true;
  const thead = document.createElement('thead');
  if (resizeOnly) thead.className = 'vision-table__resize-head';
  const headerRow = document.createElement('tr');
  if (includeRowLabels) {
    const labelTh = document.createElement('th');
    labelTh.className = 'vision-table__row-label-head';
    labelTh.setAttribute('aria-label', 'Row label');
    headerRow.appendChild(labelTh);
  }
  const columns = tableSchema.columns ?? [];
  columns.forEach((col: any, colIndex: any) => {
    const th = document.createElement('th');
    if (resizeOnly) {
      th.className = 'vision-table__resize-th';
      th.title = col.label ?? '';
    } else {
      th.textContent = col.label;
    }
    if (!resizeOnly) {
      applyFieldDisplayStyle(
        th,
        resolveTableColumnDisplayStyle(
          tableFieldId,
          col.key,
          fieldSchemas,
          options.fieldValueStyle,
          documentTextStyle,
        ),
      );
    }
    if (withResizers && colIndex < columns.length - 1) appendColumnResizer(th, colIndex);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  return thead;
}

function applyTablePresentation(table: any, tableSchema: any, { forceVisibleChrome = false }: any = {}) {
  table.className = 'vision-table';
  table.style.width = '100%';
  table.style.minWidth = '100%';
  table.style.maxWidth = 'none';
  table.style.tableLayout = 'fixed';
  table.style.whiteSpace = 'normal';
  if (!forceVisibleChrome && tableSchema?.hideBorders) {
    table.classList.add('vision-table--borderless');
  }
  if (!forceVisibleChrome && tableSchema?.hideHeader) {
    table.classList.add('vision-table--no-header');
  }
}

export function buildTableElement(tableFieldId: any, fieldValues: any, options: any = {}) {
  const { designMode, previewMode, mappingMode } = options;
  const tableSchema = getTableSchema(tableFieldId, options);
  const tableRows = options.tableRows ?? resolveTableInstanceRows(null, tableSchema);
  const editable = !previewMode && !mappingMode;
  const registry = resolveRegistry(options);
  if (registry && tableRows.length) {
    const merged = ensureCellSchemasForRows(
      tableSchema,
      tableFieldId,
      registry.getFieldSchemas(),
      tableRows,
    );
    registry.setFieldSchemas?.(merged);
  }

  const table = document.createElement('table');
  // Design mode always shows header labels and borders for editing,
  // even when hideHeader / hideBorders are set for fill/preview/PDF.
  applyTablePresentation(table, tableSchema, { forceVisibleChrome: !!designMode });
  const includeRowLabels = shouldShowRowLabels(tableSchema, tableRows);
  table.appendChild(buildColgroup(tableSchema, includeRowLabels));

  // Resize is available whenever design mode shows a real header (always).
  const allowResize = !!designMode;
  if (designMode || !tableSchema.hideHeader) {
    table.appendChild(
      buildTableHead(tableFieldId, tableSchema, {
        ...options,
        withResizers: allowResize,
        includeRowLabels,
      }),
    );
  }

  const tbody = document.createElement('tbody');
  const rowOptions = { ...options, tableContainer: table, includeRowLabels };
  for (const row of tableRows) {
    tbody.appendChild(
      buildTableRowElement(row, tableFieldId, tableSchema, fieldValues, rowOptions),
    );
  }
  table.appendChild(tbody);
  syncHeaderWidthsFromColgroup(table);

  if (allowResize) {
    wireTableColumnResize(table, {
      tableId: tableFieldId,
      getRegistry: options.getRegistry ?? (() => registry),
      onSchemaChange: options.onSchemaChange,
      onTableColumnWidthsChange: options.onTableColumnWidthsChange,
      onTableColumnWidthsPreview: options.onTableColumnWidthsPreview,
      onTableColumnResizeStart: options.onTableColumnResizeStart,
    });
  }

  return table;
}

export function refreshTableColumnHeaderInDom(tableFieldId: any, colKey: any, options: any = {}, root: any = document) {
  const fieldSchemas =
    options.fieldSchemas ?? options.getRegistry?.()?.getFieldSchemas?.() ?? {};
  const tableSchema = getTableSchema(tableFieldId, { ...options, fieldSchemas });
  const colIndex = (tableSchema.columns ?? []).findIndex((col: any) => col.key === colKey);
  if (colIndex < 0) return;

  const scope = root?.querySelector ? root : document;
  for (const wrapper of scope.querySelectorAll(`[data-table-id="${CSS.escape(tableFieldId)}"]`)) {
    const hasRowLabels = !!wrapper.querySelector('.vision-table__row-label-head');
    const th = wrapper.querySelector(
      `.vision-table thead tr th:nth-child(${colIndex + 1 + (hasRowLabels ? 1 : 0)})`,
    );
    if (!th || th.classList.contains('vision-table__row-label-head')) continue;
    applyFieldDisplayStyle(
      th,
      resolveTableColumnDisplayStyle(
        tableFieldId,
        colKey,
        fieldSchemas,
        options.fieldValueStyle,
        options.documentTextStyle ?? options.getDocumentTextStyle?.() ?? null,
      ),
    );
  }
}

/**
 * Re-apply Page setup text style on all visible table column headers.
 * @param {ParentNode} [root]
 * @param {{ getRegistry?: () => any; fieldSchemas?: Record<string, any>; fieldValueStyle?: any; documentTextStyle?: any; getDocumentTextStyle?: () => any }} [options]
 */
export function refreshTableHeadersInDom(root: any = document, options: any = {}) {
  const fieldSchemas =
    options.fieldSchemas ?? options.getRegistry?.()?.getFieldSchemas?.() ?? {};
  const documentTextStyle =
    options.documentTextStyle ?? options.getDocumentTextStyle?.() ?? null;
  const scope = root?.querySelector ? root : document;

  for (const table of scope.querySelectorAll('.vision-table')) {
    const wrapper = table.closest('[data-table-id]') ?? table;
    const tableFieldId = wrapper?.getAttribute?.('data-table-id') ?? table.dataset?.tableId;
    if (!tableFieldId) continue;
    const tableSchema = getTableSchema(tableFieldId, { ...options, fieldSchemas });
    for (const col of tableSchema.columns ?? []) {
      refreshTableColumnHeaderInDom(tableFieldId, col.key, {
        ...options,
        fieldSchemas,
        documentTextStyle,
      }, scope);
    }
  }
}

export function buildPreviewTableElement(tableFieldId: any, fieldValues: any, options: any = {}) {
  const { fieldSchemas, previewContext, tableRows: segmentRows } = options;
  const tableSchema = getTableSchema(tableFieldId, options);
  const tableRows = options.tableRows ?? resolveTableInstanceRows(segmentRows, tableSchema);
  const blocks = options.blocks ?? previewContext?.blocks ?? [];
  const showEmptyRows = options.showEmptyRows ?? previewContext?.hideEmptyValues !== true;
  const includeRowLabels = shouldShowRowLabels(tableSchema, tableRows);
  const table = document.createElement('table');
  applyTablePresentation(table, tableSchema);
  table.appendChild(buildColgroup(tableSchema, includeRowLabels));
  if (!tableSchema.hideHeader) {
    table.appendChild(
      buildTableHead(tableFieldId, tableSchema, {
        fieldSchemas,
        fieldValueStyle: previewContext?.fieldValueStyle,
        documentTextStyle: previewContext?.documentTextStyle ?? previewContext?.getDocumentTextStyle?.(),
        includeRowLabels,
      }),
    );
  }

  const tbody = document.createElement('tbody');
  for (const row of tableRows) {
    const rowCells = [];
    for (const col of tableSchema.columns ?? []) {
      const cellId = cellFieldId(tableFieldId, row.key, col.key);
      const value = resolveCellValue(cellId, fieldValues, fieldSchemas, blocks);
      rowCells.push({ col, cellId, value });
    }

    const hasValue = rowCells.some((cell: any) =>
      tableCellHasContent(cell.cellId, cell.value, fieldSchemas, cell.col),
    );
    const hasRequiredEmpty = rowCells.some((cell: any) =>
      tableCellIsRequiredEmpty(cell.cellId, cell.value, fieldSchemas, cell.col),
    );
    if (!showEmptyRows && !hasValue && !hasRequiredEmpty) continue;

    const tr = document.createElement('tr');
    tr.dataset.rowKey = row.key;
    if (row.label) tr.dataset.rowLabel = String(row.label);

    if (includeRowLabels) {
      const labelTd = document.createElement('td');
      labelTd.className = 'vision-table__row-label';
      labelTd.textContent = row.label ?? '';
      tr.appendChild(labelTd);
    }

    for (const { col, cellId, value } of rowCells) {
      const td = document.createElement('td');
      const showCell =
        tableCellHasContent(cellId, value, fieldSchemas, col) ||
        tableCellIsRequiredEmpty(cellId, value, fieldSchemas, col);
      if (showCell) {
        const span = createTableCellFieldToken(
          cellId,
          value,
          col.label,
          { ...previewContext, fieldSchemas, isTableCell: true },
          ['field-token--preview', 'field-token--cell'],
        );
        td.appendChild(span);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  if (!tbody.childNodes.length && !showEmptyRows) return null;

  table.appendChild(tbody);
  syncHeaderWidthsFromColgroup(table);
  return table;
}

function collectTableCellValuesFromDom(tableWrapper: any, fieldValues: any = {}) {
  const next = { ...fieldValues };
  tableWrapper
    ?.querySelectorAll?.(':scope > .vision-table .field-token--cell[data-field-id]')
    ?.forEach((token: any) => {
      const fieldId = token.dataset.fieldId;
      if (fieldId) next[fieldId] = readTokenValue(token);
    });
  return next;
}

function seedChildCellsForRow(
  tableId: any,
  rowKey: any,
  tableSchema: any,
  fieldSchemas: any,
  fieldValues: any,
) {
  for (const col of tableSchema.columns ?? []) {
    const cellId = cellFieldId(tableId, rowKey, col.key);
    const cellSchema = fieldSchemas?.[cellId];
    if (cellSchema?.type === 'child') {
      fieldValues[cellId] = createInlineRepeaterSeedValue(cellSchema);
    }
  }
}

function rebuildVisionTableInWrapper(tableWrapper: any, rows: any, fieldValues: any, options: any = {}) {
  const tableId = tableWrapper?.dataset.tableId;
  if (!tableId) return;

  const nextTable = buildTableElement(tableId, fieldValues, {
    ...options,
    fieldValues,
    tableRows: rows,
  });
  const oldTable = tableWrapper.querySelector(':scope > .vision-table');
  if (oldTable) {
    oldTable.replaceWith(nextTable);
    return;
  }
  const actions = tableWrapper.querySelector('.document-table__row-actions');
  if (actions) tableWrapper.insertBefore(nextTable, actions);
  else tableWrapper.appendChild(nextTable);
}

/** One non-empty line → one row label (for paste/import). */
export function parseTableRowLabelsText(text: any) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function addTableRowToWrapper(tableWrapper: any, options: any = {}, rowSpec: any = {}) {
  const tableId = tableWrapper?.dataset.tableId;
  if (!tableId) return null;

  const tableSchema = getTableSchema(tableId, options);
  // Fill-mode: refuse structural edits on read-only tables.
  if (!options.designMode && isSchemaReadonly(tableSchema)) return null;

  const rows = readTableRowsFromDom(tableWrapper);
  const label = String(rowSpec?.label ?? '').trim();
  const usedKeys = new Set(rows.map((row: any) => row.key));
  const newRow = {
    key: label ? labelToFieldKey(label, usedKeys) : generateTableRowKey(rows),
    label,
  };
  rows.push(newRow);
  syncTableRowsDataset(tableWrapper, rows);

  const registry = resolveRegistry(options);
  /** @type {Record<string, import('../types.d.ts').FieldValue>} */
  const fieldValues = { ...(options.fieldValues ?? {}) };
  if (registry) {
    const merged = ensureCellSchemasForRows(
      tableSchema,
      tableId,
      registry.getFieldSchemas(),
      rows,
    );
    registry.setFieldSchemas(merged);
    seedChildCellsForRow(tableId, newRow.key, tableSchema, merged, fieldValues);
  }

  const tbody = tableWrapper.querySelector('.vision-table tbody');
  if (!tbody) return newRow;

  tbody.appendChild(
    buildTableRowElement(newRow, tableId, tableSchema, fieldValues, {
      ...options,
      fieldValues,
      tableContainer: tableWrapper.querySelector('.vision-table'),
      includeRowLabels: shouldShowRowLabels(tableSchema, rows),
    }),
  );
  return newRow;
}

/**
 * Append one table row per non-empty line of plain text (clipboard / .txt import).
 * Line text becomes the row label; enables showRowLabels when needed.
 */
export function addTableRowsFromText(tableWrapper: any, text: any, options: any = {}) {
  const labels = parseTableRowLabelsText(text);
  if (!labels.length) return [];

  const tableId = tableWrapper?.dataset.tableId;
  if (!tableId) return [];

  let tableSchema = getTableSchema(tableId, options);
  if (!options.designMode && isSchemaReadonly(tableSchema)) return [];

  const existingRows = readTableRowsFromDom(tableWrapper);
  const hadRowLabels = shouldShowRowLabels(tableSchema, existingRows);

  const registry = resolveRegistry(options);
  if (!tableSchema.showRowLabels && registry) {
    const schemas = registry.getFieldSchemas() ?? {};
    const current = schemas[tableId] ?? tableSchema;
    const nextSchema = { ...current, showRowLabels: true };
    registry.setFieldSchemas({ ...schemas, [tableId]: nextSchema });
    options.onSchemaChange?.(registry.getFieldSchemas());
    tableSchema = nextSchema;
  }

  const usedKeys = new Set(existingRows.map((row: any) => row.key));
  const added = labels.map((label) => {
    const key = labelToFieldKey(label, usedKeys);
    usedKeys.add(key);
    return { key, label };
  });
  const nextRows = [...existingRows, ...added];
  syncTableRowsDataset(tableWrapper, nextRows);

  /** @type {Record<string, import('../types.d.ts').FieldValue>} */
  const fieldValues = collectTableCellValuesFromDom(tableWrapper, options.fieldValues ?? {});
  if (registry) {
    const merged = ensureCellSchemasForRows(
      tableSchema,
      tableId,
      registry.getFieldSchemas(),
      nextRows,
    );
    registry.setFieldSchemas(merged);
    for (const row of added) {
      seedChildCellsForRow(tableId, row.key, tableSchema, merged, fieldValues);
    }
  }

  const includeRowLabels = shouldShowRowLabels(tableSchema, nextRows);
  if (!hadRowLabels && includeRowLabels) {
    rebuildVisionTableInWrapper(tableWrapper, nextRows, fieldValues, options);
    return added;
  }

  const tbody = tableWrapper.querySelector('.vision-table tbody');
  if (!tbody) {
    rebuildVisionTableInWrapper(tableWrapper, nextRows, fieldValues, options);
    return added;
  }

  const visionTable = tableWrapper.querySelector('.vision-table');
  for (const newRow of added) {
    tbody.appendChild(
      buildTableRowElement(newRow, tableId, tableSchema, fieldValues, {
        ...options,
        fieldValues,
        tableContainer: visionTable,
        includeRowLabels,
      }),
    );
  }
  return added;
}

export function removeTableRowFromWrapper(tableWrapper: any, rowKey: any, options: any = {}) {
  const tableId = tableWrapper?.dataset.tableId;
  if (!tableId || !rowKey) return false;

  const tableSchema = getTableSchema(tableId, options);
  if (!options.designMode && isSchemaReadonly(tableSchema)) return false;

  const rows = readTableRowsFromDom(tableWrapper);
  if (rows.length <= 1) return false;

  const nextRows = rows.filter((row: any) => row.key !== rowKey);
  syncTableRowsDataset(tableWrapper, nextRows);

  // Scope removal to the outer table's own row so a same-keyed nested
  // Child-field table row is never targeted instead.
  const outerTable = tableWrapper.querySelector('.vision-table');
  outerTable
    ?.querySelector(`:scope > tbody > tr[data-row-key="${CSS.escape(rowKey)}"]`)
    ?.remove();

  options.onTableRowRemoved?.(tableId, rowKey);
  return true;
}
