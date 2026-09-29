import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LightningPrompt from 'lightning/prompt';
import LightningConfirm from 'lightning/confirm';
import getObjectApiName from '@salesforce/apex/DocEngineTemplateController.getObjectApiName';
import listForObject from '@salesforce/apex/DocEngineTemplateController.listForObject';
import getTemplate from '@salesforce/apex/DocEngineTemplateController.getTemplate';
import buildPayload from '@salesforce/apex/DocEngineMergeController.buildPayload';
import saveInstanceJson from '@salesforce/apex/DocEngineInstanceController.saveInstanceJson';
import generateAndSavePdf from '@salesforce/apex/DocEnginePdfController.generateAndSavePdf';
import resolveListItems from '@salesforce/apex/DocEngineListController.resolveListItems';
import listValueSets from '@salesforce/apex/DocEngineValueSetController.listValueSets';
import getValueSet from '@salesforce/apex/DocEngineValueSetController.getValueSet';
import saveValueSetJson from '@salesforce/apex/DocEngineValueSetController.saveValueSetJson';
import {
  ensureDocEngineAssets,
  createDocEditor,
  resolveCreateDocEditorOptions,
  checkPdfAvailable,
  resolvePdfProvider,
  exportHtmlForPdf,
  emptyDocument,
  parseJsonSafe,
  replaceEmbeddedImageDataUrls,
  assertDocumentJsonSize,
  apexErrorMessage
} from 'c/docEngineLib';

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'Draft' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Signed', value: 'Signed' }
];

export default class DocEngineFiller extends LightningElement {
  /** Source Salesforce record Id (Account, Opportunity, …) */
  @api recordId;
  /** Optional existing DocEngine_Document__c to reopen */
  @api instanceId;

  objectApiName = '';
  selectedTemplateId = '';
  templateOptions = [];
  templatesLoading = false;
  showEditor = false;
  status = 'Draft';
  statusMessage = '';
  editorBusy = false;
  pdfAvailable = false;
  pdfProvider = 'Salesforce';
  selectedValueSetId = '';
  valueSetOptions = [];
  scenarioPanelOpen = false;

  _editor = null;
  _editorInitialized = false;
  _pendingInit = false;
  _instanceId = null;
  _pdfFilename = 'document.pdf';
  _hideEmpty = false;
  _templateDto = null;
  _initialData = null;
  _fieldMapping = null;
  _mergePayload = null;

  get statusOptions() {
    return STATUS_OPTIONS;
  }

  get savePdfDisabled() {
    return this.editorBusy || !this.pdfAvailable;
  }

  get savePdfTitle() {
    if (!this.pdfAvailable) {
      return 'Uncheck DocEngine Settings → Use External PDF, or install DocEngine_PDF for External';
    }
    return this.pdfProvider === 'External'
      ? 'Save document, then generate PDF via DocEngine_PDF / pdf-service and attach to Files'
      : 'Save document, then generate PDF with Salesforce HTML→PDF and attach to Files';
  }

  get templatePlaceholder() {
    if (this.templatesLoading) {
      return 'Loading templates…';
    }
    if (!this.templateOptions.length) {
      return 'No active templates for this object';
    }
    return 'Select a template';
  }

  get loadDisabled() {
    return !this.selectedTemplateId || this.templatesLoading || this.editorBusy;
  }

  get valueSetPlaceholder() {
    if (!this.valueSetOptions.length) {
      return 'No scenarios for this template';
    }
    return 'Select a scenario';
  }

  get loadScenarioDisabled() {
    return !this.selectedValueSetId || this.editorBusy || !this._editor;
  }

  connectedCallback() {
    this._instanceId = this.instanceId || null;
    Promise.all([checkPdfAvailable(), resolvePdfProvider()]).then(([ok, provider]) => {
      this.pdfAvailable = ok;
      this.pdfProvider = provider || 'Salesforce';
    });
    if (this.recordId) {
      this._loadObjectAndTemplates();
    }
  }

  renderedCallback() {
    if (!this._pendingInit || this._editorInitialized) {
      return;
    }
    const editorRoot = this.template.querySelector('.editor-root');
    const stickyChrome = this.template.querySelector('.sticky-chrome');
    const docActions = this.template.querySelector('.doc-actions');
    if (!editorRoot || !stickyChrome || !docActions) {
      return;
    }
    this._pendingInit = false;
    this._mountEditor(editorRoot, stickyChrome, docActions);
  }

  disconnectedCallback() {
    this._destroyEditor();
  }

  async _loadObjectAndTemplates() {
    this.templatesLoading = true;
    try {
      this.objectApiName = await getObjectApiName({ recordId: this.recordId });
      const list = await listForObject({ objectApiName: this.objectApiName });
      this.templateOptions = (list || []).map((t) => ({
        label: t.version ? `${t.name} (v${t.version})` : t.name,
        value: t.id
      }));
      if (this.templateOptions.length === 1) {
        this.selectedTemplateId = this.templateOptions[0].value;
      }
    } catch (err) {
      this._showError('Failed to load templates', err);
    } finally {
      this.templatesLoading = false;
    }
  }

  handleTemplateChange(event) {
    this.selectedTemplateId = event.detail.value;
    this.selectedValueSetId = '';
    this.valueSetOptions = [];
  }

  handleStatusChange(event) {
    this.status = event.detail.value;
  }

  handleValueSetChange(event) {
    this.selectedValueSetId = event.detail.value;
  }

  async handleScenarioPanelToggle(event) {
    this.scenarioPanelOpen = event.target.checked === true;
    if (this.scenarioPanelOpen && !this.valueSetOptions.length) {
      await this._refreshValueSets();
    }
  }

  async handleLoadTemplate() {
    if (!this.selectedTemplateId || !this.recordId) {
      return;
    }
    this.editorBusy = true;
    this.statusMessage = 'Loading template…';
    try {
      await ensureDocEngineAssets(this);
      this._templateDto = await getTemplate({ templateId: this.selectedTemplateId });
      this._pdfFilename = this._templateDto.pdfFilename || 'document.pdf';
      this._hideEmpty = this._templateDto.hideEmpty === true;
      this._initialData = parseJsonSafe(this._templateDto.templateJson, emptyDocument());

      // Mapping is embedded in Template_JSON__c as fieldMapping
      this._fieldMapping =
        (this._initialData && this._initialData.fieldMapping) || null;

      try {
        this._mergePayload = await buildPayload({
          recordId: this.recordId,
          templateId: this.selectedTemplateId,
          templateVersionId: null
        });
      } catch (mergeErr) {
        this._mergePayload = null;
        this._showToast(
          'Merge skipped',
          (mergeErr && mergeErr.body && mergeErr.body.message) ||
            (mergeErr && mergeErr.message) ||
            'Could not build merge payload.',
          'warning'
        );
      }

      this._destroyEditor();
      this.showEditor = true;
      this._pendingInit = true;
      this.statusMessage = `Loaded “${this._templateDto.name}”`;
      this.scenarioPanelOpen = false;
      this.selectedValueSetId = '';
      this.valueSetOptions = [];
    } catch (err) {
      this._showError('Failed to load template', err);
      this.showEditor = false;
    } finally {
      this.editorBusy = false;
    }
  }

  async _refreshValueSets() {
    this.selectedValueSetId = '';
    this.valueSetOptions = [];
    if (!this.selectedTemplateId) {
      return;
    }
    try {
      const list = await listValueSets({ templateId: this.selectedTemplateId });
      this.valueSetOptions = (list || []).map((row) => ({
        label: this._scenarioOptionLabel(row),
        value: row.id,
        name: row.name
      }));
    } catch (err) {
      this.valueSetOptions = [];
      this._showToast(
        'Scenarios unavailable',
        apexErrorMessage(err) || 'Could not load value sets.',
        'warning'
      );
    }
  }

  _scenarioOptionLabel(row) {
    const name = (row && row.name) || '';
    const description = row && row.description ? String(row.description).trim() : '';
    if (!description) {
      return name;
    }
    return `${name} — ${description}`;
  }

  async handleLoadScenario() {
    if (!this._editor || !this.selectedValueSetId) {
      return;
    }
    try {
      this.editorBusy = true;
      const dto = await getValueSet({ valueSetId: this.selectedValueSetId });
      const data = parseJsonSafe(dto && dto.valuesJson, null);
      if (!data || (!data.sections && !data.values)) {
        throw new Error('Scenario has no values.');
      }
      await this._editor.load(data, { omitMappedFields: true });
      this._showToast('Scenario loaded', `Applied “${dto.name}” (mapped fields kept).`, 'success');
    } catch (err) {
      this._showError('Load scenario failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async handleSaveScenario() {
    if (!this._editor || !this.selectedTemplateId) {
      return;
    }
    try {
      this.editorBusy = true;
      const values =
        typeof this._editor.exportFields === 'function'
          ? await this._editor.exportFields({ omitMappedFields: true })
          : null;
      if (!values) {
        throw new Error('exportFields is not available on the editor.');
      }
      const valuesJson = JSON.stringify(values);
      assertDocumentJsonSize(valuesJson);

      let valueSetId = this.selectedValueSetId || null;
      let name = '';
      if (valueSetId) {
        const selected = (this.valueSetOptions || []).find((o) => o.value === valueSetId);
        name = selected ? selected.name || selected.label : '';
        const overwrite = await LightningConfirm.open({
          message: `Overwrite scenario “${name || 'selected'}” with current unmapped values?`,
          variant: 'header',
          label: 'Save scenario',
          theme: 'warning'
        });
        if (!overwrite) {
          valueSetId = null;
          name = '';
        }
      }
      if (!valueSetId) {
        name = await LightningPrompt.open({
          message: 'Name for this scenario (unmapped field values only).',
          label: 'Save as scenario',
          defaultValue: name || ''
        });
        if (!name || !String(name).trim()) {
          return;
        }
        name = String(name).trim();
      }

      const savedRaw = await saveValueSetJson({
        dtoJson: JSON.stringify({
          id: valueSetId,
          templateId: this.selectedTemplateId,
          name,
          isActive: true,
          valuesJson
        })
      });
      const saved = typeof savedRaw === 'string' ? JSON.parse(savedRaw) : savedRaw;
      await this._refreshValueSets();
      this.selectedValueSetId = saved.id;
      this._showToast('Scenario saved', `Saved “${saved.name}”.`, 'success');
    } catch (err) {
      this._showError('Save scenario failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async _mountEditor(editorRoot, stickyChrome, docActions) {
    try {
      this._editor = createDocEditor(
        await resolveCreateDocEditorOptions({
          holder: editorRoot,
          chromeParent: stickyChrome,
          documentActionsContainer: docActions,
          designMode: false,
          data: this._initialData || emptyDocument(),
          recordId: this.recordId,
          resolveListItems: this._resolveListItems.bind(this),
          onShareDocument: (artifact) => this._openShareDialog(artifact)
        })
      );

      await this._editor.ready;

      if (this._fieldMapping && typeof this._editor.setFieldMapping === 'function') {
        this._editor.setFieldMapping(this._fieldMapping);
      }

      if (
        this._fieldMapping &&
        this._mergePayload &&
        typeof this._editor.applyFieldMapping === 'function'
      ) {
        try {
          await this._editor.applyFieldMapping(this._mergePayload);
        } catch (e) {
          this._showToast(
            'Merge warning',
            (e && e.message) || 'applyFieldMapping failed — fill fields manually.',
            'warning'
          );
        }
      }

      this._editorInitialized = true;
    } catch (err) {
      this._showError('Failed to start editor', err);
    }
  }

  async handleRemerge() {
    if (!this._editor || !this.selectedTemplateId || !this.recordId) {
      return;
    }
    if (!this._fieldMapping) {
      this._showToast('No mapping', 'This template has no field mapping to re-merge.', 'warning');
      return;
    }
    try {
      this.editorBusy = true;
      const payload = await buildPayload({
        recordId: this.recordId,
        templateId: this.selectedTemplateId,
        templateVersionId: null
      });
      if (typeof this._editor.setFieldMapping === 'function') {
        this._editor.setFieldMapping(this._fieldMapping);
      }
      if (typeof this._editor.applyFieldMapping === 'function') {
        await this._editor.applyFieldMapping(payload);
        this._showToast('Merged', 'Record fields applied to the document.', 'success');
      }
    } catch (err) {
      this._showError('Re-merge failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async handleSave() {
    if (!this._editor || !this.recordId || !this.selectedTemplateId) {
      return;
    }
    try {
      this.editorBusy = true;
      await this._saveInstanceOnly();
      this._showToast('Saved', 'Document saved.', 'success');
    } catch (err) {
      this._showError('Save failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async handleSaveAndPdf() {
    if (!this._editor || !this.recordId || !this.selectedTemplateId) {
      return;
    }
    try {
      this.editorBusy = true;
      await this._saveInstanceOnly();
      this.statusMessage = 'Generating PDF…';
      const html =
        this.pdfProvider === 'Salesforce'
          ? await exportHtmlForPdf(this._editor, {
              title: this._pdfFilename.replace(/\.pdf$/i, '') || 'document',
              hideEmptyValues: this._hideEmpty === true
            })
          : null;
      const pdfResult = await generateAndSavePdf({
        docInstanceId: this._instanceId,
        html
      });
      this.statusMessage = `Saved ${this._instanceId} · PDF attached`;
      this._showToast(
        'Saved + PDF',
        'Document saved and PDF attached to Files' +
          (pdfResult && pdfResult.contentDocumentId ? ` (${pdfResult.contentDocumentId})` : '') +
          '.',
        'success'
      );
    } catch (err) {
      this._showError('Save + PDF failed', err);
    } finally {
      this.editorBusy = false;
    }
  }

  async _saveInstanceOnly() {
    let values =
      typeof this._editor.exportFields === 'function'
        ? await this._editor.exportFields()
        : null;
    if (!values) {
      throw new Error('exportFields is not available on the editor.');
    }
    values = await replaceEmbeddedImageDataUrls(values, this.recordId);
    if (this._editor && typeof this._editor.load === 'function') {
      try {
        await this._editor.load(values);
      } catch (e) {
        // Non-fatal: JSON save still uses cleaned values.
      }
    }
    const documentJson = JSON.stringify(values);
    assertDocumentJsonSize(documentJson);
    const savedRaw = await saveInstanceJson({
      dtoJson: JSON.stringify({
        id: this._instanceId || null,
        templateId: this.selectedTemplateId,
        templateVersionId: (this._templateDto && this._templateDto.versionId) || null,
        recordId: this.recordId,
        objectApiName: this.objectApiName,
        documentJson,
        status: this.status,
        completedDate: null
      })
    });
    const saved = typeof savedRaw === 'string' ? JSON.parse(savedRaw) : savedRaw;
    this._instanceId = saved.id;
    this.statusMessage = `Saved ${saved.name || saved.id}`;
    return saved;
  }

  _openShareDialog(artifact) {
    const dialog = this.template.querySelector('c-doc-engine-share-dialog');
    if (!dialog || typeof dialog.show !== 'function') {
      this._showToast(
        'Share unavailable',
        'Share dialog failed to load. Redeploy docEngineShareDialog.',
        'error'
      );
      return;
    }
    dialog.show(artifact, {
      ensureSaved: async () => {
        await this._saveInstanceOnly();
        return this._instanceId;
      }
    });
  }

  async _resolveListItems({ fieldName, query, schema, sourceCollection: sourceFromArg }) {
    let sourceCollection =
      (sourceFromArg && String(sourceFromArg).trim()) ||
      (schema && schema.sourceCollection && String(schema.sourceCollection).trim()) ||
      '';
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
