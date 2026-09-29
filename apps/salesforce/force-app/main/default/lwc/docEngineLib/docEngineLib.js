/**
 * Shared DocEngine Static Resource loader + editor factory for LWCs.
 * Import: import { ensureDocEngineAssets, createDocEditor, emptyDocument } from 'c/docEngineLib';
 */
import { loadStyle, loadScript } from 'lightning/platformResourceLoader';
import editorCss from '@salesforce/resourceUrl/DocEngineCss';
import editorJs from '@salesforce/resourceUrl/DocEngineBundle';
import pdfViewer from '@salesforce/resourceUrl/DocEnginePdfViewer';
import isPdfAvailable from '@salesforce/apex/DocEnginePdfController.isAvailable';
import getPdfProvider from '@salesforce/apex/DocEnginePdfController.getPdfProvider';
import generatePdfBase64 from '@salesforce/apex/DocEnginePdfController.generatePdfBase64';
import uploadFieldImage from '@salesforce/apex/DocEngineInstanceController.uploadFieldImage';
import listRecordImages from '@salesforce/apex/DocEngineInstanceController.listRecordImages';
import resolveFieldImage from '@salesforce/apex/DocEngineInstanceController.resolveFieldImage';

const assetsByComponent = new WeakMap();
let cachedPdfProvider = null;

export function emptyDocument() {
  return {
    time: Date.now(),
    fieldSchemas: {},
    blocks: []
  };
}

/**
 * Load DocEngineCss + DocEngineBundle once per component instance.
 * @param {LightningElement} component
 */
export async function ensureDocEngineAssets(component) {
  if (assetsByComponent.get(component)) {
    return;
  }
  // LWS-safe PDF preview: native browser PDF plugin inside Static Resource iframe.
  window.__DOCENGINE_PDF_VIEWER_URL__ = `${pdfViewer}/viewer.html?v=4`;
  await Promise.all([loadStyle(component, editorCss), loadScript(component, editorJs)]);
  assetsByComponent.set(component, true);
}

/**
 * @returns {typeof window.DocEditor.createEditor}
 */
export function getCreateEditor() {
  const createEditor = window.DocEditor && window.DocEditor.createEditor;
  if (typeof createEditor !== 'function') {
    throw new Error(
      'DocEditor.createEditor not found on window.DocEditor. Run npm run build:sf and deploy DocEngineBundle.'
    );
  }
  return createEditor;
}

/**
 * Convert Apex base64 PDF to a Blob for the editor preview / download.
 * @param {string} base64
 * @returns {Blob}
 */
export function base64ToPdfBlob(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * True when the active PDF provider can generate (Salesforce always; External needs DocEngine_PDF).
 */
export async function checkPdfAvailable() {
  try {
    return !!(await isPdfAvailable());
  } catch (e) {
    return false;
  }
}

/**
 * Salesforce | External (from DocEngine_Settings__c.Use_External_PDF__c).
 */
export async function resolvePdfProvider() {
  if (cachedPdfProvider) {
    return cachedPdfProvider;
  }
  try {
    cachedPdfProvider = (await getPdfProvider()) || 'Salesforce';
  } catch (e) {
    cachedPdfProvider = 'Salesforce';
  }
  return cachedPdfProvider;
}

function apexErrorMessage(err) {
  if (!err) return 'Unknown error';
  const body = err.body;
  if (typeof body === 'string' && body.trim()) return body;
  if (Array.isArray(body) && body.length) {
    const parts = body
      .map((e) => (e && (e.message || e.exceptionMessage)) || '')
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  if (body && typeof body === 'object') {
    if (typeof body.message === 'string' && body.message) return body.message;
    if (body.message && typeof body.message === 'object') {
      try {
        return JSON.stringify(body.message);
      } catch (e) {
        /* fall through */
      }
    }
    if (body.exceptionMessage) return body.exceptionMessage;
    if (body.pageErrors && body.pageErrors[0] && body.pageErrors[0].message) {
      return body.pageErrors[0].message;
    }
    if (body.fieldErrors && typeof body.fieldErrors === 'object') {
      const msgs = [];
      Object.keys(body.fieldErrors).forEach((field) => {
        (body.fieldErrors[field] || []).forEach((e) => {
          if (e && e.message) msgs.push(e.message);
        });
      });
      if (msgs.length) return msgs.join('; ');
    }
  }
  if (err.message && err.message !== '[object Object]') return err.message;
  try {
    return JSON.stringify(err);
  } catch (e) {
    return String(err);
  }
}

export { apexErrorMessage };

const DATA_IMAGE_URL_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;

/**
 * Salesforce image uploader — stores Files via Apex so field values stay under Long Text Area limits.
 * When recordId is set, also allows picking an existing image File on that record.
 * @param {string|null|undefined} recordId Optional parent record (Sales Order, Template, …).
 */
export function createSalesforceImageUpload(recordId) {
  const parentId = recordId || null;
  const config = {
    stub: false,
    uploadByFile: async (file) => {
      const base64 = await blobToBase64(file);
      const result = await uploadFieldImage({
        recordId: parentId,
        base64Data: base64,
        filename: (file && file.name) || 'image.png'
      });
      if (!result || !result.url) {
        throw new Error('Image upload returned no URL');
      }
      return {
        success: 1,
        file: { url: result.url, name: (file && file.name) || 'image.png' }
      };
    },
    uploadByUrl: async (url) => ({
      success: 1,
      file: { url: String(url || '').trim() }
    })
  };

  if (parentId) {
    config.listExistingImages = async () => {
      const rows = await listRecordImages({ recordId: parentId });
      return (rows || []).map((row) => ({
        id: String(row.contentVersionId || ''),
        name: row.title
          ? row.fileExtension
            ? `${row.title}.${row.fileExtension}`
            : row.title
          : String(row.contentVersionId || 'image'),
        url: row.thumbnailUrl || undefined,
        extension: row.fileExtension || undefined
      })).filter((item) => item.id);
    };
    config.resolveExistingImage = async (id) => {
      const result = await resolveFieldImage({
        contentVersionId: id,
        sourceRecordId: parentId
      });
      if (!result || !result.url) {
        throw new Error('Could not resolve Salesforce File URL');
      }
      return {
        success: 1,
        file: { url: result.url, name: String(id) }
      };
    };
  }

  return config;
}

/**
 * Replace embedded data:image URLs in an exportFields payload with File URLs.
 * Covers ImageValue `{ url }` objects and Signature plain-string data URLs.
 * Safe no-op when none are present. Mutates a deep clone.
 * @param {object} values
 * @param {string|null|undefined} recordId
 */
export async function replaceEmbeddedImageDataUrls(values, recordId) {
  if (!values || typeof values !== 'object') return values;
  const clone = JSON.parse(JSON.stringify(values));
  /** @type {Map<string, Promise<string>>} */
  const inflight = new Map();

  async function persistUrl(dataUrl) {
    const key = String(dataUrl);
    if (inflight.has(key)) return inflight.get(key);
    const work = (async () => {
      const mimeMatch = key.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
      const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
      let ext = 'png';
      if (/jpeg|jpg/i.test(mime)) ext = 'jpg';
      else if (/gif/i.test(mime)) ext = 'gif';
      else if (/webp/i.test(mime)) ext = 'webp';
      else if (/svg/i.test(mime)) ext = 'svg';
      // Send raw base64 only — smaller Apex payload than a full data URL.
      const comma = key.indexOf(',');
      const rawBase64 = comma >= 0 ? key.slice(comma + 1) : key;
      const result = await uploadFieldImage({
        recordId: recordId || null,
        base64Data: rawBase64,
        filename: `field-image.${ext}`
      });
      if (!result || !result.url) {
        throw new Error('Could not persist embedded image to Files');
      }
      return result.url;
    })();
    inflight.set(key, work);
    return work;
  }

  async function replaceInString(text) {
    if (typeof text !== 'string' || text.indexOf('data:image') < 0) return text;
    if (DATA_IMAGE_URL_RE.test(text)) {
      return persistUrl(text);
    }
    // HTML (and similar) may embed data URLs mid-string.
    const embeddedRe = /data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+/gi;
    const matches = text.match(embeddedRe);
    if (!matches || !matches.length) return text;
    let out = text;
    for (let i = 0; i < matches.length; i += 1) {
      const raw = matches[i].replace(/\s+/g, '');
      if (!DATA_IMAGE_URL_RE.test(raw)) continue;
      const url = await persistUrl(raw);
      out = out.split(matches[i]).join(url);
    }
    return out;
  }

  async function walk(node) {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        const item = node[i];
        if (typeof item === 'string') {
          node[i] = await replaceInString(item);
        } else {
          await walk(item);
        }
      }
      return;
    }
    if (typeof node !== 'object') return;
    if (typeof node.url === 'string' && node.url.indexOf('data:image') >= 0) {
      node.url = await replaceInString(node.url);
      delete node.embedded;
      delete node.stub;
    }
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === 'url') continue;
      const child = node[key];
      if (typeof child === 'string') {
        node[key] = await replaceInString(child);
      } else {
        await walk(child);
      }
    }
  }

  await walk(clone);
  return clone;
}

/** Long Text Area / Aura-safe ceiling used before calling saveInstance. */
export const DOCUMENT_JSON_MAX_CHARS = 120000;

export function assertDocumentJsonSize(documentJson) {
  const len = documentJson == null ? 0 : String(documentJson).length;
  if (len > DOCUMENT_JSON_MAX_CHARS) {
    throw new Error(
      `Document JSON is too large (${len} chars; max ${DOCUMENT_JSON_MAX_CHARS}). ` +
        'Remove embedded images/signatures or wait for Files upload to finish, then save again.'
    );
  }
  return len;
}

function withPdfHint(message) {
  const hint =
    /not installed|DocEngine PDF|External PDF|pdf\.example\.com|Timed out|Unauthorized endpoint|CalloutException|Unable to connect|DNS|Unknown host|404|503|502/i.test(
      message
    )
      ? ' See Setup → Custom Settings → DocEngine Settings, or integrations/salesforce/PDF_PACKAGE.md.'
      : '';
  return (message || 'PDF generation failed.') + hint;
}

/**
 * Build standalone HTML for Salesforce Blob.toPdf from document JSON.
 * @param {object} doc
 * @param {object} [options]
 * @returns {string}
 */
export function buildHtmlFromDocument(doc, options = {}) {
  const DocEditor = typeof window !== 'undefined' ? window.DocEditor : null;
  if (DocEditor && typeof DocEditor.buildPreviewHtmlDocument === 'function') {
    return DocEditor.buildPreviewHtmlDocument(doc, options);
  }
  const title = String((options && options.title) || 'document').replace(/</g, '&lt;');
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' +
    title +
    '</title></head><body><pre>' +
    String(JSON.stringify(doc || {}, null, 2)).replace(/</g, '&lt;') +
    '</pre></body></html>'
  );
}

const SF_PDF_EXTRA_CSS = `
/* Salesforce Blob.toPdf — old-school layout helpers */
table.sf-pdf-columns {
  width: 100% !important;
  table-layout: fixed !important;
  border-collapse: collapse;
  border: none;
  margin: 0.5em 0;
}
table.sf-pdf-columns > tbody > tr > td,
table.sf-pdf-columns > tr > td {
  vertical-align: top;
  padding: 0 8px 0 0;
  word-wrap: break-word;
  white-space: normal;
  border: none;
}
table.sf-pdf-columns > tbody > tr > td:last-child,
table.sf-pdf-columns > tr > td:last-child {
  padding-right: 0;
  padding-left: 8px;
}
table.vision-table,
table.sf-pdf-table {
  width: 100% !important;
  table-layout: fixed !important;
  border-collapse: collapse;
}
table.vision-table th,
table.vision-table td,
table.sf-pdf-table th,
table.sf-pdf-table td {
  word-wrap: break-word;
  white-space: normal;
  overflow-wrap: break-word;
  vertical-align: top;
}
.document-columns__toolbar,
.document-columns__col-resizer,
.document-table__toolbar,
.vision-table__col-resizer,
.vision-table__row-actions,
.vision-table__row-remove,
.document-table__row-actions {
  display: none !important;
}
/* Blob.toPdf ignores CSS max-width on images — width is set per <img> in JS. */
img.field-token__thumb,
.field-token--image img {
  height: auto !important;
  max-width: 100% !important;
}
`.trim();

function parsePercentWidth(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const s = String(raw).trim();
  const m = s.match(/^([\d.]+)\s*%?$/);
  if (m) {
    const n = Number(m[1]);
    if (!Number.isNaN(n) && n > 0) return Math.min(100, n) + '%';
  }
  if (/fr$/i.test(s)) {
    // Treat "1fr 2fr"-style single token as equal share later
    return fallback;
  }
  return fallback;
}

function columnWidthsFromGrid(grid, colCount) {
  const wrapper = grid.closest && grid.closest('.document-columns');
  const w0 = wrapper && wrapper.dataset ? wrapper.dataset.columnWidth0 : null;
  const w1 = wrapper && wrapper.dataset ? wrapper.dataset.columnWidth1 : null;
  if (colCount === 2 && (w0 || w1)) {
    const a = parsePercentWidth(w0, '50%');
    const b = parsePercentWidth(w1, '50%');
    return [a, b];
  }
  const style = grid.getAttribute('style') || '';
  const tracks = style.match(/grid-template-columns\s*:\s*([^;]+)/i);
  if (tracks) {
    const parts = tracks[1].trim().split(/\s+/).filter(Boolean);
    if (parts.length >= colCount) {
      const nums = parts.slice(0, colCount).map((p) => {
        const fr = p.match(/^([\d.]+)fr$/i);
        if (fr) return Number(fr[1]) || 1;
        const pct = p.match(/^([\d.]+)%$/);
        if (pct) return Number(pct[1]) || 1;
        return 1;
      });
      const sum = nums.reduce((a, b) => a + b, 0) || colCount;
      return nums.map((n) => Math.round((n / sum) * 1000) / 10 + '%');
    }
  }
  const equal = Math.round((100 / colCount) * 10) / 10 + '%';
  return Array.from({ length: colCount }, () => equal);
}

function moveChildren(fromEl, toEl) {
  while (fromEl.firstChild) {
    toEl.appendChild(fromEl.firstChild);
  }
}

/**
 * Rewrite CSS-grid columns → HTML tables and harden data tables for Blob.toPdf.
 * Browser preview / External pdf-service should NOT use this.
 * @param {string} html
 * @returns {string}
 */
export function normalizeHtmlForSalesforcePdf(html) {
  if (!html || typeof html !== 'string') {
    return html;
  }
  if (typeof DOMParser === 'undefined') {
    return html;
  }

  let doc;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch (e) {
    return html;
  }
  if (!doc || !doc.body) {
    return html;
  }

  // Drop design chrome that should never print
  doc
    .querySelectorAll(
      '.document-columns__toolbar, .document-columns__col-resizer, .document-table__toolbar, .vision-table__col-resizer, .vision-table__row-actions, .vision-table__row-remove, .document-table__row-actions'
    )
    .forEach((el) => el.remove());

  // CSS Grid columns → 1-row HTML table (Salesforce PDF ignores display:grid)
  doc.querySelectorAll('.document-columns__grid').forEach((grid) => {
    const cols = Array.from(grid.children).filter(
      (el) => el.classList && el.classList.contains('document-columns__col')
    );
    if (!cols.length) {
      return;
    }
    const widths = columnWidthsFromGrid(grid, cols.length);
    const table = doc.createElement('table');
    table.className = 'sf-pdf-columns';
    table.setAttribute('width', '100%');
    table.setAttribute('cellpadding', '0');
    table.setAttribute('cellspacing', '0');
    table.setAttribute('border', '0');
    table.style.cssText = 'width:100%;table-layout:fixed;border-collapse:collapse;border:none;';

    const tr = doc.createElement('tr');
    cols.forEach((col, i) => {
      const td = doc.createElement('td');
      const w = widths[i] || Math.round(100 / cols.length) + '%';
      td.setAttribute('width', w);
      td.setAttribute('valign', 'top');
      td.style.cssText =
        'width:' +
        w +
        ';vertical-align:top;word-wrap:break-word;white-space:normal;padding:0 8px 0 0;border:none;';
      if (i === cols.length - 1) {
        td.style.paddingRight = '0';
        td.style.paddingLeft = '8px';
      }
      moveChildren(col, td);
      tr.appendChild(td);
    });
    table.appendChild(tr);

    const parent = grid.parentNode;
    if (parent) {
      parent.replaceChild(table, grid);
    }
  });

  // Product / vision tables: fixed layout + equal or colgroup-based % widths
  doc.querySelectorAll('table.vision-table, table.document-table').forEach((table) => {
    table.classList.add('sf-pdf-table');
    table.setAttribute('width', '100%');
    table.style.tableLayout = 'fixed';
    table.style.width = '100%';

    const colgroup = table.querySelector('colgroup');
    const cols = colgroup ? Array.from(colgroup.querySelectorAll('col')) : [];
    const headerCells = table.querySelectorAll('thead tr:first-child > th, thead tr:first-child > td');
    const firstRowCells =
      headerCells.length > 0
        ? headerCells
        : table.querySelectorAll('tr:first-child > th, tr:first-child > td');
    const n = firstRowCells.length || cols.length;
    if (!n) {
      return;
    }

    let widths = [];
    if (cols.length === n) {
      widths = cols.map((col) => {
        const styleW = (col.getAttribute('style') || '').match(/width\s*:\s*([^;]+)/i);
        const attrW = col.getAttribute('width');
        return parsePercentWidth(styleW ? styleW[1] : attrW, null) || null;
      });
      if (widths.some((w) => !w)) {
        const equal = Math.round((100 / n) * 10) / 10 + '%';
        widths = widths.map((w) => w || equal);
      } else {
        const nums = widths.map((w) => Number(String(w).replace('%', '')));
        const sum = nums.reduce((a, b) => a + b, 0);
        if (sum > 0 && Math.abs(sum - 100) >= 0.15) {
          widths = nums.map((value) => Math.round((value / sum) * 1000) / 10 + '%');
        }
      }
    } else {
      const equal = Math.round((100 / n) * 10) / 10 + '%';
      widths = Array.from({ length: n }, () => equal);
    }

    firstRowCells.forEach((cell, i) => {
      const w = widths[i];
      if (!w) return;
      cell.setAttribute('width', w);
      cell.style.width = w;
      cell.style.wordWrap = 'break-word';
      cell.style.whiteSpace = 'normal';
      cell.style.verticalAlign = 'top';
    });
    if (cols.length === n) {
      cols.forEach((col, i) => {
        const w = widths[i];
        if (!w) return;
        col.setAttribute('width', w);
        col.style.width = w;
        col.style.minWidth = w;
        col.style.maxWidth = '';
      });
    }

    table.querySelectorAll('th, td').forEach((cell) => {
      cell.style.wordWrap = 'break-word';
      cell.style.whiteSpace = 'normal';
      if (!cell.style.verticalAlign) {
        cell.style.verticalAlign = 'top';
      }
    });
  });

  // Salesforce Blob.toPdf ignores CSS max-width — pin field images to schema maxWidth.
  doc.querySelectorAll('.field-token--image img, img.field-token__thumb').forEach((img) => {
    const token = img.closest ? img.closest('.field-token--image') : null;
    let maxW = 320;
    if (token) {
      const fromVar =
        (token.style && token.style.getPropertyValue('--field-image-max-width')) || '';
      const fromData = token.getAttribute('data-max-width') || '';
      const n = parseInt(fromVar || fromData, 10);
      if (n > 0) maxW = n;
    } else {
      const attrW = parseInt(img.getAttribute('width') || '', 10);
      if (attrW > 0) maxW = attrW;
    }
    img.setAttribute('width', String(maxW));
    img.style.width = maxW + 'px';
    img.style.maxWidth = maxW + 'px';
    img.style.height = 'auto';
  });

  // Soft wrap after - / in long tokens (helps codes like 1.2-0.6)
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  textNodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || /^(SCRIPT|STYLE|TEXTAREA)$/i.test(parent.tagName)) {
      return;
    }
    const v = node.nodeValue;
    if (!v || v.length < 10) {
      return;
    }
    if (!/[\-\/]/.test(v)) {
      return;
    }
    // Insert zero-width space after hyphen/slash to allow breaks without changing visible text
    node.nodeValue = v.replace(/([^\s])([\-\/])(?=[^\s])/g, '$1$2\u200b');
  });

  // Inject SF PDF CSS (append so it overrides conflicting modern rules)
  let head = doc.head;
  if (!head) {
    head = doc.createElement('head');
    if (doc.documentElement) {
      doc.documentElement.insertBefore(head, doc.body);
    }
  }
  const style = doc.createElement('style');
  style.setAttribute('data-docengine-sf-pdf', '1');
  style.textContent = SF_PDF_EXTRA_CSS;
  head.appendChild(style);

  const doctype = '<!DOCTYPE html>\n';
  return doctype + doc.documentElement.outerHTML;
}

/**
 * PDF via active provider: Salesforce (HTML→Blob.toPdf) or External (pdf-service callout).
 * @param {object} doc
 * @param {object} [options]
 * @param {object} [options.template] Template export — External PDF sends template + values only
 * @param {string} [options.html] Prebuilt HTML for Salesforce Blob.toPdf provider
 * @param {boolean} [options.hideEmptyValues]
 */
export async function generatePdfBlobFromApex(doc, options = {}) {
  try {
    const provider = await resolvePdfProvider();
    const template =
      options && options.template != null && typeof options.template === 'object'
        ? options.template
        : null;
    // External PDF: send template + values only (not a second full layout snapshot).
    const documentPayload =
      provider !== 'Salesforce' && template && isFullDocumentPayload(doc)
        ? toValuesOnlyForPdf(doc, options)
        : doc;
    const documentJson = JSON.stringify(documentPayload);
    const templateJson = template != null ? JSON.stringify(template) : null;
    let html = options && options.html;
    if (provider === 'Salesforce') {
      if (!html) {
        html = buildHtmlFromDocument(doc, options);
      }
      html = normalizeHtmlForSalesforcePdf(html);
    }
    const base64 = await generatePdfBase64({
      documentJson,
      html: html || null,
      templateJson
    });
    if (!base64) {
      throw new Error('PDF service returned an empty response.');
    }
    return base64ToPdfBlob(base64);
  } catch (err) {
    throw new Error(withPdfHint(apexErrorMessage(err)));
  }
}

/**
 * Collapse a filled editor document into kind:"field" values for lean PDF callouts.
 * Prefers DocEngineBundle.buildFieldsExport when available.
 * @param {object} doc
 * @param {{ hideEmptyValues?: boolean }} [options]
 */
export function toValuesOnlyForPdf(doc, options = {}) {
  if (isValuesOnlyPayload(doc)) {
    return doc;
  }
  const hideEmptyValues = options.hideEmptyValues === true;
  const buildFieldsExport =
    typeof window !== 'undefined' &&
    window.DocEditor &&
    typeof window.DocEditor.buildFieldsExport === 'function'
      ? window.DocEditor.buildFieldsExport
      : null;
  if (buildFieldsExport) {
    return buildFieldsExport(doc, { hideEmptyValues });
  }
  const values = {};
  for (const block of doc.blocks || []) {
    if (block && block.type === 'documentSection' && block.data && block.data.fieldValues) {
      Object.assign(values, block.data.fieldValues);
    }
  }
  return {
    kind: 'field',
    version: 2,
    time: doc.time || Date.now(),
    values
  };
}

/**
 * HTML for Save + PDF when using Salesforce provider (prefer live editor export).
 * Applies Salesforce PDF HTML normalization (columns→table, fixed tables).
 * @param {object} editor
 * @param {{ title?: string, hideEmptyValues?: boolean }} [opts]
 */
export async function exportHtmlForPdf(editor, opts = {}) {
  const title = opts.title || 'document';
  const hideEmptyValues = !!opts.hideEmptyValues;
  let html;
  if (editor && typeof editor.exportPreviewHtml === 'function') {
    html = await editor.exportPreviewHtml({ hideEmptyValues, title });
  } else if (editor && typeof editor.exportDoc === 'function') {
    const doc = await editor.exportDoc();
    html = buildHtmlFromDocument(doc, { title, hideEmptyValues });
  } else {
    html = buildHtmlFromDocument({}, { title });
  }
  return normalizeHtmlForSalesforcePdf(html);
}

/**
 * Templates that use commonListId / commonTreeId (e.g. Ophthalmology Examination)
 * need shared catalogs. Prefer explicit options.catalogs; otherwise supply
 * ophthalmology catalogs from the DocEngineBundle when the document schemas need them.
 * @param {object} options
 */
function resolveCatalogs(options = {}) {
  if (options.catalogs) {
    return options.catalogs;
  }
  const schemas = Object.values((options.data && options.data.fieldSchemas) || {});
  const needsCatalog = schemas.some((s) => s && (s.commonListId || s.commonTreeId));
  const bundled =
    typeof window !== 'undefined' &&
    window.DocEditor &&
    window.DocEditor.ophthalmologyCatalogs;
  if (needsCatalog && bundled) {
    return bundled;
  }
  return { lists: {}, trees: {} };
}

/**
 * Mount createEditor with Lightning-friendly chrome defaults.
 * Pass generatePdfBlob only when DocEngine_PDF is installed (use resolveCreateDocEditorOptions).
 * Date field type is registered in DocEngineBundle; pickers.openDatePicker is supplied here.
 */
export function createDocEditor(options) {
  const createEditor = getCreateEditor();
  const {
    holder,
    chromeParent,
    documentActionsContainer,
    designMode = false,
    data,
    catalogs: _catalogsIgnored,
    resolveListItems,
    remoteListCollections,
    remoteListLabelFields,
    generatePdfBlob = null,
    pdfAvailable,
    onChange,
    onShareDocument,
    onPreviewStateChange,
    ui: uiOptions,
    fieldValueStyle: fieldValueStyleOptions,
    pickers: pickersOptions,
    ...rest
  } = options;

  const datePickers =
    typeof window !== 'undefined' &&
    window.DocEditor &&
    typeof window.DocEditor.createDatePickerCallbacks === 'function'
      ? window.DocEditor.createDatePickerCallbacks()
      : {};

  // Do not put ui/fieldValueStyle in ...rest after this — that overwrote embedPdfInIframe.
  return createEditor({
    ...rest,
    holder,
    designMode,
    data: data || emptyDocument(),
    catalogs: resolveCatalogs(options),
    pickers: {
      ...datePickers,
      ...(pickersOptions || {})
    },
    ui: {
      designLayout: 'chrome',
      chromeParent,
      documentActionsContainer,
      stickyChrome: false,
      ...(uiOptions || {}),
      // LWS blocks blob: iframe.src — Static Resource viewer shows original PDF bytes
      embedPdfInIframe: false
    },
    fieldValueStyle: {
      default: {
        fontFamily: "'Salesforce Sans', Arial, sans-serif",
        fontSize: '0.8125rem'
      },
      ...(fieldValueStyleOptions || {})
    },
    resolveListItems,
    remoteListCollections,
    remoteListLabelFields,
    generatePdfBlob,
    pdfAvailable,
    onChange,
    onShareDocument,
    onPreviewStateChange
  });
}

/**
 * Resolve createDocEditor options with PDF helpers and Salesforce image upload.
 * Pass `recordId` to link uploaded images to the source record / template.
 * @param {object} options
 */
export async function resolveCreateDocEditorOptions(options = {}) {
  const { recordId, imageUpload, ...rest } = options;
  const pdfOk = await checkPdfAvailable();
  return {
    ...rest,
    imageUpload: imageUpload || createSalesforceImageUpload(recordId || null),
    generatePdfBlob:
      options.generatePdfBlob !== undefined
        ? options.generatePdfBlob
        : pdfOk
          ? (doc, opts = {}) =>
              generatePdfBlobFromApex(doc, {
                ...opts,
                template: opts.template ?? rest.data ?? rest.defaultDocument,
              })
          : null,
    pdfAvailable: options.pdfAvailable !== undefined ? options.pdfAvailable : pdfOk
  };
}

/**
 * Convert a Blob to base64 (no data: URL prefix) for Apex EncodingUtil.base64Decode.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(blob);
  });
}

function shareMimeType(mimeType) {
  return String(mimeType || 'application/octet-stream').split(';')[0].trim();
}

/**
 * @param {{ blob: Blob, filename: string, mimeType?: string }} artifact
 * @returns {File | null}
 */
export function artifactToFile(artifact) {
  if (!artifact || !artifact.blob) return null;
  try {
    return new File([artifact.blob], artifact.filename || 'document', {
      type: shareMimeType(artifact.mimeType)
    });
  } catch (e) {
    return null;
  }
}

/**
 * True when the browser can open a system share sheet with this file (Email, Slack, …).
 */
export function canNativeShareArtifact(artifact) {
  try {
    if (!navigator.share || typeof navigator.canShare !== 'function') return false;
    const file = artifactToFile(artifact);
    if (!file) return false;
    return !!navigator.canShare({ files: [file] });
  } catch (e) {
    return false;
  }
}

/**
 * Open the OS share sheet when supported.
 * @returns {Promise<'shared'|'cancelled'|'unavailable'>}
 */
export async function tryNativeShareArtifact(artifact) {
  const file = artifactToFile(artifact);
  if (!file || !navigator.share) return 'unavailable';
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return 'unavailable';
    }
    await navigator.share({
      files: [file],
      title: artifact.filename || 'Document'
    });
    return 'shared';
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
}

export function parseJsonSafe(raw, fallback = null) {
  if (!raw) {
    return fallback;
  }
  if (typeof raw === 'object') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e && e.message ? e.message : String(e)));
  }
}

/** Values-only payload stored on DocEngine_Document__c (kind: field). */
export function isValuesOnlyPayload(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  if (data.kind === 'field') {
    return true;
  }
  // Legacy/alternate shape: kind document without blocks
  if (data.kind === 'document' && !Array.isArray(data.blocks)) {
    return true;
  }
  return Boolean(data.sections || data.values) && !Array.isArray(data.blocks);
}

/** Full document export (legacy Document_JSON__c with blocks). */
export function isFullDocumentPayload(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  if (data.kind === 'document' && Array.isArray(data.blocks)) {
    return true;
  }
  return Array.isArray(data.blocks);
}

/**
 * Resolve editor bootstrap for reopen:
 * - legacy full Document_JSON → use as initial data
 * - values-only → template structure + pending values to apply after mount
 */
export function resolveReopenEditorData(documentJson, templateJson) {
  const docData = parseJsonSafe(documentJson, null);
  const templateData = parseJsonSafe(templateJson, emptyDocument());

  if (isFullDocumentPayload(docData)) {
    return { initialData: docData, pendingValues: null, legacyFullDocument: true };
  }
  if (isValuesOnlyPayload(docData)) {
    return { initialData: templateData || emptyDocument(), pendingValues: docData, legacyFullDocument: false };
  }
  return {
    initialData: templateData || emptyDocument(),
    pendingValues: null,
    legacyFullDocument: false
  };
}
