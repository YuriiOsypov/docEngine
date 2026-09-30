import { applyFontFormatting, execRichTextCommand, saveSelection } from '../fields/rich-text.js';
import {
  normalizeFieldDisplayStyle,
} from '../fields/field-display-style.js';
import { FORMAT_ICONS } from './format-icons.js';
import {
  createFontSizeSpinInput,
  readFontSizeSpinValue,
  setFontSizeSpinValue,
  toColorPickerValue,
} from '../design/style-toolbar-shared.js';
import { readRecentFillColors, rememberFillColor } from './recent-fill-colors.js';

const COMMANDS = [
  { command: 'bold', title: 'Bold' },
  { command: 'italic', title: 'Italic' },
  { command: 'underline', title: 'Underline' },
  { command: 'strikeThrough', title: 'Strikethrough' },
  { command: 'mark', title: 'Highlight' },
  { command: 'inlineCode', title: 'Inline code' },
  { command: 'insertUnorderedList', title: 'Bullet list' },
  { command: 'insertOrderedList', title: 'Numbered list' },
  { command: 'removeFormat', title: 'Clear formatting' },
];

const HEADING_COMMANDS = [
  { command: 'heading1', title: 'Heading 1' },
  { command: 'heading2', title: 'Heading 2' },
  { command: 'heading3', title: 'Heading 3' },
];

const FIELD_STYLE_COMMANDS = new Set(['bold', 'italic', 'underline', 'strikeThrough', 'removeFormat']);

const ALIGN_COMMANDS = [
  { command: 'justifyLeft', title: 'Align left' },
  { command: 'justifyCenter', title: 'Align center' },
  { command: 'justifyRight', title: 'Align right' },
];

const ALIGN_BY_COMMAND = {
  justifyLeft: 'left',
  justifyCenter: 'center',
  justifyRight: 'right',
};

const FIELD_ALIGN_COMMANDS = new Set(Object.keys(ALIGN_BY_COMMAND));

function createIconButton({ command, title: btnTitle }: any) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rich-text-toolbar__btn rich-text-toolbar__btn--icon';
  btn.title = btnTitle;
  btn.setAttribute('aria-label', btnTitle);
  btn.dataset.command = command;
  btn.innerHTML = FORMAT_ICONS[command] ?? '';
  btn.disabled = true;
  return btn;
}

const FONT_SUGGESTIONS = [
  'Inter',
  'Tahoma',
  'Times New Roman',
  'Arial',
  'Calibri',
  'Georgia',
  'Courier New',
  'Verdana',
  'Segoe UI',
];

function isDocumentSectionEditable(editable: any) {
  return editable?.closest('.document-section') && !editable.closest('.template-block');
}

function toggleDisplayStyleProperty(override: any,globalDefault: any,key: any,activeValue: any,inactiveValue: any = 'normal') {
  const base = normalizeFieldDisplayStyle(globalDefault);
  const current = normalizeFieldDisplayStyle(override);
  const merged = { ...base, ...current };
  const isActive = merged[key] === activeValue;
  const next = { ...current };

  if (isActive) {
    if (base[key] === activeValue) {
      next[key] = inactiveValue;
    } else {
      delete next[key];
    }
  } else {
    next[key] = activeValue;
  }

  return normalizeFieldDisplayStyle(next);
}

function setFontSelectValue(fontSelect: any,fontCustomInput: any,fontFamily: any) {
  if (!fontFamily) {
    fontSelect.value = '';
    fontCustomInput.hidden = true;
    fontCustomInput.disabled = true;
    fontCustomInput.value = '';
    return;
  }

  const known = [...fontSelect.options].some((opt: any) => opt.value === fontFamily);
  if (known) {
    fontSelect.value = fontFamily;
    fontCustomInput.hidden = true;
    fontCustomInput.disabled = true;
    fontCustomInput.value = '';
    return;
  }

  // Match stacks like `Inter, ui-sans-serif, …` to the primary family option
  // (avoid the custom input looking like "Arial, sans-serif" when truncated).
  const primary = String(fontFamily)
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
  const knownPrimary = [...fontSelect.options].some((opt: any) => opt.value === primary);
  if (knownPrimary) {
    fontSelect.value = primary;
    fontCustomInput.hidden = true;
    fontCustomInput.disabled = true;
    fontCustomInput.value = '';
    return;
  }

  fontSelect.value = '__custom__';
  fontCustomInput.hidden = false;
  fontCustomInput.disabled = false;
  fontCustomInput.value = fontFamily;
}

export function createRichTextToolbar(_options: { onPreview?: (() => void) | null } = {}) {
  const bar = document.createElement('div');
  bar.className = 'rich-text-toolbar';

  const hint = document.createElement('span');
  hint.className = 'rich-text-toolbar__hint';
  hint.textContent = 'Select text in the document, then apply formatting.';

  let activeEditable: any = null;
  let savedRange: any = null;
  let selectionListener: any = null;
  let fieldMode: any = null;
  const buttons: any[] = [];
  const alignButtons: any[] = [];
  const commandButtons = new Map();

  for (const item of COMMANDS) {
    const btn = createIconButton(item);
    buttons.push(btn);
    commandButtons.set(item.command, btn);
    bar.appendChild(btn);
  }

  const headingGroup = document.createElement('div');
  headingGroup.className = 'rich-text-toolbar__heading-group';

  for (const item of HEADING_COMMANDS) {
    const btn = createIconButton(item);
    buttons.push(btn);
    commandButtons.set(item.command, btn);
    headingGroup.appendChild(btn);
  }

  bar.appendChild(headingGroup);

  const alignGroup = document.createElement('div');
  alignGroup.className = 'rich-text-toolbar__align-group';
  alignGroup.hidden = true;

  for (const item of ALIGN_COMMANDS) {
    const btn = createIconButton(item);
    alignButtons.push(btn);
    commandButtons.set(item.command, btn);
    alignGroup.appendChild(btn);
  }

  bar.appendChild(alignGroup);

  const fontGroup = document.createElement('div');
  fontGroup.className = 'rich-text-toolbar__font-group';

  const fontSelect = document.createElement('select');
  fontSelect.className = 'rich-text-toolbar__input rich-text-toolbar__select';
  fontSelect.setAttribute('aria-label', 'Font');
  fontSelect.disabled = true;
  fontSelect.innerHTML = [
    '<option value="">Font…</option>',
    ...FONT_SUGGESTIONS.map((family: any) => `<option value="${family}">${family}</option>`),
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

  const sizeInput = createFontSizeSpinInput({ ariaLabel: 'Font size', placeholder: '16', disabled: true });
  fontGroup.appendChild(sizeInput);

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'rich-text-toolbar__btn rich-text-toolbar__btn--icon';
  applyBtn.title = 'Apply font and size to selection';
  applyBtn.setAttribute('aria-label', 'Apply font and size to selection');
  applyBtn.innerHTML = FORMAT_ICONS.apply;
  applyBtn.disabled = true;
  fontGroup.appendChild(applyBtn);

  const bgColorControl = document.createElement('div');
  bgColorControl.className = 'rich-text-toolbar__bg-color';
  bgColorControl.title = 'Background color';

  const bgColorToggle = document.createElement('button');
  bgColorToggle.type = 'button';
  bgColorToggle.className = 'rich-text-toolbar__bg-color-toggle';
  bgColorToggle.setAttribute('aria-label', 'Background color');
  bgColorToggle.setAttribute('aria-haspopup', 'true');
  bgColorToggle.setAttribute('aria-expanded', 'false');
  bgColorToggle.disabled = true;
  bgColorToggle.innerHTML = `
    <span class="rich-text-toolbar__bg-color-swatch" data-role="bg-color-swatch" aria-hidden="true"></span>
    <span class="rich-text-toolbar__bg-color-label">Fill</span>
    <span class="rich-text-toolbar__bg-color-chevron">${FORMAT_ICONS.chevronDown}</span>
  `;
  bgColorControl.appendChild(bgColorToggle);

  const bgColorPanel = document.createElement('div');
  bgColorPanel.className = 'rich-text-toolbar__bg-color-panel';
  bgColorPanel.hidden = true;
  bgColorPanel.innerHTML = `
    <div class="rich-text-toolbar__bg-color-recent" data-role="bg-color-recent" hidden>
      <div class="rich-text-toolbar__bg-color-recent-label">Recent</div>
      <div class="rich-text-toolbar__bg-color-recent-list" data-role="bg-color-recent-list"></div>
    </div>
    <label class="rich-text-toolbar__bg-color-custom">
      <span class="rich-text-toolbar__bg-color-custom-label">Custom</span>
    </label>
  `;
  const bgColorInput = document.createElement('input');
  bgColorInput.type = 'color';
  bgColorInput.className = 'rich-text-toolbar__bg-color-input';
  bgColorInput.setAttribute('aria-label', 'Custom background color');
  bgColorInput.value = '#ffffff';
  bgColorInput.disabled = true;
  bgColorPanel.querySelector('.rich-text-toolbar__bg-color-custom')?.appendChild(bgColorInput);
  // Panel is portaled to document.body so toolbar overflow does not clip it.
  document.body.appendChild(bgColorPanel);
  fontGroup.appendChild(bgColorControl);
  const bgColorSwatch = bgColorToggle.querySelector('[data-role="bg-color-swatch"]') as HTMLElement | null;
  const bgColorRecentWrap = bgColorPanel.querySelector('[data-role="bg-color-recent"]') as HTMLElement | null;
  const bgColorRecentList = bgColorPanel.querySelector('[data-role="bg-color-recent-list"]') as HTMLElement | null;

  function closeBgColorPanel() {
    bgColorPanel.hidden = true;
    bgColorToggle.setAttribute('aria-expanded', 'false');
    bgColorPanel.style.top = '';
    bgColorPanel.style.left = '';
    bgColorPanel.style.right = '';
    bgColorPanel.style.bottom = '';
  }

  function renderRecentFillSwatches() {
    if (!bgColorRecentList || !bgColorRecentWrap) return;
    const recent = readRecentFillColors();
    bgColorRecentList.innerHTML = '';
    if (!recent.length) {
      bgColorRecentWrap.hidden = true;
      return;
    }
    bgColorRecentWrap.hidden = false;
    for (const hex of recent) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'rich-text-toolbar__bg-color-recent-swatch';
      swatch.title = hex;
      swatch.setAttribute('aria-label', `Use background ${hex}`);
      swatch.style.backgroundColor = hex;
      swatch.dataset.color = hex;
      bgColorRecentList.appendChild(swatch);
    }
  }

  function positionBgColorPanel() {
    const rect = bgColorToggle.getBoundingClientRect();
    const gap = 4;
    const panelWidth = Math.max(bgColorPanel.offsetWidth || 168, 168);
    const panelHeight = bgColorPanel.offsetHeight || 120;
    const viewportPad = 8;

    let left = rect.left;
    if (left + panelWidth > window.innerWidth - viewportPad) {
      left = Math.max(viewportPad, rect.right - panelWidth);
    }
    left = Math.max(viewportPad, left);

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openBelow = spaceBelow >= panelHeight || spaceBelow >= spaceAbove;
    let top = openBelow ? rect.bottom + gap : rect.top - panelHeight - gap;
    top = Math.max(viewportPad, Math.min(top, window.innerHeight - panelHeight - viewportPad));

    bgColorPanel.style.top = `${Math.round(top)}px`;
    bgColorPanel.style.left = `${Math.round(left)}px`;
    bgColorPanel.style.right = 'auto';
    bgColorPanel.style.bottom = 'auto';
  }

  function openBgColorPanel() {
    if (bgColorToggle.disabled) return;
    renderRecentFillSwatches();
    bgColorPanel.hidden = false;
    bgColorToggle.setAttribute('aria-expanded', 'true');
    positionBgColorPanel();
  }

  function applyBackgroundColor(hex: any, { remember = true }: { remember?: boolean } = {}) {
    if (!fieldMode || bgColorToggle.disabled) return;
    const pickerValue = toColorPickerValue(hex);
    const override = normalizeFieldDisplayStyle(fieldMode.getOverrideStyle?.() ?? {});
    override.backgroundColor = pickerValue;
    bgColorInput.value = pickerValue;
    if (bgColorSwatch) bgColorSwatch.style.backgroundColor = pickerValue;
    if (remember) rememberFillColor(pickerValue);
    fieldMode.onStyleChange?.(normalizeFieldDisplayStyle(override));
    refreshFieldModeControls();
  }

  bar.appendChild(fontGroup);
  bar.appendChild(hint);

  function setTextModeHint() {
    hint.textContent = 'Select text in the document, then apply formatting.';
  }

  function setFieldModeHint(customHint: any) {
    hint.textContent = customHint ?? 'Select a field, then apply formatting.';
  }

  function setCommandButtonActive(command: any,active: any) {
    commandButtons.get(command)?.classList.toggle('rich-text-toolbar__btn--active', !!active);
  }

  function refreshFieldModeControls() {
    if (!fieldMode) return;

    const resolved = normalizeFieldDisplayStyle(fieldMode.getResolvedStyle?.() ?? {});

    setCommandButtonActive('bold', resolved.fontWeight === 'bold');
    setCommandButtonActive('italic', resolved.fontStyle === 'italic');
    setCommandButtonActive(
      'underline',
      resolved.textDecoration === 'underline',
    );
    setCommandButtonActive(
      'strikeThrough',
      resolved.textDecoration === 'line-through',
    );
    setCommandButtonActive('justifyLeft', resolved.textAlign === 'left');
    setCommandButtonActive('justifyCenter', resolved.textAlign === 'center');
    setCommandButtonActive('justifyRight', resolved.textAlign === 'right');

    setFontSelectValue(fontSelect, fontCustomInput, resolved.fontFamily ?? '');
    setFontSizeSpinValue(sizeInput, resolved.fontSize ?? '');
    const pickerValue = toColorPickerValue(resolved.backgroundColor ?? '#ffffff');
    bgColorInput.value = pickerValue;
    if (bgColorSwatch) bgColorSwatch.style.backgroundColor = pickerValue;
  }

  function setAlignControlsVisible(visible: any,enabled: any = true) {
    alignGroup.hidden = !visible;
    for (const btn of alignButtons) {
      btn.disabled = !visible || !enabled;
    }
  }

  function setTextControlsEnabled(enabled: any) {
    for (const btn of buttons) btn.disabled = !enabled;
    setAlignControlsVisible(enabled && isDocumentSectionEditable(activeEditable), enabled);
    fontSelect.disabled = !enabled;
    sizeInput.disabled = !enabled;
    applyBtn.disabled = !enabled;
    bgColorInput.disabled = true;
    bgColorToggle.disabled = true;
    bgColorControl.classList.add('rich-text-toolbar__bg-color--disabled');
    closeBgColorPanel();
    if (!enabled) {
      fontCustomInput.disabled = true;
      fontCustomInput.hidden = true;
      fontSelect.value = '';
      setFontSizeSpinValue(sizeInput, '');
      for (const btn of buttons) btn.classList.remove('rich-text-toolbar__btn--active');
    } else if (fontSelect.value === '__custom__') {
      fontCustomInput.disabled = false;
    }
  }

  function setFieldControlsEnabled(enabled: any) {
    for (const btn of buttons) {
      const command = btn.dataset.command;
      if (FIELD_STYLE_COMMANDS.has(command)) {
        btn.disabled = !enabled;
      } else {
        btn.disabled = true;
      }
    }
    setAlignControlsVisible(enabled, enabled);
    fontSelect.disabled = !enabled;
    sizeInput.disabled = !enabled;
    applyBtn.disabled = !enabled;
    bgColorInput.disabled = !enabled;
    bgColorToggle.disabled = !enabled;
    bgColorControl.classList.toggle('rich-text-toolbar__bg-color--disabled', !enabled);
    if (!enabled) {
      closeBgColorPanel();
      fontCustomInput.disabled = true;
      fontCustomInput.hidden = true;
      fontSelect.value = '';
      setFontSizeSpinValue(sizeInput, '');
      for (const btn of buttons) btn.classList.remove('rich-text-toolbar__btn--active');
      for (const btn of alignButtons) btn.classList.remove('rich-text-toolbar__btn--active');
    } else if (fontSelect.value === '__custom__') {
      fontCustomInput.disabled = false;
    }
  }

  function detachSelectionListener() {
    if (selectionListener) {
      document.removeEventListener('selectionchange', selectionListener);
      selectionListener = null;
    }
  }

  function attachSelectionListener(editable: any) {
    detachSelectionListener();
    selectionListener = () => {
      if (activeEditable !== editable) return;
      // Font/size inputs need focus; don't let that collapse overwrite the saved range.
      if (bar.contains(document.activeElement)) return;
      const next = saveSelection(editable);
      if (!next) return;
      // Prefer a non-collapsed range; keep the prior highlight if the browser only left a caret.
      if (next.collapsed && savedRange && !savedRange.collapsed && !editable.contains(document.activeElement)) {
        return;
      }
      savedRange = next;
    };
    document.addEventListener('selectionchange', selectionListener);
  }

  function refreshSavedRange() {
    if (activeEditable) {
      const next = saveSelection(activeEditable);
      if (next && !(next.collapsed && savedRange && !savedRange.collapsed)) {
        savedRange = next;
      }
    }
  }

  function applyFontAndSizeToText() {
    if (!activeEditable) return;
    let fontFamily = '';
    if (fontSelect.value === '__custom__') {
      fontFamily = fontCustomInput.value.trim();
    } else {
      fontFamily = fontSelect.value.trim();
    }
    const fontSize = readFontSizeSpinValue(sizeInput);
    if (!fontFamily && !fontSize) return;

    applyFontFormatting(activeEditable, { fontFamily, fontSize }, savedRange);
    savedRange = saveSelection(activeEditable) ?? savedRange;
    activeEditable.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function applyFontAndSizeToField() {
    if (!fieldMode) return;

    let fontFamily = '';
    if (fontSelect.value === '__custom__') {
      fontFamily = fontCustomInput.value.trim();
    } else {
      fontFamily = fontSelect.value.trim();
    }
    const fontSize = readFontSizeSpinValue(sizeInput);

    const override = normalizeFieldDisplayStyle(fieldMode.getOverrideStyle?.() ?? {});
    const next = { ...override };
    if (fontFamily) next.fontFamily = fontFamily;
    if (fontSize) next.fontSize = fontSize;

    fieldMode.onStyleChange?.(next);
    refreshFieldModeControls();
  }

  function applyFontAndSizeFromControls() {
    if (fieldMode) applyFontAndSizeToField();
    else applyFontAndSizeToText();
  }

  function applyFieldStyleCommand(command: any) {
    if (!fieldMode) return;

    const globalDefault = fieldMode.getGlobalDefault?.() ?? {};
    let override = normalizeFieldDisplayStyle(fieldMode.getOverrideStyle?.() ?? {});

    if (command === 'removeFormat') {
      fieldMode.onClearStyle?.();
      refreshFieldModeControls();
      return;
    }

    if (command === 'bold') {
      override = toggleDisplayStyleProperty(override, globalDefault, 'fontWeight', 'bold', 'normal');
    } else if (command === 'italic') {
      override = toggleDisplayStyleProperty(override, globalDefault, 'fontStyle', 'italic', 'normal');
    } else if (command === 'underline') {
      override = toggleDisplayStyleProperty(
        override,
        globalDefault,
        'textDecoration',
        'underline',
        'none',
      );
    } else if (command === 'strikeThrough') {
      override = toggleDisplayStyleProperty(
        override,
        globalDefault,
        'textDecoration',
        'line-through',
        'none',
      );
    } else if (FIELD_ALIGN_COMMANDS.has(command)) {
      const align = ALIGN_BY_COMMAND[command];
      override = toggleDisplayStyleProperty(override, globalDefault, 'textAlign', align);
    } else {
      return;
    }

    fieldMode.onStyleChange?.(normalizeFieldDisplayStyle(override));
    refreshFieldModeControls();
  }

  bar.addEventListener('mousedown', (e: any) => {
    if (e.target.closest('input, select')) {
      refreshSavedRange();
      return;
    }
    if (!e.target.closest('button')) return;
    e.preventDefault();
    refreshSavedRange();
  });

  bar.addEventListener('click', (e: any) => {
    const btn = e.target.closest('button[data-command]');
    if (!btn) return;

    const command = btn.dataset.command;

    if (fieldMode) {
      if (FIELD_STYLE_COMMANDS.has(command) || FIELD_ALIGN_COMMANDS.has(command)) {
        applyFieldStyleCommand(command);
      }
      return;
    }

    if (!activeEditable) return;

    execRichTextCommand(command, activeEditable, savedRange);
    savedRange = saveSelection(activeEditable) ?? savedRange;
    activeEditable.dispatchEvent(new Event('input', { bubbles: true }));
  });

  applyBtn.addEventListener('click', (e: any) => {
    e.preventDefault();
    applyFontAndSizeFromControls();
  });

  bgColorToggle.addEventListener('click', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (bgColorToggle.disabled) return;
    if (bgColorPanel.hidden) openBgColorPanel();
    else closeBgColorPanel();
  });

  bgColorRecentList?.addEventListener('click', (e: any) => {
    const swatch = e.target?.closest?.('[data-color]');
    if (!swatch || !bgColorRecentList.contains(swatch)) return;
    e.preventDefault();
    applyBackgroundColor(swatch.dataset.color);
    closeBgColorPanel();
  });

  bgColorInput.addEventListener('input', () => {
    if (!fieldMode || bgColorInput.disabled) return;
    applyBackgroundColor(bgColorInput.value, { remember: false });
  });

  bgColorInput.addEventListener('change', () => {
    if (!fieldMode || bgColorInput.disabled) return;
    applyBackgroundColor(bgColorInput.value, { remember: true });
    closeBgColorPanel();
  });

  document.addEventListener('pointerdown', (e: any) => {
    if (bgColorPanel.hidden) return;
    if (bgColorControl.contains(e.target) || bgColorPanel.contains(e.target)) return;
    closeBgColorPanel();
  });

  window.addEventListener('resize', () => {
    if (!bgColorPanel.hidden) positionBgColorPanel();
  });

  window.addEventListener('scroll', () => {
    if (!bgColorPanel.hidden) positionBgColorPanel();
  }, true);

  document.addEventListener('keydown', (e: any) => {
    if (e.key === 'Escape' && !bgColorPanel.hidden) {
      closeBgColorPanel();
    }
  });

  fontSelect.addEventListener('change', () => {
    const isCustom = fontSelect.value === '__custom__';
    fontCustomInput.hidden = !isCustom;
    fontCustomInput.disabled = !isCustom || (!fieldMode && !activeEditable);
    if (isCustom) {
      fontCustomInput.focus();
      return;
    }
    applyFontAndSizeFromControls();
  });

  sizeInput.addEventListener('change', () => {
    applyFontAndSizeFromControls();
  });

  for (const input of [fontCustomInput, sizeInput]) {
    input.addEventListener('keydown', (e: any) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyFontAndSizeFromControls();
      }
    });
  }

  fontSelect.addEventListener('keydown', (e: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFontAndSizeFromControls();
    }
  });

  function show(editable: any) {
    fieldMode = null;
    activeEditable = editable;
    savedRange = saveSelection(editable);
    bar.classList.remove('rich-text-toolbar--field-style');
    setTextModeHint();
    setTextControlsEnabled(true);
    attachSelectionListener(editable);
    bar.classList.remove('rich-text-toolbar--inactive');
  }

  /**
   * @param {object} options
   * @param {() => import('../types.js').FieldDisplayStyle} [options.getResolvedStyle]
   * @param {() => import('../types.js').FieldDisplayStyle} [options.getOverrideStyle]
   * @param {() => import('../types.js').FieldDisplayStyle} [options.getGlobalDefault]
   * @param {(style: import('../types.js').FieldDisplayStyle) => void} [options.onStyleChange]
   * @param {() => void} [options.onClearStyle]
   * @param {string} [options.hint]
   */
  function showForField(options: any = {}) {
    activeEditable = null;
    savedRange = null;
    detachSelectionListener();
    fieldMode = options;
    bar.classList.add('rich-text-toolbar--field-style');
    setFieldModeHint(options.hint);
    setFieldControlsEnabled(true);
    refreshFieldModeControls();
    bar.classList.remove('rich-text-toolbar--inactive');
  }

  function clearFieldMode() {
    if (!fieldMode) return;
    fieldMode = null;
    bar.classList.remove('rich-text-toolbar--field-style');
    setTextModeHint();
    for (const btn of buttons) btn.classList.remove('rich-text-toolbar__btn--active');
    for (const btn of alignButtons) btn.classList.remove('rich-text-toolbar__btn--active');
  }

  function clearActive() {
    clearFieldMode();
    activeEditable = null;
    savedRange = null;
    setTextControlsEnabled(false);
    setAlignControlsVisible(false);
    detachSelectionListener();
    closeBgColorPanel();
    bar.classList.add('rich-text-toolbar--inactive');
  }

  function hide() {
    clearActive();
  }

  function attach(editable: any) {
    show(editable);
  }

  function isFieldModeActive() {
    return !!fieldMode;
  }

  clearActive();

  return {
    element: bar,
    show,
    showForField,
    hide,
    clearActive,
    clearFieldMode,
    attach,
    isFieldModeActive,
  };
}
