import type { EditorDocument, PdfFontSetup, PdfRenderOptions } from './types.js';
import { resolvePdfSectionHeaderStyle, resolvePdfTextStyle } from './style-mapper.js';
import { buildPdfDocumentDefinition } from './document-pdf-definition-factory.js';
import { buildRepeatableSectionPageHeader } from './repeatable-section-header.js';
import { previewDomToPdfContent } from './preview-dom-to-pdf.js';
import { estimateContentWidthPt } from './repeatable-table-pagination.js';
import type { buildFontRegistry } from './fonts-registry.js';

type FontRegistry = ReturnType<typeof buildFontRegistry>;

export function createRenderDocumentToPdfDefinitionFromPreview(
  buildFontRegistryFn: (fontSetup?: PdfFontSetup) => FontRegistry,
) {
  return function renderDocumentToPdfDefinitionFromPreview(
    previewRoot: HTMLElement,
    doc: EditorDocument,
    options: PdfRenderOptions = {},
  ) {
    const fontRegistry = buildFontRegistryFn(options.fonts);
    const { resolveFontName, defaultFont } = fontRegistry;
    let pageSetup = { ...((doc as any)?.pageSetup ?? {}), ...(options.pageSetup ?? {}) };
    const bodyStyle = resolvePdfTextStyle(pageSetup, options.fieldValueStyle, resolveFontName);
    const sectionHeaderStyle = resolvePdfSectionHeaderStyle(resolveFontName);

    const repeatableHeader = buildRepeatableSectionPageHeader(doc, {
      ...options,
      resolveFontName,
      defaultFont,
    });
    if (repeatableHeader) {
      pageSetup = {
        ...pageSetup,
        header: {
          height: repeatableHeader.heightMm,
          fromRepeatableSection: true,
        },
      };
    }

    // bodyStyle.font is the font resolved from pageSetup.textStyle.fontFamily.
    // Use it as the body font for content blocks; fall back to defaultFont if unset.
    const bodyFont = String(bodyStyle.font ?? defaultFont);

    const content = previewDomToPdfContent(previewRoot, {
      resolveFontName,
      defaultFont,
      bodyFont,
      baseFontSize: Number(bodyStyle.fontSize),
      sectionHeaderStyle: { ...sectionHeaderStyle, font: defaultFont },
      imageMap: options.imageMap,
      contentWidthPt: estimateContentWidthPt(pageSetup),
    });

    return buildPdfDocumentDefinition(
      doc,
      { ...options, pageSetup },
      content,
      fontRegistry,
      { repeatableHeader },
    );
  };
}
