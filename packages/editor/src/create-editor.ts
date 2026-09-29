import { wireEditorJsNativeDropGuard } from './fields/wire-editorjs-native-drop-guard.js';
import EditorJS from '@editorjs/editorjs';
// EditorJS CJS typings conflict with verbatimModuleSyntax; treat as any constructable.
const EditorJSCtor: any = EditorJS;

import DocumentSection from './tools/document-section.js';
import TemplateBlock from './tools/template-block.js';

import { createTreeModal } from './ui/tree-modal.js';
import { createListModal } from './ui/list-modal.js';
import { createTextModal } from './ui/text-modal.js';
import { createHtmlTextModal } from './ui/html-text-modal.js';
import { createIntegerModal } from './ui/integer-modal.js';
import { createSignatureModal } from './ui/signature-modal.js';
import { createImageModal } from './ui/image-modal.js';
import { resolveFieldModalParent, resolvePreviewModalParent } from './ui/wire-modal-palette.js';
import { createSchemaEditorModal } from './design/schema-editor-modal.js';
import { configureSchemaItemsDesignerModal } from './design/schema-items-designer-modal.js';
import { createFieldPalette } from './design/field-palette.js';
import { createDesignShell } from './design/design-shell.js';
import { createPropertiesPanel } from './design/properties-panel.js';
import { wirePaletteBlockDrop } from './design/palette-block-drop.js';
import { createRichTextToolbar } from './ui/rich-text-toolbar.js';
import { createPreviewModal } from './ui/preview-modal.js';
import { createFieldMappingModal } from './ui/field-mapping-modal.js';
import { createRepeaterEditorModal } from './ui/repeater-editor-modal.js';
import {
  extractRepeaterValueFromDocument,
  getRepeaterFieldSchemas,
  ensureRepeaterChildSchemas,
  ensureRepeaterSchemasFromBlockValues,
  sanitizeRepeaterChildSchemas,
  normalizeRepeaterValue,
  normalizeRepeaterSchema,
  parseRepeaterTemplateImport,
  applyRepeaterTemplateImport,
  syncRepeaterTemplateFromFillDocument,
  extractRepeaterFieldValueFromBlocks,
  stripForeignKeysFromRepeaterValue,
  buildRepeaterFillDocument,
  repeaterHasTemplate,
} from './core/repeater-io.js';
import { createDocumentActions } from './ui/document-actions.js';
import { DEFAULT_FIELD_VALUE_STYLE_OPTIONS, DOCUMENT_TABLE_TEXT_STYLE } from './core/document-display-defaults.js';
import { cloneHistorySnapshot, createDocumentHistory } from './core/document-history.js';
import {
  applyDocumentBodyTextStyle,
  applyDesignPanelTextStyle,
  refreshDocumentFieldTokenStyles,
  resolvePageSetupFieldValueStyle,
  resolvePageSetupTextStyle,
  resolvePageSetupFieldHighlightStyle,
  applyFieldHighlightCssVars,
  applyPageFormatCssVars,
  FILL_MODE_PAGE_SCALE,
  migratePageSetup,
} from './core/page-setup-styles.js';
import { generateDocumentPdfBlob, isClientPdfAvailable } from './export/document-pdf.js';
import { buildPreviewHtmlBlob, buildPreviewHtmlDocument } from './export/preview-html-document.js';
import { resolvePreviewExportOptions } from './export/preview-export-options.js';
import { saveBlobToDisk } from './utils/save-blob.js';
import { buildExportFilename } from './utils/export-filename.js';
import { applyDesignMode } from './design/design-mode.js';
import { showNotification } from './ui/notification.js';
import {
  applyFieldMapping as runFieldMapping,
  previewFieldMapping as runFieldMappingPreview,
  normalizeFieldMappingSpec,
  evaluateSectionVisibility,
  registerFormulaFunction,
  omitMappedFields,
} from '@docengine/engine';

import {
  buildTemplateExport,
  buildFieldsExport,
  buildDocExport,
  applyDocumentValues,
  normalizeImportedDoc,
  normalizeDocumentValues,
  validateRequiredFields,
  collectAllValues,
  isFieldsExport,
} from './core/document-io.js';
import { resolveRepeatablePagePlan } from './core/field-io/sectioned-document-io.js';
import {
  createDefaultSchema,
  createDefaultBlockData,
  ensureCellSchemas,
  syncBlocksAfterSchemaChange,
  applyFieldIdChange,
  listColumnCellFieldIds,
  parseCellFieldId,
  syncColumnListSourceSettings,
  syncTableColumnKeyChanges,
  ensureSchemaForFieldProperties,
  resolveSchemaDefaultValue,
} from './core/field-schemas.js';
import {
  findFieldPlacement,
  migrateFieldIds,
  rebuildFieldIdsForSection,
  resolveSectionName,
  allocateUniqueSectionName,
  collectUsedSectionNames,
  DEFAULT_SECTION_NAME,
} from './core/field-id.js';
import { renameSectionInFormulas } from './core/formula-field-index.js';
import { SchemaRegistry } from './registry/schema-registry.js';
import { createCatalogProvider } from './catalog/catalog-provider.js';
import { attachRegistryToHolder, detachRegistryFromHolder } from './registry/registry-context.js';
import {
  insertInlineField,
  focusCaretAtEnd,
  focusCaretAfter,
  refreshFieldSchemaInDom,
  refreshTableCellTokens,
  pruneTableCellCaretAnchors,
  insertTableAtCaret,
  insertColumnsAtCaret,
  insertColumnsAtPoint,
  insertPaletteFieldAtPoint,
  insertPaletteTableAtPoint,
  wireTableRegions,
  applyColumnWidthsToElement,
  updateFieldToken,
  findLiveFieldToken,
  collectAllFieldValuesFromHolder,
  resolveSelectedTextForFieldConversion,
  syncFillComputedFields,
  recoverImageValuesFromDom,
} from './fields/inline-fields.js';
import { saveSelection } from './fields/rich-text.js';
import { readTableRowsFromDom, refreshTableHeadersInDom, applyTableColumnWidthsToElement } from './fields/table-field.js';
import {
  setFieldSelectionChangeCallback,
  clearAllDesignTokenSelection,
} from './fields/field-selection.js';
import {
  isEmptyFieldDisplayStyle,
  normalizeFieldDisplayStyle,
  refreshTableColumnStylesForFieldIds,
  resolveFieldDisplayStyle,
  resolveTableCellDisplayStyle,
} from './fields/field-display-style.js';
import { configureImageUpload } from './services/image-upload.js';
import { getFieldHandler, isInlineFieldType } from './fields/handlers/index.js';
import {
  createEmptyDocumentSectionBlock,
  ensureAtLeastOneDocumentSection,
} from './core/document-section-defaults.js';

const DEFAULT_EMPTY_DOCUMENT = {
  time: Date.now(),
  fieldSchemas: {},
  blocks: [createEmptyDocumentSectionBlock()],
};

/** Types that change document structure and require an Editor.js remount. */
function isStructuralFieldType(type: any) {
  return type === 'table' || type === 'child';
}

/**
 * Inline↔inline type switches (text/choice/image/…) can refresh tokens in place.
 * Table/child transitions still remount.
 */
function canRefreshFieldTypeInDom(previousType: any, newType: any) {
  if (!previousType || !newType || previousType === newType) return false;
  if (isStructuralFieldType(previousType) || isStructuralFieldType(newType)) return false;
  return isInlineFieldType(previousType) && isInlineFieldType(newType);
}

function migrateFieldSchemas(schemas: any) {
  const next: any = { ...schemas };
  for (const [id, schema] of Object.entries(next) as [string, any][]) {
    if (schema?.type === 'group') delete next[id];
    const migrated = schema?.type === 'repeater' ? { ...schema, type: 'child' } : schema;
    if (migrated?.type === 'child') {
      next[id] = normalizeRepeaterSchema(migrated);
    }
  }
  return next;
}

function migrateBlocks(blocks: any,options: any = {}) {
  const { visionTableFieldId = 'visionTable' } = options;

  return blocks
    .filter((block: any) => {
      if (block.type === 'image') return false;
      if (block.type === 'templateBlock' && block.data?.fieldType === 'group') return false;
      return true;
    })
    .map((block: any) => {
      if (block.type === 'templateBlock' && block.data?.fieldType === 'repeater') {
        block = { ...block, data: { ...block.data, fieldType: 'child' } };
      }
      if (block.type === 'documentSection' && Array.isArray(block.data?.segments)) {
        const segments = block.data.segments.map((seg: any) =>
          seg?.type === 'repeater' ? { ...seg, type: 'child' } : seg,
        );
        block = { ...block, data: { ...block.data, segments } };
      }
      if (block.type !== 'visionTable') return block;

      const fieldId = block.data?.fieldId ?? visionTableFieldId;
      const cells: any = {};
      for (const [key, val] of Object.entries(block.data?.cells ?? {})) {
        if (key.startsWith(`${visionTableFieldId}_`) || key.startsWith(`${fieldId}_`)) {
          cells[key] = val;
        } else if (/^(od|os)_/.test(key)) {
          cells[`${fieldId}_${key}`] = val;
        } else {
          cells[key] = val;
        }
      }

      const tableSchema = options.defaultDocument?.fieldSchemas?.[fieldId]
        ?? options.fieldSchemas?.[fieldId];
      const schemaRows = Array.isArray(tableSchema?.rows)
        ? tableSchema.rows.map((row: any) => ({
            key: String(row.key),
            label: String(row.label ?? ''),
          }))
        : [
            { key: 'row1', label: '' },
            { key: 'row2', label: '' },
          ];

      return {
        type: 'documentSection',
        data: {
          name: tableSchema?.name ?? 'Visual acuity',
          label: tableSchema?.label ?? tableSchema?.name ?? 'Visual acuity',
          segments: [
            {
              type: 'table',
              id: fieldId,
              rows: schemaRows,
            },
          ],
          fieldValues: cells,
        },
      };
    });
}

function normalizeRepeaterValuesInBlocks(blocks: any,fieldSchemas: any) {
  return (blocks ?? []).map((block: any) => {
    if (block.type !== 'documentSection' || !block.data?.fieldValues) return block;

    const fieldValues = { ...block.data.fieldValues };
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      const schema = fieldSchemas?.[fieldId];
      if (schema?.type === 'child') {
        fieldValues[fieldId] = normalizeRepeaterValue(value, schema);
      }
    }

    return {
      ...block,
      data: {
        ...block.data,
        fieldValues,
      },
    };
  });
}

function normalizeDocument(data: any,options: any = {}) {
  const fallback = options.defaultDocument ?? DEFAULT_EMPTY_DOCUMENT;

  let result: any;
  if (data?.blocks) {
    result = {
      time: data.time ?? Date.now(),
      fieldSchemas: migrateFieldSchemas(data.fieldSchemas ?? { ...fallback.fieldSchemas }),
      blocks: migrateBlocks(data.blocks, {
        ...options,
        fieldSchemas: migrateFieldSchemas(data.fieldSchemas ?? { ...fallback.fieldSchemas }),
      }),
    };
  } else {
    result = {
      time: fallback.time ?? Date.now(),
      fieldSchemas: { ...fallback.fieldSchemas },
      blocks: migrateBlocks(fallback.blocks ?? [], options),
    };
  }

  const migrated = migrateFieldIds(result.blocks, result.fieldSchemas);
  let fieldSchemas = { ...migrated.fieldSchemas };
  for (const [fieldId, schema] of Object.entries(fieldSchemas)) {
    if (schema?.type === 'child') {
      fieldSchemas[fieldId] = sanitizeRepeaterChildSchemas(schema, fieldSchemas, migrated.blocks);
    }
  }
  fieldSchemas = ensureRepeaterSchemasFromBlockValues(fieldSchemas, migrated.blocks);
  const resultDoc = {
    ...result,
    fieldSchemas,
    blocks: ensureAtLeastOneDocumentSection(
      normalizeRepeaterValuesInBlocks(migrated.blocks, fieldSchemas),
    ),
  };
  if (data?.pageSetup && typeof data.pageSetup === 'object') {
    resultDoc.pageSetup = JSON.parse(JSON.stringify(data.pageSetup));
  }
  if (data?.fieldMapping && typeof data.fieldMapping === 'object') {
    resultDoc.fieldMapping = JSON.parse(JSON.stringify(data.fieldMapping));
  }
  return resultDoc;
}

function resolveHolder(holder: any) {
  if (!holder) throw new Error('createEditor: holder is required');
  if (typeof holder === 'string') {
    const el = document.querySelector(holder);
    if (!el) throw new Error(`createEditor: holder not found: ${holder}`);
    return el;
  }
  return holder;
}

function resolveElement(target: any) {
  if (!target) return null;
  if (typeof target === 'string') return document.querySelector(target);
  return target;
}

/**
 * Mount a UI element relative to the editor holder.
 * - paletteAfter / toolbarBefore: insert immediately after/before a sibling anchor
 * - paletteParent with holder inside parent: insertBefore(holder)
 * - paletteParent without holder as child: insert after parent (e.g. after page header)
 * - default: insert before holder in holder.parentElement
 */
function mountAdjacentUi(element: any,holder: any,parentOption: any,anchorOption: any,mode: any = 'before-holder') {
  const anchor = resolveElement(anchorOption);

  if (anchor) {
    if (mode === 'before-holder') {
      anchor.after(element);
    } else {
      anchor.before(element);
    }
    return;
  }

  const parent = resolveElement(parentOption) ?? holder.parentElement;
  if (parent?.contains(holder)) {
    parent.insertBefore(element, holder);
    return;
  }

  if (parent) {
    parent.after(element);
    return;
  }

  holder.parentElement?.insertBefore(element, holder);
}

function mountInContainer(element: any,containerOption: any) {
  const container = resolveElement(containerOption);
  if (container) {
    container.appendChild(element);
    return true;
  }
  return false;
}

/**
 * Mount palette + format toolbar wrapper relative to holder or host chrome container.
 */
function mountTopChrome(topChrome: any,holder: any,ui: any) {
  const chromeParent = resolveElement(ui.chromeParent ?? ui.paletteParent);
  if (chromeParent) {
    chromeParent.appendChild(topChrome);
    return;
  }

  const anchorAfter = resolveElement(ui.paletteAfter);
  if (anchorAfter) {
    anchorAfter.after(topChrome);
    return;
  }

  const anchorBefore = resolveElement(ui.toolbarBefore);
  if (anchorBefore) {
    anchorBefore.before(topChrome);
    return;
  }

  const toolbarParent = resolveElement(ui.toolbarParent);
  if (toolbarParent?.contains(holder)) {
    toolbarParent.insertBefore(topChrome, holder);
    return;
  }

  holder.parentElement?.insertBefore(topChrome, holder);
}

/**
 * @param {object} options
 * @returns {import('./types.js').DocEditorInstance}
 */
export function createEditor(options: any = {}) {
  const holder = resolveHolder(options.holder);
  if (!holder.id) {
    holder.id = `doc-editor-${Date.now().toString(36)}`;
  }

  let designMode = !!options.designMode;
  let showFieldsInFillMode = options.ui?.showFieldsInFillMode !== false;
  let editor: any = null;
  /** Serializes setDesignMode so concurrent reinits don't call EditorJS.destroy() twice. */
  let setDesignModeInFlight: Promise<void> | null = null;
  let destroyed = false;
  let lastFocusedEditable: any = null;
  let historyTimer: ReturnType<typeof setTimeout> | null = null;
  let historyBusy = false;
  const documentHistory = createDocumentHistory({ maxDepth: 50 });
  const fieldValueStyle = {
    ...DEFAULT_FIELD_VALUE_STYLE_OPTIONS,
    ...options.fieldValueStyle,
    default: {
      ...DEFAULT_FIELD_VALUE_STYLE_OPTIONS.default,
      ...options.fieldValueStyle?.default,
    },
  };

  function getFillModeHighlightContext() {
    return {
      fillModeFieldHighlight: !designMode && showFieldsInFillMode && !options.mappingMode,
      mappingMode: !!options.mappingMode,
    };
  }

  function syncStylesFromPageSetup() {
    const resolved = resolvePageSetupFieldValueStyle(documentPageSetup, options.fieldValueStyle);
    Object.assign(fieldValueStyle.default, resolved.default);

    for (const body of holder.querySelectorAll('.document-section__body')) {
      applyDocumentBodyTextStyle(body, resolvePageSetupTextStyle(documentPageSetup));
    }

    syncFieldHighlightStyles();
    syncPageFormatLayout();
    const highlightContext = getFillModeHighlightContext();
    refreshDocumentFieldTokenStyles(holder, fieldValueStyle, highlightContext);
    refreshTableCellTokens(holder, {
      getRegistry: () => registry,
      fieldValueStyle,
      ...highlightContext,
    });
    refreshTableHeadersInDom(holder, {
      getRegistry: () => registry,
      fieldValueStyle,
      getDocumentTextStyle: () => resolvePageSetupTextStyle(documentPageSetup),
    });
    syncDesignChromeTypography();
  }

  /** Editor window sized from Page Setup format/orientation (+10%), fill and design. */
  function syncPageFormatLayout() {
    const chromeHosts = collectFillPageChromeHosts();

    applyPageFormatCssVars(holder, documentPageSetup, {
      scale: FILL_MODE_PAGE_SCALE,
      fillPage: true,
    });
    for (const host of chromeHosts) {
      applyPageFormatCssVars(host, documentPageSetup, {
        scale: FILL_MODE_PAGE_SCALE,
        fillPage: false,
      });
      if (host.classList.contains('doc-shell')) {
        host.classList.add('doc-shell--fill-page');
      }
      if (host.classList.contains('page')) {
        host.classList.add('page--fill-page');
      }
      if (host.classList.contains('design-panel__editor-scroll')) {
        host.classList.add('design-panel__editor-scroll--fill-page');
      }
    }
  }

  function collectFillPageChromeHosts() {
    /** @type {HTMLElement[]} */
    const hosts: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    const add = (el: Element | null | undefined) => {
      if (!(el instanceof HTMLElement) || el === holder || seen.has(el)) return;
      seen.add(el);
      hosts.push(el);
    };

    add(holder.closest?.('.doc-shell'));
    add(holder.closest?.('.page'));
    add(designEditorScroll);
    add(holder.closest?.('.design-panel__editor-scroll'));

    const modalParent = resolveFieldModalParent(holder);
    if (modalParent && modalParent !== document.body) {
      add(modalParent);
    }

    return hosts;
  }

  function syncDesignChromeTypography() {
    if (designShell?.element) {
      applyDesignPanelTextStyle(designShell.element, documentPageSetup);
    }
    if (topChrome) {
      applyDesignPanelTextStyle(topChrome, documentPageSetup);
    }
  }

  function resolveFieldHighlightStyle() {
    return resolvePageSetupFieldHighlightStyle(documentPageSetup, options.ui?.fieldHighlight);
  }

  function syncFieldHighlightStyles() {
    const style = resolveFieldHighlightStyle();
    applyFieldHighlightCssVars(holder, style);
    // Field dialogs mount on .doc-shell (sibling of holder) — mirror vars so
    // dialog chrome can use --me-field-fill-color (empty-field style).
    const modalParent = resolveFieldModalParent(holder);
    if (modalParent && modalParent !== holder) {
      applyFieldHighlightCssVars(modalParent, style);
    }
  }
  const ui = options.ui ?? {};
  const useDesignPanels = ui.designLayout === 'panels';

  let designShell: any = null;
  let propertiesPanel: any = null;
  let selectedSectionBlockIndex = -1;
  let selectedColumnsEl: any = null;
  let selectedTableEl: any = null;
  let designToolbarWrap: any = null;
  let designEditorScroll: any = null;
  /** @type {import('./types.d.ts').TemplatePageSetup} */
  let documentPageSetup: any = {};
  /** @type {import('./types.d.ts').FieldMappingSpec | null} */
  let documentFieldMapping: any = null;
  const getFormTextStyle = () => resolvePageSetupTextStyle(documentPageSetup);
  /** @type {Record<string, import('./types.d.ts').DocumentSectionValues> | null} */
  let loadedDocumentSections: any = null;

  const catalogProvider = createCatalogProvider(options.catalogs ?? {});
  const registry = new SchemaRegistry(catalogProvider);
  attachRegistryToHolder(holder, registry);

  if (useDesignPanels) {
    designShell = createDesignShell(holder);
    if (designMode) designShell.show();
    else designShell.hide();
  }

  function syncShowFieldsHighlight() {
    holder.classList.toggle(
      'editor-holder--show-fields',
      !designMode && showFieldsInFillMode,
    );
    syncFieldHighlightStyles();
    if (!designMode && showFieldsInFillMode) {
      const highlightContext = getFillModeHighlightContext();
      refreshDocumentFieldTokenStyles(holder, fieldValueStyle, highlightContext);
      refreshTableCellTokens(holder, {
        getRegistry: () => registry,
        fieldValueStyle,
        ...highlightContext,
      });
    }
  }

  function scheduleEditorStylesSync() {
    const current = editor;
    if (!current) return;
    void current.isReady.then(() => {
      if (destroyed || editor !== current) return;
      syncPageFormatLayout();
      syncShowFieldsHighlight();
    });
  }

  function syncDesignChromeVisibility() {
    if (useDesignPanels) {
      if (designMode) {
        designShell?.show();
      } else {
        designShell?.hide();
        propertiesPanel?.showEmpty();
        selectedSectionBlockIndex = -1;
        clearStructureSelection();
        updateSectionSelectionHighlight();
      }
      // Format toolbar stays visible in fill mode (only palette/properties hide).
      if (designToolbarWrap) designToolbarWrap.hidden = false;
    }
    syncShowFieldsHighlight();
  }

  if (options.imageUpload) {
    configureImageUpload(options.imageUpload);
  }

  if (Array.isArray(options.formulaFunctions)) {
    for (const def of options.formulaFunctions) {
      if (def) registerFormulaFunction(def);
    }
  }

  const fieldModalParent = resolveFieldModalParent(holder);
  const previewModalParent = resolvePreviewModalParent(holder);
  const treeModal = createTreeModal({ parent: fieldModalParent });
  const listModal = createListModal({ parent: fieldModalParent });
  const textModal = createTextModal({ parent: fieldModalParent });
  const htmlTextModal = createHtmlTextModal({ parent: fieldModalParent });
  const integerModal = createIntegerModal({ parent: fieldModalParent });
  const signatureModal = createSignatureModal({ parent: fieldModalParent });
  const imageModal = createImageModal({ parent: fieldModalParent });
  const repeaterEditorModal = createRepeaterEditorModal({
    getEditorOptions: () => options,
  });
  const schemaEditor = createSchemaEditorModal({
    getRegistry: () => registry,
    getTextStyle: getFormTextStyle,
    onRepeaterTemplateChange: (fieldId: any,schema: any) => applyRepeaterSchemaUpdate(fieldId, schema),
    getRemoteListCollections: options.remoteListCollections ?? null,
    getRemoteListLabelFields: options.remoteListLabelFields ?? null,
  });

  configureSchemaItemsDesignerModal({ getTextStyle: getFormTextStyle });

  const previewModal = createPreviewModal({
    getFieldValueStyle: () => fieldValueStyle,
    defaultPdfFilename: ui.pdfFilename ?? 'document.pdf',
    pdfTitle: ui.pdfTitle,
    getPageSetup: () => documentPageSetup,
    getTextStyle: getFormTextStyle,
    generatePdfBlob: options.generatePdfBlob ?? null,
    pdfAvailable: options.pdfAvailable,
    embedPdfInIframe: ui.embedPdfInIframe !== false,
    parent: previewModalParent,
    onOpenChange: (open: boolean) => {
      options.onPreviewStateChange?.(!!open);
    },
    onShareDocument:
      typeof options.onShareDocument === 'function' ? options.onShareDocument : null,
  });
  const fieldMappingModal = options.mappingMode
    ? null
    : createFieldMappingModal({
        getTemplate: () => ({
          blocks: registry.getBlocks(),
          fieldSchemas: registry.getFieldSchemas(),
        }),
        onSave: (spec: any) => {
          documentFieldMapping = spec;
        },
      });
  const richTextToolbar = createRichTextToolbar();

  /** Depth of open nested field dialogs — keeps host Escape blockers accurate when stacked. */
  let nestedModalDepth = 0;
  function notifyNestedModal(open: boolean) {
    if (open) nestedModalDepth += 1;
    else nestedModalDepth = Math.max(0, nestedModalDepth - 1);
    options.onNestedModalStateChange?.(nestedModalDepth > 0);
  }
  function guardNestedModal<T>(promise: Promise<T>): Promise<T> {
    notifyNestedModal(true);
    return Promise.resolve(promise).then(
      (result) => {
        // Resolved (OK / Clear) — not Close/Escape/cancel.
        options.onFieldPickerApplied?.();
        return result;
      },
      (err) => {
        throw err;
      },
    ).finally(() => {
      notifyNestedModal(false);
    });
  }

  const openTree =
    options.pickers?.openTreePicker ??
    ((opts: any) => treeModal.open({ ...opts, textStyle: getFormTextStyle() }));
  const openList =
    options.pickers?.openListPicker ??
    ((opts: any) => listModal.open({ ...opts, textStyle: getFormTextStyle() }));
  const openText =
    options.pickers?.openTextPicker ??
    ((opts: any) => textModal.open({ ...opts, textStyle: getFormTextStyle() }));
  const openHtmlText =
    options.pickers?.openHtmlTextPicker ??
    ((opts: any) => htmlTextModal.open({ ...opts, textStyle: getFormTextStyle() }));
  const openInteger =
    options.pickers?.openIntegerPicker ?? ((opts: any) => integerModal.open(opts));
  const openSignature =
    options.pickers?.openSignaturePicker ?? ((opts: any) => signatureModal.open(opts));
  const openImage =
    options.pickers?.openImagePicker ?? ((opts: any) => imageModal.open(opts));
  const openDate = options.pickers?.openDatePicker;

  const pickerCallbacks = {
    ...(options.pickers ?? {}),
    openTreePicker: (opts: any) => guardNestedModal(Promise.resolve(openTree(opts))),
    openListPicker: (opts: any) => guardNestedModal(Promise.resolve(openList(opts))),
    openTextPicker: (opts: any) => guardNestedModal(Promise.resolve(openText(opts))),
    openHtmlTextPicker: (opts: any) => guardNestedModal(Promise.resolve(openHtmlText(opts))),
    openIntegerPicker: (opts: any) => guardNestedModal(Promise.resolve(openInteger(opts))),
    openSignaturePicker: (opts: any) => guardNestedModal(Promise.resolve(openSignature(opts))),
    openImagePicker: (opts: any) => guardNestedModal(Promise.resolve(openImage(opts))),
    openDatePicker: openDate
      ? (opts: any) =>
          guardNestedModal(Promise.resolve(openDate({ ...opts, parent: fieldModalParent })))
      : undefined,
  };

  function getAllDocumentEditables() {
    return [...holder.querySelectorAll('.document-section__body')];
  }

  function resolveTargetEditable() {
    if (lastFocusedEditable?.isConnected) return lastFocusedEditable;

    if (editor) {
      const currentIndex = editor.blocks.getCurrentBlockIndex();
      if (currentIndex >= 0) {
        const blocks = holder.querySelectorAll('.ce-block');
        const editable = blocks[currentIndex]?.querySelector('.document-section__body');
        if (editable) return editable;
      }
    }

    const all = getAllDocumentEditables();
    return all[all.length - 1] ?? null;
  }

  async function ensureDocumentSectionAtEnd() {
    await editor.isReady;
    let editable = resolveTargetEditable();
    if (!editable) {
      const count = editor.blocks.getBlocksCount();
      await editor.blocks.insert('documentSection', createUniqueSectionData(), {}, count);
      await editor.isReady;
      editable = getAllDocumentEditables().at(-1) ?? null;
    }

    if (editable) {
      lastFocusedEditable = editable;
      focusCaretAtEnd(editable);
    }

    return editable;
  }

  function applyLiveTableColumnWidths(tableId: any, columns: any) {
    if (!tableId || !Array.isArray(columns)) return;
    const schema = registry.getFieldSchemas()?.[tableId];
    if (!schema || schema.type !== 'table') return;
    registry.updateFieldSchema(tableId, { ...schema, columns });
    applyTableColumnWidthsToElement(findLiveTableEl(tableId), columns);
    options.onSchemaChange?.(registry.getFieldSchemas());
  }

  function syncTableWidthsToProperties(tableId: any, columns: any) {
    if (!propertiesPanel || !tableId) return;
    propertiesPanel.cancelPersist?.();
    propertiesPanel.syncTableColumnWidths?.(tableId, columns);
  }

  function handleTableColumnWidthsChange(tableId: any, columns: any) {
    options.onSchemaChange?.(registry.getFieldSchemas());
    syncTableWidthsToProperties(tableId, columns);
  }

  function handleTableColumnWidthsPreview(tableId: any, columns: any) {
    syncTableWidthsToProperties(tableId, columns);
  }

  function handleTableColumnResizeStart(tableId: any) {
    const columns = propertiesPanel?.commitLiveTableColumnWidths?.(tableId);
    if (columns) applyLiveTableColumnWidths(tableId, columns);
    propertiesPanel?.cancelPersist?.();
  }

  function isTableWidthOnlyChange(prev: any, next: any) {
    if (!prev || prev.type !== 'table' || next?.type !== 'table') return false;
    if (!!prev.hideHeader !== !!next.hideHeader) return false;
    if (!!prev.hideBorders !== !!next.hideBorders) return false;
    if (String(prev.name ?? prev.label ?? '') !== String(next.name ?? next.label ?? '')) return false;
    if (String(prev.label ?? '') !== String(next.label ?? '')) return false;
    const prevCols = prev.columns ?? [];
    const nextCols = next.columns ?? [];
    if (prevCols.length !== nextCols.length) return false;
    return prevCols.every((col: any, index: any) => (
      col.key === nextCols[index].key &&
      col.label === nextCols[index].label &&
      (col.name ?? col.label) === (nextCols[index].name ?? nextCols[index].label)
    ));
  }

  function getInlineFieldOptions() {
    return {
      getRegistry: () => registry,
      fieldValueStyle,
      designMode,
      designPropertiesPanel: useDesignPanels && designMode,
      openEditor: !(useDesignPanels && designMode),
      onEditSchema: handleEditSchema,
      onDeleteField: (fieldId: any,token: any) => {
        token?.remove();
        handleDeleteSchema(fieldId);
      },
      onPaletteDrop: handlePaletteDrop,
      onSchemaChange: (schemas: any) => options.onSchemaChange?.(schemas),
      onTableColumnWidthsChange: handleTableColumnWidthsChange,
      onTableColumnWidthsPreview: handleTableColumnWidthsPreview,
      onTableColumnResizeStart: handleTableColumnResizeStart,
      onColumnsWidthsChange: (columnsEl: any) => {
        // Keep the columns block selected in the properties panel after a splitter drag.
        if (columnsEl?.isConnected) {
          selectColumnsEl(columnsEl);
        }
      },
    };
  }

  function syncSectionDataToRegistry(sectionData: any, sectionEl: any = null) {
    if (!sectionData) return;
    const blocks = [...(registry.getBlocks() ?? [])];
    let index = -1;

    // Prefer DOM block index so duplicate section names (legacy Untitled…) do not
    // overwrite the wrong registry entry.
    if (sectionEl?.closest) {
      const ceBlock = sectionEl.closest('.ce-block');
      if (ceBlock) {
        const allBlocks = [...holder.querySelectorAll('.ce-block')];
        index = allBlocks.indexOf(ceBlock);
      }
    }

    if (index < 0 || blocks[index]?.type !== 'documentSection') {
      const sectionName = resolveSectionName(sectionData);
      index = blocks.findIndex(
        (block: any) =>
          block.type === 'documentSection' && resolveSectionName(block.data ?? {}) === sectionName,
      );
    }

    if (index < 0 || blocks[index]?.type !== 'documentSection') return;
    blocks[index] = {
      ...blocks[index],
      data: {
        ...blocks[index].data,
        ...sectionData,
      },
    };
    registry.setBlocks(blocks);
    scheduleHistoryRecord();
  }

  function collectLiveSectionNames() {
    const used = collectUsedSectionNames(registry.getBlocks() ?? []);
    holder.querySelectorAll?.('.document-section[data-section-name]')?.forEach((el: Element) => {
      const name = el.getAttribute('data-section-name');
      if (name) used.add(name);
    });
    return used;
  }

  /** Names allocated for in-flight inserts before registry/DOM catch up. */
  const pendingSectionNames = new Set<string>();

  function allocateSectionName() {
    const used = collectLiveSectionNames();
    for (const name of pendingSectionNames) used.add(name);
    const next = allocateUniqueSectionName(used, DEFAULT_SECTION_NAME);
    pendingSectionNames.add(next);
    queueMicrotask(() => {
      const live = collectLiveSectionNames();
      for (const name of [...pendingSectionNames]) {
        if (live.has(name)) pendingSectionNames.delete(name);
      }
    });
    return next;
  }

  function createUniqueSectionData(extra: Record<string, unknown> = {}) {
    const name = allocateSectionName();
    return {
      name,
      label: '',
      segments: [],
      fieldValues: {},
      ...extra,
    };
  }

  function getHistorySnapshot() {
    const snap: any = {
      fieldSchemas: registry.getFieldSchemas() ?? {},
      blocks: registry.getBlocks() ?? [],
    };
    if (Object.keys(documentPageSetup).length > 0) {
      snap.pageSetup = documentPageSetup;
    }
    if (documentFieldMapping) {
      snap.fieldMapping = documentFieldMapping;
    }
    return cloneHistorySnapshot(snap);
  }

  function scheduleHistoryRecord(immediate = false) {
    if (destroyed || historyBusy || documentHistory.isSuspended()) return;

    const run = () => {
      historyTimer = null;
      if (destroyed || historyBusy || documentHistory.isSuspended()) return;
      documentHistory.record(getHistorySnapshot());
    };

    if (immediate) {
      if (historyTimer) {
        clearTimeout(historyTimer);
        historyTimer = null;
      }
      run();
      return;
    }

    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(run, 400);
  }

  function flushHistoryRecord() {
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = null;
      if (!destroyed && !historyBusy && !documentHistory.isSuspended()) {
        documentHistory.record(getHistorySnapshot());
      }
    }
  }

  function canSoftRestoreHistory(snapshot: any) {
    if (!editor || !snapshot || destroyed) return false;
    const snapBlocks = snapshot.blocks ?? [];
    const liveBlocks = listEditorBlocks();
    if (liveBlocks.length !== snapBlocks.length) return false;

    for (let i = 0; i < snapBlocks.length; i += 1) {
      const snapBlock = snapBlocks[i];
      if (!snapBlock || snapBlock.type !== 'documentSection') return false;
      const section = liveBlocks[i]?.querySelector?.('.document-section') as any;
      if (!section?.__documentSectionTool?.applyHistoryData) return false;
    }
    return true;
  }

  function softRestoreHistory(snapshot: any) {
    const normalized = normalizeDocument(snapshot, {
      defaultDocument: options.defaultDocument,
      visionTableFieldId: options.visionTableFieldId,
    });
    registry.setFieldSchemas({ ...normalized.fieldSchemas });
    registry.setBlocks(normalized.blocks ?? []);
    options.onSchemaChange?.(registry.getFieldSchemas());

    documentPageSetup = snapshot.pageSetup
      ? migratePageSetup(JSON.parse(JSON.stringify(snapshot.pageSetup)))
      : {};
    documentFieldMapping = snapshot.fieldMapping
      ? normalizeFieldMappingSpec(snapshot.fieldMapping)
      : null;
    syncStylesFromPageSetup();

    const liveBlocks = listEditorBlocks();
    const snapBlocks = normalized.blocks ?? [];
    for (let i = 0; i < snapBlocks.length; i += 1) {
      const block = snapBlocks[i];
      if (block?.type !== 'documentSection') continue;
      const section = liveBlocks[i]?.querySelector?.('.document-section') as any;
      section?.__documentSectionTool?.applyHistoryData?.(block.data ?? {});
    }

    refreshSectionVisibility();
  }

  async function restoreHistorySnapshot(snapshot: any, focusHint: any = null) {
    if (!snapshot || historyBusy || destroyed) return false;
    historyBusy = true;
    const resume = documentHistory.suspend();
    try {
      if (historyTimer) {
        clearTimeout(historyTimer);
        historyTimer = null;
      }
      if (canSoftRestoreHistory(snapshot)) {
        softRestoreHistory(snapshot);
      } else {
        initEditor(snapshot);
        if (editor) await editor.isReady;
      }
      if (useDesignPanels && designMode && propertiesPanel) {
        syncPropertiesPanel();
      }
      options.onChange?.(await getDocument());
      restoreEditorFocusAfterHistory(focusHint);
      return true;
    } catch {
      return false;
    } finally {
      resume();
      historyBusy = false;
    }
  }

  function captureHistoryFocusHint() {
    const active = document.activeElement;
    const editable =
      (active?.closest?.('.document-section__body') as HTMLElement | null) ??
      (lastFocusedEditable?.isConnected ? lastFocusedEditable : null) ??
      null;
    if (!editable || !holder.contains(editable)) {
      return { sectionIndex: 0 };
    }
    const sections = [...holder.querySelectorAll('.document-section__body')];
    const sectionIndex = Math.max(0, sections.indexOf(editable));
    const sectionName =
      editable.closest?.('.document-section')?.getAttribute?.('data-section-name') ?? null;
    return { sectionIndex, sectionName };
  }

  function resolveHistoryFocusEditable(focusHint: any = null) {
    const editables = [...holder.querySelectorAll('.document-section__body')];
    if (!editables.length) return null;
    if (focusHint?.sectionName) {
      const byName = editables.find(
        (el) =>
          el.closest?.('.document-section')?.getAttribute?.('data-section-name') ===
          focusHint.sectionName,
      );
      if (byName) return byName;
    }
    const index = Number(focusHint?.sectionIndex);
    if (Number.isFinite(index) && index >= 0 && index < editables.length) {
      return editables[index];
    }
    return editables[0];
  }

  function restoreEditorFocusAfterHistory(focusHint: any = null) {
    if (destroyed) return;
    const editable = resolveHistoryFocusEditable(focusHint);
    if (!editable || typeof editable.focus !== 'function') return;

    lastFocusedEditable = editable;
    const focusEditable = () => {
      if (!editable.isConnected || destroyed) return;
      editable.focus({ preventScroll: true });
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        // linkedom / restricted selections
      }
      if (!options.mappingMode) {
        richTextToolbar?.show?.(editable);
      }
    };

    // Remount finishes asynchronously; focus after the new editable is interactive.
    requestAnimationFrame(() => {
      requestAnimationFrame(focusEditable);
    });
  }

  async function undoDocument() {
    flushHistoryRecord();
    const focusHint = captureHistoryFocusHint();
    const snapshot = documentHistory.undo();
    if (!snapshot) return false;
    return restoreHistorySnapshot(snapshot, focusHint);
  }

  async function redoDocument() {
    flushHistoryRecord();
    const focusHint = captureHistoryFocusHint();
    const snapshot = documentHistory.redo();
    if (!snapshot) return false;
    return restoreHistorySnapshot(snapshot, focusHint);
  }

  function shouldHandleHistoryShortcut(e: KeyboardEvent) {
    const raw = e.target as any;
    const el = raw?.nodeType === Node.ELEMENT_NODE ? raw : raw?.parentElement;
    if (!el) return false;
    if (el.closest?.('.modal-overlay:not([hidden])')) return false;
    if (el.closest?.('input, textarea, select')) {
      // Let native undo work in property forms / prompts outside the canvas.
      if (!el.closest?.('.document-section__body, .document-columns__col')) return false;
    }
    return true;
  }

  function refreshSectionVisibility() {
    if (designMode || options.mappingMode) return;
    const blocks = registry.getBlocks() ?? [];
    const values = collectAllFieldValuesFromHolder(holder);
    const schemas = registry.getFieldSchemas();
    const blockEls = [...holder.querySelectorAll('.ce-block')];

    for (let index = 0; index < blockEls.length; index += 1) {
      const blockEl = blockEls[index] as HTMLElement;
      const block = blocks[index];
      if (block?.type !== 'documentSection') {
        blockEl.hidden = false;
        continue;
      }
      blockEl.hidden = !evaluateSectionVisibility(block.data?.visibility, values, schemas);
    }
  }

  async function getBlocksForProperties() {
    await editor.isReady;
    let blocks = registry.getBlocks() ?? [];
    if (!blocks.length) {
      const saved = await editor.save();
      blocks = saved.blocks ?? [];
      registry.setBlocks(blocks);
    }
    return blocks;
  }

  /**
   * When a table cell token is selected but its schema was never materialised
   * (or was pruned), recreate cell schemas so the properties panel can open.
   */
  function ensureFieldSchemaForProperties(fieldId: any,token: any = null) {
    const schemas = registry.getFieldSchemas();
    if (schemas[fieldId]) return schemas[fieldId];

    const tableId = token?.dataset?.tableId;
    const wrapper = tableId
      ? (token?.closest?.('.document-table') ??
        holder.querySelector(`.document-table[data-table-id="${CSS.escape(tableId)}"]`))
      : null;

    const { fieldSchemas: next, schema } = ensureSchemaForFieldProperties(fieldId, schemas, {
      tableId,
      rowKey: token?.dataset?.rowKey,
      colKey: token?.dataset?.colKey,
      rows: wrapper ? readTableRowsFromDom(wrapper) : undefined,
    });

    if (!schema) return null;
    if (next !== schemas) registry.setFieldSchemas(next);
    return schema;
  }

  async function loadFieldProperties(fieldId: any,token: any = null) {
    if (!propertiesPanel || !editor) return;

    const schema =
      registry.getFieldSchemas()[fieldId] ??
      ensureFieldSchemaForProperties(fieldId, token ?? findLiveFieldToken(fieldId, holder));
    if (!schema) return;

    try {
      const blocks = await getBlocksForProperties();
      const schemas = registry.getFieldSchemas();
      const liveSchema = schemas[fieldId] ?? schema;
      const placement = findFieldPlacement(fieldId, blocks);
      selectedSectionBlockIndex = -1;
      updateSectionSelectionHighlight();
      clearColumnsSelection();

      if (liveSchema.type === 'table') {
        const tableEl = findLiveTableEl(fieldId);
        if (tableEl) {
          clearTableSelection();
          selectedTableEl = tableEl;
          tableEl.classList.add('document-table--selected');
        } else {
          clearTableSelection();
        }
      } else {
        clearTableSelection();
      }

      propertiesPanel.showField(fieldId, liveSchema, {
        sectionName: placement.sectionName,
        sectionLabel: placement.sectionName,
        blocks,
        fieldSchemas: schemas,
      });
    } catch {
      // editor not ready
    }
  }

  async function applySchemaSaveResult(result: any,previousType: any,previousSchema: any) {
    const { fieldId: newFieldId, previousFieldId, schema: updated } = result;
    const idChanged = newFieldId !== previousFieldId;
    const typeChanged = previousType !== updated.type;

    // Compatible inline type change — update schema + tokens without remounting Editor.js.
    if (!idChanged && typeChanged && canRefreshFieldTypeInDom(previousType, updated.type)) {
      const defaultValue = resolveSchemaDefaultValue(updated, { forTemplate: true });
      let nextSchemas = syncColumnListSourceSettings(previousFieldId, updated, {
        ...registry.getFieldSchemas(),
        [previousFieldId]: updated,
      });
      registry.setFieldSchemas(nextSchemas);

      const registryBlocks = registry.getBlocks() ?? [];
      if (registryBlocks.length) {
        registry.setBlocks(syncBlocksAfterSchemaChange(registryBlocks, previousFieldId, updated));
      }

      const tokenSelector = `.field-token[data-field-id="${CSS.escape(previousFieldId)}"]`;
      for (const section of holder.querySelectorAll('.document-section')) {
        const tool = (section as any).__documentSectionTool;
        if (!tool?.data) continue;
        if (!section.querySelector(tokenSelector)) continue;
        if (!tool.data.fieldValues || typeof tool.data.fieldValues !== 'object') {
          tool.data.fieldValues = {};
        }
        tool.data.fieldValues[previousFieldId] = defaultValue;
      }

      const ctx = { getRegistry: () => registry, fieldValueStyle };
      for (const token of holder.querySelectorAll(tokenSelector)) {
        updateFieldToken(token, defaultValue, updated.label ?? token.dataset.placeholder, ctx);
      }

      for (const wrapper of holder.querySelectorAll('.template-block')) {
        if (!wrapper.querySelector(tokenSelector)) continue;
        for (const cls of [...wrapper.classList]) {
          if (cls.startsWith('template-block--')) wrapper.classList.remove(cls);
        }
        wrapper.classList.add(`template-block--${updated.type}`);
      }

      refreshFieldSchemaInDom(previousFieldId, ctx, holder);
      const cellRef = parseCellFieldId(previousFieldId, registry.getFieldSchemas());
      if (cellRef) {
        refreshTableColumnStylesForFieldIds(
          [previousFieldId],
          registry.getFieldSchemas(),
          holder,
          fieldValueStyle,
        );
      }

      options.onSchemaChange?.(registry.getFieldSchemas());
      scheduleHistoryRecord(true);
      return true;
    }

    if (idChanged || typeChanged) {
      const saved = await editor.save();
      let nextSchemas = registry.getFieldSchemas();
      let nextBlocks = saved.blocks;

      if (idChanged) {
        try {
          const changeResult = applyFieldIdChange(
            previousFieldId,
            newFieldId,
            updated,
            nextSchemas,
            nextBlocks,
          );
          nextSchemas = changeResult.fieldSchemas;
          nextBlocks = changeResult.blocks;
        } catch (err: any) {
          showNotification(err.message ?? 'Could not rename field ID.');
          return false;
        }
      } else {
        registry.updateFieldSchema(previousFieldId, updated);
        nextSchemas = registry.getFieldSchemas();
        nextBlocks = syncBlocksAfterSchemaChange(nextBlocks, previousFieldId, updated);
      }

      if (updated.type === 'table') {
        const migrated = syncTableColumnKeyChanges(
          newFieldId,
          previousSchema.columns,
          updated.columns,
          nextSchemas,
          nextBlocks,
        );
        nextSchemas = migrated.fieldSchemas;
        nextBlocks = migrated.blocks;
        nextSchemas = ensureCellSchemas(updated, newFieldId, nextSchemas, undefined);
      }

      if (updated.type === 'child') {
        nextBlocks = normalizeRepeaterFieldInBlocks(nextBlocks, newFieldId, updated);
      }

      registry.setFieldSchemas(nextSchemas);
      options.onSchemaChange?.(registry.getFieldSchemas());

      initEditor({
        time: saved.time,
        fieldSchemas: registry.getFieldSchemas(),
        blocks: nextBlocks,
      });
      return true;
    }

    if (updated.type === 'table') {
      if (!idChanged && isTableWidthOnlyChange(previousSchema, updated)) {
        registry.updateFieldSchema(previousFieldId, {
          ...previousSchema,
          ...updated,
          columns: updated.columns,
        });
        applyTableColumnWidthsToElement(findLiveTableEl(previousFieldId), updated.columns);
        options.onSchemaChange?.(registry.getFieldSchemas());
        return true;
      }

      const saved = await editor.save();
      let nextSchemas = registry.getFieldSchemas();
      let nextBlocks = saved.blocks;

      if (previousSchema.type === 'table') {
        const migrated = syncTableColumnKeyChanges(
          previousFieldId,
          previousSchema.columns,
          updated.columns,
          nextSchemas,
          nextBlocks,
        );
        nextSchemas = migrated.fieldSchemas;
        nextBlocks = migrated.blocks;
      }

      registry.updateFieldSchema(previousFieldId, updated);
      nextSchemas = ensureCellSchemas(updated, previousFieldId, {
        ...nextSchemas,
        [previousFieldId]: updated,
      }, undefined);
      registry.setFieldSchemas(nextSchemas);
      options.onSchemaChange?.(registry.getFieldSchemas());

      initEditor({
        time: saved.time,
        fieldSchemas: registry.getFieldSchemas(),
        blocks: nextBlocks,
      });
      return true;
    }

    if (updated.type === 'child') {
      const saved = await editor.save();
      let nextBlocks = saved.blocks;

      registry.updateFieldSchema(previousFieldId, updated);
      nextBlocks = normalizeRepeaterFieldInBlocks(nextBlocks, previousFieldId, updated);
      registry.setFieldSchemas(registry.getFieldSchemas());
      options.onSchemaChange?.(registry.getFieldSchemas());

      initEditor({
        time: saved.time,
        fieldSchemas: registry.getFieldSchemas(),
        blocks: nextBlocks,
      });
      return true;
    }

    const nextSchemas = syncColumnListSourceSettings(previousFieldId, updated, {
      ...registry.getFieldSchemas(),
      [previousFieldId]: updated,
    });
    registry.setFieldSchemas(nextSchemas);
    options.onSchemaChange?.(registry.getFieldSchemas());
    refreshFieldSchemaInDom(previousFieldId, { getRegistry: () => registry, fieldValueStyle }, holder);
    const cellRef = parseCellFieldId(previousFieldId, registry.getFieldSchemas());
    if (cellRef) {
      refreshTableColumnStylesForFieldIds(
        [previousFieldId],
        registry.getFieldSchemas(),
        holder,
        fieldValueStyle,
      );
    }
    return true;
  }

  async function handlePaletteDrop(item: any,container: any,clientX: any,clientY: any) {
    const opts = getInlineFieldOptions();

    if (item.kind === 'layout' && item.type === 'columns') {
      insertColumnsAtPoint(container, clientX, clientY, opts);
      return;
    }

    if (item.kind !== 'field') return;

    if (getFieldHandler(item.type)?.insertion === 'table' || item.type === 'table') {
      const { fieldId } = await insertPaletteTableAtPoint(container, clientX, clientY, opts);
      options.onSchemaChange?.(registry.getFieldSchemas());
      await handleEditSchema(fieldId);
      return;
    }

    if (item.type === 'child') {
      const { fieldId } = await insertPaletteFieldAtPoint(container, 'child', clientX, clientY, opts);
      options.onSchemaChange?.(registry.getFieldSchemas());
      await handleEditSchema(fieldId);
      return;
    }

    if (isInlineFieldType(item.type)) {
      const { fieldId } = await insertPaletteFieldAtPoint(container, item.type, clientX, clientY, opts);
      options.onSchemaChange?.(registry.getFieldSchemas());
      await handleEditSchema(fieldId);
    }
  }

  async function insertDocumentSection(atIndex: any) {
    if (!editor) return;
    await editor.isReady;
    const count = editor.blocks.getBlocksCount();
    const index = atIndex ?? count;
    const sectionData = createUniqueSectionData();
    await editor.blocks.insert('documentSection', sectionData, {}, index);
    selectedSectionBlockIndex = index;
    if (propertiesPanel) {
      propertiesPanel.showSection(index, {
        name: sectionData.name,
        label: sectionData.label,
      });
      updateSectionSelectionHighlight();
    }
  }

  async function insertColumnsIntoTargetSection() {
    await editor.isReady;
    let editable = resolveTargetEditable();
    if (!editable) {
      editable = await ensureDocumentSectionAtEnd();
    } else {
      editable.focus();
    }
    if (!editable) return;

    insertColumnsAtCaret(editable, getInlineFieldOptions());
    editable.dispatchEvent(new InputEvent('input', { bubbles: true }));
    lastFocusedEditable = editable;
  }

  async function handleSaveSection({
    blockIndex,
    name,
    label,
    repeatable,
    hideTitleInPreview,
    borderTop,
    borderBottom,
    visibility,
    sectionEl,
  }: any) {
    if (!editor) return;
    const saved = await editor.save();
    const blocks = [...saved.blocks];
    const block = blocks[blockIndex];
    if (!block || block.type !== 'documentSection') return;

    const oldSectionName = resolveSectionName(block.data);
    const clearedRepeatableIndexes: number[] = [];

    if (repeatable) {
      for (let i = 0; i < blocks.length; i += 1) {
        if (i === blockIndex) continue;
        const other = blocks[i];
        if (other.type === 'documentSection' && other.data?.repeatable) {
          other.data = { ...other.data, repeatable: false };
          blocks[i] = other;
          clearedRepeatableIndexes.push(i);
        }
      }
    }

    block.data = {
      ...block.data,
      name,
      label,
      repeatable: !!repeatable,
      hideTitleInPreview: !!hideTitleInPreview,
      borderTop: !!borderTop,
      borderBottom: !!borderBottom,
      visibility: visibility ?? null,
    };
    blocks[blockIndex] = block;

    const newSectionName = resolveSectionName(block.data);
    const nameChanged = oldSectionName !== newSectionName;

    if (!nameChanged) {
      registry.setBlocks(blocks);

      const section =
        sectionEl ??
        listEditorBlocks()[blockIndex]?.querySelector('.document-section') ??
        null;
      const tool = section?.__documentSectionTool;
      if (tool?.applyPropertiesPatch) {
        tool.applyPropertiesPatch({
          name,
          label,
          repeatable: !!repeatable,
          hideTitleInPreview: !!hideTitleInPreview,
          borderTop: !!borderTop,
          borderBottom: !!borderBottom,
          visibility: visibility ?? null,
        });
      }

      for (const index of clearedRepeatableIndexes) {
        const otherSection = listEditorBlocks()[index]?.querySelector('.document-section');
        const otherTool = otherSection?.__documentSectionTool;
        otherTool?.applyPropertiesPatch?.({ repeatable: false });
      }

      selectedSectionBlockIndex = blockIndex;
      updateSectionSelectionHighlight();
      scheduleHistoryRecord(true);
      options.onChange?.(await getDocument());
      return;
    }

    let nextSchemas = registry.getFieldSchemas();
    nextSchemas = renameSectionInFormulas(nextSchemas, oldSectionName, newSectionName);
    const result = rebuildFieldIdsForSection(block, nextSchemas, blocks);
    nextSchemas = result.fieldSchemas;
    const nextBlocks = result.blocks;

    registry.setFieldSchemas(nextSchemas);
    options.onSchemaChange?.(registry.getFieldSchemas());
    selectedSectionBlockIndex = blockIndex;

    initEditor({
      time: saved.time,
      fieldSchemas: nextSchemas,
      blocks: nextBlocks,
      pageSetup: documentPageSetup,
    });

    if (!designMode || !useDesignPanels) return;

    try {
      await editor.isReady;
      await loadSelectedSectionProperties();
    } catch {
      // editor not ready
    }
  }

  function openPageSetupPanel() {
    selectedSectionBlockIndex = -1;
    clearStructureSelection();
    clearAllDesignTokenSelection(holder);
    updateSectionSelectionHighlight();
    propertiesPanel?.showDocument(documentPageSetup);
  }

  async function handleSaveDocument(pageSetup: any) {
    documentPageSetup = pageSetup ? JSON.parse(JSON.stringify(pageSetup)) : {};
    syncStylesFromPageSetup();
    scheduleHistoryRecord(true);
    options.onChange?.(await getDocument());
  }

  function clearColumnsSelection(columnsEl: any = null) {
    const selector = columnsEl
      ? null
      : '.document-columns--selected';
    if (columnsEl) {
      columnsEl.classList.remove('document-columns--selected');
    } else {
      holder.querySelectorAll(selector).forEach((el: any) => {
        el.classList.remove('document-columns--selected');
      });
    }
    if (!columnsEl || selectedColumnsEl === columnsEl) {
      selectedColumnsEl = null;
    }
  }

  function clearTableSelection(tableEl: any = null) {
    const selector = tableEl ? null : '.document-table--selected';
    if (tableEl) {
      tableEl.classList.remove('document-table--selected');
    } else {
      holder.querySelectorAll(selector).forEach((el: any) => {
        el.classList.remove('document-table--selected');
      });
    }
    if (!tableEl || selectedTableEl === tableEl) {
      selectedTableEl = null;
    }
  }

  function clearStructureSelection() {
    clearColumnsSelection();
    clearTableSelection();
  }

  function findLiveTableEl(tableId: any) {
    if (!tableId) return null;
    try {
      return holder.querySelector(`.document-table[data-table-id="${CSS.escape(tableId)}"]`);
    } catch {
      return null;
    }
  }

  function removeTableSchemas(tableId: any) {
    if (!tableId) return;
    const next = { ...registry.getFieldSchemas() };
    delete next[tableId];
    const prefix = `${tableId}_`;
    for (const key of Object.keys(next)) {
      if (key.startsWith(prefix)) delete next[key];
    }
    registry.setFieldSchemas(next);
    options.onSchemaChange?.(next);
  }

  function removeOwnedSchemasFromSubtree(root: any) {
    if (!root?.querySelectorAll) return;
    const tableIds = new Set();
    root.querySelectorAll('.document-table[data-table-id]').forEach((el: any) => {
      if (el.dataset.tableId) tableIds.add(el.dataset.tableId);
    });
    for (const tableId of tableIds) {
      removeTableSchemas(tableId);
    }

    root.querySelectorAll('.field-token[data-field-id]:not(.field-token--cell)').forEach((token: any) => {
      const fieldId = token.dataset.fieldId;
      if (!fieldId || tableIds.has(fieldId)) return;
      handleDeleteSchema(fieldId);
    });
  }

  function selectColumnsEl(columnsEl: any) {
    if (!columnsEl?.isConnected) return;
    clearAllDesignTokenSelection(holder);
    selectedSectionBlockIndex = -1;
    updateSectionSelectionHighlight();
    clearStructureSelection();
    selectedColumnsEl = columnsEl;
    columnsEl.classList.add('document-columns--selected');
    focusStructureTarget(columnsEl);
    loadSelectedColumnsProperties(columnsEl);
  }

  function selectTableEl(tableEl: any) {
    if (!tableEl?.isConnected) return;
    const tableId = tableEl.dataset.tableId;
    const alreadyShowing = selectedTableEl === tableEl
      && propertiesPanel?.getCurrentFieldId?.() === tableId;
    if (alreadyShowing) {
      tableEl.classList.add('document-table--selected');
      focusStructureTarget(tableEl);
      return;
    }
    clearAllDesignTokenSelection(holder);
    selectedSectionBlockIndex = -1;
    updateSectionSelectionHighlight();
    clearStructureSelection();
    selectedTableEl = tableEl;
    tableEl.classList.add('document-table--selected');
    focusStructureTarget(tableEl);
    if (tableId) void loadFieldProperties(tableId, null);
  }

  function loadSelectedColumnsProperties(columnsEl: any = selectedColumnsEl) {
    if (!columnsEl?.isConnected || !propertiesPanel) return;
    const widths = [
      columnsEl.dataset.columnWidth0 ?? '',
      columnsEl.dataset.columnWidth1 ?? '',
    ];
    propertiesPanel.showColumns(columnsEl, { widths });
  }

  function notifyStructureRemoved(sectionBody: any) {
    sectionBody?.dispatchEvent?.(new InputEvent('input', { bubbles: true }));
    scheduleHistoryRecord(true);
    if (propertiesPanel && designMode && useDesignPanels) {
      propertiesPanel.showEmpty();
    }
  }

  function deleteSelectedColumnsBlock() {
    const columnsEl = selectedColumnsEl;
    if (!columnsEl?.isConnected) return false;
    const sectionBody = columnsEl.closest('.document-section__body');
    removeOwnedSchemasFromSubtree(columnsEl);
    clearColumnsSelection(columnsEl);
    columnsEl.remove();
    notifyStructureRemoved(sectionBody);
    return true;
  }

  function deleteSelectedTableBlock() {
    const tableEl = selectedTableEl;
    if (!tableEl?.isConnected) return false;
    const sectionBody = tableEl.closest('.document-section__body');
    const tableId = tableEl.dataset.tableId;
    clearTableSelection(tableEl);
    tableEl.remove();
    removeTableSchemas(tableId);
    notifyStructureRemoved(sectionBody);
    return true;
  }

  async function deleteSelectedSectionBlock() {
    if (!editor || selectedSectionBlockIndex < 0) return false;
    const index = selectedSectionBlockIndex;
    const before = countLiveDocumentSections();
    if (before <= 1) {
      showNotification('At least one section is required.', { type: 'status' });
      return false;
    }

    const sectionEl =
      listEditorBlocks()[index]?.querySelector('.document-section') ?? null;
    if (sectionEl) removeOwnedSchemasFromSubtree(sectionEl);

    editor.blocks.delete(index);
    // Guard may no-op when only one section remains.
    if (countLiveDocumentSections() >= before) return false;

    selectedSectionBlockIndex = -1;
    clearStructureSelection();
    clearAllDesignTokenSelection(holder);
    updateSectionSelectionHighlight();
    propertiesPanel?.showEmpty();
    scheduleHistoryRecord(true);
    return true;
  }

  function focusStructureTarget(el: any) {
    if (!el?.isConnected) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try {
      el.focus({ preventScroll: true });
    } catch {
      // ignore focus failures (hidden / detached)
    }
  }

  function shouldIgnoreStructureDeleteKey(e: KeyboardEvent) {
    const candidates = [];
    if (typeof e.composedPath === 'function') {
      for (const node of e.composedPath()) {
        if (node instanceof Element) {
          candidates.push(node);
          break;
        }
      }
    }
    const target = e.target;
    if (target instanceof Element) candidates.push(target);
    else if (target && (target as Node).parentElement) candidates.push((target as Node).parentElement);
    if (document.activeElement instanceof Element) candidates.push(document.activeElement);

    for (const el of candidates) {
      if (!el) continue;
      if (el.closest?.('.modal-overlay:not([hidden])')) return true;
      // Allow Delete to remove a selected section/table even when caret is in a
      // section body; only skip real form controls (e.g. Properties inputs).
      if (el.closest?.('input, textarea, select, .schema-editor, .document-section__label-input, .document-section__name-input')) {
        return true;
      }
    }

    // Prefer field-token Delete handling when fields are selected.
    if (getSelectedDesignFieldTokens().length) return true;
    return false;
  }

  async function handleSaveColumns({ columnsEl, widths }: any) {
    if (!columnsEl?.isConnected) return;
    applyColumnWidthsToElement(columnsEl, widths);
    const sectionBody = columnsEl.closest('.document-section__body');
    sectionBody?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    selectedColumnsEl = columnsEl;
    scheduleHistoryRecord(true);
  }

  function syncPropertiesPanel() {
    if (!useDesignPanels || !designMode || !propertiesPanel) return;

    const tokens = getSelectedDesignFieldTokens();
    if (tokens.length >= 1) {
      const token = tokens[0];
      const fieldId = token.dataset.fieldId;
      if (fieldId) {
        const schema =
          registry.getFieldSchemas()[fieldId] ??
          ensureFieldSchemaForProperties(fieldId, token);
        if (schema) {
          selectedSectionBlockIndex = -1;
          clearStructureSelection();
          updateSectionSelectionHighlight();
          void loadFieldProperties(fieldId, token);
          return;
        }
      }
      // Keep selection highlighted; do not wipe the panel to empty while a
      // field token is still selected (e.g. schema briefly unavailable).
      return;
    }

    if (selectedSectionBlockIndex >= 0) {
      clearStructureSelection();
      void loadSelectedSectionProperties();
      return;
    }

    if (selectedColumnsEl?.isConnected) {
      updateSectionSelectionHighlight();
      clearTableSelection();
      loadSelectedColumnsProperties();
      return;
    }

    if (selectedTableEl?.isConnected) {
      updateSectionSelectionHighlight();
      clearColumnsSelection();
      return;
    }

    updateSectionSelectionHighlight();
    clearStructureSelection();
    propertiesPanel.showEmpty();
  }

  async function insertPaletteFieldInline(fieldType: any) {
    await editor.isReady;
    let editable = resolveTargetEditable();
    // Capture before focus() collapses the selection in some browsers.
    const savedRange = editable ? saveSelection(editable) : null;
    const preferredLabel = editable
      ? resolveSelectedTextForFieldConversion(editable, savedRange)
      : '';
    if (!editable) {
      editable = await ensureDocumentSectionAtEnd();
    } else {
      editable.focus();
    }
    if (!editable) return;

    const { fieldId, token } = await insertInlineField(editable, fieldType, {
      ...getInlineFieldOptions(),
      ...(preferredLabel ? { preferredLabel, savedRange } : {}),
    });
    if (useDesignPanels && designMode && fieldId) {
      await handleEditSchema(fieldId);
    }
    if (token.isConnected) {
      focusCaretAfter(token);
    } else {
      focusCaretAtEnd(editable);
    }
    lastFocusedEditable = editable;
  }

  async function insertPaletteTableInline() {
    await editor.isReady;
    let editable = resolveTargetEditable();
    if (!editable) {
      editable = await ensureDocumentSectionAtEnd();
    } else {
      editable.focus();
    }
    if (!editable) return;

    const { fieldId } = insertTableAtCaret(editable, getInlineFieldOptions());
    options.onSchemaChange?.(registry.getFieldSchemas());
    wireTableRegions(editable, {
      ...getInlineFieldOptions(),
      onStructureChange: () => {
        editable.dispatchEvent(new InputEvent('input', { bubbles: true }));
      },
    });
    editable.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await handleEditSchema(fieldId);
    lastFocusedEditable = editable;
  }

  async function insertPaletteRepeaterInline() {
    await insertPaletteFieldInline('child');
  }
  void insertPaletteRepeaterInline;

  function normalizeRepeaterFieldInBlocks(blocks: any,fieldId: any,repeaterSchema: any) {
    const updated = normalizeRepeaterSchema(repeaterSchema);
    return blocks.map((block: any) => {
      if (block.type === 'documentSection' && block.data?.fieldValues?.[fieldId] !== undefined) {
        return {
          ...block,
          data: {
            ...block.data,
            fieldValues: {
              ...block.data.fieldValues,
              [fieldId]: normalizeRepeaterValue(block.data.fieldValues[fieldId], updated),
            },
          },
        };
      }
      if (
        block.type === 'templateBlock' &&
        block.data?.fieldId === fieldId &&
        block.data?.fieldType === 'child'
      ) {
        return {
          ...block,
          data: {
            ...block.data,
            value: normalizeRepeaterValue(block.data.value, updated),
          },
        };
      }
      return block;
    });
  }

  async function handleSectionNameChange() {
    if (!editor) return;
    const saved = await editor.save();
    let nextSchemas = registry.getFieldSchemas();
    let nextBlocks = saved.blocks;

    for (const block of nextBlocks) {
      if (block.type !== 'documentSection') continue;
      const result = rebuildFieldIdsForSection(block, nextSchemas, nextBlocks);
      nextSchemas = result.fieldSchemas;
      nextBlocks = result.blocks;
    }

    registry.setFieldSchemas(nextSchemas);
    options.onSchemaChange?.(registry.getFieldSchemas());
    initEditor({
      time: saved.time,
      fieldSchemas: nextSchemas,
      blocks: nextBlocks,
    });
  }

  async function applyRepeaterSchemaUpdate(fieldId: any,schema: any,{ reinit = true }: any = {}) {
    let blocks = registry.getBlocks() ?? [];
    let savedTime = Date.now();
    if (editor && reinit) {
      const saved = await editor.save();
      blocks = saved.blocks ?? blocks;
      savedTime = saved.time;
    }

    const sanitized = sanitizeRepeaterChildSchemas(
      normalizeRepeaterSchema(schema),
      registry.getFieldSchemas(),
      blocks,
    );

    registry.updateFieldSchema(fieldId, sanitized);
    options.onSchemaChange?.(registry.getFieldSchemas());

    if (editor && reinit) {
      const nextBlocks = normalizeRepeaterFieldInBlocks(blocks, fieldId, sanitized);
      initEditor({
        time: savedTime,
        fieldSchemas: registry.getFieldSchemas(),
        blocks: nextBlocks,
      });
    }

    return sanitized;
  }

  /**
   * Persist repeater schema without destroying the live editor DOM.
   * Used while a fill-mode Child modal is open so the click handler's token
   * (and section callbacks) stay connected.
   */
  async function applyRepeaterSchemaUpdateSoft(fieldId: any,schema: any) {
    return applyRepeaterSchemaUpdate(fieldId, schema, { reinit: false });
  }

  /**
   * Prefer the repeater value that carries more child keys (token vs last save).
   * An empty `{}` stored value must not eclipse a populated token value.
   */
  function pickRicherRepeaterValue(storedValue: any,tokenValue: any) {
    const storedObj =
      storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue)
        ? storedValue
        : null;
    const tokenObj =
      tokenValue && typeof tokenValue === 'object' && !Array.isArray(tokenValue)
        ? tokenValue
        : null;
    if (!storedObj && tokenObj) return tokenValue;
    if (storedObj && !tokenObj) return storedValue;
    if (!storedObj && !tokenObj) {
      return storedValue !== undefined ? storedValue : tokenValue;
    }
    const storedKeys = Object.keys(storedObj).filter((key: any) => key !== 'instances').length;
    const tokenKeys = Object.keys(tokenObj).filter((key: any) => key !== 'instances').length;
    if (tokenKeys > storedKeys) return tokenValue;
    if (storedKeys > 0) return storedValue;
    return tokenValue !== undefined ? tokenValue : storedValue;
  }

  function promptRepeaterTemplateUpload(fieldId: any) {
    return new Promise((resolve: any) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.hidden = true;
      document.body.appendChild(input);

      const finish = (result: any) => {
        input.remove();
        resolve(result);
      };

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }
        try {
          const text = await file.text();
          finish(parseRepeaterTemplateImport(JSON.parse(text), fieldId));
        } catch (err: any) {
          showNotification(err?.message ?? 'Could not read repeater template file.', { type: 'error' });
          finish(null);
        }
      });

      input.addEventListener('cancel', () => finish(null));
      input.click();
    });
  }

  async function handleOpenRepeaterEditor({ fieldId, value }: any) {
    const parentSchemas = registry.getFieldSchemas();
    let blocks: any[] = [];
    if (editor) {
      const saved = await editor.save();
      blocks = saved.blocks ?? [];
    }
    let schema = parentSchemas[fieldId];
    if (!schema || schema.type !== 'child') {
      return extractRepeaterFieldValueFromBlocks(fieldId, blocks) ?? value;
    }

    const storedValue = extractRepeaterFieldValueFromBlocks(fieldId, blocks);
    // Prefer the richer of DOM token value vs last saved section value.
    const resolvedValue = stripForeignKeysFromRepeaterValue(
      pickRicherRepeaterValue(storedValue, value),
      parentSchemas,
      schema,
    );

    // Soft schema updates only — never reinitEditor here. A full reinit would
    // detach the token/callback that opened this modal, so Save couldn't update
    // the live Child cell in the main form.
    const persistSchema = (next: any) => applyRepeaterSchemaUpdateSoft(fieldId, next);

    if (!schema.template?.blocks?.length) {
      const previousChildKeys = Object.keys(getRepeaterFieldSchemas(schema)).sort();
      schema = sanitizeRepeaterChildSchemas(schema, parentSchemas, blocks);
      const cleanedChildKeys = Object.keys(getRepeaterFieldSchemas(schema)).sort();
      if (cleanedChildKeys.join(',') !== previousChildKeys.join(',')) {
        schema = (await persistSchema(schema)) ?? schema;
      }
    }

    schema = ensureRepeaterChildSchemas(schema, resolvedValue, parentSchemas, blocks);

    const currentChildKeys = Object.keys(
      getRepeaterFieldSchemas(registry.getFieldSchemas()[fieldId] ?? {}),
    ).sort();
    const ensuredChildKeys = Object.keys(getRepeaterFieldSchemas(schema)).sort();
    if (ensuredChildKeys.join(',') !== currentChildKeys.join(',')) {
      schema = (await persistSchema(schema)) ?? schema;
    }

    if (!repeaterHasTemplate(schema)) {
      const imported = await promptRepeaterTemplateUpload(fieldId);
      if (imported) {
        schema = applyRepeaterTemplateImport(schema, imported);
        schema = (await persistSchema(schema)) ?? schema;
      }
    }

    if (!repeaterHasTemplate(schema)) {
      showNotification(
        'Repeater has no template. Upload a template JSON (kind: "template") when prompted, or upload one in design mode field properties.',
        { type: 'warning', key: `repeater-no-template:${fieldId}` },
      );
      return resolvedValue;
    }

    // Migrate legacy short storage keys (e.g. colliding "name"/"id") from the template.
    const migrated = normalizeRepeaterSchema(schema);
    if (
      migrated &&
      Object.keys(getRepeaterFieldSchemas(migrated)).join(',') !==
        Object.keys(getRepeaterFieldSchemas(schema)).join(',')
    ) {
      schema = (await persistSchema(migrated)) ?? migrated;
    }

    const normalized = normalizeRepeaterValue(resolvedValue, schema);
    const doc = buildRepeaterFillDocument(schema, normalized);
    const result = await repeaterEditorModal.open({
      title: schema.label ?? fieldId,
      data: doc,
      designMode: false,
    });

    // Use modal live fieldSchemas so newly added nested table rows are mapped.
    const extractSchema = {
      ...schema,
      template: {
        ...(schema.template ?? {}),
        fieldSchemas: {
          ...(schema.template?.fieldSchemas ?? {}),
          ...((result as any)?.fieldSchemas ?? {}),
        },
      },
    };
    const extracted = extractRepeaterValueFromDocument(result, extractSchema);
    const synced = syncRepeaterTemplateFromFillDocument(schema, result);
    if (synced) {
      await persistSchema(synced);
    }

    // Update the live main-form token immediately so Save is visible even if
    // the click-handler token reference is stale or structure-change races.
    const liveToken = findLiveFieldToken(fieldId, holder);
    if (liveToken) {
      updateFieldToken(liveToken, extracted, liveToken.dataset.placeholder, {
        getRegistry: () => registry,
        isTableCell: liveToken.classList.contains('field-token--cell'),
      });
    }

    return extracted;
  }

  function buildToolConfig() {
    return {
      ...pickerCallbacks,
      openRepeaterEditor: (opts: any) => handleOpenRepeaterEditor(opts),
      editorHolder: holder,
      getRegistry: () => registry,
      resolveListItems: options.resolveListItems,
      fieldValueStyle,
      getDocumentTextStyle: () => resolvePageSetupTextStyle(documentPageSetup),
      getProtectFieldsInFillMode: () => documentPageSetup.protectFieldsInFillMode !== false,
      designMode,
      fillModeFieldHighlight: !designMode && showFieldsInFillMode && !options.mappingMode,
      mappingMode: !!options.mappingMode,
      onMappingRuleChange: options.onMappingRuleChange,
      designPropertiesPanel: useDesignPanels && designMode,
      openEditor: !(useDesignPanels && designMode),
      onEditSchema: handleEditSchema,
      onDeleteSchema: handleDeleteSchema,
      onSectionNameChange: handleSectionNameChange,
      onPaletteDrop: handlePaletteDrop,
      allocateSectionName,
      onSectionDataChange: syncSectionDataToRegistry,
      onFieldValueChange: refreshSectionVisibility,
      onSchemaChange: (schemas: any) => options.onSchemaChange?.(schemas),
      onTableColumnWidthsChange: handleTableColumnWidthsChange,
      onTableColumnWidthsPreview: handleTableColumnWidthsPreview,
      onTableColumnResizeStart: handleTableColumnResizeStart,
      onColumnsWidthsChange: (columnsEl: any) => {
        if (columnsEl?.isConnected) {
          selectColumnsEl(columnsEl);
        }
      },
    };
  }

  async function handleEditSchema(fieldId: any) {
    const token = findLiveFieldToken(fieldId, holder);
    const schema =
      registry.getFieldSchemas()[fieldId] ??
      ensureFieldSchemaForProperties(fieldId, token);
    if (!schema) return;

    if (useDesignPanels && designMode && propertiesPanel) {
      await loadFieldProperties(fieldId, token);
      return;
    }

    const schemas = registry.getFieldSchemas();

    const previousType = schema.type;

    try {
      const saved = await editor.save();
      const placement = findFieldPlacement(fieldId, saved.blocks);
      const result = await schemaEditor.open(fieldId, schema, {
        sectionName: placement.sectionName,
        sectionLabel: placement.sectionName,
        blocks: saved.blocks,
        fieldSchemas: schemas,
      });
      await applySchemaSaveResult(result, previousType, schema);
    } catch {
      // cancelled
    }
  }

  function handleDeleteSchema(fieldId: any) {
    registry.removeFieldSchema(fieldId);
    options.onSchemaChange?.(registry.getFieldSchemas());
  }

  function buildToolsMap(config: any) {
    const enabled = options.tools ?? ['documentSection', 'templateBlock'];
    const tools: any = {};

    if (enabled.includes('documentSection')) {
      tools.documentSection = { class: DocumentSection, config };
    }
    if (enabled.includes('templateBlock')) {
      tools.templateBlock = { class: TemplateBlock, config };
    }
    if (enabled.includes('visionTable') && options.visionTableTool) {
      tools.visionTable = { class: options.visionTableTool, config };
    }

    return tools;
  }

  function countLiveDocumentSections() {
    if (!editor) return 0;
    const count = editor.blocks.getBlocksCount();
    let sections = 0;
    for (let i = 0; i < count; i += 1) {
      if (editor.blocks.getBlockByIndex(i)?.name === 'documentSection') {
        sections += 1;
      }
    }
    return sections;
  }

  let restoringRequiredSection = false;

  async function ensureLiveDocumentSection() {
    if (!editor || destroyed || restoringRequiredSection) return;
    if (countLiveDocumentSections() > 0) return;

    restoringRequiredSection = true;
    try {
      await editor.isReady;
      if (destroyed || !editor || countLiveDocumentSections() > 0) return;
      await editor.blocks.insert(
        'documentSection',
        createUniqueSectionData(),
        {},
        0,
        true,
      );
      showNotification('At least one section is required.', { type: 'status' });
    } finally {
      restoringRequiredSection = false;
    }
  }

  function guardDocumentSectionDeletion() {
    if (!editor) return;
    const blocksApi = editor.blocks;
    const originalDelete = blocksApi.delete.bind(blocksApi);
    const originalClear = blocksApi.clear.bind(blocksApi);

    blocksApi.delete = (index: any) => {
      const blockIndex = index ?? blocksApi.getCurrentBlockIndex();
      const block = blocksApi.getBlockByIndex(blockIndex);
      if (block?.name === 'documentSection' && countLiveDocumentSections() <= 1) {
        showNotification('At least one section is required.', { type: 'status' });
        return;
      }
      return originalDelete(index);
    };

    blocksApi.clear = async () => {
      await originalClear();
      await ensureLiveDocumentSection();
    };
  }

  function initEditor(docData: any) {
    const normalized = normalizeDocument(docData, {
      defaultDocument: options.defaultDocument,
      visionTableFieldId: options.visionTableFieldId,
    });
    registry.setFieldSchemas({ ...normalized.fieldSchemas });
    registry.setBlocks(normalized.blocks ?? []);
    options.onSchemaChange?.(registry.getFieldSchemas());

    if (docData && Object.prototype.hasOwnProperty.call(docData, 'pageSetup')) {
      documentPageSetup = docData.pageSetup
        ? migratePageSetup(JSON.parse(JSON.stringify(docData.pageSetup)))
        : {};
    } else if (normalized.pageSetup) {
      documentPageSetup = migratePageSetup(JSON.parse(JSON.stringify(normalized.pageSetup)));
    }
    if (docData && Object.prototype.hasOwnProperty.call(docData, 'fieldMapping')) {
      documentFieldMapping = docData.fieldMapping
        ? normalizeFieldMappingSpec(docData.fieldMapping)
        : null;
    } else if (normalized.fieldMapping) {
      documentFieldMapping = normalizeFieldMappingSpec(normalized.fieldMapping);
    }
    syncStylesFromPageSetup();

    // EditorJS.destroy() deletes its own methods; never call destroy twice on the same instance.
    if (editor) {
      const prev = editor;
      editor = null;
      if (typeof prev.destroy === 'function') {
        try {
          prev.destroy();
        } catch {
          // already torn down or mid-destroy from a concurrent reinit
        }
      }
    }

    const config = buildToolConfig();

    // Must run before EditorJS so our capture listener beats DragNDrop.processDrop
    // (which deletes the selection then crashes in processHTML on text DnD).
    wireEditorJsNativeDropGuard(holder);

    editor = new EditorJSCtor({
      // Pass the element — string IDs fail under LWC shadow DOM (getElementById).
      holder,
      autofocus: false,
      minHeight: 0,
      defaultBlock: 'documentSection',
      data: { blocks: normalized.blocks },
      tools: buildToolsMap(config),
      onChange: async () => {
        if (destroyed) return;
        try {
          await ensureLiveDocumentSection();
          scheduleHistoryRecord();
          options.onChange?.(await getDocument());
        } catch {
          // editor not ready
        }
      },
      onReady: () => {
        if (destroyed || !editor) return;
        guardDocumentSectionDeletion();
        refreshSectionVisibility();
        if (!documentHistory.hasPresent()) {
          documentHistory.reset(getHistorySnapshot());
        } else if (!historyBusy && !documentHistory.isSuspended()) {
          scheduleHistoryRecord(true);
        }
      },
    });

    applyDesignMode(designMode);
    syncFieldStyleToolbar();
    syncStylesFromPageSetup();
    scheduleEditorStylesSync();
    return editor;
  }

  async function getDocument() {
    if (!editor) {
      const doc = normalizeDocument(options.data ?? options.defaultDocument, {
        defaultDocument: options.defaultDocument,
        visionTableFieldId: options.visionTableFieldId,
      });
      if (Object.keys(documentPageSetup).length > 0) {
        doc.pageSetup = JSON.parse(JSON.stringify(documentPageSetup));
      }
      if (documentFieldMapping) {
        doc.fieldMapping = JSON.parse(JSON.stringify(documentFieldMapping));
      }
      attachRepeatableInstances(doc);
      return doc;
    }
    // Ensure preview/export always sees the latest live token state (including
    // table-cell values) even before EditorJS serialization runs.
    refreshTableCellTokens(holder, {
      getRegistry: () => registry,
      fieldValueStyle,
      fillModeFieldHighlight: !designMode && showFieldsInFillMode && !options.mappingMode,
    });
    syncFillComputedFields(holder, {}, {
      getRegistry: () => registry,
      editorHolder: holder,
      fieldValueStyle,
      fillModeFieldHighlight: !designMode && showFieldsInFillMode && !options.mappingMode,
    });
    const saved = await editor.save();
    registry.setBlocks(saved.blocks ?? []);
    // Re-attach image data URLs from live thumbs (dataset only keeps a compact stub under LWS).
    for (const block of saved.blocks ?? []) {
      if (block?.type !== 'documentSection' || !block.data) continue;
      block.data.fieldValues = recoverImageValuesFromDom(holder, block.data.fieldValues ?? {});
    }
    const doc: any = {
      time: saved.time,
      fieldSchemas: registry.getFieldSchemas(),
      blocks: saved.blocks,
    };
    if (Object.keys(documentPageSetup).length > 0) {
      doc.pageSetup = JSON.parse(JSON.stringify(documentPageSetup));
    }
    if (documentFieldMapping) {
      doc.fieldMapping = JSON.parse(JSON.stringify(documentFieldMapping));
    }
    attachRepeatableInstances(doc);
    return doc;
  }

  function attachRepeatableInstances(doc: any) {
    const plan = resolveRepeatablePagePlan(
      doc.blocks ?? [],
      doc.fieldSchemas ?? {},
      collectAllValues(doc.blocks ?? []),
      loadedDocumentSections,
    );
    if (plan && plan.instances.length > 1) {
      doc.repeatablePagePlan = plan;
      doc.repeatableSectionInstances = { [plan.sectionName]: plan.instances };
      return;
    }
    delete doc.repeatablePagePlan;
    delete doc.repeatableSectionInstances;
  }

  async function addBlock(fieldType: any) {
    if (!editor) return;

    if (isInlineFieldType(fieldType)) {
      await insertPaletteFieldInline(fieldType);
      return;
    }

    const handler = getFieldHandler(fieldType);
    if (handler?.insertion === 'table' || fieldType === 'table') {
      await insertPaletteTableInline();
      return;
    }

    const blockData = createDefaultBlockData(fieldType);
    const schema = createDefaultSchema(fieldType, blockData.label);
    registry.updateFieldSchema(blockData.fieldId, schema);

    if (fieldType === 'table') {
      const merged = ensureCellSchemas(schema, blockData.fieldId, registry.getFieldSchemas(), undefined);
      registry.setFieldSchemas(merged);
    }

    options.onSchemaChange?.(registry.getFieldSchemas());

    await editor.isReady;
    const count = editor.blocks.getBlocksCount();
    await editor.blocks.insert('templateBlock', blockData, {}, count);
  }

  async function addPaletteItem(item: any) {
    if (!editor) return;

    if (item.kind === 'block' && item.type === 'documentSection') {
      await insertDocumentSection(undefined);
      return;
    }

    if (item.kind === 'layout' && item.type === 'columns') {
      await insertColumnsIntoTargetSection();
      return;
    }

    if (item.kind === 'field') {
      await addBlock(item.type);
    }
  }

  const palette = createFieldPalette((item: any) => addPaletteItem(item), {
    layout: useDesignPanels ? 'vertical' : 'horizontal',
    excludeTypes: ui.embedded ? ['child'] : [],
  });

  async function handlePreview() {
    richTextToolbar.setPreviewBusy(true);
    documentActions.setBusy(true);
    try {
      if (editor) await editor.save();
      await previewModal.open(await getDocument());
    } catch (err: any) {
      showNotification(err?.message ?? 'Preview failed.', { type: 'error' });
    } finally {
      richTextToolbar.setPreviewBusy(false);
      documentActions.setBusy(false);
      refreshTableCellTokens(holder, { getRegistry: () => registry, fieldValueStyle });
      pruneTableCellCaretAnchors(holder);
    }
  }

  richTextToolbar.setOnPreview(
    ui.showPreview === false ? null : () => {
      void handlePreview();
    }
  );

  const documentActions = createDocumentActions({
    onPreview: null,
  });

  let topChrome: any = null;
  const showPalette = ui.palette !== false && !useDesignPanels;
  const showToolbar = ui.richTextToolbar !== false;

  if (useDesignPanels && designShell) {
    designShell.leftPanel.appendChild(palette.element);

    propertiesPanel = createPropertiesPanel({
      getRegistry: () => registry,
      onRepeaterTemplateChange: (fieldId: any,schema: any) => applyRepeaterSchemaUpdate(fieldId, schema),
      getRemoteListCollections: options.remoteListCollections ?? null,
      getRemoteListLabelFields: options.remoteListLabelFields ?? null,
      onSaveField: async (result: any) => {
        const previousSchema = registry.getFieldSchemas()[result.previousFieldId];
        const previousType = previousSchema?.type;
        if (!previousSchema || !previousType) return;
        const widthOnly = isTableWidthOnlyChange(previousSchema, result.schema);
        const ok = await applySchemaSaveResult(result, previousType, previousSchema);
        if (ok && !widthOnly) await loadFieldProperties(result.fieldId);
      },
      onLiveTableColumnWidths: applyLiveTableColumnWidths,
      onSaveSection: handleSaveSection,
      onSaveColumns: handleSaveColumns,
      onSaveDocument: handleSaveDocument,
      onOpenPageSetup: openPageSetupPanel,
    });
    designShell.rightPanel.appendChild(propertiesPanel.element);

    if (showToolbar) {
      designToolbarWrap = document.createElement('div');
      designToolbarWrap.className = 'design-panel__toolbar';
      designToolbarWrap.appendChild(richTextToolbar.element);
      designShell.centerPanel.insertBefore(designToolbarWrap, holder);
    }

    designEditorScroll = document.createElement('div');
    designEditorScroll.className = 'design-panel__editor-scroll';
    designShell.centerPanel.insertBefore(designEditorScroll, holder);
    designEditorScroll.appendChild(holder);

    wirePaletteBlockDrop(holder, {
      onInsertSection: (index: any) => insertDocumentSection(index),
    });

    syncDesignChromeVisibility();
  }

  if (showPalette || (showToolbar && !useDesignPanels)) {
    topChrome = document.createElement('div');
    topChrome.className = 'editor-top-chrome';
    if (showPalette) topChrome.appendChild(palette.element);
    if (showToolbar) topChrome.appendChild(richTextToolbar.element);
    if (ui.stickyChrome !== false && !ui.chromeParent) {
      topChrome.classList.add('editor-top-chrome--sticky');
    }
    mountTopChrome(topChrome, holder, ui);
  }

  if (ui.documentActions !== false) {
    if (!mountInContainer(documentActions.element, ui.documentActionsContainer)) {
      mountAdjacentUi(
        documentActions.element,
        holder,
        ui.documentActionsParent,
        ui.documentActionsAfter,
        'before-holder',
      );
    }
  }

  function getSelectedDesignFieldTokens() {
    return [...holder.querySelectorAll('.field-token--selected.field-token--design')];
  }

  function listEditorBlocks() {
    return [...holder.querySelectorAll('.ce-block')];
  }

  function resolveSectionBlockIndex(sectionEl: any) {
    const block = sectionEl?.closest('.ce-block');
    if (!block || !holder.contains(block)) return -1;
    return listEditorBlocks().indexOf(block);
  }

  async function loadSelectedSectionProperties(sectionEl: any = null) {
    if (selectedSectionBlockIndex < 0 || !propertiesPanel || !editor) return;

    try {
      await editor.isReady;
      const saved = await editor.save();
      const block = saved.blocks?.[selectedSectionBlockIndex];
      if (block?.type !== 'documentSection') return;

      const section =
        sectionEl ??
        listEditorBlocks()[selectedSectionBlockIndex]?.querySelector('.document-section') ??
        null;

      propertiesPanel.showSection(
        selectedSectionBlockIndex,
        {
          name: block.data?.name ?? '',
          label: block.data?.label ?? '',
          repeatable: !!block.data?.repeatable,
          hideTitleInPreview: !!block.data?.hideTitleInPreview,
          visibility: block.data?.visibility ?? null,
        },
        section,
      );
      updateSectionSelectionHighlight();
    } catch {
      // editor not ready
    }
  }

  function updateSectionSelectionHighlight() {
    holder.querySelectorAll('.document-section--selected').forEach((el: any) => {
      el.classList.remove('document-section--selected');
    });
    if (selectedSectionBlockIndex < 0) return;
    listEditorBlocks()[selectedSectionBlockIndex]
      ?.querySelector('.document-section')
      ?.classList.add('document-section--selected');
  }

  function onDesignHolderClick(e: any) {
    if (!designMode || !useDesignPanels || !propertiesPanel) return;
    // Ignore leftover clicks from a table or columns resize drag.
    if (document.body.classList.contains('vision-table-col-resize-active')) return;
    if (document.body.classList.contains('document-columns-col-resize-active')) return;
    if (e.target?.closest?.('.vision-table__col-resizer')) return;
    if (e.target?.closest?.('.document-columns__col-resizer')) return;

    if (
      e.target === holder ||
      e.target === designEditorScroll ||
      e.target.classList?.contains('codex-editor') ||
      e.target.classList?.contains('codex-editor__redactor') ||
      e.target.classList?.contains('ce-block') ||
      e.target.classList?.contains('ce-block__content')
    ) {
      selectedSectionBlockIndex = -1;
      clearStructureSelection();
      clearAllDesignTokenSelection(holder);
      updateSectionSelectionHighlight();
      propertiesPanel.showDocument(documentPageSetup);
      return;
    }

    const columnsToolbar = e.target.closest('.document-columns__toolbar');
    if (columnsToolbar && holder.contains(columnsToolbar)) {
      if (e.target.closest('[data-action="delete-columns"]')) {
        return;
      }
      const columnsEl = columnsToolbar.closest('.document-columns');
      if (!columnsEl) return;

      e.preventDefault();
      e.stopPropagation();
      selectColumnsEl(columnsEl);
      return;
    }

    const tableToolbar = e.target.closest('.document-table__toolbar');
    if (tableToolbar && holder.contains(tableToolbar)) {
      if (e.target.closest('[data-action="delete-table"]')) {
        return;
      }
      const tableEl = tableToolbar.closest('.document-table');
      if (!tableEl) return;

      e.preventDefault();
      e.stopPropagation();
      selectTableEl(tableEl);
      return;
    }

    const header = e.target.closest('.document-section__header');
    if (!header || !holder.contains(header)) return;
    if (e.target.closest('.document-section__body, .field-token')) {
      return;
    }

    const section = header.closest('.document-section');
    const blockIndex = resolveSectionBlockIndex(section);
    if (blockIndex < 0) return;

    e.preventDefault();
    e.stopPropagation();

    selectedSectionBlockIndex = blockIndex;
    clearStructureSelection();
    clearAllDesignTokenSelection(holder);
    updateSectionSelectionHighlight();
    focusStructureTarget(section);
    void loadSelectedSectionProperties(section);
  }

  holder.addEventListener('click', onDesignHolderClick);

  function getStyleTargetFieldIds() {
    const schemas = registry.getFieldSchemas();
    const ids = new Set();

    for (const token of getSelectedDesignFieldTokens()) {
      if (token.classList.contains('field-token--cell')) {
        const tableId = token.dataset.tableId;
        const colKey = token.dataset.colKey;
        if (tableId && colKey) {
          for (const id of listColumnCellFieldIds(tableId, colKey, schemas)) {
            ids.add(id);
          }
        } else if (token.dataset.fieldId) {
          ids.add(token.dataset.fieldId);
        }
        continue;
      }

      if (token.dataset.fieldId) ids.add(token.dataset.fieldId);
    }

    return [...ids];
  }

  function getPrimaryStyleFieldId() {
    const token = getSelectedDesignFieldTokens()[0];
    if (!token) return null;

    if (token.classList.contains('field-token--cell')) {
      const tableId = token.dataset.tableId;
      const colKey = token.dataset.colKey;
      if (tableId && colKey) {
        const ids = listColumnCellFieldIds(tableId, colKey, registry.getFieldSchemas());
        return ids[0] ?? token.dataset.fieldId ?? null;
      }
    }

    return token.dataset.fieldId ?? null;
  }

  function isTableColumnSelection() {
    const tokens = getSelectedDesignFieldTokens();
    return tokens.length > 0 && tokens.every((token: any) => token.classList.contains('field-token--cell'));
  }

  function applyDisplayStyleToFieldIds(fieldIds: any,normalized: any) {
    const schemas = registry.getFieldSchemas();

    for (const fieldId of fieldIds) {
      const schema = schemas[fieldId];
      if (!schema) continue;
      const updated = { ...schema };
      if (isEmptyFieldDisplayStyle(normalized)) {
        delete updated.displayStyle;
      } else {
        updated.displayStyle = normalized;
      }
      registry.updateFieldSchema(fieldId, updated);
      refreshFieldSchemaInDom(fieldId, { getRegistry: () => registry, fieldValueStyle }, holder);
    }

    refreshTableColumnStylesForFieldIds(fieldIds, registry.getFieldSchemas(), holder, fieldValueStyle);

    options.onSchemaChange?.(registry.getFieldSchemas());
    syncFieldStyleToolbar();
  }

  function applyDisplayStyleToSelectedFields(override: any) {
    applyDisplayStyleToFieldIds(getStyleTargetFieldIds(), normalizeFieldDisplayStyle(override));
  }

  function syncFieldStyleToolbar() {
    if (!designMode || !showToolbar) {
      if (richTextToolbar.isFieldModeActive()) {
        richTextToolbar.clearFieldMode();
        if (lastFocusedEditable?.isConnected) {
          richTextToolbar.show(lastFocusedEditable);
        } else {
          richTextToolbar.clearActive();
        }
      }
      return;
    }

    const tokens = getSelectedDesignFieldTokens();
    if (!tokens.length) {
      richTextToolbar.clearFieldMode();
      if (lastFocusedEditable?.isConnected) {
        richTextToolbar.show(lastFocusedEditable);
      } else {
        richTextToolbar.clearActive();
      }
      return;
    }

    richTextToolbar.showForField({
      getResolvedStyle: () => {
        const fieldId = getPrimaryStyleFieldId();
        const schemas = registry.getFieldSchemas();
        const schema = schemas[fieldId];
        const cellRef = fieldId ? parseCellFieldId(fieldId, schemas) : null;
        if (cellRef) {
          return resolveTableCellDisplayStyle(
            cellRef.tableFieldId,
            cellRef.colKey,
            schema,
            schemas,
            fieldValueStyle,
          );
        }
        return resolveFieldDisplayStyle(schema, fieldValueStyle?.default);
      },
      getOverrideStyle: () => {
        const fieldId = getPrimaryStyleFieldId();
        return normalizeFieldDisplayStyle(registry.getFieldSchemas()[fieldId]?.displayStyle);
      },
      getGlobalDefault: () => isTableColumnSelection()
        ? { ...DOCUMENT_TABLE_TEXT_STYLE, ...(fieldValueStyle?.default ?? {}) }
        : (fieldValueStyle?.default ?? {}),
      hint: isTableColumnSelection()
        ? 'Table column selected — formatting applies to the whole column.'
        : undefined,
      onStyleChange: (override: any) => {
        applyDisplayStyleToSelectedFields(override);
      },
      onClearStyle: () => {
        applyDisplayStyleToFieldIds(getStyleTargetFieldIds(), {});
      },
    });
  }

  function eventFocusTarget(e: Event): Element | null {
    // Prefer composedPath; under LWS document listeners may still retarget — prefer shell listeners.
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    for (const node of path) {
      if (node instanceof Element) return node;
    }
    return e.target instanceof Element ? e.target : null;
  }

  function activateToolbarForTarget(target: Element | null) {
    if (!target) return false;

    if (designMode && target.closest?.('.field-token--design')) {
      syncFieldStyleToolbar();
      return true;
    }

    const columnEditable = target.closest?.('.document-columns__col');
    if (columnEditable && holder.contains(columnEditable)) {
      lastFocusedEditable = columnEditable;
      if (designMode && getSelectedDesignFieldTokens().length) {
        syncFieldStyleToolbar();
        return true;
      }
      richTextToolbar.show(columnEditable);
      return true;
    }

    const editable = target.closest?.('.document-section__body');
    if (editable && holder.contains(editable)) {
      lastFocusedEditable = editable;
      if (designMode && getSelectedDesignFieldTokens().length) {
        syncFieldStyleToolbar();
        return true;
      }
      richTextToolbar.show(editable);
      return true;
    }

    if (target.closest('.rich-text-toolbar')) {
      return true;
    }

    if (designMode && getSelectedDesignFieldTokens().length) {
      syncFieldStyleToolbar();
      return true;
    }

    return false;
  }

  function onFocusIn(e: any) {
    const target = eventFocusTarget(e);
    if (!activateToolbarForTarget(target)) {
      richTextToolbar.clearActive();
    }
  }

  /** Click/mouseup backup — LWS can swallow document focusin into the shadow tree. */
  function onEditorPointerActivate(e: any) {
    const target = eventFocusTarget(e);
    activateToolbarForTarget(target);
  }

  /** Block Salesforce page shortcuts (e.g. "e" → Edit). Class cke_editable is the reliable SF bypass. */
  function onEditorKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.defaultPrevented) return;

    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey) return;
    if (!shouldHandleHistoryShortcut(e)) return;

    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      void undoDocument();
      return;
    }
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      void redoDocument();
    }
  }

  function onDesignStructureDeleteKeyDown(e: KeyboardEvent) {
    if (!designMode) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.defaultPrevented) return;
    if (shouldIgnoreStructureDeleteKey(e)) return;

    if (selectedColumnsEl?.isConnected) {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedColumnsBlock();
      return;
    }

    if (selectedTableEl?.isConnected) {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedTableBlock();
      return;
    }

    if (selectedSectionBlockIndex >= 0) {
      e.preventDefault();
      e.stopPropagation();
      void deleteSelectedSectionBlock();
    }
  }

  setFieldSelectionChangeCallback(() => {
    syncFieldStyleToolbar();
    syncPropertiesPanel();
  });

  // Listen on the shell/holder (same tree as contenteditable) — not document alone (LWS retargets).
  // Also listen on document so Delete still works after selecting a non-focusable header
  // (focus often moves to <body> and never reaches the shell).
  const focusRoot = designShell?.element ?? holder;
  focusRoot.addEventListener('focusin', onFocusIn);
  focusRoot.addEventListener('mouseup', onEditorPointerActivate);
  focusRoot.addEventListener('keydown', onEditorKeyDown);
  focusRoot.addEventListener('keydown', onDesignStructureDeleteKeyDown, true);
  holder.addEventListener('keydown', onEditorKeyDown);
  holder.addEventListener('keydown', onDesignStructureDeleteKeyDown, true);
  document.addEventListener('keydown', onDesignStructureDeleteKeyDown, true);

  syncShowFieldsHighlight();
  initEditor(options.data ?? options.defaultDocument ?? DEFAULT_EMPTY_DOCUMENT);

  async function applyFieldMappingToEditor(payload: any) {
    const doc = await getDocument();
    const spec = documentFieldMapping;
    if (!spec?.rules?.length && !spec?.expression?.trim()) {
      throw new Error('No field mapping configured.');
    }
    const result = runFieldMapping(payload, spec, {
      blocks: doc.blocks,
      fieldSchemas: doc.fieldSchemas,
    });
    loadedDocumentSections = result.fieldsExport.sections
      ? JSON.parse(JSON.stringify(result.fieldsExport.sections))
      : null;
    initEditor({
      time: Date.now(),
      fieldSchemas: result.fieldSchemas,
      blocks: result.blocks,
      pageSetup: documentPageSetup,
      fieldMapping: documentFieldMapping,
    });
    // Wait for sections to mount, then recompute like preview (sum of mapped table columns).
    if (editor) await editor.isReady;
    syncFillComputedFields(holder, {}, {
      getRegistry: () => registry,
      editorHolder: holder,
      fieldValueStyle,
      fillModeFieldHighlight: !designMode && showFieldsInFillMode && !options.mappingMode,
    });
    return result;
  }

  /**
   * Build an HTML or PDF blob for the host to email / Slack / attach.
   * Use `format: 'current'` to follow the open preview view mode (defaults to html).
   */
  async function getPreviewArtifact(callOptions: any = {}) {
    if (editor) await editor.save();
    const doc = await getDocument();

    const {
      format: formatOption,
      filename: filenameOption,
      generatePdfBlob: generateOverride,
      hideEmptyValues: hideEmptyOption,
      title: titleOption,
      ...restExport
    } = callOptions;

    const format: 'html' | 'pdf' =
      formatOption === 'pdf' || formatOption === 'html'
        ? formatOption
        : previewModal.isOpen()
          ? previewModal.getViewMode()
          : 'html';

    const hideEmptyValues =
      typeof hideEmptyOption === 'boolean'
        ? hideEmptyOption
        : previewModal.isOpen()
          ? previewModal.getHideEmptyValues()
          : false;

    const exportOptions = resolvePreviewExportOptions(doc, {
      ...restExport,
      hideEmptyValues,
      fieldValueStyle,
      title: titleOption ?? (documentPageSetup as any).title ?? ui.pdfTitle,
    });

    const title =
      titleOption ??
      exportOptions.title ??
      (documentPageSetup as any).title ??
      ui.pdfTitle ??
      'document';

    if (format === 'pdf') {
      const pdfOk =
        options.pdfAvailable !== undefined
          ? !!(await Promise.resolve(
              typeof options.pdfAvailable === 'function'
                ? options.pdfAvailable()
                : options.pdfAvailable,
            ))
          : typeof options.generatePdfBlob === 'function' ||
            typeof generateOverride === 'function' ||
            isClientPdfAvailable;
      if (!pdfOk) {
        throw new Error('PDF generation is not available.');
      }
      const generate =
        typeof generateOverride === 'function'
          ? generateOverride
          : typeof options.generatePdfBlob === 'function'
            ? options.generatePdfBlob
            : null;
      const blob = generate
        ? await generate(doc, exportOptions)
        : await generateDocumentPdfBlob(doc, exportOptions);
      const filename =
        filenameOption ??
        buildExportFilename({ title, baseName: ui.pdfFilename, format: 'pdf' });
      return { blob, filename, mimeType: 'application/pdf', format: 'pdf' as const };
    }

    const blob = buildPreviewHtmlBlob(doc, exportOptions);
    const filename =
      filenameOption ??
      buildExportFilename({ title, baseName: ui.pdfFilename, format: 'html' });
    return { blob, filename, mimeType: 'text/html;charset=utf-8', format: 'html' as const };
  }

  const instance = {
    holder,
    registry,
    palette,
    richTextToolbar,
    documentActions,

    get ready() {
      return editor?.isReady ?? Promise.resolve();
    },

    getDocument,
    exportDoc: async () => buildDocExport(await getDocument()),
    exportFields: async (exportOptions: any = {}) => {
      const doc = await getDocument();
      let exported = buildFieldsExport(doc, exportOptions);
      if (exportOptions?.omitMappedFields === true) {
        exported = omitMappedFields(exported, documentFieldMapping ?? doc.fieldMapping);
      }
      return exported;
    },
    exportTemplate: async () => buildTemplateExport(await getDocument()),
    /** @deprecated Use exportFields() */
    exportDocument: async (exportOptions: any = {}) => {
      const doc = await getDocument();
      let exported = buildFieldsExport(doc, exportOptions);
      if (exportOptions?.omitMappedFields === true) {
        exported = omitMappedFields(exported, documentFieldMapping ?? doc.fieldMapping);
      }
      return exported;
    },

    async load(data: any, loadOptions: any = {}) {
      if (editor) await editor.save();

      if (isFieldsExport(data)) {
        const doc = await getDocument();
        let fieldsPayload = data;
        if (loadOptions?.omitMappedFields === true) {
          fieldsPayload = omitMappedFields(
            data,
            documentFieldMapping ?? doc.fieldMapping,
          );
        }
        loadedDocumentSections = fieldsPayload.sections
          ? JSON.parse(JSON.stringify(fieldsPayload.sections))
          : null;
        const values = normalizeDocumentValues(fieldsPayload, doc.blocks, doc.fieldSchemas);
        const { blocks, fieldSchemas: nextFieldSchemas } = applyDocumentValues(
          doc.blocks,
          values,
          doc.fieldSchemas,
        );
        const resume = documentHistory.suspend();
        try {
          initEditor({
            time: fieldsPayload.time ?? Date.now(),
            fieldSchemas: nextFieldSchemas,
            blocks,
            pageSetup: documentPageSetup,
          });
          if (editor) await editor.isReady;
          documentHistory.reset(getHistorySnapshot());
        } finally {
          resume();
        }
      } else {
        loadedDocumentSections = null;
        const resume = documentHistory.suspend();
        try {
          initEditor(normalizeImportedDoc(data));
          if (editor) await editor.isReady;
          documentHistory.reset(getHistorySnapshot());
        } finally {
          resume();
        }
      }

      // Keep parity with mapping apply: after import/load remounts EditorJS and
      // tokens are seeded, recompute all computed values from loaded fields so
      // table totals/subtotals are immediately correct before manual edits.
      syncFillComputedFields(holder, {}, {
        getRegistry: () => registry,
        editorHolder: holder,
        fieldValueStyle,
        fillModeFieldHighlight: !designMode && showFieldsInFillMode && !options.mappingMode,
      });

      // Version switch / import remounts EditorJS; drop stale section selection
      // and show Page Setup so the properties panel matches the new document.
      if (useDesignPanels && designMode) {
        openPageSetupPanel();
      }
    },

    undo: () => undoDocument(),
    redo: () => redoDocument(),
    canUndo: () => {
      flushHistoryRecord();
      return documentHistory.canUndo();
    },
    canRedo: () => {
      flushHistoryRecord();
      return documentHistory.canRedo();
    },

    async setDesignMode(enabled: any) {
      if (setDesignModeInFlight) {
        await setDesignModeInFlight;
      }
      const run = (async () => {
        if (typeof propertiesPanel?.flush === 'function') {
          try {
            await propertiesPanel.flush();
          } catch {
            // keep switching mode even if properties save fails
          }
        }
        if (editor) {
          try {
            await editor.isReady;
            await editor.save();
          } catch {
            // editor not ready
          }
        }
        designMode = !!enabled;
        applyDesignMode(designMode);
        syncDesignChromeVisibility();
        const doc = await getDocument();
        initEditor(doc);
        if (editor) {
          try {
            await editor.isReady;
          } catch {
            // ignore
          }
        }
      })();
      setDesignModeInFlight = run.finally(() => {
        if (setDesignModeInFlight === run) setDesignModeInFlight = null;
      });
      await setDesignModeInFlight;
    },

    getDesignMode: () => designMode,

    setShowFieldsInFillMode(enabled: any) {
      showFieldsInFillMode = !!enabled;
      syncShowFieldsHighlight();
    },

    getShowFieldsInFillMode: () => showFieldsInFillMode,

    async preview(options: any = {}) {
      if (editor) await editor.save();
      documentActions.setBusy(true);
      richTextToolbar.setPreviewBusy(true);
      try {
        await previewModal.open(await getDocument(), {
          hideEmptyValues: options.hideEmptyValues === true,
        });
      } finally {
        documentActions.setBusy(false);
        richTextToolbar.setPreviewBusy(false);
        refreshTableCellTokens(holder, { getRegistry: () => registry, fieldValueStyle });
        pruneTableCellCaretAnchors(holder);
      }
    },

    isPreviewOpen: () => previewModal.isOpen(),

    closePreview: () => {
      previewModal.close();
    },

    /**
     * Render Simple preview HTML (optionally hiding empty fields) for export/attach.
     * @returns {Promise<string>}
     */
    async exportPreviewHtml(callOptions: any = {}) {
      if (editor) await editor.save();
      const doc = await getDocument();
      const exportOptions = resolvePreviewExportOptions(doc, {
        hideEmptyValues: callOptions.hideEmptyValues === true,
        fieldValueStyle,
        title: callOptions.title,
      });
      return buildPreviewHtmlDocument(doc, exportOptions);
    },

    getPreviewArtifact,

    async exportPdf(callOptions: any) {
      try {
        const artifact = await getPreviewArtifact({
          ...callOptions,
          format: 'pdf',
          filename:
            callOptions?.filename ??
            (ui.pdfFilename
              ? buildExportFilename({
                  baseName: ui.pdfFilename,
                  format: 'pdf',
                  unique: false,
                })
              : undefined),
        });
        await saveBlobToDisk(artifact.blob, artifact.filename, 'application/pdf');
      } catch (err: any) {
        showNotification(err?.message ?? 'PDF export failed.');
      }
    },

    validate: async () => validateRequiredFields(await getDocument()),

    getFieldMapping() {
      return documentFieldMapping ? JSON.parse(JSON.stringify(documentFieldMapping)) : null;
    },

    setFieldMapping(spec: any) {
      documentFieldMapping = spec ? normalizeFieldMappingSpec(spec) : null;
    },

    async previewFieldMapping(payload: any) {
      const doc = await getDocument();
      const spec = documentFieldMapping ?? normalizeFieldMappingSpec(null);
      return runFieldMappingPreview(payload, spec, {
        blocks: doc.blocks,
        fieldSchemas: doc.fieldSchemas,
      });
    },

    async applyFieldMapping(payload: any) {
      return applyFieldMappingToEditor(payload);
    },

    async openFieldMapping(options: any = {}) {
      if (!fieldMappingModal) {
        throw new Error('Field mapping editor is not available in this editor.');
      }
      const spec = options.spec ?? documentFieldMapping ?? normalizeFieldMappingSpec(null);
      const saved = await fieldMappingModal.open({
        spec,
        onApply: applyFieldMappingToEditor,
        onExpandSourcePath: options.onExpandSourcePath,
      });
      documentFieldMapping = saved;
      options.onChange?.(await getDocument());
      return saved;
    },

    async save() {
      if (editor) await editor.save();
      return getDocument();
    },

    destroy() {
      destroyed = true;
      if (historyTimer) {
        clearTimeout(historyTimer);
        historyTimer = null;
      }
      focusRoot.removeEventListener('focusin', onFocusIn);
      focusRoot.removeEventListener('mouseup', onEditorPointerActivate);
      focusRoot.removeEventListener('keydown', onEditorKeyDown);
      focusRoot.removeEventListener('keydown', onDesignStructureDeleteKeyDown, true);
      holder.removeEventListener('keydown', onEditorKeyDown);
      holder.removeEventListener('keydown', onDesignStructureDeleteKeyDown, true);
      document.removeEventListener('keydown', onDesignStructureDeleteKeyDown, true);
      holder.removeEventListener('click', onDesignHolderClick);
      if (editor) {
        const prev = editor;
        editor = null;
        if (typeof prev.destroy === 'function') {
          try {
            prev.destroy();
          } catch {
            // ignore
          }
        }
      }
      topChrome?.remove();
      designToolbarWrap?.remove();
      if (designEditorScroll?.contains(holder) && designShell?.centerPanel) {
        designShell.centerPanel.insertBefore(holder, designEditorScroll);
      }
      designEditorScroll?.remove();
      designShell?.destroy();
      documentActions.element.remove();
      detachRegistryFromHolder(holder);
    },
  };

  return instance;
}
