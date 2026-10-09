export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}

export function normalizeMarginMm(
  margin: number | [number, number, number, number] | null | undefined,
): [number, number, number, number] {
  if (margin == null) return [15, 15, 15, 15];
  if (typeof margin === 'number') return [margin, margin, margin, margin];
  return margin;
}

export function marginMmToPt(
  marginMm: number | [number, number, number, number],
): [number, number, number, number] {
  const [top, right, bottom, left] = normalizeMarginMm(marginMm);
  return [mmToPt(left), mmToPt(top), mmToPt(right), mmToPt(bottom)];
}

export type PdfPageSizeName = 'A4' | 'LETTER';
export type PdfPageSize = PdfPageSizeName | { width: number; height: number };

const CUSTOM_PAGE_MIN_MM = 20;
const CUSTOM_PAGE_MAX_MM = 1200;

function normalizeCustomPageMm(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(CUSTOM_PAGE_MAX_MM, Math.max(CUSTOM_PAGE_MIN_MM, +n.toFixed(2)));
}

/**
 * Named sizes → pdfmake string. format "custom" → { width, height } in pt
 * with orientation already applied.
 *
 * pdfmake swaps custom {width,height} when pageOrientation is "portrait" and
 * width > height, so custom sizes must bake orientation into pageSize and omit
 * pageOrientation (see resolveDocPageOrientation).
 */
export function resolvePageSize(
  format: 'a4' | 'letter' | 'custom' | 'A4' | 'LETTER' | string | null | undefined,
  dims?: { widthMm?: number; heightMm?: number; orientation?: string } | null,
  orientation?: string | null,
): PdfPageSize {
  const key = String(format ?? 'a4').toLowerCase();
  if (key === 'custom') {
    let widthMm = normalizeCustomPageMm(dims?.widthMm, 210);
    let heightMm = normalizeCustomPageMm(dims?.heightMm, 297);
    const orient = orientation ?? dims?.orientation;
    if (String(orient ?? 'portrait').toLowerCase() === 'landscape') {
      const swap = widthMm;
      widthMm = heightMm;
      heightMm = swap;
    }
    return { width: mmToPt(widthMm), height: mmToPt(heightMm) };
  }
  if (key === 'letter') return 'LETTER';
  return 'A4';
}

export function resolvePageOrientation(
  orientation: 'portrait' | 'landscape' | string | null | undefined,
): 'portrait' | 'landscape' {
  return String(orientation ?? 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
}

/**
 * Named formats use pdfmake's pageOrientation swap. Custom sizes already include
 * orientation in resolvePageSize — returning undefined prevents a second swap.
 */
export function resolveDocPageOrientation(
  format: string | null | undefined,
  orientation: 'portrait' | 'landscape' | string | null | undefined,
): 'portrait' | 'landscape' | undefined {
  if (String(format ?? '').toLowerCase() === 'custom') return undefined;
  return resolvePageOrientation(orientation);
}
