import { ACTION_ICONS } from './action-icons.js';

/**
 * Document action strip for host chrome (header). Preview lives here so it
 * stays available in fill mode next to Design mode — not on the format toolbar.
 */
export function createDocumentActions({ onPreview = null }: { onPreview?: (() => void) | null } = {}) {
  const bar = document.createElement('div');
  bar.className = 'document-actions';

  let previewHandler: (() => void) | null = onPreview ?? null;

  const btnPreview = document.createElement('button');
  btnPreview.type = 'button';
  btnPreview.className = 'btn btn-sm document-actions__btn document-actions__btn--preview';
  btnPreview.innerHTML = `${ACTION_ICONS.preview}<span>Preview</span>`;
  btnPreview.title = 'Preview document';
  btnPreview.setAttribute('aria-label', 'Preview document');
  btnPreview.hidden = !previewHandler;
  btnPreview.addEventListener('click', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    previewHandler?.();
  });
  bar.appendChild(btnPreview);

  bar.hidden = !previewHandler;

  return {
    element: bar,
    setOnPreview(handler: (() => void) | null) {
      previewHandler = handler;
      btnPreview.hidden = !handler;
      bar.hidden = !handler;
    },
    setBusy(busy: any) {
      btnPreview.disabled = !!busy;
      btnPreview.title = busy ? 'Generating preview…' : 'Preview document';
    },
  };
}
