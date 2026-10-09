const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'BR', 'UL', 'OL', 'LI', 'SPAN', 'MARK', 'CODE', 'DIV',
  'H1', 'H2', 'H3',
]);

const ALLOWED_STYLES = new Set([
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
  'font-family',
  'font-size',
  'text-align',
]);

const ALLOWED_TEXT_ALIGN = new Set(['left', 'center', 'right', 'justify']);

const SIZE_UNIT_TO_PX = {
  px: 1,
  pt: 96 / 72,
  em: 16,
  rem: 16,
  '%': 0.15,
};

function normalizeFontFamilyPart(part: any) {
  let name = String(part ?? '').trim();
  if (!name) return null;
  if (/^['"].*['"]$/.test(name)) {
    name = name.slice(1, -1).trim();
  }
  if (!name || !/^[\w\s\-'.]+$/i.test(name)) return null;
  if (/\s/.test(name)) return `"${name.replace(/"/g, '')}"`;
  return name;
}

export function normalizeFontFamily(value: any) {
  let trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed.length > 200) return null;
  if (!/^[\w\s\-'",.]+$/i.test(trimmed)) return null;

  if (/^['"].*['"]$/.test(trimmed)) {
    trimmed = trimmed.slice(1, -1).trim();
    if (!trimmed) return null;
  }

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((part: any) => normalizeFontFamilyPart(part));
    if (parts.some((part: any) => !part)) return null;
    return parts.join(', ');
  }

  return normalizeFontFamilyPart(trimmed);
}

export function normalizeFontSize(value: any) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^([\d.]+)\s*(px|pt|em|rem|%)?$/i);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return null;

  const unit = (match[2] || 'px').toLowerCase();
  const pxEquiv = num * ((SIZE_UNIT_TO_PX as any)[unit] ?? 1);
  if (pxEquiv < 6 || pxEquiv > 96) return null;

  return `${num}${unit}`;
}

function buildSpanStyleAttr(styles: any) {
  const parts = [];
  if (styles.fontFamily) parts.push(`font-family: ${styles.fontFamily}`);
  if (styles.fontSize) parts.push(`font-size: ${styles.fontSize}`);
  return parts.join('; ');
}

function sanitizeStyleRule(prop: any, value: any) {
  const p = prop.trim().toLowerCase();
  const v = value.trim();
  if (!v) return null;

  if (p === 'font-family') {
    const normalized = normalizeFontFamily(v);
    return normalized ? `font-family: ${normalized}` : null;
  }
  if (p === 'font-size') {
    const normalized = normalizeFontSize(v);
    return normalized ? `font-size: ${normalized}` : null;
  }
  if (p === 'text-align') {
    const align = v.toLowerCase();
    return ALLOWED_TEXT_ALIGN.has(align) ? `text-align: ${align}` : null;
  }
  if (ALLOWED_STYLES.has(p)) return `${p}: ${v}`;
  return null;
}

function filterSpanStyle(styleValue: any) {
  const safe = styleValue
    .split(';')
    .map((rule: any) => rule.trim())
    .filter(Boolean)
    .map((rule: any) => {
      const colon = rule.indexOf(':');
      if (colon === -1) return null;
      const prop = rule.slice(0, colon).trim().toLowerCase();
      if (prop === 'text-align') return null;
      return sanitizeStyleRule(rule.slice(0, colon), rule.slice(colon + 1));
    })
    .filter(Boolean)
    .join('; ');
  return safe || null;
}

function filterBlockStyle(styleValue: any) {
  const safe = styleValue
    .split(';')
    .map((rule: any) => rule.trim())
    .filter(Boolean)
    .map((rule: any) => {
      const colon = rule.indexOf(':');
      if (colon === -1) return null;
      const prop = rule.slice(0, colon).trim().toLowerCase();
      if (prop !== 'text-align') return null;
      return sanitizeStyleRule(prop, rule.slice(colon + 1));
    })
    .filter(Boolean)
    .join('; ');
  return safe || null;
}

export function getBlockTextAlign(styleValue: any) {
  const style = filterBlockStyle(styleValue);
  if (!style) return null;
  const match = style.match(/text-align:\s*(\w+)/);
  return match?.[1] ?? null;
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3']);

export function isHeadingElement(node: any) {
  return node?.nodeType === Node.ELEMENT_NODE && HEADING_TAGS.has(node.tagName);
}

export function isAlignmentDiv(node: any) {
  return (
    node?.nodeType === Node.ELEMENT_NODE &&
    node.tagName === 'DIV' &&
    !!getBlockTextAlign(node.getAttribute('style') || '')
  );
}

function hoistMisnestedListItems(list: any) {
  const misplaced = [...list.querySelectorAll('li')].filter(
    (li: any) => li.parentElement !== list,
  );

  for (const li of misplaced) {
    let wrapper = li.parentElement;
    while (wrapper && wrapper.parentElement !== list) {
      wrapper = wrapper.parentElement;
    }
    list.insertBefore(li, wrapper ? wrapper.nextSibling : null);
  }

  for (const child of [...list.children]) {
    if (child.tagName === 'LI') continue;
    const hasMeaningfulContent =
      child.textContent.trim().length > 0 ||
      !!child.querySelector('img, .field-token, br');
    if (!hasMeaningfulContent) {
      while (child.firstChild) {
        list.insertBefore(child.firstChild, child);
      }
      child.remove();
    }
  }
}

/** Ensure list items are direct children of ul/ol after inline formatting commands. */
export function normalizeLists(root: any) {
  if (!root?.querySelectorAll) return;
  for (const list of root.querySelectorAll('ol, ul')) {
    hoistMisnestedListItems(list);
  }
}

function finishRichTextCommand(editable: any, ok: any) {
  if (ok) normalizeLists(editable);
  return ok;
}

export function sanitizeHtml(html: any) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  function clean(node: any) {
    const children = [...node.childNodes];
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue;

      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }

      if (!ALLOWED_TAGS.has(child.tagName)) {
        clean(child);
        if (LINE_BREAKING_BLOCK_TAGS.has(child.tagName)) {
          unwrapPreservingLineBreak(node, child);
        } else {
          unwrapElement(child);
        }
        continue;
      }

      if (child.tagName === 'BR' && child.getAttribute('data-empty') === 'true') {
        child.remove();
        continue;
      }

      for (const attr of [...child.attributes]) {
        if (child.tagName === 'SPAN' && attr.name === 'style') {
          const safe = filterSpanStyle(attr.value);
          if (safe) child.setAttribute('style', safe);
          else child.removeAttribute('style');
        } else if (
          (child.tagName === 'DIV' || child.tagName === 'LI' || child.tagName === 'P') &&
          attr.name === 'style'
        ) {
          const safe = filterBlockStyle(attr.value);
          if (safe) child.setAttribute('style', safe);
          else child.removeAttribute('style');
        } else if (child.tagName === 'DIV' && attr.name === 'class') {
          const kept = String(attr.value || '')
            .split(/\s+/)
            .filter((c) => c === 'document-align' || c.startsWith('document-align--'))
            .join(' ');
          if (kept) child.setAttribute('class', kept);
          else child.removeAttribute('class');
        } else {
          child.removeAttribute(attr.name);
        }
      }

      if (child.tagName === 'SPAN' && !child.attributes.length) {
        clean(child);
        unwrapElement(child);
        continue;
      }

      if (child.tagName === 'DIV' && !child.attributes.length) {
        clean(child);
        unwrapPreservingLineBreak(node, child);
        continue;
      }

      clean(child);
    }
  }

  clean(doc.body);
  normalizeLists(doc.body);
  return doc.body.innerHTML;
}

export function isPlainTextHtml(html: any) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.childNodes.length === 1 && doc.body.firstChild?.nodeType === Node.TEXT_NODE;
}

export function appendHtmlToFragment(fragment: any, html: any) {
  const wrap = document.createElement('div');
  wrap.innerHTML = sanitizeHtml(plainTextNewlinesToBr(html));
  while (wrap.firstChild) {
    fragment.appendChild(wrap.firstChild);
  }
}

/**
 * Replace literal newlines in HTML text nodes with <br> so line breaks survive HTML rendering.
 * @param {string} html
 * @returns {string}
 */
export function plainTextNewlinesToBr(html: any) {
  const value = String(html ?? '');
  if (!value.includes('\n')) return value;

  const wrap = document.createElement('div');
  wrap.innerHTML = value;

  function process(node: any) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        if (!text.includes('\n')) continue;
        const frag = document.createDocumentFragment();
        const pieces = text.split('\n');
        pieces.forEach((piece: any, index: any) => {
          if (piece) frag.appendChild(document.createTextNode(piece));
          if (index < pieces.length - 1) frag.appendChild(document.createElement('br'));
        });
        child.parentNode?.replaceChild(frag, child);
        continue;
      }
      if (child.nodeType === Node.ELEMENT_NODE) process(child);
    }
  }

  process(wrap);
  return wrap.innerHTML;
}

export function isHtmlValueEmpty(html: any) {
  const sanitized = sanitizeHtml(String(html ?? ''));
  if (!sanitized.trim()) return true;

  const doc = new DOMParser().parseFromString(sanitized, 'text/html');
  const text = (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  if (text) return false;

  return !doc.body.querySelector('img, br, li, ul, ol');
}

/** Window for an editable node (supports iframe contenteditables). */
function ownerWindow(node: any): Window {
  return (node?.ownerDocument?.defaultView as Window | null | undefined) ?? window;
}

function selectionFor(node: any): Selection | null {
  return ownerWindow(node).getSelection();
}

export function saveSelection(container: any) {
  const sel = selectionFor(container);
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!container?.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

export function restoreSelection(range: any) {
  if (!range) return false;
  const root = range?.commonAncestorContainer;
  const sel = selectionFor(root?.nodeType === Node.TEXT_NODE ? root.parentNode : root) ?? window.getSelection();
  sel!.removeAllRanges();
  sel!.addRange(range);
  return true;
}

function rangeIntersectsNode(range: any, node: any) {
  if (!range || !node) return false;
  if (typeof range.intersectsNode === 'function') {
    return range.intersectsNode(node);
  }
  let ancestor = range.commonAncestorContainer;
  if (!ancestor) return false;
  if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentNode;
  return ancestor.contains?.(node) ?? false;
}

function rangeIntersectsFieldToken(range: any, editable: any) {
  for (const token of editable.querySelectorAll('.field-token')) {
    if (rangeIntersectsNode(range, token)) return true;
  }
  return false;
}

function isDocumentTableElement(node: any) {
  return node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains('document-table');
}

function isTableFieldToken(token: any) {
  return !!token?.closest?.('.document-table') || !!token?.classList?.contains('field-token--cell');
}

function unwrapElement(el: any) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

const LINE_BREAKING_BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'BLOCKQUOTE',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'PRE',
  'ADDRESS',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

function previousMeaningfulSibling(child: any) {
  let prev = child.previousSibling;
  while (prev) {
    if (prev.nodeType === Node.ELEMENT_NODE) return prev;
    if (prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? '').replace(/\u00a0/g, ' ').trim()) {
      return prev;
    }
    prev = prev.previousSibling;
  }
  return null;
}

/** Unwrap a block so contenteditable line breaks become <br> instead of one inline string. */
function unwrapPreservingLineBreak(parent: any, child: any) {
  const prev = previousMeaningfulSibling(child);
  if (prev && prev.nodeName !== 'BR') {
    parent.insertBefore(parent.ownerDocument.createElement('br'), child);
  }
  while (child.firstChild) {
    parent.insertBefore(child.firstChild, child);
  }
  child.remove();
}

function findAncestorTag(node: any, tagName: any, editable: any) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== editable) {
    if (el.tagName === tagName) return el;
    el = el.parentElement;
  }
  return null;
}

function getActiveRange(editable: any, savedRange: any) {
  if (!editable) return null;
  editable.focus();
  if (savedRange) restoreSelection(savedRange);

  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return null;
  if (rangeIntersectsFieldToken(range, editable)) return null;

  return range;
}

export function applyInlineSpanStyle(editable: any, styles: any, savedRange: any) {
  const styleAttr = buildSpanStyleAttr(styles);
  if (!styleAttr) return false;

  const range = getActiveRange(editable, savedRange);
  if (!range) return false;

  const el = document.createElement('span');
  el.setAttribute('style', styleAttr);

  try {
    range.surroundContents(el);
  } catch {
    const contents = range.extractContents();
    if (!contents.textContent && !contents.querySelector?.('img')) return false;
    el.appendChild(contents);
    range.insertNode(el);
  }

  const sel = window.getSelection();
  sel!.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(el);
  sel!.addRange(newRange);
  return true;
}

export function applyFontFormatting(editable: any, { fontFamily, fontSize }: any, savedRange: any) {
  const styles: any = {};
  if (fontFamily) {
    const normalized = normalizeFontFamily(fontFamily);
    if (normalized) styles.fontFamily = normalized;
  }
  if (fontSize) {
    const normalized = normalizeFontSize(fontSize);
    if (normalized) styles.fontSize = normalized;
  }
  if (!styles.fontFamily && !styles.fontSize) return false;
  return applyInlineSpanStyle(editable, styles, savedRange);
}

function clearFontStylesFromSelection(editable: any, savedRange: any) {
  if (!editable) return;
  editable.focus();
  if (savedRange) restoreSelection(savedRange);

  const sel = window.getSelection();
  if (!sel?.rangeCount) return;

  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return;

  for (const span of editable.querySelectorAll('span[style]')) {
    if (!range.intersectsNode(span)) continue;
    // Field tokens are styled spans — never strip or unwrap them as "formatting".
    if (span.classList?.contains('field-token') || span.closest?.('.field-token')) continue;

    const kept = (span.getAttribute('style') || '')
      .split(';')
      .map((rule: any) => rule.trim())
      .filter(Boolean)
      .map((rule: any) => {
        const colon = rule.indexOf(':');
        if (colon === -1) return null;
        const prop = rule.slice(0, colon).trim().toLowerCase();
        if (prop === 'font-family' || prop === 'font-size') return null;
        return sanitizeStyleRule(rule.slice(0, colon), rule.slice(colon + 1));
      })
      .filter(Boolean)
      .join('; ');

    if (kept) span.setAttribute('style', kept);
    else {
      unwrapElement(span);
    }
  }
}

function clearAlignmentFromSelection(editable: any, savedRange: any) {
  if (!editable) return;
  editable.focus();
  if (savedRange) restoreSelection(savedRange);

  const sel = window.getSelection();
  if (!sel?.rangeCount) return;

  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return;

  for (const block of editable.querySelectorAll('div[style]')) {
    if (!range.intersectsNode(block)) continue;
    if (filterBlockStyle(block.getAttribute('style') || '')) {
      unwrapElement(block);
    }
  }
}

function findAlignmentBlock(node: any, editable: any) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== editable) {
    if (isAlignmentDiv(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function nodeContainsCaret(node: any, range: any) {
  if (node === range.startContainer) return true;
  if (node.nodeType === Node.ELEMENT_NODE) return node.contains(range.startContainer);
  return false;
}

function isFieldTokenElement(node: any) {
  return node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains('field-token');
}

/**
 * Line range inside `container` (editable root, alignment div, or similar).
 * Split on BR / heading / table boundaries — not the whole container as one line.
 */
function getLineRangeInContainer(container: any, range: any) {
  const nodes = [...container.childNodes];
  if (!nodes.length) return null;

  let activeIndex = -1;
  if (range.startContainer === container) {
    activeIndex = Math.min(Math.max(range.startOffset, 0), nodes.length - 1);
  } else {
    for (let i = 0; i < nodes.length; i++) {
      if (nodeContainsCaret(nodes[i], range)) {
        activeIndex = i;
        break;
      }
    }
  }
  if (activeIndex === -1) return null;
  if (isDocumentTableElement(nodes[activeIndex])) return null;

  let lineStart = activeIndex;
  while (lineStart > 0 && nodes[lineStart - 1].nodeName !== 'BR') {
    const prev = nodes[lineStart - 1];
    if (HEADING_TAGS.has(prev.nodeName)) break;
    if (isDocumentTableElement(prev)) break;
    if (isAlignmentDiv(prev)) break;
    lineStart -= 1;
  }

  let lineEnd = activeIndex;
  while (lineEnd < nodes.length - 1 && nodes[lineEnd].nodeName !== 'BR') {
    const next = nodes[lineEnd + 1];
    if (HEADING_TAGS.has(next.nodeName)) break;
    if (isDocumentTableElement(next)) break;
    if (isAlignmentDiv(next)) break;
    lineEnd += 1;
  }

  for (let i = lineStart; i <= lineEnd; i += 1) {
    if (isDocumentTableElement(nodes[i])) return null;
  }

  const doc = container.ownerDocument ?? document;
  const lineRange = doc.createRange();
  lineRange.setStartBefore(nodes[lineStart]);
  if (nodes[lineEnd]?.nodeName === 'BR') {
    lineRange.setEndBefore(nodes[lineEnd]);
  } else {
    lineRange.setEndAfter(nodes[lineEnd]);
  }

  return lineRange.collapsed ? null : lineRange;
}

function getTopLevelLineRange(editable: any, range: any) {
  return getLineRangeInContainer(editable, range);
}

/** Nearest block that owns "lines" for alignment (LI, align div, or editable). */
function getAlignmentLineRoot(node: any, editable: any) {
  let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== editable) {
    if (el.tagName === 'LI') return el;
    if (isAlignmentDiv(el)) return el;
    if (isHeadingElement(el)) return el;
    el = el.parentElement;
  }
  return editable;
}

function selectionCoversElement(range: any, el: any) {
  if (!range || !el) return false;
  // Test / incomplete Range mocks: only full selectNodeContents-style ranges cover.
  if (typeof range.compareBoundaryPoints !== 'function') {
    return (
      range.startContainer === el &&
      range.endContainer === el &&
      range.startOffset === 0 &&
      range.endOffset === el.childNodes.length
    );
  }
  try {
    const doc = el.ownerDocument ?? document;
    const full = doc.createRange();
    full.selectNodeContents(el);
    return (
      range.compareBoundaryPoints(Range.START_TO_START, full) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, full) >= 0
    );
  } catch {
    return false;
  }
}

function applyAlignmentToElement(el: any, alignment: any) {
  if (!el) return false;
  el.style.textAlign = alignment;
  if (el.tagName === 'DIV') {
    setAlignmentDivClass(el, alignment);
    el.setAttribute('style', `text-align: ${alignment}`);
  } else {
    el.setAttribute('style', `text-align: ${alignment}`);
  }
  return true;
}

function setAlignmentDivClass(div: any, alignment: any) {
  div.classList.add('document-align');
  for (const side of ALLOWED_TEXT_ALIGN) {
    div.classList.toggle(`document-align--${side}`, side === alignment);
  }
}

function getFieldTokenFromRange(editable: any, range: any) {
  let el = range.startContainer;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  const token = el?.closest?.('.field-token');
  return token && editable.contains(token) ? token : null;
}

export function applyAlignmentToFieldToken(token: any, alignment: any) {
  if (!token || isTableFieldToken(token)) return false;

  const parent = token.parentElement;
  if (isAlignmentDiv(parent)) {
    parent.style.textAlign = alignment;
    setAlignmentDivClass(parent, alignment);
    return true;
  }

  const div = document.createElement('div');
  setAlignmentDivClass(div, alignment);
  div.setAttribute('style', `text-align: ${alignment}`);
  token.parentNode.insertBefore(div, token);
  div.appendChild(token);
  return true;
}

function wrapRangeInAlignmentDiv(range: any, alignment: any) {
  const div = document.createElement('div');
  setAlignmentDivClass(div, alignment);
  div.setAttribute('style', `text-align: ${alignment}`);

  const insertParent =
    range.startContainer?.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer?.parentNode;
  const insertOffset = range.startOffset ?? 0;

  const contents = range.extractContents();
  // Tables stay as top-level blocks — never nest them in an align wrapper.
  const extractedTables = [...(contents.querySelectorAll?.('.document-table') ?? [])];
  for (const table of extractedTables) {
    table.remove();
  }
  // linkedom DocumentFragment.textContent can be null — fall back to child text.
  const contentText = String(
    contents.textContent ??
      [...(contents.childNodes ?? [])].map((n: any) => n.textContent ?? '').join(''),
  );
  if (!contentText.trim() && !contents.querySelector?.('.field-token, img, br')) {
    for (const table of extractedTables) {
      if (insertParent) {
        const ref = insertParent.childNodes[insertOffset] ?? null;
        insertParent.insertBefore(table, ref);
      }
    }
    return null;
  }
  div.appendChild(contents);

  try {
    range.insertNode(div);
  } catch {
    // linkedom (and some edge ranges) detach the live range after extractContents.
    if (!insertParent) return null;
    const ref = insertParent.childNodes[insertOffset] ?? null;
    insertParent.insertBefore(div, ref);
  }

  let insertAfter = div;
  for (const table of extractedTables) {
    insertAfter.after(table);
    insertAfter = table;
  }
  return div;
}

export function applyBlockAlignment(editable: any, alignment: any, savedRange: any) {
  if (!editable || !ALLOWED_TEXT_ALIGN.has(alignment)) return false;
  editable.focus();
  if (savedRange) restoreSelection(savedRange);

  const sel = selectionFor(editable) ?? window.getSelection();
  if (!sel?.rangeCount) return false;
  let range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return false;

  // List items: align the LI only — not a wrapper around the whole editor.
  let startEl: any =
    range.startContainer?.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer;
  const li =
    startEl?.nodeType === Node.ELEMENT_NODE
      ? (startEl.closest?.('li') as HTMLElement | null)
      : null;
  if (li && editable.contains(li)) {
    const endNode =
      range.endContainer?.nodeType === Node.TEXT_NODE
        ? range.endContainer.parentNode
        : range.endContainer;
    const endInLi = range.collapsed || !!(endNode && li.contains(endNode));
    if (endInLi) {
      return applyAlignmentToElement(li, alignment);
    }
  }

  if (range.collapsed) {
    const selectedTokens = [...editable.querySelectorAll('.field-token--selected')].filter(
      (token: any) => !isTableFieldToken(token),
    );
    if (selectedTokens.length) {
      let applied = false;
      for (const token of selectedTokens) {
        if (applyAlignmentToFieldToken(token, alignment)) applied = true;
      }
      return applied;
    }

    const fieldToken = getFieldTokenFromRange(editable, range);
    if (fieldToken && !isTableFieldToken(fieldToken)) {
      return applyAlignmentToFieldToken(fieldToken, alignment);
    }

    // Align the current line only — never retarget a multi-line ancestor div.
    const lineRoot = getAlignmentLineRoot(range.startContainer, editable);
    const lineRange = getLineRangeInContainer(lineRoot, range);
    if (!lineRange) return false;

    if (isAlignmentDiv(lineRoot) && selectionCoversElement(lineRange, lineRoot)) {
      return applyAlignmentToElement(lineRoot, alignment);
    }

    return !!wrapRangeInAlignmentDiv(lineRange, alignment);
  }

  // Non-collapsed: only update an existing align block when the selection is the whole block.
  const existingBlock = findAlignmentBlock(range.commonAncestorContainer, editable);
  if (
    existingBlock &&
    !existingBlock.querySelector?.('.document-table') &&
    selectionCoversElement(range, existingBlock)
  ) {
    return applyAlignmentToElement(existingBlock, alignment);
  }

  // Selected content may include fields; tables are excluded from the wrap.
  return !!wrapRangeInAlignmentDiv(range, alignment);
}

function collectHeadingsInRange(range: any, editable: any) {
  return [...editable.querySelectorAll('h1, h2, h3')].filter((heading: any) =>
    rangeIntersectsNode(range, heading),
  );
}

function findOutermostHeading(range: any, editable: any) {
  const headings = collectHeadingsInRange(range, editable);
  if (!headings.length) return null;
  return (
    headings.find((heading: any) =>
      !headings.some((other: any) => other !== heading && other.contains(heading)),
    ) ?? headings[0]
  );
}

function flattenHeadingsInRange(range: any, editable: any) {
  const headings = collectHeadingsInRange(range, editable);
  headings.sort((a: any, b: any) => {
    if (a.contains(b)) return 1;
    if (b.contains(a)) return -1;
    return 0;
  });
  for (const heading of headings) {
    if (heading.isConnected) unwrapElement(heading);
  }
}

function replaceElementTag(el: any, tagName: any) {
  if (el.tagName === tagName) return el;
  const replacement = document.createElement(tagName);
  while (el.firstChild) {
    replacement.appendChild(el.firstChild);
  }
  el.parentNode.replaceChild(replacement, el);
  return replacement;
}

function wrapRangeInHeading(range: any, tagName: any) {
  const heading = document.createElement(tagName);
  const contents = range.extractContents();
  if (!contents.textContent && !contents.querySelector?.('.field-token, img, br')) return null;
  heading.appendChild(contents);
  range.insertNode(heading);
  return heading;
}

function clearHeadingsFromSelection(editable: any, savedRange: any) {
  if (!editable) return;
  editable.focus();
  if (savedRange) restoreSelection(savedRange);

  const sel = window.getSelection();
  if (!sel?.rangeCount) return;

  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return;

  for (const heading of editable.querySelectorAll('h1, h2, h3')) {
    if (!rangeIntersectsNode(range, heading)) continue;
    unwrapElement(heading);
  }
}

export function applyBlockHeading(editable: any, level: any, savedRange: any) {
  if (!editable || level < 1 || level > 3) return false;
  const tagName = `H${level}`;

  editable.focus();
  if (savedRange) restoreSelection(savedRange);

  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  let range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return false;

  if (range.collapsed) {
    if (rangeIntersectsFieldToken(range, editable)) return false;

    const lineRange = getTopLevelLineRange(editable, range);
    if (!lineRange) return false;
    range = lineRange;
  }

  if (rangeIntersectsFieldToken(range, editable)) return false;

  const outermostHeading = findOutermostHeading(range, editable);
  if (outermostHeading) {
    if (outermostHeading.tagName === tagName) {
      flattenHeadingsInRange(range, editable);
    } else {
      for (const inner of [...outermostHeading.querySelectorAll('h1, h2, h3')]) {
        unwrapElement(inner);
      }
      replaceElementTag(outermostHeading, tagName);
    }
    return true;
  }

  flattenHeadingsInRange(range, editable);
  return !!wrapRangeInHeading(range, tagName);
}

export function toggleInlineTag(editable: any, tagName: any, savedRange: any) {
  if (!editable) return false;
  editable.focus();
  if (savedRange) restoreSelection(savedRange);

  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return false;

  const range = sel.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return false;
  if (rangeIntersectsFieldToken(range, editable)) return false;

  const existing = findAncestorTag(range.commonAncestorContainer, tagName, editable);
  if (existing) {
    unwrapElement(existing);
    return true;
  }

  const el = document.createElement(tagName);
  try {
    range.surroundContents(el);
  } catch {
    const contents = range.extractContents();
    if (!contents.textContent && !contents.querySelector?.('img')) return false;
    el.appendChild(contents);
    range.insertNode(el);
  }

  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(el);
  sel.addRange(newRange);
  return true;
}

export function execRichTextCommand(command: any, editable: any, savedRange: any) {
  if (!editable) return false;
  editable.focus();
  if (savedRange) restoreSelection(savedRange);

  if (command === 'mark') {
    return finishRichTextCommand(editable, toggleInlineTag(editable, 'MARK', null));
  }
  if (command === 'inlineCode') {
    return finishRichTextCommand(editable, toggleInlineTag(editable, 'CODE', null));
  }

  if (command === 'removeFormat') {
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    // Browser removeFormat unwraps spans and destroys field tokens in the selection.
    if (!range || !rangeIntersectsFieldToken(range, editable)) {
      document.execCommand('styleWithCSS', false, false as any);
      document.execCommand('removeFormat', false, null as any);
    }
    clearFontStylesFromSelection(editable, null);
    clearAlignmentFromSelection(editable, null);
    clearHeadingsFromSelection(editable, null);
    return finishRichTextCommand(editable, true);
  }

  const headingLevel = ({ heading1: 1, heading2: 2, heading3: 3 } as any)[command];
  if (headingLevel) {
    return finishRichTextCommand(
      editable,
      applyBlockHeading(editable, headingLevel, savedRange),
    );
  }

  const alignment = ({ justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right' } as any)[command];
  if (alignment) {
    return finishRichTextCommand(editable, applyBlockAlignment(editable, alignment, null));
  }

  const inlineTag = ({ bold: 'B', italic: 'I', underline: 'U', strikeThrough: 'S' } as any)[command];
  if (inlineTag) {
    return finishRichTextCommand(editable, toggleInlineTag(editable, inlineTag, savedRange));
  }

  document.execCommand('styleWithCSS', false, false as any);
  return finishRichTextCommand(editable, document.execCommand(command, false, null as any));
}
