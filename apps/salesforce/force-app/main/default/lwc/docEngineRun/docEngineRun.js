import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CloseActionScreenEvent } from 'lightning/actions';
import { CurrentPageReference } from 'lightning/navigation';
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

function recordIdFromUrl() {
  try {
    const match = String(window.location.href || '').match(/[?&]recordId=([a-zA-Z0-9]{15,18})/);
    return match ? match[1] : '';
  } catch (e) {
    return '';
  }
}

export default class DocEngineRun extends LightningElement {
  /** Record Id from Quick Action / record page (setter — not available in connectedCallback). */
  _recordId = '';

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    this._recordId = value || '';
    this._scheduleBootstrap();
  }

  @api objectApiName;
  @api configName;
  @api templateId;
  @api fillMode = 'true';
  @api exportMode = 'pdf';
  @api showPreview = 'true';
  @api hideEmpty = 'false';
  @api attachToRecord = 'false';

  cardTitle = 'DocEngine';
  errorMessage = '';
  showPicker = false;
  busy = false;
  showSpinner = false;
  templatesLoading = false;
  selectedTemplateId = '';
  templateOptions = [];

  _pageRef;
  _resolved = false;
  _objectApiName = '';
  _fillMode = true;
  _exportMode = 'pdf';
  _showPreview = true;
  _hideEmpty = false;
  _attachToRecord = false;
  _configKey = '';
  _configuredTemplateId = '';
  _bootstrapScheduled = false;
  _modalOpen = false;

  get effectiveRecordId() {
    return this._recordId || this._stateValue('recordId') || recordIdFromUrl() || '';
  }

  get showWaiting() {
    return !this._resolved && !this.errorMessage && !this.showPicker && !this.showSpinner;
  }

  get templatePlaceholder() {
    if (this.templatesLoading) return 'Loading templates…';
    if (!this.templateOptions.length) return 'No active templates for this object';
    return 'Select a template';
  }

  get continueDisabled() {
    return !this.selectedTemplateId || this.templatesLoading || this.busy;
  }

  get continueLabel() {
    return this._fillMode ? 'Continue' : 'Generate';
  }

  @wire(CurrentPageReference)
  wiredPageRef(pageRef) {
    this._pageRef = pageRef;
    if (pageRef && pageRef.state && pageRef.state.recordId && !this._recordId) {
      this._recordId = pageRef.state.recordId;
    }
    this._scheduleBootstrap();
  }

  connectedCallback() {
    this.showSpinner = true;
    this._scheduleBootstrap();
  }

  _scheduleBootstrap() {
    if (this._resolved || this._bootstrapScheduled) return;
    if (!this.effectiveRecordId) return;
    this._bootstrapScheduled = true;
    Promise.resolve().then(() => {
      this._bootstrapScheduled = false;
      if (!this._resolved) {
        this._bootstrap();
      }
    });
  }

  async _bootstrap() {
    if (this._resolved || this.busy) return;
    this.busy = true;
    this.showSpinner = true;
    this.errorMessage = '';
    this.showPicker = false;
    try {
      await this._resolveParams();
      await this._loadTemplateOptions();
      this._resolved = true;

      const explicitTemplateId = this.templateId || this._stateValue('templateId') || '';
      if (explicitTemplateId) {
        await this._openModal(explicitTemplateId);
        return;
      }

      if (this._configuredTemplateId) {
        const match = this.templateOptions.find((o) => o.value === this._configuredTemplateId);
        if (match) this.selectedTemplateId = match.value;
      }

      if (this.templateOptions.length === 0) {
        throw new Error(
          'No active templates for ' +
            this._objectApiName +
            '. Create one in DocEngine Templates, or fix Button Config “' +
            this._configKey +
            '”.'
        );
      }

      if (this.templateOptions.length === 1) {
        await this._openModal(this.templateOptions[0].value);
        return;
      }

      this.showPicker = true;
      this.cardTitle = 'Select template';
    } catch (err) {
      this.errorMessage =
        (err && err.body && err.body.message) || (err && err.message) || String(err);
      this._showError('DocEngine', err);
    } finally {
      this.busy = false;
      this.showSpinner = false;
    }
  }

  handleTemplateChange(event) {
    this.selectedTemplateId = event.detail.value;
  }

  async handleContinue() {
    if (!this.selectedTemplateId) return;
    await this._openModal(this.selectedTemplateId);
  }

  handleCancel() {
    this.dispatchEvent(new CloseActionScreenEvent());
  }

  async _openModal(templateId) {
    if (this._modalOpen) return;
    this._modalOpen = true;
    this.busy = true;
    this.showSpinner = true;
    this.showPicker = false;
    try {
      await this._applyConfigForTemplate(templateId);
      this.dispatchEvent(new CloseActionScreenEvent());
      const result = await DocEngineModal.open({
        size: 'full',
        recordId: this.effectiveRecordId,
        objectApiName: this._objectApiName,
        templateId,
        fillMode: this._fillMode,
        exportMode: this._exportMode,
        showPreview: this._showPreview,
        hideEmpty: this._hideEmpty,
        attachToRecord: this._attachToRecord
      });
      this._showModalResultToasts(result);
    } catch (err) {
      this._showError('DocEngine', err);
    } finally {
      this.busy = false;
      this.showSpinner = false;
      this._modalOpen = false;
    }
  }

  /**
   * Apply Button Config for this template when Developer Name does not match
   * the Quick Action default (e.g. account demo 3 → template test 3).
   */
  async _applyConfigForTemplate(templateId) {
    if (!templateId) return;
    try {
      const cfg = await getConfigForTemplate({ templateId });
      if (!cfg) return;
      this._configuredTemplateId = cfg.templateId || templateId;
      // Prefer Button Config over LWC design defaults (e.g. showPreview='true').
      // URL state overrides still win when present.
      if (this._stateValue('fill') == null) {
        this._fillMode = asBool(cfg.fillMode, true);
      }
      if (this._stateValue('export') == null) {
        this._exportMode = asExportMode(cfg.exportMode || 'pdf');
      }
      if (this._stateValue('preview') == null) {
        this._showPreview = asBool(cfg.showPreview, true);
      }
      if (this._stateValue('hideEmpty') == null) {
        this._hideEmpty = asBool(cfg.hideEmpty, false);
      }
      if (this._stateValue('attach') == null) {
        this._attachToRecord = asBool(cfg.attachToRecord, false);
      }
    } catch (e) {
      /* keep previously resolved params */
    }
  }

  _stateValue(key) {
    const state = (this._pageRef && this._pageRef.state) || {};
    return state[key] != null ? state[key] : state[`c__${key}`];
  }

  async _resolveParams() {
    const recordId = this.effectiveRecordId;
    if (!recordId) throw new Error('Record Id is required.');

    if (this.objectApiName) {
      this._objectApiName = this.objectApiName;
    } else {
      this._objectApiName = await getObjectApiName({ recordId });
    }

    const stateConfig = this._stateValue('config');
    const defaultConfig = `${this._objectApiName}_Generate_Document`;
    this._configKey = String(this.configName || stateConfig || defaultConfig || '').trim();

    let cfg = null;
    if (this._configKey) {
      try {
        cfg = await getConfig({ developerName: this._configKey });
      } catch (e) {
        /* optional — picker still works without a matching config */
      }
    }

    this._configuredTemplateId = cfg && cfg.templateId ? cfg.templateId : '';

    // Priority: URL state → Button Config → LWC design props.
    // Design defaults (e.g. showPreview='true') must not override config OFF.
    this._fillMode = this._resolveBool('fill', this.fillMode, cfg && cfg.fillMode, true);
    const exportUrl = this._stateValue('export');
    if (exportUrl != null && exportUrl !== '') {
      this._exportMode = asExportMode(exportUrl);
    } else if (cfg && cfg.exportMode) {
      this._exportMode = asExportMode(cfg.exportMode);
    } else {
      this._exportMode = asExportMode(this.exportMode || 'pdf');
    }
    this._showPreview = this._resolveBool(
      'preview',
      this.showPreview,
      cfg && cfg.showPreview,
      true
    );
    this._hideEmpty = this._resolveBool(
      'hideEmpty',
      this.hideEmpty,
      cfg && cfg.hideEmpty,
      false
    );
    this._attachToRecord = this._resolveBool(
      'attach',
      this.attachToRecord,
      cfg && cfg.attachToRecord,
      false
    );
  }

  /**
   * @param {string} stateKey URL/state override key
   * @param {*} apiValue LWC @api design property (often a string default)
   * @param {*} cfgValue Button Config value (boolean or null)
   * @param {boolean} fallback final default when nothing else applies
   */
  _resolveBool(stateKey, apiValue, cfgValue, fallback) {
    const fromState = this._stateValue(stateKey);
    if (fromState != null && fromState !== '') {
      return asBool(fromState, fallback);
    }
    if (cfgValue === true || cfgValue === false) {
      return cfgValue;
    }
    if (apiValue != null && apiValue !== '') {
      return asBool(apiValue, fallback);
    }
    return fallback;
  }

  async _loadTemplateOptions() {
    this.templatesLoading = true;
    try {
      const list = await listForObject({ objectApiName: this._objectApiName });
      this.templateOptions = (list || []).map((t) => ({
        label: t.version ? `${t.name} (v${t.version})` : t.name,
        value: t.id
      }));
      if (!this.selectedTemplateId && this._configuredTemplateId) {
        const match = this.templateOptions.find((o) => o.value === this._configuredTemplateId);
        if (match) this.selectedTemplateId = match.value;
      }
    } finally {
      this.templatesLoading = false;
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
