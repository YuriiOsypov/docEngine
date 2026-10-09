/** Shared command-palette overlay class for field picker modals. */
export const FIELD_MODAL_OVERLAY_CLASS = 'modal-overlay modal-overlay--palette';

/** Footer hint shown next to the primary action. */
export const FIELD_MODAL_FOOTER_HINT_HTML =
  '<span class="modal__footer-hint" aria-hidden="true">Ctrl+Enter</span>';

/** Footer hint for tree/list pickers with keyboard navigation. */
export const FIELD_PICKER_FOOTER_HINT_HTML =
  '<span class="modal__footer-hint" aria-hidden="true">↑↓ Space · Ctrl+Enter</span>';

/** Footer hint for tree picker (includes expand/collapse). */
export const FIELD_TREE_PICKER_FOOTER_HINT_HTML =
  '<span class="modal__footer-hint" aria-hidden="true">↑↓←→ Space · Ctrl+Enter</span>';

/**
 * Apply selection with Ctrl/Cmd+Enter from anywhere inside the modal overlay.
 */
export function wireModalConfirmShortcut(overlay: Element | null, btnOk: Element | null) {
  if (!overlay || !btnOk) return;

  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    (btnOk as HTMLElement).click();
  });
}

/**
 * Prefer the full Lightning modal shell (header/body/footer) so field overlays
 * cover chrome the user can otherwise focus — Esc after clicking Cancel/header
 * would dismiss the editor while the nested dialog stayed open.
 * Falls back to .doc-shell / modal content. Avoid document.body under Lightning
 * (focus trap fights body-level overlays).
 */
export function resolveFieldModalParent(from?: Element | null): HTMLElement {
  if (!from || !(from instanceof Element)) return document.body;
  if (from.closest('.p-dialog')) return document.body;
  const shell = walkOutOfShadow(from);
  if (shell instanceof HTMLElement) {
    if (isVueManagedDialog(shell) || shell.closest('.p-dialog')) return document.body;
    return shell;
  }
  const host =
    from.closest('.doc-shell') ||
    from.closest('.slds-modal__content') ||
    from.closest('.slds-modal__container') ||
    from.closest('.slds-modal');
  if (host instanceof HTMLElement) {
    if (isVueManagedDialog(host) || host.closest('.p-dialog')) return document.body;
    return host;
  }
  return document.body;
}

/**
 * True for Vue-managed dialog shells (e.g. PrimeVue). Mounting overlays into
 * those nodes breaks Vue VDOM patching (`nextSibling` of null).
 */
function isVueManagedDialog(el: Element): boolean {
  return (
    el.classList.contains('p-dialog') ||
    el.getAttribute('data-pc-name') === 'dialog' ||
    !!el.closest('.p-dialog')
  );
}

function resolveLightningDialogHost(node: Element): Element | null {
  return (
    node.closest('.slds-modal__container') ||
    node.closest('.slds-modal') ||
    node.closest('lightning-modal')
  );
}

function resolveAccessibleDialogHost(node: Element): Element | null {
  const dialog = node.closest('[role="dialog"]');
  if (!dialog || isVueManagedDialog(dialog)) return null;
  return dialog;
}

/**
 * Walk out of nested shadow roots (LWC) so closest() can see Lightning chrome.
 * Skips PrimeVue / other Vue-owned `[role="dialog"]` hosts.
 */
function walkOutOfShadow(from: Element): Element | null {
  let node: Node | null = from;
  while (node) {
    if (node instanceof Element) {
      const hit = resolveLightningDialogHost(node) || resolveAccessibleDialogHost(node);
      if (hit) return hit;
    }
    const root = node.getRootNode?.();
    if (root instanceof ShadowRoot && root.host) {
      node = root.host;
      continue;
    }
    break;
  }
  return null;
}

/**
 * Prefer the Lightning modal shell (full dialog) over .doc-shell so Document
 * preview covers header/body/footer — not only the narrow page column.
 * Never mount into Vue-owned dialogs (PrimeVue) — that breaks VDOM patching.
 */
export function resolvePreviewModalParent(from?: Element | null): HTMLElement {
  if (!from || !(from instanceof Element)) return document.body;
  if (from.closest('.p-dialog')) return document.body;
  const host = walkOutOfShadow(from) || resolveFieldModalParent(from);
  if (host instanceof HTMLElement) {
    if (isVueManagedDialog(host) || host.closest('.p-dialog')) return document.body;
    return host;
  }
  return document.body;
}

/** Append overlay under parent; mark contained when not on document.body. */
export function mountFieldModalOverlay(overlay: HTMLElement, parent?: HTMLElement | null) {
  let target = parent instanceof HTMLElement ? parent : document.body;
  if (target !== document.body && (isVueManagedDialog(target) || target.closest('.p-dialog'))) {
    target = document.body;
  }
  if (target !== document.body) {
    overlay.classList.add('modal-overlay--contained');
    if (getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }
  } else {
    overlay.classList.remove('modal-overlay--contained');
  }
  if (overlay.parentElement !== target) {
    target.appendChild(overlay);
  }
}

export type FieldModalFocusOptions = {
  /** Select all text when focusing an input/textarea. */
  selectAll?: boolean;
};

const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function listModalFocusables(root: HTMLElement): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const out: HTMLElement[] = [];
  for (const el of root.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)) {
    if (!(el instanceof HTMLElement)) continue;
    if (seen.has(el)) continue;
    if (el.closest('[hidden]')) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    // offsetParent is null for fixed/hidden; also skip zero-size.
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    if (style && (style.visibility === 'hidden' || style.display === 'none')) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}

/** True when the caret / selection lives inside the overlay (contenteditable case). */
function selectionIsInsideOverlay(overlay: HTMLElement): boolean {
  const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
  const anchor = sel?.anchorNode;
  return !!(anchor && overlay.contains(anchor));
}

const MODAL_NAV_KEYS = new Set([
  'Tab',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Drop any lingering canvas selection so arrows can't move text behind the dialog. */
export function clearSelectionOutsideOverlay(overlay: HTMLElement) {
  const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
  if (!sel?.rangeCount) return;
  const anchor = sel.anchorNode;
  if (anchor && overlay.contains(anchor)) return;
  // Never clear while a form control inside the dialog owns focus — browsers
  // (esp. Chromium) can hide the input caret after removeAllRanges().
  const active = document.activeElement;
  if (active instanceof HTMLElement && overlay.contains(active)) {
    if (
      active.matches('input, textarea, select, [contenteditable="true"]') ||
      active.isContentEditable
    ) {
      return;
    }
  }
  try {
    sel.removeAllRanges();
  } catch {
    /* ignore */
  }
}

function eventOriginatesInOverlay(e: Event, overlay: HTMLElement): boolean {
  if (typeof e.composedPath === 'function') {
    for (const node of e.composedPath()) {
      if (node === overlay) return true;
      if (node instanceof Node && overlay.contains(node)) return true;
    }
  }
  const target = e.target;
  return !!(target instanceof Node && overlay.contains(target));
}

/**
 * Mark sibling chrome (and known editor roots) inert so contenteditables behind
 * the overlay cannot take focus or receive keyboard while the dialog is open.
 */
export function applyModalBackdropInert(overlay: HTMLElement): () => void {
  const marked: HTMLElement[] = [];
  const mark = (el: Element | null | undefined) => {
    if (!(el instanceof HTMLElement) || el === overlay) return;
    if (overlay.contains(el) || el.contains(overlay)) return;
    if (el.hasAttribute('inert')) return;
    if (marked.includes(el)) return;
    el.setAttribute('inert', '');
    marked.push(el);
  };

  const parent = overlay.parentElement;
  if (parent) {
    for (const child of Array.from(parent.children)) mark(child);
  }

  if (typeof document !== 'undefined') {
    document
      .querySelectorAll('.doc-shell, .editor-holder, [data-docengine-editor], .codex-editor')
      .forEach((el) => mark(el));
  }

  return () => {
    for (const el of marked) el.removeAttribute('inert');
  };
}

export type ModalFocusTrapOptions = {
  /** Prefer this control when reclaiming focus from the canvas (e.g. HTML editor). */
  preferredFocus?: HTMLElement | null;
};

/** Focus a control and ensure contenteditables have a caret (LWS often focuses with none). */
function focusElWithCaret(el: HTMLElement) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  if (!el.isContentEditable) return;
  const doc = el.ownerDocument ?? document;
  const view = doc.defaultView;
  const sel =
    (typeof view?.getSelection === 'function' ? view.getSelection() : null) ??
    (typeof window.getSelection === 'function' ? window.getSelection() : null);
  if (!sel || typeof doc.createRange !== 'function') return;
  if (sel.rangeCount && el.contains(sel.anchorNode as Node)) return;
  try {
    const range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore */
  }
}

function insertIntoContentEditable(el: HTMLElement, key: string, event: KeyboardEvent): boolean {
  const doc = el.ownerDocument ?? document;
  focusElWithCaret(el);
  try {
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      return doc.execCommand('insertText', false, key);
    }
    if (key === 'Backspace') return doc.execCommand('delete');
    if (key === 'Delete') return doc.execCommand('forwardDelete');
    if (key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      return (
        doc.execCommand('insertLineBreak') ||
        doc.execCommand('insertHTML', false, '<br>') ||
        doc.execCommand('insertParagraph')
      );
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Keep keyboard focus inside the open field dialog so the document canvas
 * (contenteditable) cannot steal Tab or arrow keys.
 */
export function wireModalFocusTrap(
  overlay: HTMLElement,
  modal: HTMLElement,
  options: ModalFocusTrapOptions = {},
): () => void {
  const preferredFocus = options.preferredFocus ?? null;
  const focusEl = (el: HTMLElement) => {
    focusElWithCaret(el);
  };

  const reclaimToModal = () => {
    if (preferredFocus && overlay.contains(preferredFocus)) {
      focusEl(preferredFocus);
      return;
    }
    const focusables = listModalFocusables(modal);
    focusEl(focusables[0] ?? modal);
  };

  const releaseInert = applyModalBackdropInert(overlay);
  clearSelectionOutsideOverlay(overlay);

  const onKeydown = (e: KeyboardEvent) => {
    if (overlay.hidden) return;

    const active = document.activeElement as HTMLElement | null;
    const activeInside = !!(active && overlay.contains(active));
    const preferredEditable =
      preferredFocus &&
      overlay.contains(preferredFocus) &&
      preferredFocus.isContentEditable
        ? preferredFocus
        : null;
    const eventInPreferred =
      preferredEditable &&
      e.target instanceof Node &&
      (e.target === preferredEditable || preferredEditable.contains(e.target));

    // LWS: contenteditable can show :focus / keep a selection while activeElement
    // stays on the Lightning host. Native key delivery never reaches the editor —
    // synthesize input whenever the real active element is outside the overlay.
    if (preferredEditable && !activeInside && !eventInPreferred) {
      const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isEditKey =
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        (e.key === 'Enter' && !e.ctrlKey && !e.metaKey);
      if (isPrintable || isEditKey || MODAL_NAV_KEYS.has(e.key) || e.key === 'Tab') {
        clearSelectionOutsideOverlay(overlay);
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Tab') {
          const focusables = listModalFocusables(modal);
          if (!focusables.length) {
            focusEl(preferredEditable);
            return;
          }
          let idx = focusables.indexOf(preferredEditable);
          if (e.shiftKey) {
            idx = idx <= 0 ? focusables.length - 1 : idx - 1;
          } else {
            idx = idx < 0 || idx >= focusables.length - 1 ? 0 : idx + 1;
          }
          focusEl(focusables[idx]);
          return;
        }
        if (isPrintable || isEditKey) {
          insertIntoContentEditable(preferredEditable, e.key, e);
        } else {
          reclaimToModal();
        }
        return;
      }
    }

    // LWS/Lightning may retarget activeElement; trust the event path / selection
    // so we never preventDefault while the user is typing in the dialog.
    const inside =
      activeInside ||
      eventOriginatesInOverlay(e, overlay) ||
      selectionIsInsideOverlay(overlay);

    if (inside) {
      if (e.key !== 'Tab') return;
      // Always own Tab while the overlay is open — canvas contenteditables are
      // otherwise next in document order after the dialog footer.
      e.preventDefault();
      e.stopPropagation();

      const focusables = listModalFocusables(modal);
      if (!focusables.length) {
        focusEl(preferredFocus && overlay.contains(preferredFocus) ? preferredFocus : modal);
        return;
      }

      let idx = active && overlay.contains(active) ? focusables.indexOf(active) : -1;
      if (idx < 0 && active && overlay.contains(active)) {
        const wrapped = focusables.findIndex((el) => el.contains(active));
        idx = wrapped;
      }
      // Event came from a control inside the dialog — use that as current.
      if (idx < 0 && e.target instanceof HTMLElement && overlay.contains(e.target)) {
        idx = focusables.indexOf(e.target);
        if (idx < 0) {
          idx = focusables.findIndex((el) => el.contains(e.target as Node));
        }
      }
      // Caret in contenteditable but activeElement retargeted — treat preferred as current.
      if (idx < 0 && preferredFocus && overlay.contains(preferredFocus)) {
        idx = focusables.indexOf(preferredFocus);
      }

      if (e.shiftKey) {
        idx = idx <= 0 ? focusables.length - 1 : idx - 1;
      } else {
        idx = idx < 0 || idx >= focusables.length - 1 ? 0 : idx + 1;
      }
      focusEl(focusables[idx]);
      return;
    }

    // Focus still on the canvas — block navigation / typing so the caret
    // behind the overlay cannot move, then pull focus into the dialog.
    if (!MODAL_NAV_KEYS.has(e.key) && e.key.length !== 1) return;
    clearSelectionOutsideOverlay(overlay);
    e.preventDefault();
    e.stopPropagation();
    reclaimToModal();
  };

  const onFocusIn = (e: FocusEvent) => {
    if (overlay.hidden) return;
    const target = e.target;
    if (!(target instanceof Node) || overlay.contains(target)) return;
    // Focus escaped to the canvas / Lightning chrome — pull it back.
    e.stopPropagation();
    reclaimToModal();
  };

  // Capture on document so Tab/arrows are trapped even when the event target
  // is outside the overlay (canvas still focused) or never bubbles to a holder.
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('focusin', onFocusIn, true);

  return () => {
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('focusin', onFocusIn, true);
    releaseInert();
  };
}

/**
 * Deferred focus for field modal inputs.
 * Installs a Tab focus trap so canvas contenteditables cannot steal focus.
 * Avoids a continuous "steal every focusin" loop against LightningModal —
 * reclaim only when focus leaves this overlay.
 */
export function wireFieldModalFocus(
  overlay: HTMLElement,
  focusTarget: HTMLElement,
  options: FieldModalFocusOptions = {}
): () => void {
  let disposed = false;
  const modal =
    (overlay.querySelector('.modal') as HTMLElement | null) ?? overlay;
  const releaseTrap = wireModalFocusTrap(overlay, modal, {
    preferredFocus: focusTarget,
  });

  const applySelection = () => {
    if (disposed || overlay.hidden) return;
    const el = focusTarget as HTMLInputElement | HTMLTextAreaElement;
    if (typeof el.select === 'function' && options.selectAll) {
      try {
        el.select();
      } catch {
        /* some input types reject select() */
      }
      return;
    }
    if (typeof el.setSelectionRange === 'function' && 'value' in el) {
      const len = String(el.value ?? '').length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* number inputs etc. */
      }
    }
  };

  const claimFocus = () => {
    if (disposed || overlay.hidden) return;
    clearSelectionOutsideOverlay(overlay);
    try {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        active !== focusTarget &&
        !overlay.contains(active) &&
        active.isContentEditable &&
        typeof active.blur === 'function'
      ) {
        active.blur();
      }
    } catch {
      /* ignore */
    }
    focusElWithCaret(focusTarget);
    applySelection();
  };

  // Defer past the opening click so the field token doesn't steal focus back.
  requestAnimationFrame(() => {
    setTimeout(claimFocus, 0);
  });

  return () => {
    disposed = true;
    releaseTrap();
  };
}
