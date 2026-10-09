import {
  applySectionInstanceToBlocks,
  collectAllValues,
  findRepeatableSectionBlock,
  resolveRepeatablePagePlan,
} from '@docengine/editor/node';
import type { EditorDocument, PdfRenderOptions } from './types.js';
import { isHideTitleInPreview, renderSinglePagePdfContent } from './segment-renderer.js';

export function resolveDocPagePlan(doc: EditorDocument): any | null {
  if ((doc as any).repeatablePagePlan?.instances?.length > 1) {
    return (doc as any).repeatablePagePlan;
  }

  const blocks = (doc as any).blocks ?? [];
  const fieldSchemas = (doc as any).fieldSchemas ?? {};
  const flatValues = collectAllValues(blocks);
  const fresh = resolveRepeatablePagePlan(
    blocks,
    fieldSchemas,
    flatValues,
    (doc as any).repeatableSectionInstances ?? null,
  );
  if ((fresh?.instances?.length ?? 0) > 1) {
    return fresh;
  }

  return null;
}

export function hasMultipageRepeatableContent(doc: EditorDocument): boolean {
  const plan = resolveDocPagePlan(doc);
  return !!plan && plan.instances.length > 1;
}

/**
 * True when the "Show on each page" section is itself the multi-instance expand target.
 * In that case body clones carry the section chrome; PDF page-header mode is skipped.
 * When a different section expands, the repeatable section still becomes the page header.
 */
export function multipageTargetsRepeatableSection(doc: EditorDocument): boolean {
  const plan = resolveDocPagePlan(doc);
  if (!plan || plan.instances.length <= 1) return false;
  const repeatable = findRepeatableSectionBlock((doc as any).blocks);
  return !!repeatable && plan.repeatableBlockIndex === repeatable.index;
}

/**
 * True when the document repeats a section once per stored instance.
 * JSON pdfmake expands those rows (inline or page-break per row),
 * matching HTML preview — including single-instance repeating page headers.
 */
export function shouldUseLegacyPdfExport(doc: EditorDocument): boolean {
  return hasMultipageRepeatableContent(doc);
}

export type PdfMultipageRenderOptions = PdfRenderOptions & {
  resolveFontName: (name?: string | null) => string;
  defaultFont: string;
};

function renderBlockSlice(
  doc: EditorDocument,
  blocks: any[],
  fieldSchemas: any,
  options: PdfMultipageRenderOptions,
): Array<Record<string, unknown>> {
  if (!blocks.length) return [];
  return renderSinglePagePdfContent(
    {
      time: (doc as any).time,
      fieldSchemas,
      blocks,
      pageSetup: (doc as any).pageSetup,
    },
    options,
  );
}

/**
 * Expand a multi-instance (`_source` / loaded sections array) section.
 * Default: continuous flow; body + borders per row.
 * "Show on each page" (`repeatable`) or `eachRowOnNewPage`: section title on every row.
 * When `eachRowOnNewPage` is set: page break before each row after the first.
 *
 * Each instance is rendered in isolation so shared field ids (e.g. `items_name`)
 * do not collapse to the last instance's values.
 */
export function renderMultipagePdfContent(
  doc: EditorDocument,
  options: PdfMultipageRenderOptions,
): Array<Record<string, unknown>> {
  const plan = resolveDocPagePlan(doc);
  if (!plan || plan.instances.length <= 1) {
    return renderSinglePagePdfContent(doc, options);
  }

  const blocks = (doc as any).blocks ?? [];
  const fieldSchemas = (doc as any).fieldSchemas ?? {};
  const beforeBlocks = blocks.slice(0, plan.repeatableBlockIndex);
  const repeatBlock = blocks[plan.repeatableBlockIndex];
  const afterBlocks = blocks.slice(plan.repeatableBlockIndex + 1);
  const baseData = repeatBlock?.data ?? {};
  const titleHidden = isHideTitleInPreview(baseData);
  const eachRowOnNewPage = !!baseData.eachRowOnNewPage;
  // "Show on each page" keeps the section title on every instance / page.
  const titleOnEveryInstance = !!baseData.repeatable || eachRowOnNewPage;
  // Only skip PDF page-header mode when this same section is the expand target.
  const pageOptions = {
    ...options,
    skipRepeatablePageHeader: multipageTargetsRepeatableSection(doc),
  };

  const content: Array<Record<string, unknown>> = [];
  content.push(...renderBlockSlice(doc, beforeBlocks, fieldSchemas, pageOptions));

  for (let i = 0; i < plan.instances.length; i += 1) {
    const applied = applySectionInstanceToBlocks(
      [repeatBlock],
      fieldSchemas,
      0,
      plan.instances[i],
    );
    const instanceData = {
      ...(applied.blocks[0]?.data ?? baseData),
      hideTitleInPreview: titleHidden || (!titleOnEveryInstance && i > 0),
      borderTop: !!baseData.borderTop,
      borderBottom: !!baseData.borderBottom,
    };
    const slice = renderBlockSlice(
      doc,
      [{ ...repeatBlock, data: instanceData }],
      applied.fieldSchemas,
      pageOptions,
    );
    // Put pageBreak on the instance content itself — an empty `{ text: '' }`
    // spacer before the break adds a blank line and uneven top gaps across pages.
    if (eachRowOnNewPage && i > 0 && slice.length > 0) {
      slice[0] = { ...slice[0], pageBreak: 'before' };
    }
    content.push(...slice);
  }

  content.push(...renderBlockSlice(doc, afterBlocks, fieldSchemas, pageOptions));

  if (!content.length) {
    content.push({ text: 'No filled content to export.', style: 'empty' });
  }

  return content;
}

export function renderDocumentToPdfContent(
  doc: EditorDocument,
  options: PdfMultipageRenderOptions,
): Array<Record<string, unknown>> {
  if (hasMultipageRepeatableContent(doc)) {
    return renderMultipagePdfContent(doc, options);
  }
  return renderSinglePagePdfContent(doc, options);
}
