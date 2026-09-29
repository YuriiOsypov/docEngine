import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import CREATED_BY_NAME from '@salesforce/schema/DocEngine_Template__c.CreatedBy.Name';
import CREATED_DATE from '@salesforce/schema/DocEngine_Template__c.CreatedDate';
import LAST_MODIFIED_BY_NAME from '@salesforce/schema/DocEngine_Template__c.LastModifiedBy.Name';
import LAST_MODIFIED_DATE from '@salesforce/schema/DocEngine_Template__c.LastModifiedDate';

const FIELDS = [CREATED_BY_NAME, CREATED_DATE, LAST_MODIFIED_BY_NAME, LAST_MODIFIED_DATE];

export default class DocEngineTemplateAudit extends LightningElement {
  @api recordId;

  @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
  record;

  get createdBy() {
    return this._formatPersonDate(CREATED_BY_NAME, CREATED_DATE);
  }

  get lastModifiedBy() {
    return this._formatPersonDate(LAST_MODIFIED_BY_NAME, LAST_MODIFIED_DATE);
  }

  _formatPersonDate(nameField, dateField) {
    const name = getFieldValue(this.record.data, nameField);
    const when = getFieldValue(this.record.data, dateField);
    if (!name && !when) return '—';
    if (!when) return name;
    try {
      return `${name}, ${new Date(when).toLocaleString()}`;
    } catch (e) {
      return `${name}, ${when}`;
    }
  }
}
