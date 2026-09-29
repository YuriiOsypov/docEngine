import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  selectDesignToken,
  clearAllDesignTokenSelection,
} from './field-selection.js';

function installDom() {
  const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.document = document;
  globalThis.window = window as any;
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
