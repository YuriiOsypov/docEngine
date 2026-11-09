import {
  collectAllValues,
  DOCUMENT_BODY_LINE_HEIGHT,
  evaluateSectionVisibility,
  filterSegmentsForPreview,
  findAdjacentTableBlock,
  findRepeatableSectionBlock,
  resolveRepeatablePagePlan,
} from '@docengine/editor/node';
import type { EditorDocument, PdfPageSetup, PdfRenderOptions } from './types.js';
import { DEFAULT_BODY_FONT_PT } from './style-mapper.js';
import { estimatePdfContentHeightPt } from './repeatable-table-pagination.js';
import {
  createPdfRenderContext,
  renderSegmentsToPdfProseBlocks,
  buildPdfSectionTitleNode,
  resolveVisibleSectionLabel,
} from './segment-renderer.js';
import { ptToMm } from './units.js';

const BODY_LINE_HEIGHT_PT = DEFAULT_BODY_FONT_PT * DOCUMENT_BODY_LINE_HEIGHT;

/**
 * Base padding on top of content estimate.
 * Keep small — oversized bands show up as empty lines between the last header
 * line and body content when there is no page-1 companion prose.
 */
export const HEADER_HEIGHT_BUFFER_PT = 2;

/**
 * Extra slack so the last header line is not clipped by pdfmake.
 * Content height already includes node margins; avoid stacking large fixed gaps.
 */
export const HEADER_LINE_SLACK_PT = BODY_LINE_HEIGHT_PT * 0.35;

export function usesRepeatablePageHeader(pageSetup: PdfPageSetup | undefined): boolean {
  return !!pageSetup?.header?.fromRepeatableSection;
}

function buildRepeatableSectionHeaderTitleNode(
  sectionLabel: string,
  sectionHeaderStyle: Record<string, unknown>,
) {
  return buildPdfSectionTitleNode(sectionLabel, sectionHeaderStyle, [0, 0, 0, 0]);
}

export function computeRepeatableHeaderBandHeightPt(
  stack: Array<Record<string, unknown>>,
  pageSetup?: PdfPageSetup,
): number {
  const contentPt = estimatePdfContentHeightPt(stack, pageSetup);
  return contentPt + HEADER_LINE_SLACK_PT + HEADER_HEIGHT_BUFFER_PT;
}

export function estimateRepeatableHeaderHeightMm(
  stack: Array<Record<string, unknown>>,
  pageSetup?: PdfPageSetup,
): number {
  return ptToMm(computeRepeatableHeaderBandHeightPt(stack, pageSetup));
}

export type PdfHeaderRenderOptions = PdfRenderOptions & {
  resolveFontName: (name?: string | null) => string;
  defaultFont: string;
};

export type RepeatableSectionPageHeader = {
  /** Shown on every page (Show on each page section). */
  stack: Array<Record<string, unknown>>;
  /**
   * Page 1 only: stack + companion section leading prose (e.g. Item group)
   * so Price group → Item group share one header flow with no band gap.
   */
  firstPageStack: Array<Record<string, unknown>>;
  heightPt: number;
  heightMm: number;
};

/** Segments before the companion table — same rule as the PDF body companion path. */
function getCompanionLeadingSegments(block: any, tableId: string): any[] {
  if (block?.type !== 'documentSection') return [];
  const segments = block.data?.segments ?? [];
  const tableIndex = segments.findIndex(
    (seg: any) => seg.type === 'table' && String(seg.id ?? '') === String(tableId),
  );
  if (tableIndex <= 0) return [];
  return segments.slice(0, tableIndex);
}

function buildCompanionLeadingHeaderNodes(
  doc: EditorDocument,
  repeatableIndex: number,
  repeatableSectionLabel: string,
  ctx: ReturnType<typeof createPdfRenderContext>,
  hideEmptyValues: boolean,
): Array<Record<string, unknown>> {
  const adjacent = findAdjacentTableBlock((doc as any).blocks, repeatableIndex);
  if (!adjacent || adjacent.blockKind !== 'section') return [];

  const nodes: Array<Record<string, unknown>> = [];
  const companionLabel = resolveVisibleSectionLabel(adjacent.block.data);
  if (companionLabel && companionLabel !== repeatableSectionLabel) {
    const titleNode = buildPdfSectionTitleNode(
      companionLabel,
      ctx.sectionHeaderPdfStyle,
      [0, 0, 0, 4],
    );
    if (titleNode) nodes.push(titleNode as Record<string, unknown>);
  }

  const leadingSegments = getCompanionLeadingSegments(adjacent.block, adjacent.tableId);
  if (leadingSegments.length) {
    const leadingFiltered = hideEmptyValues
      ? filterSegmentsForPreview(leadingSegments, ctx.fieldValues, ctx.fieldSchemas)
      : leadingSegments;
    if (leadingFiltered.length) {
      nodes.push(
        ...(renderSegmentsToPdfProseBlocks(leadingFiltered, ctx) as Array<Record<string, unknown>>),
      );
    }
  }

  return nodes;
}

/** Drop bottom margin on the last header node so it does not pad into the next line. */
function trimHeaderStackTrailingMargin(stack: Array<Record<string, unknown>>) {
  if (!stack.length) return;
  const last = stack[stack.length - 1];
  if (!last || !Array.isArray(last.margin)) return;
  const bottom = Number(last.margin[3] ?? 0);
  if (!bottom) return;
  const [left, top, right] = last.margin as number[];
  stack[stack.length - 1] = { ...last, margin: [left ?? 0, top ?? 0, right ?? 0, 0] };
}

/**
 * When a different section expands into many body instances (e.g. Item groups),
 * those instances already print leading prose. Attaching the same prose to the
 * page-1 header duplicates it and oversizes the top margin band — which shows
 * up as a large empty gap above PRICE LIST.
 */
export function shouldAttachCompanionLeadingToPageHeader(doc: EditorDocument): boolean {
  const blocks = (doc as any).blocks ?? [];
  const fieldSchemas = (doc as any).fieldSchemas ?? {};
  const plan =
    (doc as any).repeatablePagePlan?.instances?.length > 1
      ? (doc as any).repeatablePagePlan
      : resolveRepeatablePagePlan(
        blocks,
        fieldSchemas,
        collectAllValues(blocks),
        (doc as any).repeatableSectionInstances ?? null,
      );
  if (!plan || (plan.instances?.length ?? 0) <= 1) return true;
  const repeatable = findRepeatableSectionBlock(blocks);
  if (!repeatable) return true;
  return plan.repeatableBlockIndex === repeatable.index;
}

export function buildRepeatableSectionPageHeader(
  doc: EditorDocument,
  options: PdfHeaderRenderOptions,
): RepeatableSectionPageHeader | null {
  const repeatable = findRepeatableSectionBlock((doc as any).blocks);
  if (!repeatable) return null;

  const pageSetup = { ...((doc as any).pageSetup ?? {}), ...(options.pageSetup ?? {}) };
  const ctx = createPdfRenderContext(doc, options);
  const data = (repeatable as any).block.data ?? {};
  if (!evaluateSectionVisibility(data.visibility, ctx.fieldValues, ctx.fieldSchemas)) return null;
  const sectionLabel = resolveVisibleSectionLabel(data);
  const segmentSource = structuredClone(data.segments ?? []);
  const hideEmptyValues = options.hideEmptyValues === true;
  const filtered = hideEmptyValues
    ? filterSegmentsForPreview(
      segmentSource,
      ctx.fieldValues,
      ctx.fieldSchemas,
    )
    : segmentSource;
  const nonTableSegments = filtered.filter((seg: any) => seg.type !== 'table');
  const bodyBlocks = renderSegmentsToPdfProseBlocks(nonTableSegments, ctx);

  if (!sectionLabel && !bodyBlocks.length) return null;

  const stack: Array<Record<string, unknown>> = [];
  if (sectionLabel) {
    const titleNode = buildRepeatableSectionHeaderTitleNode(sectionLabel, ctx.sectionHeaderPdfStyle);
    if (titleNode) stack.push(titleNode as Record<string, unknown>);
  }
  stack.push(...(bodyBlocks as Array<Record<string, unknown>>));
  trimHeaderStackTrailingMargin(stack);

  // Page 1 (single-flow docs): append companion title + Item-group prose so it
  // sits in the same header flow as Price group. Skip when multipage body
  // instances already print that prose — otherwise the top band grows and
  // leaves a large empty gap above PRICE LIST.
  const companionLeading = shouldAttachCompanionLeadingToPageHeader(doc)
    ? buildCompanionLeadingHeaderNodes(
      doc,
      repeatable.index,
      sectionLabel,
      ctx,
      hideEmptyValues,
    )
    : [];
  const firstPageStack = companionLeading.length
    ? [...stack, ...companionLeading]
    : stack;
  if (companionLeading.length) {
    trimHeaderStackTrailingMargin(firstPageStack);
  }

  // Reserve height for the tallest header drawn on any page.
  const heightPt = computeRepeatableHeaderBandHeightPt(firstPageStack, pageSetup);
  const heightMm = ptToMm(heightPt);

  return {
    stack,
    firstPageStack,
    heightPt,
    heightMm,
  };
}
