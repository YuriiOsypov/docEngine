import { saveBlobToDisk } from '../utils/save-blob.js';
import { resolvePreviewExportOptions } from './preview-export-options.js';

/** False in the Salesforce Static Resource build (pdfmake stubbed). */
export const isClientPdfAvailable = true;

/**
 * Portal / browser PDF: same JSON → pdfmake path as `/api/v1/render/pdf`.
 * Repeating page headers and long-table header repetition come from that renderer.
 *
 * pdfmake + font VFS (~5MB) load only when PDF is actually requested so the
 * editor shell stays small on first playground / fill paint.
 *
 * @param {import('../types.d.ts').EditorDocument} doc
 * @param {import('../types.d.ts').PdfExportOptions} [options]
 * @returns {Promise<Blob>}
 */
export async function generateDocumentPdfBlob(doc: any, options: any = {}) {
  try {
    const exportOptions = resolvePreviewExportOptions(doc, options);
    const { generateDocumentPdfBlob: renderJsonDocumentPdfBlob } = await import(
      '@docengine/pdf-renderer/browser'
    );
    return await renderJsonDocumentPdfBlob(doc, exportOptions);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message ? `PDF export failed: ${message}` : 'PDF export failed.');
  }
}

/**
 * @param {import('../types.d.ts').EditorDocument} doc
 * @param {import('../types.d.ts').PdfExportOptions} [options]
 */
export async function exportDocumentPdf(doc: any, options: any = {}) {
  const { download = true, filename = 'document.pdf' } = options;
  const blob = await generateDocumentPdfBlob(doc, options);

  if (download) {
    await saveBlobToDisk(blob, filename, 'application/pdf');
  }

  return blob;
}
