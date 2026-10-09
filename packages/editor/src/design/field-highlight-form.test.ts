import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createFieldHighlightForm } from './field-highlight-form.js';

function installDom() {
  const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.document = document;
  globalThis.window = { document } as any;
  globalThis.HTMLElement = document.defaultView.HTMLElement;
  return document;
}

describe('createFieldHighlightForm', () => {
  it('uses the same header layout as Default value style', () => {
    installDom();
    const form = createFieldHighlightForm();

    const header = form.element.querySelector('.display-style-form__header');
    const legend = form.element.querySelector('.display-style-form__legend');
    const reset = form.element.querySelector('.display-style-form__reset');
    assert.ok(header);
    assert.ok(legend);
    assert.ok(reset);
    assert.equal(legend?.textContent, 'Empty field style');
    assert.equal(legend?.tagName, 'DIV');
    assert.equal(form.element.querySelector('legend'), null);
    assert.equal(form.element.querySelector('.schema-form__info-tip'), null);
    assert.equal(reset?.getAttribute('aria-label'), 'Reset style');
    assert.equal(header?.contains(reset), true);
  });

  it('renders color fields and options without a text preview sample', () => {
    installDom();
    const form = createFieldHighlightForm();

    assert.ok(form.element.querySelectorAll('.color-field').length === 2);
    assert.ok(form.element.querySelector('.color-field__swatch'));
    assert.ok(form.element.querySelector('.color-field__hex'));
    assert.ok(form.element.querySelector('[data-field="highlight-font-weight"]'));
    assert.ok(form.element.querySelector('[data-field="highlight-border-width"]'));
    assert.equal(form.element.querySelector('.field-highlight-form__preview'), null);
    assert.equal(form.element.querySelector('.field-highlight-form__preview-token'), null);
  });

  it('round-trips custom highlight styles and reset clears them', () => {
    installDom();
    const form = createFieldHighlightForm();
    form.setStyle({
      color: '#7c3aed',
      backgroundColor: 'transparent',
      fontWeight: '600',
      borderWidth: '2px',
    });
    const style = form.readStyle();
    assert.equal(style?.color?.toUpperCase(), '#7C3AED');
    assert.equal(style?.fontWeight, '600');
    assert.equal(style?.borderWidth, '2px');

    const reset = form.element.querySelector('.display-style-form__reset') as HTMLButtonElement;
    assert.doesNotThrow(() => reset.click());
    assert.equal(form.readStyle(), undefined);
  });
});
