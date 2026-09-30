import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';

let serializeEditableToSegments: any;
let renderSegmentsToDom: any;

before(async () => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.DocumentFragment = window.DocumentFragment;
  globalThis.DOMParser = class {
    parseFromString(markup: any, mimeType: any) {
      if (mimeType !== 'text/html') {
        return parseHTML('<!DOCTYPE html><html><body></body></html>').document;
      }
      const html = String(markup ?? '');
      const wrapped = /<html[\s>]/i.test(html)
        ? html
        : `<!DOCTYPE html><html><body>${html}</body></html>`;
      return parseHTML(wrapped).document;
    }
  };

  const inline = await import('./inline-fields.js');
  serializeEditableToSegments = inline.serializeEditableToSegments;
  renderSegmentsToDom = inline.renderSegmentsToDom;
});

describe('nested columns serialize', () => {
  it('keeps outer and nested column contents when saving (design → fill)', () => {
    const nestedLeft = {
      type: 'columns',
      id: 'cols_nested_left',
      columns: [[{ type: 'text', content: '1323123' }], [{ type: 'text', content: 'left-b' }]],
    };
    const nestedRight = {
      type: 'columns',
      id: 'cols_nested_right',
      widths: ['33.1%', '66.9%'],
      columns: [[{ type: 'text', content: 'right-a' }], [{ type: 'text', content: 'right-b' }]],
    };
    const outer = {
      type: 'columns',
      id: 'cols_outer',
      columns: [[nestedLeft], [nestedRight]],
    };

    const body = document.createElement('div');
    body.className = 'document-section__body';
    body.appendChild(renderSegmentsToDom([outer], {}, { designMode: true }));

    const saved = serializeEditableToSegments(body);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].type, 'columns');
    assert.equal(saved[0].id, 'cols_outer');
    assert.equal(saved[0].columns[0].length, 1);
    assert.equal(saved[0].columns[1].length, 1);

    const left = saved[0].columns[0][0];
    const right = saved[0].columns[1][0];
    assert.equal(left.type, 'columns');
    assert.equal(left.id, 'cols_nested_left');
    assert.equal(left.columns[0][0]?.content, '1323123');
    assert.equal(left.columns[1][0]?.content, 'left-b');

    assert.equal(right.type, 'columns');
    assert.equal(right.id, 'cols_nested_right');
    assert.deepEqual(right.widths, ['33.1%', '66.9%']);
    assert.equal(right.columns[0][0]?.content, 'right-a');
    assert.equal(right.columns[1][0]?.content, 'right-b');
  });
});
