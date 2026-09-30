import { DEFAULT_FIELD_VALUE_STYLE_OPTIONS } from '@docengine/editor/node';
import type { EditorDocument } from './types.js';
import { renderDocumentToPdfDefinition } from './document-pdf-definition-browser.js';
import { renderDocumentToPdfDefinitionFromPreview } from './document-pdf-definition-preview-browser.js';
import { generateDocumentPdf, generateDocumentPdfFromPreview, generatePdfBuffer } from './generate-pdf-browser.js';
import { renderDocumentToPdfContent, hasMultipageRepeatableContent, shouldUseLegacyPdfExport } from './multipage-renderer.js';
import { mmToPt, marginMmToPt, normalizeMarginMm, resolvePageOrientation, resolvePageSize } from './units.js';
import { mapEditorPdfOptions, type EditorPdfOptions } from './map-editor-pdf-options.js';

export {
  renderDocumentToPdfDefinition,
  renderDocumentToPdfDefinitionFromPreview,
  generateDocumentPdf,
  generateDocumentPdfFromPreview,
  generatePdfBuffer,
  renderDocumentToPdfContent,
  hasMultipageRepeatableContent,
  shouldUseLegacyPdfExport,
  mmToPt,
  marginMmToPt,
  normalizeMarginMm,
  resolvePageOrientation,
  resolvePageSize,
  DEFAULT_FIELD_VALUE_STYLE_OPTIONS,
  mapEditorPdfOptions,
};

export type { EditorPdfOptions };

export { previewDomToPdfContent } from './preview-dom-to-pdf.js';
export { buildFontRegistry, BROWSER_FONT_PRESETS } from './fonts-browser-registry.js';
export { createRenderDocumentToPdfDefinitionFromPreview } from './document-pdf-definition-preview.js';

export async function generateDocumentPdfBlobFromPreview(
  doc: EditorDocument,
  previewRoot: HTMLElement,
  options: EditorPdfOptions = {},
): Promise<Blob> {
  const bytes = await generateDocumentPdfFromPreview(doc, previewRoot, mapEditorPdfOptions(doc, options));
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export async function generateDocumentPdfBlob(
  doc: EditorDocument,
  options: EditorPdfOptions = {},
): Promise<Blob> {
  const bytes = await generateDocumentPdf(doc, mapEditorPdfOptions(doc, options));
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
