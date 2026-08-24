import { configureFieldHandlers } from '@docengine/engine';
import { getFieldHandler } from '../fields/handlers/registry.js';
import { registerBuiltinFields } from '../fields/handlers/builtins.js';

registerBuiltinFields();
configureFieldHandlers({ getFieldHandler });

export {
  generateFieldId,
  isValidFieldId,
  labelToFieldKey,
  buildTableColumnsFromLabels,
  normalizeStoredColumnWidth,
  syncTableColumnKeyChanges,
  applyFieldIdChange,
  getDefaultFieldValue,
  getEmptyFieldValue,
  localTodayIso,
  resolveSchemaDefaultValue,
  isSchemaRequired,
  isSchemaReadonly,
  isTableCellInheritedReadonly,
  isFieldEditableInFillMode,
  convertSchemaType,
  createDefaultSchema,
  createDefaultBlockData,
  syncBlocksAfterSchemaChange,
  cellFieldId,
  parseCellFieldId,
  isCellFieldId,
  listColumnCellFieldIds,
  syncColumnListSourceSettings,
  findColumnDisplayStyle,
  tagTableCellToken,
  generateTableRowKey,
  resolveTableInstanceRows,
  extractRowKeysFromTableValues,
  mergeTableInstanceRows,
  ensureCellSchemas,
  ensureCellSchemasForRows,
  ensureSchemaForFieldProperties,
  removeTableRowCellData,
  pruneTableCellDataForRows,
  buildRepeaterInstancesFromLabels,
  configureFieldHandlers,
} from '@docengine/engine';
