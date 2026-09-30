import {
  DEFAULT_DOCUMENT_BODY_STYLE,
  DOCUMENT_SECTION_HEADER_STYLE,
  DOCUMENT_TABLE_TEXT_STYLE,
  DOCUMENT_TITLE_STYLE,
  normalizeFieldDisplayStyle,
  parseCellFieldId,
  resolveFieldDisplayStyle,
  resolveTableCellDisplayStyle,
  resolveTableColumnDisplayStyle,
  resolvePageSetupTextStyle,
  resolvePageSetupFieldHighlightStyle,
} from '@docengine/editor/node';
import type {
  FieldDisplayStyle,
  FieldHighlightStyle,
  FieldValueStyleOptions,
} from './types.js';

const CSS_PX_TO_PT = 72 / 96;

/**
 * Convert CSS font-size values to pdfmake points.
 */
export function cssFontSizeToPdfPt(
  value: string | number | null | undefined,
  emBasePx = 16,
): number | null {
  const str = String(value ?? '').trim();
  if (!str) return null;

  const match = str.match(/^([\d.]+)\s*(px|pt|em|rem)?$/i);
  if (!match) return null;

  const num = Number.parseFloat(match[1]);
  if (Number.isNaN(num)) return null;

  const unit = (match[2] ?? '').toLowerCase();
  if (!unit) return num;
  if (unit === 'pt') return num;
  if (unit === 'px') return num * CSS_PX_TO_PT;
  if (unit === 'em' || unit === 'rem') return num * emBasePx * CSS_PX_TO_PT;
  return null;
}

/** pdfmake pt sizes matching preview CSS defaults */
export const DEFAULT_BODY_FONT_PT = cssFontSizeToPdfPt('16px')!;
export const DEFAULT_TABLE_FONT_PT = cssFontSizeToPdfPt('13px')!;

/**
 * Map CSS font-weight to pdfmake bold flag.
 */
export function cssFontWeightToPdfBold(value: string | number | null | undefined): boolean | undefined {
  const lower = String(value ?? '').trim().toLowerCase();
  if (!lower) return undefined;
  if (lower === 'normal' || lower === 'regular' || lower === '400' || lower === 'lighter') {
    return false;
  }
  const numeric = Number.parseInt(lower, 10);
  if (!Number.isNaN(numeric)) return numeric >= 600;
  return lower === 'bold' || lower === 'bolder';
}

export function fieldStyleToPdfmake(
  style: FieldDisplayStyle,
  resolveFontName: (name?: string | null) => string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (style.fontFamily) out.font = resolveFontName(style.fontFamily);
  if (style.fontSize) {
    const size = cssFontSizeToPdfPt(style.fontSize);
    if (size != null) out.fontSize = size;
  }
  if (style.fontWeight === 'bold') out.bold = true;
  else if (style.fontWeight === 'normal') out.bold = false;
  if (style.fontStyle === 'italic') out.italics = true;
  if (style.color) out.color = style.color;
  if (style.backgroundColor) {
    // Inline fields: pdfmake text `background`. Table cells: `fillColor` on the td.
    out.background = style.backgroundColor;
    out.fillColor = style.backgroundColor;
  }
  if (style.textDecoration === 'underline') out.decoration = 'underline';
  if (style.textDecoration === 'line-through') out.decoration = 'lineThrough';
  if (style.textAlign) out.alignment = style.textAlign;
  return out;
}

export function resolvePdfTextStyle(
  pageSetup: any,
  _fieldValueStyle: FieldValueStyleOptions | undefined,
  resolveFontName: (name?: string | null) => string,
) {
  // Body text style comes from pageSetup.textStyle only — field value styles
  // must not bleed into the document-level defaultStyle.
  const style = resolvePageSetupTextStyle(pageSetup);
  return fieldStyleToPdfmake(style, resolveFontName);
}

export function resolvePdfBodyStyle(
  fieldValueStyle: FieldValueStyleOptions | undefined,
  resolveFontName: (name?: string | null) => string,
  pageSetup?: any,
) {
  return resolvePdfTextStyle(pageSetup, fieldValueStyle, resolveFontName);
}

export function resolvePdfSectionHeaderStyle(resolveFontName: (name?: string | null) => string) {
  return fieldStyleToPdfmake(
    normalizeFieldDisplayStyle(DOCUMENT_SECTION_HEADER_STYLE),
    resolveFontName,
  );
}

export function resolvePdfTableTextStyle(resolveFontName: (name?: string | null) => string) {
  return fieldStyleToPdfmake(
    normalizeFieldDisplayStyle(DOCUMENT_TABLE_TEXT_STYLE),
    resolveFontName,
  );
}

export function resolvePdfTitleStyle(resolveFontName: (name?: string | null) => string) {
  return fieldStyleToPdfmake(
    normalizeFieldDisplayStyle(DOCUMENT_TITLE_STYLE),
    resolveFontName,
  );
}

export function resolveTableColumnPdfStyle(
  tableFieldId: string,
  colKey: string,
  fieldSchemas: Record<string, any>,
  fieldValueStyle: FieldValueStyleOptions | undefined,
  resolveFontName: (name?: string | null) => string,
  pageSetup?: any,
) {
  const style = resolveTableColumnDisplayStyle(
    tableFieldId,
    colKey,
    fieldSchemas,
    fieldValueStyle,
    resolvePageSetupTextStyle(pageSetup),
  );
  return fieldStyleToPdfmake(style, resolveFontName);
}

export function resolvePdfFieldStyle(
  fieldId: string,
  fieldSchemas: Record<string, any>,
  fieldValueStyle: FieldValueStyleOptions | undefined,
  resolveFontName: (name?: string | null) => string,
  baseStyle: FieldDisplayStyle = DEFAULT_DOCUMENT_BODY_STYLE,
) {
  const schema = fieldSchemas?.[fieldId];
  const resolvedBase =
    baseStyle === DEFAULT_DOCUMENT_BODY_STYLE
      ? { ...baseStyle, ...fieldValueStyle?.default }
      : baseStyle;
  const cellRef = parseCellFieldId(fieldId, fieldSchemas);
  const style =
    cellRef && baseStyle === DOCUMENT_TABLE_TEXT_STYLE
      ? resolveTableCellDisplayStyle(
          cellRef.tableFieldId,
          cellRef.colKey,
          schema,
          fieldSchemas,
          fieldValueStyle,
        )
      : resolveFieldDisplayStyle(schema, resolvedBase);
  return fieldStyleToPdfmake(style, resolveFontName);
}

/**
 * Apply fill-mode field marker underline to pdfmake inline style.
 */
export function applyPdfFieldHighlightDecoration(
  pdfStyle: Record<string, unknown>,
  highlightStyle: FieldHighlightStyle,
): Record<string, unknown> {
  return {
    ...pdfStyle,
    decoration: 'underline',
    decorationColor: highlightStyle?.color ?? '#0000FF',
  };
}

export function resolvePdfFieldStyleForExport(
  fieldId: string,
  ctx: {
    fieldSchemas: Record<string, any>;
    fieldValueStyle: FieldValueStyleOptions | undefined | Record<string, unknown>;
    resolveFontName: (name?: string | null) => string;
    fieldHighlightStyle: FieldHighlightStyle | Record<string, unknown>;
  },
  baseStyle: FieldDisplayStyle = DEFAULT_DOCUMENT_BODY_STYLE,
) {
  return resolvePdfFieldStyle(
    fieldId,
    ctx.fieldSchemas,
    ctx.fieldValueStyle,
    ctx.resolveFontName,
    baseStyle,
  );
}

export function resolvePdfFieldHighlightStyle(
  pageSetup: any,
  editorDefault?: FieldHighlightStyle | null,
): FieldHighlightStyle {
  return resolvePageSetupFieldHighlightStyle(pageSetup, editorDefault);
}
