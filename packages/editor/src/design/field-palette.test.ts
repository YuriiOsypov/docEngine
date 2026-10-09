import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createFieldPalette } from './field-palette.js';
import { registerBuiltinFields } from '../fields/handlers/builtins.js';

function installDom() {
  const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const view = document.defaultView;
  globalThis.document = document;
  globalThis.window = view as any;
  globalThis.HTMLElement = view.HTMLElement;
  globalThis.Element = view.Element;
  return document;
}

describe('field palette Database tab', () => {
  beforeEach(() => {
    installDom();
    registerBuiltinFields();
  });

  it('renders Fields and Database tabs in vertical layout', () => {
    const sample = { records: [{ name: 'A' }] };
    const palette = createFieldPalette(() => {}, {
      layout: 'vertical',
      getSourceSample: () => sample,
    });

    const tabs = palette.element.querySelectorAll('.field-palette__tab');
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0].textContent, 'Fields');
    assert.equal(tabs[1].textContent, 'Database');

    const databasePane = palette.element.querySelector(
      '.field-palette__pane--database',
    ) as HTMLElement;
    assert.ok(databasePane);
    assert.equal(databasePane.hidden, true);

    (tabs[1] as HTMLButtonElement).click();
    assert.equal(databasePane.hidden, false);
    assert.match(databasePane.textContent ?? '', /records/i);
    assert.match(databasePane.textContent ?? '', /name/i);
  });

  it('shows empty message when no source sample', () => {
    const palette = createFieldPalette(() => {}, {
      layout: 'vertical',
      getSourceSample: () => null,
    });
    const databaseTab = palette.element.querySelector(
      '.field-palette__tab[data-tab="database"]',
    ) as HTMLButtonElement;
    databaseTab.click();
    const empty = palette.element.querySelector('.field-palette__database-empty');
    assert.ok(empty);
    assert.match(empty?.textContent ?? '', /No source sample available/i);
  });

  it('renders Source payload chrome with search and upload', () => {
    const sample = { meta: { count: 1 }, records: [{ name: 'A' }] };
    const palette = createFieldPalette(() => {}, {
      layout: 'vertical',
      getSourceSample: () => sample,
    });
    const databaseTab = palette.element.querySelector(
      '.field-palette__tab[data-tab="database"]',
    ) as HTMLButtonElement;
    databaseTab.click();

    assert.match(palette.element.textContent ?? '', /Source payload/i);
    assert.ok(palette.element.querySelector('[data-role="database-source-search"]'));
    assert.ok(palette.element.querySelector('[data-role="database-source-file"]'));
    assert.ok(palette.element.querySelector('[data-role="database-source-expand-all"]'));
    assert.match(palette.element.textContent ?? '', /meta/i);
    assert.match(palette.element.textContent ?? '', /records/i);
  });

  it('refreshDatabase updates the tree after sample changes', () => {
    let sample: any = null;
    const palette = createFieldPalette(() => {}, {
      layout: 'vertical',
      getSourceSample: () => sample,
    });
    const databaseTab = palette.element.querySelector(
      '.field-palette__tab[data-tab="database"]',
    ) as HTMLButtonElement;
    databaseTab.click();
    assert.ok(palette.element.querySelector('.field-palette__database-empty'));

    sample = { meta: { count: 1 } };
    palette.refreshDatabase();
    assert.match(palette.element.textContent ?? '', /meta/i);
    assert.match(palette.element.textContent ?? '', /count/i);
  });
});
