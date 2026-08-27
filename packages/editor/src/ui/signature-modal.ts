import { wireModalEscape } from './wire-modal-escape.js';
import { FIELD_PICKER_POSITION_COOKIE, wireModalMove } from './wire-modal-move.js';
import {
  FIELD_MODAL_FOOTER_HINT_HTML,
  FIELD_MODAL_OVERLAY_CLASS,
  mountFieldModalOverlay,
  wireModalConfirmShortcut,
} from './wire-modal-palette.js';
import { normalizeImageValue } from '../services/image-upload.js';

export type SignaturePickerOptions = {
  title?: string;
  value?: string | { url?: string } | null;
  parent?: HTMLElement | null;
};

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 150;
const STROKE_WIDTH = 2;
const SIGNATURE_DISCLAIMER =
  'Display-only signature pad for internal validation — not a cryptographically signed legal e-signature.';

function resolveSignatureUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'url' in value) {
    return String((value as { url?: string }).url ?? '').trim();
  }
  return normalizeImageValue(value).url;
}

export function createSignatureModal({ parent = null }: { parent?: HTMLElement | null } = {}) {
  const overlay = document.createElement('div');
  overlay.className = FIELD_MODAL_OVERLAY_CLASS;
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="modal modal--wide" role="dialog" aria-modal="true">
      <div class="modal__header"></div>
      <div class="modal__body signature-modal">
        <p class="modal__hint signature-modal__disclaimer">${SIGNATURE_DISCLAIMER}</p>
        <div class="signature-modal__canvas-wrap">
          <canvas
            class="signature-modal__canvas"
            width="${CANVAS_WIDTH}"
            height="${CANVAS_HEIGHT}"
            aria-label="Draw your signature"
          ></canvas>
        </div>
        <p class="modal__error" data-role="error" hidden></p>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn" data-action="clear">Clear</button>
        <button type="button" class="btn btn-primary" data-action="ok">OK</button>
        ${FIELD_MODAL_FOOTER_HINT_HTML}
        <button type="button" class="btn" data-action="close">Close</button>
      </div>
    </div>
  `;

  mountFieldModalOverlay(overlay, parent);

  const modalRoot = overlay.querySelector('.modal') as HTMLElement | null;
  if (modalRoot) wireModalMove(modalRoot, { cookieKey: FIELD_PICKER_POSITION_COOKIE });

  const header = overlay.querySelector('.modal__header') as HTMLElement | null;
  const canvas = overlay.querySelector('.signature-modal__canvas') as HTMLCanvasElement | null;
  const errorEl = overlay.querySelector('[data-role="error"]') as HTMLElement | null;
  const btnOk = overlay.querySelector('[data-action="ok"]') as HTMLButtonElement | null;
  const btnClose = overlay.querySelector('[data-action="close"]') as HTMLButtonElement | null;
  const btnClear = overlay.querySelector('[data-action="clear"]') as HTMLButtonElement | null;

  let resolvePromise: ((value: string) => void) | null = null;
  let rejectPromise: ((reason?: unknown) => void) | null = null;
  let drawing = false;
  let hasStroke = false;

  function showError(message: string) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function getCtx() {
    return canvas?.getContext('2d') ?? null;
  }

  function clearCanvas() {
    const ctx = getCtx();
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStroke = false;
    showError('');
  }

  function fillWhiteBackground() {
    const ctx = getCtx();
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function beginStrokeStyle() {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = STROKE_WIDTH;
    ctx.strokeStyle = '#111111';
  }

  function pointerPos(event: PointerEvent) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function loadExisting(url: string) {
    clearCanvas();
    fillWhiteBackground();
    if (!url || !canvas) return;
    const img = new Image();
    img.onload = () => {
      const ctx = getCtx();
      if (!ctx || !canvas) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      hasStroke = true;
    };
    img.onerror = () => {
      showError('Could not load the existing signature.');
    };
    img.src = url;
  }

  function close() {
    overlay.hidden = true;
    drawing = false;
    showError('');
  }

  function finish(value: string) {
    const resolve = resolvePromise;
    close();
    resolve?.(value);
    resolvePromise = null;
    rejectPromise = null;
  }

  function cancel() {
    const reject = rejectPromise;
    close();
    reject?.(new Error('cancelled'));
    resolvePromise = null;
    rejectPromise = null;
  }

  function open(opts: SignaturePickerOptions = {}) {
    return new Promise<string>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
      if (header) header.textContent = opts.title ?? 'Signature';
      clearCanvas();
      fillWhiteBackground();
      loadExisting(resolveSignatureUrl(opts.value));
      mountFieldModalOverlay(overlay, opts.parent ?? parent);
      overlay.hidden = false;
      canvas?.focus();
    });
  }

  if (canvas) {
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const ctx = getCtx();
      if (!ctx) return;
      drawing = true;
      hasStroke = true;
      beginStrokeStyle();
      canvas.setPointerCapture(event.pointerId);
      const { x, y } = pointerPos(event);
      ctx.beginPath();
      ctx.moveTo(x, y);
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const ctx = getCtx();
      if (!ctx) return;
      const { x, y } = pointerPos(event);
      ctx.lineTo(x, y);
      ctx.stroke();
      event.preventDefault();
    });

    const stopDrawing = (event: PointerEvent) => {
      if (!drawing) return;
      drawing = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    canvas.addEventListener('pointerleave', (event) => {
      if (drawing) stopDrawing(event);
    });
  }

  btnOk?.addEventListener('click', () => {
    if (!canvas) {
      finish('');
      return;
    }
    if (!hasStroke) {
      showError('Draw a signature before saving, or use Clear to remove it.');
      return;
    }
    finish(canvas.toDataURL('image/png'));
  });

  btnClear?.addEventListener('click', () => finish(''));
  btnClose?.addEventListener('click', () => cancel());

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) btnClose?.click();
  });

  wireModalConfirmShortcut(overlay, btnOk);
  wireModalEscape(overlay, () => {
    if (!overlay.hidden) btnClose?.click();
  });

  return { open };
}
