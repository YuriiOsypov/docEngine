/**
 * Fill-mode field focus: highlight + Tab/Shift+Tab traversal between editable tokens.
 * Separate from design-mode `.field-token--selected` (properties / clipboard).
 */
import { isFieldEditableInFillMode } from '../core/field-schemas.js';
import { sortTokensByDocumentOrder } from './field-selection.js';

export const FILL_FIELD_FOCUSED_CLASS = 'field-token--focused';

export function isFillModalOverlayOpen(root: any = document) {
  return !!root?.querySelector?.('.modal-overlay:not([hidden])');
}

export function clearFillFieldFocus(root: any = document) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll(`.${FILL_FIELD_FOCUSED_CLASS}`).forEach((el: any) => {
    el.classList.remove(FILL_FIELD_FOCUSED_CLASS);
  });
}

export function getFocusedFillFieldToken(root: any) {
  if (!root?.querySelector) return null;
  return root.querySelector(`.field-token.${FILL_FIELD_FOCUSED_CLASS}`);
}

/**
 * Mark a token as the focused fill field (document-wide within root).
 * @returns {HTMLElement | null}
 */
export function setFillFieldFocus(token: any, root: any = document) {
  if (!token?.classList) return null;
  const scope = root?.querySelectorAll ? root : document;
  clearFillFieldFocus(scope);
  token.classList.add(FILL_FIELD_FOCUSED_CLASS);
  return token;
}

function resolveFieldSchemas(getFieldSchemas: any) {
  if (typeof getFieldSchemas === 'function') return getFieldSchemas() ?? {};
  if (getFieldSchemas && typeof getFieldSchemas === 'object') return getFieldSchemas;
  return {};
}

/**
 * Editable fill-mode tokens in document order (prose + table cells).
 * Skips design/preview tokens and computed/readonly fields.
 */
export function collectEditableFillFieldTokens(holder: any, getFieldSchemas: any) {
  if (!holder?.querySelectorAll) return [];
  const schemas = resolveFieldSchemas(getFieldSchemas);
  const tokens = [...holder.querySelectorAll('.field-token')].filter((token: any) => {
    if (!token?.dataset?.fieldId) return false;
    if (token.classList.contains('field-token--design')) return false;
    if (token.classList.contains('field-token--preview')) return false;
    const fieldId = token.dataset.fieldId;
    return isFieldEditableInFillMode(schemas[fieldId], { fieldId, fieldSchemas: schemas });
  });
  return sortTokensByDocumentOrder(tokens);
}

/**
 * Place caret near the token so the hosting contenteditable keeps receiving keys.
 */
export function placeCaretNearFillField(token: any) {
  if (!token?.isConnected) return;
  const editable =
    token.closest?.(
      '.document-section__body, .template-block__body, .template-block__inline, [contenteditable="true"]',
    ) ?? null;
  if (editable && typeof editable.focus === 'function') {
    try {
      editable.focus({ preventScroll: true });
    } catch {
      editable.focus();
    }
  }

  try {
    const range = document.createRange();
    range.setStartBefore(token);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch {
    // linkedom / detached — ignore
  }
}

/**
 * Move fill focus by +1 (Tab) or -1 (Shift+Tab).
 * With no current focus: Tab → first field, Shift+Tab → last field.
 * @returns {HTMLElement | null} newly focused token, or null if none
 */
export function moveFillFieldFocus(holder: any, direction: 1 | -1, getFieldSchemas: any) {
  const tokens = collectEditableFillFieldTokens(holder, getFieldSchemas);
  if (!tokens.length) return null;

  const current = getFocusedFillFieldToken(holder);
  let index = current ? tokens.indexOf(current) : -1;

  let nextIndex: number;
  if (index < 0) {
    nextIndex = direction > 0 ? 0 : tokens.length - 1;
  } else {
    nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tokens.length) {
      // Stay on current at ends (no wrap) so users don't lose place.
      return current;
    }
  }

  const next = tokens[nextIndex];
  setFillFieldFocus(next, holder);
  try {
    next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  } catch {
    next.scrollIntoView?.();
  }
  placeCaretNearFillField(next);
  return next;
}

export function resolveFillFocusHolder(container: any, options: any = {}) {
  return (
    options.editorHolder ??
    container?.closest?.('.codex-editor, .editor-holder, [data-docengine-editor]') ??
    container
  );
}

/**
 * Re-apply fill focus after a picker closes (confirm or cancel).
 * Modal tear-down moves DOM focus away; restore the ring + caret so Tab keeps working.
 * Defers caret restore one frame so it wins over the browser's post-modal focus shift.
 */
export function restoreFillFieldFocusAfterPicker(
  fieldId: any,
  root: any,
  fallbackToken: any = null,
) {
  const scope = root?.querySelectorAll ? root : document;

  const findToken = () => {
    if (fieldId && scope?.querySelector) {
      try {
        const found = scope.querySelector(
          `.field-token[data-field-id="${CSS.escape(String(fieldId))}"]`,
        );
        if (found?.isConnected) return found;
      } catch {
        /* ignore invalid selectors / missing CSS.escape */
      }
    }
    return fallbackToken?.isConnected ? fallbackToken : null;
  };

  const live = findToken();
  if (!live) return null;

  setFillFieldFocus(live, scope);
  live.classList.remove('field-token--active');

  const applyCaret = () => {
    if (isFillModalOverlayOpen()) return;
    const again = findToken();
    if (!again) return;
    setFillFieldFocus(again, scope);
    placeCaretNearFillField(again);
  };

  // After modal hide, browsers often move focus asynchronously — restore twice.
  const schedule =
    typeof requestAnimationFrame === 'function'
      ? (fn: () => void) => requestAnimationFrame(fn)
      : (fn: () => void) => setTimeout(fn, 0);

  schedule(() => {
    applyCaret();
    setTimeout(applyCaret, 0);
  });

  return live;
}
