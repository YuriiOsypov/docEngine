/**
 * LWS-safe print helpers.
 *
 * Salesforce Lightning Web Security blocks iframe document.write / blob: iframe.src.
 * We inject a temporary print root into the host document and use window.print() with
 * @media print CSS that shows only that root.
 */

const PRINT_ROOT_CLASS = 'docengine-print-root';
const PRINTING_CLASS = 'docengine-printing';

/**
 * Print a standalone HTML document string (with inlined CSS).
 */
export function printHtmlDocument(html: string): Promise<void> {
  const { styles, bodyHtml } = splitHtmlDocument(String(html ?? ''));
  return printInPage({ styles, bodyHtml });
}

/**
 * Print a Blob. HTML blobs are rendered in-page; PDF blobs open via object URL
 * when the environment allows (non-LWS). Under LWS callers should pass HTML instead.
 */
export async function printBlob(blob: Blob): Promise<void> {
  const type = String(blob?.type || '').toLowerCase();
  if (type.includes('html') || type === '' || type.includes('text/')) {
    const html = await blob.text();
    return printHtmlDocument(html);
  }
  // PDF / other: try temporary object-URL window (blocked under LWS — callers fall back to HTML).
  const url = URL.createObjectURL(blob);
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      throw new Error('Pop-up blocked. Allow pop-ups to print PDF, or use HTML preview print.');
    }
    const run = () => {
      try {
        opened.focus();
        opened.print();
      } catch {
        /* some browsers require user gesture inside the new window */
      }
    };
    if (opened.document?.readyState === 'complete') {
      setTimeout(run, 250);
    } else {
      opened.addEventListener('load', () => setTimeout(run, 250), { once: true });
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function splitHtmlDocument(html: string): { styles: string; bodyHtml: string } {
  if (typeof DOMParser === 'undefined') {
    return { styles: '', bodyHtml: html };
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'))
      .map((el) => el.textContent || '')
      .join('\n');
    const bodyHtml = doc.body ? doc.body.innerHTML : html;
    return { styles, bodyHtml };
  } catch {
    return { styles: '', bodyHtml: html };
  }
}

function printInPage({ styles, bodyHtml }: { styles: string; bodyHtml: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    cleanupPrintRoot();

    const root = document.createElement('div');
    root.className = PRINT_ROOT_CLASS;
    root.setAttribute('aria-hidden', 'true');

    if (styles) {
      const styleEl = document.createElement('style');
      styleEl.textContent = styles;
      root.appendChild(styleEl);
    }

    const sheet = document.createElement('div');
    sheet.className = 'docengine-print-sheet';
    // Assign via innerHTML of a detached node — same technique used for preview HTML export.
    sheet.innerHTML = bodyHtml;
    root.appendChild(sheet);

    const mountParent = document.body || document.documentElement;
    mountParent.appendChild(root);
    document.documentElement.classList.add(PRINTING_CLASS);

    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('afterprint', onAfterPrint);
      cleanupPrintRoot();
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve();
    };

    const onAfterPrint = () => finish();

    window.addEventListener('afterprint', onAfterPrint);

    // Fallback when afterprint does not fire (some embedded / Lightning shells).
    window.setTimeout(() => finish(), 2500);

    try {
      // Defer one frame so the print root is in the layout before the dialog opens.
      requestAnimationFrame(() => {
        try {
          window.print();
        } catch (err) {
          finish(err);
        }
      });
    } catch (err) {
      finish(err);
    }
  });
}

function cleanupPrintRoot() {
  document.documentElement.classList.remove(PRINTING_CLASS);
  document.querySelectorAll(`.${PRINT_ROOT_CLASS}`).forEach((el) => {
    try {
      el.remove();
    } catch {
      /* ignore */
    }
  });
}
