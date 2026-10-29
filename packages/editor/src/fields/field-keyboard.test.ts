import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';

let createFieldToken: any;
let caretPositionAfterFieldToken: any;
let FIELD_TOKEN_CARET_ANCHOR: any;
let isCaretAnchorOnlyTextNode: any;
let ensureCaretAnchorAfter: any;
let ensureFieldTokenCaretAnchors: any;
let insertElementAfterPreservingCaretBridge: any;
let getFieldTokensForClipboard: any;
let normalizeEditableLineStructure: any;
let insertPlainTextAtCaret: any;
let focusCaretAfter: any;

before(async () => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Range = window.Range;

  if (!window.getSelection) {
    const win = window as any;
    win._testSelection = null;
    window.getSelection = () => {
      if (!win._testSelection) {
        win._testSelection = {
          _ranges: [],
          get rangeCount() {
            return this._ranges.length;
          },
          get isCollapsed() {
            return !this._ranges.length || this._ranges[0].collapsed;
          },
          get anchorNode() {
            return this._ranges[0]?.startContainer ?? null;
          },
          removeAllRanges() {
            this._ranges = [];
          },
          addRange(range: any) {
            this._ranges = [range];
          },
          getRangeAt(index: any) {
            return this._ranges[index];
          },
          containsNode(node: any, partial: any) {
            if (!node || !this._ranges.length) return false;
            const range = this._ranges[0];
            if (partial) {
              return range.intersectsNode?.(node) ?? false;
            }
            return range.startContainer === node || range.endContainer === node;
          },
        };
      }
      return win._testSelection;
    };
  }

  if (window.Range?.prototype && !window.Range.prototype.intersectsNode) {
    window.Range.prototype.intersectsNode = function intersectsNode(node: any) {
      if (!node) return false;
      let ancestor: any = this.commonAncestorContainer;
      if (!ancestor) return false;
      if (ancestor.nodeType === 3) ancestor = ancestor.parentNode;
      return ancestor.contains?.(node) ?? false;
    };
  }

  const inline = await import('./inline-fields.js');
  createFieldToken = inline.createFieldToken;
  caretPositionAfterFieldToken = inline.caretPositionAfterFieldToken;
  FIELD_TOKEN_CARET_ANCHOR = inline.FIELD_TOKEN_CARET_ANCHOR;
  isCaretAnchorOnlyTextNode = inline.isCaretAnchorOnlyTextNode;
  ensureCaretAnchorAfter = inline.ensureCaretAnchorAfter;
  ensureFieldTokenCaretAnchors = inline.ensureFieldTokenCaretAnchors;
  insertElementAfterPreservingCaretBridge = inline.insertElementAfterPreservingCaretBridge;
  normalizeEditableLineStructure = inline.normalizeEditableLineStructure;
  insertPlainTextAtCaret = inline.insertPlainTextAtCaret;
  focusCaretAfter = inline.focusCaretAfter;

  const selection = await import('./field-selection.js');
  getFieldTokensForClipboard = selection.getFieldTokensForClipboard;
});

function buildSectionBody() {
  const body = document.createElement('div');
  body.className = 'document-section__body';
  body.contentEditable = 'true';
  document.body.appendChild(body);
  return body;
}

describe('field-token caret bridge', () => {
  it('uses offset 0 for standalone bridge nodes', () => {
    const anchor = document.createTextNode(FIELD_TOKEN_CARET_ANCHOR);
    assert.equal(caretPositionAfterFieldToken(anchor), 0);
    assert.equal(isCaretAnchorOnlyTextNode(anchor), true);
  });

  it('creates a standalone bridge node after a field token', () => {
    const body = buildSectionBody();
    const token = createFieldToken('f1', 'value', 'Field', {});
    body.appendChild(token);

    const anchor = ensureCaretAnchorAfter(token);
    assert.ok(isCaretAnchorOnlyTextNode(anchor));
    assert.equal(token.nextSibling, anchor);
    assert.equal(body.childNodes.length, 2);
  });

  it('prefixes bridge character onto following text', () => {
    const body = buildSectionBody();
    const token = createFieldToken('f1', 'value', 'Field', {});
    body.appendChild(token);
    body.appendChild(document.createTextNode('after'));

    const anchor = ensureCaretAnchorAfter(token);
    assert.equal(anchor, token.nextSibling);
    assert.equal(anchor.textContent, `${FIELD_TOKEN_CARET_ANCHOR}after`);
    assert.equal(caretPositionAfterFieldToken(anchor), 1);
  });

  it('uses enter offset 1 for text immediately after a field token', () => {
    const textAfter = document.createTextNode(`${FIELD_TOKEN_CARET_ANCHOR}after`);
    assert.equal(caretPositionAfterFieldToken(textAfter), 1);
  });

  it('merges bridge prefix onto following punctuation text', () => {
    const body = buildSectionBody();
    const token = createFieldToken('f1', 'OS', 'OS', {});
    body.appendChild(token);
    body.appendChild(document.createTextNode(', '));

    const anchor = ensureCaretAnchorAfter(token);
    assert.equal(anchor.textContent, `${FIELD_TOKEN_CARET_ANCHOR}, `);
  });

  it('treats newline-separated diagnosis text as a new line after a field', () => {
    const body = buildSectionBody();
    body.appendChild(document.createTextNode('Diagnosis: '));
    const icd = createFieldToken('icd10', 'ICD-10', 'ICD-10 list', {});
    body.appendChild(icd);
    body.appendChild(document.createTextNode('.\nClinical diagnosis: '));
    const clinical = createFieldToken('clinicalDiagnosis', '', 'Clinical diagnosis', {});
    body.appendChild(clinical);
    body.appendChild(document.createTextNode('.'));

    const bridge = ensureCaretAnchorAfter(icd);
    assert.equal(bridge.textContent, `${FIELD_TOKEN_CARET_ANCHOR}.\nClinical diagnosis: `);
    assert.equal(clinical.nextSibling?.textContent, '.');
  });

  it('insert after a field does not steal its caret bridge', () => {
    const body = buildSectionBody();
    const first = createFieldToken('main_list', '', 'List', {});
    const second = createFieldToken('main_list_2', '', 'List', {});
    body.appendChild(first);
    ensureCaretAnchorAfter(first);
    assert.ok(isCaretAnchorOnlyTextNode(first.nextSibling));

    insertElementAfterPreservingCaretBridge(first, second);
    ensureFieldTokenCaretAnchors(body);

    assert.ok(isCaretAnchorOnlyTextNode(first.nextSibling), 'bridge remains after first field');
    assert.equal(first.nextSibling?.nextSibling, second);
    assert.ok(isCaretAnchorOnlyTextNode(second.nextSibling), 'bridge exists after second field');
  });

  it('repairs adjacent field tokens that lost their bridge', () => {
    const body = buildSectionBody();
    const first = createFieldToken('a', '', 'A', {});
    const second = createFieldToken('b', '', 'B', {});
    body.appendChild(first);
    body.appendChild(second);
    assert.equal(first.nextSibling, second);

    ensureFieldTokenCaretAnchors(body);

    assert.ok(isCaretAnchorOnlyTextNode(first.nextSibling));
    assert.equal(first.nextSibling?.nextSibling, second);
    assert.ok(isCaretAnchorOnlyTextNode(second.nextSibling));
  });

  it('detects Backspace that would delete a caret bridge between fields', async () => {
    const kb = await import('./field-keyboard.js');
    const body = buildSectionBody();
    const first = createFieldToken('a', '', 'A', {});
    const second = createFieldToken('b', '', 'B', {});
    body.appendChild(first);
    const bridge = ensureCaretAnchorAfter(first);
    body.appendChild(second);
    ensureCaretAnchorAfter(second);

    const atEnd: any = {
      startContainer: bridge,
      startOffset: 1,
      collapsed: true,
    };
    assert.equal(kb.findStandaloneCaretBridgeTargetedByDelete(atEnd, 'backward'), bridge);
    assert.equal(kb.findStandaloneCaretBridgeTargetedByDelete(atEnd, 'forward'), null);

    const atStart: any = {
      startContainer: bridge,
      startOffset: 0,
      collapsed: true,
    };
    assert.equal(kb.findStandaloneCaretBridgeTargetedByDelete(atStart, 'forward'), bridge);
  });

  it('keeps caret bridges when Backspace-joining a field to the caret', async () => {
    const kb = await import('./field-keyboard.js');
    const body = buildSectionBody();
    const first = createFieldToken('a', '', 'A', {});
    const second = createFieldToken('b', '', 'B', {});
    const spacer = document.createTextNode('x');
    body.appendChild(first);
    ensureCaretAnchorAfter(first);
    body.appendChild(spacer);
    body.appendChild(second);
    ensureCaretAnchorAfter(second);

    const insertPoint = document.createTextNode('');
    body.insertBefore(insertPoint, spacer.nextSibling);
    const range: any = {
      collapsed: true,
      startContainer: insertPoint,
      startOffset: 0,
      endContainer: insertPoint,
      endOffset: 0,
      commonAncestorContainer: body,
      cloneRange() {
        return this;
      },
      insertNode(node: any) {
        body.insertBefore(node, insertPoint);
      },
    };

    kb.moveFieldTokenToCaret(second, range, null);

    assert.ok(isCaretAnchorOnlyTextNode(first.nextSibling), 'bridge after first');
    assert.ok(second.isConnected, 'joined field still in body');
    assert.ok(isCaretAnchorOnlyTextNode(second.nextSibling), 'bridge after joined field');
  });
});

describe('fill-mode field delete protection selection', () => {
  function mockRange({ startContainer, startOffset, endContainer, endOffset, intersects }: any) {
    return {
      collapsed:
        startContainer === endContainer &&
        startOffset === endOffset,
      startContainer,
      startOffset,
      endContainer,
      endOffset,
      commonAncestorContainer: startContainer.parentNode ?? startContainer,
      intersectsNode(node: any) {
        return intersects(node);
      },
    };
  }

  function setSelection(range: any) {
    const sel = window.getSelection();
    sel!.removeAllRanges();
    sel!.addRange(range);
  }

  it('detects field tokens inside a non-collapsed selection', () => {
    const body = buildSectionBody();
    body.appendChild(document.createTextNode('Diagnosis: '));
    const token = createFieldToken('icd10', 'ICD-10', 'ICD-10 list', {});
    body.appendChild(token);
    body.appendChild(document.createTextNode(' more text'));

    setSelection(
      mockRange({
        startContainer: body,
        startOffset: 0,
        endContainer: body,
        endOffset: body.childNodes.length,
        intersects: (node: any) => body.contains(node),
      }),
    );

    const tokens = getFieldTokensForClipboard(body);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0], token);
  });

  it('returns no tokens when selection is plain text only', () => {
    const body = buildSectionBody();
    const prefix = document.createTextNode('Diagnosis: ');
    body.appendChild(prefix);
    const token = createFieldToken('icd10', 'ICD-10', 'ICD-10 list', {});
    body.appendChild(token);
    body.appendChild(document.createTextNode(' more text'));

    setSelection(
      mockRange({
        startContainer: prefix,
        startOffset: 0,
        endContainer: prefix,
        endOffset: 5,
        intersects: (node: any) => node === prefix,
      }),
    );

    const tokens = getFieldTokensForClipboard(body);
    assert.equal(tokens.length, 0);
    assert.ok(token.isConnected);
  });
});

describe('normalizeEditableLineStructure', () => {
  it('flattens mixed block wrappers and bare text nodes into br-separated lines', () => {
    const body = buildSectionBody();

    const emptyLine = document.createElement('div');
    emptyLine.setAttribute('data-empty', 'true');
    emptyLine.appendChild(document.createElement('br'));
    body.appendChild(emptyLine);
    body.appendChild(document.createTextNode('first name'));

    const lastLine = document.createElement('div');
    lastLine.setAttribute('data-empty', 'false');
    lastLine.textContent = 'last name';
    body.appendChild(lastLine);

    assert.equal(normalizeEditableLineStructure(body), true);
    assert.equal(body.childNodes.length, 4);
    assert.equal(body.childNodes[0].nodeName, 'BR');
    assert.equal(body.childNodes[1].textContent, 'first name');
    assert.equal(body.childNodes[2].nodeName, 'BR');
    assert.equal(body.childNodes[3].textContent, 'last name');
  });

  it('leaves already-flat br-based structure unchanged', () => {
    const body = buildSectionBody();
    body.appendChild(document.createElement('br'));
    body.appendChild(document.createTextNode('first name'));
    body.appendChild(document.createElement('br'));
    body.appendChild(document.createTextNode('last name'));

    assert.equal(normalizeEditableLineStructure(body), false);
    assert.equal(body.childNodes.length, 4);
  });
});

describe('insertPlainTextAtCaret', () => {
  it('inserts multiline plain text as br-separated rows', () => {
    const body = buildSectionBody();
    insertPlainTextAtCaret(body, 'first name\r\nlast name\n');

    const texts = [...body.childNodes]
      .filter((n: any) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').replace(/\u200B/g, ''))
      .map((n: any) => (n.textContent ?? '').replace(/\u200B/g, ''));
    const brCount = [...body.childNodes].filter((n: any) => n.nodeName === 'BR').length;

    assert.deepEqual(texts, ['first name', 'last name']);
    assert.ok(brCount >= 2);
  });
});

describe('Enter mid-text line break caret', () => {
  function mockCollapsedRange(startContainer: any, startOffset: any) {
    return {
      collapsed: true,
      startContainer,
      startOffset,
      endContainer: startContainer,
      endOffset: startOffset,
      commonAncestorContainer: startContainer.parentNode ?? startContainer,
      setStart(node: any, offset: any) {
        this.startContainer = node;
        this.startOffset = offset;
        this.endContainer = node;
        this.endOffset = offset;
        this.commonAncestorContainer = node.parentNode ?? node;
      },
      collapse() {
        this.endContainer = this.startContainer;
        this.endOffset = this.startOffset;
      },
    };
  }

  it('does not attach a field caret bridge after a br', () => {
    const body = buildSectionBody();
    const br = document.createElement('br');
    const text = document.createTextNode('45');
    body.appendChild(br);
    body.appendChild(text);

    assert.equal(ensureCaretAnchorAfter(br), null);
    assert.equal(text.textContent, '45');
  });

  it('focusCaretAfter a br lands in following text without injecting ZWSP', () => {
    const body = buildSectionBody();
    const br = document.createElement('br');
    const text = document.createTextNode('45');
    body.appendChild(document.createTextNode('123'));
    body.appendChild(br);
    body.appendChild(text);

    // Provide a Range implementation focusCaretAfter can write into.
    const OriginalRange = (window as any).Range;
    (window as any).Range = function MockRange(this: any) {
      return mockCollapsedRange(body, 0);
    };
    (document as any).createRange = () => mockCollapsedRange(body, 0);

    try {
      focusCaretAfter(br);
    } finally {
      (window as any).Range = OriginalRange;
    }

    assert.equal(text.textContent, '45');
    const sel = window.getSelection() as any;
    assert.equal(sel.anchorNode, text);
    assert.equal(sel.getRangeAt(0).startOffset, 0);
  });

  it('keeps field bridges when focusing after a field before text', () => {
    const body = buildSectionBody();
    const token = createFieldToken('f1', 'OD', 'OD', {});
    const text = document.createTextNode(' note');
    body.appendChild(token);
    body.appendChild(text);

    (document as any).createRange = () => mockCollapsedRange(body, 0);
    focusCaretAfter(token);

    assert.equal(text.textContent, `${FIELD_TOKEN_CARET_ANCHOR} note`);
    const sel = window.getSelection() as any;
    assert.equal(sel.getRangeAt(0).startContainer, text);
    assert.equal(sel.getRangeAt(0).startOffset, 1);
  });
});
