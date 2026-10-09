import type { FieldDisplayStyle, FieldHighlightStyle, FieldValueStyleOptions } from '../types.js';

/** Default document / preview font stack (matches `.document-section__body` in editor.css). */
export const EDITOR_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** @deprecated Use EDITOR_FONT_FAMILY */
export const DOCUMENT_PREVIEW_FONT_FAMILY = EDITOR_FONT_FAMILY;

export const DEFAULT_DOCUMENT_BODY_STYLE: FieldDisplayStyle = {
  fontFamily: EDITOR_FONT_FAMILY,
  fontSize: '16px',
  fontWeight: 'normal',
  color: '#000000',
  textDecoration: 'none',
};

export const DEFAULT_FIELD_VALUE_STYLE_OPTIONS: FieldValueStyleOptions = {
  default: DEFAULT_DOCUMENT_BODY_STYLE,
};

/** Default HTML unvisited link blue. */
export const DEFAULT_FIELD_LINK_COLOR = '#0000FF';

/** Mention-style field markers in fill mode (link blue + soft teal wash). */
export const DEFAULT_FIELD_HIGHLIGHT_STYLE: FieldHighlightStyle = {
  color: DEFAULT_FIELD_LINK_COLOR,
  backgroundColor: '#F0FDFA',
  fontWeight: '500',
  borderWidth: '1px',
};

/** Matches `.document-section__header` in editor.css */
export const DOCUMENT_SECTION_HEADER_STYLE: FieldDisplayStyle = {
  fontFamily: EDITOR_FONT_FAMILY,
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  textDecoration: 'none',
};

/** Matches `.vision-table` in editor.css */
export const DOCUMENT_TABLE_TEXT_STYLE: FieldDisplayStyle = {
  fontFamily: EDITOR_FONT_FAMILY,
  fontSize: '14px',
  fontWeight: 'normal',
  color: '#000000',
  textDecoration: 'none',
};

/**
 * Table column headers: same format as document body / Page setup text style.
 * Never inherits column cell displayStyle.
 */
export const DOCUMENT_TABLE_HEADER_STYLE: FieldDisplayStyle = {
  ...DEFAULT_DOCUMENT_BODY_STYLE,
  textAlign: 'center',
};

/** Matches `.preview-document__title` in editor.css */
export const DOCUMENT_TITLE_STYLE: FieldDisplayStyle = {
  fontFamily: EDITOR_FONT_FAMILY,
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#000000',
};

/** Matches `.preview-document` line-height in editor.css */
export const DOCUMENT_BODY_LINE_HEIGHT = 1.65;
