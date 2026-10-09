import type {
  FieldDisplayStyle,
  FieldHighlightStyle,
  FieldValueStyleOptions,
} from '@docengine/engine';

export type { FieldDisplayStyle, FieldHighlightStyle, FieldValueStyleOptions };

/** Soft aliases for editor document shapes used by the PDF layer. */
export type EditorDocument = Record<string, any>;
export type TemplateExport = Record<string, any>;
export type FieldsExport = Record<string, any>;

export interface PdfHeaderSetup {
  /** Reserved header band height in mm */
  height?: number;
  /** @deprecated static header lines */
  lines?: string[];
  /** @deprecated template variables for header lines */
  variables?: Record<string, string>;
  /** Set at render time for dynamic repeatable headers */
  fromRepeatableSection?: boolean;
}

export interface PdfFooterSetup {
  /** Reserved footer band height in mm */
  height?: number;
  text?: string;
  showPageNumbers?: boolean;
}

export interface PdfPageSetup {
  format?: 'a4' | 'letter' | 'custom' | string;
  orientation?: 'portrait' | 'landscape' | string;
  /** Custom page width in mm (portrait base). Used when format is "custom". */
  widthMm?: number;
  /** Custom page height in mm (portrait base). Used when format is "custom". */
  heightMm?: number;
  /** top, right, bottom, left in mm */
  margin?: number | [number, number, number, number];
  title?: string;
  textStyle?: FieldDisplayStyle;
  valueStyle?: FieldDisplayStyle;
  header?: PdfHeaderSetup;
  footer?: PdfFooterSetup;
  [key: string]: unknown;
}

export interface PdfFontFamilyFiles {
  normal: string;
  bold?: string;
  italics?: string;
  bolditalics?: string;
}

export interface PdfFontSetup {
  defaultFont?: string;
  /** Named preset such as `dejavu`, `Inter`, or `Roboto`. */
  preset?: string;
  families?: Record<string, PdfFontFamilyFiles>;
}

export interface PdfRenderOptions {
  pageSetup?: PdfPageSetup;
  fonts?: PdfFontSetup;
  fieldValueStyle?: FieldValueStyleOptions;
  fieldHighlight?: FieldHighlightStyle;
  /** When true, omit empty fields from PDF output */
  hideEmptyValues?: boolean;
  /** Pre-fetched image data URLs keyed by original src */
  imageMap?: Map<string, string>;
  [key: string]: unknown;
}

export interface PdfGenerateInput {
  template: TemplateExport;
  document: FieldsExport;
  pageSetup?: PdfPageSetup;
  fonts?: PdfFontSetup;
  fieldValueStyle?: FieldValueStyleOptions;
  fieldHighlight?: FieldHighlightStyle;
  /** When true, omit empty fields from PDF output */
  hideEmptyValues?: boolean;
  [key: string]: unknown;
}
