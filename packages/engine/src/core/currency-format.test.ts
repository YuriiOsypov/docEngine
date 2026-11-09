import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatNumericDisplay,
  formatCurrencyValue,
  parseCurrencyFormatSuffix,
  parseNumericValue,
} from './currency-format.js';

describe('currency-format', () => {
  it('formats field display settings', () => {
    assert.equal(formatNumericDisplay(42, { displayFormat: 'plain', suffix: 'mmHg' }), '42mmHg');
    assert.equal(
      formatNumericDisplay(1234.5, { displayFormat: 'number', fractionDigits: 2 }),
      formatCurrencyValue(1234.5, 'number:2'),
    );
    assert.equal(
      formatNumericDisplay(1234.5, {
        displayFormat: 'currency',
        currencyCode: 'EUR',
        fractionDigits: 2,
      }),
      formatCurrencyValue(1234.5, 'EUR:2'),
    );
  });

  it('parses mapping currency suffixes', () => {
    assert.deepEqual(parseCurrencyFormatSuffix('EUR:2'), {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    assert.deepEqual(parseCurrencyFormatSuffix('number'), {
      style: 'decimal',
      minimumFractionDigits: undefined,
      maximumFractionDigits: undefined,
    });
    assert.equal(parseCurrencyFormatSuffix('dd/mm/yyyy'), null);
  });

  it('parses currency-decorated numbers', () => {
    assert.equal(parseNumericValue('53.25 USD'), 53.25);
    assert.equal(parseNumericValue('USD 53.25'), 53.25);
    assert.equal(parseNumericValue('$1,234.50'), 1234.5);
    assert.equal(parseNumericValue('-53.25 USD'), -53.25);
    assert.equal(parseNumericValue('1,234.50'), 1234.5);
    assert.equal(parseNumericValue('hello'), null);
    assert.equal(parseNumericValue(''), null);
  });
});
