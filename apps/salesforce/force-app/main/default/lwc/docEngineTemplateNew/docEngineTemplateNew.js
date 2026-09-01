import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CloseActionScreenEvent } from 'lightning/actions';
import listSourceObjects from '@salesforce/apex/DocEngineObjectDescribeController.listSourceObjects';
import createTemplate from '@salesforce/apex/DocEngineTemplateController.createTemplate';

export default class DocEngineTemplateNew extends NavigationMixin(LightningElement) {
  templateName = '';
  description = '';
  sourceObject = '';
  saving = false;
  objectOptions = [];

  @wire(listSourceObjects, { searchTerm: '' })
  wiredObjects({ data, error }) {
    if (data) {
      this.objectOptions = data.map((o) => ({ label: o.label, value: o.value }));
    } else if (error) {
      this._showError('Could not load objects', error);
    }
  }

  get createDisabled() {
    return this.saving || !this.templateName || !this.sourceObject;
  }

  handleNameChange(event) {
    this.templateName = event.target.value;
  }

  handleDescriptionChange(event) {
    this.description = event.target.value;
  }

  handleSourceChange(event) {
    this.sourceObject = event.detail.value;
  }

  handleCancel() {
    this.dispatchEvent(new CloseActionScreenEvent());
    this[NavigationMixin.Navigate]({
      type: 'standard__objectPage',
      attributes: {
        objectApiName: 'DocEngine_Template__c',
        actionName: 'list'
      }
    });
  }

  async handleCreate() {
    if (this.createDisabled) {
      return;
    }
    this.saving = true;
    try {
      const templateId = await createTemplate({
        name: this.templateName.trim(),
        objectApiName: this.sourceObject,
        description: this.description || ''
      });

      this.dispatchEvent(
        new ShowToastEvent({
          title: 'Template created',
          message: 'Opening the DocEngine editor…',
          variant: 'success'
        })
      );

      this.dispatchEvent(new CloseActionScreenEvent());

      this[NavigationMixin.Navigate]({
        type: 'standard__recordPage',
        attributes: {
          recordId: templateId,
          objectApiName: 'DocEngine_Template__c',
          actionName: 'view'
        }
      });
    } catch (err) {
      this._showError('Create failed', err);
    } finally {
      this.saving = false;
    }
  }

  _showError(title, err) {
    const message =
      (err && err.body && err.body.message) || (err && err.message) || String(err);
    this.dispatchEvent(
      new ShowToastEvent({ title, message, variant: 'error', mode: 'sticky' })
    );
  }
}
