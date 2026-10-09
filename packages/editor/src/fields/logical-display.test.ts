import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLogicalDisplay,
  formatLogicalTokenDisplay,
  normalizeLogicalTrueMark,
} from './logical-display.js';

describe('logical-display', () => {
  it('normalizes trueMark values', () => {
    assert.equal(normalizeLogicalTrueMark(undefined), 'yesNo');
    assert.equal(normalizeLogicalTrueMark('yesNo'), 'yesNo');
    assert.equal(normalizeLogicalTrueMark('x'), 'x');
    assert.equal(normalizeLogicalTrueMark('X'), 'x');
    assert.equal(normalizeLogicalTrueMark('check'), 'check');
    assert.equal(normalizeLogicalTrueMark('✓'), 'check');
  });

  it('formats yes/no and mark modes', () => {
    assert.equal(formatLogicalDisplay(true, 'yesNo'), 'Yes');
    assert.equal(formatLogicalDisplay(false, 'yesNo'), 'No');
    assert.equal(formatLogicalDisplay(true, 'x'), 'X');
    assert.equal(formatLogicalDisplay(false, 'x'), '');
    assert.equal(formatLogicalDisplay(true, 'check'), '✓');
    assert.equal(formatLogicalDisplay(false, 'check'), '');
    assert.equal(formatLogicalDisplay(null, 'x', 'Empty'), 'Empty');
  });

  it('formats token labels', () => {
    assert.equal(formatLogicalTokenDisplay(true, 'yesNo'), 'Yes ✓');
    assert.equal(formatLogicalTokenDisplay(false, 'yesNo'), 'No');
    assert.equal(formatLogicalTokenDisplay(true, 'x'), 'X');
    assert.equal(formatLogicalTokenDisplay(false, 'x'), '');
    assert.equal(formatLogicalTokenDisplay(true, 'check'), '✓');
    assert.equal(formatLogicalTokenDisplay(false, 'check'), '');
  });
});
