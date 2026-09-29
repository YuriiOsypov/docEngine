import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import createFormLinkJson from '@salesforce/apex/DocEngineFormLinkController.createFormLinkJson';
import listFormLinksJson from '@salesforce/apex/DocEngineFormLinkController.listFormLinksJson';
import revokeFormLink from '@salesforce/apex/DocEngineFormLinkController.revokeFormLink';
import getPublicFormSiteBaseUrl from '@salesforce/apex/DocEngineFormLinkController.getPublicFormSiteBaseUrl';
import savePublicFormSiteBaseUrl from '@salesforce/apex/DocEngineFormLinkController.savePublicFormSiteBaseUrl';
import { apexErrorMessage } from 'c/docEngineLib';

import NAME_FIELD from '@salesforce/schema/DocEngine_Template__c.Name';
import PUBLIC_ENABLED from '@salesforce/schema/DocEngine_Template__c.Public_Form_Enabled__c';

const FIELDS = [NAME_FIELD, PUBLIC_ENABLED];

export default class DocEngineFormLinks extends LightningElement {
  @api recordId;
  /** Optional App Builder override (wins until user edits the field). */
  @api siteBaseUrl = '';

  /** Editable value shown in the form (settings / suggestion / App Builder). */
  siteBaseUrlInput = '';
  _siteBaseLoaded = false;

  busy = false;
  errorMessage = '';
  statusMessage = '';
  linkName = '';
  mode = 'Create';
  recordIdForUpdate = '';
  links = [];

  modeOptions = [
    { label: 'Create', value: 'Create' },
    { label: 'Update', value: 'Update' }
  ];

  @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
  wiredTemplate({ data, error }) {
    if (data) {
      const name = getFieldValue(data, NAME_FIELD) || 'Form';
      if (!this.linkName) {
        this.linkName = `${name} public link`;
      }
      const enabled = getFieldValue(data, PUBLIC_ENABLED) === true;
      if (!enabled) {
        this.errorMessage =
          'Turn on Public Form Enabled on this template before minting links.';
      } else if (this.errorMessage && this.errorMessage.indexOf('Public Form Enabled') >= 0) {
        this.errorMessage = '';
      }
    } else if (error) {
      this.errorMessage = apexErrorMessage(error) || 'Could not load template.';
    }
  }

  connectedCallback() {
    this._loadSiteBase();
    this._reload();
  }

  get isUpdateMode() {
    return this.mode === 'Update';
  }

  get hasLinks() {
    return Array.isArray(this.links) && this.links.length > 0;
  }

  get missingSiteBase() {
    return !String(this.siteBaseUrlInput || '').trim();
  }

  get linkRows() {
    return (this.links || []).map((row) => ({
      ...row,
      activeLabel: row.isActive ? 'Yes' : 'No',
      submissionLabel:
        row.maxSubmissions != null
          ? `${row.submissionCount || 0} / ${row.maxSubmissions}`
          : String(row.submissionCount || 0),
      displayUrl: this._fullUrl(row),
      revokeDisabled: this.busy || !row.isActive
    }));
  }

  handleNameChange(e) {
    this.linkName = e.target.value;
  }
  handleModeChange(e) {
    this.mode = e.detail.value;
  }
  handleRecordIdChange(e) {
    this.recordIdForUpdate = e.target.value;
  }
  handleSiteBaseChange(e) {
    this.siteBaseUrlInput = e.target.value;
  }

  async handleSaveSiteBase() {
    this.busy = true;
    this.errorMessage = '';
    this.statusMessage = '';
    try {
      const saved = await savePublicFormSiteBaseUrl({
        siteBaseUrl: this.siteBaseUrlInput
      });
      this.siteBaseUrlInput = saved || '';
      this.statusMessage = 'Site base URL saved. New Copy / Mint actions use the full URL.';
      await this._reload();
    } catch (err) {
      this.errorMessage = apexErrorMessage(err) || 'Could not save site base URL.';
    } finally {
      this.busy = false;
    }
  }

  async handleMint() {
    this.busy = true;
    this.errorMessage = '';
    this.statusMessage = '';
    try {
      if (this.mode === 'Update' && !String(this.recordIdForUpdate || '').trim()) {
        throw new Error('Record Id is required for Update mode.');
      }
      if (this.missingSiteBase) {
        throw new Error(
          'Enter your Experience site base URL first (e.g. https://myorg.my.site.com), then Mint again.'
        );
      }
      const savedBase = await savePublicFormSiteBaseUrl({
        siteBaseUrl: this.siteBaseUrlInput
      });
      this.siteBaseUrlInput = savedBase || this.siteBaseUrlInput;

      const raw = await createFormLinkJson({
        requestJson: JSON.stringify({
          templateId: this.recordId,
          name: this.linkName,
          mode: this.mode,
          recordId: this.mode === 'Update' ? String(this.recordIdForUpdate).trim() : null,
          requireCaptcha: false,
          allowPdfAttach: false
        })
      });
      const created = typeof raw === 'string' ? JSON.parse(raw) : raw;
      await this._reload();
      const url = this._fullUrl(created);
      await this._copyText(url);
      this.statusMessage = 'Link created and full URL copied.';
      this.dispatchEvent(
        new ShowToastEvent({
          title: 'Public link ready',
          message: url,
          variant: 'success',
          mode: 'sticky'
        })
      );
    } catch (err) {
      this.errorMessage = apexErrorMessage(err) || 'Could not mint link.';
    } finally {
      this.busy = false;
    }
  }

  async handleCopy(event) {
    const id = event.currentTarget.dataset.id;
    const row = (this.links || []).find((l) => l.id === id);
    if (!row) return;
    this.busy = true;
    this.errorMessage = '';
    try {
      if (this.missingSiteBase) {
        throw new Error(
          'Enter and save your Experience site base URL first so Copy can build a full link.'
        );
      }
      const url = this._fullUrl(row);
      await this._copyText(url);
      this.statusMessage = 'Full URL copied.';
      this.dispatchEvent(
        new ShowToastEvent({ title: 'Copied', message: url, variant: 'success' })
      );
    } catch (err) {
      this.errorMessage = apexErrorMessage(err) || 'Copy failed.';
    } finally {
      this.busy = false;
    }
  }

  async handleRevoke(event) {
    const id = event.currentTarget.dataset.id;
    this.busy = true;
    this.errorMessage = '';
    try {
      await revokeFormLink({ formLinkId: id });
      this.statusMessage = 'Link revoked.';
      await this._reload();
    } catch (err) {
      this.errorMessage = apexErrorMessage(err) || 'Revoke failed.';
    } finally {
      this.busy = false;
    }
  }

  async _loadSiteBase() {
    try {
      const fromApi = await getPublicFormSiteBaseUrl();
      const fromProp = String(this.siteBaseUrl || '').trim();
      this.siteBaseUrlInput = fromProp || fromApi || '';
      this._siteBaseLoaded = true;
    } catch (e) {
      this.siteBaseUrlInput = String(this.siteBaseUrl || '').trim();
      this._siteBaseLoaded = true;
    }
  }

  async _reload() {
    if (!this.recordId) return;
    try {
      const raw = await listFormLinksJson({ templateId: this.recordId });
      this.links = typeof raw === 'string' ? JSON.parse(raw) : raw || [];
    } catch (err) {
      this.links = [];
      this.errorMessage = apexErrorMessage(err) || 'Could not list links.';
    }
  }

  _fullUrl(row) {
    if (!row) return '';
    if (row.publicUrl && String(row.publicUrl).startsWith('http')) {
      return row.publicUrl;
    }
    const path = row.publicPath || '';
    const base = String(this.siteBaseUrlInput || this.siteBaseUrl || '')
      .trim()
      .replace(/\/$/, '');
    if (!base) return path;
    if (path.startsWith('http')) return path;
    return base + (path.startsWith('/') ? path : '/' + path);
  }

  async _copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}
