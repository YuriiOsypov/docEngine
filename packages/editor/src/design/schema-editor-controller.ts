import { getFieldTypes } from './field-palette.js';
import { getFieldHandler } from '../fields/handlers/registry.js';
import { convertSchemaType, buildTableColumnsFromLabels, isCellFieldId, normalizeStoredColumnWidth } from '../core/field-schemas.js';
import {
  parseRepeaterTemplateImport,
  applyRepeaterTemplateImport,
} from '../core/repeater-io.js';
import {
  deriveFieldId,
  isFieldNameTakenInSection,
  ROOT_SECTION_KEY,
} from '../core/field-id.js';
import { detectCircularDependency } from '../core/computed-formula.js';
import { renderFormulaFieldPicker } from './formula-field-picker.js';
import { renderCollectionTreePicker } from './collection-tree-picker.js';
import { getSchemaItemsDesignerModal } from './schema-items-designer-modal.js';
import {
  countTreeNodes,
  normalizeListItems,
  normalizeTreeNodes,
} from './schema-items-designer.js';
import { FORMAT_ICONS } from '../ui/format-icons.js';

/** Compact (i) tip; full help text lives in the native title tooltip. */
function infoTipHtml(text: string) {
  const tip = escapeAttr(text);
  return `<button type="button" class="schema-form__info-tip" title="${tip}" aria-label="More information">${FORMAT_ICONS.info}</button>`;
}

/**
 * Shared field-schema form logic for modal and side-panel editors.
 * @param {{ getRegistry?: () => import('../registry/schema-registry.js').SchemaRegistry, body: HTMLElement, idPreviewEl?: HTMLElement | null }} options
 */
export function createSchemaEditorController({
  getRegistry,
  body,
  idPreviewEl = null,
  onRepeaterTemplateChange = null,
  getRemoteListCollections = null,
  getRemoteListLabelFields = null,
  /** Called after remote/list source edits so the host can persist without waiting for Save. */
  onPersistRequest = null,
}: any = {}) {
  if (!body) throw new Error('createSchemaEditorController: body is required');
  const itemsDesignerModal = getSchemaItemsDesignerModal();
  let currentFieldId = '';
  let currentSchema: any = null;
  let editingCellField = false;
  /** @type {Array<{ id: string, label: string }>} */
  let manualListItems: any[] = [];
  /** @type {Array<{ id: string, label: string, children?: unknown[] }>} */
  let manualTreeNodes: any[] = [];
  let editorContext = {
    sectionName: ROOT_SECTION_KEY,
    sectionLabel: ROOT_SECTION_KEY,
    blocks: [],
    fieldSchemas: {},
  };

  function registry() {
    return getRegistry?.() ?? null;
  }

  function catalogs() {
    return registry()?.catalogs ?? null;
  }

  function clear() {
    body.innerHTML = '';
    manualListItems = [];
    manualTreeNodes = [];
    currentFieldId = '';
    currentSchema = null;
    if (idPreviewEl) idPreviewEl.textContent = '';
  }

  function renderDesignerLaunchPanel(container: any,{ mode, getSummary, getOpenPayload, onApply }: any) {
    const panel = document.createElement('div');
    panel.className = 'schema-designer-launch';

    const summary = document.createElement('p');
    summary.className = 'schema-form__hint schema-designer-launch__summary';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-primary';
    btn.textContent = mode === 'tree' ? 'Edit tree…' : 'Edit options…';

    function refreshSummary() {
      summary.textContent = getSummary();
    }

    btn.addEventListener('click', async () => {
      try {
        const result = await itemsDesignerModal.open({
          mode,
          ...getOpenPayload(),
        });
        onApply(result);
        refreshSummary();
      } catch {
        // cancelled
      }
    });

    panel.appendChild(summary);
    panel.appendChild(btn);
    container.appendChild(panel);
    refreshSummary();
    return { refreshSummary };
  }

  function renderCommonListSelector(container: any,schema: any,onChange: any) {
    const lists = catalogs()?.listCommonValueLists() ?? [];
    const currentId = schema.commonListId ?? '';
    const knownIds = new Set(lists.map((entry: any) => entry.id));
    const orphanSelected = currentId && !knownIds.has(currentId);

    const row = document.createElement('label');
    row.className = 'schema-form__row';
    const options = [
      `<option value=""${!currentId ? ' selected' : ''}>Select a value list…</option>`,
      ...(orphanSelected
        ? [`<option value="${escapeAttr(currentId)}" selected>${escapeAttr(currentId)} (missing)</option>`]
        : []),
      ...lists.map(
        (entry: any) =>
          `<option value="${entry.id}"${currentId === entry.id ? ' selected' : ''}>${escapeAttr(entry.label)} (${entry.itemCount})</option>`,
      ),
    ].join('');
    row.innerHTML = `
      <span>Value list</span>
      <select data-field="commonListId">${options}</select>
    `;
    container.appendChild(row);
    row.querySelector('[data-field="commonListId"]')?.addEventListener('change', (e: any) => {
      onChange(e.target.value);
    });
    return row;
  }

  function renderCommonListPreview(container: any,listId: any) {
    const preview = document.createElement('div');
    preview.className = 'schema-common-list-preview';
    const list = catalogs()?.getList(listId);
    if (list) {
      const sample = (list.items ?? []).slice(0, 5).map((item: any) => item.label).join(', ');
      const more = list.items.length > 5 ? ` … +${list.items.length - 5} more` : '';
      const codeNote = list.withCode ? ' (with codes)' : '';
      preview.innerHTML = `
        <p class="schema-form__hint">${escapeAttr(list.label)} — ${list.items.length} options${codeNote}</p>
        <p class="schema-common-list-preview__sample">${escapeAttr(sample)}${more}</p>
      `;
    }
    container.appendChild(preview);
    return preview;
  }

  function renderCommonTreeSelector(container: any,schema: any,onChange: any) {
    const trees = catalogs()?.listCommonValueTrees() ?? [];
    const currentId = schema.commonTreeId ?? '';

    const row = document.createElement('label');
    row.className = 'schema-form__row';
    const options = [
      `<option value=""${!currentId ? ' selected' : ''}>Custom (manual)</option>`,
      ...trees.map(
        (entry: any) =>
          `<option value="${entry.id}"${currentId === entry.id ? ' selected' : ''}>${escapeAttr(entry.label)} (${entry.nodeCount} nodes)</option>`,
      ),
    ].join('');
    row.innerHTML = `
      <span>Value tree</span>
      <select data-field="commonTreeId">${options}</select>
    `;
    container.appendChild(row);
    row.querySelector('[data-field="commonTreeId"]')?.addEventListener('change', (e: any) => {
      onChange(e.target.value);
    });
    return row;
  }

  function renderCommonTreePreview(container: any,treeId: any) {
    const preview = document.createElement('div');
    preview.className = 'schema-common-list-preview';
    const entry = catalogs()?.getTree(treeId);
    if (entry) {
      const meta = catalogs()?.listCommonValueTrees()?.find((t: any) => t.id === treeId);
      const roots = (meta?.rootLabels ?? []).slice(0, 6).join(', ');
      const more = (meta?.rootLabels?.length ?? 0) > 6 ? ` … +${meta.rootLabels.length - 6} more` : '';
      preview.innerHTML = `
        <p class="schema-form__hint">${escapeAttr(entry.label)} — ${meta?.nodeCount ?? 0} nodes</p>
        <p class="schema-common-list-preview__sample">${escapeAttr(roots)}${more}</p>
      `;
    }
    container.appendChild(preview);
    return preview;
  }

  function renderTreeOptions(extra: any,schema: any) {
    const treeHost = document.createElement('div');
    treeHost.className = 'schema-tree-options';
    extra.appendChild(treeHost);

    function refreshTreeArea() {
      treeHost.innerHTML = '';
      const treeId = extra.querySelector('[data-field="commonTreeId"]')?.value ?? '';

      if (treeId) {
        const title = document.createElement('div');
        title.className = 'schema-form__subtitle';
        title.textContent = 'Catalog tree';
        treeHost.appendChild(title);
        renderCommonTreePreview(treeHost, treeId);
        return;
      }

      const title = document.createElement('div');
      title.className = 'schema-form__subtitle';
      title.textContent = 'Tree';
      treeHost.appendChild(title);
      renderDesignerLaunchPanel(treeHost, {
        mode: 'tree',
        getSummary: () => {
          const count = countTreeNodes(manualTreeNodes);
          return count
            ? `${count} node${count === 1 ? '' : 's'} configured.`
            : 'No tree nodes yet.';
        },
        getOpenPayload: () => ({ tree: manualTreeNodes }),
        onApply: (result: any) => {
          manualTreeNodes = normalizeTreeNodes(result.tree ?? []);
        },
      });
    }

    renderCommonTreeSelector(extra, schema, () => refreshTreeArea());
    refreshTreeArea();
  }

  function getListSourceMode(schema: any) {
    if (schema.listSource === 'remote') return 'remote';
    if (schema.commonListId) return 'catalog';
    return 'manual';
  }

  function renderRemoteListOptions(optionsHost: any,schema: any) {
    const activeSchema = currentSchema ?? schema;
    const hint = document.createElement('p');
    hint.className = 'schema-form__hint';
    hint.textContent = getRemoteListCollections
      ? 'Pick a collection from bookmarks or the tree. Options load when users search at fill time.'
      : 'Options load when the user searches. Provide collections via remoteListCollections on createEditor().';
    optionsHost.appendChild(hint);

    const collectionHost = document.createElement('div');
    collectionHost.className = 'schema-form__row schema-form__row--stacked';
    const collectionLabel = document.createElement('span');
    collectionLabel.textContent = 'Source collection';
    collectionHost.appendChild(collectionLabel);

    const pickerMount = document.createElement('div');
    pickerMount.className = 'schema-remote-collection-picker';
    collectionHost.appendChild(pickerMount);
    optionsHost.appendChild(collectionHost);

    const labelFieldRow = document.createElement('label');
    labelFieldRow.className = 'schema-form__row';
    labelFieldRow.innerHTML = `
      <span>Label field</span>
      <select data-field="sourceLabelField" disabled>
        <option value="">Select collection first…</option>
      </select>
    `;
    optionsHost.appendChild(labelFieldRow);

    const codeRow = document.createElement('label');
    codeRow.className = 'schema-form__row schema-form__row--checkbox';
    codeRow.innerHTML = `
      <input type="checkbox" data-field="withCode"${activeSchema.withCode ? ' checked' : ''} />
      <span>Show codes in picker</span>
    `;
    optionsHost.appendChild(codeRow);

    const labelFieldSelect = labelFieldRow.querySelector('[data-field="sourceLabelField"]');
    let _collectionPicker: any = null;
    

    async function populateLabelFields(collectionId: any,selectedField: any = '') {
      if (!labelFieldSelect) return;
      labelFieldSelect.innerHTML = '<option value="">Loading fields…</option>';
      labelFieldSelect.disabled = true;

      if (!collectionId || !getRemoteListLabelFields) {
        labelFieldSelect.innerHTML = '<option value="">Select collection first…</option>';
        return;
      }

      try {
        const fields = await getRemoteListLabelFields(collectionId);
        const options = [
          `<option value=""${!selectedField ? ' selected' : ''}>Auto (name / title)</option>`,
          ...fields.map(
            (entry: any) =>
              `<option value="${escapeAttr(entry.id)}"${selectedField === entry.id ? ' selected' : ''}>${escapeAttr(entry.label)}</option>`,
          ),
        ];
        labelFieldSelect.innerHTML = options.join('');
        labelFieldSelect.disabled = false;
      } catch {
        labelFieldSelect.innerHTML = '<option value="">Could not load fields</option>';
      }
    }

    async function normalizeCatalog(result: any) {
      if (Array.isArray(result)) {
        return {
          bookmarks: [],
          tree: result.map((entry: any) => ({
            id: entry.id,
            label: entry.label,
            kind: 'collection',
          })),
        };
      }
      return {
        bookmarks: result?.bookmarks ?? [],
        tree: result?.tree ?? [],
      };
    }

    if (getRemoteListCollections) {
      _collectionPicker = renderCollectionTreePicker(pickerMount, {
        getCatalog: async () => normalizeCatalog(await getRemoteListCollections()),
        initialCollectionId: activeSchema.sourceCollection ?? '',
        initialPresetId: activeSchema.sourcePresetId ?? '',
        onSelect: (collectionId: any,presetId: any) => {
          if (currentSchema) {
            currentSchema = {
              ...currentSchema,
              listSource: 'remote',
              sourceCollection: collectionId,
            };
            if (presetId) {
              currentSchema.sourcePresetId = String(presetId);
            } else {
              delete currentSchema.sourcePresetId;
            }
          }
          void populateLabelFields(collectionId);
          void onPersistRequest?.();
        },
      });
      void populateLabelFields(activeSchema.sourceCollection ?? '', activeSchema.sourceLabelField ?? '');
    } else {
      pickerMount.innerHTML = '<p class="schema-form__hint">Collection picker is not configured.</p>';
    }
  }

  function renderChoiceListOptions(extra: any,schema: any) {
    const mode = getListSourceMode(schema);

    const sourceRow = document.createElement('label');
    sourceRow.className = 'schema-form__row';
    sourceRow.innerHTML = `
      <span>Options source</span>
      <select data-field="listSourceMode">
        <option value="manual"${mode === 'manual' ? ' selected' : ''}>Manual list</option>
        <option value="catalog"${mode === 'catalog' ? ' selected' : ''}>Shared catalog</option>
        <option value="remote"${mode === 'remote' ? ' selected' : ''}>Remote search</option>
      </select>
    `;
    extra.appendChild(sourceRow);

    const optionsHost = document.createElement('div');
    optionsHost.className = 'schema-choice-list-options';
    extra.appendChild(optionsHost);

    function refreshOptionsArea() {
      optionsHost.innerHTML = '';
      const listSourceMode = extra.querySelector('[data-field="listSourceMode"]')?.value ?? 'manual';

      if (listSourceMode === 'remote') {
        renderRemoteListOptions(optionsHost, currentSchema ?? schema);
        return;
      }

      if (listSourceMode === 'catalog') {
        const title = document.createElement('div');
        title.className = 'schema-form__subtitle';
        title.textContent = 'Shared catalog';
        optionsHost.appendChild(title);
        const catalogSchema = currentSchema ?? schema;
        renderCommonListSelector(optionsHost, catalogSchema, () => {
          const listId = optionsHost.querySelector('[data-field="commonListId"]')?.value ?? '';
          const preview = optionsHost.querySelector('.schema-common-list-preview');
          preview?.remove();
          if (listId) renderCommonListPreview(optionsHost, listId);
        });
        const listId = catalogSchema.commonListId ?? '';
        if (listId) renderCommonListPreview(optionsHost, listId);
        return;
      }

      const title = document.createElement('div');
      title.className = 'schema-form__subtitle';
      title.textContent = 'Options';
      optionsHost.appendChild(title);
      renderDesignerLaunchPanel(optionsHost, {
        mode: 'list',
        getSummary: () => {
          const count = manualListItems.length;
          return count
            ? `${count} option${count === 1 ? '' : 's'} configured.`
            : 'No options yet.';
        },
        getOpenPayload: () => ({ items: manualListItems }),
        onApply: (result: any) => {
          manualListItems = normalizeListItems(result.items ?? []);
        },
      });
    }

    sourceRow.querySelector('[data-field="listSourceMode"]')?.addEventListener('change', () => {
      refreshOptionsArea();
      const listSourceMode = extra.querySelector('[data-field="listSourceMode"]')?.value ?? 'manual';
      if (currentSchema) {
        if (listSourceMode === 'remote') {
          currentSchema = { ...currentSchema, listSource: 'remote' };
          delete currentSchema.items;
          delete currentSchema.commonListId;
        } else if (listSourceMode === 'catalog') {
          currentSchema = { ...currentSchema };
          delete currentSchema.listSource;
          delete currentSchema.sourceCollection;
          delete currentSchema.sourceLabelField;
          delete currentSchema.sourcePresetId;
        } else {
          currentSchema = { ...currentSchema };
          delete currentSchema.listSource;
          delete currentSchema.sourceCollection;
          delete currentSchema.sourceLabelField;
          delete currentSchema.sourcePresetId;
          delete currentSchema.commonListId;
        }
      }
      void onPersistRequest?.();
    });
    refreshOptionsArea();
  }

  function appendDefaultValueField(extra: any,schema: any) {
    if (schema.type === 'integer') return;

    const row = document.createElement('label');
    row.className = 'schema-form__row';

    if (schema.type === 'choice') {
      row.innerHTML = `
        <span>Default value</span>
        <input type="text" data-field="defaultValue" value="${escapeAttr(schema.defaultValue ?? '')}" placeholder="Option label" />
      `;
    } else if (schema.type === 'list') {
      const value = Array.isArray(schema.defaultValue) ? schema.defaultValue.join(', ') : '';
      row.innerHTML = `
        <span>Default value</span>
        <input type="text" data-field="defaultValue" value="${escapeAttr(value)}" placeholder="Comma-separated labels" />
      `;
    } else if (schema.type === 'tree') {
      const value = Array.isArray(schema.defaultValue) ? schema.defaultValue.join('; ') : '';
      row.innerHTML = `
        <span>Default value</span>
        <input type="text" data-field="defaultValue" value="${escapeAttr(value)}" placeholder="Semicolon-separated paths" />
      `;
    } else {
      return;
    }

    extra.appendChild(row);
  }

  function appendAllowManualEditField(extra: any,schema: any) {
    if (!['list', 'choice', 'tree'].includes(schema.type)) return;

    const row = document.createElement('label');
    row.className = 'schema-form__row schema-form__row--checkbox';
    row.innerHTML = `
      <input type="checkbox" data-field="allowManualEdit"${schema.allowManualEdit ? ' checked' : ''} />
      <span class="schema-form__label-row">
        <span>Allow manual edit</span>
        ${infoTipHtml('Users can type free text outside catalog options when filling the document.')}
      </span>
    `;
    extra.appendChild(row);
  }

  function renderDisplayStyleHint(form: any) {
    const section = document.createElement('div');
    section.className = 'schema-form__display-style';
    section.innerHTML = `
      <div class="schema-form__subtitle-row">
        <div class="schema-form__subtitle">Value display style</div>
        ${infoTipHtml('Select this field in the document and use the Format panel to style its value. For table cells, click any cell to select the whole column. Use Tx to reset to the editor default.')}
      </div>
    `;
    form.appendChild(section);
  }

  function renderTypeSpecificFields(extra: any,schema: any) {
    extra.innerHTML = '';

    if (schema.type === 'list' || schema.type === 'choice') {
      manualListItems = normalizeListItems(schema.items ?? []);
    }
    if (schema.type === 'tree') {
      manualTreeNodes = normalizeTreeNodes(schema.tree ?? []);
    }

    const handler = getFieldHandler(schema.type);
    // Computed keeps a custom formula UI; its handler only appends display-format fields.
    if (typeof handler?.renderSchemaFields === 'function' && schema.type !== 'computed') {
      handler.renderSchemaFields(extra, schema, {
        catalogs: catalogs(),
        editorContext,
        currentFieldId,
      });
      return;
    }

    if (schema.type === 'list') {
      const layout = schema.itemLayout ?? 'inline';
      const layoutRow = document.createElement('label');
      layoutRow.className = 'schema-form__row';
      layoutRow.innerHTML = `
        <span>Display selected values</span>
        <select data-field="itemLayout">
          <option value="inline"${layout === 'inline' ? ' selected' : ''}>Same line (semicolon)</option>
          <option value="lines"${layout === 'lines' ? ' selected' : ''}>One per line</option>
          <option value="bullet"${layout === 'bullet' ? ' selected' : ''}>Bullet list</option>
          <option value="numeric"${layout === 'numeric' ? ' selected' : ''}>Numbered list</option>
          <option value="custom"${layout === 'custom' ? ' selected' : ''}>Custom prefix</option>
        </select>
      `;
      extra.appendChild(layoutRow);

      const prefixRow = document.createElement('label');
      prefixRow.className = 'schema-form__row schema-form__row--item-prefix';
      prefixRow.hidden = layout !== 'custom';
      prefixRow.innerHTML = `
        <span>Line prefix</span>
        <input type="text" data-field="itemPrefix" value="${escapeAttr(schema.itemPrefix ?? '')}" placeholder="e.g. - " />
      `;
      extra.appendChild(prefixRow);

      layoutRow.querySelector('[data-field="itemLayout"]')?.addEventListener('change', (e: any) => {
        prefixRow.hidden = e.target.value !== 'custom';
      });

      renderChoiceListOptions(extra, schema);
      appendDefaultValueField(extra, schema);
      appendAllowManualEditField(extra, schema);
    } else if (schema.type === 'choice') {
      renderChoiceListOptions(extra, schema);
      appendDefaultValueField(extra, schema);
      appendAllowManualEditField(extra, schema);
    } else if (schema.type === 'tree') {
      renderTreeOptions(extra, schema);
      appendDefaultValueField(extra, schema);
      appendAllowManualEditField(extra, schema);
    } else if (schema.type === 'computed') {
      extra.innerHTML = `
        <label class="schema-form__row schema-form__row--stacked">
          <span class="schema-form__label-row">
            <span>Formula</span>
            ${infoTipHtml('Pick a field from the tree below, or type references like {Section.FieldName} and {Section.TableName.ColumnName}. Use the function buttons to wrap a selection with sum(), avg(), etc. Legacy {fieldId} still works.')}
          </span>
          <textarea data-field="formula" rows="4" placeholder="{Section.Field} + sum({Section.Table.Column})">${escapeAttr(schema.formula ?? '')}</textarea>
        </label>
        <div data-role="formula-picker"></div>
      `;
      const pickerHost = extra.querySelector('[data-role="formula-picker"]');
      renderFormulaFieldPicker(pickerHost, {
        blocks: editorContext.blocks,
        fieldSchemas: editorContext.fieldSchemas ?? registry()?.getFieldSchemas() ?? {},
        excludeFieldId: currentFieldId,
        getFormulaTextarea: () => body.querySelector('[data-field="formula"]'),
      });
      if (typeof handler?.renderSchemaFields === 'function') {
        handler.renderSchemaFields(extra, schema, {
          catalogs: catalogs(),
          editorContext,
          currentFieldId,
        });
      }
    } else if (schema.type === 'table') {
      extra.innerHTML = `
        <label class="schema-form__row">
          <span>Columns (comma-separated)</span>
          <input type="text" data-field="columns" value="${escapeAttr((schema.columns ?? []).map((c) => c.label).join(', '))}" />
        </label>
        <label class="schema-form__row">
          <span>Column field Names (comma-separated)</span>
          <input type="text" data-field="columnNames" value="${escapeAttr((schema.columns ?? []).map((c) => c.name ?? c.label).join(', '))}" />
        </label>
        <label class="schema-form__row">
          <span class="schema-form__label-row">
            <span>Column widths (optional)</span>
            ${infoTipHtml('Widths align with columns by position (e.g. 40%, 20%, auto). Percentages of data columns should add up to 100%. Bare numbers count as %. Leave blank or use auto for flexible columns. Column field IDs are generated from column field names.')}
          </span>
          <input type="text" data-field="columnWidths" value="${escapeAttr((schema.columns ?? []).map((c) => c.width ?? '').join(', '))}" placeholder="40%, 15%, 15%, 15%, 15%" />
        </label>
        <label class="schema-form__row schema-form__row--checkbox">
          <input type="checkbox" data-field="hideHeader" ${schema.hideHeader ? 'checked' : ''} />
          <span>Hide header</span>
        </label>
        <label class="schema-form__row schema-form__row--checkbox">
          <input type="checkbox" data-field="hideBorders" ${schema.hideBorders ? 'checked' : ''} />
          <span>Hide borders</span>
        </label>
      `;
    } else if (schema.type === 'child') {
      extra.innerHTML = `
        <div class="schema-form__row schema-form__row--actions">
          <span class="schema-form__label-row">
            <span>Nested template</span>
            ${infoTipHtml('Upload a template JSON (kind: "template") — the same format as the main editor Template export.')}
          </span>
          <button type="button" class="btn btn-sm btn-primary" data-action="upload-repeater-template">Upload template</button>
          <input type="file" accept=".json,application/json" data-role="repeater-template-file" hidden />
        </div>
        <p class="schema-form__hint" data-role="repeater-template-status" hidden></p>
      `;

      const statusEl = extra.querySelector('[data-role="repeater-template-status"]');
      const fileInput = extra.querySelector('[data-role="repeater-template-file"]');

      const showRepeaterTemplateStatus = (message: any,isError: any = false) => {
        if (!statusEl) return;
        statusEl.hidden = !message;
        statusEl.textContent = message;
        statusEl.classList.toggle('schema-form__hint--error', isError);
      };

      extra.querySelector('[data-action="upload-repeater-template"]')?.addEventListener('click', () => {
        fileInput?.click();
      });

      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file || !currentSchema || !currentFieldId) return;

        try {
          const text = await file.text();
          const imported = parseRepeaterTemplateImport(JSON.parse(text), currentFieldId);
          const updatedSchema = applyRepeaterTemplateImport(currentSchema, imported);
          currentSchema = updatedSchema;
          showRepeaterTemplateStatus('Template uploaded. Save field properties to keep changes.');

          if (onRepeaterTemplateChange) {
            const persisted = await onRepeaterTemplateChange(currentFieldId, updatedSchema);
            if (persisted) {
              currentSchema = persisted;
              showRepeaterTemplateStatus('Template uploaded and applied.');
            }
          }
        } catch (err: any) {
          showRepeaterTemplateStatus(err?.message ?? 'Could not read repeater template file.', true);
        }
      });
    }
  }

  function updateIdPreview() {
    const idEl = idPreviewEl;
    if (!idEl) return;

    if (editingCellField) {
      idEl.textContent =  currentFieldId;
      return;
    }

    const name = body.querySelector('[data-field="name"]')?.value?.trim() ?? '';
    const used = new Set(Object.keys(editorContext.fieldSchemas ?? {}));
    used.delete(currentFieldId);
    idEl.textContent = deriveFieldId(editorContext.sectionName, name || 'field', used);
  }

  function renderForm(fieldId: any,schema: any) {
    body.innerHTML = '';
    currentFieldId = fieldId;
    currentSchema = { ...schema };
    editingCellField = isCellFieldId(
      fieldId,
      editorContext.fieldSchemas ?? registry()?.getFieldSchemas() ?? {},
    );

    const form = document.createElement('div');
    form.className = 'schema-form';

    const typeOptions = getFieldTypes().map(
      ({ type, label }: any) =>
        `<option value="${type}"${type === schema.type ? ' selected' : ''}>${label}</option>`
    ).join('');

    const nameFields = editingCellField
      ? ''
      : `
      <label class="schema-form__row">
        <span class="schema-form__label-row">
          <span>Field Name</span>
          ${infoTipHtml('Used in document export and to generate the field ID.')}
        </span>
        <input type="text" data-field="name" value="${escapeAttr(schema.name ?? schema.label ?? '')}" />
      </label>
    `;

    const labelFields = editingCellField
      ? ''
      : `
      <label class="schema-form__row">
        <span>Label</span>
        <input type="text" data-field="label" value="${escapeAttr(schema.label ?? '')}" />
      </label>
    `;

    form.innerHTML = `
      ${labelFields}
      ${nameFields}
      <p class="schema-form__hint" data-role="id-error" hidden></p>
      <label class="schema-form__row">
        <span>Field type</span>
        <select data-field="type">${typeOptions}</select>
      </label>
      <label class="schema-form__row schema-form__row--checkbox">
        <input type="checkbox" data-field="required"${schema.required ? ' checked' : ''} />
        <span>Required value</span>
      </label>
      ${schema.type === 'computed' ? '' : `
      <label class="schema-form__row schema-form__row--checkbox">
        <input type="checkbox" data-field="readonly"${schema.readonly ? ' checked' : ''} />
        <span class="schema-form__label-row">
          <span>Read-only when filling</span>
          ${infoTipHtml('Users can see the value but cannot change it in fill mode.')}
        </span>
      </label>
      `}
    `;

    if (!editingCellField) {
      form.querySelector('[data-field="name"]')?.addEventListener('input', updateIdPreview);
    }

    const extra = document.createElement('div');
    extra.className = 'schema-form__extra';
    renderTypeSpecificFields(extra, schema);

    form.appendChild(extra);
    body.appendChild(form);
    updateIdPreview();

    renderDisplayStyleHint(form);

    const typeSelect = form.querySelector('[data-field="type"]');
    typeSelect.addEventListener('change', () => {
      const label = editingCellField
        ? currentSchema.label
        : form.querySelector('[data-field="label"]')?.value?.trim() ?? currentSchema.label;
      const newType = typeSelect.value;
      currentSchema = convertSchemaType({ ...currentSchema, label }, newType, catalogs());
      renderTypeSpecificFields(extra, currentSchema);
    });
  }

  function collectSchema() {
    const name = editingCellField
      ? (currentSchema.name ?? currentSchema.label ?? '')
      : (body.querySelector('[data-field="name"]')?.value?.trim() ?? currentSchema.name ?? '');
    const label = editingCellField
      ? (currentSchema.label ?? '')
      : (body.querySelector('[data-field="label"]')?.value?.trim() ?? currentSchema.label);
    const type = body.querySelector('[data-field="type"]')?.value ?? currentSchema.type;
    const result = convertSchemaType({ ...currentSchema, name, label }, type, catalogs());

    const handler = getFieldHandler(result.type);
    if (typeof handler?.readSchemaFields === 'function') {
      const patch = handler.readSchemaFields(body, result) ?? {};
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete result[key];
        else result[key] = value;
      }
    } else if (result.type === 'list' || result.type === 'choice') {
      const listSourceMode = body.querySelector('[data-field="listSourceMode"]')?.value ?? 'manual';
      if (listSourceMode === 'remote') {
        result.listSource = 'remote';
        delete result.commonListId;
        delete result.items;
        result.withCode = body.querySelector('[data-field="withCode"]')?.checked ?? false;
        const sourceCollection = body.querySelector('[data-field="sourceCollection"]')?.value?.trim()
          || currentSchema?.sourceCollection?.trim()
          || '';
        const sourceLabelField = body.querySelector('[data-field="sourceLabelField"]')?.value?.trim()
          || currentSchema?.sourceLabelField?.trim()
          || '';
        const sourcePresetId = body.querySelector('[data-field="sourcePresetId"]')?.value?.trim()
          || (currentSchema?.sourcePresetId != null ? String(currentSchema.sourcePresetId).trim() : '');
        if (sourceCollection) {
          result.sourceCollection = sourceCollection;
        } else {
          // Keep prior collection if the picker DOM was remounted empty mid-save.
          if (currentSchema?.sourceCollection) {
            result.sourceCollection = currentSchema.sourceCollection;
          } else {
            delete result.sourceCollection;
          }
        }
        if (sourceLabelField) {
          result.sourceLabelField = sourceLabelField;
        } else {
          delete result.sourceLabelField;
        }
        if (sourcePresetId) {
          result.sourcePresetId = sourcePresetId;
        } else {
          delete result.sourcePresetId;
        }
      } else if (listSourceMode === 'catalog') {
        delete result.listSource;
        delete result.sourceCollection;
        delete result.sourceLabelField;
        delete result.sourcePresetId;
        const commonListId = body.querySelector('[data-field="commonListId"]')?.value ?? '';
        if (commonListId) {
          result.commonListId = commonListId;
          delete result.items;
          delete result.withCode;
        } else {
          // No list chosen yet — do not silently convert back to a manual options list.
          delete result.commonListId;
          delete result.items;
          delete result.withCode;
        }
      } else {
        delete result.listSource;
        delete result.sourceCollection;
        delete result.sourceLabelField;
        delete result.sourcePresetId;
        delete result.commonListId;
        result.items = manualListItems;
      }
      result.multi = result.type === 'list';
      if (result.type === 'list') {
        result.itemLayout = body.querySelector('[data-field="itemLayout"]')?.value ?? 'inline';
        result.itemPrefix = body.querySelector('[data-field="itemPrefix"]')?.value ?? '';
      }
      const defaultValueStr = body.querySelector('[data-field="defaultValue"]')?.value ?? '';
      if (result.type === 'choice') {
        result.defaultValue = defaultValueStr;
      } else if (result.type === 'list') {
        result.defaultValue = defaultValueStr.split(',').map((s: any) => s.trim()).filter(Boolean);
      }
      if (body.querySelector('[data-field="allowManualEdit"]')?.checked) {
        result.allowManualEdit = true;
      } else {
        delete result.allowManualEdit;
      }
    } else if (result.type === 'tree') {
      const commonTreeId = body.querySelector('[data-field="commonTreeId"]')?.value ?? '';
      if (commonTreeId) {
        result.commonTreeId = commonTreeId;
        delete result.tree;
      } else {
        delete result.commonTreeId;
        result.tree = manualTreeNodes;
      }
      const defaultValueStr = body.querySelector('[data-field="defaultValue"]')?.value ?? '';
      result.defaultValue = defaultValueStr.split(';').map((s: any) => s.trim()).filter(Boolean);
      if (body.querySelector('[data-field="allowManualEdit"]')?.checked) {
        result.allowManualEdit = true;
      } else {
        delete result.allowManualEdit;
      }
    } else if (result.type === 'computed') {
      result.formula = body.querySelector('[data-field="formula"]')?.value ?? '';
    } else if (result.type === 'table') {
      const colStr = body.querySelector('[data-field="columns"]')?.value ?? '';
      const columnNamesStr = body.querySelector('[data-field="columnNames"]')?.value ?? '';
      const widthStr = body.querySelector('[data-field="columnWidths"]')?.value ?? '';
      const widths = widthStr.split(',').map((s: any) => s.trim());
      const labels = colStr.split(',');
      const names = columnNamesStr.split(',');
      result.columns = buildTableColumnsFromLabels(
        labels,
        widths,
        currentSchema.type === 'table' ? (currentSchema.columns ?? []) : [],
        names,
      );
      if (currentSchema.type === 'table' && currentSchema.rows?.length) {
        result.rows = currentSchema.rows;
      } else {
        delete result.rows;
      }
      if (body.querySelector('[data-field="hideHeader"]')?.checked) {
        result.hideHeader = true;
      } else {
        delete result.hideHeader;
      }
      if (body.querySelector('[data-field="hideBorders"]')?.checked) {
        result.hideBorders = true;
      } else {
        delete result.hideBorders;
      }
    } else if (result.type === 'child' && currentSchema.type === 'child') {
      result.fieldSchemas = currentSchema.fieldSchemas ?? result.fieldSchemas;
    }

    result.required = body.querySelector('[data-field="required"]')?.checked ?? false;

    if (result.type === 'computed') {
      delete result.readonly;
    } else if (body.querySelector('[data-field="readonly"]')?.checked) {
      result.readonly = true;
    } else {
      delete result.readonly;
    }

    const liveSchema = registry()?.getFieldSchemas()?.[currentFieldId];
    if (liveSchema?.displayStyle) {
      result.displayStyle = { ...liveSchema.displayStyle };
    }

    return result;
  }

  function load(fieldId: any,schema: any,context: any = {}) {
    editorContext = {
      sectionName: context.sectionName ?? context.sectionLabel ?? ROOT_SECTION_KEY,
      sectionLabel: context.sectionName ?? context.sectionLabel ?? ROOT_SECTION_KEY,
      blocks: context.blocks ?? [],
      fieldSchemas: context.fieldSchemas ?? registry()?.getFieldSchemas() ?? {},
    };
    renderForm(fieldId, schema);
  }

  function trySave() {
    if (!currentFieldId || !currentSchema) return null;
    if (!validateFieldNameInput()) return null;

    let schema: any;
    try {
      schema = collectSchema();
    } catch (err: any) {
      showIdError(err.message ?? 'Invalid table schema.');
      return null;
    }

    const newFieldId = resolveFieldIdFromForm(schema);

    if (schema.type === 'computed') {
      const blocks = editorContext.blocks ?? registry()?.getBlocks?.() ?? [];
      const schemas = editorContext.fieldSchemas ?? registry()?.getFieldSchemas() ?? {};
      if (detectCircularDependency(newFieldId, schema.formula ?? '', schemas, blocks)) {
        showIdError('Formula creates a circular reference.');
        return null;
      }
    }

    return { fieldId: newFieldId, previousFieldId: currentFieldId, schema };
  }

  function applyColumnWidthsInput(widthStr: any) {
    if (currentSchema?.type !== 'table') return null;
    const widths = String(widthStr ?? '').split(',').map((s: any) => s.trim());
    const columns = (currentSchema.columns ?? []).map((col: any, index: any) => {
      const next = { ...col };
      const width = normalizeStoredColumnWidth(widths[index]);
      if (width) next.width = width;
      else delete next.width;
      return next;
    });
    currentSchema = { ...currentSchema, columns };
    return columns;
  }

  function applyColumnWidthsInputFromDom() {
    const input = body.querySelector('[data-field="columnWidths"]');
    if (!input) return null;
    return applyColumnWidthsInput(input.value);
  }

  function getCurrentFieldId() {
    return currentFieldId;
  }

  function syncTableColumnWidths(columns: any) {
    if (currentSchema?.type !== 'table') return false;
    const input = body.querySelector('[data-field="columnWidths"]');
    if (input) {
      input.value = (columns ?? []).map((col: any) => col.width ?? '').join(', ');
    }
    if (Array.isArray(columns)) {
      currentSchema = { ...currentSchema, columns };
    }
    return true;
  }

  function isLoaded() {
    return Boolean(currentFieldId && currentSchema);
  }

  function validateFieldNameInput() {
    if (editingCellField) {
      showIdError('');
      return currentSchema.name ?? currentSchema.label ?? currentFieldId;
    }

    const input = body.querySelector('[data-field="name"]');
    const name = input?.value?.trim() ?? '';

    if (!name) {
      showIdError('Field Name is required.');
      input?.focus();
      return null;
    }

    if (
      isFieldNameTakenInSection(
        editorContext.sectionName,
        name,
        currentFieldId,
        editorContext.blocks,
        editorContext.fieldSchemas,
      )
    ) {
      showIdError(`Field Name "${name}" is already used in this section.`);
      input?.focus();
      return null;
    }

    showIdError('');
    return name;
  }

  function resolveFieldIdFromForm(schema: any) {
    if (editingCellField) return currentFieldId;
    const used = new Set(Object.keys(editorContext.fieldSchemas ?? {}));
    used.delete(currentFieldId);
    return deriveFieldId(editorContext.sectionName, schema.name, used);
  }

  function showIdError(message: any) {
    const errorEl = body.querySelector('[data-role="id-error"]');
    if (!errorEl) return;
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      errorEl.classList.add('schema-form__hint--error');
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
      errorEl.classList.remove('schema-form__hint--error');
    }
  }

  function _validateFieldIdInput() {
    return resolveFieldIdFromForm({ name: body.querySelector('[data-field="name"]')?.value?.trim() ?? '' });
  }
  void _validateFieldIdInput;

  return { load, trySave, clear, getCurrentFieldId, isLoaded, syncTableColumnWidths, applyColumnWidthsInput, applyColumnWidthsInputFromDom };
}

function escapeAttr(str: any) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
