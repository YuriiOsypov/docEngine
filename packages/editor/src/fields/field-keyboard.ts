import {
  focusCaretAfter,
  focusCaretAtFieldBridge,
  insertLineBreakAtCaret,
  ensureCaretAnchorAfter,
  ensureFieldTokenCaretAnchors,
  removeTrailingCaretBridge,
  stripFieldTokenCaretAnchors,
  hasLeadingCaretAnchor,
  caretPositionAfterFieldToken,
  isCaretAnchorOnlyTextNode,
  normalizeEditableLineStructure,
} from './inline-fields.js';
import {
  clearAllDesignTokenSelection,
  getFieldTokensForClipboard,
  getSelectedFieldTokens,
  sortTokensByDocumentOrder,
} from './field-selection.js';
import {
  collectEditableFillFieldTokens,
  getFocusedFillFieldToken,
  isFillModalOverlayOpen,
  moveFillFieldFocus,
  resolveFillFocusHolder,
} from './fill-field-focus.js';

function isFieldToken(node: any) {
  return node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains('field-token');
}

function isIgnorableText(node: any) {
  return node?.nodeType === Node.TEXT_NODE && !stripFieldTokenCaretAnchors(node.textContent);
}

function isCaretAnchorTextNode(node: any) {
  return isCaretAnchorOnlyTextNode(node);
}

function isEditorBlockElement(node: any) {
  return (
    node?.nodeType === Node.ELEMENT_NODE &&
    (node.tagName === 'DIV' || node.tagName === 'P' || node.tagName === 'H1' || node.tagName === 'H2' || node.tagName === 'H3') &&
    !node.classList?.contains('document-align') &&
    !node.classList?.contains('document-columns') &&
    !node.classList?.contains('document-table') &&
    !isFieldToken(node)
  );
}

function getBlockAncestor(node: any, container: any) {
  let current = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (current && current !== container) {
    if (isEditorBlockElement(current)) return current;
    current = current.parentNode;
  }
  return null;
}

function isCaretAtLineStart(range: any, container: any) {
  const { startContainer, startOffset } = range;

  if (startContainer.nodeType === Node.TEXT_NODE) {
    if (startOffset > 0) return false;
  } else if (startContainer.nodeType === Node.ELEMENT_NODE) {
    if (startOffset > 0) {
      const previous = startContainer.childNodes[startOffset - 1];
      return previous?.nodeName === 'BR';
    }
  } else {
    return false;
  }

  const before = getNodeBeforeCaret(range, container);
  if (!before) return false;
  if (before.nodeName === 'BR') return true;
  if (isEditorBlockElement(before)) return true;
  return false;
}

function mergeLineBackwardAtCaret(container: any, range: any) {
  const before = getNodeBeforeCaret(range, container);
  if (!before) return false;

  if (before.nodeName === 'BR') {
    const caretNode =
      range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer : null;
    const caretOffset = range.startOffset;
    before.remove();

    const sel = window.getSelection();
    if (caretNode?.isConnected) {
      const nextRange = document.createRange();
      nextRange.setStart(caretNode, Math.min(caretOffset, caretNode.textContent?.length ?? 0));
      nextRange.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(nextRange);
    }
    return true;
  }

  if (!isEditorBlockElement(before)) return false;

  const currentBlock = getBlockAncestor(range.startContainer, container);
  if (currentBlock === before) return false;

  if (!currentBlock) {
    const { startContainer, startOffset } = range;
    if (startContainer.nodeType !== Node.TEXT_NODE || startOffset !== 0) return false;

    const insertRange = document.createRange();
    insertRange.selectNodeContents(before);
    insertRange.collapse(false);
    insertRange.insertNode(startContainer);
    insertRange.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(insertRange);
    return true;
  }

  const mergeRange = document.createRange();
  mergeRange.selectNodeContents(before);
  mergeRange.collapse(false);

  while (currentBlock.firstChild) {
    mergeRange.insertNode(currentBlock.firstChild);
    mergeRange.collapse(false);
  }
  currentBlock.remove();

  mergeRange.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(mergeRange);
  return true;
}

export function getCollapsedCaretRange(container: any) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  const anchor = range.commonAncestorContainer;
  if (!container.contains(anchor)) return null;

  // Nested contenteditables (e.g. `.document-columns__col`) have their own
  // keyboard wiring. Ignore those carets so the parent section does not steal
  // arrow keys and park the caret on non-editable chrome (splitter, toolbar).
  const anchorEl = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
  const editingHost = anchorEl?.closest?.('[contenteditable="true"]');
  if (editingHost && editingHost !== container && container.contains(editingHost)) {
    return null;
  }

  return range;
}

function getNodeAfterCaret(range: any, container: any) {
  const { startContainer, startOffset } = range;

  if (startContainer.nodeType === Node.TEXT_NODE) {
    if (startOffset < (startContainer.textContent?.length ?? 0)) return null;

    let node = startContainer;
    while (node && node !== container) {
      if (node.nextSibling) return node.nextSibling;
      node = node.parentNode;
    }
    return null;
  }

  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    if (startOffset < startContainer.childNodes.length) {
      return startContainer.childNodes[startOffset];
    }

    let node = startContainer;
    while (node && node !== container) {
      if (node.nextSibling) return node.nextSibling;
      node = node.parentNode;
    }
  }

  return null;
}

function getNodeBeforeCaret(range: any, container: any) {
  const { startContainer, startOffset } = range;

  if (startContainer.nodeType === Node.TEXT_NODE) {
    if (startOffset > 0) return null;

    let node = startContainer;
    while (node && node !== container) {
      if (node.previousSibling) return node.previousSibling;
      node = node.parentNode;
    }
    return null;
  }

  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    if (startOffset > 0) {
      return startContainer.childNodes[startOffset - 1];
    }

    let node = startContainer;
    while (node && node !== container) {
      if (node.previousSibling) return node.previousSibling;
      node = node.parentNode;
    }
  }

  return null;
}

function walkForward(node: any, container: any) {
  let bridgeBr = null;
  let current = node;

  while (current) {
    if (!container.contains(current)) return null;

    if (isIgnorableText(current)) {
      current = current.nextSibling;
      continue;
    }

    if (current.nodeType === Node.TEXT_NODE) {
      return null;
    }

    if (current.nodeType === Node.ELEMENT_NODE && current.tagName === 'BR') {
      bridgeBr = current;
      current = current.nextSibling;
      continue;
    }

    if (isFieldToken(current)) {
      return { token: current, bridgeBr };
    }

    if (current.nodeType === Node.ELEMENT_NODE && current.childNodes.length === 0) {
      current = current.nextSibling;
      continue;
    }

    return null;
  }

  return null;
}

function walkBackward(node: any, container: any) {
  let bridgeBr = null;
  let current = node;

  while (current) {
    if (!container.contains(current)) return null;

    if (isIgnorableText(current)) {
      current = current.previousSibling;
      continue;
    }

    if (current.nodeType === Node.TEXT_NODE) {
      return null;
    }

    if (current.nodeType === Node.ELEMENT_NODE && current.tagName === 'BR') {
      bridgeBr = current;
      current = current.previousSibling;
      continue;
    }

    if (isFieldToken(current)) {
      return { token: current, bridgeBr };
    }

    if (current.nodeType === Node.ELEMENT_NODE && current.childNodes.length === 0) {
      current = current.previousSibling;
      continue;
    }

    return null;
  }

  return null;
}

function findAdjacentFieldToken(range: any, direction: any, container: any) {
  const startNode = direction === 'forward'
    ? getNodeAfterCaret(range, container)
    : getNodeBeforeCaret(range, container);

  if (!startNode) return null;
  return direction === 'forward'
    ? walkForward(startNode, container)
    : walkBackward(startNode, container);
}

function focusCaretInText(textNode: any, offset: any = 0) {
  if (!textNode?.isConnected || textNode.nodeType !== Node.TEXT_NODE) return;
  const range = document.createRange();
  const max = textNode.textContent?.length ?? 0;
  range.setStart(textNode, Math.max(0, Math.min(offset, max)));
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function focusCaretBefore(node: any) {
  if (!node?.isConnected) return;
  const range = document.createRange();
  range.setStartBefore(node);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function focusCaretBeforeFieldToken(fieldToken: any, container: any) {
  const earlier = skipBridgeNodes(fieldToken.previousSibling, 'backward', container);
  if (earlier?.nodeType === Node.TEXT_NODE) {
    focusCaretInText(earlier, earlier.textContent?.length ?? 0);
    return;
  }
  focusCaretBefore(fieldToken);
}

function isNonEditableStructureNode(node: any) {
  return (
    node?.nodeType === Node.ELEMENT_NODE &&
    (node.classList?.contains('document-columns') ||
      node.classList?.contains('document-columns__col-resizer') ||
      node.classList?.contains('document-columns__toolbar') ||
      node.classList?.contains('document-table') ||
      node.classList?.contains('document-table__toolbar') ||
      node.classList?.contains('editor-drag-handle'))
  );
}

function skipBridgeNodes(node: any, direction: any, container: any) {
  let current = node;
  while (current) {
    if (!container.contains(current)) return null;
    if (isCaretAnchorTextNode(current)) {
      return current;
    }
    if (isIgnorableText(current) || isNonEditableStructureNode(current)) {
      current = direction === 'forward' ? current.nextSibling : current.previousSibling;
      continue;
    }
    if (current.nodeName === 'BR') {
      current = direction === 'forward' ? current.nextSibling : current.previousSibling;
      continue;
    }
    return current;
  }
  return null;
}

function findFieldTokenBeforeCaret(range: any, container: any) {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const prev = skipBridgeNodes(range.startContainer.previousSibling, 'backward', container);
    return isFieldToken(prev) ? prev : null;
  }

  if (range.startContainer.nodeType === Node.ELEMENT_NODE && range.startOffset > 0) {
    const prev = skipBridgeNodes(
      range.startContainer.childNodes[range.startOffset - 1],
      'backward',
      container,
    );
    return isFieldToken(prev) ? prev : null;
  }

  return null;
}

function findTextNodeAfterFieldToken(fieldToken: any, container: any) {
  const after = skipBridgeNodes(fieldToken.nextSibling, 'forward', container);
  if (after?.nodeType === Node.TEXT_NODE && stripFieldTokenCaretAnchors(after.textContent).length > 0) {
    return after;
  }
  return null;
}

function caretIsBeforeVisibleTextAfterField(range: any, container: any) {
  const fieldToken = findFieldTokenBeforeCaret(range, container);
  if (!fieldToken) return false;

  const textAfter = findTextNodeAfterFieldToken(fieldToken, container);
  if (!textAfter) return false;

  const enterOffset = caretPositionAfterFieldToken(textAfter);
  if (range.startContainer === textAfter) {
    return range.startOffset < enterOffset;
  }

  if (range.startContainer.nodeType === Node.ELEMENT_NODE && range.startOffset > 0) {
    const prev = range.startContainer.childNodes[range.startOffset - 1];
    return isFieldToken(prev) && range.startContainer.childNodes[range.startOffset] === textAfter;
  }

  return false;
}

function enterVisibleTextAfterField(range: any, container: any) {
  const fieldToken = findFieldTokenBeforeCaret(range, container);
  if (!fieldToken) return false;

  const textAfter = ensureCaretAnchorAfter(fieldToken) ?? findTextNodeAfterFieldToken(fieldToken, container);
  if (!textAfter) {
    focusCaretAfter(fieldToken);
    return true;
  }

  if (isCaretAnchorTextNode(textAfter)) {
    container.focus?.();
    focusCaretAtFieldBridge(textAfter);
    return true;
  }

  const enterOffset = caretPositionAfterFieldToken(textAfter);
  if (range.startContainer === textAfter && range.startOffset >= enterOffset) {
    return false;
  }

  container.focus?.();
  focusCaretInText(textAfter, enterOffset);
  return true;
}

function stopArrowEvent(e: any) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function normalizeCollapsedCaret(container: any) {
  // Self-heal after drag/drop or paste left adjacent field tokens without a ZWSP.
  ensureFieldTokenCaretAnchors(container);

  const range = getCollapsedCaretRange(container);
  if (!range) return;

  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    // Standalone bridge: keep caret at offset 0 (visible after the field).
    // Offset > 0 is past the only invisible character and often paints nothing.
    if (isCaretAnchorTextNode(textNode) && range.startOffset > 0) {
      focusCaretAtFieldBridge(textNode);
      return;
    }
    if (
      isFieldToken(textNode.previousSibling) &&
      hasLeadingCaretAnchor(textNode.textContent) &&
      stripFieldTokenCaretAnchors(textNode.textContent).length > 0 &&
      range.startOffset === 0
    ) {
      focusCaretInText(textNode, 1);
    }
    return;
  }

  if (range.startContainer.nodeType !== Node.ELEMENT_NODE) return;

  const prev = range.startContainer.childNodes[range.startOffset - 1];
  const next = range.startContainer.childNodes[range.startOffset];

  // Caret parked after a standalone bridge at the parent boundary — pull back
  // into the bridge so Chrome keeps drawing it.
  if (isCaretAnchorTextNode(prev)) {
    focusCaretAtFieldBridge(prev);
    return;
  }

  if (!isFieldToken(prev)) return;

  if (isCaretAnchorTextNode(next)) {
    focusCaretAtFieldBridge(next);
    return;
  }

  focusCaretAfter(prev);
}

function focusCaretInEditable(el: any, atEnd = false) {
  if (!el) return false;
  el.focus?.();
  const sel = window.getSelection();
  if (!sel) return false;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

function focusCaretAroundStructure(node: any, direction: any) {
  if (!isNonEditableStructureNode(node)) return false;

  if (node.classList?.contains('document-columns')) {
    const cols = [...node.querySelectorAll(':scope > .document-columns__grid > .document-columns__col')];
    if (cols.length) {
      const target = direction === 'forward' ? cols[0] : cols[cols.length - 1];
      return focusCaretInEditable(target, direction !== 'forward');
    }
  }

  if (!node.parentNode) return false;
  const range = document.createRange();
  if (direction === 'forward') range.setStartAfter(node);
  else range.setStartBefore(node);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  return true;
}

function handleArrowNavigation(range: any, direction: any, container: any) {
  const forward = direction === 'forward';

  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    const atStart = range.startOffset === 0;
    const atEnd = range.startOffset === (textNode.textContent?.length ?? 0);

    if (!forward && atStart) {
      const before = skipBridgeNodes(textNode.previousSibling, 'backward', container);
      if (isFieldToken(before)) {
        focusCaretBeforeFieldToken(before, container);
        return true;
      }
      if (isNonEditableStructureNode(before) && focusCaretAroundStructure(before, 'backward')) {
        return true;
      }
    }

    if (!forward && isCaretAnchorTextNode(textNode)) {
      const before = skipBridgeNodes(textNode.previousSibling, 'backward', container);
      if (isFieldToken(before)) {
        focusCaretBeforeFieldToken(before, container);
        return true;
      }
      focusCaretBefore(textNode);
      return true;
    }

    if (
      !forward &&
      isFieldToken(textNode.previousSibling) &&
      hasLeadingCaretAnchor(textNode.textContent) &&
      stripFieldTokenCaretAnchors(textNode.textContent).length > 0 &&
      range.startOffset === caretPositionAfterFieldToken(textNode)
    ) {
      focusCaretBeforeFieldToken(textNode.previousSibling, container);
      return true;
    }

    if (forward && atEnd) {
      const after = skipBridgeNodes(textNode.nextSibling, 'forward', container);
      if (after?.nodeType === Node.TEXT_NODE) {
        focusCaretInText(after, caretPositionAfterFieldToken(after));
        return true;
      }
      if (isFieldToken(after)) {
        focusCaretAfter(after);
        return true;
      }
      if (isNonEditableStructureNode(textNode.nextSibling) &&
          focusCaretAroundStructure(textNode.nextSibling, 'forward')) {
        return true;
      }
    }

    if (forward && hasLeadingCaretAnchor(textNode.textContent) && range.startOffset === 0) {
      if (isCaretAnchorTextNode(textNode)) {
        // Leave the standalone bridge toward the next visible node (or stay put
        // only when there is nothing after — still keep caret painted at offset 0).
        const afterAnchor = skipBridgeNodes(textNode.nextSibling, 'forward', container);
        if (
          afterAnchor?.nodeType === Node.TEXT_NODE &&
          stripFieldTokenCaretAnchors(afterAnchor.textContent).length > 0
        ) {
          focusCaretInText(afterAnchor, caretPositionAfterFieldToken(afterAnchor));
          return true;
        }
        if (isFieldToken(afterAnchor)) {
          focusCaretAfter(afterAnchor);
          return true;
        }
        // Nothing further on this line — let the browser handle (e.g. next block).
        return false;
      }
      focusCaretInText(textNode, 1);
      return true;
    }

    return false;
  }

  const adjacent = forward
    ? getNodeAfterCaret(range, container)
    : getNodeBeforeCaret(range, container);

  if (isNonEditableStructureNode(adjacent) && focusCaretAroundStructure(adjacent, direction)) {
    return true;
  }

  const normalized = skipBridgeNodes(adjacent, direction, container);

  if (normalized?.nodeType === Node.TEXT_NODE) {
    if (isCaretAnchorTextNode(normalized)) {
      if (forward) {
        const afterAnchor = normalized.nextSibling;
        if (
          afterAnchor?.nodeType === Node.TEXT_NODE &&
          stripFieldTokenCaretAnchors(afterAnchor.textContent).length > 0
        ) {
          focusCaretInText(afterAnchor, caretPositionAfterFieldToken(afterAnchor));
          return true;
        }
        if (isFieldToken(afterAnchor)) {
          focusCaretAfter(afterAnchor);
          return true;
        }
        focusCaretAtFieldBridge(normalized);
        return true;
      }
      const before = skipBridgeNodes(normalized.previousSibling, 'backward', container);
      if (isFieldToken(before)) {
        focusCaretBeforeFieldToken(before, container);
        return true;
      }
      focusCaretBefore(normalized);
      return true;
    }

    focusCaretInText(
      normalized,
      forward ? caretPositionAfterFieldToken(normalized) : normalized.textContent?.length ?? 0,
    );
    return true;
  }

  if (isFieldToken(normalized)) {
    if (forward) {
      focusCaretAfter(normalized);
    } else {
      focusCaretBeforeFieldToken(normalized, container);
    }
    return true;
  }

  if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
    const index = forward ? range.startOffset : range.startOffset - 1;
    const node = range.startContainer.childNodes[index];
    if (isFieldToken(node)) {
      if (forward) {
        const after = skipBridgeNodes(node.nextSibling, 'forward', container);
        if (after?.nodeType === Node.TEXT_NODE) {
          focusCaretInText(after, caretPositionAfterFieldToken(after));
          return true;
        }
        focusCaretAfter(node);
      } else {
        focusCaretBeforeFieldToken(node, container);
      }
      return true;
    }
  }

  return false;
}

export function moveFieldTokenToCaret(token: any, range: any, bridgeBr: any) {
  bridgeBr?.remove();
  const insertRange = range.cloneRange();
  const editableRoot =
    token.parentElement?.closest?.('[contenteditable="true"]') ?? token.parentElement;
  removeTrailingCaretBridge(token);
  token.remove();
  insertRange.insertNode(token);
  if (editableRoot) ensureFieldTokenCaretAnchors(editableRoot);
  else ensureCaretAnchorAfter(token);
  focusCaretAfter(token);
}

/**
 * Backspace at the end of a ZWSP bridge (or Delete at its start) would remove the
 * only caret landing spot between contenteditable=false field tokens.
 */
export function findStandaloneCaretBridgeTargetedByDelete(range: any, direction: any) {
  const node = range?.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE || !isCaretAnchorTextNode(node)) {
    return null;
  }
  if (direction === 'backward') {
    return range.startOffset > 0 ? node : null;
  }
  return range.startOffset === 0 ? node : null;
}

/** Keep the bridge; step the caret across it instead of deleting it. */
function preserveCaretBridgeOnDelete(range: any, direction: any, container: any) {
  const bridge = findStandaloneCaretBridgeTargetedByDelete(range, direction);
  if (!bridge) return false;

  if (direction === 'backward') {
    // Sit at offset 0 so the next Backspace can delete the preceding field.
    focusCaretAtFieldBridge(bridge);
    return true;
  }

  const after = skipBridgeNodes(bridge.nextSibling, 'forward', container);
  if (isFieldToken(after)) {
    focusCaretAfter(after);
    return true;
  }
  if (after?.nodeType === Node.TEXT_NODE) {
    focusCaretInText(after, caretPositionAfterFieldToken(after));
    return true;
  }
  focusCaretAtFieldBridge(bridge);
  return true;
}

function isTableCellToken(token: any) {
  return !!token?.classList?.contains('field-token--cell');
}

function deleteFieldToken(token: any, onDeleteField: any, onStructureChange: any) {
  if (!token?.isConnected || isTableCellToken(token)) return;
  removeTrailingCaretBridge(token);
  onDeleteField?.(token.dataset.fieldId, token);
  token.remove();
  onStructureChange?.();
}

function getVisibleSiblingAfterField(fieldToken: any, container: any) {
  let node = fieldToken.nextSibling;
  while (node && container.contains(node)) {
    if (isCaretAnchorTextNode(node)) {
      node = node.nextSibling;
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return stripFieldTokenCaretAnchors(node.textContent).length > 0 ? node : null;
    }
    if (isFieldToken(node) || node.nodeName === 'BR') {
      return node;
    }
    break;
  }
  return null;
}

function fieldIsTrailing(fieldToken: any, container: any) {
  return !getVisibleSiblingAfterField(fieldToken, container);
}

function lineVisibleContent(text: any) {
  return String(text ?? '').split('\n')[0].replace(/\u200B/g, '').replace(/[\s.,;:!?]/g, '');
}

function hasSameLineContentAfterFieldExit(range: any, fieldToken: any, container: any) {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    let previous = textNode.previousSibling;
    while (previous && (isCaretAnchorTextNode(previous) || isIgnorableText(previous))) {
      previous = previous.previousSibling;
    }
    if (previous !== fieldToken) return true;

    const visible = stripFieldTokenCaretAnchors(textNode.textContent);
    const enterOffset = caretPositionAfterFieldToken(textNode);
    const afterCaret = visible.slice(Math.max(0, range.startOffset - enterOffset));
    return lineVisibleContent(afterCaret).length > 0;
  }

  let node = fieldToken.nextSibling;
  while (node && container.contains(node)) {
    if (isCaretAnchorTextNode(node)) {
      node = node.nextSibling;
      continue;
    }
    if (node.nodeName === 'BR') return false;
    if (node.nodeType === Node.TEXT_NODE) {
      const visible = stripFieldTokenCaretAnchors(node.textContent);
      if (lineVisibleContent(visible).length > 0) return true;
      if (visible.includes('\n')) return false;
      return false;
    }
    if (isFieldToken(node)) return true;
    break;
  }
  return false;
}

function shouldDeleteFieldOnBackwardFromExit(range: any, fieldToken: any, container: any) {
  if (!isCaretOnFieldExitPosition(range, fieldToken, container)) return false;
  if (fieldIsTrailing(fieldToken, container)) return true;
  return !hasSameLineContentAfterFieldExit(range, fieldToken, container);
}

function isCaretOnFieldExitPosition(range: any, fieldToken: any, container: any) {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    let previous = textNode.previousSibling;
    while (previous && (isCaretAnchorTextNode(previous) || isIgnorableText(previous))) {
      previous = previous.previousSibling;
    }
    if (previous !== fieldToken) return false;
    if (isCaretAnchorTextNode(textNode)) return true;
    if (
      hasLeadingCaretAnchor(textNode.textContent) &&
      range.startOffset <= caretPositionAfterFieldToken(textNode)
    ) {
      return true;
    }
    return false;
  }

  if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
    let current = getNodeBeforeCaret(range, container);
    while (current && (isCaretAnchorTextNode(current) || isIgnorableText(current))) {
      current = current.previousSibling;
    }
    return current === fieldToken;
  }

  return false;
}

function findBackwardFieldTokenFromCaret(range: any, container: any) {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    if (isCaretAnchorTextNode(textNode)) {
      const before = skipBridgeNodes(textNode.previousSibling, 'backward', container);
      return isFieldToken(before) ? before : null;
    }
    if (
      range.startOffset === 0 ||
      (hasLeadingCaretAnchor(textNode.textContent) &&
        range.startOffset <= caretPositionAfterFieldToken(textNode))
    ) {
      const before = skipBridgeNodes(textNode.previousSibling, 'backward', container);
      return isFieldToken(before) ? before : null;
    }
    return null;
  }

  if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
    const start = getNodeBeforeCaret(range, container);
    if (!start) return null;
    if (isFieldToken(start)) return start;
    const walked = walkBackward(start, container);
    return walked?.token ?? null;
  }

  return null;
}

function tryDeleteTrailingFieldOnBackwardDelete(range: any, container: any, { onDeleteField, onStructureChange }: any) {
  const fieldToken = findBackwardFieldTokenFromCaret(range, container);
  if (!fieldToken || !shouldDeleteFieldOnBackwardFromExit(range, fieldToken, container)) {
    return false;
  }
  deleteFieldToken(fieldToken, onDeleteField, onStructureChange);
  return true;
}

function deleteSelectedTokens(container: any, onDeleteField: any, onStructureChange: any) {
  const selected = sortTokensByDocumentOrder(getSelectedFieldTokens(container));
  if (!selected.length) return false;

  // Table column/cell fields are structural — Delete must not remove them.
  const deletable = selected.filter((token: any) => !isTableCellToken(token));
  if (!deletable.length) return true;

  for (const token of deletable) {
    onDeleteField?.(token.dataset.fieldId, token);
  }
  clearAllDesignTokenSelection(document);
  onStructureChange?.();
  return true;
}

function shouldIgnoreFieldDeleteKey(target: any) {
  if (!target) return true;
  const el = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
  if (!el) return true;
  if (el.closest('.modal-overlay:not([hidden])')) return true;
  if (el.closest('input, textarea, select, .schema-editor, .document-section__label-input')) return true;
  return false;
}

function resolveProtectFieldsInFillMode(options: any) {
  if (typeof options.getProtectFieldsInFillMode === 'function') {
    return options.getProtectFieldsInFillMode() !== false;
  }
  return options.protectFieldsInFillMode !== false;
}

function selectionIncludesProtectedFieldTokens(container: any, protectFields: any) {
  if (!protectFields) return false;
  return getFieldTokensForClipboard(container).length > 0;
}

function shouldBlockFillModeFieldDelete(container: any, range: any, direction: any, protectFields: any) {
  if (!protectFields) return false;

  if (getFieldTokensForClipboard(container).length) return true;

  if (!range) return false;

  const adjacent = findAdjacentFieldToken(range, direction, container);
  return !!adjacent?.token;
}

export function wireFieldTokenKeyboard(container: any, options: any = {}) {
  const { designMode = false, mappingMode = false, onDeleteField, onStructureChange } = options;
  if (mappingMode) {
    return () => {};
  }

  ensureFieldTokenCaretAnchors(container);

  function getFillFocusSchemas() {
    return options.getRegistry?.()?.getFieldSchemas?.() ?? options.fieldSchemas ?? {};
  }

  function handleFillFieldFocusKeys(e: any) {
    if (designMode) return false;
    if (shouldIgnoreFieldDeleteKey(e.target)) return false;
    if (isFillModalOverlayOpen()) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    const holder = resolveFillFocusHolder(container, options);
    const getSchemas = () => getFillFocusSchemas();

    if (e.key === 'Tab') {
      const tokens = collectEditableFillFieldTokens(holder, getSchemas);
      if (!tokens.length) return false;
      const moved = moveFillFieldFocus(holder, e.shiftKey ? -1 : 1, getSchemas);
      if (!moved) return false;
      e.preventDefault();
      e.stopPropagation();
      return true;
    }

    if ((e.key === 'Enter' || e.key === ' ') && !e.shiftKey) {
      const focused = getFocusedFillFieldToken(holder);
      if (!focused || !options.onActivateFillField) return false;
      e.preventDefault();
      e.stopPropagation();
      void options.onActivateFillField(focused);
      return true;
    }

    return false;
  }

  function handleSelectionChange() {
    // Field dialogs own keyboard/selection while open — don't heal canvas carets
    // (arrows would otherwise keep moving "selected" text behind the overlay).
    if (isFillModalOverlayOpen()) return;
    normalizeCollapsedCaret(container);
  }

  function handleInput(e: any) {
    if (isFillModalOverlayOpen()) return;
    // Native deletes can still collapse bridges (e.g. selecting ZWSP+text). Re-anchor.
    if (
      e.inputType === 'deleteContentBackward' ||
      e.inputType === 'deleteContentForward' ||
      e.inputType === 'deleteByCut' ||
      e.inputType === 'deleteByDrag' ||
      e.inputType === 'historyUndo' ||
      e.inputType === 'historyRedo'
    ) {
      ensureFieldTokenCaretAnchors(container);
      normalizeCollapsedCaret(container);
    }
  }

  function handleBeforeInput(e: any) {
    if (isFillModalOverlayOpen()) return;
    if (
      e.inputType === 'insertParagraph' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !shouldIgnoreFieldDeleteKey(e.target)
    ) {
      const range = getCollapsedCaretRange(container);
      if (range && !range.startContainer?.parentElement?.closest?.('.field-token')) {
        e.preventDefault();
        insertLineBreakAtCaret(container);
        normalizeEditableLineStructure(container);
        onStructureChange?.();
        return;
      }
    }

    if (
      e.inputType !== 'deleteContentForward' &&
      e.inputType !== 'deleteContentBackward' &&
      e.inputType !== 'deleteByCut'
    ) {
      return;
    }

    if (designMode) {
      const selected = getSelectedFieldTokens(container);
      if (selected.length) {
        e.preventDefault();
        deleteSelectedTokens(container, onDeleteField, onStructureChange);
        return;
      }

      const range = getCollapsedCaretRange(container);
      if (!range) return;

      const direction = e.inputType === 'deleteContentForward' ? 'forward' : 'backward';
      if (preserveCaretBridgeOnDelete(range, direction, container)) {
        e.preventDefault();
        return;
      }

      if (
        direction === 'backward' &&
        tryDeleteTrailingFieldOnBackwardDelete(range, container, { onDeleteField, onStructureChange })
      ) {
        e.preventDefault();
        return;
      }

      const adjacent = findAdjacentFieldToken(range, direction, container);
      if (!adjacent) return;

      e.preventDefault();
      moveFieldTokenToCaret(adjacent.token, range, adjacent.bridgeBr);
      onStructureChange?.();
      return;
    }

    const protectFields = resolveProtectFieldsInFillMode(options);

    if (selectionIncludesProtectedFieldTokens(container, protectFields)) {
      e.preventDefault();
      return;
    }

    const range = getCollapsedCaretRange(container);
    if (!range) return;

    const direction = e.inputType === 'deleteContentForward' ? 'forward' : 'backward';

    if (preserveCaretBridgeOnDelete(range, direction, container)) {
      e.preventDefault();
      return;
    }

    if (shouldBlockFillModeFieldDelete(container, range, direction, protectFields)) {
      e.preventDefault();
      return;
    }

    if (
      !protectFields &&
      direction === 'backward' &&
      tryDeleteTrailingFieldOnBackwardDelete(range, container, { onDeleteField, onStructureChange })
    ) {
      e.preventDefault();
      return;
    }

    if (direction === 'backward' && isCaretAtLineStart(range, container)) {
      if (mergeLineBackwardAtCaret(container, range)) {
        e.preventDefault();
        onStructureChange?.();
      }
      return;
    }

    const adjacent = findAdjacentFieldToken(range, direction, container);
    if (!adjacent?.bridgeBr) return;

    e.preventDefault();
    adjacent.bridgeBr.remove();
    onStructureChange?.();
  }

  function handleArrowKey(e: any) {
    if (isFillModalOverlayOpen()) return false;
    if (!shouldIgnoreFieldDeleteKey(e.target)) {
      const range = getCollapsedCaretRange(container);
      if (!range) return false;

      const direction = e.key === 'ArrowRight' ? 'forward' : 'backward';
      if (
        direction === 'forward' &&
        caretIsBeforeVisibleTextAfterField(range, container) &&
        enterVisibleTextAfterField(range, container)
      ) {
        normalizeCollapsedCaret(container);
        return true;
      }

      if (handleArrowNavigation(range, direction, container)) {
        container.focus?.();
        return true;
      }
    }

    return false;
  }

  function handleKeyDown(e: any) {
    // While a field dialog is open, ignore canvas keyboard entirely — even if
    // focus/selection leaked back onto a contenteditable behind the overlay.
    if (isFillModalOverlayOpen()) return;

    if (handleFillFieldFocusKeys(e)) return;

    if (
      (e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey
    ) {
      if (handleArrowKey(e)) {
        stopArrowEvent(e);
        return;
      }
    }

    if (
      (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey &&
      !shouldIgnoreFieldDeleteKey(e.target) &&
      getCollapsedCaretRange(container)
    ) {
      normalizeEditableLineStructure(container);
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (shouldIgnoreFieldDeleteKey(e.target)) return;

      // Use the nested-aware caret range so the section body does not also
      // insert a <br> when Enter is pressed inside a column cell.
      const range = getCollapsedCaretRange(container);
      if (!range) return;
      if (range.startContainer?.parentElement?.closest?.('.field-token')) return;

      e.preventDefault();
      e.stopPropagation();
      insertLineBreakAtCaret(container);
      normalizeEditableLineStructure(container);
      onStructureChange?.();
      return;
    }

    if (!designMode) {
      const protectFields = resolveProtectFieldsInFillMode(options);

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'x') {
        if (
          !shouldIgnoreFieldDeleteKey(e.target) &&
          selectionIncludesProtectedFieldTokens(container, protectFields)
        ) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !shouldIgnoreFieldDeleteKey(e.target) &&
        selectionIncludesProtectedFieldTokens(container, protectFields)
      ) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!shouldIgnoreFieldDeleteKey(e.target) && !protectFields) {
          const range = getCollapsedCaretRange(container);
          if (
            range &&
            tryDeleteTrailingFieldOnBackwardDelete(range, container, { onDeleteField, onStructureChange })
          ) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }

      return;
    }

    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (shouldIgnoreFieldDeleteKey(e.target)) return;

    const selected = getSelectedFieldTokens(container);
    if (!selected.length) return;

    e.preventDefault();
    deleteSelectedTokens(container, onDeleteField, onStructureChange);
  }

  function handleCut(e: any) {
    if (designMode) return;
    if (shouldIgnoreFieldDeleteKey(e.target)) return;
    if (!selectionIncludesProtectedFieldTokens(container, resolveProtectFieldsInFillMode(options))) {
      return;
    }
    e.preventDefault();
  }

  container.addEventListener('beforeinput', handleBeforeInput);
  container.addEventListener('input', handleInput);
  container.addEventListener('cut', handleCut);
  container.addEventListener('click', handleSelectionChange);
  container.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('selectionchange', handleSelectionChange);

  return () => {
    container.removeEventListener('beforeinput', handleBeforeInput);
    container.removeEventListener('input', handleInput);
    container.removeEventListener('cut', handleCut);
    container.removeEventListener('click', handleSelectionChange);
    container.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('selectionchange', handleSelectionChange);
  };
}
