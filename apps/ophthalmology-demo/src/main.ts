// @ts-nocheck
import {
  createEditor,
  registerField,
  normalizeImportedDoc,
  buildTemplateExport,
  applyDocumentValues,
  normalizeDocumentValues,
  validateRequiredFields,
  saveBlobToDisk,
  normalizeFieldMappingSpec,
  showNotification,
} from '@docengine/editor';
import {
  registerDateField,
  createDatePickerCallbacks,
} from '@docengine/field-date';
import '@docengine/editor/styles.css';
import '@docengine/editor/themes/bridge.css';
import './styles/demo.css';
import './styles/modern-theme.css';

import { createOphthalmologyTemplate } from './data/ophthalmology-template.js';
import { ophthalmologyCatalogs } from './catalogs.js';
import { resolveOphthalmologyListItems } from './services/resolve-list-items.js';

registerDateField({ registerField });

const defaultDocument = createOphthalmologyTemplate();

let docEngine = createEditor({
  holder: '#editorjs',
  data: defaultDocument,
  defaultDocument,
  catalogs: ophthalmologyCatalogs,
  resolveListItems: resolveOphthalmologyListItems,
  tools: ['documentSection', 'templateBlock'],
  pickers: createDatePickerCallbacks(),
  ui: {
    chromeParent: '.page-sticky-chrome',
    designLayout: 'panels',
    documentActionsContainer: '.page-actions__document',
    pdfFilename: 'ophthalmology-document.pdf',
  },

  imageUpload: {

    uploadUrl: import.meta.env.VITE_UPLOAD_BASE_URL ?? '',

    stub: !import.meta.env.VITE_UPLOAD_BASE_URL,

  },

});



const designToggle = document.getElementById('design-mode-toggle');

designToggle?.addEventListener('change', async () => {

  await docEngine.setDesignMode(designToggle.checked);

});



async function saveJson(data, defaultFilename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  await saveBlobToDisk(blob, defaultFilename, 'application/json');
}



async function loadJsonFile(file) {

  const text = await file.text();

  return JSON.parse(text);

}



function formatMissingRequiredMessage(missing) {

  const labels = missing.map((item) => item.label);

  if (labels.length === 1) {

    return `Cannot save: required field is empty — ${labels[0]}.`;

  }

  const preview = labels.slice(0, 5).join(', ');

  const more = labels.length > 5 ? ` (+${labels.length - 5} more)` : '';

  return `Cannot save: ${labels.length} required fields are empty — ${preview}${more}.`;

}



async function ensureRequiredFieldsFilled() {

  const { valid, missing } = await docEngine.validate();

  if (valid) return true;

  showNotification(formatMissingRequiredMessage(missing), { type: 'error' });

  return false;

}



document.getElementById('btn-save-full-document')?.addEventListener('click', async () => {

  if (!(await ensureRequiredFieldsFilled())) return;

  await saveJson(await docEngine.exportDoc(), 'ophthalmology-full-document.json');

});



document.getElementById('btn-save-template')?.addEventListener('click', async () => {

  await saveJson(await docEngine.exportTemplate(), 'ophthalmology-template.json');

});



document.getElementById('btn-save-fields')?.addEventListener('click', async () => {

  if (!(await ensureRequiredFieldsFilled())) return;

  await saveJson(await docEngine.exportFields(), 'ophthalmology-values.json');

});



function detectImportKind(data: any) {

  if (!data || typeof data !== 'object') {

    throw new Error('File is not valid JSON.');

  }

  if (data.kind === 'fieldMapping') return 'mapping';

  if (data.kind === 'template') return 'template';

  if (data.kind === 'field') return 'values';

  if (data.kind === 'document') {

    if (!Array.isArray(data.blocks) && (data.values || data.sections)) return 'values';

    return 'document';

  }

  if (data.fieldMapping && typeof data.fieldMapping === 'object' && !Array.isArray(data.blocks)) {

    return 'mapping';

  }

  if (Array.isArray(data.blocks)) return 'document';

  if (data.values || data.sections) return 'values';

  if (data.fieldSchemas) return 'template';

  throw new Error('Unrecognized JSON. Expected a full document, template, values, or field mapping file.');

}



async function importJson(data: any) {

  const kind = detectImportKind(data);

  if (kind === 'document') {

    await docEngine.load(normalizeImportedDoc(data));

    return;

  }

  if (kind === 'template') {

    if (!confirm('Load template? Current layout and field schemas will be replaced.')) return;

    await docEngine.load(normalizeImportedDoc(data));

    if (data.fieldMapping && typeof data.fieldMapping === 'object') {

      docEngine.setFieldMapping(normalizeFieldMappingSpec(data.fieldMapping));

    }

    return;

  }

  if (kind === 'mapping') {

    const mapping = data.kind === 'fieldMapping' ? data : data.fieldMapping;

    docEngine.setFieldMapping(normalizeFieldMappingSpec(mapping));

    alert('Field mapping loaded. Save template to persist it with the template export.');

    return;

  }

  if (!data.values && !data.sections) {

    alert('Values file has no values or sections.');

    return;

  }

  const doc = await docEngine.getDocument();

  const values = normalizeDocumentValues(data, doc.blocks, doc.fieldSchemas);

  const { blocks, fieldSchemas: nextFieldSchemas } = applyDocumentValues(

    doc.blocks,

    values,

    doc.fieldSchemas,

  );

  await docEngine.load({

    time: data.time ?? Date.now(),

    fieldSchemas: nextFieldSchemas,

    blocks,

  });

}



document.getElementById('btn-import')?.addEventListener('change', async (e: any) => {

  const file = e.target.files?.[0];

  if (!file) return;

  try {

    await importJson(await loadJsonFile(file));

  } catch (err: any) {

    alert('Failed to import: ' + err.message);

  }

  e.target.value = '';

});



document.getElementById('btn-edit-mapping')?.addEventListener('click', async () => {

  try {

    await docEngine.openFieldMapping();

  } catch (err: any) {

    if (err?.message !== 'cancelled') {

      alert('Field mapping: ' + (err?.message ?? String(err)));

    }

  }

});



document.getElementById('btn-save-mapping')?.addEventListener('click', async () => {
  // Mapping is persisted inside the template JSON (fieldMapping), not as a separate file.
  await saveJson(await docEngine.exportTemplate(), 'ophthalmology-template.json');
});



// Re-export schemas for template module compatibility

export { ophthalmologySchemas };

