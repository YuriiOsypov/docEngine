/**
 * Client-side barcode / QR encoding via bwip-js.
 * Value stays a plain string; tokens render a generated PNG/SVG data URL.
 */
import bwipjs from 'bwip-js';

export type BarcodeSymbology = 'qr' | 'code128' | 'ean13' | 'code39';

export interface BarcodeEncodeOptions {
  symbology?: BarcodeSymbology | string;
  maxWidth?: number;
  height?: number;
  displayValue?: boolean;
  quietZone?: boolean;
}

const BCID_BY_SYMBOLOGY: Record<string, string> = {
  qr: 'qrcode',
  code128: 'code128',
  ean13: 'ean13',
  code39: 'code39',
};

export function normalizeBarcodeSymbology(raw: unknown): BarcodeSymbology {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'qr' || value === 'code128' || value === 'ean13' || value === 'code39') {
    return value;
  }
  return 'code128';
}

function buildBwipOptions(text: string, options: BarcodeEncodeOptions = {}) {
  const symbology = normalizeBarcodeSymbology(options.symbology);
  const bcid = BCID_BY_SYMBOLOGY[symbology] ?? 'code128';
  const includetext = options.displayValue !== false && symbology !== 'qr';
  const height = Number(options.height) > 0 ? Number(options.height) : 10;
  const scale = symbology === 'qr' ? 3 : 2;
  const padding = options.quietZone === false ? 0 : 10;

  const opts: Record<string, unknown> = {
    bcid,
    text: String(text),
    scale,
    includetext,
    paddingwidth: padding,
    paddingheight: padding,
  };
  if (symbology !== 'qr') opts.height = height;
  return opts;
}

function getBwipApi(): any {
  return (bwipjs as any)?.default ?? bwipjs;
}

export interface BarcodeEncodeResult {
  dataUrl: string;
  error?: string;
}

/**
 * Encode to raw SVG markup (for pdfmake `{ svg }` blocks). Never throws.
 */
export function encodeBarcodeToSvg(
  text: unknown,
  options: BarcodeEncodeOptions = {},
): { svg: string; error?: string } {
  const value = String(text ?? '').trim();
  if (!value) return { svg: '' };

  try {
    const api = getBwipApi();
    if (typeof api.toSVG !== 'function') {
      return { svg: '', error: 'Barcode SVG encoder unavailable.' };
    }
    const svg = String(api.toSVG(buildBwipOptions(value, options)) ?? '');
    return svg ? { svg } : { svg: '', error: 'Barcode encode produced empty SVG.' };
  } catch (err: any) {
    return {
      svg: '',
      error: String(err?.message ?? err ?? 'Barcode encode failed'),
    };
  }
}

/**
 * Encode `text` to a data URL. Never throws — invalid input returns `{ dataUrl: '', error }`.
 * Prefers PNG (canvas) for preview/PDF image tokens; falls back to SVG data URL.
 */
export function encodeBarcodeToDataUrl(
  text: unknown,
  options: BarcodeEncodeOptions = {},
): BarcodeEncodeResult {
  const value = String(text ?? '').trim();
  if (!value) return { dataUrl: '' };

  try {
    const opts = buildBwipOptions(value, options);
    const api = getBwipApi();

    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        if (typeof canvas.getContext === 'function' && typeof api.toCanvas === 'function') {
          api.toCanvas(canvas, opts);
          if (typeof canvas.toDataURL === 'function') {
            return { dataUrl: canvas.toDataURL('image/png') };
          }
        }
      } catch {
        /* fall through to SVG */
      }
    }

    const svgResult = encodeBarcodeToSvg(value, options);
    if (svgResult.svg) {
      return {
        dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgResult.svg)}`,
      };
    }

    return { dataUrl: '', error: svgResult.error || 'Barcode encoder unavailable in this environment.' };
  } catch (err: any) {
    return {
      dataUrl: '',
      error: String(err?.message ?? err ?? 'Barcode encode failed'),
    };
  }
}

/**
 * Build a pdfmake content node for a barcode field value.
 * Uses `{ svg }` so JSON→PDF works in browser and Node without canvas.
 */
export function barcodeValueToPdfBlock(
  value: unknown,
  schema: BarcodeEncodeOptions & { maxWidth?: number } = {},
): Record<string, unknown> | null {
  const encoded = encodeBarcodeToSvg(value, schema);
  if (!encoded.svg) return null;
  const maxWidth = Number(schema.maxWidth) > 0 ? Number(schema.maxWidth) : 180;
  return {
    svg: encoded.svg,
    width: Math.min(maxWidth, 515),
    margin: [0, 4, 0, 4],
  };
}
