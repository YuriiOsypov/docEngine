import { compactFieldHighlightStyle, normalizeFieldHighlightStyle } from '../core/page-setup-styles.js';
import { DEFAULT_FIELD_HIGHLIGHT_STYLE } from '../core/document-display-defaults.js';
import { FORMAT_ICONS } from '../ui/format-icons.js';

/**
 * Page setup form for empty-field highlight colors (mention-style).
 */
export function createFieldHighlightForm() {
  const root = document.createElement('fieldset');
  root.className = 'display-style-form field-highlight-form';

  const titleId = `field-highlight-title-${Math.random().toString(36).slice(2, 9)}`;
  root.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'display-style-form__header';

  const titleEl = document.createElement('div');
  titleEl.id = titleId;
  titleEl.className = 'display-style-form__legend';
  titleEl.textContent = 'Empty field style';
  header.appendChild(titleEl);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'display-style-form__reset';
  resetBtn.title = 'Reset to defaults';
  resetBtn.setAttribute('aria-label', 'Reset style');
  resetBtn.innerHTML = FORMAT_ICONS.reset;
  header.appendChild(resetBtn);
  root.appendChild(header);

  const body = document.createElement('div');
  body.innerHTML = `
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
          <input type="text" class="color-field__hex" data-field="highlight-background" placeholder="#F0FDFA" spellcheck="false" />
        </span>
      </label>
    </div>
    <div class="field-highlight-form__options">
      <label class="schema-form__row">
        <span>Font weight</span>
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
  root.appendChild(body);

  const colorPicker = root.querySelector('[data-field="highlight-color-picker"]') as HTMLInputElement | null;
  const colorInput = root.querySelector('[data-field="highlight-color"]') as HTMLInputElement | null;
  const bgPicker = root.querySelector('[data-field="highlight-bg-picker"]') as HTMLInputElement | null;
  const bgInput = root.querySelector('[data-field="highlight-background"]') as HTMLInputElement | null;
  const fontWeightSelect = root.querySelector('[data-field="highlight-font-weight"]') as HTMLSelectElement | null;
  const borderWidthSelect = root.querySelector('[data-field="highlight-border-width"]') as HTMLSelectElement | null;

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

  colorInput?.addEventListener('input', () => {
    syncPickerFromText(colorPicker, colorInput, 'color');
  });
  bgInput?.addEventListener('input', () => {
    syncPickerFromText(bgPicker, bgInput, 'backgroundColor');
  });
  colorPicker?.addEventListener('input', () => {
    syncTextFromPicker(colorInput, colorPicker);
  });
  bgPicker?.addEventListener('input', () => {
    syncTextFromPicker(bgInput, bgPicker);
  });

  function setStyle(style: any) {
    const resolved = normalizeFieldHighlightStyle(style);
    if (colorInput) colorInput.value = resolved.color ?? '';
    if (bgInput) bgInput.value = resolved.backgroundColor ?? '';
    if (fontWeightSelect) fontWeightSelect.value = resolved.fontWeight ?? '500';
    if (borderWidthSelect) borderWidthSelect.value = resolved.borderWidth ?? '1px';
    syncPickerFromText(colorPicker, colorInput, 'color');
    syncPickerFromText(bgPicker, bgInput, 'backgroundColor');
  }

  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setStyle({});
  });

  setStyle({});

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
