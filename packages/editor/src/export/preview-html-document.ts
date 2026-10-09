import { renderDocumentPreview } from '../fields/document-preview.js';
import { applyPageFormatCssVars } from '../core/page-setup-styles.js';
import { buildPreviewHtmlStylesheet } from './preview-html-styles.js';

/**
 * Wrap Simple preview DOM in a standalone HTML document string (with inlined CSS).
 * Includes page-setup sheet styling so Save HTML matches Document preview.
 */
export function buildPreviewHtmlDocument(doc: any, exportOptions: any = {}): string {
  const root = renderDocumentPreview(doc, exportOptions);
  const title = String(exportOptions.title || 'document').replace(/</g, '&lt;');
  const styles = buildPreviewHtmlStylesheet(exportOptions);

  const sheet = document.createElement('div');
  sheet.className = 'preview-export-sheet';
  applyPageFormatCssVars(sheet, exportOptions.pageSetup ?? doc?.pageSetup ?? {});
  sheet.appendChild(root);

  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>` +
    `<title>${title}</title>` +
    `<style>${styles}</style>` +
    `</head><body>${sheet.outerHTML}</body></html>`
  );
}

/**
 * @returns {Blob} text/html blob for download / attach / share.
 */
export function buildPreviewHtmlBlob(doc: any, exportOptions: any = {}): Blob {
  const html = buildPreviewHtmlDocument(doc, exportOptions);
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}
