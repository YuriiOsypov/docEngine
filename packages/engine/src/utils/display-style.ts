import type { FieldDisplayStyle } from '../types.js';

const STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'color',
  'backgroundColor',
  'textDecoration',
  'textAlign',
] as const;

type StyleKey = (typeof STYLE_KEYS)[number];

function normalizeFontFamilyPart(part: unknown): string | null {
  let name = String(part ?? '').trim();
  if (!name) return null;
  if (/^['"].*['"]$/.test(name)) {
    name = name.slice(1, -1).trim();
  }
  if (!name || !/^[\w\s\-'.]+$/i.test(name)) return null;
  if (/\s/.test(name)) return `"${name.replace(/"/g, '')}"`;
  return name;
}

export function normalizeFontFamily(value: unknown): string | null {
  let trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed.length > 200) return null;
  if (!/^[\w\s\-'",.]+$/i.test(trimmed)) return null;
  if (/^['"].*['"]$/.test(trimmed)) {
    trimmed = trimmed.slice(1, -1).trim();
    if (!trimmed) return null;
  }
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((part) => normalizeFontFamilyPart(part));
    if (parts.some((part) => !part)) return null;
    return parts.join(', ');
  }
  return normalizeFontFamilyPart(trimmed);
}

export function normalizeFontSize(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([\d.]+)\s*(px|pt|em|rem|%)?$/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return null;
  const unit = (match[2] || 'px').toLowerCase();
  return `${num}${unit}`;
}

function normalizeFontWeight(value: unknown): FieldDisplayStyle['fontWeight'] | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'normal' || v === '400') return 'normal';
  if (v === 'bold' || v === '700') return 'bold';
  return null;
}

function normalizeFontStyle(value: unknown): FieldDisplayStyle['fontStyle'] | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'normal') return 'normal';
  if (v === 'italic') return 'italic';
  return null;
}

function normalizeColor(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (!v || v.length > 32) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^[a-z]+$/i.test(v)) return v;
  return null;
}

function normalizeTextAlign(value: unknown): FieldDisplayStyle['textAlign'] | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'left' || v === 'center' || v === 'right') return v;
  return null;
}

function normalizeTextDecoration(value: unknown): FieldDisplayStyle['textDecoration'] | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'none' || v === 'underline' || v === 'line-through') return v;
  return null;
}

export function normalizeFieldDisplayStyle(style: unknown): FieldDisplayStyle {
  if (!style || typeof style !== 'object') return {};
  const input = style as Record<string, unknown>;
  const next: FieldDisplayStyle = {};
  const fontFamily = normalizeFontFamily(input.fontFamily);
  const fontSize = normalizeFontSize(input.fontSize);
  const fontWeight = normalizeFontWeight(input.fontWeight);
  const fontStyle = normalizeFontStyle(input.fontStyle);
  const color = normalizeColor(input.color);
  const backgroundColor = normalizeColor(input.backgroundColor);
  const textDecoration = normalizeTextDecoration(input.textDecoration);
  const textAlign = normalizeTextAlign(input.textAlign);
  if (fontFamily) next.fontFamily = fontFamily;
  if (fontSize) next.fontSize = fontSize;
  if (fontWeight) next.fontWeight = fontWeight;
  if (fontStyle) next.fontStyle = fontStyle;
  if (color) next.color = color;
  if (backgroundColor) next.backgroundColor = backgroundColor;
  if (textDecoration) next.textDecoration = textDecoration;
  if (textAlign) next.textAlign = textAlign;
  return next;
}

export function isEmptyFieldDisplayStyle(style: FieldDisplayStyle | null | undefined): boolean {
  return STYLE_KEYS.every((key: StyleKey) => !style?.[key]);
}

export function resolveFieldDisplayStyle(
  schema: { displayStyle?: unknown } | null | undefined,
  globalDefault: unknown,
): FieldDisplayStyle {
  const base = normalizeFieldDisplayStyle(globalDefault);
  const override = normalizeFieldDisplayStyle(schema?.displayStyle);
  return { ...base, ...override };
}
