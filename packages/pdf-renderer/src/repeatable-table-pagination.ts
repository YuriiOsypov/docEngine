import { cssFontSizeToPdfPt, DEFAULT_BODY_FONT_PT } from './style-mapper.js';
import { DOCUMENT_BODY_LINE_HEIGHT } from '@docengine/editor/node';
import type { PdfPageSetup } from './types.js';
import { mmToPt, normalizeMarginMm, resolvePageSize } from './units.js';
import { TABLE_CELL_PAD_V, TABLE_PDF_LINE_HEIGHT } from './table-layout.js';

function resolveOrientedPageSizePt(pageSetup: PdfPageSetup = {}) {
  const size = resolvePageSize(pageSetup.format, pageSetup, pageSetup.orientation);
  if (typeof size === 'string') {
    // Named sizes: resolvePageSize returns A4/LETTER; apply orientation here.
    const named =
      size === 'LETTER'
        ? { width: 612, height: 792 }
        : { width: 595.28, height: 841.89 };
    const landscape = String(pageSetup.orientation ?? 'portrait').toLowerCase() === 'landscape';
    return landscape
      ? { width: named.height, height: named.width }
      : named;
  }
  return size;
}

const PAD_V = TABLE_CELL_PAD_V;
const SECTION_TITLE_HEIGHT_PT = 22;
const COLUMN_HEADER_HEIGHT_PT = 20;
const REPEAT_SECTION_CONTENT_INFLATION = 1.35;
const CONTINUATION_PAGE_BODY_FACTOR = 0.65;
const FIRST_CHUNK_HEIGHT_FACTOR = 0.9;
const FIRST_CHUNK_PAGE_FRACTION_WITH_PRIOR = 0.22;
const PRIOR_CONTENT_INFLATION_FACTOR = 1.2;
const PRIOR_CONTENT_MIN_EXTRA_PT = 120;
const DEFAULT_TABLE_FONT_SIZE = cssFontSizeToPdfPt('13px')!;
const DEFAULT_TEXT_LINE_HEIGHT_PT = DEFAULT_BODY_FONT_PT;
const DEFAULT_BLOCK_MARGIN_BOTTOM_PT = 4;
const DEFAULT_SECTION_MARGIN_BOTTOM_PT = 6;
const CHAR_WIDTH_FACTOR = 0.5;

export function estimateContentWidthPt(pageSetup: PdfPageSetup = {}): number {
  const size = resolveOrientedPageSizePt(pageSetup);
  const [, marginRight, , marginLeft] = normalizeMarginMm(pageSetup.margin).map(mmToPt);
  return Math.max(100, size.width - marginLeft - marginRight);
}

function joinTextParts(text: unknown): string {
  if (typeof text === 'string') return text;
  if (!Array.isArray(text)) return '';
  return text
    .map((part) => (typeof part === 'string' ? part : String((part as any)?.text ?? '')))
    .join('');
}

export function estimateWrappedLineCount(
  text: unknown,
  fontSize: number,
  contentWidthPt: number,
): number {
  const joined = joinTextParts(text);
  if (!joined) return 1;

  const avgCharWidth = fontSize * CHAR_WIDTH_FACTOR;
  const charsPerLine = Math.max(1, Math.floor(contentWidthPt / avgCharWidth));
  let totalLines = 0;

  for (const paragraph of joined.split('\n')) {
    totalLines += Math.max(1, Math.ceil(paragraph.length / charsPerLine));
  }

  return Math.max(1, totalLines);
}

export function estimateContentAreaHeightPt(pageSetup: PdfPageSetup = {}): number {
  const size = resolveOrientedPageSizePt(pageSetup);
  const [marginTop, , marginBottom] = normalizeMarginMm(pageSetup.margin).map(mmToPt);

  const headerHeightMm = pageSetup.header?.height ?? 0;
  const footerHeightMm = pageSetup.footer?.height ?? (pageSetup.footer ? 10 : 0);

  return size.height
    - marginTop
    - marginBottom
    - mmToPt(headerHeightMm)
    - mmToPt(footerHeightMm);
}

export function estimateMaxBodyHeightPerChunk(pageSetup: PdfPageSetup = {}): number {
  return estimateContinuationChunkMaxBodyHeight(pageSetup);
}

/**
 * Conservative row budget for page 2+ chunks where section title sits above the table.
 */
export function estimateContinuationChunkMaxBodyHeight(
  pageSetup: PdfPageSetup = {},
  repeatSectionContentHeightPt = 0,
  pageHeaderMode = false,
): number {
  const contentHeight = estimateContentAreaHeightPt(pageSetup);
  const inflatedSectionContent = pageHeaderMode
    ? 0
    : repeatSectionContentHeightPt * REPEAT_SECTION_CONTENT_INFLATION;
  const reserved = (pageHeaderMode ? 0 : SECTION_TITLE_HEIGHT_PT)
    + COLUMN_HEADER_HEIGHT_PT
    + inflatedSectionContent
    + 12;
  return Math.max(40, (contentHeight - reserved) * CONTINUATION_PAGE_BODY_FACTOR);
}

export function estimateRepeatableChunkStackHeightPt(
  chunk: Record<string, unknown>,
  _pageSetup: PdfPageSetup = {},
): number {
  return estimatePdfContentHeightPt([chunk]);
}

export function repeatableChunkFitsPage(
  chunk: Record<string, unknown>,
  pageSetup: PdfPageSetup = {},
): boolean {
  return estimateRepeatableChunkStackHeightPt(chunk, pageSetup)
    <= estimateContentAreaHeightPt(pageSetup);
}

function extractCellLineCount(cell: string | Record<string, unknown>): number {
  if (typeof cell === 'string') {
    return cell ? Math.max(1, cell.split('\n').length) : 1;
  }
  if (!cell || typeof cell !== 'object') return 1;

  if (Array.isArray(cell.stack)) {
    let lines = 0;
    for (const node of cell.stack as Array<Record<string, unknown>>) {
      lines += extractTextNodeLineCount(node);
    }
    return Math.max(1, lines);
  }

  return extractTextNodeLineCount(cell);
}

function extractTextNodeLineCount(node: Record<string, unknown>): number {
  if (typeof node.text === 'string') {
    return Math.max(1, node.text.split('\n').length);
  }
  if (Array.isArray(node.text)) {
    const joined = node.text
      .map((part: any) => (typeof part === 'string' ? part : String(part.text ?? '')))
      .join('');
    return Math.max(1, joined.split('\n').length);
  }
  return 1;
}

export function estimateRowHeightPt(rowCells: Array<string | Record<string, unknown>>): number {
  let maxLines = 1;
  let fontSize = DEFAULT_TABLE_FONT_SIZE;

  for (const cell of rowCells) {
    maxLines = Math.max(maxLines, extractCellLineCount(cell));
    if (cell && typeof cell === 'object' && cell.fontSize != null) {
      fontSize = Math.max(fontSize, Number(cell.fontSize) || DEFAULT_TABLE_FONT_SIZE);
    }
  }

  return fontSize * TABLE_PDF_LINE_HEIGHT * maxLines + PAD_V * 2;
}

export function chunkTableBodyRows(
  bodyRows: Array<Array<string | Record<string, unknown>>>,
  maxBodyHeightPt: number,
) {
  return chunkTableBodyRowsVariable(bodyRows, maxBodyHeightPt, maxBodyHeightPt);
}

export function chunkTableBodyRowsVariable(
  bodyRows: Array<Array<string | Record<string, unknown>>>,
  firstChunkMaxBodyHeightPt: number,
  continuationMaxBodyHeightPt: number,
): Array<Array<Array<string | Record<string, unknown>>>> {
  if (!bodyRows.length) return [];

  const chunks: Array<Array<Array<string | Record<string, unknown>>>> = [];
  let current: Array<Array<string | Record<string, unknown>>> = [];
  let currentHeight = 0;
  let chunkIndex = 0;

  for (const row of bodyRows) {
    const rowHeight = estimateRowHeightPt(row);
    const maxBodyHeight = chunkIndex === 0
      ? firstChunkMaxBodyHeightPt
      : continuationMaxBodyHeightPt;

    if (current.length && currentHeight + rowHeight > maxBodyHeight) {
      chunks.push(current);
      current = [row];
      currentHeight = rowHeight;
      chunkIndex += 1;
      continue;
    }

    current.push(row);
    currentHeight += rowHeight;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function estimateTextLineCount(text: unknown): number {
  if (typeof text === 'string') {
    return Math.max(1, text.split('\n').length);
  }
  if (!Array.isArray(text)) return 1;
  return Math.max(1, joinTextParts(text).split('\n').length);
}

function estimatePdfNodeHeightPt(
  node: Record<string, unknown>,
  pageSetup?: PdfPageSetup,
): number {
  if (!node || typeof node !== 'object') return 0;

  const margin = Array.isArray(node.margin) ? node.margin as number[] : [];
  const marginTop = Number(margin[1] ?? 0);
  const marginBottom = Number(margin[3] ?? margin[2] ?? DEFAULT_BLOCK_MARGIN_BOTTOM_PT);
  const contentWidthPt = pageSetup ? estimateContentWidthPt(pageSetup) : null;

  if (node.table) {
    const table = node.table as { body?: any[]; headerRows?: number };
    const body = table.body ?? [];
    const headerRows = Number(table.headerRows ?? 1);
    const header = body.slice(0, headerRows);
    const rows = body.slice(headerRows);
    let height = marginTop + marginBottom;
    for (const row of header) {
      height += estimateRowHeightPt(row);
    }
    for (const row of rows) {
      height += estimateRowHeightPt(row);
    }
    return height;
  }

  if (Array.isArray(node.stack)) {
    let height = marginTop + marginBottom;
    for (const child of node.stack as Array<Record<string, unknown>>) {
      height += estimatePdfNodeHeightPt(child, pageSetup);
    }
    return height;
  }

  if (Array.isArray(node.columns)) {
    let height = marginTop + marginBottom;
    for (const col of node.columns as Array<{ stack?: Array<Record<string, unknown>> }>) {
      height = Math.max(height, marginTop + marginBottom + estimatePdfContentHeightPt(col.stack ?? [], pageSetup));
    }
    return height;
  }

  if (node.text != null) {
    let fontSize = Number(node.fontSize) || DEFAULT_TEXT_LINE_HEIGHT_PT;
    if (!node.fontSize && node.style === 'sectionHeader') {
      fontSize = cssFontSizeToPdfPt('14px')!;
    }
    const lines = contentWidthPt != null
      ? estimateWrappedLineCount(node.text, fontSize, contentWidthPt)
      : estimateTextLineCount(node.text);
    return marginTop + marginBottom + fontSize * DOCUMENT_BODY_LINE_HEIGHT * lines;
  }

  return marginTop + marginBottom;
}

export function estimatePdfContentHeightPt(
  content: Array<Record<string, unknown>> | null | undefined,
  pageSetup?: PdfPageSetup,
): number {
  let total = 0;
  for (const node of content ?? []) {
    total += estimatePdfNodeHeightPt(node, pageSetup);
    if (node?.stack && !node.table && !node.columns) {
      total += DEFAULT_SECTION_MARGIN_BOTTOM_PT;
    }
  }
  return total;
}

export function estimateFirstChunkMaxBodyHeight(
  pageSetup: PdfPageSetup = {},
  priorContentHeightPt = 0,
  leadingContentHeightPt = 0,
  pageHeaderMode = false,
): number {
  const continuationMax = estimateMaxBodyHeightPerChunk(pageSetup);
  const contentHeight = estimateContentAreaHeightPt(pageSetup);

  if (pageHeaderMode) {
    const priorOverhead = priorContentHeightPt > 0
      ? Math.max(
        priorContentHeightPt * PRIOR_CONTENT_INFLATION_FACTOR,
        priorContentHeightPt + PRIOR_CONTENT_MIN_EXTRA_PT,
      )
      : 0;
    const leadingOverhead = leadingContentHeightPt > 0
      ? leadingContentHeightPt * PRIOR_CONTENT_INFLATION_FACTOR
      : 0;
    const remaining = contentHeight
      - priorOverhead
      - leadingOverhead
      - COLUMN_HEADER_HEIGHT_PT;
    return Math.max(40, remaining * FIRST_CHUNK_HEIGHT_FACTOR);
  }

  const totalOverheadPt = priorContentHeightPt + leadingContentHeightPt;
  if (totalOverheadPt <= 0) return continuationMax;

  const inflatedOverhead = Math.max(
    totalOverheadPt * PRIOR_CONTENT_INFLATION_FACTOR,
    totalOverheadPt + PRIOR_CONTENT_MIN_EXTRA_PT,
  );
  const remaining = contentHeight
    - inflatedOverhead
    - SECTION_TITLE_HEIGHT_PT
    - COLUMN_HEADER_HEIGHT_PT;
  const fromRemaining = remaining * FIRST_CHUNK_HEIGHT_FACTOR;
  const conservativeCap = contentHeight * FIRST_CHUNK_PAGE_FRACTION_WITH_PRIOR;

  return Math.max(40, Math.min(continuationMax, fromRemaining, conservativeCap));
}
