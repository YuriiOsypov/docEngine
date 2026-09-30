import { createMappingRulesFromDrop } from '@docengine/engine';

export const SOURCE_PATH_DRAG_MIME = 'application/x-docengine-source-path';

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

/**
 * @param {HTMLElement} container
 * @param {{
 *   getRegistry: () => { getFieldSchemas: () => Record<string, import('../types.d.ts').FieldSchema>; getBlocks?: () => import('../types.d.ts').EditorBlock[] };
 *   onAssignRules: (rules: import('../types.d.ts').FieldMappingRule[]) => void;
 * }} options
 */
export function wireMappingDragDrop(container: any,options: any = {}) {
  if (!container || container.dataset.mappingDragWired === 'true') return;
  container.dataset.mappingDragWired = 'true';

  /** @type {HTMLElement | null} */
  let activeToken: any = null;

  function clearActive() {
    activeToken?.classList.remove('field-token--mapping-drop');
    activeToken?.classList.remove('document-table--mapping-drop');
    activeToken = null;
  }

  container.addEventListener('dragover', (event: any) => {
    if (!parseSourcePathDrag(event.dataTransfer)) return;

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
    if (!token || !container.contains(token)) return;
    if (!resolveDropTarget(token)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    if (activeToken !== token) {
      clearActive();
      activeToken = token;
      token.classList.add('field-token--mapping-drop');
    }
  }, true);

  container.addEventListener('dragleave', (event: any) => {
    if (!event.relatedTarget || !container.contains(event.relatedTarget)) {
      clearActive();
    }
  }, true);

  container.addEventListener('drop', (event: any) => {
    const sourcePath = parseSourcePathDrag(event.dataTransfer);
    if (!sourcePath) return;

    const pivotTarget = resolvePivotDropTarget(event.target);
    const token = event.target.closest?.('.field-token');
    const target = pivotTarget?.fieldId
      ? pivotTarget
      : token && container.contains(token)
        ? resolveDropTarget(token)
        : null;
    if (!target?.fieldId) return;

    event.preventDefault();
    event.stopPropagation();
    clearActive();

    const registry = options.getRegistry?.();
    const blocks = registry?.getBlocks?.() ?? [];
    const fieldSchemas = registry?.getFieldSchemas?.() ?? {};
    const rules = createMappingRulesFromDrop(
      target.fieldId,
      sourcePath,
      blocks,
      fieldSchemas,
      {
        childFieldIds: target.childFieldIds,
        bulkChild: target.bulkChild,
      },
    );
    if (!rules.length) return;
    options.onAssignRules?.(rules);
  }, true);

  container.addEventListener('dragend', clearActive, true);
}
