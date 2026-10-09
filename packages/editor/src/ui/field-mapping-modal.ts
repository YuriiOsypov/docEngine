import { wireModalResize } from './wire-modal-resize.js';
import { wireModalMove } from './wire-modal-move.js';
import { wireModalEscape } from './wire-modal-escape.js';
import { wirePanelSplitter } from './wire-panel-splitter.js';

import { applyMappingBadges, findRuleForMappedToken } from './field-mapping-badges.js';

import { serializeSourcePathDrag, SOURCE_PATH_DRAG_MIME } from './mapping-drag-drop.js';

import { revealMappingResultEntry, wireMappingResultPathHelper, wireMappingResultIssueHighlights } from './mapping-result-helper.js';

import {
  buildSourcePayloadTree,
  normalizeFieldMappingSpec,
  previewFieldMapping,
  buildMappingResultFromRules,
  parseMappingResultToRules,
  upsertMappingRule,
  getPayloadByPath,
} from '@docengine/engine';

import { buildTemplateExport } from '../core/document-io.js';



function escapeHtml(text: any) {

  return String(text ?? '')

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;');

}



/**

 * @param {Array<{ key: string; path: string; type: string; children?: unknown[] }>} nodes

 */

/** 1 = all object/array nodes start collapsed (Expand all / toggles open them). */
const SOURCE_TREE_DEFAULT_VISIBLE_LEVELS = 1;

/**
 * Collapse via CSS class — not the HTML `hidden` attribute.
 * Lightning LWS/Locker strips `hidden` from innerHTML, which broke Expand all in Salesforce.
 */
const SOURCE_TREE_CHILDREN_COLLAPSED_CLASS = 'field-mapping-schema__children--collapsed';

/** Lazy relationship stub from Apex (`{ __lazy: true, _: "Expand…" }`). */
function isLazyStub(value: any): boolean {
  if (Array.isArray(value) && value.length === 1) {
    return isLazyStub(value[0]);
  }
  return !!(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.__lazy === true
  );
}

/**
 * Assign into a payload object at `$payload.Owner` / `Lines__r.Field` paths.
 * Column-style array paths (no [0]) write into the first row.
 */
function setPayloadByPath(root: any, fullPath: string, value: any) {
  if (!root || typeof root !== 'object') return;
  let rel = String(fullPath ?? '').trim();
  if (rel.startsWith('$payload.')) {
    rel = rel.slice('$payload.'.length);
  } else if (rel === '$payload') {
    return;
  }
  if (!rel) return;

  const segs = rel.split('.');
  let cur: any = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const m = seg.match(/^([^\[]+)\[(\d+)\]$/);
    if (m) {
      const key = m[1];
      const idx = Number(m[2]);
      if (!Array.isArray(cur[key])) cur[key] = [];
      if (cur[key][idx] == null || typeof cur[key][idx] !== 'object') {
        cur[key][idx] = {};
      }
      cur = cur[key][idx];
      continue;
    }
    if (Array.isArray(cur)) {
      if (cur[0] == null || typeof cur[0] !== 'object') cur[0] = {};
      cur = cur[0];
    }
    if (Array.isArray(cur[seg])) {
      if (cur[seg][0] == null || typeof cur[seg][0] !== 'object') {
        cur[seg][0] = {};
      }
      cur = cur[seg][0];
      continue;
    }
    if (cur[seg] == null || typeof cur[seg] !== 'object') {
      cur[seg] = {};
    }
    cur = cur[seg];
  }

  if (Array.isArray(cur)) {
    if (cur[0] == null || typeof cur[0] !== 'object') cur[0] = {};
    cur = cur[0];
  }

  const last = segs[segs.length - 1];
  const lm = last.match(/^([^\[]+)\[(\d+)\]$/);
  if (lm) {
    if (!Array.isArray(cur[lm[1]])) cur[lm[1]] = [];
    cur[lm[1]][Number(lm[2])] = value;
  } else {
    cur[last] = value;
  }
}

/**
 * Read sample value; column-style paths into arrays resolve via first row.
 */
function readSampleAtPath(sample: any, path: string) {
  let rel = String(path ?? '').trim();
  if (rel.startsWith('$payload.')) {
    rel = rel.slice('$payload.'.length);
  } else if (rel === '$payload') {
    return sample;
  }
  if (!rel) return sample;

  const segs = rel.split('.');
  let current: any = sample;
  for (const seg of segs) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      current = current[0];
      if (current == null) return undefined;
    }
    const m = seg.match(/^([^\[]+)\[(\d+)\]$/);
    if (m) {
      const arr = current[m[1]];
      current = Array.isArray(arr) ? arr[Number(m[2])] : undefined;
      continue;
    }
    current = current[seg];
  }
  return current;
}

function mapTreeNodesForDisplay(nodes: any[], sample: any): any[] {
  const mapped = (nodes ?? []).map((node) => {
    const value = readSampleAtPath(sample, node.path);
    const rawHasLazy =
      Array.isArray(node.children) &&
      node.children.some((c: any) => c.key === '__lazy');
    const lazy = isLazyStub(value) || rawHasLazy;

    if (lazy) {
      const kind =
        (Array.isArray(value) ? value[0]?.__kind : value?.__kind) === 'child' ||
        node.type === 'array'
          ? 'child[]'
          : 'related';
      return {
        key: node.key,
        path: node.path,
        type: kind,
        lazy: true,
        children: [
          {
            key: '…',
            path: `${node.path}.__pending`,
            type: 'load',
          },
        ],
      };
    }

    const children = Array.isArray(node.children)
      ? mapTreeNodesForDisplay(
          node.children.filter(
            (c: any) => c.key !== '__lazy' && c.key !== '__kind' && c.key !== '_',
          ),
          sample,
        )
      : undefined;

    return {
      ...node,
      children: children?.length ? children : undefined,
    };
  });

  // Scalars first, then nested objects, then lazy related stubs
  const rank = (n: any) => {
    if (n.lazy) return 2;
    if (n.children?.length) return 1;
    return 0;
  };
  return mapped.sort((a, b) => rank(a) - rank(b) || String(a.key).localeCompare(String(b.key)));
}

/**
 * @param {Array<{ key: string; path: string; type: string; children?: unknown[]; lazy?: boolean }>} nodes
 * @param {{ expandAll?: boolean; expandedPaths?: Set<string>; collapsedPaths?: Set<string>; defaultVisibleLevels?: number; expandingPaths?: Set<string> }} [options]
 * @param {number} [depth]
 */
function renderSourceSchemaTree(nodes: any, options: any = {}, depth: any = 0) {
  const {
    expandAll = false,
    expandedPaths = new Set(),
    collapsedPaths = new Set(),
    defaultVisibleLevels = SOURCE_TREE_DEFAULT_VISIBLE_LEVELS,
    expandingPaths = new Set(),
  } = options;

  return (nodes ?? [])
    .map((node) => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const isExpanding = expandingPaths.has(node.path);
      const isExpanded =
        hasChildren &&
        (expandAll ||
          expandedPaths.has(node.path) ||
          (depth < defaultVisibleLevels - 1 && !collapsedPaths.has(node.path)));
      const toggle = hasChildren ? (isExpanded ? '▼' : '▶') : '';
      const typeLabel = isExpanding ? 'loading…' : node.type;

      const childrenHtml = hasChildren
        ? `<div class="field-mapping-schema__children${isExpanded ? '' : ` ${SOURCE_TREE_CHILDREN_COLLAPSED_CLASS}`}">${renderSourceSchemaTree(node.children, options, depth + 1)}</div>`
        : '';

      return `
        <div class="field-mapping-schema__node${node.lazy ? ' field-mapping-schema__node--lazy' : ''}" data-path="${escapeHtml(node.path)}" data-lazy="${node.lazy ? 'true' : 'false'}">
          <div class="field-mapping-schema__row">
            <button
              type="button"
              class="field-mapping-schema__toggle${hasChildren ? '' : ' field-mapping-schema__toggle--leaf'}"
              data-action="toggle"
              aria-expanded="${isExpanded}"
              aria-label="${hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : ''}"
              ${isExpanding ? 'disabled' : ''}
            >${toggle}</button>
            <button
              type="button"
              class="field-mapping-schema__drag"
              draggable="true"
              data-path="${escapeHtml(node.path)}"
              title="Drag to map or click to insert into mapping result"
            >
              <span class="field-mapping-schema__key">${escapeHtml(node.key)}</span>
              <span class="field-mapping-schema__type">${escapeHtml(typeLabel)}</span>
            </button>
          </div>
          ${childrenHtml}
        </div>
      `;
    })
    .join('');
}

/**
 * @param {Array<{ path: string; children?: unknown[] }>} nodes
 * @returns {Set<string>}
 */
function collectSourceTreePaths(nodes: any) {
  /** @type {Set<string>} */
  const paths = new Set();
  for (const node of nodes ?? []) {
    paths.add(node.path);
    if (Array.isArray(node.children)) {
      for (const childPath of collectSourceTreePaths(node.children)) {
        paths.add(childPath);
      }
    }
  }
  return paths;
}



export function createFieldMappingModal({ getTemplate, onSave }: any = {}) {

  const overlay = document.createElement('div');

  overlay.className = 'modal-overlay modal-overlay--field-mapping';

  overlay.hidden = true;



  overlay.innerHTML = `

    <div class="modal modal--field-mapping modal--wide" role="dialog" aria-modal="true">

      <div class="modal__header">

        <span>Field mapping</span>

        <button

          type="button"

          class="btn btn-sm field-mapping-modal__fullscreen"

          data-action="toggle-fullscreen"

          title="Full screen"

          aria-label="Full screen"

          aria-pressed="false"

        >

          ⛶

        </button>

      </div>

      <div class="modal__body field-mapping-modal__body">

        <section class="field-mapping-panel field-mapping-panel--source">

          <div class="field-mapping-panel__header">

            <span>Source payload</span>

            <label class="btn btn-sm">

              Upload

              <input type="file" accept="application/json" data-role="source-file" hidden />

            </label>

          </div>

          <details class="field-mapping-source-json">

            <summary>Edit sample JSON</summary>

            <textarea class="field-mapping-panel__textarea field-mapping-panel__textarea--compact" data-role="source-json" spellcheck="false" placeholder="Paste sample JSON payload"></textarea>

          </details>

          <div class="field-mapping-source-toolbar">
            <input type="search" class="modal__search" data-role="source-search" placeholder="Search source fields..." />
            <label class="field-mapping-source-expand">
              <input type="checkbox" data-role="source-expand-all" />
              Expand all
            </label>
          </div>

          <div class="field-mapping-schema" data-role="source-tree"></div>

        </section>

        <div class="field-mapping-splitter" data-splitter="0" role="separator" aria-orientation="vertical" aria-label="Resize source panel"></div>

        <section class="field-mapping-panel field-mapping-panel--editor">

          <div class="field-mapping-panel__header">

            <span>Template fields</span>

          </div>

          <p class="schema-form__hint">Drag source fields onto template fields below.</p>

          <div class="field-mapping-editor-mount" data-role="editor-mount"></div>

        </section>

        <div class="field-mapping-splitter" data-splitter="1" role="separator" aria-orientation="vertical" aria-label="Resize result panel"></div>

        <section class="field-mapping-panel field-mapping-panel--result">

          <div class="field-mapping-panel__header">

            <span>Mapping result</span>

          </div>

          <div class="field-mapping-result-editor" data-role="result-editor">
            <textarea class="field-mapping-panel__textarea field-mapping-panel__textarea--result" data-role="result-json" spellcheck="false" placeholder="Mapping JSON (editable). Type $ for source paths or click a source field."></textarea>
          </div>

          <details class="field-mapping-resolved">

            <summary>Resolved preview values</summary>

            <pre class="field-mapping-panel__preview field-mapping-panel__preview--resolved" data-role="resolved-preview"></pre>

          </details>

          <p class="modal__status" data-role="validation-status" hidden></p>

        </section>

      </div>

      <div class="modal__footer">

        <button type="button" class="btn btn-primary" data-action="apply">Apply to editor</button>

        <button type="button" class="btn btn-primary" data-action="ok">Save mapping</button>

        <button type="button" class="btn" data-action="cancel">Cancel</button>

      </div>

    </div>

  `;



  document.body.appendChild(overlay);



  const modalEl = overlay.querySelector('.modal--field-mapping');

  const sourceJsonEl = overlay.querySelector('[data-role="source-json"]');

  const sourceTreeEl = overlay.querySelector('[data-role="source-tree"]');

  const sourceSearchEl = overlay.querySelector('[data-role="source-search"]');

  const sourceExpandAllEl = overlay.querySelector('[data-role="source-expand-all"]');

  const sourceFileEl = overlay.querySelector('[data-role="source-file"]');

  const editorMountEl = overlay.querySelector('[data-role="editor-mount"]');

  const resultEditorEl = overlay.querySelector('[data-role="result-editor"]');
  const resultJsonEl = overlay.querySelector('[data-role="result-json"]');

  const resolvedPreviewEl = overlay.querySelector('[data-role="resolved-preview"]');

  const validationStatusEl = overlay.querySelector('[data-role="validation-status"]');

  const fullscreenBtn = overlay.querySelector('[data-action="toggle-fullscreen"]');



  /** @type {import('../types.d.ts').FieldMappingRule[]} */

  let currentRules: any[] = [];

  /** @type {import('../types.d.ts').FieldMappingSpec} */

  let currentSpec = normalizeFieldMappingSpec(null);

  /** @type {import('../types.d.ts').DocEditorInstance | null} */

  let nestedEditor: any = null;

  let resolvePromise: any = null;

  let rejectPromise: any = null;

  /** In-flight open() session — reuses instead of cancelling on double-click. */
  let sessionPromise: Promise<any> | null = null;

  /** Ignore backdrop clicks from the same gesture that opened the modal. */
  let backdropCloseArmed = false;

  /** @type {((payload: unknown) => Promise<void>) | null} */

  let applyHandler: any = null;

  /** @type {((path: string) => Promise<unknown>) | null} */
  let onExpandSourcePath: any = null;

  let isFullscreen = false;

  /** @type {ReturnType<typeof setTimeout> | null} */

  let resultEditTimer: any = null;

  let sourceExpandAll = false;

  /** @type {Set<string>} */
  let sourceExpandedPaths = new Set();

  /** @type {Set<string>} */
  let sourceCollapsedPaths = new Set();

  /** @type {Set<string>} */
  let sourceExpandingPaths = new Set();

  const pathHelper = wireMappingResultPathHelper(resultJsonEl, resultEditorEl);
  const issueHighlights = wireMappingResultIssueHighlights(resultJsonEl, resultEditorEl);

  function updatePathHelperPaths() {
    try {
      const sample = parseSourceSample();
      pathHelper?.setPayload(sample ?? null);
    } catch {
      pathHelper?.setPayload(null);
    }
  }

  function insertSourcePath(path: any) {
    if (!path) return;
    if (document.activeElement === resultJsonEl) {
      pathHelper?.insertPath(path);
      return;
    }
    resultJsonEl.focus();
    pathHelper?.insertPath(path);
  }



  function parseSourceSample() {

    const raw = sourceJsonEl.value.trim();

    if (!raw) return null;

    return JSON.parse(raw);

  }



  function getTemplateContext() {

    const template = getTemplate?.() ?? { blocks: [], fieldSchemas: {} };

    return {

      blocks: template.blocks ?? [],

      fieldSchemas: template.fieldSchemas ?? {},

    };

  }



  function renderSourceTree() {

    try {

      const sample = parseSourceSample();

      if (!sample) {

        sourceTreeEl.innerHTML = '<p class="modal__status modal__status--empty">Paste or upload sample payload.</p>';

        return;

      }

      const tree = mapTreeNodesForDisplay(buildSourcePayloadTree(sample), sample);

      const validPaths = collectSourceTreePaths(tree);
      sourceExpandedPaths = new Set(
        [...sourceExpandedPaths].filter((path) => validPaths.has(path)),
      );
      sourceCollapsedPaths = new Set(
        [...sourceCollapsedPaths].filter((path) => validPaths.has(path)),
      );

      sourceTreeEl.innerHTML = renderSourceSchemaTree(tree, {
        expandAll: sourceExpandAll,
        expandedPaths: sourceExpandedPaths,
        collapsedPaths: sourceCollapsedPaths,
        expandingPaths: sourceExpandingPaths,
      });

      wireSourceTreeInteractions();
      filterSourceTree(sourceSearchEl.value);
      updatePathHelperPaths();

    } catch (err: any) {

      sourceTreeEl.innerHTML = `<p class="modal__status modal__status--error">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;

    }

  }



  function syncSourceJsonFromSample(sample: any) {
    sourceJsonEl.value = JSON.stringify(sample ?? {}, null, 2);
  }

  async function expandLazySourcePath(path: string) {
    if (!onExpandSourcePath || sourceExpandingPaths.has(path)) {
      return;
    }
    const sample = parseSourceSample();
    if (!sample) return;
    const current = readSampleAtPath(sample, path);
    if (!isLazyStub(current)) {
      return;
    }

    sourceExpandingPaths.add(path);
    renderSourceTree();
    try {
      const branch = await onExpandSourcePath(path);
      if (branch == null) {
        throw new Error('No fields returned for ' + path);
      }
      const next = parseSourceSample() ?? sample;
      setPayloadByPath(next, path, branch);
      syncSourceJsonFromSample(next);
      sourceCollapsedPaths.delete(path);
      sourceExpandedPaths.add(path);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      sourceTreeEl.insertAdjacentHTML(
        'afterbegin',
        `<p class="modal__status modal__status--error">${escapeHtml(message)}</p>`,
      );
    } finally {
      sourceExpandingPaths.delete(path);
      renderSourceTree();
      refreshResolvedPreview();
    }
  }

  function wireSourceTreeInteractions() {
    sourceTreeEl.querySelectorAll('.field-mapping-schema__drag').forEach((el) => {
      el.addEventListener('dragstart', (event) => {
        const path = el.dataset.path ?? '';
        event.dataTransfer?.setData(SOURCE_PATH_DRAG_MIME, serializeSourcePathDrag(path));
        event.dataTransfer.effectAllowed = 'copy';
        el.classList.add('field-mapping-schema__drag--active');
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('field-mapping-schema__drag--active');
      });

      el.addEventListener('click', (event) => {
        if (event.defaultPrevented) return;
        const path = el.dataset.path ?? '';
        if (!path || path.endsWith('.__pending')) return;
        insertSourcePath(path);
      });
    });

    sourceTreeEl.querySelectorAll('[data-action="toggle"]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        const nodeEl = el.closest('.field-mapping-schema__node');
        const path = nodeEl?.dataset.path ?? '';
        if (!path || sourceExpandAll) return;

        const wasExpanded = el.getAttribute('aria-expanded') === 'true';
        const isLazy = nodeEl?.getAttribute('data-lazy') === 'true';

        if (wasExpanded) {
          sourceCollapsedPaths.add(path);
          sourceExpandedPaths.delete(path);
          renderSourceTree();
          return;
        }

        sourceCollapsedPaths.delete(path);
        sourceExpandedPaths.add(path);

        if (isLazy && onExpandSourcePath) {
          void expandLazySourcePath(path);
          return;
        }

        renderSourceTree();
      });
    });
  }

  function filterSourceTree(query: any) {
    const q = query.trim().toLowerCase();

    sourceTreeEl.querySelectorAll('.field-mapping-schema__node').forEach((node) => {
      const text = node.textContent?.toLowerCase() ?? '';
      node.hidden = !!(q && !text.includes(q));
    });

    if (!q) {
      // Restore collapse state after search cleared (search may have forced parents open)
      sourceTreeEl.querySelectorAll('.field-mapping-schema__children').forEach((children) => {
        const toggle = children.parentElement?.querySelector('[data-action="toggle"]');
        const expanded = toggle?.getAttribute('aria-expanded') === 'true';
        children.classList.toggle(SOURCE_TREE_CHILDREN_COLLAPSED_CLASS, !expanded);
      });
      return;
    }

    sourceTreeEl.querySelectorAll('.field-mapping-schema__node:not([hidden])').forEach((node) => {
      let parent = node.parentElement?.closest('.field-mapping-schema__children');
      while (parent) {
        parent.classList.remove(SOURCE_TREE_CHILDREN_COLLAPSED_CLASS);
        parent = parent.parentElement?.closest('.field-mapping-schema__children');
      }
    });
  }



  function syncRulesFromResultJson() {

    const raw = resultJsonEl.value.trim();

    if (!raw) {

      currentRules = [];

      return;

    }



    const parsed = JSON.parse(raw);

    const { blocks, fieldSchemas } = getTemplateContext();

    currentRules = parseMappingResultToRules(parsed, blocks, fieldSchemas);

  }



  function buildSpec() {

    if (document.activeElement === resultJsonEl || resultJsonEl.dataset.dirty === 'true') {

      syncRulesFromResultJson();

    }



    let sourceSample = currentSpec.sourceSample;

    try {

      sourceSample = parseSourceSample() ?? sourceSample;

    } catch {

      throw new Error('Source payload sample is not valid JSON.');

    }

    return normalizeFieldMappingSpec({

      ...currentSpec,

      rules: currentRules,

      sourceSample,

      expression: '',

    });

  }



  function updateResultJsonTextarea() {
    if (document.activeElement === resultJsonEl) return;
    const mappingResult = buildMappingResultFromRules(currentRules, getTemplateContext());
    resultJsonEl.value = JSON.stringify(mappingResult, null, 2);
    resultJsonEl.dataset.dirty = 'false';
    issueHighlights?.sync?.();
  }



  function refreshResolvedPreview() {
    validationStatusEl.hidden = true;
    issueHighlights?.sync?.();

    try {
      const payload = parseSourceSample();
      if (!payload || !currentRules.length) {
        resolvedPreviewEl.textContent = payload ? 'Add mapping rules to preview resolved values.' : '';
        issueHighlights?.update?.([]);
        return;
      }
      const spec = buildSpec();
      const template = getTemplate?.() ?? { blocks: [], fieldSchemas: {} };
      const preview = previewFieldMapping(payload, spec, template);
      resolvedPreviewEl.textContent = JSON.stringify(preview.fieldsExport, null, 2);

      const issues = [
        ...preview.validation.errors.map((item) => ({ ...item, severity: 'error' })),
        ...preview.validation.warnings.map((item) => ({ ...item, severity: 'warning' })),
      ];
      const highlighted = issueHighlights?.update?.(issues) ?? 0;

      const unlocated = issues.filter((item) => {
        // Keep banner only for issues we could not mark in the JSON editor.
        const text = resultJsonEl.value;
        if (item.sourcePath) {
          return !text.includes(JSON.stringify(String(item.sourcePath)));
        }
        const key = JSON.stringify(String(item.field ?? ''));
        return !text.includes(`${key}:`);
      });

      if (unlocated.length) {
        validationStatusEl.hidden = false;
        validationStatusEl.className = unlocated.some((item) => item.severity === 'error')
          ? 'modal__status modal__status--error'
          : 'modal__status';
        validationStatusEl.textContent = unlocated
          .map((item) =>
            item.severity === 'error' ? `Error: ${item.message}` : `Warning: ${item.message}`,
          )
          .join('\n');
      } else if (!highlighted && issues.length) {
        // Fallback if highlight layer is unavailable.
        validationStatusEl.hidden = false;
        validationStatusEl.className = preview.validation.valid
          ? 'modal__status'
          : 'modal__status modal__status--error';
        validationStatusEl.textContent = issues
          .map((item) =>
            item.severity === 'error' ? `Error: ${item.message}` : `Warning: ${item.message}`,
          )
          .join('\n');
      }
    } catch (err: any) {
      issueHighlights?.update?.([]);
      validationStatusEl.hidden = false;
      validationStatusEl.className = 'modal__status modal__status--error';
      validationStatusEl.textContent = err instanceof Error ? err.message : String(err);
      resolvedPreviewEl.textContent = '';
    }
  }



  function refreshResultPanels() {

    updateResultJsonTextarea();

    refreshResolvedPreview();

  }



  function syncMappingBadges() {

    if (!nestedEditor?.holder) return;

    applyMappingBadges(nestedEditor.holder, currentRules, {

      getRegistry: () => nestedEditor.registry,

      fillModeFieldHighlight: false,

      mappingMode: true,

    });

  }



  function handleRuleAssigned(rule: any) {
    currentRules = upsertMappingRule(currentRules, rule);
    syncMappingBadges();
    refreshResultPanels();
  }



  function setFullscreen(next: any) {

    isFullscreen = next;

    overlay.classList.toggle('modal-overlay--field-mapping-fullscreen', isFullscreen);

    modalEl?.classList.toggle('modal--field-mapping--fullscreen', isFullscreen);

    fullscreenBtn?.setAttribute('aria-pressed', String(isFullscreen));

    if (fullscreenBtn) {

      fullscreenBtn.title = isFullscreen ? 'Exit full screen' : 'Full screen';

    }

  }



  /** Bumped on every close so in-flight mounts are abandoned. */
  let mountGeneration = 0;

  function destroyNestedEditor() {
    const prev = nestedEditor;
    nestedEditor = null;
    if (prev && typeof prev.destroy === 'function') {
      try {
        prev.destroy();
      } catch {
        // EditorJS.destroy() can only run once
      }
    }
    if (editorMountEl) editorMountEl.innerHTML = '';
  }

  function armBackdropClose() {
    backdropCloseArmed = false;
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!overlay.hidden) backdropCloseArmed = true;
      }, 50);
    });
  }

  function wireNestedEditorClicks() {
    if (!nestedEditor?.holder) return;
    nestedEditor.holder.addEventListener('click', (event: any) => {
      const token = event.target?.closest?.('.field-token--mapped');
      if (!token || !nestedEditor?.holder?.contains(token)) return;
      const rule = findRuleForMappedToken(token, currentRules);
      if (!rule) return;
      event.preventDefault();
      event.stopPropagation();
      if (resultJsonEl.dataset.dirty !== 'true') {
        updateResultJsonTextarea();
      }
      revealMappingResultEntry(resultJsonEl, rule);
    });
  }

  /**
   * Mount nested template editor. Does not own the session promise — Cancel must
   * work even while this is still loading (see open()).
   */
  function startNestedEditor(gen: number) {
    const templateDoc = getTemplate?.();
    if (!templateDoc || !editorMountEl) return;

    const stripped = buildTemplateExport(templateDoc);
    const holder = document.createElement('div');
    holder.className = 'field-mapping-editor-holder doc-editor-host';
    editorMountEl.appendChild(holder);

    import('../create-editor.js')
      .then(({ createEditor }) => {
        if (gen !== mountGeneration || overlay.hidden) {
          holder.remove();
          return;
        }
        const ed = createEditor({
          holder,
          data: {
            time: stripped.time,
            fieldSchemas: stripped.fieldSchemas,
            blocks: stripped.blocks,
            pageSetup: stripped.pageSetup,
          },
          mappingMode: true,
          onMappingRuleChange: handleRuleAssigned,
          getMappingRules: () => currentRules,
          designMode: false,
          ui: {
            embedded: true,
            palette: false,
            richTextToolbar: false,
            documentActions: false,
            showFieldsInFillMode: false,
            stickyChrome: false,
          },
          catalogs: {},
        });
        nestedEditor = ed;
        return ed.ready.then(() => {
          if (gen !== mountGeneration || nestedEditor !== ed || overlay.hidden) {
            if (nestedEditor === ed) destroyNestedEditor();
            return;
          }
          syncMappingBadges();
          wireNestedEditorClicks();
        });
      })
      .catch((err) => {
        if (gen !== mountGeneration) return;
        validationStatusEl.hidden = false;
        validationStatusEl.className = 'modal__status modal__status--error';
        validationStatusEl.textContent =
          err instanceof Error ? err.message : 'Could not open mapping editor.';
      });
  }

  async function close() {
    mountGeneration += 1;
    backdropCloseArmed = false;
    overlay.hidden = true;
    setFullscreen(false);
    pathHelper?.hide();
    issueHighlights?.update?.([]);
    destroyNestedEditor();
    applyHandler = null;
    onExpandSourcePath = null;
  }

  function rejectCancelled() {
    const err = new Error('cancelled');
    err.name = 'AbortError';
    const reject = rejectPromise;
    rejectPromise = null;
    resolvePromise = null;
    reject?.(err);
  }

  function resolveSession(value: any) {
    const resolve = resolvePromise;
    rejectPromise = null;
    resolvePromise = null;
    resolve?.(value);
  }

  async function open(options: any = {}) {
    // Reuse in-flight session (double-click Edit while open).
    if (sessionPromise && !overlay.hidden) {
      return sessionPromise;
    }

    // Abandon any stuck prior session so Edit can open again.
    if (sessionPromise) {
      rejectCancelled();
      await close();
      sessionPromise = null;
    }

    currentSpec = normalizeFieldMappingSpec(options.spec);
    currentRules = [...(currentSpec.rules ?? [])];
    applyHandler = options.onApply ?? null;
    onExpandSourcePath =
      typeof options.onExpandSourcePath === 'function' ? options.onExpandSourcePath : null;
    sourceExpandingPaths.clear();
    sourceJsonEl.value = currentSpec.sourceSample
      ? JSON.stringify(currentSpec.sourceSample, null, 2)
      : '';
    renderSourceTree();
    refreshResultPanels();

    const gen = ++mountGeneration;
    destroyNestedEditor();
    overlay.hidden = false;
    armBackdropClose();

    // Session promise is created FIRST so Cancel works during nested mount.
    const run = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    sessionPromise = run;

    startNestedEditor(gen);

    try {
      return await run;
    } finally {
      if (sessionPromise === run) sessionPromise = null;
      resolvePromise = null;
      rejectPromise = null;
    }
  }



  sourceJsonEl.addEventListener('input', () => {
    renderSourceTree();
    refreshResolvedPreview();
    updatePathHelperPaths();
  });



  sourceSearchEl.addEventListener('input', () => filterSourceTree(sourceSearchEl.value));

  sourceExpandAllEl.addEventListener('change', () => {
    sourceExpandAll = sourceExpandAllEl.checked;
    if (!sourceExpandAll) {
      sourceExpandedPaths.clear();
      sourceCollapsedPaths.clear();
    }
    renderSourceTree();
  });



  sourceFileEl.addEventListener('change', async () => {

    const file = sourceFileEl.files?.[0];

    sourceFileEl.value = '';

    if (!file) return;

    sourceJsonEl.value = await file.text();

    renderSourceTree();

    refreshResolvedPreview();

  });



  resultJsonEl.addEventListener('input', () => {

    resultJsonEl.dataset.dirty = 'true';

    if (resultEditTimer) clearTimeout(resultEditTimer);

    resultEditTimer = setTimeout(() => {

      try {

        syncRulesFromResultJson();

        syncMappingBadges();

        refreshResolvedPreview();

      } catch (err: any) {

        issueHighlights?.update?.([]);

        validationStatusEl.hidden = false;

        validationStatusEl.className = 'modal__status modal__status--error';

        validationStatusEl.textContent = err instanceof Error ? err.message : String(err);

      }

    }, 350);

  });



  resultJsonEl.addEventListener('blur', () => {

    try {

      syncRulesFromResultJson();

      syncMappingBadges();

      resultJsonEl.dataset.dirty = 'false';

      updateResultJsonTextarea();

      refreshResolvedPreview();

    } catch (err: any) {

      validationStatusEl.hidden = false;

      validationStatusEl.className = 'modal__status modal__status--error';

      validationStatusEl.textContent = err instanceof Error ? err.message : String(err);

    }

  });



  fullscreenBtn?.addEventListener('click', (event) => {

    event.stopPropagation();

    setFullscreen(!isFullscreen);

  });



  overlay.querySelector('[data-action="ok"]')?.addEventListener('click', async () => {
    try {
      const spec = buildSpec();
      onSave?.(spec);
      resolveSession(spec);
      await close();
    } catch (err: any) {
      validationStatusEl.hidden = false;
      validationStatusEl.className = 'modal__status modal__status--error';
      validationStatusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  overlay.querySelector('[data-action="apply"]')?.addEventListener('click', async () => {
    try {
      const spec = buildSpec();
      const payload = parseSourceSample();
      if (payload == null) {
        throw new Error('Add a source payload sample before applying.');
      }
      if (!spec.rules?.length) {
        throw new Error('Map at least one field before applying.');
      }
      onSave?.(spec);
      // Pass the fresh modal spec so Apply does not race against stale documentFieldMapping.
      await applyHandler?.(payload, spec);
      resolveSession(spec);
      await close();
    } catch (err: any) {
      validationStatusEl.hidden = false;
      validationStatusEl.className = 'modal__status modal__status--error';
      validationStatusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', async () => {
    rejectCancelled();
    await close();
  });

  overlay.addEventListener('click', async (event) => {
    if (event.target !== overlay || !backdropCloseArmed) return;
    rejectCancelled();
    await close();
  });

  wireModalEscape(overlay, () => {
    rejectCancelled();
    void close();
  });

  wirePanelSplitter(overlay.querySelector('.field-mapping-modal__body'), {
    cookieKey: 'field-mapping-panels',
    defaultSizes: [25, 50, 25],
  });

  if (modalEl) {
    wireModalResize(modalEl, {
      cookieKey: 'field-mapping',
      minWidth: 800,
      minHeight: 480,
      maxWidth: () => (typeof window !== 'undefined' ? window.innerWidth * 0.98 : 1400),
      maxHeight: () => (typeof window !== 'undefined' ? window.innerHeight * 0.95 : 900),
    });
    wireModalMove(modalEl, { cookieKey: 'field-mapping' });
  }

  return { open };

};

