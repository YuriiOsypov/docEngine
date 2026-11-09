/** Number / currency display formatting (field properties + mapping `#EUR`). */

export const DEFAULT_MAPPING_CURRENCY = 'EUR';
export const DEFAULT_MAPPING_LOCALE = 'en-US';

export type IntegerDisplayFormat = 'plain' | 'number' | 'currency';

export type CurrencyFormatSpec = {
  style: 'currency' | 'decimal';
  /** ISO 4217 code when style is currency. */
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export type NumericDisplayOptions = {
  displayFormat?: IntegerDisplayFormat | string | null;
  currencyCode?: string | null;
  fractionDigits?: number | null;
  /** Unit suffix (e.g. mmHg). Applied for plain/number; skipped for currency. */
  suffix?: string | null;
  locale?: string;
};

function scalarEmpty(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Parse a numeric payload value.
 * Accepts a number, a numeric string (`1,234.50`), and a currency-decorated
 * display string (`53.25 USD`, `USD 53.25`, `$53.25`) so computed formulas
 * can multiply fields that use a currency interface.
 */
export function parseNumericValue(value: unknown): number | null {
  if (scalarEmpty(value)) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') return null;

  const raw = String(value);
  const direct = parsePlainNumericString(raw);
  if (direct != null) return direct;
  // Number('') === 0. Keep that for blank / whitespace-only strings.
  if (raw.trim().replace(/,/g, '') === '') return 0;

  const stripped = stripCurrencyDecoration(raw);
  if (stripped == null) return null;
  return parsePlainNumericString(stripped);
}

/** Plain numeric string. Commas are thousands separators (existing contract). */
function parsePlainNumericString(raw: string): number | null {
  const str = raw.trim().replace(/,/g, '');
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * Drop one leading and one trailing currency symbol or short code
 * (`USD`, `EUR`, `$`) so the remainder can be parsed as a number.
 * Returns null when nothing currency-like was removed.
 */
function stripCurrencyDecoration(raw: string): string | null {
  let str = raw.trim();
  let changed = false;

  if (str.startsWith('(') && str.endsWith(')') && str.length > 2) {
    str = `-${str.slice(1, -1).trim()}`;
    changed = true;
  }

  const withoutSymbols = str.replace(/\p{Sc}/gu, '');
  if (withoutSymbols !== str) {
    str = withoutSymbols;
    changed = true;
  }
  str = str.replace(/\s+/g, ' ').trim();

  const withoutLeading = str.replace(/^\p{L}{2,4}(?=\s|\d)/u, '').trim();
  if (withoutLeading !== str && /\d/.test(withoutLeading)) {
    str = withoutLeading;
    changed = true;
  }

  const withoutTrailing = str.replace(/(?<=\d)\s*\p{L}{2,4}$/u, '').trim();
  if (withoutTrailing !== str && /\d/.test(withoutTrailing)) {
    str = withoutTrailing;
    changed = true;
  }

  return changed ? str : null;
}

function normalizeDisplayFormat(format: unknown): IntegerDisplayFormat {
  const raw = String(format ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'number' || raw === 'currency') return raw;
  return 'plain';
}

function normalizeCurrencyCode(code: unknown): string {
  const raw = String(code ?? '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : DEFAULT_MAPPING_CURRENCY;
}

function normalizeFractionDigits(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 20) return undefined;
  return num;
}

/**
 * Parse a mapping currency/number suffix.
 * Examples: `currency`, `EUR`, `USD:2`, `number`, `number:2`
 */
export function parseCurrencyFormatSuffix(format: unknown): CurrencyFormatSpec | null {
  const raw = String(format ?? '').trim();
  if (!raw) return null;

  const match = /^(currency|number|[A-Za-z]{3})(?::(\d+))?$/i.exec(raw);
  if (!match) return null;

  const kind = match[1]!.toLowerCase();
  const digits = match[2] != null ? Number(match[2]) : undefined;
  if (digits != null && (!Number.isInteger(digits) || digits < 0 || digits > 20)) {
    return null;
  }

  if (kind === 'number') {
    return {
      style: 'decimal',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    };
  }

  // Reject date presets that are also 3-letter tokens (e.g. `#iso`).
  if (kind === 'iso' || kind === 'custom') return null;

  const currency = kind === 'currency' ? DEFAULT_MAPPING_CURRENCY : match[1]!.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  return {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  };
}

export function looksLikeCurrencyFormatSuffix(format: string): boolean {
  return parseCurrencyFormatSuffix(format) != null;
}

export type FormatCurrencyValueOptions = {
  locale?: string;
};

function formatWithSpec(num: number, spec: CurrencyFormatSpec, locale: string): string {
  if (spec.style === 'decimal') {
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: spec.minimumFractionDigits,
      maximumFractionDigits: spec.maximumFractionDigits ?? 20,
    }).format(num);
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: spec.currency || DEFAULT_MAPPING_CURRENCY,
    minimumFractionDigits: spec.minimumFractionDigits,
    maximumFractionDigits: spec.maximumFractionDigits,
  }).format(num);
}

/**
 * Format a number as currency or decimal for mapping display.
 * Returns the original string if the value is not numeric.
 */
export function formatCurrencyValue(
  value: unknown,
  format: unknown,
  options: FormatCurrencyValueOptions = {},
): string {
  if (scalarEmpty(value)) return '';
  const spec = parseCurrencyFormatSuffix(format);
  if (!spec) return String(value);

  const num = parseNumericValue(value);
  if (num == null) return String(value);

  const locale = options.locale || DEFAULT_MAPPING_LOCALE;
  try {
    return formatWithSpec(num, spec, locale);
  } catch {
    return String(value);
  }
}

/**
 * Format a numeric field value from schema display settings.
 * Stored value stays a plain number/string; this is display-only.
 */
export function formatNumericDisplay(value: unknown, options: NumericDisplayOptions = {}): string {
  if (scalarEmpty(value)) return '';

  const displayFormat = normalizeDisplayFormat(options.displayFormat);
  const suffix = String(options.suffix ?? '');
  const locale = options.locale || DEFAULT_MAPPING_LOCALE;
  const digits = normalizeFractionDigits(options.fractionDigits);

  if (displayFormat === 'plain') {
    const text = String(value);
    return suffix ? `${text}${suffix}` : text;
  }

  const num = parseNumericValue(value);
  if (num == null) {
    const text = String(value);
    return suffix ? `${text}${suffix}` : text;
  }

  try {
    if (displayFormat === 'currency') {
      return formatWithSpec(
        num,
        {
          style: 'currency',
          currency: normalizeCurrencyCode(options.currencyCode),
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        },
        locale,
      );
    }

    const formatted = formatWithSpec(
      num,
      {
        style: 'decimal',
        minimumFractionDigits: digits ?? 0,
        maximumFractionDigits: digits ?? 20,
      },
      locale,
    );
    return suffix ? `${formatted}${suffix}` : formatted;
  } catch {
    const text = String(value);
    return suffix ? `${text}${suffix}` : text;
  }
}
