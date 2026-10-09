import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CurrentPageReference } from 'lightning/navigation';
import LightningConfirm from 'lightning/confirm';
import getTemplate from '@salesforce/apex/DocEngineTemplateController.getTemplate';
import getVersion from '@salesforce/apex/DocEngineTemplateController.getVersion';
import listVersions from '@salesforce/apex/DocEngineTemplateController.listVersions';
import saveTemplateJson from '@salesforce/apex/DocEngineTemplateController.saveTemplateJson';
import listPublicGroups from '@salesforce/apex/DocEngineTemplateController.listPublicGroups';
import resolveListItems from '@salesforce/apex/DocEngineListController.resolveListItems';
import buildSourceSampleJson from '@salesforce/apex/DocEngineObjectDescribeController.buildSourceSampleJson';
import buildRelatedSampleJson from '@salesforce/apex/DocEngineObjectDescribeController.buildRelatedSampleJson';
import listRemoteCollections from '@salesforce/apex/DocEngineObjectDescribeController.listRemoteCollections';
import listRemoteLabelFields from '@salesforce/apex/DocEngineObjectDescribeController.listRemoteLabelFields';
import {
  ensureDocEngineAssets,
  createDocEditor,
  resolveCreateDocEditorOptions,
  emptyDocument,
  parseJsonSafe,
  apexErrorMessage
} from 'c/docEngineLib';

export default class DocEngineTemplateBuilder extends LightningElement {
  /** DocEngine_Template__c Id when placed on a template record page */
  @api recordId;
  /** Default object API name when creating a new template on an App Page */
  @api defaultObjectApiName = '';

  templateName = '';
  objectApiName = '';
  pdfFilename = '';
  description = '';
  accessGroupId = '';
  accessGroupOptions = [{ label: 'None — all users with access', value: '' }];
  hideEmpty = false;
  /** When true, Finish attaches a file using outputFormat. */
  attachFile = true;
  outputFormat = 'pdf';
  outputFormatOptions = [
    { label: 'PDF', value: 'pdf' },
    { label: 'HTML', value: 'html' }
  ];
  isActive = true;
  version = null;
  versionId = null;
  versionOptions = [];
  /** Id → full detail string for version picker help text */
  _versionDetailById = {};
  editorBusy = false;
  fillingMode = false;
  /** When true, hide identity/controls rows; keep summary bar with Preview + Save */
  metaPanelCollapsed = false;

  _editor = null;
  _editorInitialized = false;
  _templateId = null;
  _loadingTemplate = false;
  _loadedVersionId = null;

  @wire(listPublicGroups)
  wiredPublicGroups({ data, error }) {
    const none = { label: 'None — all users with access', value: '' };
    if (data) {
      const opts = data.map((g) => ({ label: g.label, value: g.value }));
      if (this.accessGroupId && !opts.some((o) => o.value === this.accessGroupId)) {
        opts.unshift({ label: `Unknown group (${this.accessGroupId})`, value: this.accessGroupId });
      }
      this.accessGroupOptions = [none, ...opts];
    } else if (error) {
      this.accessGroupOptions = [none];
    }
  }

  @wire(CurrentPageReference)
  setPageRef(pageRef) {
    if (!pageRef) {
      return;
    }
    const state = pageRef.state || {};
    if (!this.objectApiName && state.c__objectApiName) {
      this.objectApiName = state.c__objectApiName;
    }
  }

  get objectApiNameLocked() {
    return Boolean(this._templateId && this.objectApiName);
  }

  get accessGroupSelectOptions() {
    return (this.accessGroupOptions || []).map((o, i) => ({
      key: o.value || `__none_${i}`,
      label: o.label,
      value: o.value
    }));
  }

  get outputFormatSelectOptions() {
    return (this.outputFormatOptions || []).map((o) => ({
      label: o.label,
      value: o.value
    }));
  }

  get outputFormatDisabled() {
    return this.attachFile !== true;
  }

  get outputFormatHelp() {
    return this.attachFile === true
      ? 'Finish attaches a PDF or HTML file for documents from this template.'
      : 'Turn on Attach file to choose PDF or HTML.';
  }

  get versionSelectOptions() {
    if (!this.versionOptions || !this.versionOptions.length) {
      return [{ key: '__empty', label: 'Current version', value: '' }];
    }
    return this.versionOptions.map((o) => ({
      key: o.value || '__empty',
      label: o.label,
      value: o.value
    }));
  }

  get versionPickerDisabled() {
    return this.editorBusy || !this._templateId || !this.versionOptions.length;
  }

  get saveHint() {
    if (!this._templateId) {
      return 'Save creates v1.';
    }
    if (this.version != null) {
      return `Viewing v${this.version}. Save always creates a new version.`;
    }
    return 'Save creates a new version.';
  }

  get versionPickerHelp() {
    const detail =
      this.versionId && this._versionDetailById[this.versionId]
        ? this._versionDetailById[this.versionId]
        : '';
    const parts = [detail, this.saveHint].filter(Boolean);
    return parts.join(' ');
  }

  get modeHint() {
    return this.fillingMode
      ? 'Filling mode — edit field values; switch off to redesign the template.'
      : 'Design mode — place fields, then map Salesforce fields if needed.';
  }

  get metaPanelClass() {
    return this.metaPanelCollapsed
      ? 'de-meta-panel de-meta-panel--collapsed'
      : 'de-meta-panel';
  }

  get metaPanelAriaExpanded() {
    return String(!this.metaPanelCollapsed);
  }

  get metaPanelToggleTitle() {
    return this.metaPanelCollapsed ? 'Show template settings' : 'Hide template settings';
  }

  get metaPanelTitle() {
    const name = (this.templateName || '').trim();
    return name || 'Untitled template';
  }

  handleToggleMetaPanel() {
    this.metaPanelCollapsed = !this.metaPanelCollapsed;
  }

  connectedCallback() {
    if (this.defaultObjectApiName && !this.objectApiName) {
      this.objectApiName = this.defaultObjectApiName;
    }
  }

  renderedCallback() {
    this._syncMetaSelects();
    if (this._editorInitialized || this._loadingTemplate) {
      return;
    }
    const editorRoot = this.template.querySelector('.editor-root');
    const stickyChrome = this.template.querySelector('.sticky-chrome');
    const docActions = this.template.querySelector('.doc-actions');
    if (!editorRoot || !stickyChrome || !docActions) {
      return;
    }
    this._bootstrap(editorRoot, stickyChrome, docActions);
  }

  _syncMetaSelects() {
    const group = this.template.querySelector('#de-meta-group');
    if (group && group.value !== (this.accessGroupId || '')) {
      group.value = this.accessGroupId || '';
    }
    const format = this.template.querySelector('[data-meta="output-format"]');
    if (format) {
      format.disabled = this.outputFormatDisabled;
      if (format.value !== (this.outputFormat || 'pdf')) {
        format.value = this.outputFormat || 'pdf';
      }
    }
    const objectApi = this.template.querySelector('[data-meta="object-api"]');
    if (objectApi) {
      const locked = this.objectApiNameLocked;
      objectApi.disabled = locked;
      objectApi.classList.toggle('de-meta-input--locked', locked);
      if (objectApi.value !== (this.objectApiName || '')) {
        objectApi.value = this.objectApiName || '';
      }
    }
    const version = this.template.querySelector('[data-meta="version"]');
    if (version) {
      const next = this.versionId || '';
      if (version.value !== next) {
        version.value = next;
      }
      version.disabled = this.versionPickerDisabled;
    }
    const active = this.template.querySelector('[data-meta="active"]');
    if (active && active.checked !== this.isActive) {
      active.checked = this.isActive === true;
    }
    const attachFile = this.template.querySelector('[data-meta="attach-file"]');
    if (attachFile && attachFile.checked !== this.attachFile) {
      attachFile.checked = this.attachFile === true;
    }
    const hideEmpty = this.template.querySelector('[data-meta="hide-empty"]');
    if (hideEmpty && hideEmpty.checked !== this.hideEmpty) {
      hideEmpty.checked = this.hideEmpty === true;
    }
    const filling = this.template.querySelector('[data-meta="filling-mode"]');
    if (filling && filling.checked !== this.fillingMode) {
      filling.checked = this.fillingMode === true;
    }
  }

  disconnectedCallback() {
    this._destroyEditor();
  }

  async _bootstrap(editorRoot, stickyChrome, docActions) {
    this._loadingTemplate = true;
    try {
      await ensureDocEngineAssets(this);
      let initialData = emptyDocument();

      if (this.recordId) {
        const dto = await getTemplate({ templateId: this.recordId });
        this._applyTemplateDto(dto);
        initialData = parseJsonSafe(dto.templateJson, emptyDocument());
        await this._refreshVersionOptions();
      }

      this._editor = createDocEditor(
        await resolveCreateDocEditorOptions({
          holder: editorRoot,
          chromeParent: stickyChrome,
          documentActionsContainer: docActions,
          designMode: true,
          data: initialData,
          recordId: this.recordId,
          ui: { designLayout: 'panels' },
          resolveListItems: this._resolveListItems.bind(this),
          remoteListCollections: this._remoteListCollections.bind(this),
          remoteListLabelFields: this._remoteListLabelFields.bind(this)
        })
      );

      await this._editor.ready;

      if (initialData && initialData.fieldMapping && typeof this._editor.setFieldMapping === 'function') {
        this._editor.setFieldMapping(initialData.fieldMapping);
      }

      // Always refresh Source payload from live Object describe when opening a template.
      await this._ensureSourceSample({ force: true });

      this._editorInitialized = true;
    } catch (err) {
      this._showError('Failed to load template builder', err);
    } finally {
      this._loadingTemplate = false;
    }
  }

  /**
   * Refresh fieldMapping.sourceSample from the current Object API Name describe.
   * Preserves mapping rules/expression. Call with force:true on template open.
   */
  async _ensureSourceSample({ force = true } = {}) {
    if (!this._editor || typeof this._editor.setFieldMapping !== 'function') {
      return;
    }
    const objectApiName = (this.objectApiName || '').trim();
    if (!objectApiName) {
      return;
    }
    const existing =
      typeof this._editor.getFieldMapping === 'function'
        ? this._editor.getFieldMapping()
        : null;
    if (!force && existing && existing.sourceSample != null) {
      return;
    }
    try {
      const sampleJson = await buildSourceSampleJson({ objectApiName });
      if (!sampleJson) {
        return;
      }
      this._editor.setFieldMapping({
        kind: 'fieldMapping',
        version: 1,
        rules: (existing && existing.rules) || [],
        expression: existing && existing.expression,
        sourceSample: JSON.parse(sampleJson)
      });
    } catch (err) {
      // Non-blocking: user can still Upload JSON or open Field Mapping.
    }
  }

  _applyTemplateDto(dto) {
    this._templateId = dto.id;
    this.templateName = dto.name || '';
    this.objectApiName = dto.objectApiName || '';
    this.pdfFilename = dto.pdfFilename || '';
    this.description = dto.description || '';
    this.accessGroupId = dto.accessGroupId || '';
    this.hideEmpty = dto.hideEmpty === true;
    this.attachFile = dto.attachFile !== false;
    this.outputFormat = dto.outputFormat === 'html' ? 'html' : 'pdf';
    this.isActive = dto.isActive !== false;
    this.version = dto.version;
    this.versionId = dto.versionId || null;
    this._loadedVersionId = dto.versionId || null;
    this._ensureAccessGroupOption();
  }

  async _refreshVersionOptions() {
    if (!this._templateId) {
      this.versionOptions = [];
      this._versionDetailById = {};
      return;
    }
    try {
      const rows = await listVersions({ templateId: this._templateId });
      const detailById = {};
      this.versionOptions = (rows || []).map((v) => {
        detailById[v.id] = this._formatVersionDetail(v);
        return {
          label: this._formatVersionOptionLabel(v),
          value: v.id
        };
      });
      this._versionDetailById = detailById;
    } catch (err) {
      this.versionOptions = [];
      this._versionDetailById = {};
      this._showError('Failed to load versions', err);
    }
  }

  _formatVersionOptionLabel(v) {
    const ver = v.version != null ? v.version : '?';
    const current = v.isCurrent ? ' (current)' : '';
    const when = v.createdDate ? ` · ${this._formatVersionCreatedDateShort(v.createdDate)}` : '';
    return `v${ver}${current}${when}`;
  }

  _formatVersionDetail(v) {
    const ver = v.version != null ? v.version : '?';
    const by = v.createdByName ? v.createdByName : 'Unknown user';
    const created = v.createdDate
      ? this._formatVersionCreatedDate(v.createdDate)
      : 'Unknown date';
    return `v${ver}: ${by}, ${created}.`;
  }

  _formatVersionCreatedDateShort(value) {
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) {
        return String(value);
      }
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(value);
    }
  }

  _formatVersionCreatedDate(value) {
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) {
        return String(value);
      }
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(value);
    }
  }

  async handleVersionChange(event) {
    const nextId = event.target.value;
    if (!nextId || !this._editor || nextId === this.versionId) {
      return;
    }
    const previousVersionId = this._loadedVersionId;
    try {
      this.editorBusy = true;
      const dto = await getVersion({ versionId: nextId });
      this._applyTemplateDto(dto);
      const data = parseJsonSafe(dto.templateJson, emptyDocument());
      await this._editor.load(data);
      if (data.fieldMapping && typeof this._editor.setFieldMapping === 'function') {
        this._editor.setFieldMapping(data.fieldMapping);
      } else if (typeof this._editor.setFieldMapping === 'function') {
        this._editor.setFieldMapping(null);
      }
      await this._ensureSourceSample({ force: true });
      this._showToast('Version loaded', `Editing v${dto.version}. Save creates a new version.`, 'info');
    } catch (err) {
      this._showError('Failed to load version', err);
      this.versionId = previousVersionId;
      this._loadedVersionId = previousVersionId;
    } finally {
      this.editorBusy = false;
    }
  }

  _ensureAccessGroupOption() {
    if (!this.accessGroupId) {
      return;
    }
    const opts = this.accessGroupOptions || [];
    if (opts.some((o) => o.value === this.accessGroupId)) {
      return;
    }
    this.accessGroupOptions = [
      ...opts,
      { label: `Unknown group (${this.accessGroupId})`, value: this.accessGroupId }
    ];
  }

  handleNameChange(event) {
    this.templateName = event.target.value;
  }

  async handleObjectApiNameChange(event) {
    this.objectApiName = event.target.value;
    // Refresh Database tab paths when Source Object changes.
    await this._ensureSourceSample({ force: true });
  }

  handleDescriptionChange(event) {
    this.description = event.target.value;
  }

  handleAccessGroupIdChange(event) {
    this.accessGroupId = event.target.value || '';
  }

  handleHideEmptyChange(event) {
    this.hideEmpty = event.target.checked === true;
  }

  handleAttachFileChange(event) {
    this.attachFile = event.target.checked === true;
  }

  handleOutputFormatChange(event) {
    this.outputFormat = event.target.value === 'html' ? 'html' : 'pdf';
  }

  handleActiveChange(event) {
    this.isActive = event.target.checked === true;
  }

  async handleFillingModeChange(event) {
    this.fillingMode = event.target.checked === true;
    if (!this._editor || typeof this._editor.setDesignMode !== 'function') {
      return;
    }
    try {
      this.editorBusy = true;
      await this._editor.setDesignMode(!this.fillingMode);
    } catch (err) {
      this._showError('Mode switch failed', err);
      this.fillingMode = !this.fillingMode;
      const filling = this.template.querySelector('[data-meta="filling-mode"]');
      if (filling) filling.checked = this.fillingMode;
    } finally {
      this.editorBusy = false;
    }
  }

  async handleExportFullDocument() {
    if (!this._editor) return;
    try {
      this.editorBusy = true;
      const data =
        typeof this._editor.exportDoc === 'function'
          ? await this._editor.exportDoc()
          : null;
      if (!data) {
        throw new Error('exportDoc is not available on the editor.');
      }
      this._downloadJson(data, this._fileBase() + '-full-document.json');
      this._showToast('Exported', 'Full document downloaded.', 'success');
    } catch (err) {
      this._showError('Export full document failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async handleExportTemplate() {
    if (!this._editor) return;
    try {
      this.editorBusy = true;
      const data = await this._editor.exportTemplate();
      if (typeof this._editor.getFieldMapping === 'function') {
        const mapping = this._editor.getFieldMapping();
        if (mapping) data.fieldMapping = mapping;
      }
      this._downloadJson(data, this._fileBase() + '-template.json');
      this._showToast('Exported', 'Template downloaded.', 'success');
    } catch (err) {
      this._showError('Export template failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async handleExportValues() {
    if (!this._editor) return;
    try {
      this.editorBusy = true;
      const data =
        typeof this._editor.exportFields === 'function'
          ? await this._editor.exportFields()
          : null;
      if (!data) {
        throw new Error('exportFields is not available on the editor.');
      }
      this._downloadJson(data, this._fileBase() + '-values.json');
      this._showToast('Exported', 'Values downloaded.', 'success');
    } catch (err) {
      this._showError('Export values failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async handleExportScenarioValues() {
    if (!this._editor) return;
    try {
      this.editorBusy = true;
      const data =
        typeof this._editor.exportFields === 'function'
          ? await this._editor.exportFields({ omitMappedFields: true })
          : null;
      if (!data) {
        throw new Error('exportFields is not available on the editor.');
      }
      this._downloadJson(data, this._fileBase() + '-scenario-values.json');
      this._showToast(
        'Exported',
        'Scenario values downloaded (mapped fields excluded).',
        'success'
      );
    } catch (err) {
      this._showError('Export scenario values failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  handleImportClick() {
    this._openFilePicker('auto');
  }

  /**
   * Detect import payload type from export `kind` (or structure fallbacks).
   * @returns {'document' | 'template' | 'values'}
   */
  _detectImportKind(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('File is not valid JSON.');
    }
    const kind = data.kind;
    if (kind === 'template') return 'template';
    if (kind === 'field') return 'values';
    if (kind === 'document') {
      // Values packs may misuse document kind without blocks.
      if (!Array.isArray(data.blocks) && (data.values || data.sections)) {
        return 'values';
      }
      return 'document';
    }
    if (Array.isArray(data.blocks)) {
      return data.fieldSchemas || data.time || data.pageSetup ? 'document' : 'template';
    }
    if (data.values || data.sections) return 'values';
    if (data.fieldSchemas) return 'template';
    throw new Error(
      'Unrecognized JSON. Expected a DocEngine export with kind "document", "template", or "field".'
    );
  }

  async handleImportFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !this._editor) return;

    try {
      this.editorBusy = true;
      const data = parseJsonSafe(await file.text(), null);
      if (!data || typeof data !== 'object') {
        throw new Error('File is not valid JSON.');
      }

      const detected = this._detectImportKind(data);

      if (detected === 'document') {
        await this._editor.load(data);
        this._showToast('Imported', 'Full document loaded into the editor.', 'success');
        return;
      }

      if (detected === 'template') {
        const confirmed = await LightningConfirm.open({
          message: 'Load template? Current layout and field schemas will be replaced.',
          variant: 'header',
          label: 'Import template',
          theme: 'warning'
        });
        if (!confirmed) {
          return;
        }
        await this._editor.load(data);
        if (data.fieldMapping && typeof this._editor.setFieldMapping === 'function') {
          this._editor.setFieldMapping(data.fieldMapping);
        }
        this._showToast('Imported', 'Template loaded. Save to persist on the record.', 'success');
        return;
      }

      // values
      if (!data.values && !data.sections) {
        throw new Error('Values file has no values or sections.');
      }
      await this._editor.load(data, { omitMappedFields: true });
      this._showToast(
        'Imported',
        'Values applied (mapped fields left for merge).',
        'success'
      );
    } catch (err) {
      this._showError('Import failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  _openFilePicker(kind) {
    const input = this.template.querySelector(`input[data-import="${kind}"]`);
    if (input) input.click();
  }

  _fileBase() {
    const name = (this.templateName || 'document').trim().replace(/[^\w.-]+/g, '_');
    return name || 'document';
  }

  _downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async handleFieldMapping() {
    if (!this._editor || typeof this._editor.openFieldMapping !== 'function') {
      this._showToast('Unavailable', 'Field mapping UI is not available in this build.', 'warning');
      return;
    }
    const objectApiName = (this.objectApiName || '').trim();
    if (!objectApiName) {
      this._showToast(
        'Source Object required',
        'Set Source Object on the template before mapping fields.',
        'warning'
      );
      return;
    }
    try {
      this.editorBusy = true;
      const existing =
        typeof this._editor.getFieldMapping === 'function'
          ? this._editor.getFieldMapping()
          : null;
      const spec = {
        kind: 'fieldMapping',
        version: 1,
        rules: (existing && existing.rules) || [],
        expression: existing && existing.expression,
        sourceSample: existing && existing.sourceSample
      };

      // Prefer live describe sample when opening (keeps paths aligned with merge payload)
      try {
        const sampleJson = await buildSourceSampleJson({ objectApiName });
        if (sampleJson) {
          spec.sourceSample = JSON.parse(sampleJson);
        }
      } catch (sampleErr) {
        this._showToast(
          'Sample JSON',
          (sampleErr && sampleErr.body && sampleErr.body.message) ||
            (sampleErr && sampleErr.message) ||
            'Could not build Source Object sample — paste JSON manually.',
          'warning'
        );
      }

      await this._editor.openFieldMapping({
        spec,
        onExpandSourcePath: async (path) => {
          const json = await buildRelatedSampleJson({
            objectApiName,
            relationshipPath: path
          });
          return json ? JSON.parse(json) : null;
        }
      });
    } catch (err) {
      const message = (err && err.message) || String(err || '');
      if (err && message !== 'cancelled') {
        this._showError('Field mapping failed', err);
      }
    } finally {
      this.editorBusy = false;
    }
  }

  async handleSave() {
    if (!this._editor) {
      return;
    }
    if (!this.templateName || !this.objectApiName) {
      this._showToast('Missing fields', 'Template name and Object API name are required.', 'warning');
      return;
    }
    try {
      this.editorBusy = true;
      const templateJson = await this._editor.exportTemplate();
      if (typeof this._editor.getFieldMapping === 'function') {
        const mapping = this._editor.getFieldMapping();
        if (mapping) {
          templateJson.fieldMapping = mapping;
        } else {
          delete templateJson.fieldMapping;
        }
      }

      const dto = {
        name: String(this.templateName || '').trim(),
        objectApiName: String(this.objectApiName || '').trim(),
        templateJson: JSON.stringify(templateJson),
        isActive: this.isActive,
        description: this.description || '',
        pdfFilename: this.pdfFilename || '',
        hideEmpty: this.hideEmpty === true,
        attachFile: this.attachFile !== false,
        outputFormat: this.outputFormat === 'html' ? 'html' : 'pdf'
      };
      if (this._templateId) {
        dto.id = this._templateId;
      }
      const accessGroupId = String(this.accessGroupId || '').trim();
      if (accessGroupId) {
        dto.accessGroupId = accessGroupId;
      }

      const saved = JSON.parse(await saveTemplateJson({ dtoJson: JSON.stringify(dto) }));

      this._applyTemplateDto(saved);
      await this._refreshVersionOptions();
      this._showToast('Saved', `Template saved as v${saved.version || 1}.`, 'success');
    } catch (err) {
      this._showError('Save failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async _resolveListItems({ fieldName, query, schema, sourceCollection: sourceFromArg }) {
    let sourceCollection =
      (sourceFromArg && String(sourceFromArg).trim()) ||
      (schema && schema.sourceCollection && String(schema.sourceCollection).trim()) ||
      '';
    // Field Name is often a label like "list", not an SObject — fall back to template object.
    if (!sourceCollection && !(fieldName || '').includes('.')) {
      sourceCollection = (this.objectApiName || '').trim();
    }
    try {
      const rows = await resolveListItems({
        fieldName: fieldName || '',
        query: query || '',
        sourceCollection
      });
      return (rows || []).map((row) => ({
        id: row.id,
        label: row.label,
        value: row.value != null ? row.value : row.label,
        code: row.code
      }));
    } catch (err) {
      const msg =
        (err && err.body && (err.body.message || err.body.exceptionMessage)) ||
        (err && err.message) ||
        'List search failed';
      throw new Error(msg);
    }
  }

  async _remoteListCollections() {
    const objectApiName = (this.objectApiName || '').trim();
    if (!objectApiName) {
      return { bookmarks: [], tree: [] };
    }
    try {
      const nodes = await listRemoteCollections({ objectApiName });
      return {
        bookmarks: [],
        tree: (nodes || []).map((n) => ({
          id: n.id,
          label: n.label,
          kind: n.kind || 'collection',
          collectionId: n.collectionId || n.id
        }))
      };
    } catch (e) {
      return { bookmarks: [], tree: [] };
    }
  }

  async _remoteListLabelFields(collection) {
    try {
      const fields = await listRemoteLabelFields({ collectionId: collection });
      return (fields || []).map((f) => ({ id: f.id, label: f.label }));
    } catch (e) {
      return [];
    }
  }

  _destroyEditor() {
    if (this._editor && typeof this._editor.destroy === 'function') {
      this._editor.destroy();
    }
    this._editor = null;
    this._editorInitialized = false;
  }

  _showToast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }

  _showError(title, err) {
    const message = apexErrorMessage(err);
    this.dispatchEvent(new ShowToastEvent({ title, message, variant: 'error', mode: 'sticky' }));
  }
}