import { buildSourcePayloadTree } from '@docengine/engine';
import {
  serializeSourcePathDrag,
  SOURCE_PATH_DRAG_MIME,
  SOURCE_PATH_META_MIME,
} from './mapping-drag-drop.js';
import { humanizeFieldKey } from './source-path-canvas-drop.js';

const SOURCE_TREE_CHILDREN_COLLAPSED_CLASS = 'field-mapping-schema__children--collapsed';
const SOURCE_TREE_DEFAULT_VISIBLE_LEVELS = 2;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isLazyStub(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.length === 1 && !!value[0]?.__lazy;
  }
  return value.__lazy === true;
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

/**
 * Same display shaping as Field Mapping Source payload tree.
 */
export function mapTreeNodesForDisplay(nodes: any[], sample: any): any[] {
  const mapped = (nodes ?? []).map((node) => {
    const value = readSampleAtPath(sample, node.path);
    const rawHasLazy =
      Array.isArray(node.children) && node.children.some((c: any) => c.key === '__lazy');
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

  const rank = (n: any) => {
    if (n.lazy) return 2;
    if (n.children?.length) return 1;
    return 0;
  };
  return mapped.sort((a, b) => rank(a) - rank(b) || String(a.key).localeCompare(String(b.key)));
}

/**
 * @param {Array<{ key: string; path: string; type: string; children?: any[]; lazy?: boolean }>} nodes
 */
export function renderSourceSchemaTree(nodes: any, options: any = {}, depth = 0): string {
  const {
    expandAll = false,
    expandedPaths = new Set(),
    collapsedPaths = new Set(),
    defaultVisibleLevels = SOURCE_TREE_DEFAULT_VISIBLE_LEVELS,
    expandingPaths = new Set(),
    dragTitle = 'Drag onto a field or table column to map',
  } = options;

  return (nodes ?? [])
    .map((node: any) => {
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
        <div class="field-mapping-schema__node${node.lazy ? ' field-mapping-schema__node--lazy' : ''}" data-path="${escapeHtml(node.path)}" data-type="${escapeHtml(node.type)}" data-lazy="${node.lazy ? 'true' : 'false'}">
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
              data-type="${escapeHtml(node.type)}"
              data-label="${escapeHtml(node.label || humanizeFieldKey(node.key))}"
              title="${escapeHtml(dragTitle)}"
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

export function collectSourceTreePaths(nodes: any): Set<string> {
  const paths = new Set<string>();
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

export function filterSourceSchemaTree(root: HTMLElement, query: string): void {
  const q = String(query ?? '')
    .trim()
    .toLowerCase();

  root.querySelectorAll('.field-mapping-schema__node').forEach((node) => {
    const text = node.textContent?.toLowerCase() ?? '';
    (node as HTMLElement).hidden = !!(q && !text.includes(q));
  });

  if (!q) {
    root.querySelectorAll('.field-mapping-schema__children').forEach((children) => {
      const toggle = children.parentElement?.querySelector('[data-action="toggle"]');
      const expanded = toggle?.getAttribute('aria-expanded') === 'true';
      children.classList.toggle(SOURCE_TREE_CHILDREN_COLLAPSED_CLASS, !expanded);
    });
    return;
  }

  root.querySelectorAll('.field-mapping-schema__node:not([hidden])').forEach((node) => {
    let parent = node.parentElement?.closest('.field-mapping-schema__children');
    while (parent) {
      parent.classList.remove(SOURCE_TREE_CHILDREN_COLLAPSED_CLASS);
      parent = parent.parentElement?.closest('.field-mapping-schema__children');
    }
  });
}

/**
 * Wire expand/collapse + drag for a rendered source schema tree.
 */
export function wireSourceSchemaTree(
  root: HTMLElement,
  options: {
    expandedPaths?: Set<string>;
    collapsedPaths?: Set<string>;
    onToggle?: () => void;
  } = {},
): void {
  const expandedPaths = options.expandedPaths ?? new Set<string>();
  const collapsedPaths = options.collapsedPaths ?? new Set<string>();

  root.querySelectorAll('.field-mapping-schema__toggle').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const node = (btn as HTMLElement).closest('.field-mapping-schema__node') as HTMLElement | null;
      const path = node?.dataset.path;
      if (!path || !node) return;
      const children = node.querySelector(':scope > .field-mapping-schema__children');
      if (!children) return;
      const willExpand = children.classList.contains(SOURCE_TREE_CHILDREN_COLLAPSED_CLASS);
      children.classList.toggle(SOURCE_TREE_CHILDREN_COLLAPSED_CLASS, !willExpand);
      (btn as HTMLElement).textContent = willExpand ? '▼' : '▶';
      (btn as HTMLElement).setAttribute('aria-expanded', willExpand ? 'true' : 'false');
      if (willExpand) {
        expandedPaths.add(path);
        collapsedPaths.delete(path);
      } else {
        collapsedPaths.add(path);
        expandedPaths.delete(path);
      }
      options.onToggle?.();
    });
  });

  root.querySelectorAll('.field-mapping-schema__drag').forEach((el) => {
    el.addEventListener('dragstart', (event: Event) => {
      const dragEvent = event as DragEvent;
      const path = (el as HTMLElement).dataset.path ?? '';
      const type = (el as HTMLElement).dataset.type ?? '';
      const label = (el as HTMLElement).dataset.label ?? '';
      if (!path || !dragEvent.dataTransfer) return;
      dragEvent.dataTransfer.setData(SOURCE_PATH_DRAG_MIME, serializeSourcePathDrag(path));
      dragEvent.dataTransfer.setData(
        SOURCE_PATH_META_MIME,
        JSON.stringify({ path, type, ...(label ? { label } : {}) }),
      );
      // Empty plain text so contenteditable cannot paste the path as raw text.
      dragEvent.dataTransfer.setData('text/plain', '');
      dragEvent.dataTransfer.effectAllowed = 'copy';
    });
  });
}

/**
 * Build and mount a Source payload panel (same UX as Field Mapping) into `host`.
 * @returns {{ refresh: () => void }}
 */
export function mountDatabaseSourceTree(
  host: HTMLElement,
  options: {
    getSample: () => unknown;
    onSampleChange?: (sample: unknown) => void;
    emptyMessage?: string;
  },
): { refresh: () => void } {
  const expandedPaths = new Set<string>();
  const collapsedPaths = new Set<string>();
  let expandAll = false;
  let searchQuery = '';

  host.classList.add('field-palette__database-panel');
  host.innerHTML = `
    <div class="field-palette__database-header">
      <span>Source payload</span>
      <label class="btn btn-sm field-palette__database-upload">
        Upload
        <input type="file" accept="application/json" data-role="database-source-file" hidden />
      </label>
    </div>
    <div class="field-mapping-source-toolbar field-palette__database-toolbar">
      <input type="search" class="modal__search" data-role="database-source-search" placeholder="Search source fields..." />
      <label class="field-mapping-source-expand">
        <input type="checkbox" data-role="database-source-expand-all" />
        Expand all
      </label>
    </div>
    <div class="field-mapping-schema field-palette__database-tree" data-role="database-source-tree"></div>
  `;

  const treeEl = host.querySelector('[data-role="database-source-tree"]') as HTMLElement;
  const searchEl = host.querySelector('[data-role="database-source-search"]') as HTMLInputElement;
  const expandAllEl = host.querySelector(
    '[data-role="database-source-expand-all"]',
  ) as HTMLInputElement;
  const fileEl = host.querySelector('[data-role="database-source-file"]') as HTMLInputElement;

  function refresh(): void {
    const sample = options.getSample?.();
    if (!sample || typeof sample !== 'object') {
      treeEl.innerHTML = `<p class="field-palette__database-empty">${escapeHtml(
        options.emptyMessage ?? 'No source sample available. Upload JSON or open Field Mapping.',
      )}</p>`;
      return;
    }

    const tree = mapTreeNodesForDisplay(buildSourcePayloadTree(sample), sample);
    const validPaths = collectSourceTreePaths(tree);
    for (const path of [...expandedPaths]) {
      if (!validPaths.has(path)) expandedPaths.delete(path);
    }
    for (const path of [...collapsedPaths]) {
      if (!validPaths.has(path)) collapsedPaths.delete(path);
    }

    treeEl.innerHTML = renderSourceSchemaTree(tree, {
      expandAll,
      expandedPaths,
      collapsedPaths,
      defaultVisibleLevels: 2,
      dragTitle: 'Drag onto canvas, field, or table column',
    });
    wireSourceSchemaTree(treeEl, { expandedPaths, collapsedPaths });
    filterSourceSchemaTree(treeEl, searchQuery);
  }

  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value;
    filterSourceSchemaTree(treeEl, searchQuery);
  });

  expandAllEl.addEventListener('change', () => {
    expandAll = expandAllEl.checked;
    if (!expandAll) {
      expandedPaths.clear();
      collapsedPaths.clear();
    }
    refresh();
  });

  fileEl.addEventListener('change', async () => {
    const file = fileEl.files?.[0];
    fileEl.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Sample payload must be a JSON object or array.');
      }
      options.onSampleChange?.(parsed);
      refresh();
    } catch (err: any) {
      treeEl.innerHTML = `<p class="field-palette__database-empty field-palette__database-empty--error">${escapeHtml(
        err instanceof Error ? err.message : String(err),
      )}</p>`;
    }
  });

  refresh();
  return { refresh };
}

export { SOURCE_PATH_DRAG_MIME, SOURCE_TREE_CHILDREN_COLLAPSED_CLASS };
