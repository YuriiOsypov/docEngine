import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';

let createRichTextToolbar: typeof import('./rich-text-toolbar.js').createRichTextToolbar;

before(async () => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.window = window as any;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Range = window.Range;
  globalThis.DocumentFragment = window.DocumentFragment;
  globalThis.HTMLElement = (window as any).HTMLElement;
  globalThis.Element = (window as any).Element;
  globalThis.Event = (window as any).Event;

  const win = window as any;
  win._testSelection = null;
  win.getSelection = () => {
    if (!win._testSelection) {
      win._testSelection = {
        _ranges: [] as any[],
        get rangeCount() {
          return this._ranges.length;
        },
        get isCollapsed() {
          return !this._ranges.length || this._ranges[0].collapsed;
        },
        removeAllRanges() {
          this._ranges = [];
        },
        addRange(range: any) {
          this._ranges = [range];
        },
        getRangeAt(index: number) {
          return this._ranges[index];
        },
      };
    }
    return win._testSelection;
  };

  if (window.Range?.prototype && !(window.Range.prototype as any).intersectsNode) {
    (window.Range.prototype as any).intersectsNode = function intersectsNode(node: any) {
      if (!node) return false;
      let ancestor: any = this.commonAncestorContainer;
      if (!ancestor) return false;
      if (ancestor.nodeType === 3) ancestor = ancestor.parentNode;
      return ancestor.contains?.(node) ?? false;
    };
  }

  // linkedom does not implement document.activeElement tracking; mirror focus manually.
  let active: any = document.body;
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get() {
      return active;
    },
  });
  const origFocus = (window.HTMLElement.prototype as any).focus;
  (window.HTMLElement.prototype as any).focus = function focus(this: any) {
    active = this;
    if (typeof origFocus === 'function') origFocus.call(this);
  };

  // linkedom select/input often expose value as a getter-only; allow assignment like browsers.
  for (const Proto of [window.HTMLInputElement?.prototype, window.HTMLSelectElement?.prototype].filter(Boolean)) {
    const values = new WeakMap();
    Object.defineProperty(Proto, 'value', {
      configurable: true,
      get() {
        return values.has(this) ? values.get(this) : (this.getAttribute?.('value') ?? '');
      },
      set(v) {
        values.set(this, String(v ?? ''));
      },
    });
  }

  ({ createRichTextToolbar } = await import('./rich-text-toolbar.js'));
});

function makeEditableWithText(text: string) {
  const editable = document.createElement('div');
  editable.className = 'document-section__body';
  editable.contentEditable = 'true';
  editable.textContent = text;
  document.body.appendChild(editable);
  return editable;
}

function selectAllText(editable: HTMLElement) {
  const textNode = editable.firstChild!;
  const range: any = {
    collapsed: false,
    startContainer: textNode,
    startOffset: 0,
    endContainer: textNode,
    endOffset: textNode.textContent!.length,
    commonAncestorContainer: textNode,
    cloneRange() {
      return { ...this, cloneRange: this.cloneRange, surroundContents: this.surroundContents, extractContents: this.extractContents, insertNode: this.insertNode, intersectsNode: this.intersectsNode };
    },
    surroundContents(el: any) {
      const parent = textNode.parentNode;
      parent.insertBefore(el, textNode);
      el.appendChild(textNode);
    },
    extractContents() {
      const frag = document.createDocumentFragment();
      frag.appendChild(textNode.cloneNode(true));
      textNode.textContent = '';
      return frag;
    },
    insertNode(node: any) {
      editable.insertBefore(node, editable.firstChild);
    },
    intersectsNode(node: any) {
      return editable.contains(node);
    },
    selectNodeContents(node: any) {
      this.startContainer = node;
      this.endContainer = node;
      this.commonAncestorContainer = node;
      this.collapsed = false;
    },
  };
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  (editable as any).focus?.();
  return range;
}

describe('createRichTextToolbar font size selection', () => {
  it('keeps saved selection when size input steals focus, then applies size', () => {
    const toolbar = createRichTextToolbar();
    document.body.appendChild(toolbar.element);

    const editable = makeEditableWithText('Vision disturbance');
    selectAllText(editable);
    toolbar.show(editable);

    const sizeInput = toolbar.element.querySelector(
      '.rich-text-toolbar__input--size',
    ) as HTMLInputElement;
    assert.ok(sizeInput);

    // mousedown saves the live range before focus moves to the spinner.
    sizeInput.dispatchEvent(new Event('mousedown', { bubbles: true }));
    sizeInput.focus();

    // Browser collapses the canvas selection; selectionchange must not wipe savedRange.
    const collapsed: any = {
      collapsed: true,
      startContainer: editable.firstChild,
      startOffset: 0,
      endContainer: editable.firstChild,
      endOffset: 0,
      commonAncestorContainer: editable.firstChild,
      cloneRange() {
        return { ...this };
      },
    };
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(collapsed);
    document.dispatchEvent(new Event('selectionchange'));

    sizeInput.value = '18';
    sizeInput.dispatchEvent(new Event('change', { bubbles: true }));

    const sized = editable.querySelector('span[style*="font-size"]') as HTMLElement | null;
    assert.ok(sized, 'expected font-size span to wrap the prior selection');
    assert.match(sized!.getAttribute('style') || '', /font-size:\s*18px/i);
    assert.match(sized!.textContent || '', /Vision disturbance/);
  });
});
