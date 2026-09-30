import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pivotExpand, isPivotTableValue, createEmptyPivotValue } from './pivot.js';

describe('pivotExpand', () => {
  const sample = [
    { Region: 'West', Product: 'A', Amount: 10 },
    { Region: 'West', Product: 'B', Amount: 5 },
    { Region: 'East', Product: 'A', Amount: 7 },
    { Region: 'West', Product: 'A', Amount: 3 },
  ];

  const schema = {
    rowProperty: 'Region',
    columnProperty: 'Product',
    valueProperty: 'Amount',
    aggregation: 'sum',
    showRowTotals: true,
    showColumnTotals: true,
    showGrandTotal: true,
  };

  it('sums into a row x column matrix with totals', () => {
    const result = pivotExpand(sample, schema);
    assert.equal(result.columns.length, 2);
    assert.deepEqual(
      result.columns.map((c) => c.label).sort(),
      ['A', 'B'],
    );
    const west = result.rows.find((r) => r.label === 'West');
    const east = result.rows.find((r) => r.label === 'East');
    assert.ok(west && east);
    const colA = result.columns.find((c) => c.label === 'A')!;
    const colB = result.columns.find((c) => c.label === 'B')!;
    assert.equal(west.cells[colA.key], 13);
    assert.equal(west.cells[colB.key], 5);
    assert.equal(east.cells[colA.key], 7);
    assert.equal(east.cells[colB.key], null);
    assert.equal(west.rowTotal, 18);
    assert.equal(result.columnTotals?.[colA.key], 20);
    assert.equal(result.grandTotal, 25);
  });

  it('supports count aggregation and empty cells', () => {
    const result = pivotExpand(sample, {
      ...schema,
      aggregation: 'count',
      showRowTotals: false,
      showColumnTotals: false,
      showGrandTotal: false,
      emptyCell: '—',
    });
    const east = result.rows.find((r) => r.label === 'East')!;
    const colB = result.columns.find((c) => c.label === 'B')!;
    assert.equal(east.cells[colB.key], '—');
    const west = result.rows.find((r) => r.label === 'West')!;
    const colA = result.columns.find((c) => c.label === 'A')!;
    assert.equal(west.cells[colA.key], 2);
  });

  it('supports avg and nested property paths', () => {
    const rows = [
      { Region: 'N', Item__r: { Name: 'X' }, Qty: 2 },
      { Region: 'N', Item__r: { Name: 'X' }, Qty: 4 },
      { Region: 'S', Item__r: { Name: 'Y' }, Qty: 10 },
    ];
    const result = pivotExpand(rows, {
      rowProperty: 'Region',
      columnProperty: 'Item__r.Name',
      valueProperty: 'Qty',
      aggregation: 'avg',
    });
    const n = result.rows.find((r) => r.label === 'N')!;
    const colX = result.columns.find((c) => c.label === 'X')!;
    assert.equal(n.cells[colX.key], 3);
  });

  it('returns empty structure for non-arrays', () => {
    assert.deepEqual(pivotExpand(null, schema), { columns: [], rows: [] });
    assert.ok(isPivotTableValue(createEmptyPivotValue()));
  });
});
