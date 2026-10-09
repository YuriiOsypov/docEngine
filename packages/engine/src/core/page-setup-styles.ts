import type {
  FieldDisplayStyle,
  FieldHighlightStyle,
  FieldValueStyleOptions,
  TemplatePageSetup,
} from '../types.js';
import {
  DEFAULT_DOCUMENT_BODY_STYLE,
  DEFAULT_FIELD_HIGHLIGHT_STYLE,
  DEFAULT_FIELD_VALUE_STYLE_OPTIONS,
} from './document-display-defaults.js';
import { isEmptyFieldDisplayStyle, normalizeFieldDisplayStyle } from '../utils/display-style.js';

function normalizeHighlightColor(value: unknown): string | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v || v.length > 32) return null;
  if (v === 'transparent' || v === 'none') return 'transparent';
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.toUpperCase();
  if (/^[a-z]+$/i.test(v)) return v;
  return null;
}

function normalizeHighlightFontWeight(value: unknown): FieldHighlightStyle['fontWeight'] | null {
  const v = String(value ?? '').trim();
  if (v === '500' || v === '600') return v;
  if (v === 'medium') return '500';
  if (v === 'semibold') return '600';
  return null;
}

function normalizeHighlightBorderWidth(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (/^\d+(\.\d+)?px$/.test(v)) return v;
  return null;
}

export function normalizeFieldHighlightStyle(
  style: FieldHighlightStyle | null | undefined,
): FieldHighlightStyle {
  if (!style || typeof style !== 'object') return { ...DEFAULT_FIELD_HIGHLIGHT_STYLE };

  const color = normalizeHighlightColor(style.color) ?? DEFAULT_FIELD_HIGHLIGHT_STYLE.color;
  const backgroundColor =
    normalizeHighlightColor(style.backgroundColor) ?? DEFAULT_FIELD_HIGHLIGHT_STYLE.backgroundColor;
  const fontWeight =
    normalizeHighlightFontWeight(style.fontWeight) ?? DEFAULT_FIELD_HIGHLIGHT_STYLE.fontWeight;
  const borderWidth =
    normalizeHighlightBorderWidth(style.borderWidth) ?? DEFAULT_FIELD_HIGHLIGHT_STYLE.borderWidth;

  return { color, backgroundColor, fontWeight, borderWidth };
}

export function compactFieldHighlightStyle(
  style: FieldHighlightStyle | null | undefined,
): FieldHighlightStyle | undefined {
  const normalized = normalizeFieldHighlightStyle(style);
  const defaults = DEFAULT_FIELD_HIGHLIGHT_STYLE;
  if (
    normalized.color === defaults.color &&
    normalized.backgroundColor === defaults.backgroundColor &&
    normalized.fontWeight === defaults.fontWeight &&
    normalized.borderWidth === defaults.borderWidth
  ) {
    return undefined;
  }
  return normalized;
}

const LEGACY_FIELD_HIGHLIGHT_COLOR = '#2563EB';
const LEGACY_FIELD_HIGHLIGHT_BG = '#DBEAFE';

function isLegacyFieldHighlight(fieldHighlight: unknown): boolean {
  if (!fieldHighlight || typeof fieldHighlight !== 'object') return false;
  const style = fieldHighlight as FieldHighlightStyle;
  const color = normalizeHighlightColor(style.color);
  const backgroundColor = normalizeHighlightColor(style.backgroundColor);
  return color === LEGACY_FIELD_HIGHLIGHT_COLOR || backgroundColor === LEGACY_FIELD_HIGHLIGHT_BG;
}

/** Upgrade saved templates that still use the old pill-style field highlight. */
export function migratePageSetup(pageSetup: TemplatePageSetup | null | undefined): TemplatePageSetup {
  if (!pageSetup || typeof pageSetup !== 'object') return {};
  const next = JSON.parse(JSON.stringify(pageSetup)) as TemplatePageSetup;
  if (!isLegacyFieldHighlight(next.fieldHighlight)) return next;
  next.fieldHighlight = { ...DEFAULT_FIELD_HIGHLIGHT_STYLE };
  return next;
}

export function resolvePageSetupFieldHighlightStyle(
  pageSetup: TemplatePageSetup | null | undefined,
  editorDefault?: FieldHighlightStyle | null,
): FieldHighlightStyle {
  return normalizeFieldHighlightStyle({
    ...DEFAULT_FIELD_HIGHLIGHT_STYLE,
    ...editorDefault,
    ...pageSetup?.fieldHighlight,
  });
}

export function applyFieldHighlightCssVars(
  holder: HTMLElement | null | undefined,
  style: FieldHighlightStyle,
): void {
  if (!holder) return;
  const resolved = normalizeFieldHighlightStyle(style);
  holder.style.setProperty('--me-field-fill-bg', resolved.backgroundColor ?? '');
  holder.style.setProperty('--me-field-fill-color', resolved.color ?? '');
  holder.style.setProperty('--me-field-fill-font-weight', resolved.fontWeight ?? '');
  holder.style.setProperty('--me-field-fill-border-width', resolved.borderWidth ?? '');
  holder.style.setProperty('--me-field-active-outline', resolved.color ?? '');
}

export function resolvePageSetupTextStyle(
  pageSetup: TemplatePageSetup | null | undefined,
): FieldDisplayStyle {
  return normalizeFieldDisplayStyle({
    ...DEFAULT_DOCUMENT_BODY_STYLE,
    ...pageSetup?.textStyle,
  });
}

export function resolvePageSetupFieldValueStyle(
  pageSetup: TemplatePageSetup | null | undefined,
  editorOptions?: FieldValueStyleOptions | null,
): FieldValueStyleOptions {
  return {
    ...DEFAULT_FIELD_VALUE_STYLE_OPTIONS,
    ...editorOptions,
    default: normalizeFieldDisplayStyle({
      ...DEFAULT_FIELD_VALUE_STYLE_OPTIONS.default,
      ...editorOptions?.default,
      ...pageSetup?.valueStyle,
    }),
  };
}

export function applyDocumentBodyTextStyle(
  element: HTMLElement | null | undefined,
  style: FieldDisplayStyle | null | undefined,
): void {
  if (!element) return;
  const resolved = resolvePageSetupTextStyle({ textStyle: style ?? undefined });
  for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'textDecoration'] as const) {
    const value = resolved[key];
    if (value != null && value !== '') {
      element.style[key] = value;
    } else {
      element.style.removeProperty(key);
    }
  }
}

/**
 * Set document typography CSS variables on the template canvas host only.
 * UI chrome must keep using `--me-font-family`, not these vars.
 */
export function applyDocumentTextStyleCssVars(
  element: HTMLElement | null | undefined,
  style: FieldDisplayStyle | null | undefined,
): void {
  if (!element) return;
  const resolved = resolvePageSetupTextStyle({ textStyle: style ?? undefined });
  const setOrClear = (name: string, value: string | undefined) => {
    if (value != null && value !== '') {
      element.style.setProperty(name, value);
    } else {
      element.style.removeProperty(name);
    }
  };
  setOrClear('--me-document-font-family', resolved.fontFamily);
  setOrClear('--me-document-font-size', resolved.fontSize);
  const weight = resolved.fontWeight;
  setOrClear(
    '--me-document-font-weight',
    weight === 'bold' ? '700' : weight,
  );
}

export function compactPageSetupStyle(
  style: FieldDisplayStyle | null | undefined,
): FieldDisplayStyle | undefined {
  const normalized = normalizeFieldDisplayStyle(style);
  if (isEmptyFieldDisplayStyle(normalized)) return undefined;

  const defaults = normalizeFieldDisplayStyle(DEFAULT_DOCUMENT_BODY_STYLE);
  const next: FieldDisplayStyle = { ...normalized };

  if (fontsEquivalent(next.fontFamily, defaults.fontFamily) || next.fontFamily === defaults.fontFamily) {
    delete next.fontFamily;
  }
  if (next.fontSize != null && next.fontSize === defaults.fontSize) delete next.fontSize;
  if (next.fontWeight != null && next.fontWeight === defaults.fontWeight) delete next.fontWeight;
  if (next.fontStyle != null && next.fontStyle === defaults.fontStyle) delete next.fontStyle;
  if (next.color != null && next.color === defaults.color) delete next.color;
  if (next.textDecoration != null && next.textDecoration === defaults.textDecoration) {
    delete next.textDecoration;
  }
  if (next.textAlign != null && next.textAlign === defaults.textAlign) delete next.textAlign;

  return isEmptyFieldDisplayStyle(next) ? undefined : next;
}

function fontsEquivalent(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const primary = (value: string) =>
    value
      .split(',')[0]
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase();
  return primary(a) === primary(b);
}
