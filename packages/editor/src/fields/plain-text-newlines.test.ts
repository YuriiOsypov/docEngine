import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';

let createFieldToken: any;
let textToFragment: any;

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

  const inline = await import('./inline-fields.js');
  createFieldToken = inline.createFieldToken;
  textToFragment = inline.textToFragment;
});

describe('plain text newlines', () => {
  it('textToFragment inserts <br> for each newline', () => {
    const frag = textToFragment('111\n222');
    const html = [...frag.childNodes]
      .map((n) => (n.nodeType === 1 ? (n as Element).tagName : n.textContent))
      .join('|');
    assert.equal(html, '111|BR|222');
  });

  it('createFieldToken renders multiline plain values with line breaks', () => {
    const schemas = { note: { type: 'text', label: 'Note' } };
    const token = createFieldToken('note', '111\n222', 'Note', { fieldSchemas: schemas });
    assert.equal(token.querySelectorAll('br').length, 1);
    const parts = [...token.childNodes].map((n) =>
      n.nodeType === 1 ? (n as Element).tagName : n.textContent,
    );
    assert.deepEqual(parts, ['111', 'BR', '222']);
  });

  it('createFieldToken keeps JSON-escaped newlines as line breaks', () => {
    const schemas = { note: { type: 'text', label: 'Note' } };
    const token = createFieldToken('note', '111\\n222', 'Note', { fieldSchemas: schemas });
    assert.equal(token.querySelectorAll('br').length, 1);
  });
});
