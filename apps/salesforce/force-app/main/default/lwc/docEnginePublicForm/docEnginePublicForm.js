import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getPublicForm from '@salesforce/apex/DocEnginePublicFormController.getPublicForm';
import submitPublicForm from '@salesforce/apex/DocEnginePublicFormController.submitPublicForm';
import {
  ensureDocEngineAssets,
  createDocEditor,
  emptyDocument,
  parseJsonSafe,
  assertDocumentJsonSize,
  exportHtmlForPdf,
  apexErrorMessage
} from 'c/docEngineLib';

export default class DocEnginePublicForm extends LightningElement {
  /** Optional App Builder override; URL ?token= wins when present. */
  @api token;

  loading = true;
  submitted = false;
  editorBusy = false;
  errorMessage = '';
  statusMessage = '';
  thankYouMessage = 'Thank you. Your application was submitted.';
  formTitle = 'Form';
  showEditor = false;

  _token = '';
  _form = null;
  _editor = null;
  _initialData = null;
  _hideEmpty = false;
  _allowPdfAttach = false;
  _pdfFilename = 'document.pdf';
  _pendingInit = false;
  _prefill = null;

  @wire(CurrentPageReference)
  wiredPageRef(ref) {
    const fromState = ref && ref.state && ref.state.token ? String(ref.state.token).trim() : '';
    const fromUrl = this._tokenFromLocation();
    const next = fromUrl || fromState || (this.token ? String(this.token).trim() : '');
    if (next && next !== this._token) {
      this._token = next;
      this._bootstrap();
    } else if (!next && !this._token) {
      this.loading = false;
      this.errorMessage = 'Missing form token. Open the public link provided by the organization.';
    }
  }

  connectedCallback() {
    const fromUrl = this._tokenFromLocation();
    if (fromUrl) {
      this._token = fromUrl;
    } else if (this.token) {
      this._token = String(this.token).trim();
    }
    if (this._token) {
      this._bootstrap();
    }
  }

  renderedCallback() {
    if (!this._pendingInit || !this.showEditor) {
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

  get showForm() {
    return !this.loading && !this.errorMessage && !this.submitted && this.showEditor;
  }

  get submitDisabled() {
    return this.editorBusy;
  }

  async handleSubmit() {
    if (this.submitDisabled || !this._editor) {
      return;
    }
    this.editorBusy = true;
    this.statusMessage = 'Submitting…';
    try {
      if (typeof this._editor.exportFields !== 'function') {
        throw new Error('exportFields is not available on the editor.');
      }
      const values = await this._editor.exportFields();
      const documentJson = JSON.stringify(values);
      assertDocumentJsonSize(documentJson);

      let html = null;
      if (this._allowPdfAttach === true) {
        try {
          html = await exportHtmlForPdf(this._editor, {
            title: (this._pdfFilename || 'document').replace(/\.pdf$/i, '') || 'document',
            hideEmptyValues: this._hideEmpty === true
          });
        } catch (e) {
          // Non-fatal: record + JSON still save; PDF attach skipped server-side without HTML.
          html = null;
        }
      }

      const raw = await submitPublicForm({
        token: this._token,
        answersJson: documentJson,
        html,
        captchaToken: null
      });
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (result && result.message) {
        this.thankYouMessage = result.message;
      }
      if (result && result.pdfWarning) {
        this.thankYouMessage += ' (File attach warning: document was still saved.)';
      }
      this._destroyEditor();
      this.showEditor = false;
      this.submitted = true;
      this.statusMessage = '';
    } catch (err) {
      this.statusMessage = '';
      this.errorMessage = '';
      // Keep form open; show inline status rather than full-page error.
      this.statusMessage = apexErrorMessage(err) || 'Submit failed.';
    } finally {
      this.editorBusy = false;
    }
  }

  async _bootstrap() {
    if (!this._token) {
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.submitted = false;
    try {
      const raw = await getPublicForm({ token: this._token });
      const form = typeof raw === 'string' ? JSON.parse(raw) : raw;
      this._form = form;
      this.formTitle = (form && form.name) || 'Form';
      this._allowPdfAttach = form && form.allowPdfAttach === true;
      this._hideEmpty = form && form.hideEmpty === true;
      this._pdfFilename = (form && form.pdfFilename) || 'document.pdf';
      this._initialData = parseJsonSafe(form && form.templateJson, emptyDocument());
      this._prefill = form && form.prefill ? form.prefill : null;

      await ensureDocEngineAssets(this);
      this._destroyEditor();
      this.showEditor = true;
      this._pendingInit = true;
    } catch (err) {
      this.errorMessage = apexErrorMessage(err) || 'Could not load this form.';
      this.showEditor = false;
    } finally {
      this.loading = false;
    }
  }

  async _mountEditor(editorRoot, stickyChrome, docActions) {
    try {
      this._editor = createDocEditor({
        holder: editorRoot,
        chromeParent: stickyChrome,
        documentActionsContainer: docActions,
        designMode: false,
        data: this._initialData || emptyDocument(),
        // Guests: no remote object search / Files upload APIs.
        resolveListItems: async () => [],
        imageUpload: null,
        pdfAvailable: false,
        generatePdfBlob: null,
        onShareDocument: null
      });
      await this._editor.ready;

      if (this._prefill && typeof this._editor.load === 'function') {
        try {
          await this._editor.load(this._prefill);
        } catch (e) {
          // Non-fatal — user can still fill manually.
        }
      }
    } catch (err) {
      this.errorMessage = apexErrorMessage(err) || 'Could not start the form editor.';
      this.showEditor = false;
    }
  }

  _destroyEditor() {
    if (this._editor && typeof this._editor.destroy === 'function') {
      try {
        this._editor.destroy();
      } catch (e) {
        // ignore
      }
    }
    this._editor = null;
  }

  _tokenFromLocation() {
    try {
      if (typeof window === 'undefined' || !window.location) {
        return '';
      }
      const params = new URLSearchParams(window.location.search || '');
      const t = params.get('token');
      return t ? String(t).trim() : '';
    } catch (e) {
      return '';
    }
  }
}
