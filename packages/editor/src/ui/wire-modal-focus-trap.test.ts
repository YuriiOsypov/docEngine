import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { wireModalFocusTrap } from './wire-modal-palette.js';

function installDom() {
  const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const view = document.defaultView;
  globalThis.document = document;
  globalThis.window = Object.assign(view, {
    innerWidth: 1200,
    innerHeight: 800,
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  });
  globalThis.getComputedStyle = globalThis.window.getComputedStyle;
  globalThis.HTMLElement = view.HTMLElement;
  globalThis.Element = view.Element;
  globalThis.Node = view.Node;
  globalThis.Event = view.Event;
  return document;
}

function dispatchTab(shiftKey = false) {
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: 'Tab' });
  Object.defineProperty(event, 'shiftKey', { value: shiftKey });
  let prevented = false;
  const originalPrevent = event.preventDefault.bind(event);
  event.preventDefault = () => {
    prevented = true;
    originalPrevent();
  };
  document.dispatchEvent(event);
  return prevented;
}

describe('wireModalFocusTrap', () => {
  it('cycles Tab among modal controls and never leaves the overlay', () => {
    const document = installDom();
    const canvas = document.createElement('div');
    canvas.contentEditable = 'true';
    canvas.tabIndex = 0;
    canvas.textContent = 'outside';
    document.body.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay--palette';
    overlay.innerHTML = `
      <div class="modal" role="dialog">
        <textarea class="modal__input">inside</textarea>
        <button type="button" data-action="clear">Clear</button>
        <button type="button" data-action="ok">OK</button>
        <button type="button" data-action="close">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.modal') as HTMLElement;
    const textarea = overlay.querySelector('textarea') as HTMLTextAreaElement;
    const clear = overlay.querySelector('[data-action="clear"]') as HTMLButtonElement;
    const close = overlay.querySelector('[data-action="close"]') as HTMLButtonElement;

    const focused: { current: Element | null } = { current: null };
    for (const el of [textarea, clear, close, canvas, modal]) {
      el.focus = () => {
        focused.current = el;
        Object.defineProperty(document, 'activeElement', {
          configurable: true,
          get: () => focused.current,
        });
      };
    }
    textarea.focus();

    const release = wireModalFocusTrap(overlay, modal);

    assert.equal(dispatchTab(), true);
    assert.equal(focused.current, clear);
    assert.notEqual(focused.current, canvas);

    close.focus();
    assert.equal(dispatchTab(), true);
    assert.equal(focused.current, textarea);

    textarea.focus();
    assert.equal(dispatchTab(true), true);
    assert.equal(focused.current, close);

    release();
  });

  it('blocks Arrow keys when canvas still has focus behind an open overlay', () => {
    const document = installDom();
    const canvas = document.createElement('div');
    canvas.contentEditable = 'true';
    canvas.tabIndex = 0;
    canvas.textContent = 'outside';
    document.body.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay--palette';
    overlay.innerHTML = `
      <div class="modal" role="dialog">
        <textarea class="modal__input">inside</textarea>
        <button type="button" data-action="ok">OK</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.modal') as HTMLElement;
    const textarea = overlay.querySelector('textarea') as HTMLTextAreaElement;

    const focused: { current: Element | null } = { current: null };
    for (const el of [textarea, canvas, modal]) {
      el.focus = () => {
        focused.current = el;
        Object.defineProperty(document, 'activeElement', {
          configurable: true,
          get: () => focused.current,
        });
      };
    }
    // Simulate focus still on the canvas while the dialog is open.
    canvas.focus();

    const release = wireModalFocusTrap(overlay, modal);

    const event = new Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: 'ArrowRight' });
    let prevented = false;
    const originalPrevent = event.preventDefault.bind(event);
    event.preventDefault = () => {
      prevented = true;
      originalPrevent();
    };
    document.dispatchEvent(event);

    assert.equal(prevented, true);
    assert.equal(focused.current, textarea);

    release();
  });

  it('reclaims focus to preferred contenteditable and does not swallow keys once inside', () => {
    const document = installDom();
    const canvas = document.createElement('div');
    canvas.contentEditable = 'true';
    canvas.tabIndex = 0;
    document.body.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay--palette';
    overlay.innerHTML = `
      <div class="modal" role="dialog">
        <div class="html-text-modal__editor cke_editable" contenteditable="true" tabindex="0"></div>
        <button type="button" data-action="ok">OK</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.modal') as HTMLElement;
    const editor = overlay.querySelector('[contenteditable="true"]') as HTMLElement;
    const ok = overlay.querySelector('[data-action="ok"]') as HTMLButtonElement;

    const focused: { current: Element | null } = { current: null };
    for (const el of [editor, ok, canvas, modal]) {
      el.focus = () => {
        focused.current = el;
        Object.defineProperty(document, 'activeElement', {
          configurable: true,
          get: () => focused.current,
        });
      };
    }
    canvas.focus();

    const release = wireModalFocusTrap(overlay, modal, { preferredFocus: editor });

    const event = new Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: 'a' });
    let prevented = false;
    const originalPrevent = event.preventDefault.bind(event);
    event.preventDefault = () => {
      prevented = true;
      originalPrevent();
    };
    document.dispatchEvent(event);

    assert.equal(prevented, true);
    assert.equal(focused.current, editor);

    // Now typing while editor is focused must not be blocked.
    prevented = false;
    const insideEvent = new Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(insideEvent, 'key', { value: 'b' });
    Object.defineProperty(insideEvent, 'target', { value: editor });
    insideEvent.preventDefault = () => {
      prevented = true;
    };
    document.dispatchEvent(insideEvent);
    assert.equal(prevented, false);

    release();
  });

  it('synthesizes typing into preferred contenteditable when LWS leaves focus outside', () => {
    const document = installDom();
    const host = document.createElement('div');
    host.tabIndex = 0;
    document.body.appendChild(host);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay--palette';
    overlay.innerHTML = `
      <div class="modal" role="dialog">
        <div class="html-text-modal__editor cke_editable" contenteditable="true" tabindex="0"></div>
        <button type="button" data-action="ok">OK</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.modal') as HTMLElement;
    const editor = overlay.querySelector('[contenteditable="true"]') as HTMLElement;

    const focused: { current: Element | null } = { current: host };
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => focused.current,
    });
    editor.focus = () => {
      focused.current = editor;
    };
    host.focus = () => {
      focused.current = host;
    };

    let inserted: string | null = null;
    editor.ownerDocument.execCommand = ((command: string, _show?: boolean, value?: string) => {
      if (command === 'insertText') {
        inserted = String(value ?? '');
        editor.textContent = (editor.textContent || '') + inserted;
        return true;
      }
      return false;
    }) as typeof document.execCommand;

    const release = wireModalFocusTrap(overlay, modal, { preferredFocus: editor });

    // Simulate LWS: activeElement stays on host, event target is host, editor looks focused.
    focused.current = host;
    const event = new Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: 'x' });
    Object.defineProperty(event, 'target', { value: host });
    let prevented = false;
    event.preventDefault = () => {
      prevented = true;
    };
    document.dispatchEvent(event);

    assert.equal(prevented, true);
    assert.equal(inserted, 'x');
    assert.equal(editor.textContent, 'x');

    release();
  });

  it('does not intercept ArrowRight while typing inside the modal textarea', () => {
    const document = installDom();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay--palette';
    overlay.innerHTML = `
      <div class="modal" role="dialog">
        <textarea class="modal__input">123</textarea>
        <button type="button" data-action="ok">OK</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.modal') as HTMLElement;
    const textarea = overlay.querySelector('textarea') as HTMLTextAreaElement;

    textarea.focus = () => {
      Object.defineProperty(document, 'activeElement', {
        configurable: true,
        get: () => textarea,
      });
    };
    textarea.focus();

    const release = wireModalFocusTrap(overlay, modal);

    const event = new Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: 'ArrowRight' });
    Object.defineProperty(event, 'target', { value: textarea });
    let prevented = false;
    const originalPrevent = event.preventDefault.bind(event);
    event.preventDefault = () => {
      prevented = true;
      originalPrevent();
    };
    document.dispatchEvent(event);

    assert.equal(prevented, false);

    release();
  });
});
