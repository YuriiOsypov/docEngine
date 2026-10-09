import { createSchemaEditorController } from './schema-editor-controller.js';
import { wireModalEscape } from '../ui/wire-modal-escape.js';

export function createSchemaEditorModal({
  getRegistry,
  onRepeaterTemplateChange,
  getRemoteListCollections = null,
  getRemoteListLabelFields = null,
}: any = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true">
      <div class="modal__header schema-editor-modal__header">
        <span class="schema-editor-modal__title">Edit field</span>
        <span class="schema-editor-modal__field-id" data-role="field-id-preview"></span>
      </div>
      <div class="modal__body schema-editor"></div>
      <div class="modal__footer">
        <button type="button" class="btn btn-primary" data-action="ok">OK</button>
        <button type="button" class="btn" data-action="close">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const body = overlay.querySelector('.schema-editor');
  const idPreviewEl = overlay.querySelector('[data-role="field-id-preview"]');
  const btnOk = overlay.querySelector('[data-action="ok"]');
  const btnClose = overlay.querySelector('[data-action="close"]');

  const controller = createSchemaEditorController({
    getRegistry,
    body,
    idPreviewEl,
    onRepeaterTemplateChange,
    getRemoteListCollections,
    getRemoteListLabelFields,
  });

  let resolvePromise: any = null;
  let rejectPromise: any = null;

  function close() {
    overlay.hidden = true;
    controller.clear();
    resolvePromise = null;
    rejectPromise = null;
  }

  function open(fieldId: any,schema: any,context: any = {}) {
    return new Promise((resolve: any,reject: any) => {
      resolvePromise = resolve;
      rejectPromise = reject;
      controller.load(fieldId, schema, context);
      overlay.hidden = false;
    });
  }

  btnOk.addEventListener('click', () => {
    const result = controller.trySave();
    if (!result) return;
    const resolve = resolvePromise;
    close();
    resolve?.(result);
  });

  btnClose.addEventListener('click', () => {
    rejectPromise?.(new Error('cancelled'));
    close();
  });

  overlay.addEventListener('click', (e: any) => {
    if (e.target === overlay) btnClose.click();
  });

  wireModalEscape(overlay, () => btnClose.click());

  return { open };
}
