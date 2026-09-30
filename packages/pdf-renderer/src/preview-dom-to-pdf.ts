import { primaryFontFamily } from './fonts-registry.js';
import { cssFontSizeToPdfPt, DEFAULT_BODY_FONT_PT, cssFontWeightToPdfBold } from './style-mapper.js';
import {
  parseCssColor,
  pdfInlineCodeStyle,
  pdfMarkStyle,
} from './rich-text-pdf-styles.js';
import { TABLE_PDF_LINE_HEIGHT, resolveVisionTablePdfLayout } from './table-layout.js';
import { tableColumnWidthsFromColElements } from './table-column-width.js';
import {
  finalizePdfInlineParts,
  htmlToPdfBlocks,
  plainTextToPdfText,
} from './html-text.js';
import {
  buildPdfHorizontalRuleBlock,
  buildPdfSectionBorderRuleBlock,
} from './pdf-horizontal-rule.js';

const HR_SPLIT_RE = /<hr\b[^>]*\/?>/gi;

type PdfCtx = {
  resolveFontName: (name?: string | null) => string;
  baseFontSize: number;
  defaultFont: string;
  bodyFont?: string;
  hideEmptyInPreview?: boolean;
  sectionHeaderStyle?: Record<string, any>;
  tableHeaderStyle?: Record<string, any>;
  tableBodyStyle?: Record<string, any>;
  imageMap?: Map<string, string>;
  [key: string]: any;
};

export function domInlineStyleToPdf(styleValue: any, emBasePt: number): Record<string, any> {
  const emBasePx = (emBasePt * 96) / 72;
  const out: Record<string, any> = {};
  for (const rule of String(styleValue ?? '').split(';')) {
    const colon = rule.indexOf(':');
    if (colon === -1) continue;
    const prop = rule.slice(0, colon).trim().toLowerCase();
    const value = rule.slice(colon + 1).trim();
    const lower = value.toLowerCase();

    if (prop === 'font-weight') {
      const bold = cssFontWeightToPdfBold(value);
      if (bold === true) out.bold = true;
      else if (bold === false) out.bold = false;
    } else if (prop === 'font-style' && lower === 'italic') {
      out.italics = true;
    } else if (prop === 'text-decoration' || prop === 'text-decoration-line') {
      if (lower.includes('line-through')) out.decoration = 'lineThrough';
      else if (lower.includes('underline')) out.decoration = 'underline';
    } else if (prop === 'font-size') {
      const fontSize = cssFontSizeToPdfPt(value, emBasePx);
      if (fontSize) out.fontSize = fontSize;
    } else if (prop === 'color') {
      const color = parseCssColor(value);
      if (color) out.color = color;
    } else if (prop === 'background-color' || prop === 'background') {
      const background = parseCssColor(value);
      if (background) out.background = background;
    } else if (prop === 'font-family' && value) {
      out.fontFamily = value;
    }
  }
  return out;
}

function elementStyleToPdf(el: any, ctx: PdfCtx): Record<string, any> {
  const props = domInlineStyleToPdf(el.getAttribute('style') ?? '', ctx.baseFontSize);
  const fontFamily = el.style?.fontFamily || props.fontFamily;
  if (fontFamily) {
    props.font = ctx.resolveFontName(primaryFontFamily(String(fontFamily)) || String(fontFamily));
    delete props.fontFamily;
  }
  // Keep intentional field displayStyle decorations (underline / strike).
  // Fill-mode highlight underlines live in CSS, not in the inline style attribute,
  // so they are never picked up by domInlineStyleToPdf.
  return props;
}

/**
 * Copy field-token styles for PDF serialization.
 * Prefer the token's own inline style (displayStyle); never pull text-decoration
 * from computed styles so fill-mode highlight underlines stay out of the export.
 */
function buildFieldTokenStyleAttr(token: any): string {
  const styles: string[] = [];
  const inline = token.getAttribute('style') ?? '';
  if (inline.trim()) {
    for (const rule of inline.split(';')) {
      const trimmed = rule.trim();
      if (!trimmed) continue;
      styles.push(trimmed);
    }
  }

  let computed: CSSStyleDeclaration | null = null;
  if (typeof getComputedStyle === 'function') {
    try {
      computed = getComputedStyle(token);
    } catch {
      computed = null;
    }
  }

  const hasWeight = styles.some((rule) => rule.toLowerCase().startsWith('font-weight'));
  if (!hasWeight) {
    const weight = token.style?.fontWeight || computed?.fontWeight;
    const bold = cssFontWeightToPdfBold(weight);
    if (bold === true) styles.push('font-weight: bold');
    else if (bold === false) styles.push('font-weight: normal');
  }

  const hasSize = styles.some((rule) => rule.toLowerCase().startsWith('font-size'));
  if (!hasSize) {
    const fontSize = token.style?.fontSize || computed?.fontSize;
    if (fontSize) styles.push(`font-size: ${fontSize}`);
  }

  const hasColor = styles.some((rule) => rule.toLowerCase().startsWith('color:'));
  if (!hasColor) {
    const color = token.style?.color || computed?.color;
    if (color && /^#[0-9a-f]{3,8}$/i.test(color)) styles.push(`color: ${color}`);
  }

  const hasStyle = styles.some((rule) => rule.toLowerCase().startsWith('font-style'));
  if (!hasStyle) {
    const fontStyle = token.style?.fontStyle || computed?.fontStyle;
    if (fontStyle === 'italic') styles.push('font-style: italic');
  }

  const hasBackground = styles.some((rule) => rule.toLowerCase().startsWith('background-color'));
  if (!hasBackground) {
    const bg = token.style?.backgroundColor || computed?.backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
      styles.push(`background-color: ${bg}`);
    }
  }

  // Intentional underline/strike from displayStyle is already on the inline attribute.
  // Do not copy text-decoration from computed style (fill-mode highlight CSS).

  return styles.join('; ');
}

function appendTextWithPdfBreaks(doc: any, target: any, raw: string): void {
  const text = String(raw ?? '').replace(/\u200B/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text) return;
  if (!text.includes('\n')) {
    target.appendChild(doc.createTextNode(text));
    return;
  }
  const pieces = text.split('\n');
  pieces.forEach((piece: string, index: number) => {
    if (piece) target.appendChild(doc.createTextNode(piece));
    if (index < pieces.length - 1) target.appendChild(doc.createElement('br'));
  });
}

/**
 * Copy field-token children for PDF HTML serialization.
 * textContent flattens `<br>` / block markup, so HTML addresses become one line.
 */
function appendTokenContentsForPdf(source: any, target: any): void {
  const doc = source.ownerDocument;
  for (const child of [...source.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      appendTextWithPdfBreaks(doc, target, String(child.textContent ?? ''));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if (child.tagName === 'BR') {
      target.appendChild(doc.createElement('br'));
      continue;
    }
    const clone = child.cloneNode(false);
    appendTokenContentsForPdf(child, clone);
    target.appendChild(clone);
  }
}

function replaceFieldTokenWithStyledSpan(token: any): void {
  const span = token.ownerDocument.createElement('span');
  const styleAttr = buildFieldTokenStyleAttr(token);
  if (styleAttr) span.setAttribute('style', styleAttr);
  appendTokenContentsForPdf(token, span);
  token.replaceWith(span);
}

function isHiddenEmptyPreviewToken(el: any, ctx: PdfCtx): boolean {
  // Required empties keep their placeholder in preview/PDF — match CSS:
  // .preview-document--hide-empty .field-token--empty:not(.field-token--required-missing)
  return ctx.hideEmptyInPreview === true
    && el.classList?.contains('field-token--preview')
    && el.classList?.contains('field-token--empty')
    && !el.classList?.contains('field-token--required-missing');
}

function findRepeaterTokenInElement(el: any): any | null {
  if (el.classList?.contains('field-token--repeater')) return el;
  const direct = el.querySelector(':scope > .field-token--repeater');
  if (direct) return direct;
  // Table cells wrap Child tokens; also check direct child field-token in td/line.
  if (
    el.tagName === 'TD'
    || el.classList?.contains('document-align')
    || el.classList?.contains('preview-document__line')
  ) {
    const nested = el.querySelector('.field-token--repeater');
    if (nested) return nested;
  }
  return null;
}

function convertRepeaterTokenToPdfBlocks(tokenEl: any, ctx: PdfCtx): Record<string, any>[] {
  const nestedPreview = tokenEl.querySelector(
    '.field-token__repeater-preview .preview-document, .field-token__repeater-instance-body .preview-document',
  );
  if (nestedPreview) {
    return previewDomToPdfContent(nestedPreview, ctx);
  }

  const emptyMsg = tokenEl.querySelector('.field-token__repeater-instance-empty');
  if (emptyMsg && !ctx.hideEmptyInPreview) {
    return [{
      text: String(emptyMsg.textContent ?? '').trim(),
      italics: true,
      color: '#888888',
      font: ctx.defaultFont,
      margin: [0, 0, 0, 4],
    }];
  }

  return [];
}

/**
 * Serialize preview section body HTML for htmlToPdfBlocks, preserving structure and field styles.
 */
export function serializePreviewBodyHtml(bodyEl: any, ctx: PdfCtx = {} as PdfCtx): string {
  const clone = bodyEl.cloneNode(true);
  for (const token of clone.querySelectorAll('.field-token--preview')) {
    if (isHiddenEmptyPreviewToken(token, ctx)) {
      token.remove();
      continue;
    }
    replaceFieldTokenWithStyledSpan(token);
  }
  return clone.innerHTML;
}

function convertSerializedHtmlToPdfBlocks(html: string, ctx: PdfCtx): Record<string, any>[] {
  const source = String(html ?? '');
  if (!source.trim()) return [];

  const blocks: Record<string, any>[] = [];
  const chunks = source.split(HR_SPLIT_RE);

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index].trim();
    if (chunk) {
      for (const block of htmlToPdfBlocks(chunk, {
        baseFontSize: ctx.baseFontSize,
        baseFont: ctx.defaultFont,
      })) {
        const pdfBlock: Record<string, any> = {
          text: finalizePdfInlineParts(block.parts, { font: ctx.defaultFont }),
        };
        if (block.alignment) pdfBlock.alignment = block.alignment;
        if (block.margin) pdfBlock.margin = block.margin;
        blocks.push(pdfBlock);
      }
    }
    if (index < chunks.length - 1) {
      blocks.push(buildPdfHorizontalRuleBlock());
    }
  }

  return blocks;
}

function walkInlineNodes(node: any, styleStack: Record<string, any>[], ctx: PdfCtx, parts: any[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = String(node.textContent ?? '').replace(/\u200B/g, '');
    if (!text) return;
    const style = styleStack[styleStack.length - 1] ?? {};
    if (Object.keys(style).length) {
      parts.push({ text, ...style });
    } else {
      parts.push(...plainTextToPdfText(text));
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node;

  if (isHiddenEmptyPreviewToken(el, ctx)) return;

  if (el.tagName === 'BUTTON' || el.classList?.contains('vision-table__row-remove')) return;

  if (el.tagName === 'BR') {
    parts.push('\n');
    return;
  }

  if (el.tagName === 'IMG') {
    const alt = el.getAttribute('alt');
    if (alt) {
      const style = styleStack[styleStack.length - 1] ?? {};
      parts.push(Object.keys(style).length ? { text: alt, ...style } : alt);
    }
    return;
  }

  let pushStyle: Record<string, any> = {};
  if (el.tagName === 'B' || el.tagName === 'STRONG') pushStyle.bold = true;
  else if (el.tagName === 'I' || el.tagName === 'EM') pushStyle.italics = true;
  else if (el.tagName === 'U') pushStyle.decoration = 'underline';
  else if (el.tagName === 'S' || el.tagName === 'STRIKE') pushStyle.decoration = 'lineThrough';
  else if (el.tagName === 'MARK') {
    pushStyle = { ...pdfMarkStyle(), ...elementStyleToPdf(el, ctx) };
  } else if (el.tagName === 'CODE') {
    pushStyle = { ...pdfInlineCodeStyle(ctx.baseFontSize), ...elementStyleToPdf(el, ctx) };
  } else if (el.tagName === 'SPAN') {
    pushStyle = { ...pushStyle, ...elementStyleToPdf(el, ctx) };
  }

  const nextStack = Object.keys(pushStyle).length
    ? [...styleStack, { ...(styleStack[styleStack.length - 1] ?? {}), ...pushStyle }]
    : styleStack;

  for (const child of el.childNodes) {
    walkInlineNodes(child, nextStack, ctx, parts);
  }
}

function convertVisionTableFromContainer(containerEl: any, ctx: PdfCtx): Record<string, any> | null {
  const tableEl = containerEl.matches?.('table.vision-table')
    ? containerEl
    : containerEl.querySelector('table.vision-table');
  return tableEl ? convertVisionTable(tableEl, ctx) : null;
}

/**
 * Emit pdfmake image blocks for each .field-token--image element found in a node.
 * Returns the image blocks emitted.
 */
function emitImageTokenBlocks(childEl: any, ctx: { imageMap: Map<string, string> }): Record<string, any>[] {
  const imageBlocks: Record<string, any>[] = [];

  const tokens = childEl.classList?.contains('field-token--image')
    ? [childEl]
    : [...childEl.querySelectorAll('.field-token--image')];

  for (const tok of tokens) {
    const imgEl = tok.querySelector('img');
    const src = imgEl?.getAttribute('src') || imgEl?.src || '';
    const dataUrl = src ? ctx.imageMap.get(src) : undefined;
    if (!dataUrl) continue;

    const maxWidthStr =
      tok.style?.getPropertyValue('--field-image-max-width') ||
      tok.getAttribute?.('data-max-width') ||
      '';
    const maxWidth = parseInt(maxWidthStr, 10) || 320;
    imageBlocks.push({ image: dataUrl, width: Math.min(maxWidth, 515), margin: [0, 4, 0, 4] });

    const captionEl = tok.querySelector('.field-token__caption');
    const caption = captionEl?.textContent?.replace(/\u200B/g, '').trim();
    if (caption) {
      imageBlocks.push({ text: caption, fontSize: 9, color: '#666666', margin: [0, 0, 0, 4] });
    }
  }

  return imageBlocks;
}

function convertSectionBodyToPdfBlocks(bodyEl: any, ctx: PdfCtx): Record<string, any>[] {
  // Prefer the font explicitly set on the body element (applyDocumentBodyTextStyle sets it
  // from pageSetup.textStyle.fontFamily). Fall back to ctx.bodyFont, then ctx.defaultFont.
  const bodyFontFamily = bodyEl.style?.fontFamily;
  const sectionFont = (bodyFontFamily ? ctx.resolveFontName(bodyFontFamily) : null)
    ?? ctx.bodyFont
    ?? ctx.defaultFont;

  const blocks: Record<string, any>[] = [];
  let proseBatch: any[] = [];

  function flushProse() {
    if (!proseBatch.length) return;
    const wrapper = bodyEl.ownerDocument.createElement('div');
    for (const node of proseBatch) {
      wrapper.appendChild(node.cloneNode(true));
    }
    blocks.push(...convertSerializedHtmlToPdfBlocks(
      serializePreviewBodyHtml(wrapper, ctx),
      { ...ctx, defaultFont: sectionFont },
    ));
    proseBatch = [];
  }

  for (const child of bodyEl.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child;
      if (childEl.classList.contains('document-columns')) {
        flushProse();
        const columnBlock = convertColumnsBlock(childEl, ctx);
        if (columnBlock) blocks.push(columnBlock);
        continue;
      }
      if (childEl.classList.contains('document-table') || childEl.matches('table.vision-table')) {
        flushProse();
        const tableBlock = convertVisionTableFromContainer(childEl, ctx);
        if (tableBlock) blocks.push(tableBlock);
        continue;
      }

      const repeaterToken = findRepeaterTokenInElement(childEl);
      if (repeaterToken) {
        flushProse();
        if (repeaterToken !== childEl) {
          const preceding = bodyEl.ownerDocument.createDocumentFragment();
          for (const node of childEl.childNodes) {
            if (node === repeaterToken) break;
            if (node.nodeType === Node.ELEMENT_NODE && node.contains(repeaterToken)) break;
            preceding.appendChild(node.cloneNode(true));
          }
          if (preceding.childNodes.length) {
            const wrapper = bodyEl.ownerDocument.createElement('div');
            wrapper.appendChild(preceding);
            blocks.push(...convertSerializedHtmlToPdfBlocks(
              serializePreviewBodyHtml(wrapper, ctx),
              { ...ctx, defaultFont: sectionFont },
            ));
          }
        }
        blocks.push(...convertRepeaterTokenToPdfBlocks(repeaterToken, ctx));
        continue;
      }

      // Handle image field tokens: emit as pdfmake image blocks.
      if (ctx.imageMap) {
        const hasImageToken = childEl.classList?.contains('field-token--image')
          || childEl.querySelector('.field-token--image') !== null;

        if (hasImageToken) {
          // Flush any accumulated prose before the image.
          flushProse();

          // Emit image block(s).
          const imageBlocks = emitImageTokenBlocks(childEl, { imageMap: ctx.imageMap });
          blocks.push(...imageBlocks);

          // If the child also contains non-image text, emit it as prose.
          const textClone = childEl.cloneNode(true);
          for (const tok of textClone.querySelectorAll('.field-token--image')) {
            tok.remove();
          }
          if (textClone.textContent?.replace(/\u200B/g, '').trim()) {
            proseBatch.push(textClone);
            flushProse();
          }
          continue;
        }
      }

      proseBatch.push(child);
      continue;
    }

    if (child.nodeType === Node.TEXT_NODE) {
      const text = String(child.textContent ?? '').replace(/\u200B/g, '');
      if (!text) continue;
      const span = bodyEl.ownerDocument.createElement('span');
      span.textContent = text;
      proseBatch.push(span);
    }
  }

  flushProse();
  return blocks;
}

function convertColumnsBlock(columnsEl: any, ctx: PdfCtx): Record<string, any> | null {
  const cols = columnsEl.querySelectorAll(':scope > .document-columns__grid > .document-columns__col, :scope > .document-columns__col');
  const colEls = cols.length
    ? cols
    : columnsEl.querySelectorAll('.document-columns__col');
  if (!colEls.length) return null;

  const columns: Record<string, any>[] = [];
  for (const col of colEls) {
    columns.push({
      width: '*',
      stack: convertSectionBodyToPdfBlocks(col, ctx),
    });
  }
  if (!columns.some((col) => Array.isArray(col.stack) && col.stack.length)) return null;
  return { columns, columnGap: 12, margin: [0, 0, 0, 6] };
}

/**
 * Direct tbody rows of this table only (ignore nested vision-tables inside cells).
 */
function getOuterTableBodyRows(tableEl: any): any[] {
  const tbody = tableEl.querySelector(':scope > tbody');
  if (!tbody) return [];
  return [...tbody.children].filter((el: any) => el.tagName === 'TR');
}

/**
 * Direct header cells of this table only.
 */
function getOuterTableHeaderCells(tableEl: any): any[] {
  const theadRow = tableEl.querySelector(':scope > thead > tr');
  if (!theadRow) return [];
  return [...theadRow.children].filter((el: any) => el.tagName === 'TH' || el.tagName === 'TD');
}

/**
 * Direct data cells of a body row only (ignore nested tables inside Child cells).
 */
function getOuterTableRowCells(tr: any): any[] {
  return [...tr.children].filter((el: any) => el.tagName === 'TD');
}

function convertVisionTableCell(td: any, ctx: PdfCtx): Record<string, any> {
  if (td.classList.contains('vision-table__row-actions')) {
    return { text: '' };
  }

  const repeaterToken = findRepeaterTokenInElement(td);
  if (repeaterToken) {
    const nestedBlocks = convertRepeaterTokenToPdfBlocks(repeaterToken, ctx);
    return {
      stack: nestedBlocks.length ? nestedBlocks : [{ text: '' }],
      style: 'tableBody',
      lineHeight: TABLE_PDF_LINE_HEIGHT,
      font: ctx.defaultFont,
    };
  }

  const parts: any[] = [];
  walkInlineNodes(td, [{}], ctx, parts);
  const tokenAlign = td.querySelector('.field-token')?.style?.textAlign ?? '';
  const cellAlign = (td.style?.textAlign || tokenAlign || '').trim().toLowerCase();
  const cellBg = parseCssColor(
    td.style?.backgroundColor
    || domInlineStyleToPdf(td.getAttribute('style') ?? '', ctx.baseFontSize).background,
  );
  // Prefer full-cell fill; strip text-level background so padding looks filled.
  const cleanedParts = cellBg
    ? parts.map((part: any) => {
        if (!part || typeof part !== 'object') return part;
        const next = { ...part };
        delete next.background;
        return next;
      })
    : parts;
  const cell: Record<string, any> = {
    text: finalizePdfInlineParts(cleanedParts.length ? cleanedParts : [''], {
      font: ctx.defaultFont,
      inlineStyle: { lineHeight: TABLE_PDF_LINE_HEIGHT },
    }),
    style: 'tableBody',
    lineHeight: TABLE_PDF_LINE_HEIGHT,
    font: ctx.defaultFont,
  };
  if (['left', 'center', 'right', 'justify'].includes(cellAlign)) {
    cell.alignment = cellAlign;
  }
  if (cellBg) cell.fillColor = cellBg;
  return cell;
}

function convertVisionTable(tableEl: any, ctx: PdfCtx): Record<string, any> | null {
  const headerCells = getOuterTableHeaderCells(tableEl);
  const bodyRows = getOuterTableBodyRows(tableEl);
  if (!bodyRows.length) return null;

  const headerRow: Record<string, any>[] = [];
  for (const th of headerCells) {
    if (th.classList.contains('vision-table__actions-head')) continue;
    const text = String(th.textContent ?? '').trim();
    headerRow.push({
      text,
      style: 'tableHeader',
      lineHeight: TABLE_PDF_LINE_HEIGHT,
      ...elementStyleToPdf(th, ctx),
      bold: true,
      alignment: 'center',
      font: ctx.defaultFont,
    });
  }

  const body: Array<Record<string, any>[]> = [];
  for (const tr of bodyRows) {
    const row: Record<string, any>[] = [];
    for (const td of getOuterTableRowCells(tr)) {
      if (td.classList.contains('vision-table__row-actions')) continue;
      row.push(convertVisionTableCell(td, ctx));
    }
    if (row.length) body.push(row);
  }
  if (!body.length) return null;

  const hideHeader = headerRow.length === 0 || tableEl.classList.contains('vision-table--no-header');
  const colCount = hideHeader ? (body[0]?.length ?? 0) : headerRow.length;
  if (!colCount) return null;

  const colEls = tableEl.querySelectorAll(':scope > colgroup > col');
  const widths =
    colEls.length >= colCount
      ? tableColumnWidthsFromColElements([...colEls].slice(0, colCount))
      : Array.from({ length: colCount }, () => '*');

  const pdfBody = hideHeader ? body : [headerRow, ...body];

  return {
    table: {
      headerRows: hideHeader ? 0 : 1,
      keepWithHeaderRows: hideHeader ? 0 : 1,
      widths,
      body: pdfBody,
      dontBreakRows: true,
    },
    layout: resolveVisionTablePdfLayout({
      hideBorders: tableEl.classList.contains('vision-table--borderless'),
    }),
    margin: [0, 0, 0, 8],
  };
}

function convertSectionWrap(sectionWrap: any, ctx: PdfCtx): Record<string, any> | null {
  const stack: Record<string, any>[] = [];
  const borderTop = sectionWrap.classList?.contains('document-section--border-top') === true;
  const borderBottom = sectionWrap.classList?.contains('document-section--border-bottom') === true;

  if (borderTop) {
    stack.push(buildPdfSectionBorderRuleBlock('top'));
  }

  const labelEl = sectionWrap.querySelector('.document-section__header .document-section__label-text');
  const label = String(labelEl?.textContent ?? '').trim();
  if (label) {
    stack.push({
      text: label,
      style: 'sectionHeader',
      bold: true,
      font: ctx.defaultFont,
      ...(ctx.sectionHeaderStyle ?? {}),
    });
  }

  const bodyEl = sectionWrap.querySelector('.preview-document__section');
  if (bodyEl) {
    stack.push(...convertSectionBodyToPdfBlocks(bodyEl, ctx));
  }

  if (borderBottom) {
    stack.push(buildPdfSectionBorderRuleBlock('bottom'));
  }

  if (!stack.length) return null;
  return { stack, margin: [0, 0, 0, 8] };
}

/**
 * Tables inside repeatable ("show on each page") sections are rendered in the PDF
 * body; prose/header fields are handled by the repeatable page header instead.
 */
function convertRepeatableSectionTables(sectionWrap: any, ctx: PdfCtx): Record<string, any>[] {
  const bodyEl = sectionWrap.querySelector('.preview-document__section');
  if (!bodyEl) return [];

  const blocks: Record<string, any>[] = [];

  for (const tableWrap of bodyEl.querySelectorAll('.document-table')) {
    const block = convertVisionTableFromContainer(tableWrap, ctx);
    if (block) blocks.push(block);
  }

  for (const tableEl of bodyEl.querySelectorAll(':scope > table.vision-table')) {
    const block = convertVisionTable(tableEl, ctx);
    if (block) blocks.push(block);
  }

  return blocks;
}

/**
 * Convert a Simple preview root element to pdfmake content blocks.
 */
export function previewDomToPdfContent(previewRoot: any, renderCtx: any): Record<string, any>[] {
  const content: Record<string, any>[] = [];
  const ctx: PdfCtx = {
    ...renderCtx,
    baseFontSize: Number(renderCtx.baseFontSize) || DEFAULT_BODY_FONT_PT,
    hideEmptyInPreview: previewRoot.classList?.contains('preview-document--hide-empty') === true,
  };

  for (const child of previewRoot.children) {
    if (child.classList.contains('preview-document__section-wrap')) {
      if (child.dataset?.repeatable === 'true') {
        content.push(...convertRepeatableSectionTables(child, ctx));
        continue;
      }
      const block = convertSectionWrap(child, ctx);
      if (block) content.push(block);
      continue;
    }

    if (child.classList.contains('preview-document__block')) {
      const table = child.querySelector('table.vision-table');
      if (table) {
        const block = convertVisionTable(table, ctx);
        if (block) content.push(block);
      } else {
        const blockContent = convertSectionBodyToPdfBlocks(child, ctx);
        if (blockContent.length) content.push(...blockContent);
      }
      continue;
    }

    if (child.classList.contains('preview-document__title')) {
      content.push({
        text: String(child.textContent ?? '').trim(),
        style: 'documentTitle',
        margin: [0, 0, 0, 10],
        font: ctx.defaultFont,
      });
    }
  }

  if (!content.length) {
    const emptyEl = previewRoot.querySelector('.preview-document__empty');
    content.push({
      text: String(emptyEl?.textContent ?? 'No filled content to export.'),
      style: 'empty',
    });
  }

  return content;
}
