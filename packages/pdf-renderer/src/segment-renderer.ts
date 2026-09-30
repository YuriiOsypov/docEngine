import {
  buildRepeaterFillDocument,
  cellFieldId,
  collectAllValues,
  DOCUMENT_TABLE_TEXT_STYLE,
  enrichComputedValues,
  evaluateComputedField,
  filterSegmentsForPreview,
  formatFieldDisplay,
  getFieldDisplayLabel,
  getFieldHandler,
  getTableSchema,
  isFieldEmpty,
  isTableCellDisplayPlaceholder,
  normalizeRepeaterValue,
  repeaterHasContent,
  resolveTableInstanceRows,
  tableSegmentHasContent,
  tableSegmentHasRequiredEmpty,
  findAdjacentTableBlock,
  resolvePageSetupFieldValueStyle,
  resolvePageSetupFieldHighlightStyle,
  evaluateSectionVisibility,
  barcodeValueToPdfBlock,
} from '@docengine/editor/node';
import { isPivotTableValue, createEmptyPivotValue, formatNumericDisplay } from '@docengine/engine';
import { htmlToPdfBlocks, htmlToPdfText, isBlockLevelHtml, pdfBlocksHaveContent, pdfTextContent, plainTextToPdfText, finalizePdfInlineParts, withPdfStyle } from './html-text.js';
import {
  resolvePdfFieldStyleForExport,
  resolvePdfSectionHeaderStyle,
  resolvePdfTextStyle,
  resolveTableColumnPdfStyle,
  DEFAULT_BODY_FONT_PT,
  DEFAULT_TABLE_FONT_PT,
} from './style-mapper.js';
import { resolveVisionTablePdfLayout, TABLE_PDF_LINE_HEIGHT } from './table-layout.js';
import { withPdfSectionBorderRules } from './pdf-horizontal-rule.js';
import {
  chunkTableBodyRowsVariable,
  estimateContinuationChunkMaxBodyHeight,
  estimateFirstChunkMaxBodyHeight,
  estimatePdfContentHeightPt,
  repeatableChunkFitsPage,
} from './repeatable-table-pagination.js';
import { usesRepeatablePageHeader, buildRepeatableSectionPageHeader } from './repeatable-section-header.js';
import { parseTableColumnWidth, tableColumnWidthsFromSchema } from './table-column-width.js';

function tableHasRowLabels(rows: any): boolean {
  return (rows ?? []).some((row: any) => String(row?.label ?? '').trim() !== '');
}

function shouldShowRowLabels(tableSchema: any, rows: any): boolean {
  return tableSchema?.showRowLabels === true && tableHasRowLabels(rows);
}
import type { PdfRenderOptions, PdfPageSetup, EditorDocument } from './types.js';

type PdfContentNode = Record<string, any>;
type PdfRenderContext = any;
type PdfRenderOptionsExt = PdfRenderOptions & {
  resolveFontName: (name?: string | null) => string;
  defaultFont: string;
  skipRepeatablePageHeader?: boolean;
};

function parseColumnWidth(width: any) {
  return parseTableColumnWidth(width);
}

function resolveFieldValue(fieldId: any, fieldValues: any, fieldSchemas: any, blocks: any) {
  const schema = fieldSchemas?.[fieldId];
  if (schema?.type === 'computed') {
    if (Object.prototype.hasOwnProperty.call(fieldValues, fieldId)) {
      return fieldValues[fieldId];
    }
    return evaluateComputedField(fieldId, fieldValues, fieldSchemas, { blocks }).value;
  }
  return fieldValues[fieldId];
}

export function createPdfRenderContext(doc: EditorDocument, options: PdfRenderOptionsExt): PdfRenderContext {
  const fieldSchemas = doc.fieldSchemas ?? {};
  const blocks = doc.blocks ?? [];
  const fieldValues = collectAllValues(blocks);
  enrichComputedValues(fieldValues, fieldSchemas, blocks);
  const pageSetup = { ...(doc.pageSetup ?? {}), ...(options.pageSetup ?? {}) };
  const fieldValueStyle = resolvePageSetupFieldValueStyle(pageSetup, options.fieldValueStyle);
  const fieldHighlightStyle = resolvePageSetupFieldHighlightStyle(pageSetup, options.fieldHighlight);
  const textPdfStyle = resolvePdfTextStyle(pageSetup, options.fieldValueStyle, options.resolveFontName);
  const bodyPdfStyle = {
    ...textPdfStyle,
    font: textPdfStyle.font ?? options.defaultFont,
  };
  const rawSectionHeaderStyle = resolvePdfSectionHeaderStyle(options.resolveFontName);
  const sectionHeaderPdfStyle = {
    ...rawSectionHeaderStyle,
    font: rawSectionHeaderStyle.font ?? options.defaultFont,
  };

  return {
    fieldSchemas,
    blocks,
    fieldValues,
    pageSetup,
    fieldHighlightStyle,
    hideEmptyValues: options.hideEmptyValues === true,
    previewContext: {
      previewMode: true,
      fieldSchemas,
      fieldValueStyle,
      blocks,
      hideEmptyValues: options.hideEmptyValues === true,
    },
    resolveFontName: options.resolveFontName,
    defaultFont: options.defaultFont,
    fieldValueStyle,
    textPdfStyle: bodyPdfStyle,
    bodyPdfStyle,
    sectionHeaderPdfStyle,
  };
}

export function isHideTitleInPreview(data: any): boolean {
  const value = data?.hideTitleInPreview;
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export function resolveVisibleSectionLabel(data: any): string {
  if (!data || isHideTitleInPreview(data)) return '';
  return String(data.label ?? '').trim();
}

export function buildPdfSectionTitleNode(
  sectionLabel: any,
  sectionHeaderStyle: any,
  margin: number[] = [0, 0, 0, 6],
): PdfContentNode | null {
  const label = String(sectionLabel ?? '').trim();
  if (!label) return null;
  return {
    text: label,
    ...sectionHeaderStyle,
    style: 'sectionHeader',
    margin,
  };
}

function stripBlockAlignment(style: any) {
  const inlineStyle = { ...style };
  delete inlineStyle.alignment;
  // Cell fill belongs on the table cell node, not inline text parts.
  delete inlineStyle.fillColor;
  return inlineStyle;
}

/** Table body text: drop both fillColor and background so only td fillColor paints. */
function stripTableCellInlineStyle(style: any) {
  const inlineStyle = stripBlockAlignment(style);
  delete inlineStyle.background;
  return inlineStyle;
}

function withTableCellFillColor(cell: any, style: any): any {
  const fillColor = style?.fillColor;
  if (!fillColor) return cell;
  if (cell === '' || cell == null) {
    return { text: '', fillColor, lineHeight: TABLE_PDF_LINE_HEIGHT };
  }
  if (typeof cell !== 'object') {
    return { text: cell, fillColor, lineHeight: TABLE_PDF_LINE_HEIGHT };
  }
  return { ...cell, fillColor };
}

function pushPdfBlocks(
  content: any,
  blocks: any,
  style: any = {},
  blockStyle: any = {},
  defaultAlignment?: any,
  defaultFont?: any,
) {
  const inlineStyle = stripBlockAlignment(style);
  const fallbackAlignment = defaultAlignment ?? style.alignment;
  const fontName = String(inlineStyle.font ?? defaultFont ?? '');

  for (const block of blocks) {
    const parts = finalizePdfInlineParts(block.parts, { font: fontName, inlineStyle });
    if (!pdfTextContent(parts)) continue;
    const node: PdfContentNode = {
      text: parts,
      margin: block.margin ?? [0, 0, 0, 4],
      ...blockStyle,
    };
    const alignment = block.alignment ?? fallbackAlignment;
    if (alignment) node.alignment = alignment;
    content.push(node);
  }
}

function withTableCellLineHeight(cell: any): any {
  if (cell === '' || cell == null) return cell;
  if (typeof cell !== 'object') return { text: cell, lineHeight: TABLE_PDF_LINE_HEIGHT };
  return { ...cell, lineHeight: TABLE_PDF_LINE_HEIGHT };
}

function pdfBlocksToTableCell(blocks: any, style: any): any {
  const cellAlignment = style.alignment;
  const inlineStyle = { lineHeight: TABLE_PDF_LINE_HEIGHT, ...stripTableCellInlineStyle(style) };
  const fontName = String(inlineStyle.font ?? '');

  const nodes: PdfContentNode[] = [];
  for (const block of blocks) {
    const parts = finalizePdfInlineParts(block.parts, { font: fontName, inlineStyle });
    if (!pdfTextContent(parts)) continue;
    const node: PdfContentNode = { text: parts };
    if (block.alignment) node.alignment = block.alignment;
    else if (cellAlignment) node.alignment = cellAlignment;
    nodes.push(node);
  }
  let cell: any;
  if (!nodes.length) cell = '';
  else if (nodes.length === 1) cell = withTableCellLineHeight(nodes[0]);
  else cell = withTableCellLineHeight({ stack: nodes });
  return withTableCellFillColor(cell, style);
}

function buildEmptyPdfTableCell(cellId: any, ctx: PdfRenderContext): PdfContentNode {
  const style = resolvePdfFieldStyleForExport(
    cellId,
    ctx,
    DOCUMENT_TABLE_TEXT_STYLE,
  );
  const cell: PdfContentNode = {
    text: '',
    lineHeight: TABLE_PDF_LINE_HEIGHT,
    fontSize: style.fontSize ?? DEFAULT_TABLE_FONT_PT,
  };
  if (style.font) cell.font = style.font;
  if (style.alignment) cell.alignment = style.alignment;
  return withTableCellFillColor(cell, style);
}

export function renderSegmentsToPdfContent(segments: any, ctx: PdfRenderContext): PdfContentNode[] {
  return renderSegmentsToPdfProseBlocks(segments, ctx);
}

function createProseParagraphBuilder(content: any, defaultFont?: any) {
  let paragraphParts: any[] = [];
  let blockStyle: any = {};
  let currentAlign: any;

  return {
    ensureAlignment(align: any) {
      const nextAlign = align ?? null;
      if (currentAlign !== undefined && nextAlign !== currentAlign) {
        this.flush();
      }
      currentAlign = nextAlign;
    },
    appendParts(parts: any) {
      paragraphParts.push(...parts);
    },
    setBlockStyle(style: any) {
      blockStyle = style;
    },
    flush() {
      const text = pdfTextContent(paragraphParts);
      if (!text) {
        paragraphParts = [];
        blockStyle = {};
        currentAlign = undefined;
        return;
      }
      const parts = finalizePdfInlineParts(paragraphParts, { font: defaultFont });
      content.push({ text: parts, margin: [0, 0, 0, 0], ...blockStyle });
      paragraphParts = [];
      blockStyle = {};
      currentAlign = undefined;
    },
  };
}

function appendPlainTextToProseParagraph(raw: any, inlineStyle: any, builder: any) {
  const value = String(raw ?? '');
  if (!value) return;
  builder.appendParts(withPdfStyle(plainTextToPdfText(value), stripBlockAlignment(inlineStyle)));
}

export function renderSegmentsToPdfProseBlocks(segments: any, ctx: PdfRenderContext): PdfContentNode[] {
  const content: PdfContentNode[] = [];
  const documentFont = String(ctx.bodyPdfStyle.font ?? ctx.defaultFont ?? '');
  const builder = createProseParagraphBuilder(content, documentFont || undefined);
  const htmlFontOptions = {
    baseFontSize: Number(ctx.bodyPdfStyle.fontSize) || DEFAULT_BODY_FONT_PT,
    baseFont: documentFont || undefined,
  };

  for (const seg of segments) {
    const segAlign = seg.align;
    const alignmentStyle = segAlign ? { alignment: segAlign } : {};

    if (seg.type === 'text') {
      if (seg.html) {
        const html = String(seg.html ?? '');
        if (isBlockLevelHtml(html)) {
          builder.flush();
          pushPdfBlocks(
            content,
            htmlToPdfBlocks(html, htmlFontOptions),
            ctx.bodyPdfStyle,
            alignmentStyle,
            segAlign,
            documentFont || undefined,
          );
        } else {
          builder.ensureAlignment(segAlign ?? null);
          builder.setBlockStyle(alignmentStyle);
          builder.appendParts(withPdfStyle(
            htmlToPdfText(html, htmlFontOptions),
            stripBlockAlignment(ctx.bodyPdfStyle),
          ));
        }
        continue;
      }

      builder.ensureAlignment(segAlign ?? null);
      builder.setBlockStyle(alignmentStyle);
      appendPlainTextToProseParagraph(String(seg.content ?? ''), ctx.bodyPdfStyle, builder);
      continue;
    }

    if (seg.type === 'field' || seg.type === 'repeater' || seg.type === 'child') {
      const fieldId = String(seg.id ?? '');
      const schema = ctx.fieldSchemas[fieldId];
      if (schema?.type === 'child' || schema?.type === 'repeater') {
        builder.flush();
        const repeaterBlock = renderRepeaterFieldPdf(fieldId, ctx);
        if (repeaterBlock) content.push(repeaterBlock);
        continue;
      }

      const value = resolveFieldValue(fieldId, ctx.fieldValues, ctx.fieldSchemas, ctx.blocks);
      const empty = isPdfFieldEmpty(value, schema);
      // Optional empties are omitted; required empties keep their placeholder.
      if (empty && !schema?.required) continue;

      const label = getFieldDisplayLabel(fieldId, seg.placeholder, ctx.previewContext);
      const style = resolvePdfFieldStyleForExport(fieldId, ctx);
      const baseFontSize = Number(style.fontSize ?? ctx.bodyPdfStyle.fontSize) || DEFAULT_BODY_FONT_PT;
      const fieldAlignment = segAlign ?? style.alignment;
      const fieldBlockStyle = fieldAlignment ? { alignment: fieldAlignment } : {};

      if (empty && schema?.required) {
        const requiredStyle = { ...stripBlockAlignment(style), italics: true, color: '#888888' };
        const requiredParts = plainTextToPdfText(String(label ?? ''));
        builder.ensureAlignment(fieldAlignment ?? null);
        builder.setBlockStyle(fieldBlockStyle);
        builder.appendParts(withPdfStyle(requiredParts, requiredStyle));
        continue;
      }

      // Barcode: emit svg image block (JSON→PDF path has no preview DOM images).
      if (schema?.type === 'barcode') {
        builder.flush();
        const barcodeBlock = barcodeValueToPdfBlock(value, schema);
        if (barcodeBlock) {
          if (fieldAlignment) {
            content.push({ ...barcodeBlock, alignment: fieldAlignment });
          } else {
            content.push(barcodeBlock);
          }
        } else {
          // Invalid code — fall back to plain text so the value is not lost.
          builder.ensureAlignment(fieldAlignment ?? null);
          builder.setBlockStyle(fieldBlockStyle);
          builder.appendParts(withPdfStyle(
            fieldValueToPdfParts(fieldId, value, schema, label, ctx),
            stripBlockAlignment(style),
          ));
          builder.flush();
        }
        continue;
      }

      const pdfMode = resolvePdfRenderMode(schema);

      if (pdfMode === 'html') {
        builder.flush();
        const htmlBlocks = htmlToPdfBlocks(String(value ?? ''), {
          baseFontSize,
          baseFont: String(style.font ?? ctx.defaultFont ?? ''),
        });
        pushPdfBlocks(
          content,
          htmlBlocks,
          style,
          fieldBlockStyle,
          fieldAlignment,
          String(style.font ?? ctx.defaultFont ?? ''),
        );
      } else {
        builder.ensureAlignment(fieldAlignment ?? null);
        builder.setBlockStyle(fieldBlockStyle);
        builder.appendParts(withPdfStyle(
          fieldValueToPdfParts(fieldId, value, schema, label, ctx),
          stripBlockAlignment(style),
        ));
      }
      continue;
    }

    if (seg.type === 'columns') {
      builder.flush();
      const columnBlocks = renderColumnsSegmentPdf(seg, ctx);
      if (columnBlocks) content.push(columnBlocks);
      continue;
    }

    if (seg.type === 'table') {
      builder.flush();
      const tableBlock = renderTableSegmentPdf(seg, ctx);
      if (tableBlock) content.push(tableBlock);
    }
  }

  builder.flush();
  return content;
}

function renderColumnsSegmentPdf(seg: any, ctx: PdfRenderContext): PdfContentNode | null {
  const cols = seg.columns ?? [[], []];
  const widths = seg.widths ?? [];
  const left = renderSegmentsToPdfContent(cols[0] ?? [], ctx);
  const right = renderSegmentsToPdfContent(cols[1] ?? [], ctx);
  if (!left.length && !right.length) return null;

  const w0 = parseColumnWidth(widths[0]);
  const w1 = parseColumnWidth(widths[1]);

  return {
    columns: [
      { width: w0, stack: left.length ? left : [{ text: '' }] },
      { width: w1, stack: right.length ? right : [{ text: '' }] },
    ],
    columnGap: 12,
    margin: [0, 0, 0, 8],
  };
}

function resolvePdfRenderMode(schema: any): 'plain' | 'html' {
  return (
    getFieldHandler(schema?.type)?.pdfRenderMode?.(schema) ??
    (schema?.type === 'text' && schema?.htmlEditor ? 'html' : 'plain')
  );
}

function isPdfFieldEmpty(value: any, schema: any) {
  if (resolvePdfRenderMode(schema) === 'html') {
    return !pdfBlocksHaveContent(htmlToPdfBlocks(String(value ?? '')));
  }
  return isFieldEmpty(value, {
    schema,
    htmlEditor: !!schema?.htmlEditor,
    repeaterSchema: schema?.type === 'child' ? schema : undefined,
  });
}

function fieldValueToPdfParts(fieldId: any, value: any, _schema: any, placeholder: any, ctx: PdfRenderContext): any[] {
  const display = formatFieldDisplay(fieldId, value, placeholder, ctx.previewContext);
  return plainTextToPdfText(String(display ?? '').replace(/\u200B/g, ''));
}

function tableHasPreviewContent(tableId: any, ctx: PdfRenderContext, segmentRows: any) {
  return (
    tableSegmentHasContent(tableId, ctx.fieldValues, ctx.fieldSchemas, segmentRows) ||
    tableSegmentHasRequiredEmpty(tableId, ctx.fieldValues, ctx.fieldSchemas, segmentRows)
  );
}

function formatPivotPdfCell(value: unknown, emptyCell = '', schema: Record<string, any> = {}): string {
  if (value == null || value === '') return emptyCell;
  const formatted = formatNumericDisplay(value, {
    displayFormat: schema.displayFormat,
    currencyCode: schema.currencyCode,
    fractionDigits: schema.fractionDigits,
    suffix: schema.suffix,
  });
  if (formatted !== '') return formatted;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  return String(value);
}

function pivotValueAlign(schema: Record<string, any> = {}): 'left' | 'center' | 'right' {
  const align = schema.valueAlign;
  if (align === 'left' || align === 'center' || align === 'right') return align;
  return 'right';
}

function buildPivotPdfTable(tableId: string, ctx: PdfRenderContext): PdfContentNode | null {
  const schema = ctx.fieldSchemas?.[tableId] ?? {};
  const raw = ctx.fieldValues?.[tableId];
  const pivot = isPivotTableValue(raw) ? raw : createEmptyPivotValue();
  const columns = pivot.columns ?? [];
  const rows = pivot.rows ?? [];
  if (!rows.length && !columns.length) return null;

  const emptyCell = schema.emptyCell != null ? String(schema.emptyCell) : '';
  const showRowTotals = !!schema.showRowTotals;
  const showColumnTotals = !!schema.showColumnTotals;
  const showGrandTotal = !!schema.showGrandTotal;
  const valueAlign = pivotValueAlign(schema);
  const bodyFont = ctx.bodyPdfStyle?.font ?? ctx.defaultFont;
  const fontSize = Number(ctx.bodyPdfStyle?.fontSize) || DEFAULT_TABLE_FONT_PT;

  const headerRow: any[] = [
    {
      // Corner stays empty (same as canvas) — long labels crush the first column.
      text: '',
      bold: true,
      fillColor: '#f0f0f0',
      fontSize,
      font: bodyFont,
      lineHeight: TABLE_PDF_LINE_HEIGHT,
    },
    ...columns.map((col: any) => ({
      text: String(col.label ?? col.key ?? ''),
      bold: true,
      fillColor: '#f0f0f0',
      fontSize,
      font: bodyFont,
      lineHeight: TABLE_PDF_LINE_HEIGHT,
    })),
  ];
  if (showRowTotals) {
    headerRow.push({
      text: 'Total',
      bold: true,
      fillColor: '#f0f0f0',
      fontSize,
      font: bodyFont,
      lineHeight: TABLE_PDF_LINE_HEIGHT,
    });
  }

  const bodyRows: any[][] = rows.map((row: any) => {
    const cells: any[] = [
      {
        text: String(row.label ?? ''),
        bold: true,
        fontSize,
        font: bodyFont,
        lineHeight: TABLE_PDF_LINE_HEIGHT,
      },
      ...columns.map((col: any) => ({
        text: formatPivotPdfCell(row.cells?.[col.key], emptyCell, schema),
        fontSize,
        font: bodyFont,
        lineHeight: TABLE_PDF_LINE_HEIGHT,
        alignment: valueAlign,
      })),
    ];
    if (showRowTotals) {
      cells.push({
        text: formatPivotPdfCell(row.rowTotal, emptyCell, schema),
        bold: true,
        fontSize,
        font: bodyFont,
        lineHeight: TABLE_PDF_LINE_HEIGHT,
        alignment: valueAlign,
      });
    }
    return cells;
  });

  if (showColumnTotals || showGrandTotal) {
    const totalsRow: any[] = [
      {
        text: 'Total',
        bold: true,
        fontSize,
        font: bodyFont,
        lineHeight: TABLE_PDF_LINE_HEIGHT,
      },
      ...columns.map((col: any) => ({
        text: showColumnTotals
          ? formatPivotPdfCell(pivot.columnTotals?.[col.key], emptyCell, schema)
          : emptyCell,
        bold: true,
        fontSize,
        font: bodyFont,
        lineHeight: TABLE_PDF_LINE_HEIGHT,
        alignment: valueAlign,
      })),
    ];
    if (showRowTotals) {
      totalsRow.push({
        text: showGrandTotal
          ? formatPivotPdfCell(pivot.grandTotal, emptyCell, schema)
          : emptyCell,
        bold: true,
        fontSize,
        font: bodyFont,
        lineHeight: TABLE_PDF_LINE_HEIGHT,
        alignment: valueAlign,
      });
    }
    bodyRows.push(totalsRow);
  }

  if (!bodyRows.length) return null;

  const colCount = headerRow.length;
  const rowLabelWidth = parseTableColumnWidth(schema.rowLabelWidth);
  const firstWidth =
    rowLabelWidth !== '*'
      ? rowLabelWidth
      : (() => {
          const em = String(schema.rowLabelWidth ?? '8em').match(/^(\d+(?:\.\d+)?)em$/i);
          if (em) return Math.round(Number.parseFloat(em[1]) * fontSize);
          return 'auto';
        })();
  const widths = [firstWidth, ...Array.from({ length: colCount - 1 }, () => '*')];

  return {
    table: {
      headerRows: 1,
      keepWithHeaderRows: 1,
      widths,
      body: [headerRow, ...bodyRows],
      dontBreakRows: true,
    },
    layout: resolveVisionTablePdfLayout({ hideBorders: !!schema.hideBorders }),
    margin: [0, 0, 0, 8],
  };
}

function renderTableSegmentPdf(seg: any, ctx: PdfRenderContext): PdfContentNode | null {
  const tableId = String(seg.id ?? '');
  const schema = ctx.fieldSchemas?.[tableId];
  if (schema?.type === 'pivotTable') {
    if (ctx.hideEmptyValues && !tableHasPreviewContent(tableId, ctx, seg.rows)) {
      return null;
    }
    return buildPivotPdfTable(tableId, ctx);
  }
  if (ctx.hideEmptyValues && !tableHasPreviewContent(tableId, ctx, seg.rows)) {
    return null;
  }
  return buildPdfTable(tableId, ctx, seg.rows);
}

export function buildPdfTableBodyRows(tableId: any, ctx: PdfRenderContext, segmentRows: any): any {
  const tableSchema = getTableSchema(tableId, { fieldSchemas: ctx.fieldSchemas });
  const tableRows = resolveTableInstanceRows(segmentRows, tableSchema);
  const columns = tableSchema.columns ?? [];

  const columnHeaderRow = [
    ...(shouldShowRowLabels(tableSchema, tableRows)
      ? [{ text: '', fillColor: '#f0f0f0', lineHeight: TABLE_PDF_LINE_HEIGHT }]
      : []),
    ...columns.map((col: any) => ({
    text: col.label ?? col.key,
    ...resolveTableColumnPdfStyle(
      tableId,
      col.key,
      ctx.fieldSchemas,
      ctx.fieldValueStyle,
      ctx.resolveFontName,
      ctx.pageSetup,
    ),
    lineHeight: TABLE_PDF_LINE_HEIGHT,
    fillColor: '#f0f0f0',
  })),
  ];

  const bodyRows: any[][] = [];

  const hideEmpty = ctx.hideEmptyValues === true;
  const includeRowLabels = shouldShowRowLabels(tableSchema, tableRows);

  for (const row of tableRows) {
    const cells: any[] = [];
    let hasValue = false;

    if (includeRowLabels) {
      cells.push({
        text: String(row.label ?? ''),
        bold: true,
        lineHeight: TABLE_PDF_LINE_HEIGHT,
      });
    }

    for (const col of columns) {
      const cellId = cellFieldId(tableId, row.key, col.key);
      const cellSchema = ctx.fieldSchemas[cellId];
      const value = resolveFieldValue(cellId, ctx.fieldValues, ctx.fieldSchemas, ctx.blocks);
      const label = cellSchema?.label ?? col.label ?? col.key;

      if (isTableCellDisplayPlaceholder(value, label) || isPdfFieldEmpty(value, cellSchema)) {
        if (cellSchema?.required) {
          hasValue = true;
          const requiredStyle = resolvePdfFieldStyleForExport(cellId, ctx, DOCUMENT_TABLE_TEXT_STYLE);
          cells.push(withTableCellFillColor({
            text: String(label ?? ''),
            italics: true,
            color: '#888888',
            lineHeight: TABLE_PDF_LINE_HEIGHT,
            fontSize: requiredStyle.fontSize ?? DEFAULT_TABLE_FONT_PT,
          }, requiredStyle));
        } else {
          cells.push(buildEmptyPdfTableCell(cellId, ctx));
        }
        continue;
      }

      hasValue = true;
      const style = resolvePdfFieldStyleForExport(
        cellId,
        ctx,
        DOCUMENT_TABLE_TEXT_STYLE,
      );
      const baseFontSize = Number(style.fontSize) || DEFAULT_TABLE_FONT_PT;
      const cellFont = String(style.font ?? ctx.defaultFont ?? '');
      const blocks = resolvePdfRenderMode(cellSchema) === 'html'
        ? htmlToPdfBlocks(String(value ?? ''), { baseFontSize, baseFont: cellFont })
        : [{ parts: fieldValueToPdfParts(cellId, value, cellSchema, col.label ?? col.key, ctx) }];
      const cell = pdfBlocksToTableCell(blocks, style);
      cells.push(cell || '');
    }

    if (hideEmpty && !hasValue) continue;
    bodyRows.push(cells);
  }

  if (!bodyRows.length) return null;
  return {
    columnHeaderRow,
    bodyRows,
    columns,
    hideHeader: !!tableSchema.hideHeader,
    hideBorders: !!tableSchema.hideBorders,
    includeRowLabels,
  };
}

export function buildPdfTableFromBodyRows(
  columnHeaderRow: any,
  bodyRows: any,
  columns: any,
  presentation: { hideHeader?: boolean; hideBorders?: boolean; includeRowLabels?: boolean } = {},
): PdfContentNode | null {
  if (!bodyRows.length) return null;

  const hideHeader = !!presentation.hideHeader;
  const body = hideHeader ? [...bodyRows] : [columnHeaderRow, ...bodyRows];
  const dataWidths = tableColumnWidthsFromSchema(columns);
  const widths = presentation.includeRowLabels
    ? ['auto', ...dataWidths]
    : dataWidths;

  return {
    table: {
      headerRows: hideHeader ? 0 : 1,
      keepWithHeaderRows: hideHeader ? 0 : 1,
      widths,
      body,
      dontBreakRows: true,
    },
    layout: resolveVisionTablePdfLayout(presentation),
    margin: [0, 0, 0, 8],
  };
}

function buildFirstRepeatableChunk(
  sectionLabel: any,
  table: any,
  leadingContent: PdfContentNode[] = [],
  omitSectionTitle = false,
  sectionHeaderStyle: any = {},
) {
  const stack: PdfContentNode[] = [];
  if (!omitSectionTitle) {
    const titleNode = buildRepeatableSectionTitleNode(sectionLabel, sectionHeaderStyle);
    if (titleNode) stack.push(titleNode);
  }
  stack.push(...leadingContent, table);
  return {
    unbreakable: true,
    stack,
  };
}

function buildContinuationRepeatableChunk(
  sectionLabel: any,
  columnHeaderRow: any,
  chunkRows: any,
  columns: any,
  repeatSectionContent: PdfContentNode[] = [],
  pageHeaderMode = false,
  sectionHeaderStyle: any = {},
  presentation: { hideHeader?: boolean; hideBorders?: boolean } = {},
): PdfContentNode | null {
  const table = buildPdfTableFromBodyRows(columnHeaderRow, chunkRows, columns, presentation);
  if (!table) return null;

  if (pageHeaderMode) {
    return {
      pageBreak: 'before',
      stack: [table],
    };
  }

  const stack: PdfContentNode[] = [];
  const titleNode = buildRepeatableSectionTitleNode(sectionLabel, sectionHeaderStyle);
  if (titleNode) stack.push(titleNode);
  stack.push(...repeatSectionContent, table);

  return {
    pageBreak: 'before',
    stack,
  };
}

function shrinkContinuationRowsUntilFitsPage(
  chunkRows: any,
  columnHeaderRow: any,
  columns: any,
  sectionLabel: any,
  repeatSectionContent: any,
  pageSetup: PdfPageSetup | undefined,
  sectionHeaderStyle: any = {},
  presentation: { hideHeader?: boolean; hideBorders?: boolean } = {},
) {
  const pageHeaderMode = usesRepeatablePageHeader(pageSetup);
  let rows = [...chunkRows];
  while (rows.length > 0) {
    const chunk = buildContinuationRepeatableChunk(
      sectionLabel,
      columnHeaderRow,
      rows,
      columns,
      repeatSectionContent,
      pageHeaderMode,
      sectionHeaderStyle,
      presentation,
    );
    if (chunk && repeatableChunkFitsPage(chunk, pageSetup)) {
      return rows;
    }
    rows.pop();
  }
  return rows;
}

function splitRepeatableTableRowChunks(bodyRows: any, firstChunkMaxBodyHeight: any, continuationMaxBodyHeight: any) {
  return chunkTableBodyRowsVariable(
    bodyRows,
    firstChunkMaxBodyHeight,
    continuationMaxBodyHeight,
  );
}

function shrinkFirstChunkUntilFitsPage(
  rowChunks: any,
  _bodyRows: any,
  columnHeaderRow: any,
  columns: any,
  sectionLabel: any,
  firstChunkLeadingContent: any,
  pageSetup: PdfPageSetup | undefined,
  sectionHeaderStyle: any = {},
  presentation: { hideHeader?: boolean; hideBorders?: boolean } = {},
) {
  if (!rowChunks.length || !rowChunks[0]?.length) return rowChunks;

  const omitSectionTitle = usesRepeatablePageHeader(pageSetup);
  while (rowChunks[0].length > 0) {
    const table = buildPdfTableFromBodyRows(columnHeaderRow, rowChunks[0], columns, presentation);
    if (!table) break;

    const chunk = buildFirstRepeatableChunk(
      sectionLabel,
      table,
      firstChunkLeadingContent,
      omitSectionTitle,
      sectionHeaderStyle,
    );
    if (repeatableChunkFitsPage(chunk, pageSetup)) {
      return rowChunks;
    }

    const movedRow = rowChunks[0].pop();
    if (!movedRow) break;

    if (rowChunks.length > 1) {
      rowChunks[1].unshift(movedRow);
    } else {
      rowChunks.push([movedRow]);
    }
  }

  return rowChunks.filter((chunkRows: any) => chunkRows.length > 0);
}

export function buildPdfTable(tableId: any, ctx: PdfRenderContext, segmentRows: any): PdfContentNode | null {
  const parts = buildPdfTableBodyRows(tableId, ctx, segmentRows);
  if (!parts) return null;
  const { columnHeaderRow, bodyRows, columns, hideHeader, hideBorders, includeRowLabels } = parts;
  return buildPdfTableFromBodyRows(columnHeaderRow, bodyRows, columns, {
    hideHeader,
    hideBorders,
    includeRowLabels,
  });
}

export function buildRepeatableSectionTitleNode(sectionLabel: any, sectionHeaderStyle: any = {}) {
  return buildPdfSectionTitleNode(sectionLabel, sectionHeaderStyle);
}

export function buildRepeatableTableContent(
  tableId: any,
  ctx: PdfRenderContext,
  segmentRows: any,
  sectionLabel: any,
  pageSetup: PdfPageSetup = {},
  priorContent: PdfContentNode[] = [],
  repeatSectionContent: PdfContentNode[] = [],
  firstChunkOnlyContent: PdfContentNode[] = [],
): PdfContentNode[] {
  const parts = buildPdfTableBodyRows(tableId, ctx, segmentRows);
  if (!parts) return [];

  const pageHeaderMode = usesRepeatablePageHeader(pageSetup);
  const effectiveRepeatContent = pageHeaderMode ? [] : repeatSectionContent;

  const { columnHeaderRow, bodyRows, columns, hideHeader, hideBorders, includeRowLabels } = parts;
  const presentation = { hideHeader, hideBorders, includeRowLabels };
  const priorContentHeightPt = estimatePdfContentHeightPt(priorContent);
  const repeatSectionContentHeightPt = pageHeaderMode
    ? 0
    : estimatePdfContentHeightPt(repeatSectionContent);
  const firstChunkLeadingHeightPt = repeatSectionContentHeightPt
    + estimatePdfContentHeightPt(firstChunkOnlyContent);
  const firstChunkMaxBodyHeight = estimateFirstChunkMaxBodyHeight(
    pageSetup,
    priorContentHeightPt,
    firstChunkLeadingHeightPt,
    pageHeaderMode,
  );
  const continuationMaxBodyHeight = estimateContinuationChunkMaxBodyHeight(
    pageSetup,
    repeatSectionContentHeightPt,
    pageHeaderMode,
  );
  let rowChunks = splitRepeatableTableRowChunks(
    bodyRows,
    firstChunkMaxBodyHeight,
    continuationMaxBodyHeight,
  );
  const firstChunkLeadingContent = pageHeaderMode
    ? firstChunkOnlyContent
    : [...repeatSectionContent, ...firstChunkOnlyContent];
  rowChunks = shrinkFirstChunkUntilFitsPage(
    rowChunks,
    bodyRows,
    columnHeaderRow,
    columns,
    sectionLabel,
    firstChunkLeadingContent,
    pageSetup,
    ctx.sectionHeaderPdfStyle,
    presentation,
  );

  const omitSectionTitle = pageHeaderMode;
  const sectionHeaderStyle = ctx.sectionHeaderPdfStyle;
  return rowChunks.map((chunkRows: any, chunkIndex: number) => {
    if (chunkIndex === 0) {
      const table = buildPdfTableFromBodyRows(columnHeaderRow, chunkRows, columns, presentation);
      if (!table) return null;
      return buildFirstRepeatableChunk(sectionLabel, table, [], omitSectionTitle, sectionHeaderStyle);
    }

    const fittedRows = shrinkContinuationRowsUntilFitsPage(
      chunkRows,
      columnHeaderRow,
      columns,
      sectionLabel,
      effectiveRepeatContent,
      pageSetup,
      sectionHeaderStyle,
      presentation,
    );
    if (!fittedRows.length) return null;

    return buildContinuationRepeatableChunk(
      sectionLabel,
      columnHeaderRow,
      fittedRows,
      columns,
      effectiveRepeatContent,
      pageHeaderMode,
      sectionHeaderStyle,
      presentation,
    );
  }).filter(Boolean) as PdfContentNode[];
}

function getCompanionTableSegmentRows(adjacent: any): any {
  if (adjacent.blockKind !== 'section') return null;
  for (const seg of adjacent.block.data?.segments ?? []) {
    if (seg.type === 'table' && seg.id) return seg.rows;
  }
  return null;
}

function companionTableHasContent(adjacent: any, ctx: PdfRenderContext) {
  if (!ctx.hideEmptyValues) return !!adjacent.tableId;
  const segmentRows = getCompanionTableSegmentRows(adjacent);
  return tableHasPreviewContent(
    adjacent.tableId,
    ctx,
    segmentRows,
  );
}

function isTableOnlyCompanionSection(block: any) {
  if (block.type !== 'documentSection') return true;
  const segments = block.data?.segments ?? [];
  return !segments.some((seg: any) => seg.type !== 'table');
}

function buildFirstRepeatableChunkStack(
  chunk: any,
  leadingContent: PdfContentNode[] = [],
  pageSetup: PdfPageSetup = {},
  sectionHeaderStyle: any = {},
) {
  const table = findTableInChunkStack(chunk);
  const sectionTitle = findRepeatableSectionTitleInChunk(chunk);
  if (!table) return chunk;

  const sectionLabel = sectionTitle ? String(sectionTitle.text ?? '') : '';
  const omitSectionTitle = usesRepeatablePageHeader(pageSetup) || !sectionTitle;
  return buildFirstRepeatableChunk(sectionLabel, table, leadingContent, omitSectionTitle, sectionHeaderStyle);
}

function findRepeatableSectionTitleInChunk(chunk: any): any {
  if (!Array.isArray(chunk?.stack)) return null;
  if (chunk.stack[0]?.style === 'sectionHeader') return chunk.stack[0];
  if (Array.isArray(chunk.stack[0]?.stack)) {
    return chunk.stack[0].stack.find((child: any) => child?.style === 'sectionHeader') ?? null;
  }
  return null;
}

function findTableInChunkStack(chunk: any): any {
  if (!Array.isArray(chunk?.stack)) return null;
  for (let i = chunk.stack.length - 1; i >= 0; i -= 1) {
    if (chunk.stack[i]?.table) return chunk.stack[i];
  }
  return null;
}

function appendRepeatableTableChunks(
  sectionStack: any,
  chunks: any,
  repeatSectionContent: PdfContentNode[] = [],
  firstChunkOnlyContent: PdfContentNode[] = [],
  pageSetup: PdfPageSetup = {},
  sectionHeaderStyle: any = {},
) {
  if (usesRepeatablePageHeader(pageSetup)) {
    sectionStack.push(...chunks);
    return;
  }

  const pageHeaderMode = usesRepeatablePageHeader(pageSetup);
  const firstChunkLeadingContent = pageHeaderMode
    ? firstChunkOnlyContent
    : [...repeatSectionContent, ...firstChunkOnlyContent];

  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      sectionStack.push(
        buildFirstRepeatableChunkStack(chunks[i], firstChunkLeadingContent, pageSetup, sectionHeaderStyle),
      );
      continue;
    }
    sectionStack.push(chunks[i]);
  }
}

function renderRepeatableTableChunks(
  tableId: any,
  ctx: PdfRenderContext,
  segmentRows: any,
  sectionLabel: any,
  pageSetup: PdfPageSetup,
  priorContent: PdfContentNode[],
  repeatSectionContent: PdfContentNode[],
  firstChunkOnlyContent: PdfContentNode[] = [],
): PdfContentNode[] {
  if (usesRepeatablePageHeader(pageSetup)) {
    const table = buildPdfTable(tableId, ctx, segmentRows);
    if (!table) return [];
    return firstChunkOnlyContent.length ? [...firstChunkOnlyContent, table] : [table];
  }

  return buildRepeatableTableContent(
    tableId,
    ctx,
    segmentRows,
    sectionLabel,
    pageSetup,
    priorContent,
    repeatSectionContent,
    firstChunkOnlyContent,
  );
}

function renderRepeaterFieldPdf(fieldId: any, ctx: PdfRenderContext): PdfContentNode | null {
  const schema = ctx.fieldSchemas[fieldId];
  if (!schema || (schema.type !== 'child' && schema.type !== 'repeater')) return null;

  const value = normalizeRepeaterValue(ctx.fieldValues[fieldId], schema);
  if (ctx.hideEmptyValues && !repeaterHasContent(value, schema)) return null;

  const childDoc = buildRepeaterFillDocument(schema, value);
  const childContent = renderSinglePagePdfContent(childDoc, {
    fieldValueStyle: ctx.fieldValueStyle,
    resolveFontName: ctx.resolveFontName,
    defaultFont: ctx.defaultFont,
    hideEmptyValues: ctx.hideEmptyValues,
  });

  if (!childContent.length) return null;

  const label = schema.label ?? fieldId;
  return {
    stack: [
      { text: `${label}:`, margin: [0, 0, 0, 2] },
      { stack: childContent, margin: [8, 0, 0, 6] },
    ],
  };
}

export function renderSinglePagePdfContent(doc: EditorDocument, options: PdfRenderOptionsExt): PdfContentNode[] {
  let pageSetup: PdfPageSetup = { ...(doc.pageSetup ?? {}), ...(options.pageSetup ?? {}) };
  if (!usesRepeatablePageHeader(pageSetup) && !options.skipRepeatablePageHeader) {
    const repeatableHeader = buildRepeatableSectionPageHeader(doc, options);
    if (repeatableHeader) {
      pageSetup = {
        ...pageSetup,
        header: {
          height: repeatableHeader.heightMm,
          fromRepeatableSection: true,
        },
      };
    }
  }

  const ctx = createPdfRenderContext(doc, options);
  const content: PdfContentNode[] = [];
  const blocks = doc.blocks ?? [];
  /** @type {Set<number>} */
  const consumedBlockIndices = new Set();
  /** @type {Map<number, { skipEntire: boolean, excludeTableIds?: Set<string> }>} */
  const consumedCompanionMeta = new Map();

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    const data = block.data ?? {};

    if (block.type === 'documentSection') {
      const consumedMeta = consumedCompanionMeta.get(blockIndex);
      if (consumedMeta?.skipEntire) continue;
      if (!evaluateSectionVisibility(data.visibility, ctx.fieldValues, ctx.fieldSchemas)) continue;

      const sectionLabel = resolveVisibleSectionLabel(data);
      const repeatable = !!data.repeatable;
      const filtered = ctx.hideEmptyValues
        ? filterSegmentsForPreview(
          data.segments ?? [],
          ctx.fieldValues,
          ctx.fieldSchemas,
        )
        : (data.segments ?? []);
      const excludeTableIds = consumedMeta?.excludeTableIds ?? new Set();
      const renderableSegments = filtered.filter(
        (seg: any) => !(seg.type === 'table' && seg.id && excludeTableIds.has(String(seg.id))),
      );
      const hasTableWithContent = renderableSegments.some(
        (seg: any) =>
          seg.type === 'table' &&
          seg.id &&
          (ctx.hideEmptyValues
            ? tableHasPreviewContent(String(seg.id), ctx, seg.rows)
            : true),
      );
      const repeatTableHeader = repeatable && hasTableWithContent;

      if (!sectionLabel && !renderableSegments.length) continue;

      const sectionStack: PdfContentNode[] = [];
      let usedRepeatableTableChunks = false;

      if (repeatTableHeader) {
        usedRepeatableTableChunks = true;
        const nonTableSegments = renderableSegments.filter((seg: any) => seg.type !== 'table');
        const tableSegments = renderableSegments.filter((seg: any) => seg.type === 'table');
        const nonTableContent = nonTableSegments.length
          ? renderSegmentsToPdfContent(nonTableSegments, ctx)
          : [];

        for (const tableSeg of tableSegments) {
          const tableId = String(tableSeg.id ?? '');
          if (ctx.hideEmptyValues && !tableHasPreviewContent(tableId, ctx, tableSeg.rows)) {
            continue;
          }

          const chunks = renderRepeatableTableChunks(
            tableId,
            ctx,
            tableSeg.rows,
            sectionLabel,
            pageSetup,
            content,
            nonTableContent,
          );

          appendRepeatableTableChunks(sectionStack, chunks, nonTableContent, [], pageSetup, ctx.sectionHeaderPdfStyle);
        }
      } else if (repeatable && !consumedMeta) {
        const adjacent = findAdjacentTableBlock(blocks, blockIndex, {
          shouldUse: (candidate) => companionTableHasContent(candidate, ctx),
        });
        if (adjacent && !consumedBlockIndices.has(adjacent.index)) {
          const nonTableSegments = renderableSegments.filter((seg: any) => seg.type !== 'table');
          const nonTableContent = nonTableSegments.length
            ? renderSegmentsToPdfContent(nonTableSegments, ctx)
            : [];

          let companionTitleNode = null;
          if (adjacent.blockKind === 'section') {
            const companionLabel = resolveVisibleSectionLabel(adjacent.block.data);
            if (companionLabel && companionLabel !== sectionLabel) {
              companionTitleNode = buildRepeatableSectionTitleNode(companionLabel, ctx.sectionHeaderPdfStyle);
            }
          }

          const firstChunkOnlyContent = companionTitleNode ? [companionTitleNode] : [];

          const chunks = renderRepeatableTableChunks(
            adjacent.tableId,
            ctx,
            getCompanionTableSegmentRows(adjacent),
            sectionLabel,
            pageSetup,
            content,
            nonTableContent,
            firstChunkOnlyContent,
          );

          appendRepeatableTableChunks(
            sectionStack,
            chunks,
            nonTableContent,
            firstChunkOnlyContent,
            pageSetup,
            ctx.sectionHeaderPdfStyle,
          );
          usedRepeatableTableChunks = true;

          consumedBlockIndices.add(adjacent.index);
          if (isTableOnlyCompanionSection(adjacent.block)) {
            consumedCompanionMeta.set(adjacent.index, { skipEntire: true });
          } else {
            consumedCompanionMeta.set(adjacent.index, {
              skipEntire: false,
              excludeTableIds: new Set([adjacent.tableId]),
            });
          }
        } else if (usesRepeatablePageHeader(pageSetup) && !options.skipRepeatablePageHeader) {
          // Repeatable section content is rendered in the pdfmake page header.
        } else {
          const sectionBody = renderSegmentsToPdfContent(renderableSegments, ctx);
          const hasBody = sectionBody.length > 0;
          if (!sectionLabel && !hasBody) continue;

          if (sectionLabel) {
            const titleNode = buildPdfSectionTitleNode(sectionLabel, ctx.sectionHeaderPdfStyle);
            if (titleNode) sectionStack.push(titleNode);
          }
          if (hasBody) sectionStack.push(...sectionBody);
        }
      } else {
        const sectionBody = renderSegmentsToPdfContent(renderableSegments, ctx);
        const hasBody = sectionBody.length > 0;
        if (!sectionLabel && !hasBody) continue;

        if (sectionLabel) {
          const titleNode = buildPdfSectionTitleNode(sectionLabel, ctx.sectionHeaderPdfStyle);
          if (titleNode) sectionStack.push(titleNode);
        }
        if (hasBody) sectionStack.push(...sectionBody);
      }

      if (!sectionStack.length) continue;

      const borderedStack = withPdfSectionBorderRules(sectionStack, data);

      if (usedRepeatableTableChunks) {
        content.push(...borderedStack);
      } else {
        content.push({ stack: borderedStack, margin: [0, 0, 0, 6] });
      }
      continue;
    }

    if (consumedBlockIndices.has(blockIndex)) continue;

    if (block.type === 'visionTable') {
      const tableFieldId = data.fieldId ?? 'visionTable';
      const table = buildPdfTable(tableFieldId, ctx, null);
      if (table) content.push(table);
      continue;
    }

    if (block.type === 'templateBlock') {
      const blockContent = renderTemplateBlockPdf(data, ctx);
      if (blockContent.length) content.push(...blockContent);
    }
  }

  if (!content.length && options.hideEmptyValues === true) {
    content.push({ text: 'No filled content to export.', style: 'empty' });
  }

  return content;
}

function renderTemplateBlockPdf(blockData: any, ctx: PdfRenderContext): PdfContentNode[] {
  const fieldId = String(blockData.fieldId ?? '');
  const fieldType = blockData.fieldType;

  if (fieldType === 'table') {
    const table = buildPdfTable(fieldId, ctx, null);
    return table ? [table] : [];
  }

  if (fieldType === 'repeater' || fieldType === 'child') {
    const repeater = renderRepeaterFieldPdf(fieldId, ctx);
    return repeater ? [repeater] : [];
  }

  const schema = ctx.fieldSchemas[fieldId];
  const value = resolveFieldValue(fieldId, ctx.fieldValues, ctx.fieldSchemas, ctx.blocks)
    ?? blockData.value;
  const empty = isPdfFieldEmpty(value, schema);
  if (ctx.hideEmptyValues && empty && !schema?.required) return [];

  const label = schema?.label ?? blockData.label ?? '';
  const style = resolvePdfFieldStyleForExport(fieldId, ctx);
  const baseFontSize = Number(style.fontSize ?? ctx.bodyPdfStyle.fontSize) || DEFAULT_BODY_FONT_PT;
  const fieldAlignment = style.alignment;
  const inlineStyle = stripBlockAlignment(style);
  const fieldFont = String(style.font ?? ctx.defaultFont ?? '');

  if (empty && schema?.required) {
    const requiredInline = { ...inlineStyle, italics: true, color: '#888888' };
    const parts = finalizePdfInlineParts(plainTextToPdfText(String(label ?? '')), {
      font: fieldFont,
      inlineStyle: requiredInline,
    });
    const node: PdfContentNode = { text: parts, margin: [0, 0, 0, 4] };
    if (fieldAlignment) node.alignment = fieldAlignment;
    return [node];
  }

  if (resolvePdfRenderMode(schema) === 'html') {
    const blocks = htmlToPdfBlocks(String(value ?? ''), { baseFontSize, baseFont: fieldFont });
    const rendered: PdfContentNode[] = [];
    if (blockData.prefixText) {
      rendered.push({
        text: finalizePdfInlineParts(plainTextToPdfText(String(blockData.prefixText)), {
          font: String(ctx.bodyPdfStyle.font ?? ctx.defaultFont ?? ''),
          inlineStyle: stripBlockAlignment(ctx.bodyPdfStyle),
        }),
        margin: [0, 0, 0, 4],
      });
    }
    for (const block of blocks) {
      const parts = finalizePdfInlineParts(block.parts, { font: fieldFont, inlineStyle });
      if (!pdfTextContent(parts)) continue;
      const node: PdfContentNode = { text: parts, margin: block.margin ?? [0, 0, 0, 4] };
      const alignment = block.alignment ?? fieldAlignment;
      if (alignment) node.alignment = alignment;
      rendered.push(node);
    }
    return rendered;
  }

  let parts: any[];
  if (fieldType === 'text') {
    parts = fieldValueToPdfParts(fieldId, value, schema, label, ctx);
  } else if (label) {
    parts = plainTextToPdfText(`${label}: ${formatFieldDisplay(fieldId, value, label, ctx.previewContext)}`);
  } else {
    parts = plainTextToPdfText(String(value));
  }

  parts = finalizePdfInlineParts(parts, { font: fieldFont, inlineStyle });

  if (blockData.prefixText) {
    parts = [
      ...finalizePdfInlineParts(plainTextToPdfText(String(blockData.prefixText)), {
        font: String(ctx.bodyPdfStyle.font ?? ctx.defaultFont ?? ''),
        inlineStyle: stripBlockAlignment(ctx.bodyPdfStyle),
      }),
      ...parts,
    ];
  }

  const block: PdfContentNode = { text: parts, margin: [0, 0, 0, 4] };
  if (fieldAlignment) block.alignment = fieldAlignment;
  return pdfTextContent(parts) ? [block] : [];
}
