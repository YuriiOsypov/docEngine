import { api } from 'lwc';
import LightningModal from 'lightning/modal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LightningConfirm from 'lightning/confirm';
import LightningPrompt from 'lightning/prompt';
import getTemplate from '@salesforce/apex/DocEngineTemplateController.getTemplate';
import buildPayload from '@salesforce/apex/DocEngineMergeController.buildPayload';
import saveInstanceJson from '@salesforce/apex/DocEngineInstanceController.saveInstanceJson';
import saveHtml from '@salesforce/apex/DocEngineInstanceController.saveHtml';
import getInstance from '@salesforce/apex/DocEngineInstanceController.getInstance';
import generateAndSavePdf from '@salesforce/apex/DocEnginePdfController.generateAndSavePdf';
import resolveListItems from '@salesforce/apex/DocEngineListController.resolveListItems';
import resolveTemplateId from '@salesforce/apex/DocEngineButtonController.resolveTemplateId';
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
  resolveReopenEditorData,
  replaceEmbeddedImageDataUrls,
  assertDocumentJsonSize,
  apexErrorMessage
} from 'c/docEngineLib';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export default class DocEngineModal extends LightningModal {
  @api recordId;
  @api objectApiName;
  @api templateId;
  @api fillMode;
  /** Finish attach format: pdf (default) or html. `none` is treated as pdf. */
  @api exportMode = 'pdf';
  @api showPreview;
  @api hideEmpty;
  @api attachToRecord;
  /** When set, reopen an existing DocEngine_Document__c for edit. */
  @api instanceId;
  /**
   * Open Document preview (HTML + View as PDF) immediately — no fill chrome / Finish.
   * Closing the preview dismisses this modal.
   */
  @api previewOnly;

  templateName = 'DocEngine';
  errorMessage = '';
  busy = false;
  showSpinner = true;
  showEditor = false;
  selectedValueSetId = '';
  valueSetOptions = [];
  scenarioPanelOpen = false;

  _editor = null;
  _editorInitialized = false;
  _pendingInit = false;
  _instanceId = null;
  _pdfAvailable = false;
  _pdfProvider = 'Salesforce';
  _resolvedTemplateId = '';
  _templateDto = null;
  _initialData = null;
  _fieldMapping = null;
  _mergePayload = null;
  _autoFinishAfterMount = false;
  _openPreviewAfterMount = false;
  _previewOnlyAwaitingClose = false;
  _pendingValues = null;
  _bootstrapped = false;
  _recordIdFallback = '';
  _objectApiNameFallback = '';
  /** Current DocEngine_Document__c status; new docs start as Draft. */
  _documentStatus = 'Draft';
  /** True while Document preview overlay is open (Cancel closes preview only). */
  _previewOpen = false;
  /** True while a nested field dialog (list/tree/…) is open — keep ESC on the dialog. */
  _nestedModalOpen = false;
  _onHostKeydown = null;
  /** Fast dirty flag; set only by real user edits. Confirm skipped when false. */
  _dirty = false;
  _baselineValuesJson = null;
  _confirmCloseBusy = false;
  _onEditorDomInput = null;
  /** Ignore dirty marks during initial load/merge. */
  _suppressDirty = true;

  get effectiveRecordId() {
    return this.recordId || this._recordIdFallback || '';
  }

  get effectiveObjectApiName() {
    return this.objectApiName || this._objectApiNameFallback || '';
  }

  /** Save Draft is for Fill mode when the document is not already Completed. */
  get showSaveDraft() {
    return (
      !this.isPreviewOnly &&
      this._asBool(this.fillMode, true) &&
      this._documentStatus !== 'Completed'
    );
  }

  get isPreviewOnly() {
    return this._asBool(this.previewOnly, false);
  }

  get showFillFooter() {
    return !this.isPreviewOnly;
  }

  get showModalFooter() {
    return !this.isPreviewOnly;
  }

  get showScenarioBar() {
    return (
      !this.isPreviewOnly &&
      this._asBool(this.fillMode, true) &&
      !!this._resolvedTemplateId
    );
  }

  get valueSetPlaceholder() {
    if (!this.valueSetOptions.length) {
      return 'No scenarios';
    }
    return 'Select a scenario';
  }

  get loadScenarioDisabled() {
    return this.busy || !this.selectedValueSetId || !this._editor;
  }

  get modalHeaderLabel() {
    return this.isPreviewOnly ? 'Document preview' : this.templateName;
  }

  get shellClass() {
    return this.isPreviewOnly ? 'doc-shell doc-shell--preview-only' : 'doc-shell';
  }

  connectedCallback() {
    // Header ✕ stays enabled (see close() override → handleCancel).
    // Esc is blocked in _handleHostKeydown so it only closes nested overlays.
    this.disableClose = false;
    this._onHostKeydown = (event) => this._handleHostKeydown(event);
    // Capture in the LWC realm so Esc is blocked even when focus left the editor sandbox.
    window.addEventListener('keydown', this._onHostKeydown, true);
    Promise.all([checkPdfAvailable(), resolvePdfProvider()]).then(([ok, provider]) => {
      this._pdfAvailable = ok;
      this._pdfProvider = provider || 'Salesforce';
    });
    this._bootstrap();
  }

  disconnectedCallback() {
    if (this._onHostKeydown) {
      window.removeEventListener('keydown', this._onHostKeydown, true);
      this._onHostKeydown = null;
    }
    this._destroyEditor();
  }

  renderedCallback() {
    if (!this._pendingInit || this._editorInitialized) return;
    const editorRoot = this.template.querySelector('.editor-root');
    const stickyChrome = this.template.querySelector('.sticky-chrome');
    const docActions = this.template.querySelector('.doc-actions');
    if (!editorRoot || !stickyChrome || !docActions) return;
    this._pendingInit = false;
    this._mountEditor(editorRoot, stickyChrome, docActions);
  }

  async _bootstrap() {
    if (this._bootstrapped) return;
    this._bootstrapped = true;
    this.showSpinner = true;
    this.errorMessage = '';
    try {
      await ensureDocEngineAssets(this);

      if (this.instanceId) {
        const inst = await getInstance({ instanceId: this.instanceId });
        this._instanceId = inst.id;
        this._resolvedTemplateId = inst.templateId;
        this._recordIdFallback = inst.recordId || '';
        this._objectApiNameFallback = inst.objectApiName || '';
        this._documentStatus = inst.status || 'Draft';
        const dto = await getTemplate({ templateId: this._resolvedTemplateId });
        this._templateDto = dto;
        this.templateName = (dto && dto.name) || inst.name || 'DocEngine';
        const templateJson = inst.templateJson || (dto && dto.templateJson);
        const reopen = resolveReopenEditorData(inst.documentJson, templateJson);
        this._initialData = reopen.initialData;
        this._pendingValues = reopen.pendingValues;
        const templateData = parseJsonSafe(templateJson, emptyDocument());
        this._fieldMapping =
          (templateData && templateData.fieldMapping) ||
          (reopen.initialData && reopen.initialData.fieldMapping) ||
          null;
        this.showEditor = true;
        this._pendingInit = true;
        this._autoFinishAfterMount = false;
        this._openPreviewAfterMount = this._asBool(this.previewOnly, false);
        this._applyTemplateRunSettings(dto);
        this.scenarioPanelOpen = false;
        this.selectedValueSetId = '';
        this.valueSetOptions = [];
        return;
      }

      this._resolvedTemplateId = await resolveTemplateId({ templateId: this.templateId });
      const dto = await getTemplate({ templateId: this._resolvedTemplateId });
      this._templateDto = dto;
      this.templateName = dto.name || 'DocEngine';
      this._initialData = parseJsonSafe(dto.templateJson, emptyDocument());
      this._fieldMapping =
        (this._initialData && this._initialData.fieldMapping) || null;
      this._applyTemplateRunSettings(dto);

      try {
        this._mergePayload = await buildPayload({
          recordId: this.effectiveRecordId,
          templateId: this._resolvedTemplateId,
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

      this.showEditor = true;
      this._pendingInit = true;
      this._autoFinishAfterMount = !this._asBool(this.fillMode, true);
      this.scenarioPanelOpen = false;
      this.selectedValueSetId = '';
      this.valueSetOptions = [];
    } catch (err) {
      this._showError('DocEngine', err);
    } finally {
      this.showSpinner = false;
    }
  }

  async _refreshValueSets() {
    this.selectedValueSetId = '';
    this.valueSetOptions = [];
    if (!this._resolvedTemplateId) {
      return;
    }
    try {
      const list = await listValueSets({ templateId: this._resolvedTemplateId });
      this.valueSetOptions = (list || []).map((row) => ({
        label: this._scenarioOptionLabel(row),
        value: row.id,
        name: row.name
      }));
    } catch (err) {
      this.valueSetOptions = [];
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

  handleValueSetChange(event) {
    this.selectedValueSetId = event.detail.value;
  }

  async handleScenarioPanelToggle(event) {
    this.scenarioPanelOpen = event.target.checked === true;
    if (this.scenarioPanelOpen && !this.valueSetOptions.length) {
      await this._refreshValueSets();
    }
  }

  async handleLoadScenario() {
    if (!this._editor || !this.selectedValueSetId) {
      return;
    }
    try {
      this.busy = true;
      this._syncDisableClose();
      const dto = await getValueSet({ valueSetId: this.selectedValueSetId });
      const data = parseJsonSafe(dto && dto.valuesJson, null);
      if (!data || (!data.sections && !data.values)) {
        throw new Error('Scenario has no values.');
      }
      await this._editor.load(data, { omitMappedFields: true });
      this._markDirty();
      this._showToast('Scenario loaded', `Applied “${dto.name}”.`, 'success');
    } catch (err) {
      this._showError('Load scenario failed', err);
    } finally {
      this.busy = false;
      this._syncDisableClose();
    }
  }

  async handleSaveScenario() {
    if (!this._editor || !this._resolvedTemplateId) {
      return;
    }
    try {
      this.busy = true;
      this._syncDisableClose();
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
          templateId: this._resolvedTemplateId,
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
      this.busy = false;
      this._syncDisableClose();
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
          recordId: this.effectiveRecordId,
          resolveListItems: this._resolveListItems.bind(this),
          onShareDocument: (artifact) => this._openShareDialog(artifact),
          onPreviewStateChange: (open) => {
            this._previewOpen = !!open;
            this._syncDisableClose();
            if (!open && this._previewOnlyAwaitingClose) {
              this._previewOnlyAwaitingClose = false;
              this._closeWithResult('preview-closed');
            }
          },
          onNestedModalStateChange: (open) => {
            this._nestedModalOpen = !!open;
            this._syncDisableClose();
          },
          onFieldPickerApplied: () => {
            // OK / Clear on a field dialog — not open/close/cancel alone.
            this._markDirty();
          },
          ui: {
            showPreview: this._asBool(this.showPreview, true)
          }
        })
      );
      await this._editor.ready;

      if (this._fieldMapping && typeof this._editor.setFieldMapping === 'function') {
        this._editor.setFieldMapping(this._fieldMapping);
      }
      if (
        this._pendingValues &&
        typeof this._editor.load === 'function'
      ) {
        try {
          await this._editor.load(this._pendingValues);
        } catch (e) {
          this._showToast(
            'Values warning',
            (e && e.message) || 'Could not apply saved values.',
            'warning'
          );
        }
        this._pendingValues = null;
      }
      if (
        !this.instanceId &&
        this._fieldMapping &&
        this._mergePayload &&
        typeof this._editor.applyFieldMapping === 'function'
      ) {
        try {
          await this._editor.applyFieldMapping(this._mergePayload);
        } catch (e) {
          this._showToast('Merge warning', (e && e.message) || 'Merge failed', 'warning');
        }
      }

      this._wireEditorDirtyTracking(editorRoot);
      // Capture twice so post-ready Editor.js/DOM normalization is not treated as edits.
      await this._captureBaseline();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await this._captureBaseline();
      this._suppressDirty = false;

      this._editorInitialized = true;

      if (this._openPreviewAfterMount && typeof this._editor.preview === 'function') {
        this._openPreviewAfterMount = false;
        this.showSpinner = false;
        this._previewOnlyAwaitingClose = true;
        await this._editor.preview({
          hideEmptyValues: this._asBool(this.hideEmpty, false)
        });
        return;
      }

      if (this._autoFinishAfterMount) {
        this._autoFinishAfterMount = false;
        await this.handleFinish();
      }
    } catch (err) {
      this._showError('Failed to start editor', err);
    }
  }

  async handleFinish() {
    if (!this._editor || !this.effectiveRecordId || !this._resolvedTemplateId) return;
    try {
      this.busy = true;
      this._syncDisableClose();
      this.showSpinner = true;

      // Do not open Document preview on Finish — save, attach, then close fill modal.
      // Success toast is returned to the opener so it lingers after the modal closes.
      this._closeNestedPreviewIfOpen();

      await this._saveInstanceOnly('Completed');

      // Completing always attaches (or revises) the PDF/HTML file on the document + source record.
      // Default / none → PDF; only an explicit Export Mode = HTML attaches HTML.
      const exportMode = this._asExportMode(this.exportMode);
      const format = exportMode === 'html' ? 'html' : 'pdf';
      let warningToast = null;
      let successToast = {
        title: 'Saved & attached',
        message: 'Document saved. PDF attached to Notes & Attachments / Files.',
        variant: 'success'
      };

      if (format === 'pdf') {
        if (!this._pdfAvailable) {
          warningToast = {
            title: 'PDF unavailable',
            message:
              'Uncheck DocEngine Settings → Use External PDF, or install DocEngine_PDF for External. Attaching HTML instead.',
            variant: 'warning'
          };
          await this._attachHtml();
          successToast = {
            title: 'Saved & attached',
            message: 'Document saved. HTML attached to Notes & Attachments / Files.',
            variant: 'success'
          };
        } else {
          const html =
            this._pdfProvider === 'Salesforce'
              ? await exportHtmlForPdf(this._editor, {
                  title: (this._templateDto && this._templateDto.name) || 'document',
                  hideEmptyValues: this._asBool(this.hideEmpty, false)
                })
              : null;
          await generateAndSavePdf({ docInstanceId: this._instanceId, html });
        }
      } else {
        await this._attachHtml();
        successToast = {
          title: 'Saved & attached',
          message: 'Document saved. HTML attached to Notes & Attachments / Files.',
          variant: 'success'
        };
      }

      this._closeWithResult({
        status: 'finished',
        warningToast,
        toast: successToast
      });
    } catch (err) {
      this._showError('Finish failed', err);
    } finally {
      this.busy = false;
      this.showSpinner = false;
      this._syncDisableClose();
    }
  }

  async handleSaveDraft() {
    if (!this._editor || !this.effectiveRecordId || !this._resolvedTemplateId) return;
    if (this._documentStatus === 'Completed') return;
    try {
      this.busy = true;
      this._syncDisableClose();
      this.showSpinner = true;
      await this._saveInstanceOnly('Draft');
      await this._captureBaseline();
      this._showToast('Draft saved', 'Document saved as Draft.', 'success');
    } catch (err) {
      this._showError('Save Draft failed', err);
    } finally {
      this.busy = false;
      this.showSpinner = false;
      this._syncDisableClose();
    }
  }

  async handleCancel(event) {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    if (this._confirmCloseBusy || this.busy) {
      return;
    }
    // Close Document preview first — do not dismiss the editor.
    if (this._closeNestedPreviewIfOpen()) {
      return;
    }
    // Close nested field dialog (list/tree/…) before dismissing the editor.
    if (this._closeOpenFieldOverlay()) {
      return;
    }
    if (await this._confirmDiscardIfDirty()) {
      this._closeWithResult('cancelled');
    }
  }

  /**
   * LightningModal header ✕ calls close() with no / empty result. Intercept that so ✕
   * matches Cancel (confirm if dirty). Intentional closes use _closeWithResult → super.close.
   */
  close(result) {
    // Ignore ✕ while saving / confirming.
    if (this.busy || this._confirmCloseBusy) {
      return;
    }
    // Header ✕ / default dismiss — same as Cancel.
    Promise.resolve(this.handleCancel()).catch(() => {});
  }

  _closeWithResult(result) {
    this.disableClose = false;
    super.close(result);
  }

  _wireEditorDirtyTracking(editorRoot) {
    if (!editorRoot || this._onEditorDomInput) return;
    this._onEditorDomInput = (event) => {
      // beforeinput/paste are user gestures. Generic "input"/"change" also fire from
      // programmatic token updates and Editor.js normalization — ignore those.
      const type = event && event.type;
      if (type === 'beforeinput' || type === 'paste') {
        this._markDirty();
      }
    };
    editorRoot.addEventListener('beforeinput', this._onEditorDomInput, true);
    editorRoot.addEventListener('paste', this._onEditorDomInput, true);
  }

  _markDirty() {
    if (this._suppressDirty) return;
    this._dirty = true;
  }

  async _captureBaseline() {
    if (!this._editor || typeof this._editor.exportFields !== 'function') {
      this._baselineValuesJson = null;
      this._dirty = false;
      return;
    }
    try {
      const values = await this._editor.exportFields();
      this._baselineValuesJson = JSON.stringify(values ?? null);
      this._dirty = false;
    } catch (e) {
      this._baselineValuesJson = null;
      this._dirty = false;
    }
  }

  async _hasUnsavedChanges() {
    // Confirmation only after a real user edit gesture or applied field-picker result.
    return !!this._dirty;
  }

  /**
   * @returns {Promise<boolean>} true if the editor may close
   */
  async _confirmDiscardIfDirty() {
    if (!(await this._hasUnsavedChanges())) {
      return true;
    }
    this._confirmCloseBusy = true;
    try {
      const confirmed = await LightningConfirm.open({
        message: 'You have unsaved changes. Close without saving?',
        variant: 'header',
        label: 'Unsaved changes',
        theme: 'warning'
      });
      return !!confirmed;
    } finally {
      this._confirmCloseBusy = false;
    }
  }

  _closeNestedPreviewIfOpen() {
    let open = this._previewOpen === true;
    try {
      if (
        !open &&
        this._editor &&
        typeof this._editor.isPreviewOpen === 'function' &&
        this._editor.isPreviewOpen()
      ) {
        open = true;
      }
    } catch (e) {
      /* LWS may block some API reads — fall through to DOM check */
    }
    if (!open && this._findOpenPreviewOverlay()) {
      open = true;
    }
    if (!open) {
      return false;
    }
    try {
      if (this._editor && typeof this._editor.closePreview === 'function') {
        this._editor.closePreview();
      }
    } catch (e) {
      const overlay = this._findOpenPreviewOverlay();
      if (overlay) {
        overlay.hidden = true;
        overlay.setAttribute('data-preview-open', 'false');
      }
    }
    this._previewOpen = false;
    this._syncDisableClose();
    return true;
  }

  _syncDisableClose() {
    // Keep header ✕ enabled so it can run handleCancel via close() override.
    // Esc is still consumed in _handleHostKeydown (nested overlays only).
    // Block dismiss only while busy / confirming to avoid mid-save closes.
    this.disableClose = !!(this.busy || this._confirmCloseBusy);
  }

  /**
   * Esc closes nested preview / field dialogs only — never the editor shell.
   * Header ✕ goes through close() → handleCancel (with dirty confirm).
   */
  _handleHostKeydown(event) {
    if (!event || (event.key !== 'Escape' && event.key !== 'Esc' && event.code !== 'Escape')) {
      return;
    }
    // Always consume Esc so it cannot dismiss the Lightning modal when focus is
    // in padding / header / footer outside the editor canvas.
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    if (this._closeNestedPreviewIfOpen()) {
      return;
    }
    this._closeOpenFieldOverlay();
  }

  _findOpenFieldOverlay() {
    const match = (root) => {
      if (!root || typeof root.querySelector !== 'function') return null;
      const nodes = root.querySelectorAll(
        '.modal-overlay--palette:not([hidden]), .modal-overlay.modal-overlay--palette:not([hidden])'
      );
      for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        if (el.classList && el.classList.contains('modal-overlay--preview')) continue;
        if (el.hidden) continue;
        return el;
      }
      return null;
    };
    let node = this.template && this.template.host;
    const seen = new Set();
    while (node && !seen.has(node)) {
      seen.add(node);
      const found = match(node);
      if (found) return found;
      const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
      if (root && root.host) {
        node = root.host;
        continue;
      }
      node = node.parentElement || node.parentNode;
    }
    try {
      return match(document);
    } catch (e) {
      return null;
    }
  }

  _closeOpenFieldOverlay() {
    const overlay = this._findOpenFieldOverlay();
    if (overlay) {
      const closeBtn =
        overlay.querySelector('[data-action="close"]') ||
        overlay.querySelector('.modal__footer .btn:not(.btn-primary)');
      if (closeBtn && typeof closeBtn.click === 'function') {
        closeBtn.click();
      } else {
        overlay.hidden = true;
      }
      this._nestedModalOpen = false;
      this._syncDisableClose();
      return true;
    }
    // Flag set but overlay not queryable (LWS) — still consume Esc so the shell stays open.
    if (this._nestedModalOpen === true) {
      return true;
    }
    return false;
  }

  _findOpenPreviewOverlay() {
    const match = (root) => {
      if (!root || typeof root.querySelector !== 'function') return null;
      return (
        root.querySelector('.modal-overlay--preview[data-preview-open="true"]') ||
        root.querySelector('.modal-overlay--preview:not([hidden])')
      );
    };
    let node = this.template && this.template.host;
    const seen = new Set();
    while (node && !seen.has(node)) {
      seen.add(node);
      const found = match(node);
      if (found) return found;
      const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
      if (root && root.host) {
        node = root.host;
        continue;
      }
      node = node.parentElement || node.parentNode;
    }
    try {
      return match(document);
    } catch (e) {
      return null;
    }
  }

  async _saveInstanceOnly(status = 'Completed') {
    let values =
      typeof this._editor.exportFields === 'function'
        ? await this._editor.exportFields()
        : null;
    if (!values) {
      throw new Error('exportFields is not available on the editor.');
    }
    values = await replaceEmbeddedImageDataUrls(values, this.effectiveRecordId);
    // Push File URLs back into the editor so Finish HTML/PDF attach does not
    // re-embed huge signature/image data URLs (Aura request / Long Text Area blowups).
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
        name: (this._templateDto && this._templateDto.name) || 'Document',
        templateId: this._resolvedTemplateId,
        templateVersionId: (this._templateDto && this._templateDto.versionId) || null,
        recordId: this.effectiveRecordId,
        objectApiName: this.effectiveObjectApiName,
        documentJson,
        status,
        completedDate: null
      })
    });
    const saved = typeof savedRaw === 'string' ? JSON.parse(savedRaw) : savedRaw;
    this._instanceId = saved.id;
    this._documentStatus = saved.status || status;
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

  async _buildHtmlDocument() {
    const title = (this._templateDto && this._templateDto.name) || 'document';
    const hideEmpty = this._asBool(this.hideEmpty, false);
    if (this._editor && typeof this._editor.exportPreviewHtml === 'function') {
      return this._editor.exportPreviewHtml({ hideEmptyValues: hideEmpty, title });
    }
    const doc = await this._editor.exportDoc();
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' +
      escapeHtml(title) +
      '</title></head><body><h1>' +
      escapeHtml(title) +
      '</h1><pre>' +
      escapeHtml(JSON.stringify(doc, null, 2)) +
      '</pre></body></html>'
    );
  }

  async _attachHtml() {
    const title = (this._templateDto && this._templateDto.name) || 'document';
    const safeName = String(title).replace(/[^\w.-]+/g, '_') || 'document';
    const html = await this._buildHtmlDocument();
    await saveHtml({
      docInstanceId: this._instanceId,
      base64Data: toBase64Utf8(html),
      filename: safeName + '.html'
    });
  }

  async _resolveListItems({ fieldName, query, schema, sourceCollection: sourceFromArg }) {
    let sourceCollection =
      (sourceFromArg && String(sourceFromArg).trim()) ||
      (schema && schema.sourceCollection && String(schema.sourceCollection).trim()) ||
      '';
    if (!sourceCollection && !(fieldName || '').includes('.')) {
      sourceCollection = (this.effectiveObjectApiName || '').trim();
    }
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
  }

  _destroyEditor() {
    this._previewOpen = false;
    this._nestedModalOpen = false;
    this._dirty = false;
    this._baselineValuesJson = null;
    this.disableClose = false;
    this._pendingValues = null;
    if (this._onEditorDomInput) {
      try {
        const editorRoot = this.template && this.template.querySelector('.editor-root');
        if (editorRoot) {
          editorRoot.removeEventListener('beforeinput', this._onEditorDomInput, true);
          editorRoot.removeEventListener('paste', this._onEditorDomInput, true);
        }
      } catch (e) {
        /* ignore */
      }
      this._onEditorDomInput = null;
    }
    if (this._editor && typeof this._editor.destroy === 'function') {
      this._editor.destroy();
    }
    this._editor = null;
    this._editorInitialized = false;
  }

  _asBool(value, fallback = true) {
    if (value === true || value === false) return value;
    if (value == null || value === '') return fallback;
    const s = String(value).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
    return fallback;
  }

  _asExportMode(value) {
    const s = String(value == null ? 'pdf' : value).trim().toLowerCase();
    if (s === 'html') return 'html';
    if (s === 'pdf' || s === 'none' || s === '') return 'pdf';
    return 'pdf';
  }

  /**
   * Template Hide Empty / Output Format win over Button Config / App Builder props.
   */
  _applyTemplateRunSettings(dto) {
    if (!dto) return;
    if (dto.hideEmpty != null) {
      this.hideEmpty = dto.hideEmpty === true;
    }
    if (dto.outputFormat != null && String(dto.outputFormat).trim() !== '') {
      this.exportMode = this._asExportMode(dto.outputFormat);
    }
  }

  _showToast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }

  _showError(title, err) {
    const message = apexErrorMessage(err);
    this.errorMessage = message;
    this.dispatchEvent(
      new ShowToastEvent({ title, message, variant: 'error', mode: 'sticky' })
    );
  }
}
