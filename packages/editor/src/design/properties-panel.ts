import { createSchemaEditorController } from './schema-editor-controller.js';
import { createDisplayStyleForm } from './display-style-form.js';
import { createFieldHighlightForm } from './field-highlight-form.js';
import { findFieldPlacement } from '../core/field-id.js';
import { parseCellFieldId } from '../core/field-schemas.js';
import { ACTION_ICONS } from '../ui/action-icons.js';
import { FORMAT_ICONS } from '../ui/format-icons.js';
import {
  normalizeCustomPageMm,
  resolvePageSetupFieldHighlightStyle,
  resolvePageSetupFieldValueStyle,
  resolvePageSetupTextStyle,
} from '../core/page-setup-styles.js';

function infoTipHtml(text: string) {
  const tip = String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<button type="button" class="schema-form__info-tip" title="${tip}" aria-label="More information">${FORMAT_ICONS.info}</button>`;
}

/**
 * Right-side properties panel for design mode.
 * @param {{ getRegistry?: () => import('../registry/schema-registry.js').SchemaRegistry, onSaveField?: (result: { fieldId: string, previousFieldId: string, schema: object }) => void | Promise<void>, onSaveSection?: (data: { blockIndex: number, name: string, label: string, repeatable?: boolean, hideTitleInPreview?: boolean, borderTop?: boolean, borderBottom?: boolean, eachRowOnNewPage?: boolean, sectionEl?: HTMLElement }) => void | Promise<void>, onSaveDocument?: (pageSetup: object) => void | Promise<void> }} options
 */
export function createPropertiesPanel({
  getRegistry,
  onSaveField,
  onSaveSection,
  onSaveColumns,
  onSaveDocument,
  onRepeaterTemplateChange,
  onOpenPageSetup,
  onLiveTableColumnWidths,
  getRemoteListCollections = null,
  getRemoteListLabelFields = null,
}: any = {}) {
  const root = document.createElement('div');
  root.className = 'properties-panel';

  const header = document.createElement('div');
  header.className = 'properties-panel__header';
  header.innerHTML = `
    <div class="properties-panel__header-row">
      <span class="properties-panel__title">Properties</span>
      <button type="button" class="btn properties-panel__setup-btn" data-action="open-page-setup" aria-label="Setup">
        <span class="properties-panel__setup-icon">${ACTION_ICONS.setup}</span>
        Setup
      </button>
    </div>
    <span class="properties-panel__subtitle" data-role="subtitle"></span>
  `;
  root.appendChild(header);

  const body = document.createElement('div');
  body.className = 'properties-panel__body';
  root.appendChild(body);

  const empty = document.createElement('div');
  empty.className = 'properties-panel__empty';
  empty.innerHTML = `
    <div class="properties-panel__empty-card">
      <span class="properties-panel__empty-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <path d="M8 8h8"/>
          <path d="M8 12h5"/>
          <path d="M8 16h3"/>
          <path d="m14.5 14.5 5.4 1.5-3.2 3.2"/>
        </svg>
      </span>
      <p class="properties-panel__empty-title">Nothing selected</p>
      <p class="properties-panel__empty-text">Select a field, section, or columns block to edit its properties.</p>
    </div>
  `;
  body.appendChild(empty);

  const fieldWrap = document.createElement('div');
  fieldWrap.className = 'properties-panel__field';
  fieldWrap.hidden = true;

  const fieldIdPreview = document.createElement('div');
  fieldIdPreview.className = 'properties-panel__field-id';
  fieldIdPreview.dataset.role = 'field-id-preview';
  fieldWrap.appendChild(fieldIdPreview);

  const fieldFormHost = document.createElement('div');
  fieldFormHost.className = 'properties-panel__field-form';
  fieldWrap.appendChild(fieldFormHost);

  body.appendChild(fieldWrap);

  const sectionWrap = document.createElement('div');
  sectionWrap.className = 'properties-panel__section';
  sectionWrap.hidden = true;
  sectionWrap.innerHTML = `
    <label class="schema-form__row">
      <span class="schema-form__label-row">
        <span>Section name</span>
        ${infoTipHtml('Used in document export and as the field ID prefix.')}
      </span>
      <input type="text" data-field="section-name" placeholder="Export key" />
    </label>
    <label class="schema-form__row">
      <span class="schema-form__label-row">
        <span>Section title</span>
        ${infoTipHtml('Shown as the section header in the document.')}
      </span>
      <input type="text" data-field="section-label" placeholder="Display title" />
    </label>
    <label class="schema-form__row schema-form__row--checkbox">
      <input type="checkbox" data-field="section-hide-title-in-preview" />
      <span class="schema-form__label-row">
        <span>Hide title in preview</span>
        ${infoTipHtml('When checked, the section title is hidden in document preview. The title remains available for export keys and the design editor.')}
      </span>
    </label>
    <label class="schema-form__row schema-form__row--checkbox">
      <input type="checkbox" data-field="section-border-top" />
      <span>Top border line</span>
    </label>
    <label class="schema-form__row schema-form__row--checkbox">
      <input type="checkbox" data-field="section-border-bottom" />
      <span class="schema-form__label-row">
        <span>Bottom border line</span>
        ${infoTipHtml('Draw a horizontal rule above and/or below this section in the editor, preview, and PDF.')}
      </span>
    </label>
    <label class="schema-form__row schema-form__row--checkbox">
      <input type="checkbox" data-field="section-repeatable" />
      <span class="schema-form__label-row">
        <span>Show on each page</span>
        ${infoTipHtml('When checked, this section\'s content becomes the PDF page header on every page. Long tables in this or the next section paginate with column headers on continuation pages. For multiple full section copies, use a document array in JSON import.')}
      </span>
    </label>
    <label class="schema-form__row schema-form__row--checkbox">
      <input type="checkbox" data-field="section-each-row-on-new-page" />
      <span class="schema-form__label-row">
        <span>Print each row on new page</span>
        ${infoTipHtml('When this section repeats from a mapped source array, start each row on a new PDF/print page. Off keeps all rows on one continuous flow.')}
      </span>
    </label>
    <label class="schema-form__row schema-form__row--checkbox">
      <input type="checkbox" data-field="section-visibility-enabled" />
      <span>Show/hide by field value</span>
    </label>
    <div data-role="section-visibility-fields">
      <label class="schema-form__row">
        <span>Action</span>
        <select data-field="section-visibility-mode">
          <option value="show">Show section when rule matches</option>
          <option value="hide">Hide section when rule matches</option>
        </select>
      </label>
      <label class="schema-form__row">
        <span>Field</span>
        <select data-field="section-visibility-field"></select>
      </label>
      <label class="schema-form__row">
        <span>Condition</span>
        <select data-field="section-visibility-operator">
          <option value="equals">Equals</option>
          <option value="notEquals">Does not equal</option>
          <option value="contains">Contains</option>
          <option value="notContains">Does not contain</option>
          <option value="empty">Is empty</option>
          <option value="notEmpty">Is not empty</option>
        </select>
      </label>
      <label class="schema-form__row" data-role="section-visibility-value-row">
        <span class="schema-form__label-row">
          <span>Value</span>
          ${infoTipHtml('The selected section is shown or hidden while filling, previewing, and exporting PDF.')}
        </span>
        <input type="text" data-field="section-visibility-value" placeholder="Field value or list item id" />
      </label>
    </div>
  `;
  body.appendChild(sectionWrap);

  const documentWrap = document.createElement('div');
  documentWrap.className = 'properties-panel__document';
  documentWrap.hidden = true;
  documentWrap.innerHTML = `
    <section class="properties-panel__card">
      <h3 class="properties-panel__card-title">Page</h3>
      <label class="schema-form__row">
        <span>Page size</span>
        <select data-field="page-format">
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label class="schema-form__row properties-panel__custom-page-size" hidden>
        <span>Width (mm)</span>
        <input type="number" data-field="page-width-mm" min="20" max="1200" step="1" placeholder="210" />
      </label>
      <label class="schema-form__row properties-panel__custom-page-size" hidden>
        <span>Height (mm)</span>
        <input type="number" data-field="page-height-mm" min="20" max="1200" step="1" placeholder="297" />
      </label>
      <label class="schema-form__row">
        <span>Orientation</span>
        <select data-field="page-orientation">
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label class="schema-form__row">
        <span>Margin (mm)</span>
        <input type="number" data-field="page-margin" min="0" step="1" placeholder="15" />
      </label>
    </section>
    <section class="properties-panel__card">
      <h3 class="properties-panel__card-title">PDF &amp; footer</h3>
      <label class="schema-form__row">
        <span>PDF title</span>
        <input type="text" data-field="page-title" placeholder="Document title" />
      </label>
      <label class="schema-form__row">
        <span>Footer text</span>
        <input type="text" data-field="page-footer-text" placeholder="Optional footer" />
      </label>
      <label class="schema-form__row schema-form__row--checkbox">
        <input type="checkbox" data-field="page-footer-numbers" />
        <span>Show page numbers</span>
      </label>
    </section>
    <section class="properties-panel__card">
      <h3 class="properties-panel__card-title">
        <span>Fill mode</span>
        ${infoTipHtml('When checked, Backspace, Delete, area selection delete, and Cut cannot remove field placeholders while filling the document.')}
      </h3>
      <label class="schema-form__row schema-form__row--checkbox">
        <input type="checkbox" data-field="page-protect-fields" />
        <span>Protect fields in fill mode</span>
      </label>
    </section>
    <div class="properties-panel__style-forms" data-role="style-forms"></div>
  `;
  body.appendChild(documentWrap);

  const styleFormsHost = documentWrap.querySelector('[data-role="style-forms"]');
  const textStyleForm = createDisplayStyleForm({
    legend: 'Default text style',
  });
  const valueStyleForm = createDisplayStyleForm({
    legend: 'Default value style',
  });
  const fieldHighlightForm = createFieldHighlightForm();
  styleFormsHost.appendChild(textStyleForm.element);
  styleFormsHost.appendChild(valueStyleForm.element);
  styleFormsHost.appendChild(fieldHighlightForm.element);

  const columnsWrap = document.createElement('div');
  columnsWrap.className = 'properties-panel__columns';
  columnsWrap.hidden = true;
  columnsWrap.innerHTML = `
    <label class="schema-form__row">
      <span>Layout preset</span>
      <select data-field="columns-preset">
        <option value="equal">Equal (50/50)</option>
        <option value="wide-left">Wide left (2:1)</option>
        <option value="wide-right">Wide right (1:2)</option>
        <option value="custom">Custom</option>
      </select>
    </label>
    <label class="schema-form__row properties-panel__column-width">
      <span>Left column width</span>
      <input type="text" data-field="column-width-0" placeholder="1fr, 50%, 200px" />
    </label>
    <label class="schema-form__row properties-panel__column-width">
      <span class="schema-form__label-row">
        <span>Right column width</span>
        ${infoTipHtml('Use CSS grid track sizes (e.g. 1fr, 50%, 200px). Leave blank for equal columns.')}
      </span>
      <input type="text" data-field="column-width-1" placeholder="1fr, 50%, 200px" />
    </label>
  `;
  body.appendChild(columnsWrap);

  const subtitleEl = header.querySelector('[data-role="subtitle"]');

  let mode = 'empty';
  let sectionBlockIndex = -1;
  let sectionTarget: any = null;
  let columnsTarget: any = null;
  let suppressPersist = false;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let persistInFlight: Promise<unknown> | null = null;
  let persistEpoch = 0;

  const fieldController = createSchemaEditorController({
    getRegistry,
    body: fieldFormHost,
    idPreviewEl: fieldIdPreview,
    onRepeaterTemplateChange,
    getRemoteListCollections,
    getRemoteListLabelFields,
    onPersistRequest: async () => {
      if (mode !== 'field') return;
      await persistCurrent();
    },
  });

  const pageFormatSelect = documentWrap.querySelector('[data-field="page-format"]') as HTMLSelectElement | null;
  const pageWidthMmInput = documentWrap.querySelector('[data-field="page-width-mm"]') as HTMLInputElement | null;
  const pageHeightMmInput = documentWrap.querySelector('[data-field="page-height-mm"]') as HTMLInputElement | null;
  const customPageSizeRows = documentWrap.querySelectorAll('.properties-panel__custom-page-size');

  const NAMED_PAGE_PORTRAIT_MM: Record<string, { widthMm: number; heightMm: number }> = {
    a4: { widthMm: 210, heightMm: 297 },
    letter: { widthMm: 215.9, heightMm: 279.4 },
  };

  function syncCustomPageSizeInputs() {
    const isCustom = String(pageFormatSelect?.value ?? 'a4').toLowerCase() === 'custom';
    for (const row of customPageSizeRows) {
      (row as HTMLElement).hidden = !isCustom;
    }
  }

  pageFormatSelect?.addEventListener('change', () => {
    const format = String(pageFormatSelect.value ?? 'a4').toLowerCase();
    if (format === 'custom') {
      const prev = String(pageFormatSelect.dataset.prevFormat ?? 'a4').toLowerCase();
      const named = NAMED_PAGE_PORTRAIT_MM[prev] ?? NAMED_PAGE_PORTRAIT_MM.a4;
      if (pageWidthMmInput) pageWidthMmInput.value = String(named.widthMm);
      if (pageHeightMmInput) pageHeightMmInput.value = String(named.heightMm);
    }
    pageFormatSelect.dataset.prevFormat = format;
    syncCustomPageSizeInputs();
  });

  const presetSelect = columnsWrap.querySelector('[data-field="columns-preset"]');
  const widthInputs = [
    columnsWrap.querySelector('[data-field="column-width-0"]'),
    columnsWrap.querySelector('[data-field="column-width-1"]'),
  ];
  const widthRows = columnsWrap.querySelectorAll('.properties-panel__column-width');
  const sectionVisibilityEnabled = sectionWrap.querySelector('[data-field="section-visibility-enabled"]');
  const sectionVisibilityFields = sectionWrap.querySelector('[data-role="section-visibility-fields"]');
  const sectionVisibilityMode = sectionWrap.querySelector('[data-field="section-visibility-mode"]');
  const sectionVisibilityField = sectionWrap.querySelector('[data-field="section-visibility-field"]');
  const sectionVisibilityOperator = sectionWrap.querySelector('[data-field="section-visibility-operator"]');
  const sectionVisibilityValue = sectionWrap.querySelector('[data-field="section-visibility-value"]');
  const sectionVisibilityValueRow = sectionWrap.querySelector('[data-role="section-visibility-value-row"]');

  const PRESET_WIDTHS = {
    equal: ['', ''],
    'wide-left': ['2fr', '1fr'],
    'wide-right': ['1fr', '2fr'],
  };

  function detectColumnsPreset(widths: any) {
    const w0 = String(widths?.[0] ?? '').trim();
    const w1 = String(widths?.[1] ?? '').trim();
    if (!w0 && !w1) return 'equal';
    if (w0 === '2fr' && w1 === '1fr') return 'wide-left';
    if (w0 === '1fr' && w1 === '2fr') return 'wide-right';
    if (w0 === '1fr' && w1 === '1fr') return 'equal';
    return 'custom';
  }

  function syncColumnsWidthInputs() {
    const preset = presetSelect?.value ?? 'equal';
    const isCustom = preset === 'custom';
    for (const row of widthRows) {
      row.hidden = !isCustom;
    }
    if (!isCustom) {
      const widths = PRESET_WIDTHS[preset] ?? ['', ''];
      widthInputs[0].value = widths[0];
      widthInputs[1].value = widths[1];
    }
  }

  presetSelect?.addEventListener('change', syncColumnsWidthInputs);

  function fieldBelongsToSection(fieldId: string, blocks: any[], blockIndex: number, schemas: any) {
    if (blockIndex < 0) return false;
    const placement = findFieldPlacement(fieldId, blocks);
    if (placement.blockIndex === blockIndex) return true;
    const cell = parseCellFieldId(fieldId, schemas);
    if (!cell) return false;
    return findFieldPlacement(cell.tableFieldId, blocks).blockIndex === blockIndex;
  }

  function listVisibilityFields() {
    const registry = getRegistry?.();
    const schemas = registry?.getFieldSchemas?.() ?? {};
    const blocks = registry?.getBlocks?.() ?? [];
    return Object.entries(schemas)
      .filter(([id]) => !fieldBelongsToSection(id, blocks, sectionBlockIndex, schemas))
      .map(([id, schema]: any) => ({
        id,
        label: schema?.label || schema?.name || id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function populateSectionVisibilityFields(selectedFieldId: any = '') {
    if (!sectionVisibilityField) return;
    const fields = listVisibilityFields();
    sectionVisibilityField.innerHTML = '<option value="">Select field</option>';
    for (const field of fields) {
      const option = document.createElement('option');
      option.value = field.id;
      option.textContent = field.label === field.id ? field.id : `${field.label} (${field.id})`;
      sectionVisibilityField.appendChild(option);
    }
    sectionVisibilityField.value = selectedFieldId ?? '';
  }

  function syncSectionVisibilityControls() {
    const enabled = !!sectionVisibilityEnabled?.checked;
    if (sectionVisibilityFields) sectionVisibilityFields.hidden = !enabled;
    const operator = sectionVisibilityOperator?.value ?? 'equals';
    if (sectionVisibilityValueRow) {
      sectionVisibilityValueRow.hidden = !enabled || operator === 'empty' || operator === 'notEmpty';
    }
  }

  function readSectionVisibilityRule() {
    if (!sectionVisibilityEnabled?.checked) return null;
    const fieldId = sectionVisibilityField?.value?.trim() ?? '';
    if (!fieldId) return null;
    const operator = sectionVisibilityOperator?.value ?? 'equals';
    const rule: any = {
      fieldId,
      mode: sectionVisibilityMode?.value === 'hide' ? 'hide' : 'show',
      operator,
    };
    if (operator !== 'empty' && operator !== 'notEmpty') {
      rule.value = sectionVisibilityValue?.value ?? '';
    }
    return rule;
  }

  sectionVisibilityEnabled?.addEventListener('change', syncSectionVisibilityControls);
  sectionVisibilityOperator?.addEventListener('change', syncSectionVisibilityControls);

  function setSubtitle(text: any) {
    if (subtitleEl) subtitleEl.textContent = text ?? '';
  }

  function hideAllPanels() {
    empty.hidden = true;
    fieldWrap.hidden = true;
    sectionWrap.hidden = true;
    columnsWrap.hidden = true;
    documentWrap.hidden = true;
  }

  function withSuppressedPersist(fn: () => void) {
    suppressPersist = true;
    try {
      fn();
    } finally {
      suppressPersist = false;
    }
  }

  function showEmpty() {
    mode = 'empty';
    sectionBlockIndex = -1;
    sectionTarget = null;
    columnsTarget = null;
    hideAllPanels();
    empty.hidden = false;
    setSubtitle('');
    fieldController.clear();
  }

  function showField(fieldId: any,schema: any,context: any = {}) {
    mode = 'field';
    sectionBlockIndex = -1;
    sectionTarget = null;
    columnsTarget = null;
    hideAllPanels();
    fieldWrap.hidden = false;
    setSubtitle('Field');
    withSuppressedPersist(() => fieldController.load(fieldId, schema, context));
  }

  function showSection(blockIndex: any,data: any,sectionEl: any) {
    mode = 'section';
    sectionBlockIndex = blockIndex;
    sectionTarget = sectionEl ?? null;
    columnsTarget = null;
    hideAllPanels();
    sectionWrap.hidden = false;
    setSubtitle('Section');
    fieldController.clear();

    withSuppressedPersist(() => {
      sectionWrap.querySelector('[data-field="section-name"]').value = data.name ?? '';
      sectionWrap.querySelector('[data-field="section-label"]').value = data.label ?? '';
      sectionWrap.querySelector('[data-field="section-repeatable"]').checked = !!data.repeatable;
      sectionWrap.querySelector('[data-field="section-hide-title-in-preview"]').checked =
        !!data.hideTitleInPreview;
      sectionWrap.querySelector('[data-field="section-border-top"]').checked = !!data.borderTop;
      sectionWrap.querySelector('[data-field="section-border-bottom"]').checked =
        !!data.borderBottom;
      sectionWrap.querySelector('[data-field="section-each-row-on-new-page"]').checked =
        !!data.eachRowOnNewPage;
      const visibility = data.visibility ?? null;
      populateSectionVisibilityFields(visibility?.fieldId ?? '');
      sectionVisibilityEnabled.checked = !!visibility?.fieldId;
      sectionVisibilityMode.value = visibility?.mode === 'hide' ? 'hide' : 'show';
      sectionVisibilityOperator.value = visibility?.operator ?? 'equals';
      sectionVisibilityValue.value = visibility?.value != null ? String(visibility.value) : '';
      syncSectionVisibilityControls();
    });
  }

  function showDocument(pageSetup: any = {}) {
    mode = 'document';
    sectionBlockIndex = -1;
    sectionTarget = null;
    columnsTarget = null;
    hideAllPanels();
    documentWrap.hidden = false;
    setSubtitle('Setup');
    fieldController.clear();

    withSuppressedPersist(() => {
      const format = String(pageSetup.format ?? 'a4').toLowerCase();
      const formatValue = format === 'custom' || format === 'letter' ? format : 'a4';
      if (pageFormatSelect) {
        pageFormatSelect.value = formatValue;
        pageFormatSelect.dataset.prevFormat = formatValue;
      }
      documentWrap.querySelector('[data-field="page-orientation"]').value =
        String(pageSetup.orientation ?? 'portrait').toLowerCase() === 'landscape'
          ? 'landscape'
          : 'portrait';
      if (pageWidthMmInput) {
        pageWidthMmInput.value =
          pageSetup.widthMm != null && Number.isFinite(Number(pageSetup.widthMm))
            ? String(pageSetup.widthMm)
            : '210';
      }
      if (pageHeightMmInput) {
        pageHeightMmInput.value =
          pageSetup.heightMm != null && Number.isFinite(Number(pageSetup.heightMm))
            ? String(pageSetup.heightMm)
            : '297';
      }
      syncCustomPageSizeInputs();
      documentWrap.querySelector('[data-field="page-margin"]').value =
        pageSetup.margin != null ? String(pageSetup.margin) : '';
      documentWrap.querySelector('[data-field="page-title"]').value = pageSetup.title ?? '';
      documentWrap.querySelector('[data-field="page-footer-text"]').value =
        pageSetup.footer?.text ?? '';
      documentWrap.querySelector('[data-field="page-footer-numbers"]').checked =
        !!pageSetup.footer?.showPageNumbers;
      documentWrap.querySelector('[data-field="page-protect-fields"]').checked =
        pageSetup.protectFieldsInFillMode !== false;
      // Show resolved defaults (Inter / 16px / #000, highlight blue, etc.), not blank overrides.
      textStyleForm.setStyle(resolvePageSetupTextStyle(pageSetup));
      valueStyleForm.setStyle(resolvePageSetupFieldValueStyle(pageSetup).default);
      fieldHighlightForm.setStyle(resolvePageSetupFieldHighlightStyle(pageSetup));
    });
  }

  function showColumns(columnsEl: any,data: any = {}) {
    mode = 'columns';
    sectionBlockIndex = -1;
    sectionTarget = null;
    columnsTarget = columnsEl ?? null;
    hideAllPanels();
    columnsWrap.hidden = false;
    setSubtitle('Columns');
    fieldController.clear();

    withSuppressedPersist(() => {
      const widths = data.widths ?? ['', ''];
      const preset = detectColumnsPreset(widths);
      presetSelect.value = preset;
      widthInputs[0].value = widths[0] ?? '';
      widthInputs[1].value = widths[1] ?? '';
      syncColumnsWidthInputs();
    });
  }

  async function persistCurrent() {
    const epoch = persistEpoch;
    if (mode === 'field') {
      const result = fieldController.trySave();
      if (!result) return false;
      if (epoch !== persistEpoch) return false;
      await onSaveField?.(result);
      return epoch === persistEpoch;
    }

    if (mode === 'section' && sectionBlockIndex >= 0) {
      const name = sectionWrap.querySelector('[data-field="section-name"]')?.value?.trim() ?? '';
      const label = sectionWrap.querySelector('[data-field="section-label"]')?.value?.trim() ?? '';
      const repeatable = !!sectionWrap.querySelector('[data-field="section-repeatable"]')?.checked;
      const hideTitleInPreview = !!sectionWrap.querySelector(
        '[data-field="section-hide-title-in-preview"]',
      )?.checked;
      const borderTop = !!sectionWrap.querySelector('[data-field="section-border-top"]')?.checked;
      const borderBottom = !!sectionWrap.querySelector(
        '[data-field="section-border-bottom"]',
      )?.checked;
      const eachRowOnNewPage = !!sectionWrap.querySelector(
        '[data-field="section-each-row-on-new-page"]',
      )?.checked;
      const visibility = readSectionVisibilityRule();
      await onSaveSection?.({
        blockIndex: sectionBlockIndex,
        name,
        label,
        repeatable,
        hideTitleInPreview,
        borderTop,
        borderBottom,
        eachRowOnNewPage,
        visibility,
        sectionEl: sectionTarget,
      });
      return true;
    }

    if (mode === 'document') {
      const marginRaw = documentWrap.querySelector('[data-field="page-margin"]')?.value?.trim() ?? '';
      const margin = marginRaw === '' ? undefined : Number(marginRaw);
      const footerText =
        documentWrap.querySelector('[data-field="page-footer-text"]')?.value?.trim() ?? '';
      const showPageNumbers = !!documentWrap.querySelector('[data-field="page-footer-numbers"]')?.checked;
      const protectFieldsInFillMode =
        !!documentWrap.querySelector('[data-field="page-protect-fields"]')?.checked;

      const formatRaw = String(
        documentWrap.querySelector('[data-field="page-format"]')?.value ?? 'a4',
      ).toLowerCase();
      const format =
        formatRaw === 'custom' || formatRaw === 'letter' ? formatRaw : 'a4';
      const pageSetup: any = {
        format,
        orientation:
          documentWrap.querySelector('[data-field="page-orientation"]')?.value === 'landscape'
            ? 'landscape'
            : 'portrait',
        protectFieldsInFillMode,
      };
      if (format === 'custom') {
        const widthRaw = pageWidthMmInput?.value?.trim() ?? '';
        const heightRaw = pageHeightMmInput?.value?.trim() ?? '';
        pageSetup.widthMm = normalizeCustomPageMm(widthRaw === '' ? 210 : Number(widthRaw), 210);
        pageSetup.heightMm = normalizeCustomPageMm(heightRaw === '' ? 297 : Number(heightRaw), 297);
      }
      if (margin != null && !Number.isNaN(margin)) pageSetup.margin = margin;
      const title = documentWrap.querySelector('[data-field="page-title"]')?.value?.trim() ?? '';
      if (title) pageSetup.title = title;
      if (footerText || showPageNumbers) {
        pageSetup.footer = {
          ...(footerText ? { text: footerText } : {}),
          ...(showPageNumbers ? { showPageNumbers: true } : {}),
        };
      }
      const textStyle = textStyleForm.readStyle();
      const valueStyle = valueStyleForm.readStyle();
      if (textStyle) pageSetup.textStyle = textStyle;
      else delete pageSetup.textStyle;
      if (valueStyle) pageSetup.valueStyle = valueStyle;
      else delete pageSetup.valueStyle;
      const fieldHighlight = fieldHighlightForm.readStyle();
      if (fieldHighlight) pageSetup.fieldHighlight = fieldHighlight;
      else delete pageSetup.fieldHighlight;
      await onSaveDocument?.(pageSetup);
      return true;
    }

    if (mode === 'columns' && columnsTarget) {
      const preset = presetSelect?.value ?? 'equal';
      let widths: any;
      if (preset === 'custom') {
        widths = [
          widthInputs[0]?.value?.trim() ?? '',
          widthInputs[1]?.value?.trim() ?? '',
        ];
      } else {
        widths = PRESET_WIDTHS[preset] ?? ['', ''];
      }
      await onSaveColumns?.({ columnsEl: columnsTarget, widths });
      return true;
    }

    return true;
  }

  function schedulePersist(immediate = false) {
    if (suppressPersist) return;
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    const epoch = persistEpoch;
    const run = () => {
      persistTimer = null;
      if (epoch !== persistEpoch) return;
      const task = Promise.resolve()
        .then(() => persistCurrent())
        .catch(() => {})
        .finally(() => {
          if (persistInFlight === task) persistInFlight = null;
        });
      persistInFlight = task;
    };

    if (immediate) {
      run();
      return;
    }
    persistTimer = setTimeout(run, 300);
  }

  function wireAutoPersist(panel: HTMLElement, options: { textOnBlur?: boolean } = {}) {
    panel.addEventListener('change', () => schedulePersist(true));
    if (options.textOnBlur) {
      panel.addEventListener('focusout', (e: any) => {
        const target = e.target;
        if (
          !target?.matches?.(
            'input[type="text"], input[type="number"], input:not([type]), textarea',
          )
        ) {
          return;
        }
        // Staying inside the formula picker (tree / wrap buttons / search) must
        // not persist+reload — that races with field-reference insertion.
        const next = e.relatedTarget as Node | null;
        if (next && panel.contains(next) && (next as Element).closest?.('.formula-field-picker')) {
          return;
        }
        schedulePersist(true);
      });
    } else {
      panel.addEventListener('input', () => schedulePersist(false));
    }
    panel.addEventListener('click', (e: any) => {
      if (e.target?.closest?.('button[data-command], .display-style-form__reset')) {
        schedulePersist(true);
      }
    });
  }

  // Section/name changes can reinit the editor — persist on blur/change, not each keystroke.
  wireAutoPersist(sectionWrap, { textOnBlur: true });
  wireAutoPersist(documentWrap);
  wireAutoPersist(columnsWrap);
  wireAutoPersist(fieldFormHost, { textOnBlur: true });

  fieldFormHost.addEventListener('input', (event: any) => {
    if (suppressPersist) return;
    if (mode !== 'field') return;
    if (!event.target?.matches?.('[data-field="columnWidths"]')) return;
    const fieldId = fieldController.getCurrentFieldId();
    const columns = fieldController.applyColumnWidthsInput?.(event.target.value);
    if (fieldId && columns) onLiveTableColumnWidths?.(fieldId, columns);
  });

  header.querySelector('[data-action="open-page-setup"]')?.addEventListener('click', () => {
    if (onOpenPageSetup) {
      onOpenPageSetup();
      return;
    }
    showDocument();
  });

  return {
    element: root,
    showEmpty,
    showField,
    showSection,
    showColumns,
    showDocument,
    getMode: () => mode,
    getCurrentFieldId: () => fieldController.getCurrentFieldId(),
    isFieldLoaded: () => fieldController.isLoaded(),
    cancelPersist() {
      persistEpoch += 1;
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
    },
    syncTableColumnWidths(fieldId: any, columns: any) {
      if (mode !== 'field') return false;
      if (fieldController.getCurrentFieldId() !== fieldId) return false;
      withSuppressedPersist(() => fieldController.syncTableColumnWidths?.(columns));
      return true;
    },
    syncTableColumns(fieldId: any, columns: any) {
      if (mode !== 'field') return false;
      if (fieldController.getCurrentFieldId() !== fieldId) return false;
      withSuppressedPersist(() => fieldController.syncTableColumns?.(columns));
      return true;
    },
    commitLiveTableColumnWidths(fieldId: any) {
      if (mode !== 'field') return null;
      if (fieldController.getCurrentFieldId() !== fieldId) return null;
      return fieldController.applyColumnWidthsInputFromDom?.() ?? null;
    },
    /** Persist the open properties form (used before leaving design mode). */
    async flush() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (persistInFlight) await persistInFlight;
      return persistCurrent();
    },
  };
}
