import {
  execRichTextCommand,
  sanitizeHtml,
  saveSelection,
} from '../fields/rich-text.js';
import { FORMAT_ICONS } from './format-icons.js';
import { wireModalEscape } from './wire-modal-escape.js';
import { applyFieldFormTextStyle } from '../core/page-setup-styles.js';
import { FIELD_PICKER_POSITION_COOKIE, wireModalMove } from './wire-modal-move.js';
import {
  FIELD_MODAL_FOOTER_HINT_HTML,
  FIELD_MODAL_OVERLAY_CLASS,
  mountFieldModalOverlay,
  wireFieldModalFocus,
  wireModalConfirmShortcut,
} from './wire-modal-palette.js';

const COMMANDS = [
  { command: 'bold', title: 'Bold' },
  { command: 'italic', title: 'Italic' },
  { command: 'underline', title: 'Underline' },
  { command: 'strikeThrough', title: 'Strikethrough' },
  { command: 'mark', title: 'Highlight' },
  { command: 'inlineCode', title: 'Inline code' },
  { command: 'insertUnorderedList', title: 'Bullet list' },
  { command: 'insertOrderedList', title: 'Numbered list' },
  { command: 'removeFormat', title: 'Clear formatting' },
];

const HEADING_COMMANDS = [
  { command: 'heading1', title: 'Heading 1' },
  { command: 'heading2', title: 'Heading 2' },
  { command: 'heading3', title: 'Heading 3' },
];

const ALIGN_COMMANDS = [
  { command: 'justifyLeft', title: 'Align left' },
  { command: 'justifyCenter', title: 'Align center' },
  { command: 'justifyRight', title: 'Align right' },
];

function createToolbarButton({ command, title }: any) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rich-text-toolbar__btn rich-text-toolbar__btn--icon html-text-modal__toolbar-btn';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.dataset.command = command;
  btn.innerHTML = FORMAT_ICONS[command] ?? '';
  return btn;
}

export function createHtmlTextModal({ parent = null }: { parent?: HTMLElement | null } = {}) {
  const overlay = document.createElement('div');
  overlay.className = FIELD_MODAL_OVERLAY_CLASS;
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="modal modal--html-text" role="dialog" aria-modal="true">
      <div class="modal__header"></div>
      <div class="html-text-modal__toolbar" data-role="toolbar"></div>
      <div class="modal__body">
        <div
          class="html-text-modal__editor cke_editable"
          contenteditable="true"
          spellcheck="true"
          data-role="editor"
          tabindex="0"
        ></div>
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
  const toolbar = overlay.querySelector('[data-role="toolbar"]') as HTMLElement | null;
  const editor = overlay.querySelector('[data-role="editor"]') as HTMLElement | null;
  const btnClear = overlay.querySelector('[data-action="clear"]') as HTMLButtonElement | null;
  const btnOk = overlay.querySelector('[data-action="ok"]') as HTMLButtonElement | null;
  const btnClose = overlay.querySelector('[data-action="close"]') as HTMLButtonElement | null;

  let resolvePromise: any = null;
  let rejectPromise: any = null;
  let savedRange: any = null;
  let releaseFocus: (() => void) | null = null;

  function rememberSelection() {
    savedRange = saveSelection(editor);
  }

  for (const item of COMMANDS) {
    const btn = createToolbarButton(item);
    btn.addEventListener('mousedown', (e: any) => e.preventDefault());
    btn.addEventListener('click', () => {
      execRichTextCommand(item.command, editor, savedRange);
      rememberSelection();
      editor.focus();
    });
    toolbar.appendChild(btn);
  }

  const headingGroup = document.createElement('div');
  headingGroup.className = 'html-text-modal__heading-group';
  for (const item of HEADING_COMMANDS) {
    const btn = createToolbarButton(item);
    btn.addEventListener('mousedown', (e: any) => e.preventDefault());
    btn.addEventListener('click', () => {
      execRichTextCommand(item.command, editor, savedRange);
      rememberSelection();
      editor.focus();
    });
    headingGroup.appendChild(btn);
  }
  toolbar.appendChild(headingGroup);

  const alignGroup = document.createElement('div');
  alignGroup.className = 'html-text-modal__align-group';
  for (const item of ALIGN_COMMANDS) {
    const btn = createToolbarButton(item);
    btn.addEventListener('mousedown', (e: any) => e.preventDefault());
    btn.addEventListener('click', () => {
      execRichTextCommand(item.command, editor, savedRange);
      rememberSelection();
      editor.focus();
    });
    alignGroup.appendChild(btn);
  }
  toolbar.appendChild(alignGroup);

  editor.addEventListener('keyup', rememberSelection);
  editor.addEventListener('mouseup', rememberSelection);
  editor.addEventListener('focus', rememberSelection);

  function close() {
    releaseFocus?.();
    releaseFocus = null;
    overlay.hidden = true;
    editor.innerHTML = '';
    savedRange = null;
  }

  function open({ title, value = '', placeholder = '', textStyle = null }: any) {
    return new Promise((resolve: any, reject: any) => {
      resolvePromise = resolve;
      rejectPromise = reject;
      header.textContent = title;
      // Convert literal escaped newlines (from JSON like "\\n\\r") into real line breaks,
      // then ensure they become actual <br> nodes (deterministic for sanitizeHtml).
      const normalized = String(value ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n\\r/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\n\r/g, '\n')
        .replace(/\r/g, '\n');
      editor.innerHTML = sanitizeHtml(normalized.replace(/\n/g, '<br>'));
      editor.dataset.placeholder = placeholder || 'Enter text...';
      applyFieldFormTextStyle(modalRoot, textStyle);
      applyFieldFormTextStyle(editor, textStyle);
      if (!editor.textContent?.trim() && placeholder) {
        editor.dataset.empty = 'true';
      } else {
        delete editor.dataset.empty;
      }
      mountFieldModalOverlay(overlay, parent);
      overlay.hidden = false;
      // Ensure editable under Lightning LWS (attribute can be stripped on re-parent).
      editor.setAttribute('contenteditable', 'true');
      editor.setAttribute('tabindex', '0');
      releaseFocus = wireFieldModalFocus(overlay, editor);
      rememberSelection();
    });
  }

  btnOk.addEventListener('click', () => {
    const result = sanitizeHtml(editor.innerHTML);
    const resolve = resolvePromise;
    close();
    resolve?.(result);
    resolvePromise = null;
    rejectPromise = null;
  });

  btnClear.addEventListener('click', () => {
    const resolve = resolvePromise;
    close();
    resolve?.('');
    resolvePromise = null;
    rejectPromise = null;
  });

  btnClose.addEventListener('click', () => {
    rejectPromise?.(new Error('cancelled'));
    resolvePromise = null;
    rejectPromise = null;
    close();
  });

  overlay.addEventListener('click', (e: any) => {
    if (e.target === overlay) btnClose.click();
  });

  editor.addEventListener('keydown', (e: any) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      btnOk.click();
    }
  });

  wireModalConfirmShortcut(overlay, btnOk);
  wireModalEscape(overlay, () => btnClose.click());

  return { open };
}
