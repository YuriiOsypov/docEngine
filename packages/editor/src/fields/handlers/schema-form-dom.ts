/** Shared DOM helpers for field handler schema forms. */

import { FORMAT_ICONS } from '../../ui/format-icons.js';

export function escapeAttr(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Compact (i) tip; full help text lives in the native title tooltip. */
export function infoTipHtml(text: string): string {
  const tip = escapeAttr(text);
  return `<button type="button" class="schema-form__info-tip" title="${tip}" aria-label="More information">${FORMAT_ICONS.info}</button>`;
}

export function readInputValue(host: ParentNode, field: string): string {
  const el = host.querySelector(`[data-field="${field}"]`) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null;
  return el?.value ?? '';
}

export function readCheckbox(host: ParentNode, field: string): boolean {
  const el = host.querySelector(`[data-field="${field}"]`) as HTMLInputElement | null;
  return !!el?.checked;
}

export function normalizeIntegerDisplayFormat(value: unknown): 'plain' | 'number' | 'currency' {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'number' || raw === 'currency') return raw;
  return 'plain';
}

export function readOptionalInteger(host: ParentNode, field: string): number | '' {
  const raw = readInputValue(host, field).trim();
  if (!raw) return '';
  const num = Number(raw);
  return Number.isInteger(num) && num >= 0 && num <= 20 ? num : '';
}

/**
 * Display format / currency / fraction digits / suffix controls shared by Number and Computed.
 * @param options.append When true, append into `host` instead of replacing `innerHTML`.
 * @param options.hint Override the help text under the controls (omit when `infoTip` is set).
 * @param options.infoTip When set, show an (i) tip on Display format instead of a hint paragraph.
 */
export function renderNumericDisplayFormatFields(
  host: ParentNode & { innerHTML?: string; insertAdjacentHTML?: Function; appendChild?: Function; querySelector?: Function },
  schema: { displayFormat?: unknown; currencyCode?: unknown; fractionDigits?: unknown; suffix?: unknown },
  options: { append?: boolean; hint?: string; infoTip?: string } = {},
) {
  const displayFormat = normalizeIntegerDisplayFormat(schema.displayFormat);
  const fractionDigits =
    schema.fractionDigits == null || schema.fractionDigits === ''
      ? ''
      : String(schema.fractionDigits);
  const infoTip = options.infoTip ? infoTipHtml(options.infoTip) : '';
  const formatLabel = infoTip
    ? `<span class="schema-form__label-row"><span>Display format</span>${infoTip}</span>`
    : '<span>Display format</span>';
  const hintHtml = infoTip
    ? ''
    : `<p class="schema-form__hint" data-role="display-format-hint">${
        options.hint ??
        'Stored value stays a plain number. Format applies in the document, preview, and PDF.'
      }</p>`;
  const html = `
        <label class="schema-form__row">
          ${formatLabel}
          <select data-field="displayFormat">
            <option value="plain"${displayFormat === 'plain' ? ' selected' : ''}>Plain</option>
            <option value="number"${displayFormat === 'number' ? ' selected' : ''}>Number</option>
            <option value="currency"${displayFormat === 'currency' ? ' selected' : ''}>Currency</option>
          </select>
        </label>
        <label class="schema-form__row" data-role="currency-code-row">
          <span>Currency</span>
          <input type="text" data-field="currencyCode" value="${escapeAttr(schema.currencyCode ?? 'EUR')}" placeholder="EUR" maxlength="3" />
        </label>
        <label class="schema-form__row" data-role="fraction-digits-row">
          <span>Fraction digits</span>
          <input type="number" data-field="fractionDigits" min="0" max="20" value="${escapeAttr(fractionDigits)}" placeholder="auto" />
        </label>
        <label class="schema-form__row" data-role="suffix-row">
          <span>Suffix</span>
          <input type="text" data-field="suffix" value="${escapeAttr(schema.suffix ?? '')}" placeholder="e.g. mmHg" />
        </label>
        ${hintHtml}
      `;

  if (options.append && typeof (host as Element).insertAdjacentHTML === 'function') {
    (host as Element).insertAdjacentHTML('beforeend', html);
  } else {
    (host as { innerHTML: string }).innerHTML = html;
  }

  const formatSelect = (host as Element).querySelector('[data-field="displayFormat"]');
  const currencyRow = (host as Element).querySelector('[data-role="currency-code-row"]');
  const fractionRow = (host as Element).querySelector('[data-role="fraction-digits-row"]');
  const suffixRow = (host as Element).querySelector('[data-role="suffix-row"]');
  const setHidden = (el: Element | null, hidden: boolean) => {
    if (el && 'hidden' in el) (el as HTMLElement).hidden = hidden;
  };
  const syncRows = (mode: string) => {
    setHidden(currencyRow, mode !== 'currency');
    setHidden(fractionRow, mode === 'plain');
    setHidden(suffixRow, mode === 'currency');
  };
  syncRows(displayFormat);
  formatSelect?.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLSelectElement | null;
    if (!target) return;
    syncRows(normalizeIntegerDisplayFormat(target.value));
  });
}

export function readNumericDisplayFormatFields(host: ParentNode): {
  displayFormat: 'plain' | 'number' | 'currency';
  currencyCode: string;
  fractionDigits: number | '';
  suffix: string;
} {
  return {
    displayFormat: normalizeIntegerDisplayFormat(readInputValue(host, 'displayFormat')),
    currencyCode: readInputValue(host, 'currencyCode').trim().toUpperCase() || 'EUR',
    fractionDigits: readOptionalInteger(host, 'fractionDigits'),
    suffix: readInputValue(host, 'suffix'),
  };
}
