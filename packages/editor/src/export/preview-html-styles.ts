import {
  DEFAULT_DOCUMENT_BODY_STYLE,
  DOCUMENT_BODY_LINE_HEIGHT,
  DOCUMENT_TABLE_TEXT_STYLE,
} from '../core/document-display-defaults.js';
import { resolvePageSetupTextStyle } from '../core/page-setup-styles.js';

/** Strip values that could break out of an inline `<style>` block. */
function sanitizeCssValue(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim() || fallback;
  return raw.replace(/<\/style/gi, '').replace(/[<>;\n\r{}]/g, '');
}

/**
 * Resolve document typography for a standalone HTML export (no app CSS vars).
 */
export function resolvePreviewHtmlCssVars(exportOptions: any = {}): Record<string, string> {
  const textStyle = resolvePageSetupTextStyle(exportOptions.pageSetup);
  return {
    '--me-document-font-family': sanitizeCssValue(
      textStyle.fontFamily,
      DEFAULT_DOCUMENT_BODY_STYLE.fontFamily || 'sans-serif',
    ),
    '--me-document-font-size': sanitizeCssValue(
      textStyle.fontSize,
      DEFAULT_DOCUMENT_BODY_STYLE.fontSize || '16px',
    ),
    '--me-document-font-weight': sanitizeCssValue(
      textStyle.fontWeight,
      DEFAULT_DOCUMENT_BODY_STYLE.fontWeight || 'normal',
    ),
    '--me-document-line-height': String(DOCUMENT_BODY_LINE_HEIGHT),
    '--me-table-font-size': sanitizeCssValue(
      DOCUMENT_TABLE_TEXT_STYLE.fontSize,
      '14px',
    ),
  };
}

/**
 * Self-contained CSS for Simple preview / HTML export (matches in-app preview chrome).
 * Uses the same class names as `renderDocumentPreview` + editor.css preview rules.
 */
export function buildPreviewHtmlStylesheet(exportOptions: any = {}): string {
  const vars = resolvePreviewHtmlCssVars(exportOptions);
  const rootVars = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  return `
:root {
${rootVars}
}
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #000;
}
body {
  padding: 24px;
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  line-height: var(--me-document-line-height);
}
.preview-document {
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  line-height: var(--me-document-line-height);
  color: #000;
  max-width: 100%;
}
.preview-document__title {
  font-family: var(--me-document-font-family);
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 1em;
  color: #000;
}
.preview-document__section-wrap {
  margin-bottom: 1em;
}
.preview-document__section-wrap.document-section--border-top,
.document-section.document-section--border-top {
  border-top: 1px solid #000;
  padding-top: 6px;
}
.preview-document__section-wrap.document-section--border-bottom,
.document-section.document-section--border-bottom {
  border-bottom: 1px solid #000;
  padding-bottom: 6px;
}
.preview-document__section,
.document-section__body {
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  font-weight: var(--me-document-font-weight);
  line-height: var(--me-document-line-height);
  color: #000;
  outline: none;
  min-height: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.document-section__header {
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  font-weight: 600;
  color: #1a1a1a;
  padding: 6px 0 4px;
  border-bottom: 1px solid #ccc;
  margin-bottom: 8px;
}
.document-section__label-text {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
}
.preview-document__block {
  margin-bottom: 1em;
}
.preview-document__line {
  margin-bottom: 0.5em;
}
.preview-document__empty {
  color: #666;
  font-style: italic;
  margin: 0;
}
.document-section__body ul,
.document-section__body ol,
.preview-document ul,
.preview-document ol {
  margin: 0.25em 0;
  padding-left: 1.5em;
}
.document-section__body b,
.document-section__body strong,
.preview-document b,
.preview-document strong {
  font-weight: bold;
}
.document-section__body i,
.document-section__body em,
.preview-document i,
.preview-document em {
  font-style: italic;
}
.document-section__body u,
.preview-document u {
  text-decoration: underline;
}
.document-section__body s,
.document-section__body strike,
.preview-document s,
.preview-document strike {
  text-decoration: line-through;
}
.document-section__body mark,
.preview-document mark {
  background-color: #fff59d;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}
.document-section__body code,
.preview-document code {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 0.92em;
  background: #f0f0f0;
  padding: 0 3px;
  border-radius: 2px;
  border: 1px solid #ddd;
}
.preview-document h1,
.document-section__body h1 {
  display: block;
  font-size: 1.6em;
  font-weight: 700;
  line-height: 1.25;
  margin: 0.65em 0 0.35em;
}
.preview-document h2,
.document-section__body h2 {
  display: block;
  font-size: 1.35em;
  font-weight: 700;
  line-height: 1.3;
  margin: 0.55em 0 0.3em;
}
.preview-document h3,
.document-section__body h3 {
  display: block;
  font-size: 1.15em;
  font-weight: 700;
  line-height: 1.35;
  margin: 0.45em 0 0.25em;
}
.document-columns {
  margin: 0.5em 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.document-columns__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* Percent tracks (table-synced totals) must not add gap or they overflow 100%. */
  gap: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  align-items: stretch;
}
.document-columns__col {
  position: relative;
  min-width: 0;
  min-height: 1.5em;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
}
.preview-document .document-columns__col ul,
.preview-document .document-columns__col ol {
  margin: 0.25em 0;
  padding-left: 1.5em;
}
.vision-table-block,
.document-table,
.preview-document .document-table,
.preview-document .vision-table-block,
.preview-document .preview-document__block {
  display: block;
  width: 100%;
  min-width: 100%;
  max-width: 100%;
  margin: 0.5em 0;
  white-space: normal;
}
.vision-table,
.preview-document .vision-table {
  display: table;
  width: 100%;
  min-width: 100%;
  max-width: none;
  border-collapse: collapse;
  font-family: var(--me-document-font-family);
  font-size: var(--me-table-font-size);
  table-layout: fixed;
  white-space: normal;
}
.vision-table th,
.vision-table td,
.preview-document .vision-table th,
.preview-document .vision-table td {
  border: 1px solid #999;
  padding: 4px 8px;
  min-width: 0;
  overflow: visible;
  vertical-align: top;
  white-space: normal;
}
.vision-table th,
.preview-document .vision-table th {
  background: #f0f0f0;
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  font-weight: var(--me-document-font-weight);
  color: inherit;
  text-transform: none;
  letter-spacing: normal;
  text-align: center;
}
.vision-table--borderless th,
.vision-table--borderless td,
.preview-document .vision-table--borderless th,
.preview-document .vision-table--borderless td {
  border: none;
}
.vision-table__row-label,
.vision-table__row-label-head {
  font-weight: 600;
  white-space: nowrap;
}
.preview-document .vision-table .field-token--cell {
  font-family: var(--me-document-font-family);
  font-size: var(--me-table-font-size);
  font-weight: normal;
}
.preview-document .field-token--preview:not(.field-token--image) {
  color: #000;
  text-decoration: none;
  cursor: default;
  font-style: normal;
}
.preview-document--hide-empty .field-token--preview.field-token--empty:not(.field-token--required-missing) {
  display: none;
}
.preview-document:not(.preview-document--hide-empty) .field-token--preview.field-token--empty:not(.field-token--repeater),
.preview-document .field-token--preview.field-token--required-missing {
  color: #888;
  font-style: italic;
}
.preview-document .field-token--preview.field-token--image,
.field-token--image {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  margin: 0.5em 0;
  padding: 0;
  clear: both;
}
.field-token__thumb {
  display: block;
  width: auto;
  height: auto;
  max-width: var(--field-image-max-width, 320px);
  border-radius: 2px;
  border: 1px solid #ccc;
}
.field-token__caption {
  font-size: 12px;
  color: #333;
}
.preview-document__image-fallback {
  font-style: italic;
  color: #444;
}
.document-align--center > .field-token--preview.field-token--image,
.document-align--center > .field-token--image {
  margin-inline: auto;
}
.document-align--right > .field-token--preview.field-token--image,
.document-align--right > .field-token--image {
  margin-inline-start: auto;
  margin-inline-end: 0;
}
.document-align--left > .field-token--preview.field-token--image,
.document-align--left > .field-token--image {
  margin-inline-start: 0;
  margin-inline-end: auto;
}
.repeater-block,
.field-token__repeater-preview {
  display: block;
  width: 100%;
}
.field-token__repeater-instance + .field-token__repeater-instance {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e3edf5;
}
.field-token__repeater-instance-title {
  font-size: 12px;
  font-weight: 600;
  color: #2f6b9a;
  margin-bottom: 4px;
}
.field-token__repeater-instance-body {
  font-size: 13px;
  line-height: 1.45;
}
.field-token__repeater-instance-body .preview-document {
  padding: 0;
}
.repeater-block__instance {
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}
.repeater-block__instance-header {
  padding: 6px 10px;
  background: #fafafa;
  font-weight: 600;
  font-size: 13px;
  color: #444;
  border-bottom: 1px solid #e8e8e8;
}
.repeater-block__instance-body {
  padding: 8px 10px;
}
.repeater-block__field-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 4px;
}
.repeater-block__field-label {
  color: #555;
}
/* Hide editor-only chrome if it ever appears in export DOM */
.document-columns__toolbar,
.document-table__toolbar,
.vision-table__col-resizer,
.vision-table__row-actions,
.vision-table__row-remove,
.document-table__row-actions,
.editor-drag-handle {
  display: none !important;
}
`.trim();
}
