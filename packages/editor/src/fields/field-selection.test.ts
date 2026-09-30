import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  selectDesignToken,
  selectDesignTableColumn,
  clearAllDesignTokenSelection,
} from './field-selection.js';

function installDom() {
  const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.document = document;
  globalThis.window = window as any;
  globalThis.CSS = { escape: (value: any) => String(value).replace(/"/g, '\\"') } as any;
  return document;
}

describe('selectDesignToken', () => {
  it('clears selection in other sections when selecting a new field', () => {
    const document = installDom();

    const sectionA = document.createElement('div');
    sectionA.className = 'document-section__body';
    const tokenA = document.createElement('span');
    tokenA.className = 'field-token field-token--design';
    tokenA.dataset.fieldId = 'anamnesis_complaints';
    sectionA.appendChild(tokenA);

    const sectionB = document.createElement('div');
    sectionB.className = 'document-section__body';
    const tokenB = document.createElement('span');
    tokenB.className = 'field-token field-token--design';
    tokenB.dataset.fieldId = 'examination_orbit_od';
    sectionB.appendChild(tokenB);

    document.body.append(sectionA, sectionB);

    selectDesignToken(tokenA, sectionA);
    assert.equal(tokenA.classList.contains('field-token--selected'), true);
    assert.equal(tokenB.classList.contains('field-token--selected'), false);

    selectDesignToken(tokenB, sectionB);
    assert.equal(tokenA.classList.contains('field-token--selected'), false);
    assert.equal(tokenB.classList.contains('field-token--selected'), true);

    clearAllDesignTokenSelection(document);
    assert.equal(tokenB.classList.contains('field-token--selected'), false);
  });
});

describe('selectDesignTableColumn', () => {
  it('marks the clicked cell as the column anchor for Format sync', () => {
    const document = installDom();

    const body = document.createElement('div');
    body.className = 'document-section__body';
    const table = document.createElement('div');
    table.className = 'document-table';

    const row1 = document.createElement('span');
    row1.className = 'field-token field-token--cell field-token--design';
    row1.dataset.fieldId = 'visual_acuity_row1_cyl';
    row1.dataset.tableId = 'visual_acuity';
    row1.dataset.colKey = 'cyl';

    const row2 = document.createElement('span');
    row2.className = 'field-token field-token--cell field-token--design';
    row2.dataset.fieldId = 'visual_acuity_row2_cyl';
    row2.dataset.tableId = 'visual_acuity';
    row2.dataset.colKey = 'cyl';

    table.append(row1, row2);
    body.appendChild(table);
    document.body.appendChild(body);

    selectDesignTableColumn(row2, body);
    assert.equal(row1.classList.contains('field-token--selected'), true);
    assert.equal(row2.classList.contains('field-token--selected'), true);
    assert.equal(row1.classList.contains('field-token--column-anchor'), false);
    assert.equal(row2.classList.contains('field-token--column-anchor'), true);

    clearAllDesignTokenSelection(document);
    assert.equal(row2.classList.contains('field-token--column-anchor'), false);
  });
});
