export { createEditor } from './create-editor.js';

export { IO_VERSION } from './core/document-io.js';
export {
  buildDocExport,
  buildFieldsExport,
  buildTemplateExport,
  buildDocumentExport,
  normalizeImportedDoc,
  isFieldsExport,
  isDocExport,
  validateRequiredFields,
  collectAllValues,
  applyDocumentValues,
  enrichComputedValues,
  collectFieldIdsInBlocks,
  collectReferencedFieldSchemaIds,
  pruneUnusedFieldSchemas,
  pruneUnusedBlockValues,
  normalizeDocumentValues,
} from './core/document-io.js';

export {
  FIELD_MAPPING_KIND,
  FIELD_MAPPING_VERSION,
  isFieldMappingSpec,
  getPayloadByPath,
  payloadPathExists,
  sourcePathExists,
  unwrapMappingExpression,
  evaluateFieldMappingExpression,
  normalizeMappingResult,
  validateMappedValues,
  validateMappingSourcePaths,
  buildTargetSchemaTree,
  applyFieldMapping,
  previewFieldMapping,
  normalizeFieldMappingSpec,
  buildSourcePayloadTree,
  resolveSourcePath,
  buildMappingResultFromRules,
  parseMappingResultToRules,
  resolveRulesToFieldsExport,
  upsertMappingRule,
  createMappingRuleFromDrop,
  resolveFieldMappingTarget,
  evaluateSectionVisibility,
  omitMappedFields,
  collectMappedSectionFieldKeys,
} from '@docengine/engine';

export {
  expandTableArraysInValues,
  collapseTablesInValues,
  tableRowsToFlatValues,
  flatValuesToTableRows,
  collectTableInstancesInBlocks,
  isTableRowArray,
} from './core/field-io/table-field-io.js';

export {
  buildSectionedDocumentFromValues,
  expandSectionedDocument,
  findRepeatableSectionBlock,
  extractRepeatableSectionInstances,
  buildRepeatableInstancesFromEditor,
  resolveRepeatableSectionInstances,
  resolveRepeatablePagePlan,
  findAdjacentTableBlock,
  expandSectionFieldMap,
  isSectionInstanceArray,
} from './core/field-io/sectioned-document-io.js';

export {
  ROOT_SECTION_KEY,
  DEFAULT_SECTION_NAME,
  slugSectionKey,
  deriveFieldId,
  deriveUniqueFieldName,
  allocateFieldIdentity,
  deriveCellFieldId,
  resolveSectionName,
  collectUsedSectionNames,
  allocateUniqueSectionName,
  ensureSchemaName,
  ensureSchemasHaveName,
  findFieldPlacement,
  collectFieldsInSection,
  isFieldNameTakenInSection,
  resolveFieldIdByName,
  rebuildFieldIdsForSection,
  migrateFieldIds,
  findSectionNameForNode,
  findSectionLabelForNode,
} from './core/field-id.js';

export {
  generateFieldId,
  isValidFieldId,
  createDefaultSchema,
  createDefaultBlockData,
  ensureCellSchemas,
  ensureCellSchemasForRows,
  ensureSchemaForFieldProperties,
  generateTableRowKey,
  resolveTableInstanceRows,
  labelToFieldKey,
  buildTableColumnsFromLabels,
  syncTableColumnKeyChanges,
  extractRowKeysFromTableValues,
  mergeTableInstanceRows,
  removeTableRowCellData,
  syncBlocksAfterSchemaChange,
  applyFieldIdChange,
  resolveSchemaDefaultValue,
  convertSchemaType,
  cellFieldId,
  parseCellFieldId,
  isCellFieldId,
  listColumnCellFieldIds,
  tagTableCellToken,
  isSchemaRequired,
  isSchemaReadonly,
  isTableCellInheritedReadonly,
  isFieldEditableInFillMode,
} from './core/field-schemas.js';

export {
  getRepeaterFieldSchemas,
  normalizeRepeaterSchema,
  isLegacyRepeaterInstancesWrapper,
  createEmptyRepeaterValue,
  normalizeRepeaterValue,
  buildRepeaterPreviewDocument,
  buildRepeaterFillDocument,
  buildRepeaterInstanceDocument,
  buildRepeaterInstancePreviewDocument,
  createDefaultRepeaterTemplateDocument,
  buildRepeaterTemplateDocument,
  extractRepeaterFieldSchemasFromDocument,
  extractRepeaterValueFromDocument,
  extractRepeaterFieldValueFromBlocks,
  sanitizeRepeaterChildSchemas,
  stripForeignKeysFromRepeaterValue,
  ensureRepeaterChildSchemas,
  inferRepeaterChildSchemasFromValue,
  ensureRepeaterSchemasFromBlockValues,
  namespaceRepeaterChildTemplate,
  repeaterChildNamespacePrefix,
  repeaterHasTemplate,
  toRepeaterChildEditorFieldId,
  REPEATER_CHILD_FIELD_PREFIX,
  buildRepeaterTemplateExport,
  parseRepeaterTemplateImport,
  applyRepeaterTemplateImport,
  REPEATER_TEMPLATE_FILE_KIND,
  REPEATER_TEMPLATE_FILE_VERSION,
  repeaterHasContent,
} from './core/repeater-io.js';

export {
  buildFormulaFieldTree,
  listFormulaTableColumns,
  formatFormulaReference,
  resolveFormulaReference,
  extractFormulaDependencyFieldIds,
} from './core/formula-field-index.js';

export { SchemaRegistry } from './registry/schema-registry.js';
export { createCatalogProvider } from './catalog/catalog-provider.js';
export { getRegistryFromConfig, getRegistryFromNode } from './registry/registry-context.js';
export { FIELD_TYPES, getFieldTypes } from './design/field-palette.js';
export {
  registerField,
  unregisterField,
  getFieldHandler,
  hasFieldHandler,
  listFieldHandlers,
  getInlineFieldTypes,
  isInlineFieldType,
  registerBuiltinFields,
} from './fields/handlers/index.js';
export { applyDesignMode, isDesignMode } from './design/design-mode.js';
export { configureImageUpload } from './services/image-upload.js';

export { evaluateComputedField } from './core/computed-formula.js';
export {
  registerFormulaFunction,
  unregisterFormulaFunction,
  resetFormulaFunctions,
  getFormulaFunction,
  listFormulaFunctions,
  listFormulaPickerFunctions,
} from './core/computed-formula.js';
export type {
  FormulaFunctionDef,
  FormulaFunctionKind,
  FormulaFunctionArity,
} from './core/computed-formula.js';
export { renderDocumentPreview, filterSegmentsForPreview } from './fields/document-preview.js';
export {
  formatFieldDisplay,
  getFieldDisplayLabel,
  isFieldEmpty,
  isTableCellDisplayPlaceholder,
  resolveValueOrFillDefault,
} from './fields/inline-fields.js';
export {
  getTableSchema,
  buildPreviewTableElement,
  tableSegmentHasContent,
  tableSegmentHasRequiredEmpty,
} from './fields/table-field.js';
export {
  normalizeFieldDisplayStyle,
  resolveFieldDisplayStyle,
  resolveTableCellDisplayStyle,
  resolveTableColumnDisplayStyle,
  resolveTokenDisplayStyle,
} from './fields/field-display-style.js';
export {
  DEFAULT_DOCUMENT_BODY_STYLE,
  DEFAULT_FIELD_VALUE_STYLE_OPTIONS,
  DOCUMENT_BODY_LINE_HEIGHT,
  EDITOR_FONT_FAMILY,
  DOCUMENT_PREVIEW_FONT_FAMILY,
  DOCUMENT_SECTION_HEADER_STYLE,
  DOCUMENT_TABLE_TEXT_STYLE,
  DOCUMENT_TITLE_STYLE,
} from './core/document-display-defaults.js';
export { exportDocumentPdf, generateDocumentPdfBlob, isClientPdfAvailable } from './export/document-pdf.js';
export { buildPreviewHtmlBlob, buildPreviewHtmlDocument } from './export/preview-html-document.js';
export { buildPreviewHtmlStylesheet, resolvePreviewHtmlCssVars } from './export/preview-html-styles.js';
export {
  buildExportFilename,
  formatFilenameTimestamp,
  shortFilenameId,
  slugifyFilename,
} from './utils/export-filename.js';
export { createFieldFormModal } from './ui/field-form-modal.js';
export type {
  CreateFieldFormModalOptions,
  FieldFormModal,
  FieldFormModalElements,
  FieldFormModalOpenBase,
} from './ui/field-form-modal.js';
export { ACTION_ICONS } from './ui/action-icons.js';
export { promptFilename } from './ui/filename-prompt.js';
export { saveBlobToDisk } from './utils/save-blob.js';
export {
  createFieldToken,
  updateFieldToken,
  readTokenValue,
  readRepeaterTokenValue,
  openFieldPicker,
  pickFillFieldFromToken,
} from './fields/inline-fields.js';
export {
  getFieldSelectionContainer,
  selectDesignTableColumn,
} from './fields/field-selection.js';
export { showNotification } from './ui/notification.js';
export { defineDocEditorElement } from './web-component.js';
