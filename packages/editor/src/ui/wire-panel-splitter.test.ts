import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  readPanelSplitCookie,
  writePanelSplitCookie,
  readPanelSplitLocalStorage,
  writePanelSplitLocalStorage,
  readSidePanelWidths,
  writeSidePanelWidths,
  wirePanelSplitter,
  wireSidePanelSplitters,
} from './wire-panel-splitter.js';
import { createDesignShell } from '../design/design-shell.js';

describe('wire-panel-splitter', () => {
  /** @type {Map<string, string>} */
  let store;

  beforeEach(() => {
    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    document.cookie = '';
    store = new Map();
    globalThis.localStorage = {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, String(value));
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
      key() {
        return null;
      },
      get length() {
        return store.size;
      },
    };
  });

  it('readPanelSplitCookie returns null when cookie is missing', () => {
    assert.equal(readPanelSplitCookie('field-mapping-panels'), null);
  });

  it('writePanelSplitCookie and readPanelSplitCookie round-trip sizes', () => {
    writePanelSplitCookie('field-mapping-panels', [25, 50, 25]);
    assert.deepEqual(readPanelSplitCookie('field-mapping-panels'), [25, 50, 25]);
  });

  it('writePanelSplitLocalStorage and readPanelSplitLocalStorage round-trip sizes', () => {
    writePanelSplitLocalStorage('field-mapping-panels', [30, 40, 30]);
    assert.deepEqual(readPanelSplitLocalStorage('field-mapping-panels'), [30, 40, 30]);
  });

  it('wirePanelSplitter applies default sizes to panels', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <section class="field-mapping-panel"></section>
      <div class="field-mapping-splitter"></div>
      <section class="field-mapping-panel"></section>
      <div class="field-mapping-splitter"></div>
      <section class="field-mapping-panel"></section>
    `;
    document.body.appendChild(container);

    wirePanelSplitter(container, {
      cookieKey: 'field-mapping-panels',
      defaultSizes: [25, 50, 25],
    });

    const panels = [...container.querySelectorAll('.field-mapping-panel')];
    assert.equal(panels[0].style.width, '25%');
    assert.equal(panels[1].style.width, '50%');
    assert.equal(panels[2].style.width, '25%');
  });

  it('wirePanelSplitter can persist sizes in localStorage', () => {
    writePanelSplitLocalStorage('design-panels', [30, 40, 30]);
    const container = document.createElement('div');
    container.innerHTML = `
      <section class="field-mapping-panel"></section>
      <div class="field-mapping-splitter"></div>
      <section class="field-mapping-panel"></section>
      <div class="field-mapping-splitter"></div>
      <section class="field-mapping-panel"></section>
    `;
    document.body.appendChild(container);

    wirePanelSplitter(container, {
      storageKey: 'design-panels',
      storage: 'localStorage',
      defaultSizes: [25, 50, 25],
    });

    const panels = [...container.querySelectorAll('.field-mapping-panel')];
    assert.equal(panels[0].style.width, '30%');
    assert.equal(panels[1].style.width, '40%');
    assert.equal(panels[2].style.width, '30%');
  });

  it('writeSidePanelWidths and readSidePanelWidths round-trip pixel widths', () => {
    writeSidePanelWidths('design-mode', { left: 240, right: 320 });
    assert.deepEqual(readSidePanelWidths('design-mode'), { left: 240, right: 320 });
  });

  it('wireSidePanelSplitters applies CSS variables from localStorage', () => {
    writeSidePanelWidths('design-mode', { left: 260, right: 340 });
    const shell = document.createElement('div');
    const left = document.createElement('aside');
    const right = document.createElement('aside');
    const leftSplitter = document.createElement('div');
    const rightSplitter = document.createElement('div');
    document.body.append(shell, left, right, leftSplitter, rightSplitter);

    wireSidePanelSplitters(shell, {
      storageKey: 'design-mode',
      leftPanel: left,
      rightPanel: right,
      leftSplitter,
      rightSplitter,
    });

    assert.equal(shell.style.getPropertyValue('--me-design-shell-left'), '260px');
    assert.equal(shell.style.getPropertyValue('--me-design-shell-right'), '340px');
  });
});

describe('createDesignShell', () => {
  beforeEach(() => {
    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    const store = new Map();
    globalThis.localStorage = {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, String(value));
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
      key() {
        return null;
      },
      get length() {
        return store.size;
      },
    };
  });

  it('inserts vertical splitters between Source, canvas, and Properties', () => {
    const host = document.createElement('div');
    const holder = document.createElement('div');
    host.appendChild(holder);
    document.body.appendChild(host);

    const shell = createDesignShell(holder);
    const children = [...shell.element.children];
    assert.equal(children.length, 5);
    assert.ok(children[0].classList.contains('design-panel--left'));
    assert.ok(children[1].classList.contains('design-shell-splitter'));
    assert.ok(children[2].classList.contains('design-panel--center'));
    assert.ok(children[3].classList.contains('design-shell-splitter'));
    assert.ok(children[4].classList.contains('design-panel--right'));
    assert.equal(shell.element.style.getPropertyValue('--me-design-shell-left'), '220px');
    assert.equal(shell.element.style.getPropertyValue('--me-design-shell-right'), '300px');
  });
});
