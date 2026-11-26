import {
  getSourceFieldsAtPath,
  parsePathTokenContext,
} from '@docengine/engine';

/**
 * @param {string} value
 * @param {number} cursor
 * @returns {{ start: number; end: number; prefix: string } | null}
 */
export function findPathTokenAtCursor(value: any,cursor: any) {
  // Absolute bare paths (`close_date`, `account_id.`) or `$`-paths (`$qty`, legacy `$payload…`).
  // Trailing `.` is included so typing `account_id.` still opens the field helper.
  // Stop at JSON quotes / whitespace so `"old"` does not swallow the closing quote.
  const re = /\$?[A-Za-z_][\w]*(?:\[[^\]]+\])?(?:\.[A-Za-z_][\w]*(?:\[[^\]]+\])?)*\.?/g;
  let match: any;
  while ((match = re.exec(value)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (cursor >= start && cursor <= end) {
      return { start, end, prefix: match[0] };
    }
  }
  return null;
}

/**
 * Mapping-result autocomplete always lists against the root sample.
 * Normalize legacy `$payload…` and mistaken `$account_id.` absolute typing to bare paths.
 * @param {string} prefix
 */
function normalizeAutocompleteLookupPrefix(prefix: any): string {
  const text = String(prefix ?? '');
  if (!text || text === '$payload' || text === '$payload.') return '';
  if (text.startsWith('$payload.')) return text.slice('$payload.'.length);
  // `$account_id.` → `account_id.` so root object children appear in the helper.
  if (text.startsWith('$') && !text.startsWith('$payload')) return text.slice(1);
  return text;
}

/**
 * @param {unknown} payload
 * @param {string} value
 * @param {number} cursor
 * @returns {{ token: { start: number; end: number; prefix: string }; lookupPrefix: string } | null}
 */
export function resolveAutocompleteLookup(payload: any,value: any,cursor: any) {
  const token = findPathTokenAtCursor(value, cursor);
  if (!token?.prefix) return null;

  const context = parsePathTokenContext(token.prefix);
  if (!context) {
    return { token, lookupPrefix: normalizeAutocompleteLookupPrefix(token.prefix) };
  }

  let lookupPrefix = normalizeAutocompleteLookupPrefix(token.prefix);
  if (token.prefix.endsWith('.') || lookupPrefix.endsWith('.')) {
    return { token, lookupPrefix: lookupPrefix.endsWith('.') ? lookupPrefix : `${lookupPrefix}.` };
  }

  const atTokenEnd = cursor >= token.end;
  if (atTokenEnd && context.segmentPrefix) {
    const bareBase = normalizeAutocompleteLookupPrefix(context.basePath);
    const parentLookup = bareBase ? `${bareBase}.` : '';
    const siblings = getSourceFieldsAtPath(payload, parentLookup || context.segmentPrefix);
    const match = siblings.find((field: any) => field.key === context.segmentPrefix);
    if (match && (match.type === 'object' || match.type === 'array')) {
      lookupPrefix = `${match.path}.`;
    }
  }

  return { token, lookupPrefix };
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @returns {{ start: number; end: number; prefix: string } | null}
 */
export function getPathInsertRange(textarea: any) {
  if (!textarea) return null;

  const value = textarea.value;
  const cursor = textarea.selectionStart ?? value.length;
  const selectionEnd = textarea.selectionEnd ?? cursor;

  if (selectionEnd > cursor) {
    return { start: cursor, end: selectionEnd, prefix: value.slice(cursor, selectionEnd) };
  }

  return findPathTokenAtCursor(value, cursor);
}

/**
 * @param {string} key
 */
function formatPathSegment(key: any) {
  if (/^\[\d+\]$/.test(key)) return key;
  if (/^[a-zA-Z_$][\w$]*$/.test(key)) return key;
  return `[${JSON.stringify(key)}]`;
}

/**
 * Leaf JSON key written for a mapping rule in the result object.
 * @param {import('../types.d.ts').FieldMappingRule} rule
 */
export function getMappingResultLeafKey(rule: any) {
  if (!rule) return '';
  if (rule.columnKey) return String(rule.columnKey);
  const childPath = rule.childFieldPath ?? rule.childField ?? '';
  if (childPath) {
    const parts = String(childPath).split('.').filter(Boolean);
    return parts[parts.length - 1] ?? String(rule.field ?? '');
  }
  return String(rule.field ?? '');
}

/**
 * Locate a mapped source-path value in pretty-printed mapping result JSON.
 * @param {string} text
 * @param {{ section?: string; field?: string; sourcePath?: string }} issue
 * @returns {{ start: number; end: number } | null}
 */
export function findMappingResultSourcePathRange(text: any, issue: any) {
  if (!text || !issue?.sourcePath) return null;

  const pathJson = JSON.stringify(String(issue.sourcePath));
  let searchFrom = 0;
  if (issue.section) {
    const sectionNeedle = `${JSON.stringify(String(issue.section))}:`;
    const sectionIdx = text.indexOf(sectionNeedle);
    if (sectionIdx >= 0) searchFrom = sectionIdx;
  }

  if (issue.field) {
    const keyed = `${JSON.stringify(String(issue.field))}: ${pathJson}`;
    let keyedIdx = text.indexOf(keyed, searchFrom);
    if (keyedIdx < 0 && searchFrom > 0) keyedIdx = text.indexOf(keyed);
    if (keyedIdx >= 0) {
      const start = keyedIdx + JSON.stringify(String(issue.field)).length + 2;
      return { start, end: start + pathJson.length };
    }
  }

  let idx = text.indexOf(pathJson, searchFrom);
  if (idx < 0 && searchFrom > 0) idx = text.indexOf(pathJson);
  if (idx < 0) return null;
  return { start: idx, end: idx + pathJson.length };
}

/**
 * Locate a template field key in pretty-printed mapping result JSON.
 * Prefers the key that appears after the issue's section key.
 * @param {string} text
 * @param {{ section?: string; field?: string }} issue
 * @returns {{ start: number; end: number } | null}
 */
export function findMappingResultFieldKeyRange(text: any, issue: any) {
  if (!text || !issue?.field) return null;

  const fieldKey = JSON.stringify(String(issue.field));
  const needle = `${fieldKey}:`;
  let searchFrom = 0;

  if (issue.section) {
    const sectionNeedle = `${JSON.stringify(String(issue.section))}:`;
    const sectionIdx = text.indexOf(sectionNeedle);
    if (sectionIdx >= 0) searchFrom = sectionIdx;
  }

  let idx = text.indexOf(needle, searchFrom);
  if (idx < 0 && searchFrom > 0) {
    idx = text.indexOf(needle);
  }
  if (idx < 0) return null;
  return { start: idx, end: idx + fieldKey.length };
}

/**
 * @param {string} text
 * @param {Array<{ section?: string; field?: string; message?: string; severity?: string; sourcePath?: string }>} issues
 * @returns {Array<{ start: number; end: number; severity: string; message: string }>}
 */
export function findMappingResultIssueRanges(text: any, issues: any) {
  if (!text || !Array.isArray(issues) || !issues.length) return [];

  const ranges: any[] = [];
  const seen = new Set();

  for (const issue of issues) {
    const range = issue?.sourcePath
      ? findMappingResultSourcePathRange(text, issue)
      : findMappingResultFieldKeyRange(text, issue);
    if (!range) continue;
    const key = `${range.start}:${range.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranges.push({
      start: range.start,
      end: range.end,
      severity: issue.severity === 'error' ? 'error' : 'warning',
      message: String(issue.message ?? ''),
    });
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function escapeHighlightHtml(text: any) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build highlight-layer HTML for mapping result text with marked issue ranges.
 * @param {string} text
 * @param {Array<{ start: number; end: number; severity?: string; message?: string }>} ranges
 */
export function buildMappingResultHighlightHtml(text: any, ranges: any = []) {
  const value = String(text ?? '');
  if (!ranges?.length) return escapeHighlightHtml(value);

  let html = '';
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(cursor, Number(range.start) || 0);
    const end = Math.max(start, Number(range.end) || 0);
    if (end <= cursor || start >= value.length) continue;
    html += escapeHighlightHtml(value.slice(cursor, start));
    const severity = range.severity === 'error' ? 'error' : 'warning';
    const title = escapeHighlightHtml(range.message ?? '');
    html += `<mark class="field-mapping-result-highlight__mark field-mapping-result-highlight__mark--${severity}"`;
    if (title) html += ` title="${title}"`;
    html += `>${escapeHighlightHtml(value.slice(start, end))}</mark>`;
    cursor = end;
  }
  html += escapeHighlightHtml(value.slice(cursor));
  return html;
}

/**
 * Mirror layer behind the mapping-result textarea for inline issue marks.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} editorEl
 */
export function wireMappingResultIssueHighlights(textarea: any, editorEl: any) {
  if (!textarea || !editorEl) {
    return {
      update() {
        return 0;
      },
      sync() {},
      destroy() {},
    };
  }

  let highlightEl = editorEl.querySelector('.field-mapping-result-highlight');
  if (!highlightEl) {
    highlightEl = document.createElement('pre');
    highlightEl.className = 'field-mapping-result-highlight';
    highlightEl.setAttribute('aria-hidden', 'true');
    editorEl.insertBefore(highlightEl, textarea);
  }

  editorEl.classList.add('field-mapping-result-editor--highlighted');

  function syncScroll() {
    highlightEl.scrollTop = textarea.scrollTop;
    highlightEl.scrollLeft = textarea.scrollLeft;
  }

  function syncPlain() {
    highlightEl.innerHTML = escapeHighlightHtml(textarea.value);
    syncScroll();
  }

  /**
   * @param {Array<{ section?: string; field?: string; message?: string; severity?: string }>} issues
   */
  function update(issues: any = []) {
    const ranges = findMappingResultIssueRanges(textarea.value, issues);
    highlightEl.innerHTML = buildMappingResultHighlightHtml(textarea.value, ranges);
    syncScroll();
    return ranges.length;
  }

  textarea.addEventListener('scroll', syncScroll);
  textarea.addEventListener('input', syncPlain);
  syncPlain();

  return {
    update,
    sync: syncPlain,
    destroy() {
      textarea.removeEventListener('scroll', syncScroll);
      textarea.removeEventListener('input', syncPlain);
      highlightEl.remove();
      editorEl.classList.remove('field-mapping-result-editor--highlighted');
    },
  };
}

/**
 * Locate the mapped source-path value in pretty-printed mapping result JSON.
 * @param {string} text
 * @param {import('../types.d.ts').FieldMappingRule} rule
 * @returns {{ start: number; end: number } | null}
 */
export function findMappingResultSelection(text: any, rule: any) {
  if (!text || !rule?.sourcePath) return null;

  const pathJson = JSON.stringify(rule.sourcePath);
  const leafKey = getMappingResultLeafKey(rule);
  if (leafKey) {
    const keyJson = JSON.stringify(leafKey);
    const keyed = `${keyJson}: ${pathJson}`;
    const keyedIdx = text.indexOf(keyed);
    if (keyedIdx >= 0) {
      const start = keyedIdx + keyJson.length + 2;
      return { start, end: start + pathJson.length };
    }
  }

  const pathIdx = text.indexOf(pathJson);
  if (pathIdx < 0) return null;
  return { start: pathIdx, end: pathIdx + pathJson.length };
}

/**
 * Focus the mapping-result textarea and select the entry for a rule.
 * @param {HTMLTextAreaElement} textarea
 * @param {import('../types.d.ts').FieldMappingRule} rule
 * @returns {boolean}
 */
export function revealMappingResultEntry(textarea: any, rule: any) {
  if (!textarea || !rule) return false;
  const range = findMappingResultSelection(textarea.value, rule);
  if (!range) return false;

  textarea.focus();
  textarea.setSelectionRange(range.start, range.end);

  const style = typeof getComputedStyle === 'function' ? getComputedStyle(textarea) : null;
  const lineHeight = Number.parseFloat(style?.lineHeight || '') || 18;
  const linesBefore = textarea.value.slice(0, range.start).split('\n').length;
  const visibleLines = Math.max(1, Math.floor((textarea.clientHeight || 160) / lineHeight));
  textarea.scrollTop = Math.max(0, (linesBefore - Math.ceil(visibleLines / 3)) * lineHeight);
  return true;
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {{ key: string; path: string; type: string }} field
 */
export function insertPathSegmentAtCursor(textarea: any,field: any) {
  if (!textarea || !field) return;

  const value = textarea.value;
  const cursor = textarea.selectionStart ?? value.length;
  const token = findPathTokenAtCursor(value, cursor);

  if (token) {
    const context = parsePathTokenContext(token.prefix);
    if (context) {
      const segmentStart = token.start + context.segmentStartInToken;
      const segmentEnd = Math.max(cursor, token.end);
      const segment = formatPathSegment(field.key);
      textarea.setRangeText(segment, segmentStart, segmentEnd, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      return;
    }
  }

  const range = getPathInsertRange(textarea);
  if (range) {
    textarea.setRangeText(field.path, range.start, range.end, 'end');
  } else {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.setRangeText(field.path, start, end, 'end');
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

/**
 * Replace the active $path token, selection, or insert at cursor.
 * @param {HTMLTextAreaElement} textarea
 * @param {string} text
 */
export function insertTextAtCursor(textarea: any,text: any) {
  if (!textarea || !text) return;

  const range = getPathInsertRange(textarea);
  if (range) {
    textarea.setRangeText(text, range.start, range.end, 'end');
  } else {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.setRangeText(text, start, end, 'end');
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {number} position
 * @returns {{ top: number; left: number; lineHeight: number }}
 */
export function getTextareaCaretCoordinates(textarea: any,position: any) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const properties = [
    'boxSizing',
    'width',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'textTransform',
    'wordSpacing',
    'tabSize',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'lineHeight',
    'whiteSpace',
    'wordWrap',
    'overflowWrap',
  ];

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';

  for (const property of properties) {
    mirror.style[property] = style[property];
  }

  const textBefore = textarea.value.slice(0, position);
  const textAfter = textarea.value.slice(position) || '.';
  mirror.textContent = textBefore;

  const marker = document.createElement('span');
  marker.textContent = textAfter;
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const lineHeight = markerRect.height || parseFloat(style.lineHeight) || 18;

  const top = textareaRect.top +
    (markerRect.top - mirrorRect.top) -
    textarea.scrollTop +
    parseFloat(style.borderTopWidth || '0');
  const left = textareaRect.left +
    (markerRect.left - mirrorRect.left) -
    textarea.scrollLeft +
    parseFloat(style.borderLeftWidth || '0');

  document.body.removeChild(mirror);

  return { top, left, lineHeight };
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} menu
 */
function positionPathHelperMenu(textarea: any,menu: any) {
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const { top, left, lineHeight } = getTextareaCaretCoordinates(textarea, cursor);
  const gap = 4;
  const viewportPadding = 8;
  const menuWidth = menu.offsetWidth || 240;
  const menuHeight = menu.offsetHeight || 180;

  let nextTop = top + lineHeight + gap;
  let nextLeft = left;

  if (nextLeft + menuWidth > window.innerWidth - viewportPadding) {
    nextLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
  }
  if (nextLeft < viewportPadding) {
    nextLeft = viewportPadding;
  }

  if (nextTop + menuHeight > window.innerHeight - viewportPadding) {
    nextTop = Math.max(viewportPadding, top - menuHeight - gap);
  }

  menu.style.top = `${nextTop}px`;
  menu.style.left = `${nextLeft}px`;
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} [_anchorEl]
 */
export function wireMappingResultPathHelper(textarea: any,_anchorEl: any) {
  if (!textarea) return;

  const list = document.createElement('div');
  list.className = 'field-mapping-path-helper';
  list.hidden = true;
  document.body.appendChild(list);

  /** @type {unknown} */
  let activePayload: any = null;
  let activeIndex = 0;

  /** @type {Array<{ key: string; path: string; type: string }>} */
  let activeFields: any[] = [];
  let suppressBlurHide = false;

  function hideList() {
    list.hidden = true;
    list.innerHTML = '';
    activeIndex = 0;
    activeFields = [];
  }

  function positionMenu() {
    if (list.hidden) return;
    positionPathHelperMenu(textarea, list);
  }

  /**
   * @param {Array<{ key: string; path: string; type: string }>} fields
   */
  function renderFieldList(fields: any) {
    list.innerHTML = '';
    if (!fields.length) {
      hideList();
      return;
    }

    activeFields = fields;
    activeIndex = 0;
    list.hidden = false;

    const header = document.createElement('div');
    header.className = 'field-mapping-path-helper__header';
    header.textContent = 'Fields';
    list.appendChild(header);

    for (const [index, field] of fields.slice(0, 20).entries()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'field-mapping-path-helper__item';
      if (index === activeIndex) {
        btn.classList.add('field-mapping-path-helper__item--active');
      }
      btn.dataset.path = field.path;

      const keyEl = document.createElement('span');
      keyEl.className = 'field-mapping-path-helper__key';
      keyEl.textContent = field.key;

      const typeEl = document.createElement('span');
      typeEl.className = 'field-mapping-path-helper__type';
      typeEl.textContent = field.type;

      btn.appendChild(keyEl);
      btn.appendChild(typeEl);

      btn.addEventListener('mousedown', (event: any) => {
        event.preventDefault();
        acceptField(field);
      });

      list.appendChild(btn);
    }

    requestAnimationFrame(positionMenu);
  }

  /**
   * @param {{ force?: boolean }} [options]
   */
  function updateAutocomplete(options: any = {}) {
    if (activePayload == null) {
      hideList();
      return;
    }

    const value = textarea.value;
    const cursor = textarea.selectionStart ?? value.length;
    let resolved = resolveAutocompleteLookup(activePayload, value, cursor);

    if (!resolved && options.force) {
      resolved = {
        token: { start: cursor, end: cursor, prefix: '' },
        lookupPrefix: '',
      };
    }

    if (!resolved) {
      hideList();
      return;
    }

    const { token, lookupPrefix } = resolved;
    const fields = getSourceFieldsAtPath(activePayload, lookupPrefix);
    const context = parsePathTokenContext(token.prefix);
    const useSegmentFilter = lookupPrefix === token.prefix;
    const prefix = useSegmentFilter ? (context?.segmentPrefix?.toLowerCase() ?? '') : '';
    const matches = prefix
      ? fields.filter((field: any) => field.key.toLowerCase().startsWith(prefix))
      : fields;

    renderFieldList(matches);
  }

  /**
   * @param {{ key: string; path: string; type: string }} field
   */
  function acceptField(field: any) {
    suppressBlurHide = true;
    insertPathSegmentAtCursor(textarea, field);
    hideList();
    suppressBlurHide = false;
  }

  list.addEventListener('mousedown', (event: any) => {
    event.preventDefault();
  });

  textarea.addEventListener('input', updateAutocomplete);
  textarea.addEventListener('click', positionMenu);
  textarea.addEventListener('keyup', positionMenu);
  textarea.addEventListener('scroll', positionMenu);
  window.addEventListener('resize', positionMenu);

  textarea.addEventListener('keydown', (event: any) => {
    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault();
      updateAutocomplete({ force: true });
      return;
    }

    if (event.key === '.' && activePayload != null) {
      setTimeout(updateAutocomplete, 0);
    }

    if (!list.hidden && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hideList();
      return;
    }

    if (list.hidden) return;
    const items = [...list.querySelectorAll('.field-mapping-path-helper__item')];
    if (!items.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((item: any,index: any) => {
        item.classList.toggle('field-mapping-path-helper__item--active', index === activeIndex);
      });
      items[activeIndex]?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((item: any,index: any) => {
        item.classList.toggle('field-mapping-path-helper__item--active', index === activeIndex);
      });
      items[activeIndex]?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      const field = activeFields[activeIndex];
      if (field) {
        event.preventDefault();
        acceptField(field);
      }
      return;
    }

  });

  textarea.addEventListener('blur', () => {
    if (suppressBlurHide) return;
    setTimeout(hideList, 150);
  });

  return {
    setPayload(payload: any) {
      activePayload = payload ?? null;
    },
    insertPath(path: any) {
      insertTextAtCursor(textarea, path);
    },
    hide: hideList,
    destroy() {
      hideList();
      list.remove();
      window.removeEventListener('resize', positionMenu);
    },
  };
}
