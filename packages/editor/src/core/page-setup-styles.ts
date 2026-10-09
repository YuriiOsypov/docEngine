import {
  migratePageSetup,
  normalizeFieldHighlightStyle,
  compactFieldHighlightStyle,
  resolvePageSetupFieldHighlightStyle,
  resolvePageSetupTextStyle,
  resolvePageSetupFieldValueStyle,
  compactPageSetupStyle,
  applyFieldHighlightCssVars,
  applyDocumentBodyTextStyle,
  applyDocumentTextStyleCssVars,
} from '@docengine/engine';
import { readTokenValue, updateFieldToken } from '../fields/inline-fields.js';

export {
  migratePageSetup,
  normalizeFieldHighlightStyle,
  compactFieldHighlightStyle,
  resolvePageSetupFieldHighlightStyle,
  resolvePageSetupTextStyle,
  resolvePageSetupFieldValueStyle,
  compactPageSetupStyle,
  applyFieldHighlightCssVars,
  applyDocumentBodyTextStyle,
  applyDocumentTextStyleCssVars,
};

const CUSTOM_PAGE_MIN_MM = 20;
const CUSTOM_PAGE_MAX_MM = 1200;
const DEFAULT_CUSTOM_WIDTH_MM = 210;
const DEFAULT_CUSTOM_HEIGHT_MM = 297;

/** Clamp custom page dimension (mm); invalid → fallback. */
export function normalizeCustomPageMm(
  value: unknown,
  fallback: number,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(CUSTOM_PAGE_MAX_MM, Math.max(CUSTOM_PAGE_MIN_MM, +n.toFixed(2)));
}

/** Physical page size from Page Setup format (mm). */
export function resolvePageFormatSizeMm(
  pageSetup: {
    format?: string;
    orientation?: string;
    widthMm?: number;
    heightMm?: number;
  } | null | undefined,
) {
  const format = String(pageSetup?.format ?? 'a4').toLowerCase();
  let portrait: { widthMm: number; heightMm: number };
  if (format === 'custom') {
    portrait = {
      widthMm: normalizeCustomPageMm(pageSetup?.widthMm, DEFAULT_CUSTOM_WIDTH_MM),
      heightMm: normalizeCustomPageMm(pageSetup?.heightMm, DEFAULT_CUSTOM_HEIGHT_MM),
    };
  } else if (format === 'letter') {
    portrait = { widthMm: 215.9, heightMm: 279.4 };
  } else {
    portrait = { widthMm: 210, heightMm: 297 };
  }
  if (String(pageSetup?.orientation ?? 'portrait').toLowerCase() === 'landscape') {
    return { widthMm: portrait.heightMm, heightMm: portrait.widthMm };
  }
  return portrait;
}

/** Normalize pageSetup.margin to [top, right, bottom, left] mm. */
export function resolvePageMarginsMm(
  pageSetup: { margin?: number | number[] } | null | undefined,
): [number, number, number, number] {
  const margin = pageSetup?.margin;
  if (typeof margin === 'number' && Number.isFinite(margin) && margin >= 0) {
    return [margin, margin, margin, margin];
  }
  if (Array.isArray(margin)) {
    const nums = margin.map((v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null));
    if (nums.length >= 4 && nums[0] != null && nums[1] != null && nums[2] != null && nums[3] != null) {
      return [nums[0], nums[1], nums[2], nums[3]];
    }
    if (nums[0] != null) return [nums[0], nums[0], nums[0], nums[0]];
  }
  return [15, 15, 15, 15];
}

function resolvePageMarginMm(pageSetup: { margin?: number | number[] } | null | undefined) {
  return resolvePageMarginsMm(pageSetup)[0];
}

/** Printable content width (page width minus left/right margins), in mm. */
export function resolvePageContentWidthMm(
  pageSetup: {
    format?: string;
    orientation?: string;
    widthMm?: number;
    heightMm?: number;
    margin?: number | number[];
  } | null | undefined,
) {
  const { widthMm } = resolvePageFormatSizeMm(pageSetup);
  const [, rightMm, , leftMm] = resolvePageMarginsMm(pageSetup);
  return Math.max(40, +(widthMm - leftMm - rightMm).toFixed(2));
}

/** Fill-mode editor window is true page size × this factor (~+10%). */
export const FILL_MODE_PAGE_SCALE = 1.1;

export type ApplyPageFormatOptions = {
  /** Fill mode uses a slightly larger sheet than true paper (~10%). */
  scale?: number;
  /** When true, mark element as fill-mode page sheet. */
  fillPage?: boolean;
};

/**
 * Apply Page Setup format/orientation/margin as CSS variables for a paper-like editor surface.
 */
export function applyPageFormatCssVars(
  element: HTMLElement | null | undefined,
  pageSetup: {
    format?: string;
    orientation?: string;
    widthMm?: number;
    heightMm?: number;
    margin?: number | number[];
  } | null | undefined,
  options: ApplyPageFormatOptions = {}
) {
  if (!element) return;
  const scale = options.scale != null && options.scale > 0 ? options.scale : 1;
  const { widthMm, heightMm } = resolvePageFormatSizeMm(pageSetup);
  const margins = resolvePageMarginsMm(pageSetup);
  const marginMm = margins[0];
  const contentWidthMm = Math.max(40, widthMm - margins[3] - margins[1]);
  element.style.setProperty('--doc-page-width', `${+(widthMm * scale).toFixed(2)}mm`);
  element.style.setProperty('--doc-page-min-height', `${+(heightMm * scale).toFixed(2)}mm`);
  element.style.setProperty('--doc-page-margin', `${+(marginMm * scale).toFixed(2)}mm`);
  element.style.setProperty('--doc-page-content-width', `${+(contentWidthMm * scale).toFixed(2)}mm`);
  if (options.fillPage) {
    element.classList.add('editor-holder--fill-page');
  } else {
    element.classList.remove('editor-holder--fill-page');
  }
}

/** Clear page-format CSS variables previously set by applyPageFormatCssVars. */
export function clearPageFormatCssVars(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.style.removeProperty('--doc-page-width');
  element.style.removeProperty('--doc-page-min-height');
  element.style.removeProperty('--doc-page-margin');
  element.style.removeProperty('--doc-page-content-width');
  element.classList.remove('editor-holder--fill-page');
}

/**
 * Apply ONLY the typographic properties of a page text style (font family, size,
 * weight, style) to an element. Color and text-decoration are intentionally left
 * untouched so the surrounding theme keeps control of contrast (e.g. dark modes).
 * Used to style field-edit form/modal value text from the document's global font.
 * @param {HTMLElement} element
 * @param {import('../types.js').FieldDisplayStyle | null | undefined} style
 */
export function applyFieldFormTextStyle(element, style) {
  if (!element) return;
  const resolved = resolvePageSetupTextStyle({ textStyle: style });
  for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle']) {
    if (resolved[key] != null && resolved[key] !== '') {
      element.style[key] = resolved[key];
    } else {
      element.style.removeProperty(key);
    }
  }
}

/**
 * No-op: Default text style must stay on the template document only.
 * Design panels, palette, and schema modals use UI `--me-font-family`.
 * Kept for call-site compatibility.
 * @param {ParentNode | null} _root
 * @param {import('../types.js').TemplatePageSetup | null | undefined} _pageSetup
 */
export function applyDesignPanelTextStyle(_root, _pageSetup) {
  // Intentionally empty — do not push pageSetup.textStyle onto Interface chrome.
}

/**
 * @param {ParentNode} root
 * @param {import('../types.js').FieldValueStyleOptions} fieldValueStyle
 */
export function refreshDocumentFieldTokenStyles(root, fieldValueStyle, options = {}) {
  if (!root?.querySelectorAll) return;
  const context = { fieldValueStyle, ...options };
  for (const token of root.querySelectorAll('.field-token[data-field-id]')) {
    updateFieldToken(
      token,
      readTokenValue(token),
      token.dataset.placeholder,
      context,
    );
  }
}
