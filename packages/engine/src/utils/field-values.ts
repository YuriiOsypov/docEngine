import { isImageValueEmpty } from './image-values.js';
import { isLegacyRepeaterInstancesWrapper, repeaterHasContent } from '../core/repeater-io.js';

export interface FieldEmptyOptions {
  htmlEditor?: boolean;
  repeaterSchema?: { type?: string; [key: string]: unknown } | null;
  schema?: { type?: string; [key: string]: unknown } | null;
}

/** Zero-width space used as caret anchor around field tokens. */
export const FIELD_TOKEN_CARET_ANCHOR = '\u200B';

export function stripFieldTokenCaretAnchors(text: unknown): string {
  return String(text ?? '').replace(/\u200B/g, '');
}

/**
 * Returns true when an html-editor value has no visible content.
 * Requires a DOMParser in globalThis (browser native or linkedom shim).
 */
export function isHtmlValueEmpty(html: unknown): boolean {
  if (typeof html !== 'string' || !html.trim()) return true;
  if (typeof globalThis.DOMParser === 'undefined') {
    return !html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
  }
  const doc = new globalThis.DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body?.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  if (text) return false;
  return !doc.body?.querySelector?.('img, br, li, ul, ol');
}

export function isFieldEmpty(value: unknown, options: FieldEmptyOptions = {}): boolean {
  if (value === '—') return true;
  if (options.repeaterSchema?.type === 'child') {
    return !repeaterHasContent(value, options.repeaterSchema);
  }
  if (isLegacyRepeaterInstancesWrapper(value)) {
    const wrapper = value as { instances?: Record<string, unknown> };
    return !Object.values(wrapper.instances ?? {}).some((inst) => {
      if (!inst || typeof inst !== 'object') return false;
      return Object.values(inst as Record<string, unknown>).some(
        (entry) =>
          entry != null &&
          entry !== '' &&
          !(Array.isArray(entry) && entry.length === 0) &&
          !(typeof entry === 'object' && entry !== null && 'url' in entry && !(entry as { url?: string }).url),
      );
    });
  }
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return isImageValueEmpty(value);
  }
  if (options.htmlEditor && typeof value === 'string') {
    return isHtmlValueEmpty(value);
  }
  if (typeof value === 'string' && !stripFieldTokenCaretAnchors(value).trim()) {
    return true;
  }
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** Built-in default table column labels: "Column 1", "Column 2", … */
const DEFAULT_COLUMN_LABEL_RE = /^Column \d+$/i;

export function isTableCellDisplayPlaceholder(value: unknown, label: string | null | undefined): boolean {
  if (value == null || value === '') return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  const normalized = String(label ?? '').trim();
  if (normalized && trimmed === normalized) return true;
  // After renaming default columns, "Column 1" can stick as a stored value while
  // the header/label is already the real field name (e.g. "name").
  if (DEFAULT_COLUMN_LABEL_RE.test(trimmed) && trimmed !== normalized) return true;
  return false;
}
