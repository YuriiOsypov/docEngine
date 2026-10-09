import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  applyPageSetupStyleCommand,
  formatFontSizePx,
  parseFontSizeNumber,
  refreshStyleCommandButtons,
  readFontSizeSpinValue,
  setFontSelectValue as _setFontSelectValue,
} from './style-toolbar-shared.js';
void _setFontSelectValue;
import { createDisplayStyleForm } from './display-style-form.js';

function installDom() {
  const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.document = document;
  globalThis.window = { document } as any;
  globalThis.HTMLElement = document.defaultView.HTMLElement;
  return document;
}

describe('applyPageSetupStyleCommand', () => {
  it('toggles bold on and off', () => {
    assert.deepEqual(applyPageSetupStyleCommand({}, 'bold'), { fontWeight: 'bold' });
    assert.deepEqual(applyPageSetupStyleCommand({ fontWeight: 'bold' }, 'bold'), {
      fontWeight: 'normal',
    });
    assert.deepEqual(applyPageSetupStyleCommand({ fontWeight: 'normal' }, 'bold'), {
      fontWeight: 'bold',
    });
  });

  it('toggles underline and strikethrough exclusively', () => {
    assert.deepEqual(applyPageSetupStyleCommand({}, 'underline'), { textDecoration: 'underline' });
    assert.deepEqual(
      applyPageSetupStyleCommand({ textDecoration: 'underline' }, 'strikeThrough'),
      { textDecoration: 'line-through' },
    );
    assert.deepEqual(
      applyPageSetupStyleCommand({ textDecoration: 'underline' }, 'underline'),
      { textDecoration: 'none' },
    );
  });

  it('clear formatting removes all properties', () => {
    assert.deepEqual(
      applyPageSetupStyleCommand({ fontWeight: 'bold', fontStyle: 'italic' }, 'removeFormat'),
      {},
    );
  });
});

describe('createDisplayStyleForm', () => {
  it('exports setStyle, readStyle, and clear API', () => {
    installDom();
    const form = createDisplayStyleForm({ legend: 'Test style' });
    assert.equal(typeof form.setStyle, 'function');
    assert.equal(typeof form.readStyle, 'function');
    assert.equal(typeof form.clear, 'function');
    assert.ok(form.element.classList.contains('display-style-form'));
    assert.ok(form.element.querySelector('.display-style-form__toolbar'));
    assert.equal(form.element.querySelector('.display-style-form__preview'), null);
  });

  it('places reset button in the section header', () => {
    installDom();
    const form = createDisplayStyleForm({ legend: 'Test style' });
    const header = form.element.querySelector('.display-style-form__header');
    const legend = form.element.querySelector('.display-style-form__legend');
    const reset = form.element.querySelector('.display-style-form__reset');
    assert.ok(header);
    assert.ok(legend);
    assert.ok(reset);
    assert.equal(reset?.getAttribute('aria-label'), 'Reset style');
    assert.equal(legend?.textContent, 'Test style');
    assert.equal(header?.contains(reset), true);
    assert.equal(legend?.contains(reset), false);
    assert.equal(form.element.querySelectorAll('[data-command="removeFormat"]').length, 0);
  });

  it('reset button clears style overrides without throwing', () => {
    installDom();
    const form = createDisplayStyleForm({ legend: 'Test style' });
    const select = form.element.querySelector('[aria-label="Font"]') as HTMLSelectElement;
    const size = form.element.querySelector('[aria-label="Font size"]') as HTMLInputElement;
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() {
        return this.getAttribute('value') ?? '';
      },
      set(v) {
        this.setAttribute('value', String(v));
      },
    });
    Object.defineProperty(size, 'value', {
      configurable: true,
      get() {
        return this.getAttribute('value') ?? '';
      },
      set(v) {
        this.setAttribute('value', String(v));
      },
    });

    form.setStyle({
      fontFamily: 'Tahoma',
      fontSize: '15px',
      fontWeight: 'bold',
      fontStyle: 'italic',
    });
    assert.equal(form.readStyle()?.fontWeight, 'bold');

    const reset = form.element.querySelector('.display-style-form__reset') as HTMLButtonElement;
    assert.doesNotThrow(() => reset.click());
    assert.equal(form.readStyle(), undefined);
    assert.equal(
      form.element.querySelector('[data-command="bold"]')?.classList.contains(
        'rich-text-toolbar__btn--active',
      ),
      false,
    );
  });

  it('renders format button group and separate color control', () => {
    installDom();
    const form = createDisplayStyleForm({ legend: 'Test style' });
    const formatRow = form.element.querySelector('.display-style-form__format-row');
    const styleGroup = form.element.querySelector('.display-style-form__style-group');
    const colorControl = form.element.querySelector('.display-style-form__color-control');
    assert.ok(formatRow);
    assert.ok(styleGroup);
    assert.equal(styleGroup?.querySelectorAll('[data-command]').length, 4);
    assert.ok(colorControl);
    assert.equal(formatRow?.contains(styleGroup), true);
    assert.equal(formatRow?.contains(colorControl), true);
    assert.equal(
      colorControl?.querySelector('.display-style-form__color-label')?.textContent,
      'Color',
    );
    assert.ok(colorControl?.querySelector('.display-style-form__color-input'));
    assert.equal(styleGroup?.contains(colorControl), false);
  });
});

describe('font size spin helpers', () => {
  it('parses and formats px values', () => {
    assert.equal(parseFontSizeNumber('15px'), 15);
    assert.equal(parseFontSizeNumber('14pt'), 14);
    assert.equal(formatFontSizePx(16), '16px');
    assert.equal(formatFontSizePx(200), '96px');
  });

  it('reads spin input as px string', () => {
    installDom();
    const input = document.createElement('input');
    input.type = 'number';
    input.value = '18';
    assert.equal(readFontSizeSpinValue(input), '18px');
    input.value = '';
    assert.equal(readFontSizeSpinValue(input), '');
  });
});

describe('refreshStyleCommandButtons', () => {
  it('marks italic button active', () => {
    const { document } = parseHTML('<button data-command="italic"></button>');
    const btn = document.querySelector('button');
    const map = new Map([['italic', btn]]);

    refreshStyleCommandButtons({ fontStyle: 'italic' }, map);
    assert.ok(btn.classList.contains('rich-text-toolbar__btn--active'));
  });
});
