let selectionChangeCallback: any = null;

/** @param {(() => void) | null} callback */
export function setFieldSelectionChangeCallback(callback: any) {
  selectionChangeCallback = callback;
}

function emitSelectionChange() {
  selectionChangeCallback?.();
}

export function getFieldSelectionContainer(token: any) {
  return (
    token?.closest('.document-section__body, .document-columns__col, .template-block__body') ??
    token?.parentElement ??
    null
  );
}

export function clearAllDesignTokenSelection(root: any = document, { notify = true }: any = {}) {
  root.querySelectorAll('.field-token--selected').forEach((el: any) => {
    el.classList.remove('field-token--selected');
  });
  if (notify) emitSelectionChange();
}

export function selectDesignTableColumn(token: any, container: any, { additive = false }: any = {}) {
  if (!token) return;

  const tableId = token.dataset.tableId;
  const colKey = token.dataset.colKey;
  const tableRoot = token.closest('.vision-table, .document-table') ?? container;

  if (!tableId || !colKey || !tableRoot) {
    selectDesignToken(token, container, { additive });
    return;
  }

  const columnSelector = `.field-token--cell[data-table-id="${CSS.escape(tableId)}"][data-col-key="${CSS.escape(colKey)}"]`;
  const columnTokens = [...tableRoot.querySelectorAll(columnSelector)];

  if (additive) {
    const allSelected = columnTokens.length > 0 && columnTokens.every((t: any) => t.classList.contains('field-token--selected'));
    for (const t of columnTokens) {
      t.classList.toggle('field-token--selected', !allSelected);
    }
    emitSelectionChange();
    return;
  }

  clearAllDesignTokenSelection(document, { notify: false });
  for (const t of columnTokens) {
    t.classList.add('field-token--selected');
  }
  emitSelectionChange();
}

export function clearDesignTokenSelection(container: any, { notify = true }: any = {}) {
  if (!container) return;
  container.querySelectorAll('.field-token--selected').forEach((el: any) => {
    el.classList.remove('field-token--selected');
  });
  if (notify) emitSelectionChange();
}

export function selectDesignToken(token: any, container: any, { additive = false }: any = {}) {
  if (!container || !token) return;

  if (additive) {
    token.classList.toggle('field-token--selected');
    emitSelectionChange();
    return;
  }

  // Clear across the whole document — containers are per-section, so a
  // section-local clear leaves other sections looking selected.
  clearAllDesignTokenSelection(document, { notify: false });
  token.classList.add('field-token--selected');
  emitSelectionChange();
}

export function getSelectedFieldTokens(container: any) {
  if (!container) return [];
  return [...container.querySelectorAll('.field-token--selected')].filter((token: any) =>
    container.contains(token)
  );
}

export function sortTokensByDocumentOrder(tokens: any) {
  return [...tokens].sort((a: any, b: any) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

export function getFieldTokensForClipboard(container: any) {
  if (!container) return [];

  const selected = sortTokensByDocumentOrder(getSelectedFieldTokens(container));
  if (selected.length > 0) return selected;

  const sel = window.getSelection();
  if (!sel?.rangeCount) return [];

  if (sel.isCollapsed) {
    const node = sel.anchorNode;
    const el: any = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const token = el?.closest?.('.field-token');
    if (token && container.contains(token)) return [token];
    return [];
  }

  const tokensInRange = sortTokensByDocumentOrder(
    [...container.querySelectorAll('.field-token')].filter((token: any) => sel.containsNode(token, true))
  );
  if (tokensInRange.length >= 1) return tokensInRange;

  return [];
}

export function wireFieldSelectionClear(container: any) {
  function handleClick(e: any) {
    if (e.target.closest('.field-token')) return;
    clearAllDesignTokenSelection(document);
  }

  container.addEventListener('click', handleClick);
  return () => container.removeEventListener('click', handleClick);
}
