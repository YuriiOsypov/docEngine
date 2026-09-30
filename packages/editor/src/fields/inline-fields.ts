import { resolveRegistry, getRegistryFromNode } from '../registry/registry-context.js';
import { schemaToDisplayConfig } from '../registry/schema-registry.js';
import { getFieldHandler } from './handlers/registry.js';
import { createDefaultBlockData, createDefaultSchema, resolveSchemaDefaultValue, ensureCellSchemasForRows, resolveTableInstanceRows, parseCellFieldId, isFieldEditableInFillMode, isTableCellInheritedReadonly, isSchemaReadonly } from '../core/field-schemas.js';
import { allocateFieldIdentity } from '../core/field-id.js';
import { remapperMovedSubtreeToSection } from './cross-section-reposition.js';
import { PALETTE_DRAG_MIME, parsePaletteDrag, isPaletteDragSessionActive } from '../design/field-palette.js';
import { normalizeImageValue, isImageValueEmpty } from '../services/image-upload.js';
import {
  appendHtmlToFragment,
  isPlainTextHtml,
  sanitizeHtml,
  isAlignmentDiv,
  getBlockTextAlign,
  isHtmlValueEmpty,
  isHeadingElement,
  plainTextNewlinesToBr,
  restoreSelection,
  saveSelection,
} from './rich-text.js';
import {
  selectDesignToken,
  getFieldSelectionContainer,
} from './field-selection.js';
import { setFillFieldFocus, restoreFillFieldFocusAfterPicker } from './fill-field-focus.js';
import {
  evaluateComputedField,
  extractFormulaDependencyFieldIds,
} from '../core/computed-formula.js';
import { enrichComputedValues } from '../core/document-io.js';
import { formatNumericDisplay } from '@docengine/engine';
import {
  formatManualEditText,
} from './manual-field-values.js';
import {
  applyFieldDisplayStyle,
  applyTableCellDisplayStyle,
  clearFieldHighlightOverriddenStyles,
    resolveTokenDisplayStyle,
} from './field-display-style.js';
import { encodeBarcodeToDataUrl } from './barcode-encode.js';
import {
  renderPivotTableSegment,
  readPivotValueFromDom,
  wirePivotRowLabelResize,
  refreshPivotTableInDom,
} from './pivot-table-field.js';
import {
  buildTableElement,
  buildPreviewTableElement,
  getTableSchema,
  readTableRowsFromDom,
  syncTableRowsDataset,
  addTableRowToWrapper,
  addTableRowsFromText,
  removeTableRowFromWrapper,
  shouldShowTableRowActions,
} from './table-field.js';
import {
  schemaWidthToColCss,
  scalePercentCssWidthsToFill,
  wireTableColumnResize,
} from './wire-table-column-resize.js';
import { wireColumnsResize } from './wire-columns-resize.js';
import { showNotification } from '../ui/notification.js';
import {
  renderRepeaterFieldPreview,
  createInlineRepeaterSeedValue,
} from './repeater-field.js';
import { repeaterHasContent, isLegacyRepeaterInstancesWrapper, mergeRepeaterDomValues } from '../core/repeater-io.js';
import { createDragHandle } from '../ui/drag-handle.js';

/** Invisible caret position beside contenteditable=false field tokens. */
export const FIELD_TOKEN_CARET_ANCHOR = '\u200B';

export function stripFieldTokenCaretAnchors(text: any) {
  return String(text ?? '').replace(/\u200B/g, '');
}

export function isCaretAnchorOnlyTextNode(node: any) {
  return node?.nodeType === Node.TEXT_NODE && node.textContent === FIELD_TOKEN_CARET_ANCHOR;
}

function isCaretAnchorTextNode(node: any) {
  return isCaretAnchorOnlyTextNode(node);
}

export function hasLeadingCaretAnchor(text: any) {
  return String(text ?? '').startsWith(FIELD_TOKEN_CARET_ANCHOR);
}

export function caretPositionAfterFieldToken(textNode: any) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return 0;
  if (isCaretAnchorTextNode(textNode)) return 0;
  return hasLeadingCaretAnchor(textNode.textContent) ? 1 : 0;
}

/** Place the caret at a visible position beside a field-token bridge node. */
export function focusCaretAtFieldBridge(textNode: any) {
  if (!textNode?.isConnected) return;
  try {
    const range = document.createRange();
    if (isCaretAnchorTextNode(textNode)) {
      // Prefer sitting inside the bridge at offset 0 — Chrome paints a caret
      // there (visually after the field). Parent-after-ZWSP often draws nothing.
      range.setStart(textNode, 0);
    } else {
      range.setStart(textNode, caretPositionAfterFieldToken(textNode));
    }
    range.collapse(true);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // node may have been removed from the document
  }
}

function isFieldTokenElement(node: any) {
  return node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains('field-token');
}

export function ensureCaretAnchorAfter(node: any) {
  if (!node?.isConnected || !node.parentNode) return null;
  if (node.classList?.contains('field-token--cell')) return null;

  const next = node.nextSibling;
  if (isCaretAnchorTextNode(next)) return next;

  if (next?.nodeType === Node.TEXT_NODE && stripFieldTokenCaretAnchors(next.textContent).length > 0) {
    if (!hasLeadingCaretAnchor(next.textContent)) {
      next.textContent = `${FIELD_TOKEN_CARET_ANCHOR}${next.textContent}`;
    }
    return next;
  }

  if (
    !next ||
    isFieldTokenElement(next) ||
    next.nodeName === 'BR' ||
    (next.nodeType === Node.TEXT_NODE && !next.textContent)
  ) {
    const anchor = document.createTextNode(FIELD_TOKEN_CARET_ANCHOR);
    node.parentNode.insertBefore(anchor, next);
    return anchor;
  }

  return null;
}

export function ensureFieldTokenCaretAnchors(container: any) {
  if (!container) return;
  container.querySelectorAll('.field-token:not(.field-token--cell)').forEach((token: any) => {
    ensureCaretAnchorAfter(token);
  });
}

/** Drop the standalone ZWSP that belongs immediately after a field token (before move/remove). */
export function removeTrailingCaretBridge(node: any) {
  const bridge = node?.nextSibling;
  if (isCaretAnchorTextNode(bridge)) {
    bridge.remove();
  }
}

/**
 * Insert `node` after `reference` without stealing its caret bridge.
 * `insertAdjacentElement('afterend')` would place the new node between the
 * field and its ZWSP, leaving adjacent contenteditable=false tokens with no
 * place for the caret.
 */
export function insertElementAfterPreservingCaretBridge(reference: any, node: any) {
  if (!reference?.parentNode || !node) return;
  let anchor = reference;
  const next = reference.nextSibling;
  if (isCaretAnchorTextNode(next)) {
    anchor = next;
  }
  anchor.parentNode.insertBefore(node, anchor.nextSibling);
}

/** Remove caret-anchor zero-width spaces from table data cells. */
export function pruneTableCellCaretAnchors(container: any) {
  if (!container?.querySelectorAll) return;
  for (const td of container.querySelectorAll('.vision-table td')) {
    for (const child of [...td.childNodes]) {
      if (child.nodeType !== Node.TEXT_NODE) continue;
      if (!stripFieldTokenCaretAnchors(child.textContent).trim()) {
        child.remove();
      }
    }
  }
}

function registryFrom(context: any) {
  return resolveRegistry(context);
}

function computedFieldsAffectedByChange(changedFieldId: any, schemas: any, blocks: any = []) {
  const computedIds = Object.keys(schemas).filter((id: any) => schemas[id]?.type === 'computed');
  const affected = new Set();
  let changed = true;

  while (changed) {
    changed = false;
    for (const id of computedIds) {
      if (affected.has(id)) continue;
      const deps = extractFormulaDependencyFieldIds(schemas[id].formula ?? '', blocks, schemas);
      if (deps.some((dep: any) => dep === changedFieldId || affected.has(dep))) {
        affected.add(id);
        changed = true;
      }
    }
  }

  return affected;
}

function resolveBlocksFromContext(context: any) {
  const registry = registryFrom(context);
  return context?.blocks ?? registry?.getBlocks?.() ?? [];
}

function resolveEditorHolder(container: any, options: any = {}) {
  return options.editorHolder ?? container?.closest?.('[data-doc-editor]') ?? null;
}

function preferLocalFieldIdSet(options: any = {}) {
  const ids = options.preferLocalFieldIds ?? (options.changedFieldId ? [options.changedFieldId] : []);
  return new Set((ids ?? []).filter(Boolean));
}

export function collectAllFieldValuesFromHolder(holder: any, localValues: any = {}, options: any = {}) {
  if (!holder?.querySelectorAll) {
    return recoverImageValuesFromDom(null, { ...(localValues ?? {}) });
  }

  const merged = {};
  for (const editable of holder.querySelectorAll('.document-section__body')) {
    Object.assign(merged, extractFieldValuesFromDom(editable));
  }
  const out = { ...(localValues ?? {}) };
  const preferLocal = preferLocalFieldIdSet(options);
  // Prefer non-empty live token values; keep stored when DOM scrape is empty (placeholders).
  // A just-saved picker value is newer than the token until updateFieldToken runs — keep it.
  for (const [fieldId, domVal] of Object.entries(merged)) {
    if (preferLocal.has(fieldId) && !isFieldEmpty(out[fieldId])) continue;
    if (!isFieldEmpty(domVal) || isFieldEmpty(out[fieldId])) {
      out[fieldId] = domVal;
    }
  }
  return recoverImageValuesFromDom(holder, out);
}

function resolveFieldDef(fieldId: any, context: any) {
  const registry = registryFrom(context) ?? getRegistryFromNode(context);
  return registry?.getFieldDef(fieldId) ?? schemaToDisplayConfig(context?.fieldSchemas?.[fieldId]);
}

export function getFieldDisplayLabel(fieldId: any, placeholder: any, context: any) {
  const def = resolveFieldDef(fieldId, context);
  const label = def?.label || placeholder || fieldId;
  return String(label).trim() || fieldId;
}

function formatListArray(value: any, layout: any, itemPrefix: any) {
  switch (layout) {
    case 'lines':
      return value.join('\n');
    case 'bullet':
      return value.map((v: any) => `• ${v}`).join('\n');
    case 'numeric':
      return value.map((v: any, i: any) => `${i + 1}. ${v}`).join('\n');
    case 'custom':
      return value.map((v: any) => `${itemPrefix ?? ''}${v}`).join('\n');
    default:
      return value.join('; ');
  }
}

export function formatFieldDisplay(fieldId: any, value: any, placeholder: any, context: any) {
  const def = resolveFieldDef(fieldId, context);
  const emptyLabel = getFieldDisplayLabel(fieldId, placeholder, context);
  const registry = registryFrom(context);
  const schema = registry?.getFieldSchemas()?.[fieldId] ?? context?.fieldSchemas?.[fieldId];
  const handler = getFieldHandler(schema?.type);

  if (typeof handler?.formatDisplay === 'function') {
    const formatted = handler.formatDisplay(value, {
      schema,
      def,
      emptyLabel,
      fieldId,
      context,
    });
    if (formatted != null) return formatted;
  }

  if (!def) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      return emptyLabel;
    }
    if (Array.isArray(value)) return value.join('; ');
    return String(value);
  }

  if (def.picker === 'image' || def.picker === 'signature') {
    if (isImageValueEmpty(value)) return emptyLabel;
    const img = normalizeImageValue(value);
    return def.picker === 'signature' ? '[Signature]' : img.caption || '[Image]';
  }

  if (value === true || value === false) {
    return value ? 'Yes' : 'No';
  }

  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return emptyLabel;
  }

  if (Array.isArray(value)) {
    if (def.schemaType === 'list') {
      return formatListArray(value, def.itemLayout ?? 'inline', def.itemPrefix);
    }
    return value.join('; ');
  }

  if (def.picker === 'integer') {
    return formatNumericDisplay(value, {
      displayFormat: def.displayFormat,
      currencyCode: def.currencyCode,
      fractionDigits: def.fractionDigits,
      suffix: def.suffix,
    });
  }

  return String(value);
}

export function isRepeaterValue(value: any) {
  if (value == null || typeof value !== 'object' || Array.isArray(value) || 'url' in value) {
    return false;
  }
  return isLegacyRepeaterInstancesWrapper(value);
}

export function isFlatRepeaterValue(value: any, repeaterSchema: any) {
  if (value == null || typeof value !== 'object' || Array.isArray(value) || 'url' in value) {
    return false;
  }
  if (isLegacyRepeaterInstancesWrapper(value)) return true;
  if (!repeaterSchema || repeaterSchema.type !== 'child') return false;
  const childKeys = Object.keys(repeaterSchema.fieldSchemas ?? {});
  if (!childKeys.length) return Object.keys(value).length > 0;
  return Object.keys(value).some((key: any) => childKeys.includes(key));
}

export function isFieldEmpty(value: any, options: any = {}) {
  if (value === '—') return true;
  const repeaterSchema =
    options.repeaterSchema?.type === 'child'
      ? options.repeaterSchema
      : options.schema?.type === 'child'
        ? options.schema
        : undefined;
  if (repeaterSchema) {
    return !repeaterHasContent(value, repeaterSchema);
  }
  if (isLegacyRepeaterInstancesWrapper(value)) {
    return !Object.values(value.instances ?? {}).some((inst: any) => {
      if (!inst || typeof inst !== 'object') return false;
      return Object.values(inst).some(
        (entry: any) =>
          entry != null &&
          entry !== '' &&
          !(Array.isArray(entry) && entry.length === 0) &&
          !(typeof entry === 'object' && 'url' in entry && !entry.url),
      );
    });
  }
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    const schema = options.schema;
    if (schema?.type) {
      const handler = getFieldHandler(schema.type);
      if (typeof handler?.isEmpty === 'function') {
        const result = handler.isEmpty(value, schema);
        if (typeof result === 'boolean') return result;
      }
    }
    return isImageValueEmpty(value);
  }
  if (typeof value === 'string' && !stripFieldTokenCaretAnchors(value).trim()) {
    return true;
  }
  if (options.htmlEditor && typeof value === 'string') {
    return isHtmlValueEmpty(value);
  }

  const schema = options.schema;
  if (schema?.type) {
    const handler = getFieldHandler(schema.type);
    if (typeof handler?.isEmpty === 'function') {
      const result = handler.isEmpty(value, schema);
      if (typeof result === 'boolean') return result;
    }
  }

  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function resolveComputedValue(fieldId: any, valuesMap: any, context: any) {
  const registry = registryFrom(context);
  const schemas = registry?.getFieldSchemas() ?? {};
  const blocks = resolveBlocksFromContext(context);
  return evaluateComputedField(fieldId, valuesMap ?? {}, schemas, { blocks });
}

/**
 * In fill mode, empty fields use their schema default (e.g. current date when
 * `defaultMode` is `today`). Design mode keeps empties so templates stay undated.
 */
export function resolveValueOrFillDefault(schema: any, currentValue: any, { designMode = false } = {}) {
  if (designMode) {
    return currentValue === undefined || currentValue === null ? '' : currentValue;
  }
  if (!isFieldEmpty(currentValue, { schema })) return currentValue;
  if (!schema) return currentValue ?? '';
  return resolveSchemaDefaultValue(schema, { forTemplate: false });
}

export function refreshComputedFields(container: any, valuesMap: any, options: any = {}) {
  if (!container) return;

  const registry = registryFrom(options) ?? getRegistryFromNode(container);
  const schemas = registry?.getFieldSchemas() ?? {};
  const blocks = options.blocks ?? registry?.getBlocks?.() ?? [];
  const changedFieldId = options.changedFieldId;
  const holder = resolveEditorHolder(container, options);
  const evaluationValues = collectAllFieldValuesFromHolder(holder, valuesMap, options);

  const holderSections = holder
    ? [...holder.querySelectorAll('.document-section__body')]
    : [];
  // Fall back to the local section when the holder query finds nothing (e.g. shadow DOM).
  const containers = holderSections.length > 0 ? holderSections : [container];

  for (const target of containers) {
    target.querySelectorAll('.field-token').forEach((token: any) => {
      const fieldId = token.dataset.fieldId;
      const schema = schemas[fieldId];
      if (schema?.type !== 'computed') return;

      if (changedFieldId) {
        const affected = computedFieldsAffectedByChange(changedFieldId, schemas, blocks);
        if (!affected.has(fieldId)) return;
      }

      const { value, error } = evaluateComputedField(fieldId, evaluationValues, schemas, { blocks });
      if (error) token.title = error;
      else token.removeAttribute('title');
      updateFieldToken(token, value, token.dataset.placeholder, fieldTokenUpdateContext(token, options, schemas));
    });

    ensureFieldTokenCaretAnchors(target);
  }
}

/**
 * Fill-mode: merge DOM + stored values, recalculate computed fields (same as preview),
 * and push results onto tokens. Use after mapping / section render so Sub-Total etc.
 * are not left blank until the user edits a field.
 */
export function syncFillComputedFields(container: any, valuesMap: any = {}, options: any = {}) {
  if (!container) return { ...(valuesMap ?? {}) };

  const registry = registryFrom(options) ?? getRegistryFromNode(container);
  const schemas = registry?.getFieldSchemas() ?? {};
  const blocks = options.blocks ?? registry?.getBlocks?.() ?? [];
  const holder = resolveEditorHolder(container, options);

  const merged = collectAllFieldValuesFromHolder(holder, valuesMap, options);
  // Keep non-computed DOM/local values; recompute all computed (preview parity).
  for (const [fieldId, schema] of Object.entries(schemas) as [string, { type?: string }][]) {
    if (schema?.type === 'computed') delete merged[fieldId];
  }
  enrichComputedValues(merged, schemas, blocks);

  const holderSections = holder
    ? [...holder.querySelectorAll('.document-section__body')]
    : [];
  const containers = holderSections.length > 0 ? holderSections : [container];

  for (const target of containers) {
    target.querySelectorAll('.field-token').forEach((token: any) => {
      const fieldId = token.dataset.fieldId;
      if (!fieldId || schemas[fieldId]?.type !== 'computed') return;
      token.removeAttribute('title');
      updateFieldToken(
        token,
        merged[fieldId] ?? '',
        token.dataset.placeholder,
        fieldTokenUpdateContext(token, options, schemas),
      );
    });
    ensureFieldTokenCaretAnchors(target);
  }

  return merged;
}

export function createFieldToken(fieldId: any, value: any, placeholder: any, context?: any) {
  const span = document.createElement('span');
  span.className = 'field-token';
  span.contentEditable = 'false';
  span.spellcheck = false;
  span.dataset.fieldId = fieldId;
  if (placeholder) span.dataset.placeholder = placeholder;

  updateFieldToken(span, value, placeholder, context);
  return span;
}

export function isTableCellDisplayPlaceholder(value: any, label: any) {
  if (value == null || value === '') return true;
  if (typeof value !== 'string') return false;
  const normalized = String(label ?? '').trim();
  return !!normalized && value === normalized;
}

function isTableCellPlaceholderValue(token: any, value: any, placeholder: any) {
  if (!token.classList.contains('field-token--cell')) return false;
  return isTableCellDisplayPlaceholder(value, placeholder ?? token.dataset.placeholder);
}

function normalizeTableCellTokenValue(token: any, value: any, placeholder: any) {
  if (!token.classList.contains('field-token--cell')) return value;
  if (isTableCellPlaceholderValue(token, value, placeholder)) return '';
  return value;
}

function fieldTokenUpdateContext(token: any, options: any = {}, schemas: any = {}) {
  const isTableCell = token.classList.contains('field-token--cell');
  return {
    ...options,
    fieldSchemas: options.fieldSchemas ?? schemas,
    isTableCell: options.isTableCell ?? isTableCell,
  };
}

export function refreshTableCellTokens(root: any, context: any = {}) {
  const scope = root?.querySelector ? root : document;
  const registry = resolveRegistry(context);
  const fieldSchemas =
    context.fieldSchemas ?? registry?.getFieldSchemas?.() ?? {};
  const cellContext = { ...context, fieldSchemas, isTableCell: true };

  for (const token of scope.querySelectorAll('.field-token--cell')) {
    const fieldId = token.dataset.fieldId;
    if (!fieldId) continue;
    // Computed cells are painted by syncFillComputedFields. Re-reading the
    // formatted display (e.g. "$1,000.00") on EditorJS save restyles them.
    if (
      token.classList.contains('field-token--computed')
      || fieldSchemas[fieldId]?.type === 'computed'
    ) {
      continue;
    }
    // Nested tokens inside a Child preview are not top-level document cells.
    // Re-refreshing them (or rebuilding the parent Child from a half-read
    // preview) wipes values just written by the Child modal.
    const enclosingRepeater = token.closest('.field-token--repeater');
    if (enclosingRepeater && enclosingRepeater !== token) continue;

    // Child-in-cell: prefer the stored JSON over scraping the nested preview
    // DOM (preview may omit empty cells / truncate during the post-save
    // EditorJS save → refresh cycle).
    const value = token.classList.contains('field-token--repeater')
      ? readRepeaterTokenDatasetValue(token)
      : normalizeTableCellTokenValue(
          token,
          readTokenValue(token),
          token.dataset.placeholder,
        );
    updateFieldToken(token, value, token.dataset.placeholder, cellContext);
  }
  pruneTableCellCaretAnchors(scope);
}

export function updateFieldToken(token: any, value: any, placeholder: any, context?: any) {
  value = normalizeTableCellTokenValue(token, value, placeholder);
  const fieldId = token.dataset.fieldId;
  const registry = resolveRegistry(context) ?? getRegistryFromNode(token);
  const registryCtx = registry
    ? {
        getRegistry: () => registry,
        fieldSchemas: context?.fieldSchemas,
        fieldValueStyle: context?.fieldValueStyle,
        hideEmptyValues: context?.hideEmptyValues,
        previewMode: context?.previewMode,
      }
    : context ?? token;
  const label = getFieldDisplayLabel(fieldId, placeholder ?? token.dataset.placeholder, registryCtx);
  const def = resolveFieldDef(fieldId, registryCtx);
  const schema = registry?.getFieldSchemas()?.[fieldId] ?? context?.fieldSchemas?.[fieldId];
  if (schema?.type === 'text' && !def?.htmlEditor) {
    value = sanitizeTextFieldValue(value);
  }
  token.dataset.placeholder = label;

  // Keep the design grip (and its drag listeners) across content rebuilds.
  const dragHandle = token.querySelector?.(':scope > .editor-drag-handle') ?? null;
  if (dragHandle) dragHandle.remove();

  token.textContent = '';
  token.classList.remove(
    'field-token--image',
    'field-token--barcode',
    'field-token--logical',
    'field-token--logical-yes',
    'field-token--logical-no',
    'field-token--html',
    'field-token--computed',
    'field-token--readonly',
    'field-token--repeater',
    'field-token--required',
    'field-token--required-missing',
  );
  token.style.removeProperty('--field-image-max-width');
  if (token.dataset) delete token.dataset.maxWidth;
  if (token.dataset) delete token.dataset.barcodeError;

  if (def?.picker === 'computed') {
    token.classList.add('field-token--computed');
  } else if (
    schema?.readonly ||
    isTableCellInheritedReadonly(
      fieldId,
      registry?.getFieldSchemas?.() ?? context?.fieldSchemas,
    )
  ) {
    token.classList.add('field-token--readonly');
  }

  const emptyOptions = {
    htmlEditor: !!def?.htmlEditor,
    repeaterSchema: schema?.type === 'child' ? schema : undefined,
  };
  const isRequired = !!(def?.required ?? schema?.required);
  // Fill/design: labels. Preview: blank for optional empties; required empties keep a placeholder.
  const showEmptyPlaceholder = !context?.previewMode || isRequired;

  if (schema?.type === 'child') {
    token.classList.add('field-token--repeater');
    const empty = isFieldEmpty(value, { repeaterSchema: schema });
    const hasTemplate =
      Object.keys(schema.fieldSchemas ?? {}).length > 0 || !!schema.template?.blocks?.length;
    if (empty && showEmptyPlaceholder && !hasTemplate) {
      token.textContent = label;
    } else if (!empty || !context?.previewMode || hasTemplate) {
      token.appendChild(renderRepeaterFieldPreview(fieldId, value, registryCtx));
    }
    // Optional empty preview tokens without a template stay blank.
  } else if (def?.picker === 'image' || def?.picker === 'signature') {
    const maxW = Number(def.maxWidth) > 0 ? Number(def.maxWidth) : 320;
    token.style.setProperty('--field-image-max-width', `${maxW}px`);
    token.dataset.maxWidth = String(maxW);
  } else if (schema?.type === 'barcode' || def?.picker === 'barcode') {
    const maxW = Number(schema?.maxWidth ?? def?.maxWidth) > 0
      ? Number(schema?.maxWidth ?? def?.maxWidth)
      : 180;
    token.style.setProperty('--field-image-max-width', `${maxW}px`);
    token.dataset.maxWidth = String(maxW);
  } else if (def?.picker === 'logical' || schema?.type === 'logical') {
    token.classList.add('field-token--logical');
  }

  if (schema?.type === 'child') {
    /* rendered above */
  } else if (schema?.type === 'barcode' || def?.picker === 'barcode') {
    const maxW = Number(schema?.maxWidth ?? def?.maxWidth) > 0
      ? Number(schema?.maxWidth ?? def?.maxWidth)
      : 180;
    const code = value == null || value === '' ? '' : String(value);
    token.classList.add('field-token--barcode');
    if (!code) {
      if (showEmptyPlaceholder) token.textContent = label;
    } else {
      const encoded = encodeBarcodeToDataUrl(code, {
        symbology: schema?.symbology ?? def?.symbology ?? 'code128',
        maxWidth: maxW,
        height: schema?.height ?? def?.height ?? 10,
        displayValue: schema?.displayValue !== false && def?.displayValue !== false,
        quietZone: schema?.quietZone !== false && def?.quietZone !== false,
      });
      if (encoded.dataUrl) {
        token.classList.add('field-token--image');
        const thumb = document.createElement('img');
        thumb.className = 'field-token__thumb';
        thumb.draggable = false;
        thumb.src = encoded.dataUrl;
        thumb.alt = code;
        thumb.setAttribute('width', String(maxW));
        thumb.style.maxWidth = `${maxW}px`;
        thumb.style.width = `${maxW}px`;
        thumb.style.height = 'auto';
        token.appendChild(thumb);
      } else {
        token.dataset.barcodeError = encoded.error || 'Invalid barcode';
        token.textContent = code;
        const err = document.createElement('span');
        err.className = 'field-token__barcode-error';
        err.textContent = encoded.error || 'Invalid barcode';
        token.appendChild(err);
      }
    }
  } else if (
    (def?.picker === 'image' || def?.picker === 'signature') &&
    !isImageValueEmpty(value)
  ) {
    const imgVal = normalizeImageValue(value);
    rememberLiveImageValue(fieldId, imgVal);
    token.classList.add('field-token--image');
    const maxW = Number(def.maxWidth) > 0 ? Number(def.maxWidth) : 320;
    const thumb = document.createElement('img');
    thumb.className = 'field-token__thumb';
    thumb.draggable = false;
    thumb.src = imgVal.url;
    thumb.alt = imgVal.caption || def.altText || label;
    // Explicit width helps Salesforce Blob.toPdf (ignores CSS max-width).
    thumb.setAttribute('width', String(maxW));
    thumb.style.maxWidth = `${maxW}px`;
    thumb.style.width = `${maxW}px`;
    thumb.style.height = 'auto';
    token.appendChild(thumb);
    if (imgVal.caption) {
      const cap = document.createElement('span');
      cap.className = 'field-token__caption';
      cap.textContent = imgVal.caption;
      token.appendChild(cap);
    }
  } else if (
    (def?.picker === 'image' || def?.picker === 'signature') &&
    isImageValueEmpty(value)
  ) {
    rememberLiveImageValue(fieldId, null);
    // Design/fill: show the field label so an empty Image token is visible and selectable.
    // Preview: keep optional empties blank (required empties still get a placeholder).
    if (showEmptyPlaceholder) {
      token.textContent = label;
    }
  } else if (def?.picker === 'logical' || schema?.type === 'logical') {
    const empty = isFieldEmpty(value, { schema });
    token.classList.add('field-token--logical');
    if (empty && showEmptyPlaceholder) {
      token.textContent = label;
    } else if (!empty) {
      if (value === true) {
        token.classList.add('field-token--logical-yes');
        token.textContent = 'Yes ✓';
      } else {
        token.classList.add('field-token--logical-no');
        token.textContent = 'No';
      }
    }
  } else if (def?.htmlEditor) {
    token.classList.add('field-token--html');
    value = normalizeHtmlEditorValue(value);
    const empty = isFieldEmpty(value, { htmlEditor: true });
    if (empty) {
      if (showEmptyPlaceholder) {
        token.textContent = label;
      }
    } else {
      appendHtmlToFragment(token, String(value));
    }
  } else {
    const empty = isFieldEmpty(value, { htmlEditor: false });
    if (!empty) {
      const display = formatFieldDisplay(fieldId, value, placeholder ?? token.dataset.placeholder, registryCtx);
      token.textContent = display;
    } else if (showEmptyPlaceholder) {
      token.textContent = label;
    }
  }

  if (isFieldEmpty(value, emptyOptions)) {
    token.classList.add('field-token--empty');
  } else {
    token.classList.remove('field-token--empty');
  }

  const missing = isRequired && isFieldEmpty(value, emptyOptions);
  token.classList.toggle('field-token--required', isRequired);
  token.classList.toggle('field-token--required-missing', missing);

  writeTokenDatasetValue(token, value);

  const isTableCell =
    context?.isTableCell ?? token.classList.contains('field-token--cell');
  const fieldSchemas =
    context?.fieldSchemas ?? registry?.getFieldSchemas?.() ?? {};
  if (isTableCell) {
    applyTableCellDisplayStyle(token, fieldId, schema, fieldSchemas, context);
  } else {
    const displayStyle = resolveTokenDisplayStyle(
      schema,
      context?.fieldValueStyle?.default,
      false,
      context?.fieldValueStyle,
      context,
      token,
    );
    applyFieldDisplayStyle(token, displayStyle);
  }
  clearFieldHighlightOverriddenStyles(token, context);
  if (dragHandle) {
    token.insertBefore(dragHandle, token.firstChild);
  }
  if (token.classList.contains('field-token--cell')) {
    pruneTableCellCaretAnchors(token.closest('.vision-table') ?? token.parentElement);
  } else {
    ensureCaretAnchorAfter(token);
  }
}

export function readRepeaterTokenValue(token: any) {
  const raw = readRepeaterTokenDatasetValue(token);
  // Inline Child previews are display-only (edits go through the modal).
  // Prefer the stored JSON over scraping nested tokens — the preview often
  // omits empty cells and was the source of post-save value loss.
  if (Object.keys(raw).length > 0) return raw;

  const previewRoot = token.querySelector('.field-token__repeater-preview');
  if (!previewRoot) return raw;

  const repeaterFieldId = token.dataset.fieldId;
  const registry = getRegistryFromNode(token);
  const schema = registry?.getFieldSchemas()?.[repeaterFieldId];
  if (!schema || schema.type !== 'child') return raw;

  const domValues: Record<string, any> = {};
  previewRoot.querySelectorAll('.field-token').forEach((childToken: any) => {
    if (childToken.classList.contains('field-token--repeater')) return;
    const childId = childToken.dataset.fieldId;
    if (!childId) return;
    const nested = normalizeTableCellTokenValue(
      childToken,
      readTokenValue(childToken),
      childToken.dataset.placeholder,
    );
    // Skip blank nested tokens so they don't erase dataset values for sibling columns.
    if (nested == null || nested === '') return;
    domValues[childId] = nested;
  });

  if (!Object.keys(domValues).length) return raw;
  return mergeRepeaterDomValues(raw, domValues, schema);
}

function readRepeaterTokenDatasetValue(token: any) {
  const raw = token.dataset.value;
  if (raw != null && raw !== '') {
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        /* fall through */
      }
    }
  }
  return {};
}

/**
 * Large data:/blob: image URLs exceed DOM/LWS data-attribute limits and throw.
 * Keep the real URL on the live <img> (and section fieldValues); dataset stores a compact stub.
 */
const DATASET_URL_MAX_CHARS = 2048;

/** fieldId → last known image value (survives empty data-value stubs during save/preview). */
const liveImageValuesByFieldId = new Map();

function isEmbeddedImageDatasetStub(value: any) {
  return !!(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.embedded === true &&
    typeof value.url === 'string'
  );
}

function readImageUrlFromToken(token: any) {
  const img = token?.querySelector?.('img.field-token__thumb');
  if (!img) return '';
  const src = String(img.getAttribute('src') || img.src || '').trim();
  if (!src || src.startsWith('about:')) return '';
  return src;
}

function rememberLiveImageValue(fieldId: any, value: any) {
  if (!fieldId) return;
  if (isImageValueEmpty(value)) {
    liveImageValuesByFieldId.delete(fieldId);
    return;
  }
  liveImageValuesByFieldId.set(fieldId, normalizeImageValue(value));
}

function resolveImageValueFromToken(token: any, parsed: any = null) {
  const fieldId = token?.dataset?.fieldId;
  const caption = parsed?.caption ?? '';
  const fromImg = readImageUrlFromToken(token);
  if (fromImg) {
    const value = { url: fromImg, caption };
    rememberLiveImageValue(fieldId, value);
    return value;
  }
  const fromMemory = fieldId ? liveImageValuesByFieldId.get(fieldId) : null;
  if (fromMemory && !isImageValueEmpty(fromMemory)) {
    return {
      url: fromMemory.url,
      caption: caption || fromMemory.caption || '',
    };
  }
  return { url: '', caption };
}

/**
 * Fill empty/stub image fieldValues from live thumbs (and the in-memory map).
 * Call after DOM extract / editor.save so HTML preview keeps uploaded images.
 */
export function recoverImageValuesFromDom(container: any, fieldValues: any = {}) {
  const next = fieldValues && typeof fieldValues === 'object' ? fieldValues : {};
  if (!container?.querySelectorAll) {
    for (const [fieldId, value] of liveImageValuesByFieldId.entries()) {
      if (isImageValueEmpty(next[fieldId])) next[fieldId] = { ...value };
    }
    return next;
  }

  container.querySelectorAll('.field-token').forEach((token: any) => {
    const fieldId = token.dataset?.fieldId;
    if (!fieldId) return;
    const hasImageUi =
      token.classList.contains('field-token--image') || !!token.querySelector('img.field-token__thumb');
    if (!hasImageUi && !liveImageValuesByFieldId.has(fieldId)) return;

    const recovered = resolveImageValueFromToken(token, normalizeImageValue(next[fieldId]));
    if (!isImageValueEmpty(recovered) && isImageValueEmpty(next[fieldId])) {
      next[fieldId] = recovered;
    } else if (!isImageValueEmpty(recovered)) {
      rememberLiveImageValue(fieldId, recovered);
      if (isImageValueEmpty(next[fieldId])) next[fieldId] = recovered;
    }
  });

  for (const [fieldId, value] of liveImageValuesByFieldId.entries()) {
    if (isImageValueEmpty(next[fieldId])) next[fieldId] = { ...value };
  }
  return next;
}

function toDatasetFieldValue(value: any) {
  if (value != null && typeof value === 'object' && !Array.isArray(value) && typeof value.url === 'string') {
    const url = String(value.url ?? '');
    if (url.startsWith('data:') || url.startsWith('blob:') || url.length > DATASET_URL_MAX_CHARS) {
      return JSON.stringify({
        url: '',
        caption: value.caption ?? '',
        embedded: true,
      });
    }
  }
  if (value != null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value ?? '');
}

function writeTokenDatasetValue(token: any, value: any) {
  try {
    // Normalize newline codes right before we persist the value into `data-value`.
    // This covers cases where value sanitization happens in some render paths
    // but downstream code (export / source view) relies on dataset storage.
    if (typeof value === 'string') {
      if (token.classList?.contains('field-token--html')) {
        value = normalizeHtmlEditorValue(value);
      } else {
        value = sanitizeTextFieldValue(value);
      }
    }
    token.dataset.value = toDatasetFieldValue(value);
  } catch (err) {
    try {
      delete token.dataset.value;
    } catch {
      /* ignore */
    }
    console.warn('[docengine] Could not store field value on token dataset', err);
  }
}

export function readTokenValue(token: any) {
  if (token.classList.contains('field-token--repeater')) {
    return readRepeaterTokenValue(token);
  }

  const raw = token.dataset.value;
  if (!raw && raw !== '0') {
    if (token.classList.contains('field-token--image') || token.querySelector?.('img.field-token__thumb')) {
      return resolveImageValueFromToken(token);
    }
    if (token.classList.contains('field-token--empty')) return '';
    const text = normalizeScalarTokenValue(readFieldTokenVisibleText(token).replace(/×$/, '').trim());
    if (isTableCellPlaceholderValue(token, text, token.dataset.placeholder)) return '';
    return text;
  }

  if (
    typeof raw === 'string' &&
    hasSuspiciousEncodingArtifacts(raw) &&
    !raw.startsWith('{') &&
    !raw.startsWith('[')
  ) {
    const visible = normalizeScalarTokenValue(readFieldTokenVisibleText(token).replace(/×$/, '').trim());
    if (
      typeof visible === 'string' &&
      visible &&
      !hasSuspiciousEncodingArtifacts(visible)
    ) {
      if (isTableCellPlaceholderValue(token, visible, token.dataset.placeholder)) return '';
      return visible;
    }
  }

  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      // Compact stub — recover real URL from live <img> / memory.
      if (
        isEmbeddedImageDatasetStub(parsed) ||
        (token.classList.contains('field-token--image') && isImageValueEmpty(parsed))
      ) {
        return resolveImageValueFromToken(token, parsed);
      }
      return parsed;
    } catch {
      return normalizeScalarTokenValue(raw);
    }
  }

  return normalizeScalarTokenValue(raw);
}

/**
 * Find a connected field token after async work that may have reinited the editor.
 * @param {string} fieldId
 * @param {ParentNode | null | undefined} root
 * @returns {HTMLElement | null}
 */
export function findLiveFieldToken(fieldId: any, root: any) {
  if (!fieldId || !root?.querySelector) return null;
  try {
    return root.querySelector(`.field-token[data-field-id="${CSS.escape(fieldId)}"]`);
  } catch {
    return null;
  }
}

function normalizeScalarTokenValue(value: any) {
  if (typeof value !== 'string') return value;
  return stripFieldTokenCaretAnchors(value);
}

function hasSuspiciousEncodingArtifacts(value: any) {
  if (typeof value !== 'string') return false;
  return value.includes('\uFFFD') || /Ã.|Â.|ï¿½/.test(value);
}

function sanitizeTextFieldValue(value: any) {
  if (typeof value !== 'string') return value;
  // Handle both real CR/LF and literal escaped sequences like "\\n\\r".
  return value
    .replace(/\\r\\n/g, '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/[\r\n]+/g, '');
}

function normalizeHtmlEditorValue(value: any) {
  if (typeof value !== 'string') return value;
  // Normalize escaped newline pairs first so \n\r or \r\n becomes a single break.
  let out = value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n\\r/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n');

  // If it looks like authored HTML, don't add additional <br> for *real* CR/LF
  // that may exist as formatting whitespace.
  if (/<\/?[a-z][\s\S]*>/i.test(out)) {
    return out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  // Plain text: convert real CR/LF to <br>.
  out = out.replace(/\r\n/g, '\n').replace(/\n\r/g, '\n').replace(/\r/g, '\n');
  return out.replace(/\n/g, '<br>');
}

export function textToFragment(text: any) {
  const fragment = document.createDocumentFragment();
  const parts = String(text).split('\n');

  parts.forEach((part: any, i: any) => {
    if (part) fragment.appendChild(document.createTextNode(part));
    if (i < parts.length - 1) fragment.appendChild(document.createElement('br'));
  });

  return fragment;
}

export function renderSegmentsToDom(segments: any, fieldValues: any, options: any = {}) {
  const fragment = document.createDocumentFragment();
  renderSegmentListInto(fragment, segments, fieldValues, options);
  return fragment;
}

function alignmentDivHasContent(div: any) {
  const text = (div.textContent ?? '').replace(/\u200B/g, '').trim();
  if (text) return true;
  return !!div.querySelector('img, table, ul, ol, li');
}

function renderSegmentListInto(parent: any, segments: any, fieldValues: any, options: any = {}) {
  const { designMode, previewMode, onEditSchema, onDeleteField, designPropertiesPanel } = options;
  // Preview may carry the previous section's table so a Totals columns block
  // in the next section can still sync to that table's last-column split.
  let lastTableSegForColumns: any = options.lastTableSegForColumns ?? null;

  function renderSegmentInto(target: any, seg: any) {
    if (seg.type === 'text') {
      if (seg.html) {
        appendHtmlToFragment(target, seg.html);
      } else {
        target.appendChild(textToFragment(seg.content ?? ''));
      }
      return;
    }

    if (seg.type === 'columns') {
      const useTableFallbackWidths = !!previewMode
        && !!lastTableSegForColumns
        && isTwoColumnSegment(seg)
        && (
          columnsNeedAutoWidths(seg) ||
          columnsHaveDefaultEvenSplit(seg.widths) ||
          Array.isArray(seg.widths)
        );
      const fallbackWidths = useTableFallbackWidths
        ? deriveColumnsWidthsFromTableSeg(lastTableSegForColumns, options)
        : null;
      const columnsSeg = fallbackWidths
        ? { ...seg, widths: fallbackWidths }
        : seg;
      target.appendChild(renderColumnsSegment(columnsSeg, fieldValues, options));
      lastTableSegForColumns = null;
      return;
    }

    if (seg.type === 'table') {
      target.appendChild(renderTableSegment(seg, fieldValues, options));
      lastTableSegForColumns = seg;
      return;
    }

    if ((seg.type === 'field' || seg.type === 'child') && seg.id) {
      const registry = resolveRegistry(options);
      const schema =
        registry?.getFieldSchemas()?.[seg.id] ??
        options.fieldSchemas?.[seg.id];
      let value = fieldValues[seg.id];
      if (value === undefined && schema?.type === 'child') {
        value = createInlineRepeaterSeedValue(schema);
        fieldValues[seg.id] = value;
      } else if (schema?.type === 'computed' && !designMode) {
        const schemas = registry?.getFieldSchemas() ?? options.fieldSchemas ?? {};
        const blocks = resolveBlocksFromContext(options);
        value = evaluateComputedField(seg.id, fieldValues, schemas, { blocks }).value;
        fieldValues[seg.id] = value;
      } else {
        const filled = resolveValueOrFillDefault(schema, value, {
          designMode: !!designMode,
        });
        if (filled !== value && !isFieldEmpty(filled, { schema })) {
          fieldValues[seg.id] = filled;
        }
        value = filled ?? '';
      }
      const def = resolveFieldDef(seg.id, options);
      const emptyOpts = {
        htmlEditor: !!def?.htmlEditor,
        repeaterSchema: schema?.type === 'child' ? schema : undefined,
      };
      const isRequired = !!(def?.required ?? schema?.required);
      // Optional empties can be omitted; required empties always render with a placeholder.
      if (
        previewMode &&
        options.hideEmptyValues === true &&
        !isRequired &&
        isFieldEmpty(value, emptyOpts)
      ) {
        return;
      }
      const label = getFieldDisplayLabel(seg.id, seg.placeholder, options);
      const token = createFieldToken(seg.id, value, label, options);
      if (previewMode) {
        token.classList.add('field-token--preview');
      } else if (designMode) {
        token.classList.add('field-token--design');
        attachDesignToken(token, seg.id, { onEditSchema, onDeleteField, designPropertiesPanel });
      }
      target.appendChild(token);
      if (!previewMode) {
        updateFieldToken(token, value, label, options);
      }
      ensureCaretAnchorAfter(token);
      lastTableSegForColumns = null;
      return;
    }

    lastTableSegForColumns = null;
  }

  let i = 0;
  while (i < segments.length) {
    const align = segments[i].align ?? null;
    let j = i + 1;
    while (j < segments.length && (segments[j].align ?? null) === align) {
      j += 1;
    }

    const group = segments.slice(i, j);
    if (align) {
      const div = document.createElement('div');
      div.className = `document-align document-align--${align}`;
      div.style.textAlign = align;
      for (const seg of group) renderSegmentInto(div, seg);
      if (alignmentDivHasContent(div)) {
        parent.appendChild(div);
      }
    } else {
      for (const seg of group) renderSegmentInto(parent, seg);
    }
    i = j;
  }

  if (typeof options.onLastTableSegForColumns === 'function') {
    options.onLastTableSegForColumns(lastTableSegForColumns);
  }

  return parent;
}

function renderColumnsSegment(seg: any, fieldValues: any, options: any = {}) {
  const { designMode, previewMode } = options;
  const wrapper = document.createElement('div');
  wrapper.className = 'document-columns';
  wrapper.contentEditable = 'false';
  const columnsId = seg.id ?? createColumnsId();
  wrapper.dataset.columnsId = columnsId;

  if (designMode) {
    const toolbar = document.createElement('div');
    toolbar.className = 'document-columns__toolbar';
    const dragHandle = createDragHandle({ dataset: { action: 'drag-columns' } });
    dragHandle.draggable = true;
    const label = document.createElement('span');
    label.className = 'document-columns__label';
    label.textContent = '2 columns';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'document-columns__delete';
    deleteBtn.dataset.action = 'delete-columns';
    deleteBtn.title = 'Remove columns';
    deleteBtn.textContent = '×';
    toolbar.appendChild(label);
    toolbar.appendChild(dragHandle);
    toolbar.appendChild(deleteBtn);
    wrapper.appendChild(toolbar);
  }

  const grid = document.createElement('div');
  grid.className = 'document-columns__grid';
  if (designMode) grid.classList.add('document-columns__grid--design');
  grid.style.gridTemplateColumns = resolveColumnGridTracks(seg.widths, { withSplitter: !!designMode });
  const w0 = sanitizeColumnWidth(seg.widths?.[0]);
  const w1 = sanitizeColumnWidth(seg.widths?.[1]);
  if (w0) wrapper.dataset.columnWidth0 = w0;
  if (w1) wrapper.dataset.columnWidth1 = w1;

  const columnSegs = seg.columns ?? [[], []];
  for (let colIndex = 0; colIndex < 2; colIndex++) {
    if (designMode && colIndex === 1) {
      const resizer = document.createElement('span');
      resizer.className = 'document-columns__col-resizer';
      resizer.dataset.colIndex = '0';
      resizer.contentEditable = 'false';
      resizer.title = 'Drag to resize columns';
      resizer.setAttribute('role', 'separator');
      resizer.setAttribute('aria-orientation', 'vertical');
      resizer.setAttribute('aria-label', 'Resize columns');
      grid.appendChild(resizer);
    }
    const col = document.createElement('div');
    col.className = 'document-columns__col';
    col.dataset.column = String(colIndex);
    if (!previewMode) {
      col.contentEditable = 'true';
      col.classList.add('cke_editable');
    }
    const colContent = document.createDocumentFragment();
    renderSegmentListInto(colContent, columnSegs[colIndex] ?? [], fieldValues, options);
    col.appendChild(colContent);
    grid.appendChild(col);
  }

  wrapper.appendChild(grid);
  return wrapper;
}

function renderTableSegment(seg: any, fieldValues: any, options: any = {}) {
  const { designMode, previewMode } = options;
  const tableSchema = getTableSchema(seg.id, options);

  if (tableSchema?.type === 'pivotTable') {
    return renderPivotTableSegment(seg, fieldValues, options);
  }

  const tableRows = resolveTableInstanceRows(seg.rows, tableSchema);
  const wrapper = document.createElement('div');
  wrapper.className = 'document-table';
  wrapper.contentEditable = 'false';
  wrapper.dataset.tableId = seg.id;
  syncTableRowsDataset(wrapper, tableRows);

  if (designMode) {
    const toolbar = document.createElement('div');
    toolbar.className = 'document-table__toolbar';
    const dragHandle = createDragHandle({ dataset: { action: 'drag-table' } });
    dragHandle.draggable = true;
    const label = document.createElement('span');
    label.className = 'document-table__label';
    label.textContent = 'Table';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'document-table__delete';
    deleteBtn.dataset.action = 'delete-table';
    deleteBtn.title = 'Remove table';
    deleteBtn.textContent = '×';
    toolbar.appendChild(label);
    toolbar.appendChild(dragHandle);
    toolbar.appendChild(deleteBtn);
    wrapper.appendChild(toolbar);
  }

  const tableOptions = {
    ...options,
    tableRows,
    tableContainer: null,
  };

  const tableEl = previewMode
    ? buildPreviewTableElement(seg.id, fieldValues, {
        ...tableOptions,
        fieldSchemas: options.fieldSchemas,
        previewContext: options,
      })
    : buildTableElement(seg.id, fieldValues, tableOptions);

  if (tableEl) {
    tableOptions.tableContainer = tableEl;
    wrapper.appendChild(tableEl);
    if (!previewMode) pruneTableCellCaretAnchors(tableEl);
  }

  if (!previewMode && !options.mappingMode && shouldShowTableRowActions(tableSchema, !!designMode)) {
    const actions = document.createElement('div');
    actions.className = 'document-table__row-actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'document-table__add-row';
    addBtn.dataset.action = 'add-table-row';
    addBtn.setAttribute('aria-label', 'Add row');
    addBtn.innerHTML = '<span class="document-table__add-row-icon" aria-hidden="true">+</span> Add row';
    const pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.className = 'document-table__add-row';
    pasteBtn.dataset.action = 'paste-table-rows';
    pasteBtn.setAttribute('aria-label', 'Paste rows from clipboard');
    pasteBtn.title = 'Paste rows from clipboard (one label per line)';
    pasteBtn.textContent = 'Paste rows';
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'document-table__add-row';
    importBtn.dataset.action = 'import-table-rows';
    importBtn.setAttribute('aria-label', 'Import rows from text file');
    importBtn.title = 'Import rows from a .txt file (one label per line)';
    importBtn.textContent = 'Import';
    const importFile = document.createElement('input');
    importFile.type = 'file';
    importFile.accept = '.txt,text/plain';
    importFile.hidden = true;
    importFile.dataset.role = 'import-table-rows-file';
    actions.appendChild(addBtn);
    actions.appendChild(pasteBtn);
    actions.appendChild(importBtn);
    actions.appendChild(importFile);
    wrapper.appendChild(actions);
  }

  return wrapper;
}

/**
 * Visible label/value text for a field token, excluding the design grip chrome.
 * Whole-token `draggable` would steal native text drag-and-drop and drop selected
 * text on failed moves — only the grip is draggable.
 */
function readFieldTokenVisibleText(token: any) {
  if (!token) return '';
  const parts: string[] = [];
  for (const child of token.childNodes ?? []) {
    if (child.nodeType === Node.ELEMENT_NODE && child.classList?.contains('editor-drag-handle')) {
      continue;
    }
    parts.push(child.textContent ?? '');
  }
  return parts.join('');
}

function ensureFieldTokenDragHandle(token: any) {
  if (!token || token.classList.contains('field-token--cell')) return null;
  let handle = token.querySelector?.(':scope > .editor-drag-handle') ?? null;
  if (!handle) {
    handle = createDragHandle({
      dataset: { action: 'drag-field' },
      hintTitle: null,
    });
    token.insertBefore(handle, token.firstChild);
  } else {
    // Drop legacy hover bubbles / native titles left on older design tokens.
    handle.querySelectorAll('.editor-drag-handle__hint').forEach((el: Element) => el.remove());
    handle.removeAttribute('title');
  }
  return handle;
}

function makeFieldTokenDraggable(token: any) {
  if (token.classList.contains('field-token--cell')) return;

  // Never make the whole token draggable — that breaks selecting/dragging
  // nearby prose (browser cuts the selection, then HTML5 DnD never pastes it).
  token.draggable = false;
  const handle = ensureFieldTokenDragHandle(token);
  if (!handle) return;

  handle.draggable = true;
  if (handle.dataset.fieldDragWired === 'true') return;
  handle.dataset.fieldDragWired = 'true';

  handle.addEventListener('dragstart', (e: any) => {
    e.stopPropagation();
    draggedFieldToken = token;
    token.classList.add('field-token--dragging');
    e.dataTransfer.effectAllowed = 'move';
    setInternalDragData(e, token.dataset.fieldId ?? 'field');
  });
  handle.addEventListener('dragend', () => {
    token.classList.remove('field-token--dragging');
    draggedFieldToken = null;
    clearDropIndicators();
    token
      .closest('.document-section__body, .document-columns__col')
      ?.classList.remove('document-section--drop-target');
  });
}

function attachDesignToken(token: any, fieldId: any, { onEditSchema, designPropertiesPanel }: any) {
  token.removeAttribute('title');

  token.addEventListener('click', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    const container = getFieldSelectionContainer(token);
    selectDesignToken(token, container, { additive: e.ctrlKey || e.metaKey });
    if (designPropertiesPanel && !e.ctrlKey && !e.metaKey) {
      onEditSchema?.(fieldId);
    }
  });

  token.addEventListener('dblclick', (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    onEditSchema?.(fieldId);
  });

  makeFieldTokenDraggable(token);
}

export function wireDesignFieldToken(token: any, { onEditSchema, onDeleteField, designPropertiesPanel }: any) {
  if (!token) return;
  token.classList.add('field-token--design');
  token.removeAttribute('title');
  if (token.dataset.designWired === 'true') {
    if (!token.classList.contains('field-token--cell')) {
      makeFieldTokenDraggable(token);
    }
    return;
  }
  token.dataset.designWired = 'true';
  attachDesignToken(token, token.dataset.fieldId, { onEditSchema, onDeleteField, designPropertiesPanel });
}

const BLOCK_HTML_TAG_RE = /<\/?(?:h[1-3]|div|p|ul|ol|li|table|tr|td|th)\b/i;
const INLINE_OPEN_TAG_RE = /^(?:<(?:b|i|u|span|font)\b[^>]*>)+/i;

function containsBlockHtml(html: any) {
  return BLOCK_HTML_TAG_RE.test(String(html ?? ''));
}

function htmlStartsWithStructuralBr(html: any) {
  return /^<br\s*\/?>/i.test(String(html ?? '').trim());
}

function htmlEndsWithStructuralBr(html: any) {
  return /<br\s*\/?>\s*$/i.test(String(html ?? '').trim());
}

function htmlStartsWithRowSeparator(html: any) {
  const trimmed = String(html ?? '').trim();
  if (/^\.(?:<br\s*\/?>|\n)/i.test(trimmed)) return true;
  const withoutInline = trimmed.replace(INLINE_OPEN_TAG_RE, '');
  return /^\.(?:<br\s*\/?>|\n)/i.test(withoutInline);
}

function canMergeAdjacentHtml(left: any, right: any) {
  if (!left || !right) return false;
  if (containsBlockHtml(left) || containsBlockHtml(right)) return false;
  if (htmlEndsWithStructuralBr(left) || htmlStartsWithStructuralBr(right)) return false;
  if (htmlStartsWithRowSeparator(right)) return false;
  if (/<\/(?:b|i|u|span|font)>\s*$/i.test(String(left).trim()) && htmlStartsWithRowSeparator(right)) {
    return false;
  }
  return true;
}

function mergeAdjacentText(parts: any) {
  const merged = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    const sameAlign = (last?.align ?? null) === (part.align ?? null);
    if (part.type === 'text' && last?.type === 'text' && sameAlign) {
      if (last.html != null || part.html != null) {
        if (last.html != null && part.content != null && !part.html) {
          merged.push({ ...part });
          continue;
        }
        if (last.content != null && !last.html && part.html != null) {
          merged.push({ ...part });
          continue;
        }
        if (last.html != null && part.html != null) {
          if (canMergeAdjacentHtml(last.html, part.html)) {
            last.html = last.html + part.html;
            delete last.content;
          } else {
            merged.push({ ...part });
          }
          continue;
        }
        const left = last.html ?? plainTextNewlinesToBr(escapeTextForHtml(last.content ?? ''));
        const right = part.html ?? plainTextNewlinesToBr(escapeTextForHtml(part.content ?? ''));
        last.html = left + right;
        delete last.content;
      } else {
        last.content = (last.content ?? '') + (part.content ?? '');
      }
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}

function escapeTextForHtml(text: any) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function containsFieldToken(node: any) {
  return node.nodeType === Node.ELEMENT_NODE && node.querySelector?.('.field-token') != null;
}

function isFieldTokenNode(node: any) {
  return node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('field-token');
}

function isColumnsNode(node: any) {
  return node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('document-columns');
}

let nextColumnsId = 0;

function createColumnsId() {
  nextColumnsId += 1;
  return `columns_${Date.now()}_${nextColumnsId}`;
}

function sanitizeColumnWidth(value: any) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length > 24) return '';
  if (!/^[\w%.(),\s-]+$/i.test(trimmed)) return '';
  return trimmed;
}

/** Middle track holds the design-mode column splitter (see `.document-columns__col-resizer`). */
const COLUMNS_SPLITTER_TRACK = '12px';

function resolveColumnGridTracks(widths: any, { withSplitter = false }: any = {}) {
  const w0 = sanitizeColumnWidth(widths?.[0]) || '1fr';
  const w1 = sanitizeColumnWidth(widths?.[1]) || '1fr';
  if (withSplitter) return `${w0} ${COLUMNS_SPLITTER_TRACK} ${w1}`;
  return `${w0} ${w1}`;
}

function parsePercentWidth(value: any) {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) : null;
}

function columnsNeedAutoWidths(seg: any) {
  if (seg?.type !== 'columns') return false;
  if (!Array.isArray(seg.widths) || seg.widths.length < 2) return true;
  const left = sanitizeColumnWidth(seg.widths[0]).toLowerCase();
  const right = sanitizeColumnWidth(seg.widths[1]).toLowerCase();
  return !left || !right;
}

function isTwoColumnSegment(seg: any) {
  return seg?.type === 'columns' && Array.isArray(seg.columns) && seg.columns.length === 2;
}

function columnsHaveDefaultEvenSplit(widths: any) {
  if (!Array.isArray(widths) || widths.length < 2) return false;
  const left = sanitizeColumnWidth(widths[0]).toLowerCase();
  const right = sanitizeColumnWidth(widths[1]).toLowerCase();
  if (!left || !right) return false;
  if (left === '1fr' && right === '1fr') return true;
  const leftPct = parsePercentWidth(left);
  const rightPct = parsePercentWidth(right);
  if (leftPct == null || rightPct == null) return false;
  return Math.abs(leftPct - 50) < 0.15 && Math.abs(rightPct - 50) < 0.15;
}

function deriveColumnsWidthsFromTableSeg(tableSeg: any, options: any = {}) {
  if (!tableSeg?.id) return null;
  const tableSchema = getTableSchema(tableSeg.id, options);
  const columns = tableSchema?.columns ?? [];
  if (columns.length < 2) return null;
  const scaled = scalePercentCssWidthsToFill(
    columns.map((col: any) => schemaWidthToColCss(col?.width)),
  );
  const percents = scaled.map(parsePercentWidth);
  if (percents.some((pct: any) => pct == null)) return null;
  const rightPct = percents[percents.length - 1];
  if (!(rightPct > 0 && rightPct < 100)) return null;
  const leftPct = Math.round((100 - rightPct) * 10) / 10;
  return [`${leftPct}%`, `${rightPct}%`];
}

export function createEmptyColumnsSegment(overrides: any = {}) {
  return {
    type: 'columns',
    id: createColumnsId(),
    columns: [[], []],
    ...overrides,
  };
}

export function applyColumnWidthsToElement(columnsEl: any, widths: any) {
  const grid = columnsEl?.querySelector?.(':scope > .document-columns__grid');
  if (!grid) return;
  const withSplitter = !!grid.querySelector(':scope > .document-columns__col-resizer');
  grid.style.gridTemplateColumns = resolveColumnGridTracks(widths, { withSplitter });
  const w0 = sanitizeColumnWidth(widths?.[0]);
  const w1 = sanitizeColumnWidth(widths?.[1]);
  if (w0) columnsEl.dataset.columnWidth0 = w0;
  else delete columnsEl.dataset.columnWidth0;
  if (w1) columnsEl.dataset.columnWidth1 = w1;
  else delete columnsEl.dataset.columnWidth1;
}

function readColumnsSegmentMeta(columnsEl: any) {
  const meta: any = {};
  const id = columnsEl.dataset.columnsId;
  if (id) meta.id = id;
  const w0 = columnsEl.dataset.columnWidth0;
  const w1 = columnsEl.dataset.columnWidth1;
  if (w0 || w1) {
    meta.widths = [w0 || undefined, w1 || undefined];
  }
  return meta;
}

function getDirectColumnEls(columnsEl: any) {
  // Must not use descendant querySelectorAll — nested columns also use
  // .document-columns__col and would steal the outer right column on save.
  return [
    ...(columnsEl?.querySelectorAll?.(':scope > .document-columns__grid > .document-columns__col') ??
      []),
  ];
}

function readColumnsSegmentFromDom(columnsEl: any) {
  const cols = getDirectColumnEls(columnsEl);
  return {
    type: 'columns',
    ...readColumnsSegmentMeta(columnsEl),
    columns: [
      cols[0] ? serializeEditableToSegments(cols[0]) : [],
      cols[1] ? serializeEditableToSegments(cols[1]) : [],
    ],
  };
}

function shouldInsertInsideColumn(sectionBody: any, anchor: any) {
  const col = anchor?.closest?.('.document-columns__col');
  return Boolean(col && sectionBody.contains(col));
}

function isTableNode(node: any) {
  return node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('document-table');
}

function isVisionTableBlockNode(node: any) {
  return node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('vision-table-block');
}

function readVisionTableIdFromBlock(node: any, options: any = {}) {
  const token = node.querySelector?.('.field-token[data-field-id]');
  if (token?.dataset?.fieldId) {
    const parsed = parseCellFieldId(token.dataset.fieldId, options.fieldSchemas);
    if (parsed?.tableFieldId) return parsed.tableFieldId;
  }
  return null;
}

function readVisionTableRowsFromLegacyBlock(node: any, tableId: any, options: any = {}) {
  const rows = readTableRowsFromDom(node);
  if (rows.length) return rows;
  const schema = getTableSchema(tableId, options);
  return (schema?.rows ?? []).map((row: any) => ({ key: row.key, label: row.label ?? '' }));
}

function isRepeaterNode(node: any) {
  return node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('document-repeater');
}

function isEditorBlockElement(node: any) {
  return (
    node?.nodeType === Node.ELEMENT_NODE &&
    (node.tagName === 'DIV' || node.tagName === 'P') &&
    !isAlignmentDiv(node) &&
    !isColumnsNode(node) &&
    !isTableNode(node) &&
    !isRepeaterNode(node) &&
    !isFieldTokenNode(node)
  );
}

function isTransparentBlockWrapper(node: any) {
  if (!isEditorBlockElement(node)) return false;
  if (containsFieldToken(node)) return false;
  for (const el of node.querySelectorAll('div, p, h1, h2, h3, ul, ol, li')) {
    if (el === node) continue;
    if (isAlignmentDiv(el) || isColumnsNode(el) || isTableNode(el) || isRepeaterNode(el)) continue;
    return false;
  }
  return true;
}

function isBrOnlyTransparentWrapper(node: any) {
  if (!isTransparentBlockWrapper(node)) return false;
  const text = stripFieldTokenCaretAnchors(node.textContent ?? '')
    .replace(/\u200B/g, '')
    .trim();
  if (text) return false;
  return node.querySelector('br') != null;
}

function isTopLevelLineBoundaryNode(node: any) {
  if (!node) return false;
  if (node.nodeName === 'BR') return true;
  if (isFieldTokenNode(node)) return true;
  if (isHeadingElement(node)) return true;
  if (isColumnsNode(node) || isTableNode(node) || isRepeaterNode(node)) return true;
  if (isAlignmentDiv(node)) return true;
  return false;
}

/** Flatten browser-created block wrappers so vertical caret navigation sees every line. */
export function normalizeEditableLineStructure(container: any) {
  if (!container?.childNodes?.length) return false;

  const wrappers = [...container.childNodes].filter((node) => isTransparentBlockWrapper(node));
  if (!wrappers.length) return false;

  const saved = saveSelection(container);

  for (const wrapper of wrappers) {
    if (!wrapper.isConnected) continue;

    if (isBrOnlyTransparentWrapper(wrapper)) {
      wrapper.replaceWith(document.createElement('br'));
      continue;
    }

    const prev = wrapper.previousSibling;
    const next = wrapper.nextSibling;
    const needsLeadingBr = prev != null && !isTopLevelLineBoundaryNode(prev);
    const needsTrailingBr = next != null && !isTopLevelLineBoundaryNode(next);

    const fragment = document.createDocumentFragment();
    if (needsLeadingBr) {
      fragment.appendChild(document.createElement('br'));
    }
    let lastMoved: ChildNode | null = null;
    while (wrapper.firstChild) {
      lastMoved = wrapper.firstChild;
      fragment.appendChild(wrapper.firstChild);
    }
    wrapper.replaceWith(fragment);

    if (needsTrailingBr && lastMoved?.nodeName !== 'BR') {
      lastMoved.after(document.createElement('br'));
    }
  }

  if (saved) restoreSelection(saved);
  return true;
}

export function serializeEditableToSegments(container: any) {
  const parts: any[] = [];
  const buffer = document.createElement('div');
  let bufferAlign: any = null;
  const fieldSchemas =
    getRegistryFromNode(container)?.getFieldSchemas?.() ??
    getRegistryFromNode(container.closest?.('[data-doc-editor]'))?.getFieldSchemas?.() ??
    {};
  const serializeOptions = { fieldSchemas };

  function emitBufferedText() {
    if (!buffer.childNodes.length) return;

    const html = buffer.innerHTML;
    const text = buffer.textContent ?? '';
    if (!text && !html.trim()) {
      buffer.innerHTML = '';
      bufferAlign = null;
      return;
    }

    if (isPlainTextHtml(html)) {
      const part: any = { type: 'text', content: stripFieldTokenCaretAnchors(text) };
      if (bufferAlign) part.align = bufferAlign;
      parts.push(part);
    } else {
      const part: any = { type: 'text', html: plainTextNewlinesToBr(sanitizeHtml(html)) };
      if (bufferAlign) part.align = bufferAlign;
      parts.push(part);
    }
    buffer.innerHTML = '';
    bufferAlign = null;
  }

  function flushBuffer() {
    if (!buffer.childNodes.length) return;

    if (buffer.querySelector('.field-token')) {
      const nodes = [...buffer.childNodes];
      buffer.innerHTML = '';
      for (const node of nodes) {
        if (isFieldTokenNode(node)) {
          emitBufferedText();
          const part: any = {
            type: 'field',
            id: (node as any).dataset.fieldId,
            placeholder: (node as any).dataset.placeholder || undefined,
          };
          if (bufferAlign) part.align = bufferAlign;
          parts.push(part);
          continue;
        }
        buffer.appendChild(node);
      }
    }

    emitBufferedText();
  }

  function walk(node: any, activeAlign: any = null) {
    const children = [...node.childNodes];
    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci];
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        child.classList?.contains('document-columns__col-resizer')
      ) {
        continue;
      }
      if (isFieldTokenNode(child)) {
        flushBuffer();
        const part: any = {
          type: 'field',
          id: child.dataset.fieldId,
          placeholder: child.dataset.placeholder || undefined,
        };
        if (activeAlign) part.align = activeAlign;
        parts.push(part);
      } else if (isAlignmentDiv(child)) {
        flushBuffer();
        const align = getBlockTextAlign(child.getAttribute('style') || '');
        walk(child, align);
        flushBuffer();
      } else if (child.nodeName === 'BR') {
        flushBuffer();
        const part: any = { type: 'text', content: '\n' };
        if (activeAlign) part.align = activeAlign;
        parts.push(part);
      } else if (isColumnsNode(child)) {
        flushBuffer();
        parts.push(readColumnsSegmentFromDom(child));
      } else if (isTableNode(child)) {
        flushBuffer();
        const rows = readTableRowsFromDom(child);
        const tablePart: any = {
          type: 'table',
          id: child.dataset.tableId,
        };
        if (rows.length) tablePart.rows = rows;
        parts.push(tablePart);
      } else if (isVisionTableBlockNode(child)) {
        flushBuffer();
        const tableId = readVisionTableIdFromBlock(child, serializeOptions);
        if (tableId) {
          const rows = readVisionTableRowsFromLegacyBlock(child, tableId, serializeOptions);
          const tablePart: any = { type: 'table', id: tableId };
          if (rows.length) tablePart.rows = rows;
          parts.push(tablePart);
        }
      } else if (isRepeaterNode(child)) {
        flushBuffer();
        parts.push({
          type: 'field',
          id: child.dataset.repeaterId,
        });
      } else if (isHeadingElement(child)) {
        flushBuffer();
        if (activeAlign) bufferAlign = activeAlign;
        buffer.appendChild(child.cloneNode(true));
        flushBuffer();
      } else if (isBrOnlyTransparentWrapper(child)) {
        flushBuffer();
        const part: any = { type: 'text', content: '\n' };
        if (activeAlign) part.align = activeAlign;
        parts.push(part);
      } else if (isTransparentBlockWrapper(child)) {
        walk(child, activeAlign);
      } else if (isEditorBlockElement(child)) {
        flushBuffer();
        walk(child, activeAlign);
        flushBuffer();
      } else if (containsFieldToken(child)) {
        flushBuffer();
        walk(child, activeAlign);
      } else {
        if (activeAlign) bufferAlign = activeAlign;
        buffer.appendChild(child.cloneNode(true));
      }
    }
  }

  walk(container);
  flushBuffer();
  return mergeAdjacentText(parts);
}

export function extractFieldValuesFromDom(container: any) {
  const values: Record<string, any> = {};
  container.querySelectorAll('.field-token').forEach((token: any) => {
    if (
      token.closest('.field-token--repeater') &&
      !token.classList.contains('field-token--repeater')
    ) {
      return;
    }
    let value = token.classList.contains('field-token--repeater')
      ? readRepeaterTokenValue(token)
      : readTokenValue(token);
    value = normalizeTableCellTokenValue(token, value, token.dataset.placeholder);
    values[token.dataset.fieldId] = value;
  });
  container.querySelectorAll('.document-table--pivot[data-pivot-field-id]').forEach((el: any) => {
    const fieldId = el.dataset.pivotFieldId;
    if (!fieldId) return;
    values[fieldId] = readPivotValueFromDom(el);
  });
  return values;
}

function resolvePickerInitialValue(currentValue: any, fieldId: any, context: any) {
  const registry = registryFrom(context);
  const schema = registry?.getFieldSchemas()?.[fieldId];
  const def = registry?.getFieldDef(fieldId) ?? schemaToDisplayConfig(schema);
  if (!isFieldEmpty(currentValue, { htmlEditor: !!def?.htmlEditor })) return currentValue;
  return resolveSchemaDefaultValue(schema, { forTemplate: false });
}

function toListPickerSelected(value: any) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function extractFieldValuesForPicker(fieldId: any, callbacks: any) {
  const holder = callbacks?.editorHolder;
  if (!holder?.querySelectorAll) return {};

  for (const editable of holder.querySelectorAll('.document-section__body')) {
    if (editable.querySelector(`[data-field-id="${fieldId}"]`)) {
      return extractFieldValuesFromDom(editable);
    }
  }

  const values = {};
  for (const editable of holder.querySelectorAll('.document-section__body')) {
    Object.assign(values, extractFieldValuesFromDom(editable));
  }
  return values;
}

function buildRemoteListSearch(fieldId: any, schema: any, callbacks: any, selected: any) {
  const resolveListItems = callbacks?.resolveListItems;
  if (!resolveListItems) {
    return {
      search: async () => {
        throw new Error('resolveListItems is not configured on createEditor()');
      },
    };
  }

  return {
    search: async (query: any) => {
      const liveSchema =
        callbacks?.getRegistry?.()?.getFieldSchemas?.()?.[fieldId] ?? schema;
      const fieldName = String(
        liveSchema?.name ?? liveSchema?.label ?? schema?.name ?? fieldId ?? '',
      ).trim();
      const sourceCollection = String(liveSchema?.sourceCollection ?? '').trim();

      const raw = await resolveListItems({
        fieldName,
        schema: liveSchema,
        sourceCollection: sourceCollection || undefined,
        fieldValues: extractFieldValuesForPicker(fieldId, callbacks),
        query,
        selected,
      });
      const items = Array.isArray(raw) ? raw : [];
      // Normalize Apex / host payloads to picker shape.
      return items
        .map((item) => {
          if (item == null || typeof item !== 'object') return null;
          const label = item.label ?? item.Name ?? item.name ?? item.value ?? '';
          const id = item.id ?? item.Id ?? item.value ?? label;
          if (!label && !id) return null;
          return {
            id: String(id),
            label: String(label || id),
            value: item.value != null ? String(item.value) : String(label || id),
            code: item.code != null ? String(item.code) : undefined,
          };
        })
        .filter(Boolean);
    },
  };
}

async function pickWithManualEdit({ schema, currentValue, schemaType, openStructured }: any) {
  const manualEdit = !!schema?.allowManualEdit;
  if (manualEdit) {
    return openStructured({
      allowManualEdit: true,
      initialText: formatManualEditText(currentValue, schemaType),
    });
  }

  return openStructured({ allowManualEdit: false });
}

/** Coerce stored logical values to boolean or null. */
export function normalizeLogicalValue(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

/** Inline fill-mode cycle: empty → Yes, then Yes ↔ No. */
export function cycleLogicalValue(value: unknown): boolean {
  const current = normalizeLogicalValue(value);
  if (current !== true && current !== false) return true;
  return !current;
}

export async function openFieldPicker(fieldId: any, currentValue: any, callbacks: any) {
  const registry = registryFrom(callbacks);
  const def = registry?.getFieldDef(fieldId);
  if (!def || !callbacks) return currentValue;

  if (def.picker === 'computed') return currentValue;

  const schema = registry?.getFieldSchemas()?.[fieldId];
  if (!isFieldEditableInFillMode(schema, {
    fieldId,
    fieldSchemas: registry?.getFieldSchemas?.() ?? callbacks.fieldSchemas,
  })) return currentValue;
  if (def?.picker === 'child' || schema?.type === 'child') {
    if (callbacks.openRepeaterEditor) {
      return callbacks.openRepeaterEditor({
        fieldId,
        value: currentValue,
        title: schema?.label ?? def?.label ?? fieldId,
      });
    }
    return currentValue;
  }

  const {
    openTreePicker,
    openListPicker,
    openTextPicker,
    openHtmlTextPicker,
    openIntegerPicker,
    openSignaturePicker,
    openImagePicker,
    openDatePicker,
  } = callbacks;

  if (def.picker === 'logical' || schema?.type === 'logical') {
    const initial = resolvePickerInitialValue(currentValue, fieldId, callbacks);
    return cycleLogicalValue(initial);
  }

  if (def.picker === 'integer' && openIntegerPicker) {
    const initial = resolvePickerInitialValue(currentValue, fieldId, callbacks);
    return openIntegerPicker({
      title: def.label,
      value: initial ?? '',
      min: def.min ?? 0,
      max: def.max ?? 999,
    });
  }

  if (def.picker === 'text' && (openTextPicker || openHtmlTextPicker)) {
    const initial = resolvePickerInitialValue(currentValue, fieldId, callbacks);
    const isDefault = isFieldEmpty(currentValue, { htmlEditor: !!def?.htmlEditor });
    const opts = {
      title: def.label,
      value: String(initial ?? ''),
      placeholder: def.defaultText ?? '',
      selectAll: isDefault,
    };
    if (def.htmlEditor && openHtmlTextPicker) {
      return openHtmlTextPicker(opts);
    }
    if (openTextPicker) {
      return openTextPicker(opts);
    }
  }

  if (def.picker === 'signature' && openSignaturePicker) {
    const initial = resolvePickerInitialValue(currentValue, fieldId, callbacks);
    return openSignaturePicker({
      title: def.label,
      value: normalizeImageValue(initial).url,
    });
  }

  if (def.picker === 'image' && openImagePicker) {
    return openImagePicker({
      title: def.label,
      value: normalizeImageValue(currentValue),
    });
  }

  if (def.picker === 'date' && openDatePicker) {
    const initial = resolvePickerInitialValue(currentValue, fieldId, callbacks);
    return openDatePicker({
      title: def.label,
      value: String(initial ?? ''),
    });
  }

  if (def.picker === 'tree' && openTreePicker) {
    const initial = resolvePickerInitialValue(currentValue, fieldId, callbacks);
    return pickWithManualEdit({
      def,
      schema,
      fieldId,
      currentValue: initial,
      schemaType: 'tree',
      openStructured: ({ allowManualEdit: manualEdit, initialText = '' }: any) =>
        openTreePicker({
          title: def.label,
          tree: def.tree,
          selected: toListPickerSelected(initial),
          allowManualEdit: manualEdit,
          initialText,
        }),
    });
  }

  if (def.picker === 'list' && openListPicker) {
    const initial = resolvePickerInitialValue(currentValue, fieldId, callbacks);
    const schema = registry.getFieldSchemas()?.[fieldId];
    const remoteSchema = { ...def, ...(schema || {}) };
    const isRemote = remoteSchema.listSource === 'remote'
      || Boolean(String(remoteSchema.sourceCollection ?? '').trim());
    const isMulti = def.multi !== false;
    const schemaType = def.schemaType === 'choice' ? 'choice' : 'list';

    const result = await pickWithManualEdit({
      def,
      schema,
      fieldId,
      currentValue: initial,
      schemaType,
      openStructured: ({ allowManualEdit: manualEdit, initialText = '' }: any) =>
        openListPicker({
          title: def.label,
          items: isRemote ? [] : (def.items ?? []),
          selected: isMulti ? toListPickerSelected(initial) : (toListPickerSelected(initial)[0] ?? ''),
          withCode: def.withCode ?? false,
          multi: isMulti,
          allowManualEdit: manualEdit,
          initialText,
          remoteSearch: isRemote
            ? buildRemoteListSearch(fieldId, remoteSchema, callbacks, toListPickerSelected(initial))
            : undefined,
        }),
    });

    if (isMulti) return result;
    return Array.isArray(result) ? (result[0] ?? '') : result;
  }

  return currentValue;
}

export function focusCaretAtEnd(editable: any) {
  if (!editable?.isConnected) return;
  try {
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // editable may have been removed from the document
  }
}

export function focusCaretAfter(node: any) {
  if (!node?.isConnected) return;
  try {
    const anchor = ensureCaretAnchorAfter(node);
    if (anchor) {
      focusCaretAtFieldBridge(anchor);
      return;
    }

    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // node may have been removed from the document
  }
}

function rangeIntersectsSelector(range: any, editable: any, selector: any) {
  if (!range || !editable?.querySelectorAll) return false;
  for (const el of editable.querySelectorAll(selector)) {
    if (typeof range.intersectsNode === 'function') {
      if (range.intersectsNode(el)) return true;
      continue;
    }
    let ancestor = range.commonAncestorContainer;
    if (ancestor?.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentNode;
    if (ancestor?.contains?.(el)) return true;
  }
  return false;
}

function rangeToPlainText(range: any) {
  if (!range) return '';
  try {
    const direct = typeof range.toString === 'function' ? String(range.toString()) : '';
    if (direct.trim()) return direct;
  } catch {
    // linkedom / incomplete Range
  }
  try {
    const frag = range.cloneContents?.();
    if (frag) return String(frag.textContent ?? '');
  } catch {
    // ignore
  }
  return '';
}

/**
 * Plain text from a non-collapsed selection inside `editable`, suitable for
 * field name/label when converting selected text into a field.
 * Returns '' when collapsed, outside editable, or intersecting field tokens / tables.
 */
export function resolveSelectedTextForFieldConversion(editable: any, range: any = null) {
  let activeRange = range;
  if (!activeRange) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return '';
    activeRange = sel.getRangeAt(0);
  }
  if (!activeRange || activeRange.collapsed) return '';
  if (!editable?.contains?.(activeRange.commonAncestorContainer)) return '';
  if (rangeIntersectsSelector(activeRange, editable, '.field-token')) return '';
  if (rangeIntersectsSelector(activeRange, editable, '.document-table')) return '';

  const fromRange = rangeToPlainText(activeRange).trim();
  if (fromRange) return fromRange;

  const sel = window.getSelection();
  const fromSel = typeof sel?.toString === 'function' ? String(sel.toString()) : '';
  return fromSel.trim();
}

export async function insertInlineField(editable: any, fieldType: any, options: any = {}) {
  if (fieldType === 'table') {
    throw new Error(`${fieldType} must be inserted as a block, not an inline field.`);
  }
  const { designMode, onEditSchema, onDeleteField, openEditor = true, designPropertiesPanel } = options;
  const registry = registryFrom(options) ?? getRegistryFromNode(editable);
  const registryCtx = registry ? { getRegistry: () => registry } : options;

  // Capture before focus/async work can collapse the selection.
  const savedRange = options.savedRange ?? saveSelection(editable);
  const preferredLabel =
    (typeof options.preferredLabel === 'string' && options.preferredLabel.trim()) ||
    resolveSelectedTextForFieldConversion(editable, savedRange) ||
    '';
  const { label: defaultLabel } = createDefaultBlockData(fieldType);
  const label = preferredLabel || defaultLabel;

  const schema = createDefaultSchema(fieldType, label, label);
  const { fieldId, fieldName } = allocateFieldIdentity(editable, registry, schema.name as string);
  schema.name = fieldName;
  registry?.updateFieldSchema(fieldId, schema);

  // Restore the original range so insert replaces selected text with the field.
  if (savedRange && !savedRange.collapsed && preferredLabel) {
    restoreSelection(savedRange);
  }

  const initialValue = fieldType === 'child' ? createInlineRepeaterSeedValue(schema) : '';
  const token = insertFieldAtCaret(editable, fieldId, schema.label, registryCtx, initialValue);
  if (designMode) {
    wireDesignFieldToken(token, { onEditSchema, onDeleteField, designPropertiesPanel });
  }

  if (onEditSchema && openEditor) {
    await onEditSchema(fieldId);
  }

  const fieldLabel = registry?.getFieldSchemas()?.[fieldId]?.label || schema.label;
  updateFieldToken(token, initialValue, fieldLabel, registryCtx);

  return { fieldId, token, schema };
}

export function insertFieldAtCaret(editable: any, fieldId: any, placeholder: any, context: any, initialValue: any = '') {
  const token = createFieldToken(fieldId, initialValue, placeholder, context);
  token.classList.add('field-token--design');
  insertFieldTokenAtCaret(editable, token);
  updateFieldToken(token, initialValue, placeholder, context);
  return token;
}

export function insertLineBreakAtCaret(editable: any) {
  const br = document.createElement('br');
  const sel = window.getSelection();

  if (!sel?.rangeCount || !editable.contains(sel.anchorNode)) {
    editable.appendChild(br);
    ensureTrailingLineBreak(br);
    focusCaretAfter(br);
    return br;
  }

  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(br);
  ensureTrailingLineBreak(br);
  focusCaretAfter(br);
  return br;
}

/**
 * Insert clipboard/plain text at the caret as text + `<br>` lines
 * (same structure as Enter in design mode — not browser `<div>` blocks).
 */
export function insertPlainTextAtCaret(editable: any, text: any) {
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!normalized) return null;

  const fragment = textToFragment(normalized);
  if (!fragment.childNodes.length) return null;

  const sel = window.getSelection();
  if (!sel?.rangeCount || !editable.contains(sel.anchorNode)) {
    const last = fragment.lastChild;
    editable.appendChild(fragment);
    if (last?.nodeName === 'BR') ensureTrailingLineBreak(last);
    if (last) focusCaretAfter(last);
    return last;
  }

  const range = sel.getRangeAt(0);
  if (range.startContainer?.parentElement?.closest?.('.field-token')) {
    return null;
  }

  range.deleteContents();
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last?.nodeName === 'BR') ensureTrailingLineBreak(last);
  if (last) focusCaretAfter(last);
  return last;
}

/** Browsers won't show a caret on a new line after a lone trailing `<br>`. */
function ensureTrailingLineBreak(br: any) {
  if (!br.nextSibling) {
    br.after(document.createElement('br'));
  }
}

export function insertFieldTokenAtCaret(editable: any, token: any) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !editable.contains(sel.anchorNode)) {
    editable.appendChild(token);
    ensureFieldTokenCaretAnchors(editable);
    focusCaretAfter(token);
    return token;
  }

  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(token);
  ensureFieldTokenCaretAnchors(editable);
  focusCaretAfter(token);
  return token;
}

function insertBlockAtCaret(sectionBody: any, node: any) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sectionBody.contains(sel.anchorNode)) {
    sectionBody.appendChild(node);
    focusCaretAfter(node);
    return node;
  }

  const range = sel.getRangeAt(0);
  const anchor =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;

  if (shouldInsertInsideColumn(sectionBody, anchor)) {
    range.deleteContents();
    range.insertNode(node);
    focusCaretAfter(node);
    return node;
  }

  const enclosingColumns = (anchor as any)?.closest?.('.document-columns');
  const enclosingTable = (anchor as any)?.closest?.('.document-table');

  if (enclosingColumns && sectionBody.contains(enclosingColumns)) {
    enclosingColumns.insertAdjacentElement('afterend', node);
    focusCaretAfter(node);
    return node;
  }

  if (enclosingTable && sectionBody.contains(enclosingTable)) {
    enclosingTable.insertAdjacentElement('afterend', node);
    focusCaretAfter(node);
    return node;
  }

  range.deleteContents();
  range.insertNode(node);
  focusCaretAfter(node);
  return node;
}

export function insertColumnsAtCaret(sectionBody: any, options: any = {}) {
  const columnsEl = renderColumnsSegment(createEmptyColumnsSegment(), {}, options);
  insertBlockAtCaret(sectionBody, columnsEl);
  wireColumnBlockRegions(sectionBody, options);
  return columnsEl;
}

function placeNodeAtPoint(sectionBody: any, node: any, clientX: any, clientY: any) {
  const editableRoot = resolveFieldEditableRoot(sectionBody, clientX, clientY);
  const target = resolveInlineDropTarget(editableRoot, null, clientX, clientY);
  if (target) {
    return applyInlineDropTarget(editableRoot, node, target);
  }
  editableRoot.appendChild(node);
  ensureFieldTokenCaretAnchors(editableRoot);
  focusCaretAfter(node);
  return true;
}

export async function insertPaletteFieldAtPoint(editable: any, fieldType: any, clientX: any, clientY: any, options: any = {}) {
  if (fieldType === 'table') {
    return insertPaletteTableAtPoint(editable, clientX, clientY, options);
  }
  const { designMode, onEditSchema, onDeleteField, openEditor = true, designPropertiesPanel } = options;
  const registry = registryFrom(options) ?? getRegistryFromNode(editable);
  const registryCtx = registry ? { getRegistry: () => registry } : options;
  const { label } = createDefaultBlockData(fieldType);
  const schema = createDefaultSchema(fieldType, label, label);
  const { fieldId, fieldName } = allocateFieldIdentity(editable, registry, schema.name as string);
  schema.name = fieldName;
  registry?.updateFieldSchema(fieldId, schema);

  const initialValue = fieldType === 'child' ? createInlineRepeaterSeedValue(schema) : '';
  const token = createFieldToken(fieldId, initialValue, schema.label, registryCtx);
  token.classList.add('field-token--design');
  placeNodeAtPoint(editable, token, clientX, clientY);

  if (designMode) {
    wireDesignFieldToken(token, { onEditSchema, onDeleteField, designPropertiesPanel });
  }

  if (onEditSchema && openEditor) {
    await onEditSchema(fieldId);
  }

  const fieldLabel = registry?.getFieldSchemas()?.[fieldId]?.label || schema.label;
  updateFieldToken(token, initialValue, fieldLabel, registryCtx);

  return { fieldId, token, schema };
}

export function insertColumnsAtPoint(sectionBody: any, clientX: any, clientY: any, options: any = {}) {
  const columnsEl = renderColumnsSegment(createEmptyColumnsSegment(), {}, options);
  placeNodeAtPoint(sectionBody, columnsEl, clientX, clientY);
  wireColumnBlockRegions(sectionBody, options);
  sectionBody.dispatchEvent(new InputEvent('input', { bubbles: true }));
  return columnsEl;
}

export async function insertPaletteTableAtPoint(sectionBody: any, clientX: any, clientY: any, options: any = {}) {
  const registry = registryFrom(options);
  const fieldType = options.fieldType === 'pivotTable' ? 'pivotTable' : 'table';
  const defaultLabel = fieldType === 'pivotTable' ? 'Pivot Table' : 'Table';
  const schema = createDefaultSchema(fieldType, defaultLabel, defaultLabel);
  const { fieldId, fieldName } = allocateFieldIdentity(sectionBody, registry, schema.name as string);
  schema.name = fieldName;
  registry?.updateFieldSchema(fieldId, schema);

  let seedRows: Array<{ key: string; label: string }> | undefined;
  if (fieldType === 'table') {
    seedRows = [{ key: 'row1', label: '' }];
    const merged = ensureCellSchemasForRows(schema, fieldId, registry?.getFieldSchemas() ?? {}, seedRows);
    registry?.setFieldSchemas?.(merged);
  }

  const tableEl = renderTableSegment(
    { type: 'table', id: fieldId, rows: seedRows },
    {},
    options,
  );
  placeNodeAtPoint(sectionBody, tableEl, clientX, clientY);
  wireTableRegions(sectionBody, options);
  sectionBody.dispatchEvent(new InputEvent('input', { bubbles: true }));

  const { onEditSchema, openEditor = true } = options;
  if (onEditSchema && openEditor) {
    await onEditSchema(fieldId);
  }

  return { fieldId, tableEl };
}

export async function insertPaletteRepeaterAtPoint(sectionBody: any, clientX: any, clientY: any, options: any = {}) {
  return insertPaletteFieldAtPoint(sectionBody, 'child', clientX, clientY, options);
}

export async function insertRepeaterAtCaret(sectionBody: any, options: any = {}) {
  return insertInlineField(sectionBody, 'child', options);
}

function isPaletteDragEvent(e: any) {
  return isPaletteDragSessionActive() || e.dataTransfer?.types?.includes?.(PALETTE_DRAG_MIME);
}

function wirePaletteDropGuard(element: any) {
  if (!element || element.dataset.paletteDropGuardWired === 'true') return;
  element.dataset.paletteDropGuardWired = 'true';

  element.addEventListener(
    'beforeinput',
    (e: any) => {
      if (e.inputType !== 'insertFromDrop') return;
      if (!isInternalDragActive() && !isPaletteDragSessionActive()) return;
      e.preventDefault();
    },
    true,
  );
}

export function insertTableAtCaret(sectionBody: any, options: any = {}) {
  const registry = registryFrom(options);
  const fieldType = options.fieldType === 'pivotTable' ? 'pivotTable' : 'table';
  const defaultLabel = fieldType === 'pivotTable' ? 'Pivot Table' : 'Table';
  const schema = createDefaultSchema(fieldType, defaultLabel, defaultLabel);
  const { fieldId, fieldName } = allocateFieldIdentity(sectionBody, registry, schema.name as string);
  schema.name = fieldName;
  registry?.updateFieldSchema(fieldId, schema);

  let seedRows: Array<{ key: string; label: string }> | undefined;
  if (fieldType === 'table') {
    seedRows = [{ key: 'row1', label: '' }];
    const merged = ensureCellSchemasForRows(schema, fieldId, registry?.getFieldSchemas() ?? {}, seedRows);
    registry?.setFieldSchemas?.(merged);
  }

  const tableEl = renderTableSegment(
    { type: 'table', id: fieldId, rows: seedRows },
    {},
    options,
  );
  insertBlockAtCaret(sectionBody, tableEl);
  return { fieldId, tableEl };
}

function ensureToolbarDragHandle(blockEl: any, action: any) {
  const toolbar = blockEl?.querySelector?.(
    action === 'drag-table' ? ':scope > .document-table__toolbar' : ':scope > .document-columns__toolbar',
  );
  const handle = blockEl?.querySelector?.(`[data-action="${action}"]`);
  if (!toolbar || !handle) return handle;

  if (handle.parentElement !== toolbar) {
    const deleteBtn = toolbar.querySelector(
      action === 'drag-table' ? '[data-action="delete-table"]' : '[data-action="delete-columns"]',
    );
    if (deleteBtn) toolbar.insertBefore(handle, deleteBtn);
    else toolbar.appendChild(handle);
  } else {
    const deleteBtn = toolbar.querySelector(
      action === 'drag-table' ? '[data-action="delete-table"]' : '[data-action="delete-columns"]',
    );
    if (deleteBtn && handle.nextElementSibling !== deleteBtn) {
      toolbar.insertBefore(handle, deleteBtn);
    }
  }

  return handle;
}

function removeOwnedSchemasFromDomSubtree(root: any, options: any = {}) {
  const registry = resolveRegistry(options);
  if (!registry || !root?.querySelectorAll) return;

  const next = { ...registry.getFieldSchemas() };
  let changed = false;

  const tableIds = new Set<string>();
  root.querySelectorAll('.document-table[data-table-id]').forEach((el: any) => {
    if (el.dataset.tableId) tableIds.add(el.dataset.tableId);
  });
  if (root.classList?.contains('document-table') && root.dataset?.tableId) {
    tableIds.add(root.dataset.tableId);
  }

  for (const tableId of tableIds) {
    if (next[tableId]) {
      delete next[tableId];
      changed = true;
    }
    const prefix = `${tableId}_`;
    for (const key of Object.keys(next)) {
      if (!key.startsWith(prefix)) continue;
      delete next[key];
      changed = true;
    }
  }

  root.querySelectorAll('.field-token[data-field-id]:not(.field-token--cell)').forEach((token: any) => {
    const fieldId = token.dataset.fieldId;
    if (!fieldId || tableIds.has(fieldId) || !next[fieldId]) return;
    delete next[fieldId];
    changed = true;
  });

  if (!changed) return;
  registry.setFieldSchemas(next);
  options.onSchemaChange?.(next);
}
let draggedTableEl: any = null;
let draggedColumnsEl: any = null;
let draggedFieldToken: any = null;

const INTERNAL_DRAG_MIME = 'application/x-doc-editor-dnd';
const DROP_INDICATOR_SELECTOR =
  '.field-token--design.is-drop-before, .field-token--design.is-drop-after, .document-table.is-drop-after, .document-columns.is-drop-after';

let dropCaretEl: any = null;

function isInternalDragActive() {
  return Boolean(draggedTableEl || draggedColumnsEl || draggedFieldToken);
}

function setInternalDragData(e: any, payload: any) {
  e.dataTransfer.setData(INTERNAL_DRAG_MIME, payload);
  e.dataTransfer.setData('text/plain', '');
}

function caretRangeFromPoint(clientX: any, clientY: any) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(clientX, clientY);
  }
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

function dropAnchorFromRange(range: any) {
  if (!range) return null;
  return range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer;
}

function resolveInlineDropTarget(editableRoot: any, draggedEl: any, clientX: any, clientY: any) {
  const range = caretRangeFromPoint(clientX, clientY);
  const dropAnchor = dropAnchorFromRange(range);

  const anchorInside =
    (dropAnchor && editableRoot.contains(dropAnchor)) ||
    (range && editableRoot.contains(range.commonAncestorContainer));

  if (!anchorInside) {
    // Pointer is over this section (header/chrome/padding) but not a caret position —
    // still allow a drop at the end so cross-section moves work reliably.
    const rect = editableRoot.getBoundingClientRect?.();
    if (
      rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return { mode: 'append' };
    }

    const section = editableRoot.closest?.('.document-section');
    const sectionRect = section?.getBoundingClientRect?.();
    if (
      sectionRect &&
      clientX >= sectionRect.left &&
      clientX <= sectionRect.right &&
      clientY >= sectionRect.top &&
      clientY <= sectionRect.bottom
    ) {
      return { mode: 'append' };
    }

    return null;
  }

  if (draggedEl && (draggedEl === dropAnchor || draggedEl.contains(dropAnchor))) {
    return null;
  }

  const enclosingTable = dropAnchor.closest?.('.document-table');
  if (enclosingTable && editableRoot.contains(enclosingTable) && enclosingTable !== draggedEl) {
    return { mode: 'after', element: enclosingTable };
  }

  const enclosingColumns = dropAnchor.closest?.('.document-columns');
  if (enclosingColumns && editableRoot.contains(enclosingColumns) && enclosingColumns !== draggedEl) {
    return { mode: 'after', element: enclosingColumns };
  }

  const enclosingToken = dropAnchor.closest?.('.field-token');
  if (enclosingToken && enclosingToken !== draggedEl && editableRoot.contains(enclosingToken)) {
    const rect = enclosingToken.getBoundingClientRect();
    const offset = clientY - rect.top;
    const zone = rect.height * 0.25;
    if (offset < zone) {
      return { mode: 'before', element: enclosingToken };
    }
    return { mode: 'after', element: enclosingToken };
  }

  if (!range) {
    return { mode: 'append' };
  }

  const cloned = range.cloneRange();
  cloned.collapse(true);
  return { mode: 'range', range: cloned };
}

function applyInlineDropTarget(editableRoot: any, node: any, target: any) {
  if (!target) return false;

  if (target.mode === 'append') {
    editableRoot.appendChild(node);
  } else if (target.mode === 'before') {
    target.element.parentNode.insertBefore(node, target.element);
  } else if (target.mode === 'after') {
    insertElementAfterPreservingCaretBridge(target.element, node);
  } else {
    const range = target.range;
    if (!range || !editableRoot.contains(range.commonAncestorContainer)) {
      editableRoot.appendChild(node);
    } else {
      range.collapse(true);
      range.insertNode(node);
    }
  }

  // Repair bridges for every field in the editable — drop/insert can leave
  // adjacent contenteditable=false tokens with no ZWSP between them.
  ensureFieldTokenCaretAnchors(editableRoot);
  focusCaretAfter(node);
  return true;
}

function ensureDropCaret() {
  if (!dropCaretEl) {
    dropCaretEl = document.createElement('div');
    dropCaretEl.className = 'editor-drop-caret';
    dropCaretEl.style.display = 'none';
    document.body.appendChild(dropCaretEl);
  }
  return dropCaretEl;
}

function clearDropIndicators() {
  if (dropCaretEl) {
    dropCaretEl.style.display = 'none';
  }
  for (const el of document.querySelectorAll(DROP_INDICATOR_SELECTOR)) {
    el.classList.remove('is-drop-before', 'is-drop-after');
  }
}

function showDropIndicator(target: any) {
  clearDropIndicators();
  if (!target || target.mode === 'append') return;

  if (target.mode === 'range') {
    const rect = target.range.getBoundingClientRect();
    const caret = ensureDropCaret();
    caret.style.display = 'block';
    caret.style.left = `${rect.left}px`;
    caret.style.top = `${rect.top}px`;
    caret.style.height = `${Math.max(rect.height, 18)}px`;
    return;
  }

  if (target.mode === 'before') {
    target.element.classList.add('is-drop-before');
    return;
  }

  target.element?.classList?.add('is-drop-after');
}

function resolveFieldEditableRoot(sectionBody: any, clientX: any, clientY: any) {
  const range = caretRangeFromPoint(clientX, clientY);
  const dropAnchor = dropAnchorFromRange(range);
  const col = dropAnchor?.closest?.('.document-columns__col');
  return col && sectionBody.contains(col) ? col : sectionBody;
}

function updateDropIndicator(container: any, clientX: any, clientY: any) {
  if (draggedFieldToken) {
    const editableRoot = resolveFieldEditableRoot(container, clientX, clientY);
    showDropIndicator(resolveInlineDropTarget(editableRoot, draggedFieldToken, clientX, clientY));
    return;
  }

  const dragged = draggedTableEl || draggedColumnsEl;
  if (dragged) {
    showDropIndicator(resolveInlineDropTarget(container, dragged, clientX, clientY));
    return;
  }

  const editableRoot = resolveFieldEditableRoot(container, clientX, clientY);
  showDropIndicator(resolveInlineDropTarget(editableRoot, null, clientX, clientY));
}

function insertBlockAtRange(sectionBody: any, node: any, range: any) {
  if (!range || !sectionBody.contains(range.commonAncestorContainer)) {
    sectionBody.appendChild(node);
    focusCaretAfter(node);
    return node;
  }

  const anchor =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;

  if (shouldInsertInsideColumn(sectionBody, anchor)) {
    range.deleteContents();
    range.insertNode(node);
    focusCaretAfter(node);
    return node;
  }

  const enclosingColumns = anchor?.closest?.('.document-columns');
  const enclosingTable = anchor?.closest?.('.document-table');

  if (enclosingColumns && sectionBody.contains(enclosingColumns)) {
    enclosingColumns.insertAdjacentElement('afterend', node);
    focusCaretAfter(node);
    return node;
  }

  if (enclosingTable && sectionBody.contains(enclosingTable)) {
    enclosingTable.insertAdjacentElement('afterend', node);
    focusCaretAfter(node);
    return node;
  }

  range.collapse(true);
  range.insertNode(node);
  focusCaretAfter(node);
  return node;
}

function resolveCrossSectionMove(sectionBody: any, movedEl: any) {
  const sourceSection = movedEl?.closest?.('.document-section');
  const targetSection = sectionBody?.closest?.('.document-section');
  const crossSection = Boolean(
    sourceSection && targetSection && sourceSection !== targetSection,
  );
  return {
    crossSection,
    sourceBody: crossSection ? sourceSection.querySelector('.document-section__body') : null,
  };
}

function finalizeCrossSectionMove(
  movedEl: any,
  sectionBody: any,
  sourceBody: any,
  options: any,
) {
  remapperMovedSubtreeToSection(movedEl, sectionBody, sourceBody, options);
  sourceBody?.dispatchEvent?.(new InputEvent('input', { bubbles: true }));
}

function repositionLayoutBlockAtPoint(
  sectionBody: any,
  blockEl: any,
  clientX: any,
  clientY: any,
  options: any = {},
) {
  if (!blockEl?.isConnected) return false;

  const { crossSection, sourceBody } = resolveCrossSectionMove(sectionBody, blockEl);
  if (!crossSection && !sectionBody.contains(blockEl)) return false;

  const target =
    resolveInlineDropTarget(sectionBody, blockEl, clientX, clientY) ??
    (crossSection ? { mode: 'append' } : null);
  if (!target) return false;

  blockEl.remove();

  const moved = applyInlineDropTarget(sectionBody, blockEl, target);

  if (moved && crossSection) {
    finalizeCrossSectionMove(blockEl, sectionBody, sourceBody, options);
  }

  return moved;
}

function repositionTableAtPoint(
  sectionBody: any,
  tableEl: any,
  clientX: any,
  clientY: any,
  options: any = {},
) {
  return repositionLayoutBlockAtPoint(sectionBody, tableEl, clientX, clientY, options);
}

function repositionColumnsAtPoint(
  sectionBody: any,
  columnsEl: any,
  clientX: any,
  clientY: any,
  options: any = {},
) {
  return repositionLayoutBlockAtPoint(sectionBody, columnsEl, clientX, clientY, options);
}

function repositionFieldAtPoint(
  sectionBody: any,
  token: any,
  clientX: any,
  clientY: any,
  options: any = {},
) {
  if (!token?.isConnected || token.classList.contains('field-token--cell')) return false;

  const { crossSection, sourceBody } = resolveCrossSectionMove(sectionBody, token);

  const editableRoot = resolveFieldEditableRoot(sectionBody, clientX, clientY);
  const target =
    resolveInlineDropTarget(editableRoot, token, clientX, clientY) ??
    (crossSection ? { mode: 'append' } : null);
  if (!target) return false;

  removeTrailingCaretBridge(token);
  token.remove();
  const moved = applyInlineDropTarget(editableRoot, token, target);
  if (moved && crossSection) {
    finalizeCrossSectionMove(token, sectionBody, sourceBody, options);
  }
  return moved;
}

export function wireDesignDragDrop(container: any, options: any = {}) {
  wireDesignDragDropContainer(container, options);
}

function wireDesignDragDropContainer(container: any, options: any = {}) {
  const { designMode, onStructureChange, onPaletteDrop } = options;
  if (!designMode || container.dataset.designDragWired === 'true') return;
  container.dataset.designDragWired = 'true';

  const notifyChange = () => onStructureChange?.();
  const sectionHost = container.closest?.('.document-section');

  wirePaletteDropGuard(container);

  function onBeforeInput(e: any) {
    if (e.inputType !== 'insertFromDrop') return;
    if (!isInternalDragActive() && !isPaletteDragSessionActive()) return;
    e.preventDefault();
  }

  function onDragOver(e: any) {
    if (isPaletteDragEvent(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      container.classList.add('document-section--drop-target');
      updateDropIndicator(container, e.clientX, e.clientY);
      return;
    }

    if (!isInternalDragActive()) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    container.classList.add('document-section--drop-target');
    updateDropIndicator(container, e.clientX, e.clientY);
  }

  function onDragLeave(e: any) {
    const leaveRoot = sectionHost ?? container;
    if (!e.relatedTarget || !leaveRoot.contains(e.relatedTarget)) {
      container.classList.remove('document-section--drop-target');
      clearDropIndicators();
    }
  }

  async function onDrop(e: any) {
    const paletteItem = parsePaletteDrag(e.dataTransfer);
    if (paletteItem && paletteItem.kind !== 'block') {
      e.preventDefault();
      e.stopPropagation();
      container.classList.remove('document-section--drop-target');
      clearDropIndicators();
      await onPaletteDrop?.(paletteItem, container, e.clientX, e.clientY);
      return;
    }

    if (!isInternalDragActive()) return;
    e.preventDefault();
    e.stopPropagation();
    container.classList.remove('document-section--drop-target');
    clearDropIndicators();

    if (draggedFieldToken) {
      const token = draggedFieldToken;
      if (repositionFieldAtPoint(container, token, e.clientX, e.clientY, options)) {
        notifyChange();
      }
      return;
    }

    if (draggedColumnsEl) {
      const columnsEl = draggedColumnsEl;
      if (repositionColumnsAtPoint(container, columnsEl, e.clientX, e.clientY, options)) {
        notifyChange();
      }
      return;
    }

    if (draggedTableEl) {
      const tableEl = draggedTableEl;
      if (repositionTableAtPoint(container, tableEl, e.clientX, e.clientY, options)) {
        notifyChange();
      }
    }
  }

  const hosts = [container];
  // Accept drops on the whole section (header/chrome), not only the body —
  // otherwise cross-section moves show a blocked cursor over titles.
  if (sectionHost && sectionHost.dataset.designSectionDragWired !== 'true') {
    sectionHost.dataset.designSectionDragWired = 'true';
    hosts.push(sectionHost);
  }

  for (const host of hosts) {
    host.addEventListener('beforeinput', onBeforeInput, true);
    host.addEventListener('dragover', onDragOver, true);
    host.addEventListener('dragleave', onDragLeave, true);
    host.addEventListener('drop', onDrop, true);
  }

  container
    .querySelectorAll('.field-token--design:not(.field-token--cell)')
    .forEach((token: any) => {
      makeFieldTokenDraggable(token);
    });
}

export function wireColumnBlockRegions(container: any, options: any = {}) {
  const { designMode, onStructureChange } = options;
  const notifyChange = () => onStructureChange?.();

  wireDesignDragDropContainer(container, options);

  container.querySelectorAll('.document-columns').forEach((columnsEl: any) => {
    if (designMode) {
      ensureColumnsDesignSplitter(columnsEl);
      ensureToolbarDragHandle(columnsEl, 'drag-columns');
      wireColumnsResize(columnsEl, {
        onColumnsWidthsChange: (target: any, widths: any) => {
          applyColumnWidthsToElement(target, widths);
          notifyChange();
          options.onColumnsWidthsChange?.(target, widths);
        },
      });
    }

    if (columnsEl.dataset.columnsBlockWired === 'true') return;
    columnsEl.dataset.columnsBlockWired = 'true';

    if (!designMode) return;

    const dragHandle = columnsEl.querySelector('[data-action="drag-columns"]');
    dragHandle?.addEventListener('dragstart', (e: any) => {
      draggedColumnsEl = columnsEl;
      columnsEl.classList.add('document-columns--dragging');
      e.dataTransfer.effectAllowed = 'move';
      setInternalDragData(e, 'columns');
    });
    dragHandle?.addEventListener('dragend', () => {
      columnsEl.classList.remove('document-columns--dragging');
      draggedColumnsEl = null;
      clearDropIndicators();
      container.classList.remove('document-section--drop-target');
    });

    const deleteBtn = columnsEl.querySelector('[data-action="delete-columns"]');
    deleteBtn?.addEventListener('click', (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      removeOwnedSchemasFromDomSubtree(columnsEl, options);
      columnsEl.remove();
      notifyChange();
    });

    columnsEl.querySelectorAll('.document-columns__col').forEach((col: any) => {
      wirePaletteDropGuard(col);
    });
  });
}

/** Ensure design-mode columns use a middle-track splitter (migrates older DOM). */
function ensureColumnsDesignSplitter(columnsEl: any) {
  const grid = columnsEl?.querySelector?.(':scope > .document-columns__grid');
  if (!grid) return;

  grid.classList.add('document-columns__grid--design');

  // Remove legacy in-column resizers.
  grid.querySelectorAll('.document-columns__col .document-columns__col-resizer').forEach((el: any) => {
    el.remove();
  });

  let resizer = grid.querySelector(':scope > .document-columns__col-resizer');
  if (!resizer) {
    resizer = document.createElement('span');
    resizer.className = 'document-columns__col-resizer';
    resizer.dataset.colIndex = '0';
    resizer.contentEditable = 'false';
    resizer.title = 'Drag to resize columns';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.setAttribute('aria-label', 'Resize columns');
  }

  const cols = [...grid.querySelectorAll(':scope > .document-columns__col')];
  if (cols.length >= 2) {
    // Place between the two columns: col0 | resizer | col1
    grid.insertBefore(resizer, cols[1]);
  } else if (!resizer.isConnected) {
    grid.appendChild(resizer);
  }

  const widths = [
    columnsEl.dataset.columnWidth0 ?? '',
    columnsEl.dataset.columnWidth1 ?? '',
  ];
  applyColumnWidthsToElement(columnsEl, widths);
}

export function wireTableRegions(container: any, options: any = {}) {
  const { designMode, onStructureChange } = options;
  const notifyChange = () => onStructureChange?.();

  wireDesignDragDropContainer(container, options);

  container.querySelectorAll('.document-table').forEach((tableEl: any) => {
    if (designMode) {
      tableEl.querySelectorAll('[data-action="edit-table-schema"]').forEach((btn: any) => btn.remove());
      ensureToolbarDragHandle(tableEl, 'drag-table');
    }
    if (tableEl.dataset.tableWired === 'true') return;
    tableEl.dataset.tableWired = 'true';

    const tableId = tableEl.dataset.tableId;

    tableEl.addEventListener('click', (e: any) => {
      const removeBtn = e.target.closest('[data-action="remove-table-row"]');
      if (!removeBtn || !tableEl.contains(removeBtn)) return;
      e.preventDefault();
      e.stopPropagation();
      const rowKey = removeBtn.dataset.rowKey;
      if (removeTableRowFromWrapper(tableEl, rowKey, options)) {
        notifyChange();
      }
    });

    const addBtn = tableEl.querySelector('[data-action="add-table-row"]');
    addBtn?.addEventListener('click', (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      addTableRowToWrapper(tableEl, options);
      notifyChange();
    });

    const pasteBtn = tableEl.querySelector('[data-action="paste-table-rows"]');
    pasteBtn?.addEventListener('click', async (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (!navigator.clipboard?.readText) {
          throw new Error('Clipboard paste is not available in this browser.');
        }
        const text = await navigator.clipboard.readText();
        const added = addTableRowsFromText(tableEl, text, options);
        if (added.length) notifyChange();
      } catch (err: any) {
        showNotification(err?.message ?? 'Could not read clipboard. Use Import instead.');
      }
    });

    const importBtn = tableEl.querySelector('[data-action="import-table-rows"]');
    const importFile = tableEl.querySelector('[data-role="import-table-rows-file"]');
    importBtn?.addEventListener('click', (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      importFile?.click();
    });
    importFile?.addEventListener('change', async () => {
      const file = importFile.files?.[0];
      importFile.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const added = addTableRowsFromText(tableEl, text, options);
        if (added.length) notifyChange();
      } catch (err: any) {
        showNotification(err?.message ?? 'Could not import file.');
      }
    });

    if (designMode) {
      const dragHandle = tableEl.querySelector('[data-action="drag-table"]');
      dragHandle?.addEventListener('dragstart', (e: any) => {
        draggedTableEl = tableEl;
        tableEl.classList.add('document-table--dragging');
        e.dataTransfer.effectAllowed = 'move';
        setInternalDragData(e, tableId ?? 'table');
      });
      dragHandle?.addEventListener('dragend', () => {
        tableEl.classList.remove('document-table--dragging');
        draggedTableEl = null;
        clearDropIndicators();
        container.classList.remove('document-section--drop-target');
      });

      const deleteBtn = tableEl.querySelector('[data-action="delete-table"]');
      deleteBtn?.addEventListener('click', (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        removeOwnedSchemasFromDomSubtree(tableEl, options);
        tableEl.remove();
        notifyChange();
      });

      const visionTable = tableEl.querySelector('.vision-table');
      if (visionTable) {
        if (tableEl.classList.contains('document-table--pivot') || visionTable.classList.contains('pivot-table')) {
          wirePivotRowLabelResize(visionTable, {
            tableId,
            getRegistry: options.getRegistry,
            onSchemaChange: options.onSchemaChange,
            onTableColumnResizeStart: options.onTableColumnResizeStart,
          });
        } else {
          wireTableColumnResize(visionTable, {
            tableId,
            getRegistry: options.getRegistry,
            onSchemaChange: options.onSchemaChange,
            onTableColumnWidthsChange: options.onTableColumnWidthsChange,
            onTableColumnWidthsPreview: options.onTableColumnWidthsPreview,
            onTableColumnResizeStart: options.onTableColumnResizeStart,
          });
        }
      }
    }
  });
}

export function refreshFieldTokensForField(fieldId: any, context: any) {
  const registry = registryFrom(context);
  const def = registry?.getFieldDef(fieldId);
  if (def?.picker === 'computed') {
    for (const container of document.querySelectorAll('.document-section__body')) {
      const values = extractFieldValuesFromDom(container);
      refreshComputedFields(container, values, context);
    }
    return;
  }

  for (const token of document.querySelectorAll('.field-token')) {
    const el = token as HTMLElement;
    if (el.dataset.fieldId !== fieldId) continue;
    updateFieldToken(el, readTokenValue(el), el.dataset.placeholder, context);
  }
}

/**
 * Update live DOM after a schema edit without rebuilding Editor.js.
 * @param {string} fieldId
 * @param {object} context
 * @param {ParentNode} [root]
 */
export function refreshFieldSchemaInDom(fieldId: any, context: any, root: any = document) {
  refreshFieldTokensForField(fieldId, context);

  const registry = registryFrom(context);
  const schema = registry?.getFieldSchemas()?.[fieldId];
  const label = schema?.label ?? fieldId;
  const scope = root?.querySelector ? root : document;

  if (schema?.type === 'pivotTable') {
    refreshPivotTableInDom(fieldId, {
      ...context,
      getRegistry: context?.getRegistry ?? (() => registry),
      fieldSchemas: registry?.getFieldSchemas?.() ?? context?.fieldSchemas,
      designMode: context?.designMode !== false,
    }, scope);
  }

  for (const wrapper of scope.querySelectorAll('.template-block')) {
    if (!wrapper.querySelector(`.field-token[data-field-id="${fieldId}"]`)) continue;

    const typeSpan = wrapper.querySelector('.template-block__type');
    if (typeSpan) typeSpan.textContent = label;

    const fieldLabel = wrapper.querySelector('.template-block__field-label');
    if (fieldLabel) fieldLabel.textContent = `${label}: `;
  }

  for (const container of scope.querySelectorAll('.document-section__body')) {
    const values = extractFieldValuesFromDom(container);
    refreshComputedFields(container, values, {
      ...context,
      changedFieldId: fieldId,
    });
  }
}

/**
 * Open the fill-mode value picker for a field token (click or keyboard).
 * Keeps `.field-token--focused` after the dialog closes so Tab can continue.
 * @returns {Promise<unknown | undefined>} next value, or undefined when cancelled / not editable
 */
export async function pickFillFieldFromToken(
  token: any,
  callbacks: any,
  onUpdate: any,
  options: any = {},
) {
  const fieldId = token?.dataset?.fieldId;
  if (!fieldId || !callbacks) return undefined;

  const registry = registryFrom(callbacks);
  const schema =
    options.schema ??
    registry?.getFieldSchemas()?.[fieldId] ??
    callbacks.fieldSchemas?.[fieldId];
  const fieldSchemas =
    registry?.getFieldSchemas?.() ?? callbacks.fieldSchemas ?? options.updateContext?.fieldSchemas;
  if (!isFieldEditableInFillMode(schema, { fieldId, fieldSchemas })) return undefined;

  const holder =
    callbacks.editorHolder ??
    options.root ??
    (typeof token.closest === 'function'
      ? token.closest('.codex-editor, .editor-holder, [data-docengine-editor]')
      : null) ??
    document;
  setFillFieldFocus(token, holder);

  const fromDom = readTokenValue(token);
  const fromMap = callbacks?.fieldValues?.[fieldId];
  const emptyOpts = {
    htmlEditor: !!schema?.htmlEditor,
    repeaterSchema: schema?.type === 'child' ? schema : undefined,
  };
  // Prefer live fieldValues — image data URLs are not stored on data-value.
  const current =
    options.currentValue !== undefined
      ? options.currentValue
      : fromMap !== undefined && !isFieldEmpty(fromMap, emptyOpts)
        ? fromMap
        : fromDom;

  const placeholder = options.placeholder ?? token.dataset.placeholder;
  const updateContext = options.updateContext ?? callbacks;

  token.classList.add('field-token--active');
  try {
    const next = await openFieldPicker(fieldId, current, callbacks);
    // Paint the token before onUpdate so computed-field sync scrapes the new value.
    // onUpdate may still remount the node (structure/save); refresh the live token after.
    if (token.isConnected) {
      try {
        updateFieldToken(token, next, placeholder, updateContext);
      } catch (err) {
        console.warn('[docengine] Failed to refresh field token after pick', err);
      }
    }
    onUpdate?.(fieldId, next);
    const live =
      findLiveFieldToken(fieldId, holder) ?? (token.isConnected ? token : null);
    if (live) {
      live.classList.remove('field-token--active');
      try {
        updateFieldToken(live, next, placeholder ?? live.dataset.placeholder, updateContext);
      } catch (err) {
        console.warn('[docengine] Failed to refresh field token after pick', err);
      }
    }
    restoreFillFieldFocusAfterPicker(fieldId, holder, live ?? token);
    return next;
  } catch {
    // cancelled — keep focus on the field
    restoreFillFieldFocusAfterPicker(fieldId, holder, token);
    return undefined;
  } finally {
    token.classList.remove('field-token--active');
    const live = findLiveFieldToken(fieldId, holder);
    live?.classList.remove('field-token--active');
  }
}

export function wireFieldClicks(container: any, callbacks: any, onUpdate: any, options: any = {}) {
  const { designMode, onEditSchema, onDeleteField, designPropertiesPanel } = options;

  if (designMode) {
    container.querySelectorAll('.field-token:not(.field-token--cell)').forEach((token: any) => {
      if (token.dataset.designWired !== 'true') {
        wireDesignFieldToken(token, { onEditSchema, onDeleteField, designPropertiesPanel });
      }
    });
    return;
  }

  container.addEventListener('click', async (e: any) => {
    const token = e.target.closest('.field-token');
    if (!token || !container.contains(token)) return;

    const fieldId = token.dataset.fieldId;
    const registry = registryFrom(callbacks);
    const fieldSchemas = registry?.getFieldSchemas?.() ?? callbacks.fieldSchemas;
    const schema = fieldSchemas?.[fieldId];
    if (!isFieldEditableInFillMode(schema, { fieldId, fieldSchemas })) return;

    e.preventDefault();
    e.stopPropagation();

    await pickFillFieldFromToken(token, callbacks, onUpdate, { schema, root: container });
  });
}
