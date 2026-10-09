import {
  PALETTE_BLOCK_MIME,
  PALETTE_DRAG_MIME,
  isPaletteDragSessionActive,
} from '../design/field-palette.js';
import { SOURCE_PATH_DRAG_MIME, SOURCE_PATH_META_MIME } from '../ui/mapping-drag-drop.js';
import { getRegistryFromNode } from '../registry/registry-context.js';
import { remapperMovedSubtreeToSection } from './cross-section-reposition.js';
import {
  insertPlainTextAtCaret,
  normalizeEditableLineStructure,
} from './inline-fields.js';

/** Matches `INTERNAL_DRAG_MIME` in inline-fields (avoid circular import). */
const INTERNAL_DRAG_MIME = 'application/x-doc-editor-dnd';

const PROSE_EDITABLE_SELECTOR =
  '.document-section__body, .document-columns__col, .template-block__inline';

const LAYOUT_BLOCK_SELECTOR = '.document-columns, .document-table';

/** @type {Range | null} */
let pendingDragSourceRange: Range | null = null;

/**
 * True when the drop lands in DocEngine prose (section / column / template text).
 */
export function isDocEngineProseDropTarget(target: any) {
  if (!target) return false;
  const el =
    target.nodeType === Node.ELEMENT_NODE
      ? target
      : target.parentElement ?? target.parentNode ?? null;
  return !!el?.closest?.(PROSE_EDITABLE_SELECTOR);
}

function resolveProseEditable(node: any) {
  if (!node) return null;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? node
      : node.parentElement ?? node.parentNode ?? null;
  return el?.closest?.(PROSE_EDITABLE_SELECTOR) ?? null;
}

function resolveProseEditableFromRange(range: Range | null | undefined) {
  if (!range) return null;
  return (
    resolveProseEditable(range.commonAncestorContainer) ||
    resolveProseEditable(range.startContainer) ||
    resolveProseEditable(range.endContainer)
  );
}

function resolveSectionBody(node: any) {
  if (!node) return null;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? node
      : node.parentElement ?? node.parentNode ?? null;
  return el?.closest?.('.document-section__body') ?? null;
}

function dataTransferHasType(dataTransfer: any, mime: string) {
  const types = dataTransfer?.types;
  if (!types) return false;
  if (typeof types.includes === 'function') return types.includes(mime);
  if (typeof types.contains === 'function') return types.contains(mime);
  try {
    return [...types].includes(mime);
  } catch {
    return false;
  }
}

/**
 * Palette / field / mapping drags — section handlers own these; leave the event alone
 * (Editor.js usually no-ops on empty payload).
 */
export function isDocEngineCustomDrag(dataTransfer: any) {
  if (isPaletteDragSessionActive()) return true;
  return (
    dataTransferHasType(dataTransfer, INTERNAL_DRAG_MIME) ||
    dataTransferHasType(dataTransfer, PALETTE_DRAG_MIME) ||
    dataTransferHasType(dataTransfer, PALETTE_BLOCK_MIME) ||
    dataTransferHasType(dataTransfer, SOURCE_PATH_DRAG_MIME) ||
    dataTransferHasType(dataTransfer, SOURCE_PATH_META_MIME)
  );
}

/**
 * When true, Editor.js must not handle this drop (native prose text move/copy).
 */
export function shouldBlockEditorJsDrop(target: any, dataTransfer: any) {
  if (!isDocEngineProseDropTarget(target)) return false;
  if (isDocEngineCustomDrag(dataTransfer)) return false;
  return true;
}

function caretRangeFromPoint(clientX: any, clientY: any) {
  if (typeof document.caretRangeFromPoint === 'function') {
    return document.caretRangeFromPoint(clientX, clientY);
  }
  const pos = (document as any).caretPositionFromPoint?.(clientX, clientY);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.collapse(true);
  return range;
}

function dropIsInsideSource(dropRange: Range, sourceRange: Range) {
  try {
    return (
      dropRange.compareBoundaryPoints(Range.START_TO_START, sourceRange) >= 0 &&
      dropRange.compareBoundaryPoints(Range.END_TO_END, sourceRange) <= 0
    );
  } catch {
    return false;
  }
}

/**
 * Best-effort delete when the DOM Range lacks extractContents/deleteContents (test envs).
 */
function deleteRangeContents(range: Range) {
  const toRemove: Node[] = [];
  const root = range.commonAncestorContainer;
  const walk = (node: Node) => {
    if (node === range.startContainer && node === range.endContainer && node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const start = range.startOffset;
      const end = range.endOffset;
      text.textContent =
        (text.textContent ?? '').slice(0, start) + (text.textContent ?? '').slice(end);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (const child of [...node.childNodes]) walk(child);
    }
  };
  // Prefer collecting fully-selected element/text siblings between bounds.
  try {
    const startNode =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer.childNodes[range.startOffset] ?? range.startContainer
        : range.startContainer;
    const endNode =
      range.endContainer.nodeType === Node.ELEMENT_NODE
        ? range.endContainer.childNodes[Math.max(0, range.endOffset - 1)] ?? range.endContainer
        : range.endContainer;
    let cur: Node | null =
      startNode.nodeType === Node.TEXT_NODE ? startNode : startNode;
    // If start/end are direct children of the same parent, remove that span.
    if (startNode.parentNode && startNode.parentNode === endNode.parentNode) {
      let node: Node | null = startNode;
      while (node) {
        toRemove.push(node);
        if (node === endNode) break;
        node = node.nextSibling;
      }
      for (const n of toRemove) n.parentNode?.removeChild(n);
      return;
    }
    void cur;
    void root;
    walk(root);
  } catch {
    /* ignore */
  }
}

/**
 * Inspect a live Range without mutating it.
 */
export function rangeContainsSelector(range: Range | null | undefined, selector: string) {
  if (!range || range.collapsed || !selector) return false;
  try {
    const clone = range.cloneContents();
    const wrap = document.createElement('div');
    wrap.appendChild(clone);
    return !!wrap.querySelector(selector);
  } catch {
    return false;
  }
}

function notifyEditableChanged(editable: any) {
  if (!editable?.dispatchEvent) return;
  try {
    editable.dispatchEvent(new InputEvent('input', { bubbles: true }));
  } catch {
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function placeCaretAfterNode(node: any) {
  const sel = window.getSelection();
  if (!sel || !node) return;
  try {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore */
  }
}

/**
 * Move (or copy-as-plain) a selection that may include field tokens into prose,
 * including nested column cells.
 */
function applyNativeProseFragmentDrop(
  sourceRange: Range,
  dropRange: Range,
  targetEditable: any,
  { isCopy }: { isCopy: boolean },
) {
  if (dropIsInsideSource(dropRange, sourceRange)) return false;

  const sourceEditable = resolveProseEditableFromRange(sourceRange);
  if (!sourceEditable) return false;

  // Layout blocks in the selection are not supported via prose DnD.
  if (rangeContainsSelector(sourceRange, LAYOUT_BLOCK_SELECTOR)) {
    return false;
  }

  const hasFields = rangeContainsSelector(sourceRange, '.field-token');
  // Ctrl/Cmd + fields: keep tokens unique — fall back to plain label text.
  if (isCopy && hasFields) {
    return false;
  }

  const marker = document.createTextNode('\uFEFF');
  const markerRange = dropRange.cloneRange();
  markerRange.collapse(true);
  try {
    markerRange.insertNode(marker);
  } catch {
    return false;
  }

  let fragment: DocumentFragment;
  try {
    if (typeof (sourceRange as any).extractContents === 'function' && !isCopy) {
      fragment = sourceRange.extractContents();
    } else if (typeof (sourceRange as any).cloneContents === 'function') {
      fragment = sourceRange.cloneContents();
      if (!isCopy && typeof (sourceRange as any).deleteContents === 'function') {
        sourceRange.deleteContents();
      } else if (!isCopy) {
        // Manual delete when Range APIs are incomplete (test DOM).
        deleteRangeContents(sourceRange);
      }
    } else {
      marker.parentNode?.removeChild(marker);
      return false;
    }
  } catch {
    marker.parentNode?.removeChild(marker);
    return false;
  }

  if (!(marker as any).isConnected && !marker.parentNode) return false;

  const sourceSectionBody = resolveSectionBody(sourceEditable);
  const targetSectionBody = resolveSectionBody(targetEditable);
  const crossSection =
    !!sourceSectionBody &&
    !!targetSectionBody &&
    sourceSectionBody !== targetSectionBody;

  // Collect before insertBefore empties the fragment.
  const movedFieldIds: string[] = [];
  const collectTokenIds = (root: any) => {
    if (!root) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (
        root.classList?.contains('field-token') &&
        !root.classList?.contains('field-token--cell')
      ) {
        const id = root.dataset?.fieldId;
        if (id) movedFieldIds.push(id);
      }
      for (const child of root.childNodes ?? []) collectTokenIds(child);
      return;
    }
    if (root.childNodes) {
      for (const child of root.childNodes) collectTokenIds(child);
    }
  };
  collectTokenIds(fragment);

  marker.parentNode?.insertBefore(fragment, marker);
  const lastInserted = marker.previousSibling;
  marker.parentNode?.removeChild(marker);

  if (crossSection && movedFieldIds.length) {
    const registry = getRegistryFromNode(targetEditable);
    for (const fieldId of movedFieldIds) {
      let token: HTMLElement | null = null;
      try {
        token = targetEditable.querySelector(
          `.field-token[data-field-id="${CSS.escape(fieldId)}"]`,
        );
      } catch {
        token = targetEditable.querySelector(`.field-token[data-field-id="${fieldId}"]`);
      }
      if (!token || sourceSectionBody?.contains?.(token)) continue;
      remapperMovedSubtreeToSection(token, targetSectionBody, sourceSectionBody, {
        getRegistry: () => registry,
      });
    }
  }

  if (sourceEditable !== targetEditable) {
    normalizeEditableLineStructure(sourceEditable);
    notifyEditableChanged(sourceEditable);
  }
  normalizeEditableLineStructure(targetEditable);
  notifyEditableChanged(targetEditable);

  targetEditable.focus?.();
  if (lastInserted) placeCaretAfterNode(lastInserted);
  return true;
}

/**
 * Complete a native text move/copy after blocking Editor.js processDrop.
 * Preserves field tokens when moving a mixed selection into a column/section.
 * @returns {boolean} true when content was inserted
 */
export function applyNativeProseTextDrop(e: any, sourceRange: Range | null = pendingDragSourceRange) {
  const plain = String(e?.dataTransfer?.getData?.('text/plain') ?? '');

  let dropRange = caretRangeFromPoint(e.clientX, e.clientY);
  if (!dropRange) return false;

  const editable = resolveProseEditable(dropRange.commonAncestorContainer);
  if (!editable) return false;

  // Avoid dropping into field chrome / layout toolbars.
  const dropEl =
    dropRange.startContainer.nodeType === Node.ELEMENT_NODE
      ? dropRange.startContainer
      : dropRange.startContainer.parentElement;
  if (
    dropEl?.closest?.(
      '.field-token, .editor-drag-handle, .document-table__toolbar, .document-columns__toolbar',
    )
  ) {
    return false;
  }

  // Only Ctrl/Cmd means copy. Do NOT trust dropEffect — browsers often report
  // "copy" for contenteditable text drags, which left the source text in place.
  const isCopy = !!(e.ctrlKey || e.metaKey);
  const sourceEditable = resolveProseEditableFromRange(sourceRange);
  // Allow moves between section body and nested column cells (different editables).
  const canMove = !isCopy && !!sourceEditable;

  if (canMove && sourceRange && dropIsInsideSource(dropRange, sourceRange)) {
    return false;
  }

  const hasFields = rangeContainsSelector(sourceRange, '.field-token');
  if (hasFields && canMove && sourceRange) {
    const moved = applyNativeProseFragmentDrop(sourceRange, dropRange, editable, { isCopy: false });
    if (moved) return true;
    // Layout-block selections fall through; prefer not to strip tokens as plain text.
    if (rangeContainsSelector(sourceRange, LAYOUT_BLOCK_SELECTOR)) {
      return false;
    }
  }

  if (!plain) return false;

  const sel = window.getSelection();
  if (!sel) return false;

  if (canMove && sourceRange) {
    // Marker survives source deletion whether the drop was before or after the selection.
    const marker = document.createTextNode('\uFEFF');
    const markerRange = dropRange.cloneRange();
    markerRange.collapse(true);
    markerRange.insertNode(marker);

    try {
      if (!sourceRange.collapsed) {
        sourceRange.deleteContents();
      }
    } catch {
      /* source may already be gone */
    }

    if (!(marker as any).isConnected && !marker.parentNode) return false;

    const insertAt = document.createRange();
    insertAt.setStartBefore(marker);
    insertAt.collapse(true);
    sel.removeAllRanges();
    sel.addRange(insertAt);
    marker.parentNode?.removeChild(marker);

    if (sourceEditable && sourceEditable !== editable) {
      normalizeEditableLineStructure(sourceEditable);
      notifyEditableChanged(sourceEditable);
    }
  } else {
    const insertAt = dropRange.cloneRange();
    insertAt.collapse(true);
    sel.removeAllRanges();
    sel.addRange(insertAt);
  }

  editable.focus?.();
  insertPlainTextAtCaret(editable, plain);
  normalizeEditableLineStructure(editable);
  notifyEditableChanged(editable);
  return true;
}

function snapshotProseDragSource() {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) {
    pendingDragSourceRange = null;
    return;
  }
  const range = sel.getRangeAt(0);
  if (!resolveProseEditable(range.commonAncestorContainer)) {
    pendingDragSourceRange = null;
    return;
  }
  try {
    pendingDragSourceRange = range.cloneRange();
  } catch {
    pendingDragSourceRange = null;
  }
}

/**
 * Editor.js DragNDrop binds `drop` on the holder in capture phase and always
 * preventDefault + execCommand('delete') + processHTML — which crashes when
 * pasteConfig.tags is missing and wipes selected text on failed re-insert.
 *
 * Register this BEFORE `new EditorJS` so our capture listener runs first.
 * We stop Editor.js, then finish the text move ourselves (stopPropagation alone
 * would leave the selection stranded with no insert).
 */
export function wireEditorJsNativeDropGuard(holder: any) {
  if (!holder?.addEventListener || holder.dataset?.editorJsDropGuardWired === 'true') {
    return () => {};
  }
  holder.dataset.editorJsDropGuardWired = 'true';

  const onDragStartCapture = () => {
    snapshotProseDragSource();
  };

  const onDragEndCapture = () => {
    pendingDragSourceRange = null;
  };

  const onDropCapture = (e: any) => {
    if (!shouldBlockEditorJsDrop(e.target, e.dataTransfer)) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    try {
      applyNativeProseTextDrop(e, pendingDragSourceRange);
    } finally {
      pendingDragSourceRange = null;
    }
  };

  holder.addEventListener('dragstart', onDragStartCapture, true);
  holder.addEventListener('dragend', onDragEndCapture, true);
  holder.addEventListener('drop', onDropCapture, true);

  return () => {
    holder.removeEventListener('dragstart', onDragStartCapture, true);
    holder.removeEventListener('dragend', onDragEndCapture, true);
    holder.removeEventListener('drop', onDropCapture, true);
    if (holder.dataset) delete holder.dataset.editorJsDropGuardWired;
    pendingDragSourceRange = null;
  };
}
