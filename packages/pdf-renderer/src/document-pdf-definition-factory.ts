import { DOCUMENT_BODY_LINE_HEIGHT } from '@docengine/editor/node';
import type { EditorDocument, PdfFontSetup, PdfPageSetup, PdfRenderOptions } from './types.js';
import { TABLE_PDF_LINE_HEIGHT } from './table-layout.js';
import {
  resolvePdfSectionHeaderStyle,
  resolvePdfTableTextStyle,
  resolvePdfTextStyle,
  resolvePdfTitleStyle,
} from './style-mapper.js';
import {
  renderDocumentToPdfContent,
  multipageTargetsRepeatableSection,
} from './multipage-renderer.js';
import { buildRepeatableSectionPageHeader } from './repeatable-section-header.js';
import type { buildFontRegistry } from './fonts-registry.js';
import { marginMmToPt, mmToPt, normalizeMarginMm, resolveDocPageOrientation, resolvePageSize } from './units.js';

type FontRegistry = ReturnType<typeof buildFontRegistry>;

function withPdfDefaultFont(style: Record<string, unknown>, defaultFont: string) {
  return { ...style, font: style.font ?? defaultFont };
}

export function resolvePdfPageSetup(
  doc: EditorDocument,
  options: PdfRenderOptions & { format?: string; margin?: number | number[]; title?: string } = {},
): PdfPageSetup {
  const docPageSetup = (doc as any)?.pageSetup ?? {};
  const optionsPageSetup = options.pageSetup ?? {};
  const footer = { ...docPageSetup.footer, ...optionsPageSetup.footer };
  const pageSetup: PdfPageSetup = {
    ...docPageSetup,
    ...optionsPageSetup,
    format: options.format ?? optionsPageSetup.format ?? docPageSetup.format,
    orientation: optionsPageSetup.orientation ?? docPageSetup.orientation,
    margin: options.margin ?? optionsPageSetup.margin ?? docPageSetup.margin,
    title: options.title ?? optionsPageSetup.title ?? docPageSetup.title,
  };
  // Explicit null from caller clears a stale Show-on-each-page header band.
  if (optionsPageSetup.header === null) {
    delete pageSetup.header;
  }
  if (footer.text || footer.showPageNumbers || footer.height != null) pageSetup.footer = footer;
  return pageSetup;
}

export function buildPdfDocumentDefinition(
  doc: EditorDocument,
  options: PdfRenderOptions,
  content: Array<Record<string, unknown>>,
  fontRegistry: FontRegistry,
  extras: { repeatableHeader?: ReturnType<typeof buildRepeatableSectionPageHeader> | null } = {},
) {
  const pageSetup = resolvePdfPageSetup(doc, options);
  const { resolveFontName, defaultFont } = fontRegistry;
  const repeatableHeader = extras.repeatableHeader ?? null;

  const [marginTop, marginRight, marginBottom, marginLeft] = normalizeMarginMm(pageSetup.margin);
  const headerHeightMm = pageSetup.header?.height ?? 0;
  const footerHeightMm = pageSetup.footer?.height ?? (pageSetup.footer ? 10 : 0);

  const pageMargins = marginMmToPt([
    marginTop + headerHeightMm,
    marginRight,
    marginBottom + footerHeightMm,
    marginLeft,
  ]);

  const bodyStyle = resolvePdfTextStyle(pageSetup, options.fieldValueStyle, resolveFontName);
  const sectionHeaderStyle = withPdfDefaultFont(resolvePdfSectionHeaderStyle(resolveFontName), defaultFont);
  const tableTextStyle = withPdfDefaultFont(resolvePdfTableTextStyle(resolveFontName), defaultFont);
  const titleStyle = withPdfDefaultFont(resolvePdfTitleStyle(resolveFontName), defaultFont);

  const pdfContent = [...content];
  if (pageSetup.title?.trim() && !pdfContent.some((node) => node?.style === 'documentTitle')) {
    pdfContent.unshift({
      text: pageSetup.title.trim(),
      style: 'documentTitle',
      margin: [0, 0, 0, 10],
    });
  }

  const pageSize = resolvePageSize(pageSetup.format, pageSetup, pageSetup.orientation);
  const pageOrientation = resolveDocPageOrientation(pageSetup.format, pageSetup.orientation);
  const docDefinition: Record<string, unknown> = {
    pageSize,
    ...(pageOrientation ? { pageOrientation } : {}),
    pageMargins,
    defaultStyle: {
      ...withPdfDefaultFont(bodyStyle, defaultFont),
      lineHeight: DOCUMENT_BODY_LINE_HEIGHT,
    },
    styles: {
      documentTitle: {
        ...titleStyle,
        margin: [0, 0, 0, 8],
      },
      sectionHeader: {
        ...sectionHeaderStyle,
      },
      tableHeader: {
        ...tableTextStyle,
        bold: true,
        alignment: 'center',
        fillColor: '#f0f0f0',
        lineHeight: TABLE_PDF_LINE_HEIGHT,
      },
      tableBody: {
        ...tableTextStyle,
        lineHeight: TABLE_PDF_LINE_HEIGHT,
      },
      empty: {
        italics: true,
        color: '#666666',
        font: defaultFont,
      },
      pageHeader: {
        fontSize: 9,
        color: '#333333',
        font: defaultFont,
      },
      pageFooter: {
        fontSize: 9,
        color: '#666666',
        font: defaultFont,
      },
    },
    content: pdfContent,
  };

  if (repeatableHeader) {
    docDefinition.header = () => ({
      margin: [pageMargins[0], mmToPt(marginTop), pageMargins[2], 0],
      stack: repeatableHeader.stack,
    });
  }

  const footer = pageSetup.footer;
  if (footer?.text || footer?.showPageNumbers) {
    docDefinition.footer = (currentPage: number, pageCount: number) => {
      const parts: Array<Record<string, unknown>> = [];
      if (footer.text) parts.push({ text: footer.text, style: 'pageFooter' });
      if (footer.showPageNumbers) {
        parts.push({
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: 'right',
          style: 'pageFooter',
        });
      }
      if (parts.length === 1) {
        return { ...parts[0], margin: [pageMargins[0], 0, pageMargins[2], mmToPt(marginBottom)] };
      }
      return {
        margin: [pageMargins[0], 0, pageMargins[2], mmToPt(marginBottom)],
        columns: parts,
      };
    };
  }

  return { docDefinition, fonts: fontRegistry.fonts };
}

export function createRenderDocumentToPdfDefinition(
  buildFontRegistryFn: (fontSetup?: PdfFontSetup) => FontRegistry,
) {
  return function renderDocumentToPdfDefinition(
    doc: EditorDocument,
    options: PdfRenderOptions = {},
  ) {
    const pageSetup = resolvePdfPageSetup(doc, options);
    const fontRegistry = buildFontRegistryFn(options.fonts);
    const { resolveFontName, defaultFont } = fontRegistry;

    const renderOptions = {
      ...options,
      resolveFontName,
      defaultFont,
    };

    // Keep PDF page header when "Show on each page" is a different section than
    // the multi-instance expand target. Same-section expand uses body titles instead.
    const repeatableHeader = multipageTargetsRepeatableSection(doc)
      ? null
      : buildRepeatableSectionPageHeader(doc, renderOptions);
    if (repeatableHeader) {
      pageSetup.header = {
        height: repeatableHeader.heightMm,
        fromRepeatableSection: true,
      };
      renderOptions.pageSetup = pageSetup;
    } else if (pageSetup.header?.fromRepeatableSection) {
      // Drop a stale header band so multipage body clones are not pushed down unevenly.
      // Explicit null so resolvePdfPageSetup merge does not revive doc.pageSetup.header.
      pageSetup.header = null as any;
      renderOptions.pageSetup = pageSetup;
    }

    const content = renderDocumentToPdfContent(doc, renderOptions);
    return buildPdfDocumentDefinition(doc, { ...options, pageSetup }, content, fontRegistry, {
      repeatableHeader,
    });
  };
}
