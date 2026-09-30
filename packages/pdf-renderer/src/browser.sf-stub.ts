/**
 * Salesforce stub for @docengine/pdf-renderer/browser.
 * Heavy pdfmake + font VFS are omitted from the Static Resource bundle.
 */

export async function generateDocumentPdfBlob() {
  throw new Error(
    'Client-side PDF is not available in the Salesforce bundle. Use Apex or pdf-service.',
  );
}

export async function generateDocumentPdfBlobFromPreview() {
  throw new Error(
    'Client-side PDF is not available in the Salesforce bundle. Use Apex or pdf-service.',
  );
}

export function mapEditorPdfOptions(doc: any, editorOptions: any = {}) {
  return {
    pageSetup: doc?.pageSetup ?? {},
    ...editorOptions,
    hideEmptyValues: editorOptions.hideEmptyValues === true,
  };
}

export const DEFAULT_FIELD_VALUE_STYLE_OPTIONS = {};
