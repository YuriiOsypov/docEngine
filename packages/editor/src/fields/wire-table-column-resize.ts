const MIN_COLUMN_WIDTH_PX = 40;
export const TABLE_ROW_LABEL_COL_WIDTH = '3em';

/**
 * @param {number} value
 * @param {number} min
 * @param {number} [max]
 * @returns {number}
 */
export function clampColumnWidthPx(value: any, min: any = MIN_COLUMN_WIDTH_PX, max: any = Infinity) {
  if (!Number.isFinite(value)) return min;
  const upper = Number.isFinite(max) ? max : Infinity;
  return Math.min(upper, Math.max(min, Math.round(value)));
}

/**
 * @param {HTMLTableElement | null | undefined} tableEl
 * @returns {HTMLTableColElement[]}
 */
export function getTableDataColElements(tableEl: any) {
  if (!tableEl) return [];
  let cols = [...(tableEl.querySelectorAll(':scope > colgroup > col') ?? [])];
  // Drop the leading row-label column when present.
  if (tableEl.querySelector(':scope > thead th.vision-table__row-label-head') ||
      tableEl.querySelector(':scope > tbody > tr > td.vision-table__row-label')) {
    cols = cols.slice(1);
  }
  // Drop the trailing row-actions column when present.
  const actionsHead = tableEl.querySelector(':scope > thead th.vision-table__actions-head');
  if (actionsHead && cols.length > 0) return cols.slice(0, -1);
  const actionsCell = tableEl.querySelector(
    ':scope > tbody > tr > td.vision-table__row-actions',
  );
  if (actionsCell && cols.length > 0) return cols.slice(0, -1);
  return cols;
}

/**
 * Apply a live pixel width to a `<col>` during drag.
 * @param {HTMLTableColElement | null | undefined} colEl
 * @param {number} widthPx
 */
export function applyColElementWidthPx(colEl: any, widthPx: any) {
  if (!colEl) return;
  const width = `${clampColumnWidthPx(widthPx)}px`;
  colEl.style.width = width;
  colEl.style.minWidth = width;
  colEl.style.maxWidth = width;
  colEl.setAttribute('width', width);
}

export function chromeCssPartsFromFlags({ includeRowLabels = false }: any = {}) {
  const parts: string[] = [];
  if (includeRowLabels) parts.push(TABLE_ROW_LABEL_COL_WIDTH);
  return parts;
}

/**
 * `%` on `<col>` is relative to the full table. Do not use calc() — browsers
 * ignore it on column elements.
 * @param {number} percent
 */
export function percentToColWidthCss(percent: any) {
  if (!Number.isFinite(percent)) return '';
  return `${Math.round(percent * 10) / 10}%`;
}

/**
 * When every data column is a percent and they do not add up to 100%, scale
 * them so the table fills its page (old templates reserved space for a wide
 * row-actions column). Mixed `auto` / `px` lists are left unchanged.
 * @param {string[]} cssWidths
 * @returns {string[]}
 */
export function scalePercentCssWidthsToFill(cssWidths: any) {
  const list = [...(cssWidths ?? [])];
  if (!list.length) return list;
  const percents = list.map((width: any) => {
    const match = String(width ?? '').trim().match(/^(\d+(?:\.\d+)?)%$/);
    return match ? Number(match[1]) : null;
  });
  if (percents.some((value: any) => value == null)) return list;
  const sum = percents.reduce((total: any, value: any) => total + value, 0);
  if (!(sum > 0) || Math.abs(sum - 100) < 0.15) return list;
  return percents.map((value: any) => percentToColWidthCss((value / sum) * 100));
}

/**
 * Map a schema width (`40%`, `40`, `120px`, `auto`) to a CSS value for `<col>`.
 * @param {string | null | undefined} width
 */
export function schemaWidthToColCss(width: any) {
  const value = String(width ?? '').trim();
  if (!value || value === 'auto') return '';
  const numeric = value.match(/^(\d+(?:\.\d+)?)%?$/);
  if (numeric) return percentToColWidthCss(Number(numeric[1]));
  return value;
}

/**
 * Apply a percent width to a `<col>`.
 * @param {HTMLTableColElement | null | undefined} colEl
 * @param {number} percent
 */
export function applyColElementWidthPercent(colEl: any, percent: any) {
  if (!colEl || !Number.isFinite(percent)) return;
  const width = percentToColWidthCss(percent);
  if (!width) return;
  colEl.style.width = width;
  colEl.style.minWidth = width;
  colEl.style.maxWidth = '';
  colEl.setAttribute('width', width);
}

/**
 * Mirror data-column widths onto header cells so table-layout:fixed stays in sync.
 * @param {HTMLTableElement | null | undefined} tableEl
 * @param {Array<string | null | undefined>} [widths]
 */
export function syncTableHeaderWidthsFromCols(tableEl: any, widths: any = null) {
  if (!tableEl) return;
  const resolved = Array.isArray(widths)
    ? widths
    : getTableDataColElements(tableEl).map((colEl: any) =>
        String(colEl?.style?.width ?? '').trim(),
      );
  getTableDataHeaderCells(tableEl).forEach((th: any, index: any) => {
    const width = String(resolved[index] ?? '').trim();
    if (width) th.style.width = width;
    else th.style.width = '';
  });
}

export function getTableDataHeaderCells(tableEl: any) {
  if (!tableEl?.querySelectorAll) return [];
  return [...(tableEl.querySelectorAll(':scope > thead > tr > th') ?? [])].filter((th: any) =>
    !th.classList?.contains('vision-table__row-label-head') &&
    !th.classList?.contains('vision-table__actions-head'),
  );
}

function elementWidthPx(el: any) {
  const width = el?.getBoundingClientRect?.()?.width;
  return width > 0 ? width : 0;
}

/**
 * Read current rendered widths for data columns.
 * Prefer header cells — `<col>` getBoundingClientRect is often 0.
 * @param {HTMLTableElement} tableEl
 * @param {{ preferLayout?: boolean }} [options]
 * @returns {number[]}
 */
export function measureTableColumnWidthsPx(tableEl: any, options: any = {}) {
  const preferLayout = !!options.preferLayout;
  const headerCells = getTableDataHeaderCells(tableEl);
  return getTableDataColElements(tableEl).map((colEl: any, index: any) => {
    if (!preferLayout) {
      const raw = String(colEl.style.width ?? '').trim();
      if (/^\d+(\.\d+)?px$/i.test(raw)) {
        const styleWidth = Number.parseFloat(raw);
        if (Number.isFinite(styleWidth) && styleWidth > 0) return styleWidth;
      }
    }
    const fromCell = elementWidthPx(headerCells[index]);
    if (fromCell > 0) return fromCell;
    const fromCol = elementWidthPx(colEl);
    if (fromCol > 0) return fromCol;
    return MIN_COLUMN_WIDTH_PX;
  });
}

/**
 * @param {HTMLTableElement} tableEl
 * @returns {number}
 */
export function measureTableWidthPx(tableEl: any) {
  const rect = tableEl?.getBoundingClientRect?.();
  if (rect?.width > 0) return rect.width;
  const sum = measureTableColumnWidthsPx(tableEl, { preferLayout: true })
    .reduce((total: any, w: any) => total + w, 0);
  return sum > 0 ? sum : 1;
}

/**
 * Convert absolute pixel widths to percentages of the data columns.
 * The row-actions control is a fixed px strip and must not steal leftover
 * percent, or preview/PDF tables leave a gap on the right.
 *
 * @param {number[]} widthsPx
 * @param {number} [tableWidthPx]
 * @returns {Array<number | null>}
 */
export function widthsPxToPercents(widthsPx: any, tableWidthPx: any) {
  const fromCols = (widthsPx ?? []).reduce(
    (sum: any, w: any) => sum + (Number.isFinite(w) && w > 0 ? w : 0),
    0,
  );
  const tableWidth = Number(tableWidthPx);
  const denominator = fromCols > 0
    ? fromCols
    : (Number.isFinite(tableWidth) && tableWidth > 0 ? tableWidth : 0);
  if (!(denominator > 0)) return (widthsPx ?? []).map((): any => null);
  return (widthsPx ?? []).map((w: any) => {
    if (!Number.isFinite(w) || w <= 0) return null;
    return Math.round(((w / denominator) * 100) * 10) / 10;
  });
}

/**
 * Build updated column defs with percent widths from measured pixel sizes.
 * @param {Array<{ key: string, label?: string, name?: string, width?: string }>} columns
 * @param {number[]} widthsPx
 * @param {number} [tableWidthPx]
 */
export function applyPercentWidthsToColumns(columns: any, widthsPx: any, tableWidthPx: any) {
  const percents = widthsPxToPercents(widthsPx, tableWidthPx);
  return (columns ?? []).map((col: any, index: any) => {
    const pct = percents[index];
    if (pct == null) return { ...col };
    return { ...col, width: `${pct}%` };
  });
}

/**
 * @deprecated Prefer applyPercentWidthsToColumns.
 */
export function applyPixelWidthsToColumns(columns: any, widthsPx: any, tableWidthPx: any) {
  return applyPercentWidthsToColumns(columns, widthsPx, tableWidthPx);
}

/**
 * Redistribute width between a column and its right-hand neighbor so the pair
 * total stays constant (classic splitter behavior). Other columns are unchanged.
 *
 * @param {number[]} startWidths
 * @param {number} colIndex
 * @param {number} deltaPx
 * @param {number} [minWidthPx]
 * @returns {number[]}
 */
export function redistributeAdjacentWidths(
  startWidths: any,
  colIndex: any,
  deltaPx: any,
  minWidthPx: any = MIN_COLUMN_WIDTH_PX,
) {
  const widths = [...(startWidths ?? [])];
  const count = widths.length;
  if (count === 0 || colIndex < 0 || colIndex >= count) return widths;

  const neighborIndex = colIndex < count - 1 ? colIndex + 1 : colIndex - 1;
  if (neighborIndex < 0) {
    widths[colIndex] = clampColumnWidthPx(widths[colIndex] + deltaPx, minWidthPx);
    return widths;
  }

  const leftIndex = Math.min(colIndex, neighborIndex);
  const rightIndex = Math.max(colIndex, neighborIndex);
  const signedDelta = colIndex <= neighborIndex ? deltaPx : -deltaPx;
  const pairTotal = widths[leftIndex] + widths[rightIndex];
  const nextLeft = clampColumnWidthPx(
    widths[leftIndex] + signedDelta,
    minWidthPx,
    pairTotal - minWidthPx,
  );
  widths[leftIndex] = nextLeft;
  widths[rightIndex] = pairTotal - nextLeft;
  return widths;
}

/**
 * Swallow the synthetic `click` that follows a drag so the editor chrome does
 * not treat it as a canvas click (which clears selection / opens Page setup).
 */
function suppressNextDocumentClick() {
  const suppress = (event: any) => {
    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener('click', suppress, true);
  };
  document.addEventListener('click', suppress, true);
  setTimeout(() => {
    document.removeEventListener('click', suppress, true);
  }, 0);
}

/**
 * Wire drag-to-resize handles on a vision-table (design mode).
 * Handles are `.vision-table__col-resizer[data-col-index]`.
 *
 * Drag uses px for smooth feedback; widths are persisted as % of the table.
 *
 * @param {HTMLTableElement | null | undefined} tableEl
 * @param {{
 *   tableId?: string,
 *   getRegistry?: () => { getFieldSchemas?: () => Record<string, any>, updateFieldSchema?: Function },
 *   onSchemaChange?: (schemas: Record<string, any>) => void,
 *   onTableColumnWidthsChange?: (tableId: string, columns: Array<object>) => void,
 *   onTableColumnWidthsPreview?: (tableId: string, columns: Array<object>) => void,
 *   onTableColumnResizeStart?: (tableId: string) => void,
 *   minWidthPx?: number,
 * }} [options]
 */
export function wireTableColumnResize(tableEl: any, options: any = {}) {
  if (!tableEl?.querySelectorAll) return;
  if (tableEl.dataset.colResizeWired === 'true') return;

  const handles = [...tableEl.querySelectorAll('.vision-table__col-resizer')];
  if (!handles.length) return;

  tableEl.dataset.colResizeWired = 'true';
  const minWidthPx = options.minWidthPx ?? MIN_COLUMN_WIDTH_PX;

  handles.forEach((handle: any) => {
    handle.addEventListener('pointerdown', (event: any) => {
      if (event.button != null && event.button !== 0) return;
      if (event.isPrimary === false) return;
      event.preventDefault();
      event.stopPropagation();

      const colIndex = Number(handle.dataset.colIndex);
      if (!Number.isInteger(colIndex) || colIndex < 0) return;

      const colEls = getTableDataColElements(tableEl);
      if (!colEls[colIndex]) return;

      const pointerId = event.pointerId;
      const startX = Number(event.clientX) || 0;
      const tableId = options.tableId ?? tableEl.closest?.('.document-table')?.dataset?.tableId;
      options.onTableColumnResizeStart?.(tableId);
      const tableWidthPx = measureTableWidthPx(tableEl);
      const measured = measureTableColumnWidthsPx(tableEl, { preferLayout: true });
      /** @type {number[]} */
      let liveWidths = [...measured];
      let didDrag = false;

      handle.classList.add('vision-table__col-resizer--active');
      tableEl.classList.add('vision-table--resizing');
      document.body.classList.add('vision-table-col-resize-active');
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        // linkedom / browsers without capture
      }

      function applyLiveWidths() {
        liveWidths.forEach((widthPx: any, index: any) => {
          applyColElementWidthPx(colEls[index], widthPx);
        });
        syncTableHeaderWidthsFromCols(
          tableEl,
          liveWidths.map((widthPx: any) => `${clampColumnWidthPx(widthPx)}px`),
        );
      }

      function previewColumns() {
        if (!tableId) return;
        const schema = options.getRegistry?.()?.getFieldSchemas?.()?.[tableId];
        options.onTableColumnWidthsPreview?.(
          tableId,
          applyPercentWidthsToColumns(schema?.columns ?? [], liveWidths, tableWidthPx),
        );
      }

      function onMove(moveEvent: any) {
        if (moveEvent.pointerId !== pointerId) return;
        const clientX = Number(moveEvent.clientX) || 0;
        if (Math.abs(clientX - startX) > 2) didDrag = true;
        liveWidths = redistributeAdjacentWidths(
          measured,
          colIndex,
          clientX - startX,
          minWidthPx,
        );
        applyLiveWidths();
        previewColumns();
      }

      function onUp(upEvent: any) {
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
        if (!didDrag) return;
        suppressNextDocumentClick();

        if (!tableId) return;

        const registry = options.getRegistry?.();
        const schemas = registry?.getFieldSchemas?.() ?? {};
        const schema = schemas[tableId];
        if (!schema || schema.type !== 'table') return;

        const finalPx = liveWidths.some((w: any) => Number.isFinite(w) && w > 0)
          ? liveWidths
          : measureTableColumnWidthsPx(tableEl, { preferLayout: true });
        const percents = widthsPxToPercents(finalPx, tableWidthPx);
        percents.forEach((pct: any, index: any) => {
          if (pct == null) return;
          applyColElementWidthPercent(colEls[index], pct);
        });
        syncTableHeaderWidthsFromCols(tableEl);

        const columns = applyPercentWidthsToColumns(
          schema.columns ?? [],
          finalPx,
          tableWidthPx,
        );
        registry.updateFieldSchema?.(tableId, { ...schema, columns });
        options.onTableColumnWidthsChange?.(tableId, columns);
        options.onSchemaChange?.(registry.getFieldSchemas?.() ?? schemas);
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  });
}

export { MIN_COLUMN_WIDTH_PX };
