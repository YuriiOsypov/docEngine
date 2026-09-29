import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createFieldHighlightForm } from './field-highlight-form.js';
import { DEFAULT_FIELD_HIGHLIGHT_STYLE } from '../core/document-display-defaults.js';

function installDom() {
  const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.document = document;
  globalThis.window = { document } as any;
  globalThis.HTMLElement = document.defaultView.HTMLElement;
  return document;
}

describe('createFieldHighlightForm', () => {
  it('renders compact color fields, info tip, and live preview', () => {
    installDom();
    const form = createFieldHighlightForm();

    assert.ok(form.element.querySelector('.schema-form__info-tip'));
    assert.ok(form.element.querySelectorAll('.color-field').length === 2);
    assert.ok(form.element.querySelector('.color-field__swatch'));
    assert.ok(form.element.querySelector('.color-field__hex'));
    assert.ok(form.element.querySelector('.field-highlight-form__preview-token'));
    assert.match(
      form.element.querySelector('.field-highlight-form__preview-sample')?.textContent ?? '',
      /Complaints:/,
    );
    assert.match(
      form.element.querySelector('.field-highlight-form__preview-token')?.textContent ?? '',
      /Vision disturbance/,
    );
  });

  it('applies default highlight styles to the preview token on create', () => {
    installDom();
    const form = createFieldHighlightForm();
    const token = form.element.querySelector(
      '.field-highlight-form__preview-token',
    ) as HTMLElement;

    assert.equal(token.style.color.toUpperCase(), DEFAULT_FIELD_HIGHLIGHT_STYLE.color.toUpperCase());
    assert.equal(token.style.textDecoration, 'none');
    assert.equal(token.style.fontStyle, 'normal');
    assert.equal(token.style.fontWeight, DEFAULT_FIELD_HIGHLIGHT_STYLE.fontWeight);
    assert.equal(token.style.borderRadius, '999px');
  });
});
