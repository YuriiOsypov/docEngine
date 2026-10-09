import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
import listForRecord from '@salesforce/apex/DocEngineInstanceController.listForRecord';
import deleteInstance from '@salesforce/apex/DocEngineInstanceController.deleteInstance';
import getObjectApiName from '@salesforce/apex/DocEngineTemplateController.getObjectApiName';
import listForObject from '@salesforce/apex/DocEngineTemplateController.listForObject';
import getConfig from '@salesforce/apex/DocEngineButtonController.getConfig';
import getConfigForTemplate from '@salesforce/apex/DocEngineButtonController.getConfigForTemplate';
import DocEngineModal from 'c/docEngineModal';

function asBool(value, fallback = true) {
  if (value === true || value === false) return value;
  if (value == null || value === '') return fallback;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  return fallback;
}

function asExportMode(value) {
  const s = String(value == null ? 'pdf' : value).trim().toLowerCase();
  if (s === 'html') return 'html';
  return 'pdf';
}

export default class DocEngineInstanceList extends NavigationMixin(LightningElement) {
  @api recordId;
  /** DocEngine_Button_Config__c.Developer_Name__c — same as Generate Document Quick Action. */
  @api configName;

  columns = [
    {
      label: 'Name',
      type: 'button',
      typeAttributes: {
        label: { fieldName: 'name' },
        name: 'name_click',
        variant: 'base'
      }
    },
    { label: 'Template', fieldName: 'templateName', type: 'text' },
    { label: 'Status', fieldName: 'status', type: 'text' },
    {
      label: 'Completed',
      fieldName: 'completedDate',
      type: 'date',
      typeAttributes: {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }
    },
    {
      label: 'File',
      fieldName: 'fileUrl',
      type: 'url',
      typeAttributes: {
        label: { fieldName: 'fileLabel' },
        target: '_blank'
      }
    },
    {
      type: 'action',
      typeAttributes: {
        rowActions: this._getRowActions.bind(this)
      }
    }
  ];
  rows = [];
  errorMessage = '';
  busy = false;
  objectApiName = '';

  showPicker = false;
  templatesLoading = false;
  selectedTemplateId = '';
  templateOptions = [];

  _wiredList;
  _fillMode = true;
  _exportMode = 'pdf';
  _showPreview = true;
  _hideEmpty = false;
  _attachToRecord = false;
  _configuredTemplateId = '';
  _modalOpen = false;

  @wire(listForRecord, { recordId: '$recordId' })
  wiredInstances(result) {
    this._wiredList = result;
    const { data, error } = result;
    if (data) {
      this.rows = (data || []).map((row) => {
        const contentDocumentId = row.contentDocumentId || null;
        const fileUrl = row.fileUrl || null;
        return {
          id: row.id,
          name: row.name,
          templateId: row.templateId,
          templateName: row.templateName || '—',
          status: row.status || '—',
          completedDate: row.completedDate,
          contentDocumentId,
          fileUrl,
          fileLabel: fileUrl ? 'Preview' : ''
        };
      });
      this.errorMessage = '';
    } else if (error) {
      this.rows = [];
      this.errorMessage =
        (error.body && error.body.message) || error.message || String(error);
    }
  }

  _getRowActions(row, doneCallback) {
    const actions = [];
    if (this._isCompleted(row)) {
      // Completed documents are read-only — HTML preview only.
      actions.push({ label: 'Preview', name: 'preview' });
    } else {
      actions.push({ label: 'Edit', name: 'edit' });
      if (row && row.contentDocumentId) {
        actions.push({ label: 'Preview file', name: 'preview_file' });
      }
    }
    actions.push({ label: 'Delete', name: 'delete' });
    doneCallback(actions);
  }

  _isCompleted(row) {
    return row && String(row.status || '').trim().toLowerCase() === 'completed';
  }

  get hasRows() {
    return this.rows && this.rows.length > 0;
  }

  get showEmpty() {
    return !this.busy && !this.errorMessage && !this.hasRows && !this.showPicker;
  }

  get showTable() {
    return this.hasRows && !this.showPicker;
  }

  get continueDisabled() {
    return !this.selectedTemplateId || this.templatesLoading || this.busy;
  }

  get templatePlaceholder() {
    if (this.templatesLoading) return 'Loading templates…';
    if (!this.templateOptions.length) return 'No active templates for this object';
    return 'Select a template';
  }

  connectedCallback() {
    if (this.recordId) {
      getObjectApiName({ recordId: this.recordId })
        .then((name) => {
          this.objectApiName = name || '';
        })
        .catch(() => {
          this.objectApiName = '';
        });
    }
  }

  async handleRowAction(event) {
    const action = event.detail.action;
    const row = event.detail.row;
    if (!action || !row) return;
    if (action.name === 'preview' || (action.name === 'name_click' && this._isCompleted(row))) {
      await this._previewHtml(row);
    } else if (action.name === 'name_click') {
      await this._editInstance(row);
    } else if (action.name === 'preview_file') {
      this._previewFile(row);
    } else if (action.name === 'edit') {
      await this._editInstance(row);
    } else if (action.name === 'delete') {
      await this._deleteInstance(row);
    }
  }

  _previewFile(row) {
    if (!row || !row.contentDocumentId) {
      this._showError('Preview', new Error('No attached file for this document.'));
      return;
    }
    this[NavigationMixin.Navigate]({
      type: 'standard__recordPage',
      attributes: {
        recordId: row.contentDocumentId,
        objectApiName: 'ContentDocument',
        actionName: 'view'
      }
    });
  }

  /** Open read-only HTML document preview (same as document record page). */
  async _previewHtml(row) {
    if (this.busy || this._modalOpen || !row) return;
    this._modalOpen = true;
    this.busy = true;
    try {
      if (row.templateId) {
        await this._applyConfigForTemplate(row.templateId);
      }
      await DocEngineModal.open({
        size: 'full',
        recordId: this.recordId,
        objectApiName: this.objectApiName,
        templateId: row.templateId,
        instanceId: row.id,
        fillMode: false,
        previewOnly: true,
        exportMode: this._exportMode,
        showPreview: true,
        hideEmpty: this._hideEmpty,
        attachToRecord: this._attachToRecord
      });
    } catch (err) {
      this._showError('Preview failed', err);
    } finally {
      this.busy = false;
      this._modalOpen = false;
    }
  }

  async handleRefresh() {
    if (this._wiredList) {
      await refreshApex(this._wiredList);
    }
  }

  handleTemplateChange(event) {
    this.selectedTemplateId = event.detail.value;
  }

  handleCancelPicker() {
    this.showPicker = false;
    this.selectedTemplateId = '';
  }

  async handleContinue() {
    if (!this.selectedTemplateId) return;
    await this._openNewModal(this.selectedTemplateId);
  }

  /**
   * Same flow as Generate Document Quick Action (docEngineRun):
   * resolve config → template list → open modal (or picker if multiple).
   */
  async handleNew() {
    if (this.busy || this._modalOpen) return;
    this.busy = true;
    this.errorMessage = '';
    this.showPicker = false;
    try {
      if (!this.recordId) {
        throw new Error('Record Id is required.');
      }
      if (!this.objectApiName) {
        this.objectApiName = await getObjectApiName({ recordId: this.recordId });
      }
      await this._resolveConfig();
      await this._loadTemplateOptions();

      if (this.templateOptions.length === 0) {
        throw new Error(
          'No active templates for ' +
            this.objectApiName +
            '. Create one in DocEngine Templates.'
        );
      }

      if (this._configuredTemplateId) {
        const match = this.templateOptions.find((o) => o.value === this._configuredTemplateId);
        if (match) this.selectedTemplateId = match.value;
      }

      if (this.templateOptions.length === 1) {
        await this._openNewModal(this.templateOptions[0].value);
        return;
      }

      this.showPicker = true;
    } catch (err) {
      this._showError('New document', err);
    } finally {
      this.busy = false;
    }
  }

  async _resolveConfig() {
    const defaultConfig = `${this.objectApiName}_Generate_Document`;
    const configKey = String(this.configName || defaultConfig || '').trim();
    let cfg = null;
    if (configKey) {
      try {
        cfg = await getConfig({ developerName: configKey });
      } catch (e) {
        /* optional — picker still works without a matching config */
      }
    }

    this._configuredTemplateId = cfg && cfg.templateId ? cfg.templateId : '';
    this._fillMode = cfg ? asBool(cfg.fillMode, true) : true;
    this._exportMode = asExportMode(cfg && cfg.exportMode ? cfg.exportMode : 'pdf');
    this._showPreview = cfg ? asBool(cfg.showPreview, true) : true;
    this._hideEmpty = cfg ? asBool(cfg.hideEmpty, false) : false;
    this._attachToRecord = cfg ? asBool(cfg.attachToRecord, false) : false;
  }

  async _loadTemplateOptions() {
    this.templatesLoading = true;
    try {
      const list = await listForObject({ objectApiName: this.objectApiName });
      this.templateOptions = (list || []).map((t) => ({
        label: t.version ? `${t.name} (v${t.version})` : t.name,
        value: t.id
      }));
    } finally {
      this.templatesLoading = false;
    }
  }

  async _applyConfigForTemplate(templateId) {
    if (!templateId) return;
    try {
      const cfg = await getConfigForTemplate({ templateId });
      if (!cfg) return;
      this._configuredTemplateId = cfg.templateId || templateId;
      this._fillMode = asBool(cfg.fillMode, this._fillMode);
      this._exportMode = asExportMode(cfg.exportMode || this._exportMode);
      this._showPreview = asBool(cfg.showPreview, this._showPreview);
      this._hideEmpty = asBool(cfg.hideEmpty, this._hideEmpty);
      this._attachToRecord = asBool(cfg.attachToRecord, this._attachToRecord);
    } catch (e) {
      /* keep previously resolved params */
    }
  }

  async _openNewModal(templateId) {
    if (this._modalOpen) return;
    this._modalOpen = true;
    this.busy = true;
    this.showPicker = false;
    try {
      await this._applyConfigForTemplate(templateId);
      const result = await DocEngineModal.open({
        size: 'full',
        recordId: this.recordId,
        objectApiName: this.objectApiName,
        templateId,
        fillMode: this._fillMode,
        exportMode: this._exportMode,
        showPreview: this._showPreview,
        hideEmpty: this._hideEmpty,
        attachToRecord: this._attachToRecord
      });
      this._showModalResultToasts(result);
      await this.handleRefresh();
    } catch (err) {
      this._showError('New document', err);
    } finally {
      this.busy = false;
      this._modalOpen = false;
    }
  }

  async _editInstance(row) {
    if (this.busy) return;
    if (this._isCompleted(row)) {
      await this._previewHtml(row);
      return;
    }
    this.busy = true;
    try {
      // Apply button config when available (export/attach/hide empty), keep Preview on for Edit.
      if (row.templateId) {
        await this._applyConfigForTemplate(row.templateId);
      }
      const result = await DocEngineModal.open({
        size: 'full',
        recordId: this.recordId,
        objectApiName: this.objectApiName,
        templateId: row.templateId,
        instanceId: row.id,
        fillMode: true,
        exportMode: this._exportMode,
        showPreview: true,
        hideEmpty: this._hideEmpty,
        attachToRecord: this._attachToRecord
      });
      this._showModalResultToasts(result);
      await this.handleRefresh();
    } catch (err) {
      this._showError('Edit failed', err);
    } finally {
      this.busy = false;
    }
  }

  async _deleteInstance(row) {
    if (this.busy) return;
    const confirmed = await LightningConfirm.open({
      message: 'Delete document “' + row.name + '”? This cannot be undone.',
      variant: 'header',
      label: 'Delete document',
      theme: 'warning'
    });
    if (!confirmed) return;
    this.busy = true;
    try {
      await deleteInstance({ instanceId: row.id });
      this.dispatchEvent(
        new ShowToastEvent({
          title: 'Deleted',
          message: row.name + ' was deleted.',
          variant: 'success'
        })
      );
      await this.handleRefresh();
    } catch (err) {
      this._showError('Delete failed', err);
    } finally {
      this.busy = false;
    }
  }

  _showModalResultToasts(result) {
    if (!result || typeof result !== 'object') return;
    if (result.warningToast) {
      this.dispatchEvent(new ShowToastEvent(result.warningToast));
    }
    if (result.toast) {
      this.dispatchEvent(new ShowToastEvent(result.toast));
    }
  }

  _showError(title, err) {
    const message =
      (err && err.body && err.body.message) || (err && err.message) || String(err);
    this.errorMessage = message;
    this.dispatchEvent(
      new ShowToastEvent({ title, message, variant: 'error', mode: 'sticky' })
    );
  }
}
