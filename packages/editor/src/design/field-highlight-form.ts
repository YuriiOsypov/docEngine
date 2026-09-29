import { compactFieldHighlightStyle, normalizeFieldHighlightStyle } from '../core/page-setup-styles.js';
import { DEFAULT_FIELD_HIGHLIGHT_STYLE } from '../core/document-display-defaults.js';
import { FORMAT_ICONS } from '../ui/format-icons.js';

/**
 * Page setup form for empty-field highlight colors (mention-style).
 */
export function createFieldHighlightForm() {
  const root = document.createElement('fieldset');
  root.className = 'display-style-form field-highlight-form';
  root.innerHTML = `
    <legend class="display-style-form__legend">
      <span class="display-style-form__legend-label">Empty field style</span>
      <button type="button" class="schema-form__info-tip" title="Empty field placeholders use this color and weight in design and fill mode. Fields render as soft rounded pills so they read as data tokens, not links." aria-label="More information">${FORMAT_ICONS.info}</button>
    </legend>
    <div class="field-highlight-form__colors">
    <label class="color-field">
        <span class="color-field__label">Text color</span>
        <span class="color-field__control">
          <input type="color" class="color-field__swatch" data-field="highlight-color-picker" aria-label="Field highlight text color" />
          <input type="text" class="color-field__hex" data-field="highlight-color" placeholder="#0000FF" spellcheck="false" />
        </span>
      </label>
      <label class="color-field">
        <span class="color-field__label">Background</span>
        <span class="color-field__control">
          <input type="color" class="color-field__swatch" data-field="highlight-bg-picker" aria-label="Field highlight background color" />
          <input type="text" class="color-field__hex" data-field="highlight-background" placeholder="transparent" spellcheck="false" />
        </span>
      </label>
    </div>
    <div class="field-highlight-form__preview" aria-hidden="true">
      <span class="field-highlight-form__preview-caption">Preview</span>
      <span class="field-highlight-form__preview-sample">
        Complaints:
        <span class="field-highlight-form__preview-token">Vision disturbance</span>
      </span>
    </div>
    <div class="field-highlight-form__options">
      <label class="schema-form__row">
        <span>Weight</span>
        <select data-field="highlight-font-weight">
          <option value="500">Medium (500)</option>
          <option value="600">Semibold (600)</option>
        </select>
      </label>
      <label class="schema-form__row">
        <span>Border width</span>
        <select data-field="highlight-border-width">
          <option value="1px">1px</option>
          <option value="2px">2px</option>
        </select>
      </label>
    </div>
  `;

  const colorPicker = root.querySelector('[data-field="highlight-color-picker"]') as HTMLInputElement | null;
  const colorInput = root.querySelector('[data-field="highlight-color"]') as HTMLInputElement | null;
  const bgPicker = root.querySelector('[data-field="highlight-bg-picker"]') as HTMLInputElement | null;
  const bgInput = root.querySelector('[data-field="highlight-background"]') as HTMLInputElement | null;
  const fontWeightSelect = root.querySelector('[data-field="highlight-font-weight"]') as HTMLSelectElement | null;
  const borderWidthSelect = root.querySelector('[data-field="highlight-border-width"]') as HTMLSelectElement | null;
  const previewToken = root.querySelector('.field-highlight-form__preview-token') as HTMLElement | null;

  function syncPickerFromText(picker: HTMLInputElement | null, textInput: HTMLInputElement | null, property: any = 'color') {
    if (!textInput) return;
    const resolved = normalizeFieldHighlightStyle(
      property === 'backgroundColor'
        ? { backgroundColor: textInput.value }
        : { color: textInput.value },
    );
    const normalized = property === 'backgroundColor' ? resolved.backgroundColor : resolved.color;
    if (!picker) return;
    if (normalized === 'transparent') {
      picker.value = '#ffffff';
      return;
    }
    if (normalized) picker.value = toColorPickerValue(normalized);
  }

  function syncTextFromPicker(textInput: HTMLInputElement | null, picker: HTMLInputElement | null) {
    if (!textInput || !picker?.value) return;
    textInput.value = picker.value;
  }

  function toColorPickerValue(hex: any) {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex ?? '');
    if (!match) return '#0000FF';
    let value = match[1].toLowerCase();
    if (value.length === 3) {
      value = value
        .split('')
        .map((ch: any) => ch + ch)
        .join('');
    }
    return `#${value}`;
  }

  function readFormHighlight() {
    return {
      color: colorInput?.value?.trim() || undefined,
      backgroundColor: bgInput?.value?.trim() || undefined,
      fontWeight: (fontWeightSelect?.value || undefined) as '500' | '600' | undefined,
      borderWidth: borderWidthSelect?.value || undefined,
    };
  }

  function refreshPreview() {
    if (!previewToken) return;
    const resolved = normalizeFieldHighlightStyle(readFormHighlight());
    const color = resolved.color ?? DEFAULT_FIELD_HIGHLIGHT_STYLE.color;
    const bg = resolved.backgroundColor ?? DEFAULT_FIELD_HIGHLIGHT_STYLE.backgroundColor;
    const weight = resolved.fontWeight ?? DEFAULT_FIELD_HIGHLIGHT_STYLE.fontWeight;
    const borderWidth = resolved.borderWidth ?? DEFAULT_FIELD_HIGHLIGHT_STYLE.borderWidth;

    previewToken.style.color = color;
    previewToken.style.backgroundColor = bg === 'transparent' ? '#f0fdfa' : bg;
    previewToken.style.fontWeight = weight;
    previewToken.style.textDecoration = 'none';
    previewToken.style.textDecorationColor = '';
    previewToken.style.textDecorationThickness = '';
    previewToken.style.textUnderlineOffset = '';
    previewToken.style.fontStyle = 'normal';
    previewToken.style.padding = '1px 7px';
    previewToken.style.borderRadius = '999px';
    void borderWidth;
  }

  colorInput?.addEventListener('input', () => {
    syncPickerFromText(colorPicker, colorInput, 'color');
    refreshPreview();
  });
  bgInput?.addEventListener('input', () => {
    syncPickerFromText(bgPicker, bgInput, 'backgroundColor');
    refreshPreview();
  });
  colorPicker?.addEventListener('input', () => {
    syncTextFromPicker(colorInput, colorPicker);
    refreshPreview();
  });
  bgPicker?.addEventListener('input', () => {
    syncTextFromPicker(bgInput, bgPicker);
    refreshPreview();
  });
  fontWeightSelect?.addEventListener('change', refreshPreview);
  borderWidthSelect?.addEventListener('change', refreshPreview);

  function setStyle(style: any) {
    const resolved = normalizeFieldHighlightStyle(style);
    if (colorInput) colorInput.value = resolved.color ?? '';
    if (bgInput) bgInput.value = resolved.backgroundColor ?? '';
    if (fontWeightSelect) fontWeightSelect.value = resolved.fontWeight ?? '500';
    if (borderWidthSelect) borderWidthSelect.value = resolved.borderWidth ?? '1px';
    syncPickerFromText(colorPicker, colorInput, 'color');
    syncPickerFromText(bgPicker, bgInput, 'backgroundColor');
    refreshPreview();
  }

  refreshPreview();

  return {
    element: root,
    readStyle() {
      const rawColor = colorInput?.value?.trim() ?? '';
      const rawBg = bgInput?.value?.trim() ?? '';
      const fontWeight = (fontWeightSelect?.value ?? '') as '500' | '600' | '';
      const borderWidth = borderWidthSelect?.value ?? '';
      const hasCustom =
        rawColor ||
        rawBg ||
        (fontWeight && fontWeight !== DEFAULT_FIELD_HIGHLIGHT_STYLE.fontWeight) ||
        (borderWidth && borderWidth !== DEFAULT_FIELD_HIGHLIGHT_STYLE.borderWidth);
      if (!hasCustom) return undefined;
      return compactFieldHighlightStyle(
        normalizeFieldHighlightStyle({
          ...(rawColor ? { color: rawColor } : {}),
          ...(rawBg ? { backgroundColor: rawBg } : {}),
          ...(fontWeight ? { fontWeight } : {}),
          ...(borderWidth ? { borderWidth } : {}),
        }),
      );
    },
    setStyle,
    clear() {
      setStyle({});
    },
  };
}
