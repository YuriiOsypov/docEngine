import { wireModalEscape } from '../ui/wire-modal-escape.js';
import {
  createListItemsEditor,
  createTreeNodesEditor,
  exportListItemsText,
  exportTreeNodesText,
  parseListItemsText,
  parseTreeNodesText,
} from './schema-items-designer.js';

/**
 * Modal editor for manual list options and tree nodes (design mode).
 */
let sharedModal: any = null;

export function configureSchemaItemsDesignerModal(_options: any = {}) {
  // Default text style is document-only; schema designer keeps UI font.
}

export function getSchemaItemsDesignerModal() {
  if (!sharedModal) {
    sharedModal = createSchemaItemsDesignerModal();
  }
  return sharedModal;
}

function createSchemaItemsDesignerModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="modal modal--wide modal--schema-designer" role="dialog" aria-modal="true">
      <div class="modal__header">
        <span class="schema-items-designer-modal__title" data-role="title">Edit options</span>
      </div>
      <div class="modal__body schema-items-designer-modal__body" data-role="editor-host"></div>
      <p class="modal__error schema-items-designer-modal__error" data-role="error" hidden></p>
      <div class="modal__footer schema-items-designer-modal__footer">
        <button type="button" class="btn btn-sm" data-action="import">Import</button>
        <button type="button" class="btn btn-sm" data-action="paste">Paste</button>
        <button type="button" class="btn btn-sm" data-action="export">Export</button>
        <input type="file" accept=".txt,text/plain" data-role="import-file" hidden />
        <span class="schema-items-designer-modal__footer-spacer"></span>
        <button type="button" class="btn btn-primary" data-action="ok">OK</button>
        <button type="button" class="btn" data-action="cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const titleEl = overlay.querySelector('[data-role="title"]');
  const editorHost = overlay.querySelector('[data-role="editor-host"]');
  const errorEl = overlay.querySelector('[data-role="error"]');
  const importFileInput = overlay.querySelector('[data-role="import-file"]');
  const btnImport = overlay.querySelector('[data-action="import"]');
  const btnPaste = overlay.querySelector('[data-action="paste"]');
  const btnExport = overlay.querySelector('[data-action="export"]');
  const btnOk = overlay.querySelector('[data-action="ok"]');
  const btnCancel = overlay.querySelector('[data-action="cancel"]');

  /** @type {'list' | 'tree' | null} */
  let mode: any = null;
  /** @type {ReturnType<typeof createListItemsEditor> | ReturnType<typeof createTreeNodesEditor> | null} */
  let editorApi: any = null;
  let resolvePromise: any = null;
  let rejectPromise: any = null;

  function showError(message: any) {
    if (!errorEl) return;
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  function close() {
    overlay.hidden = true;
    editorHost.innerHTML = '';
    editorApi = null;
    mode = null;
    showError('');
    resolvePromise = null;
    rejectPromise = null;
  }

  function applyImportedText(text: any) {
    if (!editorApi || !mode) return;
    if (mode === 'list') {
      editorApi.setItems(parseListItemsText(text));
    } else {
      editorApi.setTree(parseTreeNodesText(text));
    }
    showError('');
  }

  function mountEditor(nextMode: any,data: any) {
    mode = nextMode;
    editorHost.innerHTML = '';
    showError('');

    if (nextMode === 'list') {
      titleEl.textContent = 'Edit list options';
      const hint = document.createElement('p');
      hint.className = 'schema-form__hint';
      hint.textContent =
        'Import a .txt file or paste from the clipboard — one option label per line. Drag the grip handle to reorder options.';
      editorHost.appendChild(hint);
      editorApi = createListItemsEditor(editorHost, data.items ?? []);
      return;
    }

    titleEl.textContent = 'Edit tree';
    const hint = document.createElement('p');
    hint.className = 'schema-form__hint';
    hint.textContent =
      'Drag the grip handle to move: top/bottom of a row reorders; center nests inside that node. Import a .txt file or paste from the clipboard — use Tab at the start of a line for nesting.';
    editorHost.appendChild(hint);
    editorApi = createTreeNodesEditor(editorHost, data.tree ?? []);
  }

  function open(options: any) {
    return new Promise((resolve: any,reject: any) => {
      resolvePromise = resolve;
      rejectPromise = reject;
      mountEditor(options.mode, options);
      overlay.hidden = false;
    });
  }

  btnImport.addEventListener('click', () => {
    importFileInput?.click();
  });

  btnPaste?.addEventListener('click', async () => {
    if (!editorApi || !mode) return;
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error('Clipboard paste is not available in this browser.');
      }
      const text = await navigator.clipboard.readText();
      applyImportedText(text);
    } catch (err: any) {
      showError(err?.message ?? 'Could not read clipboard. Allow clipboard access, or use Import.');
    }
  });

  importFileInput?.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    importFileInput.value = '';
    if (!file || !editorApi || !mode) return;

    try {
      const text = await file.text();
      applyImportedText(text);
    } catch (err: any) {
      showError(err?.message ?? 'Could not import file.');
    }
  });

  btnExport.addEventListener('click', () => {
    if (!editorApi || !mode) return;

    try {
      const text =
        mode === 'list'
          ? exportListItemsText(editorApi.getItems())
          : exportTreeNodesText(editorApi.getTree());
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = mode === 'list' ? 'list-options.txt' : 'tree-options.txt';
      anchor.click();
      URL.revokeObjectURL(url);
      showError('');
    } catch (err: any) {
      showError(err?.message ?? 'Could not export file.');
    }
  });

  btnOk.addEventListener('click', () => {
    if (!editorApi || !mode) return;
    const resolve = resolvePromise;
    const result =
      mode === 'list'
        ? { items: editorApi.getItems() }
        : { tree: editorApi.getTree() };
    close();
    resolve?.(result);
  });

  btnCancel.addEventListener('click', () => {
    rejectPromise?.(new Error('cancelled'));
    close();
  });

  overlay.addEventListener('click', (e: any) => {
    if (e.target === overlay) btnCancel.click();
  });

  wireModalEscape(overlay, () => btnCancel.click());

  return { open };
}
