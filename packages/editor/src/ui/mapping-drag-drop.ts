import {
  createMappingRulesFromDrop,
  createSectionSourceRule,
  isAbsoluteMappingPath,
  isSectionSourceRule,
  toRelativeItemPath,
} from '@docengine/engine';
import { resolveSectionName } from '../core/field-id.js';

export const SOURCE_PATH_DRAG_MIME = 'application/x-docengine-source-path';
export const SOURCE_PATH_META_MIME = 'application/x-docengine-source-path-meta';

/**
 * @param {string} path
 */
export function serializeSourcePathDrag(path: any) {
  return JSON.stringify({ path });
}

/**
 * @param {DataTransfer} dataTransfer
 */
export function parseSourcePathDrag(dataTransfer: any) {
  const raw = dataTransfer.getData(SOURCE_PATH_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.path === 'string' ? parsed.path : null;
  } catch {
    return null;
  }
}

/**
 * @param {DataTransfer | null | undefined} dataTransfer
 */
export function isSourcePathDragEvent(dataTransfer: any) {
  const types = dataTransfer?.types;
  if (!types) return false;
  if (typeof types.includes === 'function') {
    return types.includes(SOURCE_PATH_DRAG_MIME) || types.includes(SOURCE_PATH_META_MIME);
  }
  return Array.from(types as ArrayLike<string>).some(
    (t) => t === SOURCE_PATH_DRAG_MIME || t === SOURCE_PATH_META_MIME,
  );
}

/**
 * @param {DataTransfer} dataTransfer
 * @returns {{ path: string; type: string; label?: string } | null}
 */
export function parseSourcePathMeta(dataTransfer: any) {
  const raw = dataTransfer?.getData?.(SOURCE_PATH_META_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.path === 'string') {
        const label =
          typeof parsed.label === 'string' && parsed.label.trim()
            ? parsed.label.trim()
            : undefined;
        return {
          path: parsed.path,
          type: String(parsed.type ?? ''),
          ...(label ? { label } : {}),
        };
      }
    } catch {
      // fall through
    }
  }
  const path = parseSourcePathDrag(dataTransfer);
  return path ? { path, type: '' } : null;
}

/**
 * @param {string} sectionName
 * @param {import('../types.d.ts').FieldMappingRule[] | null | undefined} rules
 */
export function getSectionSourcePath(sectionName: any, rules: any): string | null {
  const name = String(sectionName ?? '');
  if (!name || !Array.isArray(rules)) return null;
  const rule = rules.find(
    (entry: any) => isSectionSourceRule(entry) && String(entry.section ?? '') === name,
  );
  if (!rule) return null;
  const path = String(rule.sourceArrayPath || rule.sourcePath || '').trim();
  return path || null;
}

/**
 * Prefer relative `$leaf` paths when the drop is under the section `_source` array.
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {string | null | undefined} sectionSourcePath
 */
export function preferRelativePathsUnderSectionSource(rules: any, sectionSourcePath: any) {
  const arrayPath = String(sectionSourcePath ?? '').trim();
  if (!Array.isArray(rules)) return rules ?? [];

  return rules.map((rule: any) => {
    if (!rule || isSectionSourceRule(rule)) return rule;
    const next = { ...rule };
    if (
      arrayPath &&
      typeof next.sourcePath === 'string' &&
      isAbsoluteMappingPath(next.sourcePath)
    ) {
      if (String(next.sourcePath).startsWith(arrayPath)) {
        next.sourcePath = toRelativeItemPath(next.sourcePath, arrayPath);
      }
    }
    if (
      arrayPath &&
      typeof next.sourceArrayPath === 'string' &&
      isAbsoluteMappingPath(next.sourceArrayPath) &&
      String(next.sourceArrayPath).startsWith(arrayPath)
    ) {
      next.sourceArrayPath = toRelativeItemPath(next.sourceArrayPath, arrayPath);
    }
    // Column drops: `$values.amount` / `$payload…values.amount` → `$amount`
    // so Mapping result matches sibling columns like `"name": "$name"`.
    if (
      next.columnKey &&
      typeof next.sourcePath === 'string' &&
      typeof next.sourceArrayPath === 'string' &&
      next.sourceArrayPath
    ) {
      next.sourcePath = toRelativeItemPath(next.sourcePath, next.sourceArrayPath);
    }
    return next;
  });
}

/**
 * @param {HTMLElement} token
 */
function resolveDropTarget(token: any) {
  if (!token || token.classList.contains('field-token--computed')) return null;

  if (token.classList.contains('field-token--repeater')) {
    return {
      fieldId: token.dataset.fieldId ?? '',
      childFieldIds: [],
      bulkChild: true,
    };
  }

  const outerRepeater = token.closest('.field-token--repeater');
  if (!outerRepeater) {
    return {
      fieldId: token.dataset.fieldId ?? '',
      childFieldIds: [],
      bulkChild: false,
    };
  }

  /** @type {string[]} */
  const childFieldIds: any[] = [];
  let el = token;
  while (el && el !== outerRepeater) {
    if (el.classList?.contains('field-token') && !el.classList.contains('field-token--repeater')) {
      const id = el.dataset.fieldId;
      if (id) childFieldIds.unshift(id);
    }
    const parent = el.parentElement;
    el = parent?.closest('.field-token') ?? null;
  }

  return {
    fieldId: outerRepeater.dataset.fieldId ?? '',
    childFieldIds,
    bulkChild: false,
  };
}

function resolvePivotDropTarget(el: any) {
  const pivot = el?.closest?.('.document-table--pivot[data-pivot-field-id]');
  if (!pivot) return null;
  return {
    fieldId: pivot.dataset.pivotFieldId ?? pivot.dataset.tableId ?? '',
    childFieldIds: [],
    bulkChild: false,
  };
}

/** Whole-table chrome drop (maps an array onto all columns). */
function resolveTableChromeDropTarget(el: any, container: any) {
  const table = el?.closest?.('.document-table[data-table-id]:not(.document-table--pivot)');
  if (!table || !container?.contains?.(table)) return null;
  // Prefer cell tokens when the pointer is over one.
  const token = el?.closest?.('.field-token');
  if (token && table.contains(token)) return null;
  const fieldId = String(table.dataset.tableId ?? '').trim();
  if (!fieldId) return null;
  return {
    fieldId,
    childFieldIds: [],
    bulkChild: false,
    tableEl: table,
  };
}

/**
 * Section header drop target (array → `_source`).
 * @param {EventTarget | null} target
 * @param {HTMLElement} container
 */
function resolveSectionHeaderDropTarget(target: any, container: any) {
  const header = target?.closest?.('.document-section__header');
  if (!header || !container.contains(header)) return null;
  // Prefer header-only hits so field tokens inside the body still win.
  const token = target?.closest?.('.field-token');
  if (token && header.contains(token)) return null;
  const section = header.closest('.document-section');
  if (!section) return null;
  const sectionName =
    section.dataset.sectionName ||
    resolveSectionName(section.__documentSectionTool?.data ?? {});
  if (!sectionName) return null;
  return { sectionName, header, section };
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   getRegistry: () => { getFieldSchemas: () => Record<string, import('../types.d.ts').FieldSchema>; getBlocks?: () => import('../types.d.ts').EditorBlock[] };
 *   onAssignRules: (rules: import('../types.d.ts').FieldMappingRule[]) => void;
 *   getMappingRules?: () => import('../types.d.ts').FieldMappingRule[];
 * }} options
 */
export function wireMappingDragDrop(container: any, options: any = {}) {
  if (!container || container.dataset.mappingDragWired === 'true') return;
  container.dataset.mappingDragWired = 'true';

  /** @type {HTMLElement | null} */
  let activeToken: any = null;

  function clearActive() {
    activeToken?.classList.remove('field-token--mapping-drop');
    activeToken?.classList.remove('document-table--mapping-drop');
    activeToken?.classList.remove('document-section__header--mapping-drop');
    activeToken = null;
  }

  container.addEventListener(
    'dragover',
    (event: any) => {
      if (!parseSourcePathDrag(event.dataTransfer) && !isSourcePathDragEvent(event.dataTransfer)) {
        return;
      }

      const pivotTarget = resolvePivotDropTarget(event.target);
      if (pivotTarget?.fieldId) {
        const pivotEl = event.target.closest?.('.document-table--pivot');
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        if (activeToken !== pivotEl) {
          clearActive();
          activeToken = pivotEl;
          pivotEl?.classList.add('document-table--mapping-drop');
        }
        return;
      }

      const token = event.target.closest?.('.field-token');
      if (token && container.contains(token) && resolveDropTarget(token)) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        if (activeToken !== token) {
          clearActive();
          activeToken = token;
          token.classList.add('field-token--mapping-drop');
        }
        return;
      }

      const tableTarget = resolveTableChromeDropTarget(event.target, container);
      if (tableTarget?.fieldId) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        if (activeToken !== tableTarget.tableEl) {
          clearActive();
          activeToken = tableTarget.tableEl;
          tableTarget.tableEl?.classList.add('document-table--mapping-drop');
        }
        return;
      }

      const sectionTarget = resolveSectionHeaderDropTarget(event.target, container);
      if (sectionTarget) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        if (activeToken !== sectionTarget.header) {
          clearActive();
          activeToken = sectionTarget.header;
          sectionTarget.header.classList.add('document-section__header--mapping-drop');
        }
      }
    },
    true,
  );

  container.addEventListener(
    'dragleave',
    (event: any) => {
      if (!event.relatedTarget || !container.contains(event.relatedTarget)) {
        clearActive();
      }
    },
    true,
  );

  container.addEventListener(
    'drop',
    (event: any) => {
      const meta = parseSourcePathMeta(event.dataTransfer);
      const sourcePath = meta?.path || parseSourcePathDrag(event.dataTransfer);
      if (!sourcePath) return;

      const pivotTarget = resolvePivotDropTarget(event.target);
      const token = event.target.closest?.('.field-token');
      const tableTarget = resolveTableChromeDropTarget(event.target, container);
      const fieldTarget = pivotTarget?.fieldId
        ? pivotTarget
        : token && container.contains(token)
          ? resolveDropTarget(token)
          : tableTarget?.fieldId
            ? tableTarget
            : null;

      if (fieldTarget?.fieldId) {
        event.preventDefault();
        event.stopPropagation();
        clearActive();

        const registry = options.getRegistry?.();
        const blocks = registry?.getBlocks?.() ?? [];
        const fieldSchemas = registry?.getFieldSchemas?.() ?? {};
        let rules = createMappingRulesFromDrop(fieldTarget.fieldId, sourcePath, blocks, fieldSchemas, {
          childFieldIds: fieldTarget.childFieldIds,
          bulkChild: fieldTarget.bulkChild,
          sourceType: meta?.type,
        });
        if (!rules.length) return;

        const sectionEl =
          token?.closest?.('.document-section') ||
          tableTarget?.tableEl?.closest?.('.document-section') ||
          event.target.closest?.('.document-section');
        const sectionName =
          sectionEl?.dataset?.sectionName ||
          (rules[0]?.section ? String(rules[0].section) : '');
        const sectionSource = getSectionSourcePath(sectionName, options.getMappingRules?.() ?? []);
        if (sectionSource) {
          rules = preferRelativePathsUnderSectionSource(rules, sectionSource);
        }

        options.onAssignRules?.(rules);
        return;
      }

      const sectionTarget = resolveSectionHeaderDropTarget(event.target, container);
      if (!sectionTarget) return;

      // Only array (or unknown-type) drops bind section `_source`.
      const type = String(meta?.type ?? '').toLowerCase();
      if (type && type !== 'array') return;

      event.preventDefault();
      event.stopPropagation();
      clearActive();
      options.onAssignRules?.([createSectionSourceRule(sectionTarget.sectionName, sourcePath)]);
    },
    true,
  );

  container.addEventListener('dragend', clearActive, true);
}
