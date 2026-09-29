/** Six-dot grip icon (Editor.js block-tunes toggler). */
export const DRAG_HANDLE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-linecap="round" stroke-width="2.6" d="M9.40999 7.29999H9.4"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2.6" d="M14.6 7.29999H14.59"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2.6" d="M9.30999 12H9.3"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2.6" d="M14.6 12H14.59"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2.6" d="M9.40999 16.7H9.4"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2.6" d="M14.6 16.7H14.59"/></svg>';

/**
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {string | null} [options.hintTitle] Pass null to omit the hover tooltip bubble.
 * @param {string} [options.hintShortcut]
 * @param {Record<string, string>} [options.dataset]
 */
export function createDragHandle(options: any = {}) {
  const {
    className = '',
    hintTitle = 'Drag to move',
    hintShortcut = '',
    dataset = {},
  } = options;

  const handle = document.createElement('span');
  handle.className = className ? `editor-drag-handle ${className}` : 'editor-drag-handle';
  handle.setAttribute('role', 'button');
  handle.setAttribute('aria-label', hintTitle || 'Drag to move');

  handle.insertAdjacentHTML('afterbegin', DRAG_HANDLE_ICON_SVG);

  if (hintTitle) {
    const hint = document.createElement('span');
    hint.className = 'editor-drag-handle__hint';
    hint.setAttribute('role', 'tooltip');

    const title = document.createElement('span');
    title.className = 'editor-drag-handle__hint-title';
    title.textContent = hintTitle;
    hint.appendChild(title);

    if (hintShortcut) {
      const shortcut = document.createElement('span');
      shortcut.className = 'editor-drag-handle__hint-shortcut';
      shortcut.textContent = hintShortcut;
      hint.appendChild(shortcut);
    }

    handle.appendChild(hint);
  }

  for (const [key, value] of Object.entries(dataset)) {
    handle.dataset[key] = String(value);
  }

  return handle;
}
