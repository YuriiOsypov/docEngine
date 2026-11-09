import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  getFormulaFunction,
  listFormulaFunctions,
  listFormulaPickerFunctions,
  registerFormulaFunction,
  resetFormulaFunctions,
  unregisterFormulaFunction,
} from './formula-functions.js';
import { evaluateFormula } from './computed-formula.js';

afterEach(() => {
  resetFormulaFunctions();
});

describe('formula function registry', () => {
  it('lists built-ins with aggregates first', () => {
    const names = listFormulaFunctions().map((def) => def.name);
    assert.deepEqual(names.slice(0, 5), ['avg', 'count', 'max', 'min', 'sum']);
    assert.ok(names.includes('concat'));
    assert.ok(names.includes('age'));
  });

  it('registers, overrides, and unregisters a function', () => {
    registerFormulaFunction({
      name: 'round',
      arity: 1,
      impl: ([value]) => Math.round(Number(value)),
    });
    assert.equal(getFormulaFunction('round')?.name, 'round');

    registerFormulaFunction({
      name: 'concat',
      impl: (args) => args.map((arg) => String(arg ?? '').toUpperCase()).join(''),
    });
    assert.equal(getFormulaFunction('concat')?.impl(['ab']), 'AB');

    assert.equal(unregisterFormulaFunction('concat'), true);
    assert.equal(getFormulaFunction('concat')?.impl(['ab', 'cd']), 'abcd');
    assert.equal(unregisterFormulaFunction('round'), true);
    assert.equal(getFormulaFunction('round'), undefined);
  });

  it('rejects invalid names', () => {
    assert.throws(
      () => registerFormulaFunction({ name: '1bad', impl: () => 1 }),
      /Invalid formula function name/,
    );
  });

  it('merges a per-call overlay on top of the registry', () => {
    registerFormulaFunction({
      name: 'round',
      arity: 1,
      impl: ([value]) => Math.round(Number(value)),
    });
    const overlay = [
      { name: 'round', arity: 1, impl: ([value]: unknown[]) => Math.floor(Number(value)) },
    ];
    const listed = listFormulaFunctions(overlay);
    assert.equal(listed.find((def) => def.name === 'round')?.impl([1.9]), 1);
    assert.ok(listFormulaPickerFunctions().some((def) => def.name === 'sum'));
  });
});

describe('evaluateFormula plugin functions', () => {
  it('evaluates a registered scalar function', () => {
    registerFormulaFunction({
      name: 'round',
      arity: 1,
      impl: ([value]) => Math.round(Number(value)),
    });
    const result = evaluateFormula('round(1.6) + 1', {}, {});
    assert.equal(result.error, null);
    assert.equal(result.value, '3');
  });

  it('evaluates a per-call overlay without registering', () => {
    const result = evaluateFormula('ifEmpty("", "n/a")', {}, {}, {
      formulaFunctions: [
        {
          name: 'ifEmpty',
          arity: 2,
          impl: ([value, fallback]) => (value == null || value === '' ? fallback : value),
        },
      ],
    });
    assert.equal(result.error, null);
    assert.equal(result.value, 'n/a');
  });

  it('evaluates a custom aggregate', () => {
    registerFormulaFunction({
      name: 'first',
      kind: 'aggregate',
      impl: (values) => values.find((value) => value != null && value !== '') ?? '',
    });
    const result = evaluateFormula('first({weight})', { weight: '72' }, {
      weight: { type: 'integer', name: 'Weight' },
    });
    assert.equal(result.error, null);
    assert.equal(result.value, '72');
  });

  it('still errors on unknown functions', () => {
    const result = evaluateFormula('nope(1)', {}, {});
    assert.equal(result.value, '—');
    assert.match(result.error ?? '', /Unknown function: nope/);
  });

  it('keeps built-in concat and sum', () => {
    assert.equal(evaluateFormula('concat("a", "b")', {}, {}).value, 'ab');
    assert.equal(
      evaluateFormula('sum({n})', { n: '4' }, { n: { type: 'integer', name: 'N' } }).value,
      '4',
    );
  });

  it('multiplies and sums currency-formatted values', () => {
    const schemas = {
      price: { type: 'text', name: 'Price' },
      qty: { type: 'text', name: 'Qty' },
    };
    const product = evaluateFormula(
      '{price} * {qty}',
      { price: '53.25 USD', qty: '2.00' },
      schemas,
    );
    assert.equal(product.error, null);
    assert.equal(product.value, '106.5');

    const total = evaluateFormula(
      'sum({price})',
      { price: '53.25 USD' },
      { price: { type: 'text', name: 'Price' } },
    );
    assert.equal(total.error, null);
    assert.equal(total.value, '53.25');

    const added = evaluateFormula(
      '{price} + {qty}',
      { price: '53.25 USD', qty: '1.00 USD' },
      schemas,
    );
    assert.equal(added.error, null);
    assert.equal(added.value, '54.25');
  });
});
