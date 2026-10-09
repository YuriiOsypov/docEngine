import { normalizeFieldDisplayStyle } from '../fields/field-display-style.js';
import { compactPageSetupStyle } from '../core/page-setup-styles.js';
import { DEFAULT_DOCUMENT_BODY_STYLE } from '../core/document-display-defaults.js';
import { FORMAT_ICONS } from '../ui/format-icons.js';
import {
  STYLE_FONT_SUGGESTIONS,
  applyPageSetupStyleCommand,
  createFontSizeSpinInput,
  createStyleIconButton,
  readFontSizeSpinValue,
  refreshStyleCommandButtons,
  setFontSelectValue,
  setFontSizeSpinValue,
  toColorPickerValue,
} from './style-toolbar-shared.js';

const STYLE_COMMANDS = [
  { command: 'bold', title: 'Bold' },
  { command: 'italic', title: 'Italic' },
  { command: 'underline', title: 'Underline' },
  { command: 'strikeThrough', title: 'Strikethrough' },
];

function effectiveDisplayStyle(overrides: any) {
  return normalizeFieldDisplayStyle({
    ...DEFAULT_DOCUMENT_BODY_STYLE,
    ...overrides,
  });
}

/**
 * @param {{ legend: string }} options
 */
export function createDisplayStyleForm({ legend }: any) {
  /** @type {import('../types.js').FieldDisplayStyle} */
  let currentStyle: any = {};

  const root = document.createElement('fieldset');
  root.className = 'display-style-form';

  const titleId = `display-style-title-${Math.random().toString(36).slice(2, 9)}`;
  root.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'display-style-form__header';

  const titleEl = document.createElement('div');
  titleEl.id = titleId;
  titleEl.className = 'display-style-form__legend';
  titleEl.textContent = legend;
  header.appendChild(titleEl);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'display-style-form__reset';
  resetBtn.title = 'Reset to defaults';
  resetBtn.setAttribute('aria-label', 'Reset style');
  resetBtn.innerHTML = FORMAT_ICONS.reset;
  header.appendChild(resetBtn);
  root.appendChild(header);

  const toolbar = document.createElement('div');
  toolbar.className =
    'display-style-form__toolbar rich-text-toolbar rich-text-toolbar--field-style rich-text-toolbar--compact';
  root.appendChild(toolbar);

  const fontGroup = document.createElement('div');
  fontGroup.className = 'rich-text-toolbar__font-group display-style-form__font-group';
  toolbar.appendChild(fontGroup);

  const fontSelect = document.createElement('select');
  fontSelect.className = 'rich-text-toolbar__input rich-text-toolbar__select';
  fontSelect.setAttribute('aria-label', 'Font');
  fontSelect.innerHTML = [
    '<option value="">Font…</option>',
    ...STYLE_FONT_SUGGESTIONS.map((family: any) => `<option value="${family}">${family}</option>`),
    '<option value="__custom__">Other…</option>',
  ].join('');
  fontGroup.appendChild(fontSelect);

  const fontCustomInput = document.createElement('input');
  fontCustomInput.type = 'text';
  fontCustomInput.className = 'rich-text-toolbar__input rich-text-toolbar__input--custom';
  fontCustomInput.placeholder = 'Custom font';
  fontCustomInput.hidden = true;
  fontCustomInput.disabled = true;
  fontGroup.appendChild(fontCustomInput);

  const sizeInput = createFontSizeSpinInput({ ariaLabel: 'Font size', placeholder: '16' });
  fontGroup.appendChild(sizeInput);

  const formatRow = document.createElement('div');
  formatRow.className = 'display-style-form__format-row';
  toolbar.appendChild(formatRow);

  const styleGroup = document.createElement('div');
  styleGroup.className = 'display-style-form__style-group';
  styleGroup.setAttribute('role', 'group');
  styleGroup.setAttribute('aria-label', 'Text formatting');
  formatRow.appendChild(styleGroup);

  const commandButtons = new Map();
  for (const item of STYLE_COMMANDS) {
    const btn = createStyleIconButton(item);
    commandButtons.set(item.command, btn);
    styleGroup.appendChild(btn);
  }

  const colorControl = document.createElement('label');
  colorControl.className = 'display-style-form__color-control';
  colorControl.title = 'Text color';
  colorControl.innerHTML = `
    <span class="display-style-form__color-swatch" data-role="color-swatch" aria-hidden="true"></span>
    <span class="display-style-form__color-label">Color</span>
    <span class="display-style-form__color-chevron">${FORMAT_ICONS.chevronDown}</span>
  `;

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'display-style-form__color-input';
  colorInput.setAttribute('aria-label', 'Text color');
  colorInput.value = '#000000';
  colorControl.appendChild(colorInput);
  formatRow.appendChild(colorControl);

  const colorSwatch = colorControl.querySelector('[data-role="color-swatch"]') as HTMLElement | null;

  function syncColorFromStyle(resolved: any) {
    const color = resolved.color ?? DEFAULT_DOCUMENT_BODY_STYLE.color ?? '#000000';
    const pickerValue = toColorPickerValue(color);
    colorInput.value = pickerValue;
    if (colorSwatch) colorSwatch.style.backgroundColor = pickerValue;
  }

  function syncControlsFromStyle(resolved: any) {
    setFontSelectValue(fontSelect, fontCustomInput, resolved.fontFamily ?? '');
    setFontSizeSpinValue(sizeInput, resolved.fontSize ?? '');
    syncColorFromStyle(resolved);
  }

  function refreshToolbarState() {
    refreshStyleCommandButtons(effectiveDisplayStyle(currentStyle), commandButtons);
  }

  function applyStyle(style: any) {
    currentStyle = compactPageSetupStyle(normalizeFieldDisplayStyle(style)) ?? {};
    syncControlsFromStyle(effectiveDisplayStyle(currentStyle));
    refreshToolbarState();
  }

  function commitFromFontControls() {
    let fontFamily = '';
    if (fontSelect.value === '__custom__') {
      fontFamily = fontCustomInput.value.trim();
    } else {
      fontFamily = fontSelect.value.trim();
    }

    const next = { ...effectiveDisplayStyle(currentStyle) };
    if (fontFamily) next.fontFamily = fontFamily;
    else delete next.fontFamily;

    const fontSize = readFontSizeSpinValue(sizeInput);
    if (fontSize) next.fontSize = fontSize;
    else delete next.fontSize;

    currentStyle = compactPageSetupStyle(normalizeFieldDisplayStyle(next)) ?? {};
    refreshToolbarState();
  }

  fontSelect.addEventListener('change', () => {
    const isCustom = fontSelect.value === '__custom__';
    fontCustomInput.hidden = !isCustom;
    fontCustomInput.disabled = !isCustom;
    if (isCustom) fontCustomInput.focus();
    commitFromFontControls();
  });

  fontCustomInput.addEventListener('input', commitFromFontControls);
  sizeInput.addEventListener('input', commitFromFontControls);
  sizeInput.addEventListener('change', commitFromFontControls);

  colorInput.addEventListener('input', () => {
    const next = { ...effectiveDisplayStyle(currentStyle), color: colorInput.value };
    applyStyle(next);
  });

  styleGroup.addEventListener('click', (e: any) => {
    const btn = e.target.closest('button[data-command]');
    if (!btn) return;
    e.preventDefault();
    const command = btn.dataset.command;
    applyStyle(applyPageSetupStyleCommand(effectiveDisplayStyle(currentStyle), command));
  });

  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    applyStyle({});
  });

  applyStyle({});

  return {
    element: root,
    readStyle() {
      commitFromFontControls();
      return compactPageSetupStyle(normalizeFieldDisplayStyle(currentStyle));
    },
    setStyle(style: any) {
      applyStyle(style ?? {});
    },
    clear() {
      applyStyle({});
    },
  };
}
