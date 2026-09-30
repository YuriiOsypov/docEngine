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
  applySectionInstanceToBlocks,
} from './core/document-io.js';

export {
  expandTableArraysInValues,
  collapseTablesInValues,
  tableRowsToFlatValues,
  flatValuesToTableRows,
} from './core/field-io/table-field-io.js';
export { cloneTableBlockForRow } from './core/field-io/table-field-io.js';

export { expandSectionedDocument } from './core/field-io/sectioned-document-io.js';
export {
  findRepeatableSectionBlock,
  extractRepeatableSectionInstances,
  buildRepeatableInstancesFromEditor,
  resolveRepeatableSectionInstances,
  resolveRepeatablePagePlan,
  findAdjacentTableBlock,
  expandSectionFieldMap,
  isSectionInstanceArray,
} from './core/field-io/sectioned-document-io.js';

export { evaluateSectionVisibility } from '@docengine/engine';

export {
  cellFieldId,
  listColumnCellFieldIds,
  parseCellFieldId,
  resolveTableInstanceRows,
} from './core/field-schemas.js';

export { evaluateComputedField } from './core/computed-formula.js';
export {
  registerFormulaFunction,
  unregisterFormulaFunction,
  listFormulaFunctions,
} from './core/computed-formula.js';
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

export {
  resolvePageSetupTextStyle,
  resolvePageSetupFieldValueStyle,
  resolvePageSetupFieldHighlightStyle,
  applyFieldHighlightCssVars,
} from './core/page-setup-styles.js';

export {
  buildRepeaterFillDocument,
  normalizeRepeaterValue,
  repeaterHasContent,
} from './core/repeater-io.js';

export { filterSegmentsForPreview, renderDocumentPreview } from './fields/document-preview.js';

export {
  formatFieldDisplay,
  getFieldDisplayLabel,
  isFieldEmpty,
  isTableCellDisplayPlaceholder,
} from './fields/inline-fields.js';

export {
  getFieldHandler,
  registerField,
  getFieldTypes,
  registerBuiltinFields,
} from './fields/handlers/index.js';

export {
  getTableSchema,
  tableSegmentHasContent,
  tableSegmentHasRequiredEmpty,
} from './fields/table-field.js';

export { normalizeFieldDisplayStyle, resolveFieldDisplayStyle, resolveTableCellDisplayStyle, resolveTableColumnDisplayStyle, resolveTokenDisplayStyle } from './fields/field-display-style.js';

export {
  encodeBarcodeToDataUrl,
  encodeBarcodeToSvg,
  barcodeValueToPdfBlock,
  normalizeBarcodeSymbology,
} from './fields/barcode-encode.js';
