import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import DocEngineModal from 'c/docEngineModal';
import { apexErrorMessage } from 'c/docEngineLib';

import RECORD_ID_FIELD from '@salesforce/schema/DocEngine_Document__c.Record_Id__c';
import OBJECT_API_FIELD from '@salesforce/schema/DocEngine_Document__c.Object_API_Name__c';
import TEMPLATE_FIELD from '@salesforce/schema/DocEngine_Document__c.Template__c';
import FILE_URL_FIELD from '@salesforce/schema/DocEngine_Document__c.File_URL__c';
import CONTENT_DOC_FIELD from '@salesforce/schema/DocEngine_Document__c.Content_Document_Id__c';
import STATUS_FIELD from '@salesforce/schema/DocEngine_Document__c.Status__c';
import SOURCE_FIELD from '@salesforce/schema/DocEngine_Document__c.Source__c';

const FIELDS = [
  RECORD_ID_FIELD,
  OBJECT_API_FIELD,
  TEMPLATE_FIELD,
  FILE_URL_FIELD,
  CONTENT_DOC_FIELD,
  STATUS_FIELD,
  SOURCE_FIELD
];

/**
 * Document record page: open submitted answers in Document preview (HTML + View as PDF).
 */
export default class DocEngineDocumentView extends LightningElement {
  @api recordId;

  busy = false;
  _wired;

  @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
  wiredRecord(result) {
    this._wired = result;
  }

  get status() {
    return getFieldValue(this._wired?.data, STATUS_FIELD) || '';
  }

  get source() {
    return getFieldValue(this._wired?.data, SOURCE_FIELD) || '';
  }

  get hasFile() {
    return !!getFieldValue(this._wired?.data, CONTENT_DOC_FIELD);
  }

  get fileHref() {
    const id = getFieldValue(this._wired?.data, CONTENT_DOC_FIELD);
    return id ? `/lightning/r/ContentDocument/${id}/view` : null;
  }

  get openDisabled() {
    return this.busy || !this.recordId;
  }

  handleOpenFile() {
    if (!this.fileHref) return;
    window.open(this.fileHref, '_blank');
  }

  async handleOpen() {
    if (this.openDisabled) return;
    this.busy = true;
    try {
      const parentRecordId =
        getFieldValue(this._wired?.data, RECORD_ID_FIELD) || this.recordId;
      const objectApiName =
        getFieldValue(this._wired?.data, OBJECT_API_FIELD) || 'Account';
      const templateId = getFieldValue(this._wired?.data, TEMPLATE_FIELD);

      await DocEngineModal.open({
        size: 'full',
        recordId: parentRecordId,
        objectApiName,
        templateId,
        instanceId: this.recordId,
        fillMode: false,
        previewOnly: true,
        exportMode: 'pdf',
        showPreview: true,
        hideEmpty: false,
        attachToRecord: false
      });
    } catch (err) {
      this.dispatchEvent(
        new ShowToastEvent({
          title: 'Could not open document',
          message: apexErrorMessage(err) || 'Open failed.',
          variant: 'error'
        })
      );
    } finally {
      this.busy = false;
    }
  }
}
