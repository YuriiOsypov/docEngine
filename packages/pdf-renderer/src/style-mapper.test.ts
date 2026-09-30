import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPdfFieldHighlightDecoration,
  cssFontSizeToPdfPt,
  DEFAULT_BODY_FONT_PT,
  DEFAULT_TABLE_FONT_PT,
  fieldStyleToPdfmake,
  resolvePdfFieldStyleForExport,
} from './style-mapper.js';

describe('cssFontSizeToPdfPt', () => {
  it('converts CSS px to pdfmake pt', () => {
    assert.equal(cssFontSizeToPdfPt('15px'), 11.25);
    assert.equal(cssFontSizeToPdfPt('13px'), 9.75);
    assert.equal(cssFontSizeToPdfPt('14px'), 10.5);
    assert.equal(cssFontSizeToPdfPt('18px'), 13.5);
  });

  it('passes through bare numbers and pt values', () => {
    assert.equal(cssFontSizeToPdfPt('12'), 12);
    assert.equal(cssFontSizeToPdfPt('10pt'), 10);
  });

  it('converts em relative to body px base', () => {
    assert.equal(cssFontSizeToPdfPt('1.35em', 15), 15.1875);
  });

  it('exposes preview default pt sizes', () => {
    assert.equal(DEFAULT_BODY_FONT_PT, 12);
    assert.equal(DEFAULT_TABLE_FONT_PT, 9.75);
  });
});

describe('fieldStyleToPdfmake', () => {
  it('maps document body fontSize from px to pt', () => {
    const style = fieldStyleToPdfmake({ fontSize: '15px' }, (name) => name ?? 'dejavu');
    assert.equal(style.fontSize, 11.25);
  });

  it('maps backgroundColor to text background and cell fillColor', () => {
    const style = fieldStyleToPdfmake({ backgroundColor: '#e8eef5' }, (name) => name ?? 'dejavu');
    assert.equal(style.background, '#e8eef5');
    assert.equal(style.fillColor, '#e8eef5');
  });
});

describe('applyPdfFieldHighlightDecoration', () => {
  it('adds underline decoration with default link color', () => {
    const decorated = applyPdfFieldHighlightDecoration({ color: '#000000' }, { color: '#0000FF' });
    assert.equal(decorated.decoration, 'underline');
    assert.equal(decorated.decorationColor, '#0000FF');
    assert.equal(decorated.color, '#000000');
  });

  it('uses custom highlight color for decorationColor', () => {
    const decorated = applyPdfFieldHighlightDecoration({}, { color: '#7c3aed' });
    assert.equal(decorated.decorationColor, '#7c3aed');
  });
});

describe('resolvePdfFieldStyleForExport', () => {
  it('exports field value style without fill-mode underline decoration', () => {
    const ctx = {
      fieldSchemas: {
        notes: { type: 'text', name: 'Notes', label: 'Notes' },
      },
      fieldValueStyle: {},
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldHighlightStyle: { color: '#0000FF', backgroundColor: 'transparent', fontWeight: '500', borderWidth: '1px' },
    };
    const style = resolvePdfFieldStyleForExport('notes', ctx);
    assert.equal(style.decoration, undefined);
    assert.equal(style.decorationColor, undefined);
  });

  it('exports intentional underline from field value displayStyle', () => {
    const ctx = {
      fieldSchemas: {
        notes: { type: 'text', name: 'Notes', label: 'Notes' },
      },
      fieldValueStyle: {
        default: { textDecoration: 'underline', fontStyle: 'italic' },
      },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldHighlightStyle: { color: '#0000FF', backgroundColor: 'transparent', fontWeight: '500', borderWidth: '1px' },
    };
    const style = resolvePdfFieldStyleForExport('notes', ctx);
    assert.equal(style.decoration, 'underline');
    assert.equal(style.italics, true);
    assert.equal(style.decorationColor, undefined);
  });
});
