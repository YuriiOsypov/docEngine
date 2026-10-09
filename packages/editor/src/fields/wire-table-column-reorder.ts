const TABLE_COLUMN_REORDER_THRESHOLD_PX = 4;

/**
 * Move a column in-place within a columns array.
 * `toIndex` is the final index of the moved column.
 * @returns {any[] | null} next columns, or null when unchanged / invalid
 */
export function moveTableColumn(columns: any, fromIndex: any, toIndex: any) {
  const list = Array.isArray(columns) ? [...columns] : [];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length ||
    from === to
  ) {
    return null;
  }
  const [col] = list.splice(from, 1);
  list.splice(to, 0, col);
  return list;
}

/**
 * Resolve drop target index from a header cell and pointer X.
 * Returns the final index the dragged column should occupy.
 */
export function resolveTableColumnDropIndex(
  fromIndex: number,
  targetIndex: number,
  clientX: number,
  targetTh: Element,
) {
  const rect = targetTh.getBoundingClientRect?.() ?? { left: 0, width: 0 };
  const mid = rect.left + rect.width / 2;
  let insertAt = clientX < mid ? targetIndex : targetIndex + 1;
  if (fromIndex < insertAt) insertAt -= 1;
  return insertAt;
}

function clearColumnDropIndicators(tableEl: any) {
  tableEl
    ?.querySelectorAll?.('.vision-table__col-head.is-drop-before, .vision-table__col-head.is-drop-after')
    ?.forEach((th: any) => {
      th.classList.remove('is-drop-before', 'is-drop-after');
    });
}

function setColumnDropIndicator(th: any, clientX: number) {
  const tableEl = th.closest?.('.vision-table') ?? th.parentElement;
  clearColumnDropIndicators(tableEl);
  const rect = th.getBoundingClientRect();
  const before = clientX < rect.left + rect.width / 2;
  th.classList.add(before ? 'is-drop-before' : 'is-drop-after');
}

function dataHeaderCells(tableEl: any) {
  const heads = [
    ...(tableEl?.querySelectorAll?.(':scope > thead > tr > th.vision-table__col-head') ?? []),
  ];
  if (heads.length) return heads;
  // Legacy tables rendered before col-head class existed.
  return [
    ...(tableEl?.querySelectorAll?.(':scope > thead > tr > th') ?? []),
  ].filter(
    (th: any) =>
      !th.classList?.contains('vision-table__row-label-head') &&
      !th.classList?.contains('vision-table__actions-head') &&
      !th.classList?.contains('vision-table__resize-th'),
  );
}

function headerAtPoint(tableEl: any, clientX: number, clientY: number) {
  const el = document.elementFromPoint?.(clientX, clientY);
  if (!el || !tableEl.contains(el)) return null;
  const th =
    el.closest?.('th.vision-table__col-head') ??
    el.closest?.(':scope > thead > tr > th, thead > tr > th');
  if (!th || !tableEl.contains(th)) return null;
  if (
    th.classList?.contains('vision-table__row-label-head') ||
    th.classList?.contains('vision-table__actions-head') ||
    th.classList?.contains('vision-table__resize-th')
  ) {
    return null;
  }
  return th;
}

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
 * Wire pointer-drag to reorder design-mode table columns by header.
 * Uses pointer events (not HTML5 DnD) so it works inside contenteditable.
 *
 * @param {HTMLTableElement} tableEl
 * @param {{
 *   tableId?: string,
 *   onReorder?: (fromIndex: number, toIndex: number) => void,
 * }} [options]
 */
export function wireTableColumnReorder(tableEl: any, options: any = {}) {
  if (!tableEl || tableEl.dataset.columnReorderWired === 'true') return;
  tableEl.dataset.columnReorderWired = 'true';

  const headers = dataHeaderCells(tableEl);
  if (headers.length < 2) return;

  for (const th of headers) {
    th.classList.add('vision-table__col-head');
    if (th.dataset.colIndex == null || th.dataset.colIndex === '') {
      th.dataset.colIndex = String(headers.indexOf(th));
    }
    th.draggable = false;
    th.contentEditable = 'false';
    if (!th.title) th.title = 'Drag to reorder column';

    th.addEventListener('pointerdown', (event: any) => {
      if (event.button != null && event.button !== 0) return;
      if (event.isPrimary === false) return;
      // Let the column resize splitter own the gesture.
      if (event.target?.closest?.('.vision-table__col-resizer')) return;

      const fromIndex = Number(th.dataset.colIndex);
      if (!Number.isInteger(fromIndex) || fromIndex < 0) return;

      const pointerId = event.pointerId;
      const startX = Number(event.clientX) || 0;
      const startY = Number(event.clientY) || 0;
      let didDrag = false;
      let hoverTh: any = null;

      event.preventDefault();
      event.stopPropagation();

      try {
        th.setPointerCapture(pointerId);
      } catch {
        // linkedom / browsers without capture
      }

      function onMove(moveEvent: any) {
        if (moveEvent.pointerId !== pointerId) return;
        const clientX = Number(moveEvent.clientX) || 0;
        const clientY = Number(moveEvent.clientY) || 0;
        if (
          !didDrag &&
          (Math.abs(clientX - startX) > TABLE_COLUMN_REORDER_THRESHOLD_PX ||
            Math.abs(clientY - startY) > TABLE_COLUMN_REORDER_THRESHOLD_PX)
        ) {
          didDrag = true;
          th.classList.add('is-dragging');
          tableEl.classList.add('vision-table--col-reordering');
          document.body.classList.add('vision-table-col-reorder-active');
        }
        if (!didDrag) return;

        moveEvent.preventDefault();
        const over = headerAtPoint(tableEl, clientX, clientY);
        if (!over || Number(over.dataset.colIndex) === fromIndex) {
          if (hoverTh && hoverTh !== over) {
            hoverTh.classList.remove('is-drop-before', 'is-drop-after');
          }
          hoverTh = null;
          return;
        }
        hoverTh = over;
        setColumnDropIndicator(over, clientX);
      }

      function onUp(upEvent: any) {
        if (upEvent.pointerId !== pointerId) return;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);

        th.classList.remove('is-dragging');
        tableEl.classList.remove('vision-table--col-reordering');
        document.body.classList.remove('vision-table-col-reorder-active');
        clearColumnDropIndicators(tableEl);

        try {
          if (th.hasPointerCapture?.(pointerId)) th.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }

        upEvent?.preventDefault?.();
        upEvent?.stopPropagation?.();
        if (!didDrag) return;
        suppressNextDocumentClick();

        const clientX = Number(upEvent.clientX) || 0;
        const clientY = Number(upEvent.clientY) || 0;
        const over = headerAtPoint(tableEl, clientX, clientY) ?? hoverTh;
        if (!over) return;
        const targetIndex = Number(over.dataset.colIndex);
        if (!Number.isInteger(targetIndex)) return;
        const toIndex = resolveTableColumnDropIndex(fromIndex, targetIndex, clientX, over);
        if (toIndex === fromIndex) return;
        options.onReorder?.(fromIndex, toIndex);
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }
}
