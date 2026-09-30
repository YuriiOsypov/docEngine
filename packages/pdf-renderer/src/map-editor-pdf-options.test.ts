import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapEditorPdfOptions } from './map-editor-pdf-options.js';

describe('mapEditorPdfOptions', () => {
  it('forwards hideEmptyValues so preview PDF omit-empty matches the checkbox', () => {
    const mapped = mapEditorPdfOptions({ kind: 'document', version: 1 } as any, {
      hideEmptyValues: true,
    });
    assert.equal(mapped.hideEmptyValues, true);
  });

  it('defaults hideEmptyValues to false when unset', () => {
    const mapped = mapEditorPdfOptions({ kind: 'document', version: 1 } as any, {});
    assert.equal(mapped.hideEmptyValues, false);
  });
});
