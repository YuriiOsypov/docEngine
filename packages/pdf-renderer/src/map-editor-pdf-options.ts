import { DEFAULT_DOCUMENT_BODY_STYLE } from '@docengine/editor/node';
import type { EditorDocument, PdfRenderOptions } from './types.js';

export type EditorPdfOptions = PdfRenderOptions & {
  format?: string;
  margin?: number | number[];
  title?: string;
  fieldValueStyle?: any;
};

/**
 * Map editor / preview export options onto PdfRenderOptions for generateDocumentPdf*.
 * Must forward hideEmptyValues — preview modal and exportPdf both rely on it.
 */
export function mapEditorPdfOptions(
  doc: EditorDocument,
  editorOptions: EditorPdfOptions = {},
): PdfRenderOptions {
  const docPageSetup = (doc as any)?.pageSetup ?? {};
  const optionsPageSetup = editorOptions.pageSetup ?? {};
  return {
    pageSetup: {
      ...docPageSetup,
      ...optionsPageSetup,
      format: editorOptions.format ?? optionsPageSetup.format ?? docPageSetup.format,
      margin: editorOptions.margin ?? optionsPageSetup.margin ?? docPageSetup.margin,
      title: editorOptions.title ?? optionsPageSetup.title ?? docPageSetup.title,
    },
    fonts: editorOptions.fonts ?? { preset: 'Inter' },
    fieldHighlight:
      editorOptions.fieldHighlight ?? optionsPageSetup.fieldHighlight ?? docPageSetup.fieldHighlight,
    fieldValueStyle: {
      default: {
        ...DEFAULT_DOCUMENT_BODY_STYLE,
        ...editorOptions.fieldValueStyle?.default,
      },
    },
    hideEmptyValues: editorOptions.hideEmptyValues === true,
  };
}
