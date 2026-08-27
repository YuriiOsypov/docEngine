import { renderDocumentPreview } from '../fields/document-preview.js';
import { generateDocumentPdfBlob, isClientPdfAvailable } from '../export/document-pdf.js';
import { buildPreviewHtmlBlob } from '../export/preview-html-document.js';
import { resolvePreviewExportOptions } from '../export/preview-export-options.js';
import {
  applyFieldFormTextStyle,
  applyPageFormatCssVars,
  resolvePageContentWidthMm,
} from '../core/page-setup-styles.js';
import { ACTION_ICONS } from './action-icons.js';
import { showNotification } from './notification.js';
import { saveBlobToDisk } from '../utils/save-blob.js';
import { buildExportFilename } from '../utils/export-filename.js';
import { wireModalEscape } from './wire-modal-escape.js';
import { renderPdfBlobToContainer } from './pdf-canvas-preview.js';
import { mountFieldModalOverlay } from './wire-modal-palette.js';

const PDF_ENGINE_WARM_KEY = 'docengine-pdf-engine-warm';

function isClientPdfEngineWarm() {
  try {
    return sessionStorage.getItem(PDF_ENGINE_WARM_KEY) === '1';
  } catch {
    return false;
  }
}

function markClientPdfEngineWarm() {
  try {
    sessionStorage.setItem(PDF_ENGINE_WARM_KEY, '1');
  } catch {
    /* private mode / blocked storage */
  }
}

async function resolvePdfAvailableFlag({
  pdfAvailable,
  generatePdfBlob,
}: {
  pdfAvailable?: boolean | Promise<boolean> | (() => boolean | Promise<boolean>);
  generatePdfBlob?: ((doc: any, options?: any) => Promise<Blob>) | null;
}): Promise<boolean> {
  if (pdfAvailable !== undefined && pdfAvailable !== null) {
    try {
      const value =
        typeof pdfAvailable === 'function' ? await pdfAvailable() : await Promise.resolve(pdfAvailable);
      return !!value;
    } catch {
      return false;
    }
  }
  return typeof generatePdfBlob === 'function' || isClientPdfAvailable;
}

export function createPreviewModal({
  getFieldValueStyle,
  defaultPdfFilename = 'document.pdf',
  pdfTitle,
  getPageSetup,
  getTextStyle,
  generatePdfBlob,
  /**
   * Gate "View as PDF" / PDF save. When omitted, uses generatePdfBlob or client pdfmake.
   * Prefer an explicit host check (e.g. Salesforce DocEngine_PDF availability).
   */
  pdfAvailable = undefined,
  /** When false (e.g. Salesforce LWS), embed via Static Resource viewer (native PDF, pdf.js fallback). */
  embedPdfInIframe = true,
  parent = null,
  /** Fired when preview opens/closes (more reliable than reading overlay.hidden under LWS). */
  onOpenChange = null,
  /**
   * Host share/email/Slack hook. When set, preview shows a Share button that builds
   * the current-format artifact and calls this callback.
   */
  onShareDocument = null,
}: any = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-overlay--preview';
  overlay.hidden = true;
  let openFlag = false;

  function setOpen(next: boolean) {
    openFlag = !!next;
    overlay.hidden = !openFlag;
    overlay.setAttribute('data-preview-open', openFlag ? 'true' : 'false');
    if (typeof onOpenChange === 'function') {
      try {
        onOpenChange(openFlag);
      } catch {
        /* host callback must not break preview */
      }
    }
  }

  // Optimistic default; refined async when pdfAvailable is a Promise/fn.
  let pdfEnabled =
    pdfAvailable === undefined || pdfAvailable === null
      ? typeof generatePdfBlob === 'function' || isClientPdfAvailable
      : false;
  let pdfAvailabilityResolved = pdfAvailable === undefined || pdfAvailable === null;

  overlay.innerHTML = `
    <div class="modal modal--wide modal--preview" role="dialog" aria-modal="true">
      <div class="modal__header">Document preview</div>
      <div class="modal__body preview-modal__body preview-modal__body--html"></div>
      <div class="modal__footer preview-modal__footer">
        <div class="preview-modal__footer-actions">
          <label class="preview-modal__option">
            <input type="checkbox" data-option="hide-empty" />
            Hide empty values
          </label>
          <span class="preview-modal__pdf-hint" data-role="pdf-hint" hidden>
            PDF via remote service — use Fill → Save + PDF, or configure DocEngine_Pdf.
          </span>
          <button type="button" class="btn" data-action="view-pdf" hidden>View as PDF</button>
          <button type="button" class="btn" data-action="view-html" hidden>View as HTML</button>
          <button type="button" class="btn btn-icon preview-modal__save" data-action="save" title="Save" aria-label="Save"></button>
          <button type="button" class="btn btn-icon preview-modal__share" data-action="share" title="Share" aria-label="Share" hidden></button>
        </div>
        <button type="button" class="btn btn-primary" data-action="close">Close</button>
      </div>
    </div>
  `;

  mountFieldModalOverlay(overlay, parent);

  const modalEl = overlay.querySelector('.modal');
  const header = overlay.querySelector('.modal__header');
  const body = overlay.querySelector('.modal__body');
  const btnClose = overlay.querySelector('[data-action="close"]');
  const btnViewPdf = overlay.querySelector('[data-action="view-pdf"]');
  const btnViewHtml = overlay.querySelector('[data-action="view-html"]');
  const btnSave = overlay.querySelector('[data-action="save"]');
  const btnShare = overlay.querySelector('[data-action="share"]');
  const hideEmptyCheckbox = overlay.querySelector('[data-option="hide-empty"]');
  const pdfHint = overlay.querySelector('[data-role="pdf-hint"]');
  btnSave.innerHTML = ACTION_ICONS.save;
  btnShare.innerHTML = ACTION_ICONS.share;

  const shareEnabled = typeof onShareDocument === 'function';

  let currentDoc: any = null;
  let pdfBlob: any = null;
  let pdfBlobUrl: any = null;
  let saving = false;
  let sharing = false;
  let viewMode: 'html' | 'pdf' = 'html';
  let pdfLoading = false;
  let hideEmptyValues = false;

  function revokeBlobUrl() {
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      pdfBlobUrl = null;
    }
  }

  function documentTitle(doc: any = currentDoc) {
    const options = doc ? previewOptions(doc) : null;
    return (
      options?.title ||
      doc?.pageSetup?.title ||
      pdfTitle ||
      String(defaultPdfFilename).replace(/\.(pdf|html|htm)$/i, '') ||
      'document'
    );
  }

  function suggestedFilename(format: 'html' | 'pdf') {
    const baseFromUi = String(defaultPdfFilename || '').replace(/\.(pdf|html|htm)$/i, '');
    return buildExportFilename({
      title: documentTitle(),
      baseName: baseFromUi && baseFromUi !== 'document' ? baseFromUi : undefined,
      format,
      unique: true,
    });
  }

  function previewOptions(doc: any) {
    return resolvePreviewExportOptions(doc, {
      fieldValueStyle: getFieldValueStyle?.() ?? undefined,
      hideEmptyValues,
    }, {
      pdfTitle,
      getPageSetup,
    });
  }

  function invalidatePdf() {
    pdfBlob = null;
    revokeBlobUrl();
  }

  function updateSaveChrome() {
    const format = viewMode === 'pdf' ? 'PDF' : 'HTML';
    const label = `Save ${format}`;
    btnSave.title = label;
    btnSave.setAttribute('aria-label', label);
    if (btnShare) {
      const shareLabel = `Share ${format}`;
      btnShare.title = shareLabel;
      btnShare.setAttribute('aria-label', shareLabel);
    }
  }

  function setFooterButtonVisible(btn: any, visible: boolean) {
    if (!btn) return;
    btn.hidden = !visible;
  }

  function usesClientPdfEngine() {
    return typeof generatePdfBlob !== 'function' && isClientPdfAvailable;
  }

  function syncFooterButtons() {
    // HTML mode: never show "Back to HTML". PDF mode: show it to return.
    setFooterButtonVisible(btnViewPdf, pdfEnabled && viewMode === 'html');
    setFooterButtonVisible(btnViewHtml, pdfEnabled && viewMode === 'pdf');
    // Save always available for the current view format (HTML even when PDF is unavailable).
    setFooterButtonVisible(btnSave, true);
    setFooterButtonVisible(btnShare, shareEnabled);
    const busy = pdfLoading || saving || sharing;
    btnSave.disabled = busy || (viewMode === 'pdf' && !pdfEnabled);
    if (btnShare) {
      btnShare.disabled = busy || (viewMode === 'pdf' && !pdfEnabled);
    }
    if (pdfHint) {
      pdfHint.hidden = pdfEnabled || !pdfAvailabilityResolved;
    }
    if (btnViewPdf) {
      const coldClientPdf = usesClientPdfEngine() && !isClientPdfEngineWarm();
      btnViewPdf.title = coldClientPdf
        ? 'First PDF can take 30–50 seconds while the engine downloads'
        : 'View as PDF';
    }
    updateSaveChrome();
  }

  function onHideEmptyChange() {
    hideEmptyValues = !!hideEmptyCheckbox.checked;
    invalidatePdf();
    if (currentDoc) {
      if (viewMode === 'html') {
        showHtmlPreview(currentDoc);
      } else if (pdfEnabled) {
        showPdfView();
      }
    }
  }

  function setBodyMode(mode: any) {
    body.classList.toggle('preview-modal__body--html', mode === 'html');
    body.classList.toggle('preview-modal__body--pdf', mode === 'pdf');
  }

  function close() {
    if (!openFlag && overlay.hidden) {
      return;
    }
    setOpen(false);
    body.innerHTML = '';
    currentDoc = null;
    pdfBlob = null;
    viewMode = 'html';
    pdfLoading = false;
    sharing = false;
    hideEmptyValues = false;
    hideEmptyCheckbox.checked = false;
    revokeBlobUrl();
    setBodyMode('html');
    syncFooterButtons();
  }

  function isOpen() {
    return openFlag || !overlay.hidden || overlay.getAttribute('data-preview-open') === 'true';
  }

  function getViewMode() {
    return viewMode;
  }

  function getHideEmptyValues() {
    return hideEmptyValues;
  }

  function isPdfEnabled() {
    return pdfEnabled;
  }

  function showLoading(message: any = 'Generating PDF…') {
    pdfLoading = true;
    setBodyMode('pdf');
    const coldClientPdf = usesClientPdfEngine() && !isClientPdfEngineWarm();
    const hint = coldClientPdf
      ? `<p class="preview-modal__loading-hint">First time can take 30–50 seconds while the PDF engine downloads.</p>`
      : '';
    body.innerHTML = `<div class="preview-modal__loading"><p class="preview-modal__loading-title">${message}</p>${hint}</div>`;
    syncFooterButtons();
  }

  function showError(message: any) {
    pdfLoading = false;
    setBodyMode('pdf');
    body.innerHTML = `<div class="preview-modal__loading preview-modal__loading--error"><p class="preview-modal__loading-title">${message}</p></div>`;
    syncFooterButtons();
  }

  function showHtmlPreview(doc: any) {
    viewMode = 'html';
    pdfLoading = false;
    setBodyMode('html');
    body.innerHTML = '';

    const options = previewOptions(doc);
    const pageSetup = options.pageSetup ?? doc?.pageSetup ?? {};
    const contentWidthMm = resolvePageContentWidthMm(pageSetup);

    const wrap = document.createElement('div');
    wrap.className = 'preview-modal__html';

    const sheet = document.createElement('div');
    sheet.className = 'preview-modal__sheet';
    applyPageFormatCssVars(sheet, pageSetup);
    sheet.style.setProperty('--doc-page-content-width', `${contentWidthMm}mm`);

    const preview = renderDocumentPreview(doc, options);
    sheet.appendChild(preview);
    wrap.appendChild(sheet);
    body.appendChild(wrap);
    syncFooterButtons();
  }

  async function showPdfCanvas(blob: any) {
    pdfBlob = blob;
    pdfLoading = false;
    viewMode = 'pdf';
    revokeBlobUrl();
    setBodyMode('pdf');
    body.innerHTML = '';
    const host = document.createElement('div');
    host.className = 'preview-modal__pdf preview-modal__pdf--canvas';
    body.appendChild(host);
    syncFooterButtons();
    try {
      await renderPdfBlobToContainer(host, blob);
    } catch (err: any) {
      host.remove();
      throw err;
    }
  }

  function showPdfIframe(blob: any) {
    pdfBlob = blob;
    pdfLoading = false;
    viewMode = 'pdf';
    revokeBlobUrl();
    setBodyMode('pdf');
    body.innerHTML = '';

    pdfBlobUrl = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.className = 'preview-modal__pdf';
    iframe.src = pdfBlobUrl;
    iframe.title = 'Document PDF preview';
    body.appendChild(iframe);
    syncFooterButtons();
  }

  async function ensurePdfBlob() {
    if (pdfBlob) return pdfBlob;
    if (!currentDoc) throw new Error('No document to preview.');
    if (!pdfEnabled) throw new Error('PDF generation is not available.');

    const options = previewOptions(currentDoc);
    if (typeof generatePdfBlob === 'function') {
      pdfBlob = await generatePdfBlob(currentDoc, options);
    } else {
      pdfBlob = await generateDocumentPdfBlob(currentDoc, options);
      markClientPdfEngineWarm();
    }
    return pdfBlob;
  }

  async function showPdfView() {
    if (!pdfEnabled) return;
    showLoading();
    pdfBlob = null;
    revokeBlobUrl();
    try {
      const blob = await ensurePdfBlob();
      // LWS blocks blob: iframe.src — Static Resource viewer shows the original PDF bytes.
      if (!embedPdfInIframe) {
        await showPdfCanvas(blob);
        return;
      }
      showPdfIframe(blob);
    } catch (err: any) {
      const message =
        err?.body?.message ||
        err?.message ||
        (typeof err === 'string' ? err : null) ||
        'PDF preview failed.';
      showError(message);
      showNotification(message, { type: 'error', durationMs: 8000 });
    }
  }

  async function buildCurrentArtifact() {
    if (!currentDoc) throw new Error('No document to share.');
    if (viewMode === 'pdf') {
      if (!pdfEnabled) throw new Error('PDF generation is not available.');
      const blob = await ensurePdfBlob();
      return {
        blob,
        filename: suggestedFilename('pdf'),
        mimeType: 'application/pdf',
        format: 'pdf' as const,
      };
    }
    const blob = buildPreviewHtmlBlob(currentDoc, previewOptions(currentDoc));
    return {
      blob,
      filename: suggestedFilename('html'),
      mimeType: 'text/html;charset=utf-8',
      format: 'html' as const,
    };
  }

  async function saveCurrent() {
    if (saving || sharing || !currentDoc) return;
    if (viewMode === 'pdf' && !pdfEnabled) return;

    saving = true;
    btnSave.disabled = true;
    try {
      const artifact = await buildCurrentArtifact();
      await saveBlobToDisk(artifact.blob, artifact.filename, artifact.mimeType.split(';')[0]);
    } catch (err: any) {
      showNotification(err?.message ?? 'Save failed.');
    } finally {
      saving = false;
      syncFooterButtons();
    }
  }

  async function shareCurrent() {
    if (!shareEnabled || sharing || saving || !currentDoc) return;
    if (viewMode === 'pdf' && !pdfEnabled) return;

    sharing = true;
    if (btnShare) btnShare.disabled = true;
    try {
      const artifact = await buildCurrentArtifact();
      await onShareDocument(artifact);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      showNotification(err?.message ?? 'Share failed.');
    } finally {
      sharing = false;
      syncFooterButtons();
    }
  }

  function applyChromeTextStyle() {
    const textStyle = getTextStyle?.() ?? null;
    applyFieldFormTextStyle(modalEl, textStyle);
    applyFieldFormTextStyle(header, textStyle);
    for (const btn of overlay.querySelectorAll('.modal__footer .btn')) {
      applyFieldFormTextStyle(btn, textStyle);
    }
  }

  async function refreshPdfAvailability() {
    pdfEnabled = await resolvePdfAvailableFlag({ pdfAvailable, generatePdfBlob });
    pdfAvailabilityResolved = true;
    if (!pdfEnabled && viewMode === 'pdf' && currentDoc) {
      showHtmlPreview(currentDoc);
      return;
    }
    syncFooterButtons();
  }

  function open(doc: any, options: any = {}) {
    currentDoc = doc;
    pdfBlob = null;
    revokeBlobUrl();
    hideEmptyValues = options.hideEmptyValues === true;
    hideEmptyCheckbox.checked = hideEmptyValues;
    applyChromeTextStyle();
    mountFieldModalOverlay(overlay, parent);
    setOpen(true);
    showHtmlPreview(doc);
    void refreshPdfAvailability();
    try {
      btnClose.focus({ preventScroll: true });
    } catch {
      /* Lightning focus trap may reject — preview is still open */
    }
  }

  btnClose.addEventListener('click', close);
  btnViewPdf.addEventListener('click', () => {
    showPdfView();
  });
  btnViewHtml.addEventListener('click', () => {
    if (currentDoc) showHtmlPreview(currentDoc);
  });
  btnSave.addEventListener('click', () => {
    void saveCurrent();
  });
  btnShare.addEventListener('click', () => {
    void shareCurrent();
  });
  hideEmptyCheckbox.addEventListener('change', onHideEmptyChange);

  overlay.addEventListener('click', (e: any) => {
    if (e.target === overlay) close();
  });

  wireModalEscape(overlay, () => close());

  void refreshPdfAvailability();

  return {
    open,
    close,
    isOpen,
    getViewMode,
    getHideEmptyValues,
    isPdfEnabled,
    refreshPdfAvailability,
  };
}
