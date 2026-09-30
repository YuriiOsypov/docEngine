import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeBarcodeToDataUrl, normalizeBarcodeSymbology } from './barcode-encode.js';

describe('barcode-encode', () => {
  it('normalizes symbology', () => {
    assert.equal(normalizeBarcodeSymbology('QR'), 'qr');
    assert.equal(normalizeBarcodeSymbology('unknown'), 'code128');
  });

  it('encodes Code128 to a data URL without throwing', () => {
    const result = encodeBarcodeToDataUrl('SKU-1001', {
      symbology: 'code128',
      displayValue: true,
    });
    assert.equal(result.error, undefined);
    assert.ok(result.dataUrl.startsWith('data:image/'));
  });

  it('encodes QR codes', () => {
    const result = encodeBarcodeToDataUrl('https://example.com', { symbology: 'qr' });
    assert.equal(result.error, undefined);
    assert.ok(result.dataUrl.startsWith('data:image/'));
  });

  it('returns empty data URL for blank input', () => {
    assert.deepEqual(encodeBarcodeToDataUrl(''), { dataUrl: '' });
  });

  it('returns an error for invalid EAN-13 without throwing', () => {
    const result = encodeBarcodeToDataUrl('123', { symbology: 'ean13' });
    assert.equal(result.dataUrl, '');
    assert.ok(result.error);
  });

  it('builds a pdfmake svg block', async () => {
    const { barcodeValueToPdfBlock } = await import('./barcode-encode.js');
    const block = barcodeValueToPdfBlock('SKU-1001', { symbology: 'code128', maxWidth: 160 });
    assert.ok(block);
    assert.ok(String(block.svg).includes('<svg'));
    assert.equal(block.width, 160);
  });
});
