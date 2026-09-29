import { applyFontFormatting, execRichTextCommand, saveSelection } from '../fields/rich-text.js';
import {
  normalizeFieldDisplayStyle,
} from '../fields/field-display-style.js';
import { FORMAT_ICONS } from './format-icons.js';
import { ACTION_ICONS } from './action-icons.js';
import {
  createFontSizeSpinInput,
  readFontSizeSpinValue,
  setFontSizeSpinValue,
} from '../design/style-toolbar-shared.js';

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
  } else {
    fontSelect.value = '__custom__';
    fontCustomInput.hidden = false;
    fontCustomInput.disabled = false;
    fontCustomInput.value = fontFamily;
  }
}

export function createRichTextToolbar({ onPreview = null }: { onPreview?: (() => void) | null } = {}) {
  const bar = document.createElement('div');
  bar.className = 'rich-text-toolbar';

  const hint = document.createElement('span');
  hint.className = 'rich-text-toolbar__hint';
  hint.textContent = 'Select text in the document, then apply formatting.';

  let activeEditable: any = null;
  let savedRange: any = null;
  let selectionListener: any = null;
  let fieldMode: any = null;
  let previewHandler: (() => void) | null = onPreview ?? null;
  const buttons: any[] = [];
  const alignButtons: any[] = [];
  const commandButtons = new Map();

  const btnPreview = document.createElement('button');
  btnPreview.type = 'button';
  btnPreview.className = 'btn btn-sm rich-text-toolbar__preview';
  btnPreview.innerHTML = `${ACTION_ICONS.preview}<span>Preview</span>`;
  btnPreview.title = 'Preview document';
  btnPreview.setAttribute('aria-label', 'Preview document');
  btnPreview.hidden = !previewHandler;
  btnPreview.addEventListener('click', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    previewHandler?.();
  });
  bar.appendChild(btnPreview);

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
    if (!enabled) {
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
    // Don't suppress Preview — preventDefault on mousedown can block its click under LWS.
    if (e.target.closest('.rich-text-toolbar__preview')) return;
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

  function setOnPreview(handler: (() => void) | null) {
    previewHandler = handler;
    btnPreview.hidden = !handler;
  }

  function setPreviewBusy(busy: any) {
    btnPreview.disabled = !!busy;
    btnPreview.title = busy ? 'Generating preview…' : 'Preview document';
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
    setOnPreview,
    setPreviewBusy,
  };
}
