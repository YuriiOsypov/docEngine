import {
  renderSegmentsToDom,
  serializeEditableToSegments,
  wireFieldClicks,
  wireColumnBlockRegions,
  wireDesignDragDrop,
  wireTableRegions,
  syncFillComputedFields,
  recoverImageValuesFromDom,
  refreshTableCellTokens,
  pruneTableCellCaretAnchors,
  pickFillFieldFromToken,
} from '../fields/inline-fields.js';
import { wireMappingDragDrop } from '../ui/mapping-drag-drop.js';
import { wireFieldClipboard } from '../fields/field-clipboard.js';
import { wireFieldSelectionClear } from '../fields/field-selection.js';
import { wireFieldTokenKeyboard } from '../fields/field-keyboard.js';
import { cellFieldId } from '../core/field-schemas.js';
import { resolveSectionName } from '../core/field-id.js';
import { applyDocumentBodyTextStyle } from '../core/page-setup-styles.js';

export default class DocumentSection {
  [key: string]: any;
  static get enableLineBreaks() {
    return true;
  }

  static get toolbox() {
    return {
      title: 'Document',
      icon: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="2" fill="currentColor"/><rect x="2" y="7" width="12" height="2" fill="currentColor"/><rect x="2" y="12" width="8" height="2" fill="currentColor"/></svg>',
    };
  }

  constructor({ data, config }: any) {
    this.config = config ?? {};
    const label = data.label ?? '';
    let name = data.name ?? label;
    if (!String(name ?? '').trim()) {
      name =
        typeof this.config.allocateSectionName === 'function'
          ? this.config.allocateSectionName()
          : '';
    }
    this.data = {
      name,
      label,
      collapsed: !!data.collapsed,
      repeatable: !!data.repeatable,
      hideTitleInPreview: !!data.hideTitleInPreview,
      borderTop: !!data.borderTop,
      borderBottom: !!data.borderBottom,
      eachRowOnNewPage: !!data.eachRowOnNewPage,
      visibility: data.visibility ?? null,
      segments: data.segments ?? [],
      fieldValues: data.fieldValues ?? {},
    };
    this.editable = null;
    this.wrapper = null;
    this.content = null;
    this._unwireClipboard = null;
    this._unwireSelectionClear = null;
    this._unwireKeyboard = null;
  }

  setCollapsed(collapsed: any) {
    this.data.collapsed = !!collapsed;
    this.wrapper?.classList.toggle('document-section--collapsed', this.data.collapsed);
    const btn = this.wrapper?.querySelector('.document-section__collapse-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', String(!this.data.collapsed));
      btn.title = this.data.collapsed ? 'Expand section' : 'Collapse section';
    }
  }

  toggleCollapsed() {
    this.setCollapsed(!this.data.collapsed);
  }

  createCollapseButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'document-section__collapse-btn';
    btn.setAttribute('aria-expanded', String(!this.data.collapsed));
    btn.title = this.data.collapsed ? 'Expand section' : 'Collapse section';
    btn.textContent = '▼';
    btn.addEventListener('click', (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleCollapsed();
    });
    return btn;
  }

  renderHeader(parent: any) {
    const label = String(this.data.label ?? '').trim();
    const designMode = !!this.config.designMode;
    const designPropertiesPanel = !!this.config.designPropertiesPanel;

    if (!designMode && !label) return false;

    const header = document.createElement('div');
    header.className = 'document-section__header document-section__header--collapsible';
    if (designMode && designPropertiesPanel) {
      header.classList.add('document-section__header--selectable');
    }
    header.appendChild(this.createCollapseButton());

    if (designMode && !designPropertiesPanel) {
      const fieldsWrap = document.createElement('div');
      fieldsWrap.className = 'document-section__header-fields';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'document-section__name-input';
      nameInput.placeholder = 'Section name (export key)';
      nameInput.value = this.data.name ?? this.data.label ?? '';
      nameInput.addEventListener('input', () => {
        this.data.name = nameInput.value;
      });
      nameInput.addEventListener('blur', () => {
        this.data.name = nameInput.value;
        if (this.wrapper) {
          this.wrapper.dataset.sectionName = resolveSectionName(this.data);
        }
        this.config.onSectionNameChange?.();
      });
      nameInput.addEventListener('click', (e: any) => e.stopPropagation());
      fieldsWrap.appendChild(nameInput);

      header.appendChild(fieldsWrap);
    } else if (label) {
      if (!designMode) {
        header.addEventListener('click', () => this.toggleCollapsed());
      }
      const text = document.createElement('span');
      text.className = 'document-section__label-text';
      text.textContent = label;
      header.appendChild(text);
    } else if (designMode && designPropertiesPanel) {
      const text = document.createElement('span');
      text.className = 'document-section__label-text document-section__label-text--placeholder';
      text.textContent = 'Untitled section';
      header.appendChild(text);
    }

    if (designMode && this.data.repeatable) {
      const badge = document.createElement('span');
      badge.className = 'document-section__repeat-badge';
      badge.textContent = 'Every page';
      badge.title = 'Show on each page';
      header.appendChild(badge);
    }

    parent.appendChild(header);
    return true;
  }

  readLabelFromDom(_blockContent: any) {
    return this.data.label ?? '';
  }

  readNameFromDom(blockContent: any) {
    const input = blockContent?.querySelector('.document-section__name-input');
    if (input) {
      const value = input.value?.trim();
      if (value) return value;
    }
    return resolveSectionName(this.data);
  }

  getPersistedData() {
    return {
      name: this.data.name,
      label: this.data.label,
      collapsed: !!this.data.collapsed,
      repeatable: !!this.data.repeatable,
      hideTitleInPreview: !!this.data.hideTitleInPreview,
      borderTop: !!this.data.borderTop,
      borderBottom: !!this.data.borderBottom,
      eachRowOnNewPage: !!this.data.eachRowOnNewPage,
      visibility: this.data.visibility ?? null,
      segments: this.data.segments,
      fieldValues: this.data.fieldValues,
    };
  }

  /** Sync border classes on the section wrapper from current data. */
  applyBorderClasses() {
    if (!this.wrapper) return;
    this.wrapper.classList.toggle('document-section--border-top', !!this.data.borderTop);
    this.wrapper.classList.toggle('document-section--border-bottom', !!this.data.borderBottom);
  }

  /** Update section properties in place without remounting the block. */
  applyPropertiesPatch({
    name,
    label,
    repeatable,
    hideTitleInPreview,
    borderTop,
    borderBottom,
    eachRowOnNewPage,
    visibility,
  }: any = {}) {
    if (name !== undefined) this.data.name = name;
    if (label !== undefined) this.data.label = label;
    if (repeatable !== undefined) this.data.repeatable = !!repeatable;
    if (hideTitleInPreview !== undefined) this.data.hideTitleInPreview = !!hideTitleInPreview;
    if (borderTop !== undefined) this.data.borderTop = !!borderTop;
    if (borderBottom !== undefined) this.data.borderBottom = !!borderBottom;
    if (eachRowOnNewPage !== undefined) this.data.eachRowOnNewPage = !!eachRowOnNewPage;
    if (visibility !== undefined) this.data.visibility = visibility ?? null;
    if (this.wrapper) {
      this.wrapper.dataset.sectionName = resolveSectionName(this.data);
    }
    this.applyBorderClasses();
    this.refreshHeader();
    this.notifySectionDataChange();
  }

  refreshHeader() {
    if (!this.wrapper) return;
    const existing = [...this.wrapper.children].find((el: any) =>
      el.classList?.contains('document-section__header'),
    );
    const nextSibling = existing?.nextSibling ?? this.content ?? this.wrapper.firstChild;
    existing?.remove();
    const temp = document.createElement('div');
    const rendered = this.renderHeader(temp);
    if (!rendered) return;
    const header = temp.firstChild;
    if (header) {
      this.wrapper.insertBefore(header, nextSibling);
    }
  }

  /** Replace section content from a history snapshot without remounting the EditorJS block. */
  applyHistoryData(data: any = {}) {
    this._unwireKeyboard?.();
    this._unwireKeyboard = null;
    this._unwireClipboard?.();
    this._unwireClipboard = null;
    this._unwireSelectionClear?.();
    this._unwireSelectionClear = null;

    if (this.editable) {
      this.editable.querySelectorAll('.document-columns__col').forEach((col: any) => {
        col._unwireKeyboard?.();
        col._unwireKeyboard = null;
      });
    }

    this.data = {
      ...this.data,
      name: data.name ?? '',
      label: data.label ?? '',
      collapsed: !!data.collapsed,
      repeatable: !!data.repeatable,
      hideTitleInPreview: !!data.hideTitleInPreview,
      borderTop: !!data.borderTop,
      borderBottom: !!data.borderBottom,
      eachRowOnNewPage: !!data.eachRowOnNewPage,
      visibility: data.visibility ?? null,
      segments: JSON.parse(JSON.stringify(data.segments ?? [])),
      fieldValues: JSON.parse(JSON.stringify(data.fieldValues ?? {})),
    };

    if (this.wrapper) {
      this.wrapper.dataset.sectionName = resolveSectionName(this.data);
      this.wrapper.classList.toggle('document-section--collapsed', !!this.data.collapsed);
      this.applyBorderClasses();
    }

    this.refreshHeader();

    if (!this.editable) return;

    this.editable.innerHTML = '';
    this.editable.appendChild(
      renderSegmentsToDom(this.data.segments, this.data.fieldValues, this.getFieldOptions()),
    );
    pruneTableCellCaretAnchors(this.editable);

    this.editable.querySelectorAll('.document-columns').forEach((el: any) => {
      delete el.dataset.columnsWired;
    });
    this.editable.querySelectorAll('.document-table').forEach((el: any) => {
      delete el.dataset.tableWired;
    });

    this.wireColumnRegions();
    if (!this.config.mappingMode) {
      wireDesignDragDrop(this.editable, this.getFieldOptions());
    }
    this.wireTableRegions();

    if (!this.config.designMode) {
      this.data.fieldValues = syncFillComputedFields(
        this.editable,
        this.data.fieldValues,
        this.getComputedSyncOptions(),
      );
    }

    if (this.config.designMode) {
      this._unwireSelectionClear = wireFieldSelectionClear(this.editable);
      this._unwireClipboard = wireFieldClipboard(this.editable, {
        getRegistry: this.config.getRegistry,
        editorHolder: this.config.editorHolder,
        onEditSchema: this.config.onEditSchema,
        onDeleteField: (fieldId: any, token: any) => this.deleteInlineField(fieldId, token),
        onTokenRemoved: () => {
          this.updateSegmentsFromDom();
        },
        onTokenInserted: (fieldId: any, value: any) => {
          this.data.fieldValues[fieldId] = value;
          this.updateSegmentsFromDom();
        },
      });
    }

    this._unwireKeyboard = wireFieldTokenKeyboard(this.editable, {
      designMode: !!this.config.designMode,
      mappingMode: !!this.config.mappingMode,
      getProtectFieldsInFillMode: this.config.getProtectFieldsInFillMode,
      onDeleteField: (fieldId: any, token: any) => this.deleteInlineField(fieldId, token),
      onStructureChange: () => {
        this.updateSegmentsFromDom();
      },
    });

    applyDocumentBodyTextStyle(this.editable, this.config.getDocumentTextStyle?.());
  }

  notifySectionDataChange() {
    this.config.onSectionDataChange?.(this.getPersistedData(), this.wrapper);
  }

  getComputedSyncOptions() {
    return {
      getRegistry: this.config.getRegistry,
      editorHolder: this.config.editorHolder,
      fieldValueStyle: this.config.fieldValueStyle,
      fillModeFieldHighlight: this.config.fillModeFieldHighlight,
    };
  }

  updateSegmentsFromDom() {
    if (!this.editable) return;
    this.data.segments = serializeEditableToSegments(this.editable);
    this.notifySectionDataChange();
  }

  syncComputedAfterValueChange(fieldId: any, value: any) {
    this.data.fieldValues[fieldId] = value;
    this.data.fieldValues = syncFillComputedFields(
      this.editable,
      this.data.fieldValues,
      {
        ...this.getComputedSyncOptions(),
        changedFieldId: fieldId,
      },
    );
    this.data.fieldValues[fieldId] = value;
  }

  getFieldOptions() {
    return {
      ...this.config,
      fieldValues: this.data.fieldValues,
      onDeleteField: (fieldId: any,token: any) => this.deleteInlineField(fieldId, token),
      onCellValueChange: (fieldId: any,value: any) => {
        this.syncComputedAfterValueChange(fieldId, value);
        this.config.onFieldValueChange?.(fieldId, value);
      },
      onTableRowRemoved: (tableId: any,rowKey: any) => {
        const registry = this.config.getRegistry();
        const tableSchema = registry?.getFieldSchemas()?.[tableId];
        for (const col of tableSchema?.columns ?? []) {
          const id = cellFieldId(tableId, rowKey, col.key);
          delete this.data.fieldValues[id];
          registry?.removeFieldSchema(id);
        }
      },
      onStructureChange: () => {
        this.updateSegmentsFromDom();
        if (!this.config.designMode && this.editable) {
          const previous = this.data.fieldValues ?? {};
          this.data.fieldValues = syncFillComputedFields(
            this.editable,
            this.data.fieldValues,
            this.getComputedSyncOptions(),
          );
          const registry = this.config.getRegistry?.();
          const schemas = registry?.getFieldSchemas?.() ?? {};
          // Keep stored Child values when DOM scrape is incomplete (preview omits cells).
          for (const [id, prev] of Object.entries(previous)) {
            if (schemas[id]?.type !== 'child') continue;
            const next = this.data.fieldValues[id];
            const prevKeys = prev && typeof prev === 'object' ? Object.keys(prev).length : 0;
            const nextKeys = next && typeof next === 'object' ? Object.keys(next).length : 0;
            if (prevKeys > nextKeys) this.data.fieldValues[id] = prev;
          }
          this.config.onFieldValueChange?.();
        }
      },
    };
  }

  getColumnWireOptions() {
    const base = this.getFieldOptions();
    return {
      ...base,
      onTokenRemoved: () => {
        this.updateSegmentsFromDom();
      },
      onTokenInserted: (fieldId: any,value: any) => {
        this.data.fieldValues[fieldId] = value;
        this.updateSegmentsFromDom();
      },
    };
  }

  wireColumnRegions() {
    const options = this.getColumnWireOptions();
    const { designMode, onStructureChange } = options;
    const notifyChange = () => onStructureChange?.();

    wireColumnBlockRegions(this.editable, this.getFieldOptions());

    this.editable.querySelectorAll('.document-columns').forEach((columnsEl: any) => {
      if (columnsEl.dataset.columnsWired === 'true') return;
      columnsEl.dataset.columnsWired = 'true';

      columnsEl.querySelectorAll('.document-columns__col').forEach((col: any) => {
        col.addEventListener('input', notifyChange);

        if (designMode) {
          wireFieldClipboard(col, {
            getRegistry: options.getRegistry,
            editorHolder: options.editorHolder,
            onEditSchema: options.onEditSchema,
            onDeleteField: options.onDeleteField,
            onTokenRemoved: () => {
              options.onTokenRemoved?.();
              notifyChange();
            },
            onTokenInserted: (fieldId: any,value: any) => {
              options.onTokenInserted?.(fieldId, value);
              notifyChange();
            },
          });
          col._unwireKeyboard = wireFieldTokenKeyboard(col, {
            designMode: true,
            getProtectFieldsInFillMode: options.getProtectFieldsInFillMode,
            onDeleteField: options.onDeleteField,
            onStructureChange: notifyChange,
          });
        }
      });
    });
  }

  wireTableRegions() {
    wireTableRegions(this.editable, this.getFieldOptions());
  }

  deleteInlineField(fieldId: any,token: any) {
    token?.remove();
    if (this.config.designMode) {
      this.config.onDeleteSchema?.(fieldId);
    }
    this.updateSegmentsFromDom();
  }

  render() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'document-section';
    this.wrapper.dataset.sectionName = resolveSectionName(this.data);
    (this.wrapper as any).__documentSectionTool = this;
    if (this.data.collapsed) {
      this.wrapper.classList.add('document-section--collapsed');
    }
    this.applyBorderClasses();

    this.renderHeader(this.wrapper);

    this.content = document.createElement('div');
    this.content.className = 'document-section__content';

    this.editable = document.createElement('div');
    this.editable.className = 'document-section__body cke_editable';
    this.editable.contentEditable = this.config.mappingMode ? 'false' : 'true';
    this.editable.spellcheck = false;
    if (this.config.mappingMode) {
      this.wrapper.classList.add('document-section--mapping');
    }
    applyDocumentBodyTextStyle(this.editable, this.config.getDocumentTextStyle?.());

    this.editable.appendChild(
      renderSegmentsToDom(this.data.segments, this.data.fieldValues, this.getFieldOptions())
    );
    pruneTableCellCaretAnchors(this.editable);

    this.wireColumnRegions();
    if (!this.config.mappingMode) {
      wireDesignDragDrop(this.editable, this.getFieldOptions());
    }
    this.wireTableRegions();

    if (!this.config.mappingMode) {
      this.editable.addEventListener('input', () => {
        this.updateSegmentsFromDom();
      });
    }

    if (this.config.mappingMode) {
      // Wire the whole section (header + body) so array drops on the header set `_source`.
      wireMappingDragDrop(this.wrapper, {
        getRegistry: this.config.getRegistry,
        getMappingRules: () => this.config.getMappingRules?.() ?? [],
        onAssignRules: (rules: any) => {
          for (const rule of rules) {
            this.config.onMappingRuleChange?.(rule);
          }
        },
      });
    } else {
      wireFieldClicks(
        this.editable,
        this.config,
        (fieldId: any,value: any) => {
          this.syncComputedAfterValueChange(fieldId, value);
          this.config.onFieldValueChange?.(fieldId, value);
        },
        this.getFieldOptions(),
      );
    }

    if (!this.config.designMode) {
      this.data.fieldValues = syncFillComputedFields(
        this.editable,
        this.data.fieldValues,
        this.getComputedSyncOptions(),
      );
    }

    if (this.config.designMode) {
      this._unwireSelectionClear = wireFieldSelectionClear(this.editable);
      this._unwireClipboard = wireFieldClipboard(this.editable, {
        getRegistry: this.config.getRegistry,
        editorHolder: this.config.editorHolder,
        onEditSchema: this.config.onEditSchema,
        onDeleteField: (fieldId: any,token: any) => this.deleteInlineField(fieldId, token),
        onTokenRemoved: () => {
          this.updateSegmentsFromDom();
        },
        onTokenInserted: (fieldId: any,value: any) => {
          this.data.fieldValues[fieldId] = value;
          this.updateSegmentsFromDom();
        },
      });
    }

    this._unwireKeyboard = wireFieldTokenKeyboard(this.editable, {
      designMode: !!this.config.designMode,
      mappingMode: !!this.config.mappingMode,
      editorHolder: this.config.editorHolder,
      getRegistry: this.config.getRegistry,
      getProtectFieldsInFillMode: this.config.getProtectFieldsInFillMode,
      onActivateFillField: async (token: any) => {
        const fieldOptions = this.getFieldOptions();
        const fieldId = token?.dataset?.fieldId;
        const schema = this.config.getRegistry?.()?.getFieldSchemas?.()?.[fieldId];
        const isCell = !!token?.classList?.contains('field-token--cell');
        await pickFillFieldFromToken(
          token,
          fieldOptions,
          (id: any, value: any) => {
            if (isCell) {
              fieldOptions.onCellValueChange?.(id, value);
              if (schema?.type !== 'child') {
                fieldOptions.onStructureChange?.();
              }
              return;
            }
            this.syncComputedAfterValueChange(id, value);
            this.config.onFieldValueChange?.(id, value);
          },
          {
            schema,
            placeholder: token.dataset.placeholder,
            updateContext: isCell
              ? {
                  ...fieldOptions,
                  isTableCell: true,
                  fieldSchemas: this.config.getRegistry?.()?.getFieldSchemas?.() ?? {},
                }
              : fieldOptions,
          },
        );
      },
      onDeleteField: (fieldId: any,token: any) => this.deleteInlineField(fieldId, token),
      onStructureChange: () => {
        this.updateSegmentsFromDom();
      },
    });

    this.content.appendChild(this.editable);
    this.wrapper.appendChild(this.content);
    return this.wrapper;
  }

  save(blockContent: any) {
    const editable = blockContent.querySelector('.document-section__body');
    if (!editable) return this.data;

    this.data.label = this.readLabelFromDom(blockContent);
    this.data.name = this.readNameFromDom(blockContent);
    const serializeRoot = editable.cloneNode(true);
    this.data.segments = serializeEditableToSegments(serializeRoot);
    // Always sync live token values into fieldValues. Design mode used to skip this,
    // so Document preview (which reads fieldValues) missed lists/choices visible in the editor.
    // Template export still strips values via buildTemplateExport / stripValuesFromBlocks.
    this.data.fieldValues = syncFillComputedFields(
      editable,
      this.data.fieldValues,
      this.getComputedSyncOptions(),
    );
    this.data.fieldValues = recoverImageValuesFromDom(editable, this.data.fieldValues);
    if (!this.config.designMode) {
      refreshTableCellTokens(editable, this.config);
    }
    pruneTableCellCaretAnchors(editable);

    this.notifySectionDataChange();

    return {
      name: this.data.name,
      label: this.data.label,
      collapsed: !!this.data.collapsed,
      repeatable: !!this.data.repeatable,
      hideTitleInPreview: !!this.data.hideTitleInPreview,
      borderTop: !!this.data.borderTop,
      borderBottom: !!this.data.borderBottom,
      eachRowOnNewPage: !!this.data.eachRowOnNewPage,
      visibility: this.data.visibility ?? null,
      segments: this.data.segments,
      fieldValues: this.data.fieldValues,
    };
  }

  validate() {
    return true;
  }
}
