import { toColorPickerValue } from '../design/style-toolbar-shared.js';

export const RECENT_FILL_COLORS_STORAGE_KEY = 'docengine.recentFillColors';
export const RECENT_FILL_COLORS_MAX = 5;

/**
 * Normalize to #rrggbb lowercase, or null if invalid.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeFillColorHex(value: any): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  // Named colors / rgb() — round-trip via browser when available.
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    if (typeof document === 'undefined') return null;
    try {
      const el = document.createElement('span');
      el.style.color = raw;
      const computed = el.style.color;
      if (!computed) return null;
      const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(computed);
      if (!match) return null;
      const hex = `#${[match[1], match[2], match[3]]
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')}`;
      return toColorPickerValue(hex);
    } catch {
      return null;
    }
  }
  return toColorPickerValue(raw);
}

/**
 * @param {Storage | null | undefined} [storage]
 * @returns {string[]}
 */
export function readRecentFillColors(storage: Storage | null | undefined = defaultStorage()): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_FILL_COLORS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      const hex = normalizeFillColorHex(item);
      if (!hex || out.includes(hex)) continue;
      out.push(hex);
      if (out.length >= RECENT_FILL_COLORS_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Prepend a color and keep the newest N unique values.
 * @param {unknown} color
 * @param {Storage | null | undefined} [storage]
 * @returns {string[]}
 */
export function rememberFillColor(
  color: any,
  storage: Storage | null | undefined = defaultStorage(),
): string[] {
  const hex = normalizeFillColorHex(color);
  if (!hex) return readRecentFillColors(storage);
  const next = [hex, ...readRecentFillColors(storage).filter((c) => c !== hex)].slice(
    0,
    RECENT_FILL_COLORS_MAX,
  );
  if (storage) {
    try {
      storage.setItem(RECENT_FILL_COLORS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
  }
  return next;
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
