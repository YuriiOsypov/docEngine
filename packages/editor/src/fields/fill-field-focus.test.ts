import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';

let createFieldToken: any;
let collectEditableFillFieldTokens: any;
let setFillFieldFocus: any;
let clearFillFieldFocus: any;
let getFocusedFillFieldToken: any;
let moveFillFieldFocus: any;
let FILL_FIELD_FOCUSED_CLASS: any;

before(async () => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Range = window.Range;
  globalThis.CSS = {
    escape: (value: string) =>
      String(value).replace(/[^a-zA-Z0-9_\u00A0-\uFFFF-]/g, (ch) => `\\${ch}`),
  } as any;

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
          removeAllRanges() {
            this._ranges = [];
          },
          addRange(range: any) {
            this._ranges = [range];
          },
          getRangeAt(index: any) {
            return this._ranges[index];
          },
        };
      }
      return win._testSelection;
    };
  }

  const inline = await import('./inline-fields.js');
  createFieldToken = inline.createFieldToken;

  const focus = await import('./fill-field-focus.js');
  collectEditableFillFieldTokens = focus.collectEditableFillFieldTokens;
  setFillFieldFocus = focus.setFillFieldFocus;
  clearFillFieldFocus = focus.clearFillFieldFocus;
  getFocusedFillFieldToken = focus.getFocusedFillFieldToken;
  moveFillFieldFocus = focus.moveFillFieldFocus;
  FILL_FIELD_FOCUSED_CLASS = focus.FILL_FIELD_FOCUSED_CLASS;
});

function makeHolder() {
  const holder = document.createElement('div');
  holder.className = 'editor-holder';
  document.body.appendChild(holder);
  return holder;
}

describe('fill-field-focus', () => {
  it('sets and clears focused class on a single token', () => {
    const holder = makeHolder();
    const a = createFieldToken('a', '', 'A');
    const b = createFieldToken('b', '', 'B');
    holder.append(a, b);

    setFillFieldFocus(a, holder);
    assert.equal(a.classList.contains(FILL_FIELD_FOCUSED_CLASS), true);
    assert.equal(getFocusedFillFieldToken(holder), a);

    setFillFieldFocus(b, holder);
    assert.equal(a.classList.contains(FILL_FIELD_FOCUSED_CLASS), false);
    assert.equal(b.classList.contains(FILL_FIELD_FOCUSED_CLASS), true);

    clearFillFieldFocus(holder);
    assert.equal(getFocusedFillFieldToken(holder), null);
    holder.remove();
  });

  it('collects only editable fill tokens in document order', () => {
    const holder = makeHolder();
    const text = createFieldToken('t1', '', 'Text');
    const choice = createFieldToken('c1', '', 'Choice');
    const computed = createFieldToken('x1', '', 'Computed');
    const design = createFieldToken('d1', '', 'Design');
    design.classList.add('field-token--design');
    holder.append(text, choice, computed, design);

    const schemas = {
      t1: { type: 'text', name: 't1', label: 'Text' },
      c1: { type: 'choice', name: 'c1', label: 'Choice' },
      x1: { type: 'computed', name: 'x1', label: 'Computed', formula: '1' },
      d1: { type: 'text', name: 'd1', label: 'Design' },
    };

    const tokens = collectEditableFillFieldTokens(holder, schemas);
    assert.deepEqual(
      tokens.map((t: any) => t.dataset.fieldId),
      ['t1', 'c1'],
    );
    holder.remove();
  });

  it('moves focus with Tab / Shift+Tab and stops at ends', () => {
    const holder = makeHolder();
    const a = createFieldToken('a', '', 'A');
    const b = createFieldToken('b', '', 'B');
    const c = createFieldToken('c', '', 'C');
    holder.append(a, b, c);

    const schemas = {
      a: { type: 'text', name: 'a', label: 'A' },
      b: { type: 'text', name: 'b', label: 'B' },
      c: { type: 'text', name: 'c', label: 'C' },
    };

    assert.equal(moveFillFieldFocus(holder, 1, schemas), a);
    assert.equal(moveFillFieldFocus(holder, 1, schemas), b);
    assert.equal(moveFillFieldFocus(holder, 1, schemas), c);
    assert.equal(moveFillFieldFocus(holder, 1, schemas), c);

    assert.equal(moveFillFieldFocus(holder, -1, schemas), b);
    assert.equal(moveFillFieldFocus(holder, -1, schemas), a);
    assert.equal(moveFillFieldFocus(holder, -1, schemas), a);

    clearFillFieldFocus(holder);
    assert.equal(moveFillFieldFocus(holder, -1, schemas), c);
    holder.remove();
  });

  it('skips readonly fields when collecting', () => {
    const holder = makeHolder();
    const editable = createFieldToken('e1', '', 'E');
    const readonly = createFieldToken('r1', '', 'R');
    holder.append(editable, readonly);

    const schemas = {
      e1: { type: 'text', name: 'e1', label: 'E' },
      r1: { type: 'text', name: 'r1', label: 'R', readonly: true },
    };

    const tokens = collectEditableFillFieldTokens(holder, () => schemas);
    assert.deepEqual(
      tokens.map((t: any) => t.dataset.fieldId),
      ['e1'],
    );
    holder.remove();
  });

  it('skips cells when parent table is readonly', () => {
    const holder = makeHolder();
    const tableId = 'va_table';
    const cellId = `${tableId}_od_sph`;
    const cell = createFieldToken(cellId, '1.0', 'Sph');
    cell.classList.add('field-token--cell');
    holder.append(cell);

    const schemas = {
      [tableId]: {
        type: 'table',
        name: tableId,
        label: 'VA',
        readonly: true,
        columns: [{ key: 'sph', label: 'Sph' }],
        rows: [{ key: 'od', label: 'OD' }],
      },
      [cellId]: { type: 'text', name: 'sph', label: 'Sph' },
    };

    const tokens = collectEditableFillFieldTokens(holder, () => schemas);
    assert.deepEqual(tokens.map((t: any) => t.dataset.fieldId), []);
    holder.remove();
  });

  it('restores focused class after picker close', async () => {
    const focus = await import('./fill-field-focus.js');
    const holder = makeHolder();
    const token = createFieldToken('a', 'x', 'A');
    holder.append(token);
    token.classList.add('field-token--active');

    const restored = focus.restoreFillFieldFocusAfterPicker('a', holder, token);
    assert.equal(restored, token);
    assert.equal(token.classList.contains(FILL_FIELD_FOCUSED_CLASS), true);
    assert.equal(token.classList.contains('field-token--active'), false);
    holder.remove();
  });
});
