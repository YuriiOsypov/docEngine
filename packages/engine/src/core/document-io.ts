import {
  resolveSchemaDefaultValue,
  cellFieldId,
  isSchemaRequired,
  ensureCellSchemasForRows,
  extractRowKeysFromTableValues,
  mergeTableInstanceRows,
  parseCellFieldId,
  pruneTableCellDataForRows,
} from './field-schemas.js';
import { mapSegments, walkSegments } from './segment-tree.js';
import {
  expandTableArraysInValues,
  clearTableFlatKeysInRecord,
  expandedValuesIncludeTable,
  isTableRowArray,
  assignRowKeysForImport,
} from './field-io/table-field-io.js';
import {
  buildSectionedDocumentFromValues,
  expandSectionedDocument,
  expandSectionFieldMap,
  filterEmptySections,
  resolveRepeatablePagePlan,
} from './field-io/sectioned-document-io.js';
import { deriveFieldId, resolveSectionName } from './field-id.js';
import { isFieldEmpty } from '../utils/field-values.js';
import { evaluateComputedField } from './computed-formula.js';
import {
  normalizeRepeaterValue,
  repeaterHasContent,
  ensureRepeaterChildSchemas,
  sanitizeRepeaterChildSchemas,
  REPEATER_CHILD_FIELD_PREFIX,
} from './repeater-io.js';
import { migratePageSetup } from './page-setup-styles.js';
import { normalizeTemplateFieldSchemas } from '../utils/tree-nodes.js';
import type { EditorBlock, FieldSchema, TableRowInstance, TemplatePageSetup } from '../types.js';

/** Marks a fill-mode section clone produced from a `_source` instance array. */
export const SOURCE_INSTANCE_OF_KEY = '_sourceInstanceOf';
/** 0-based index within the `_source` instance array. */
export const SOURCE_INSTANCE_INDEX_KEY = '_sourceInstanceIndex';

type FieldSchemaMap = Record<string, FieldSchema>;
type ValueMap = Record<string, unknown>;

type TableColumn = {
  key: string;
  label?: string;
  [key: string]: unknown;
};

type TableSchema = FieldSchema & {
  type: 'table';
  columns?: TableColumn[];
  rows?: TableRowInstance[];
};

type ChildSchema = FieldSchema & {
  type: 'child';
  template?: {
    blocks?: EditorBlock[];
    fieldSchemas?: FieldSchemaMap;
    [key: string]: unknown;
  };
  fieldSchemas?: FieldSchemaMap;
  [key: string]: unknown;
};

type DocumentState = {
  time?: number;
  fieldSchemas?: FieldSchemaMap;
  blocks?: EditorBlock[];
  pageSetup?: TemplatePageSetup;
  fieldMapping?: unknown;
  [key: string]: unknown;
};

export const IO_VERSION = 2;

export function isFieldsExport(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const kind = (data as { kind?: string; blocks?: unknown[] }).kind;
  if (kind === 'field') return true;
  if (kind === 'document' && !Array.isArray((data as { blocks?: unknown[] }).blocks)) {
    return true;
  }
  return false;
}

export function isDocExport(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const kind = (data as { kind?: string; blocks?: unknown[] }).kind;
  if (kind === 'document' && Array.isArray((data as { blocks?: unknown[] }).blocks)) {
    return true;
  }
  return false;
}

function defaultForField(fieldId: string, fieldSchemas: FieldSchemaMap | null | undefined): unknown {
  const schema = fieldSchemas?.[fieldId];
  if (!schema) return '';
  return resolveSchemaDefaultValue(schema, { forTemplate: true });
}

function cloneBlocks(blocks: EditorBlock[] | null | undefined): EditorBlock[] {
  return JSON.parse(JSON.stringify(blocks ?? [])) as EditorBlock[];
}

export function collectAllValues(blocks: EditorBlock[] | null | undefined): ValueMap {
  const values: ValueMap = {};

  for (const block of blocks ?? []) {
    const data = (block.data ?? {}) as Record<string, any>;

    if (block.type === 'documentSection' && data.fieldValues) {
      Object.assign(values, data.fieldValues);
    }

    if (data.cells && typeof data.cells === 'object') {
      Object.assign(values, data.cells);
    }

    if (block.type === 'templateBlock' && data.fieldId) {
      const { fieldType, fieldId, value } = data;
      if (fieldType === 'table') continue;
      if (value !== undefined) {
        values[fieldId] = value;
      }
    }
  }

  return values;
}

export function enrichComputedValues(
  values: ValueMap,
  fieldSchemas: FieldSchemaMap | null | undefined,
  blocks: EditorBlock[] | null | undefined,
): ValueMap {
  const fieldIds = collectFieldIdsInBlocks(blocks, fieldSchemas);
  for (const fieldId of fieldIds) {
    const schema = fieldSchemas?.[fieldId];
    if (schema?.type !== 'computed') continue;
    const { value } = evaluateComputedField(fieldId, values, fieldSchemas ?? {}, { blocks: blocks ?? [] });
    values[fieldId] = value;
  }
  return values;
}

export function collectFieldIdsInBlocks(
  blocks: EditorBlock[] | null | undefined,
  fieldSchemas: FieldSchemaMap | null | undefined,
): Set<string> {
  const ids = new Set<string>();

  for (const block of blocks ?? []) {
    const data = block.data ?? {};

    if (block.type === 'documentSection') {
      walkSegments(data.segments ?? [], (seg) => {
        if ((seg.type === 'field' || seg.type === 'child') && seg.id) ids.add(seg.id);
        if (seg.type === 'table' && seg.id) {
          ids.add(seg.id);
          const tableSchema = fieldSchemas?.[seg.id] as TableSchema | undefined;
          const rows = seg.rows ?? tableSchema?.rows ?? [];
          for (const row of rows) {
            for (const col of tableSchema?.columns ?? []) {
              ids.add(cellFieldId(seg.id, row.key, col.key));
            }
          }
        }
      });
    }

    const isTableBlock =
      block.type === 'visionTable' ||
      (block.type === 'templateBlock' && data.fieldType === 'table');

    if (isTableBlock && data.fieldId) {
      ids.add(data.fieldId);
      const tableSchema = fieldSchemas?.[data.fieldId] as TableSchema | undefined;
      for (const row of tableSchema?.rows ?? []) {
        for (const col of tableSchema?.columns ?? []) {
          ids.add(cellFieldId(data.fieldId, row.key, col.key));
        }
      }
    }

    if (
      block.type === 'templateBlock' &&
      data.fieldId &&
      data.fieldType !== 'table'
    ) {
      ids.add(data.fieldId);
    }
  }

  return ids;
}

/** Top-level field schema IDs referenced by document blocks (fields, tables, cells, repeaters). */
export function collectReferencedFieldSchemaIds(
  blocks: EditorBlock[] | null | undefined,
  fieldSchemas: FieldSchemaMap | null | undefined,
): Set<string> {
  const ids = new Set(collectFieldIdsInBlocks(blocks, fieldSchemas));

  for (const block of blocks ?? []) {
    if (block.type !== 'documentSection') continue;
    walkSegments(block.data?.segments ?? [], (seg) => {
      if (seg.type === 'table' && seg.id) ids.add(seg.id);
    });
  }

  for (const id of [...ids]) {
    const cellRef = parseCellFieldId(id, fieldSchemas) as { tableId?: string } | null | undefined;
    if (cellRef?.tableId) ids.add(cellRef.tableId);
  }

  for (const id of Object.keys(fieldSchemas ?? {})) {
    if (!id.startsWith(REPEATER_CHILD_FIELD_PREFIX)) continue;
    const rest = id.slice(REPEATER_CHILD_FIELD_PREFIX.length);
    const sep = rest.indexOf('_');
    if (sep <= 0) continue;
    const repeaterId = rest.slice(0, sep);
    if (ids.has(repeaterId)) ids.add(id);
  }

  return ids;
}

function pruneNestedChildSchema(
  schema: ChildSchema,
  parentFieldSchemas: FieldSchemaMap | null | undefined,
  parentBlocks: EditorBlock[] | null | undefined,
): FieldSchema {
  if (!schema || schema.type !== 'child') return schema;

  if (schema.template?.blocks?.length) {
    const templateBlocks = schema.template.blocks;
    const templateSchemas = schema.template.fieldSchemas ?? {};
    const prunedChildSchemas = pruneUnusedFieldSchemas(templateSchemas, templateBlocks);
    const prunedChildBlocks = pruneUnusedBlockValues(templateBlocks, prunedChildSchemas);
    return {
      ...schema,
      template: {
        ...schema.template,
        fieldSchemas: prunedChildSchemas,
        blocks: prunedChildBlocks,
      },
    };
  }

  return sanitizeRepeaterChildSchemas(schema, parentFieldSchemas, parentBlocks);
}

/** Drop field schemas that are not referenced anywhere in the document blocks. */
export function pruneUnusedFieldSchemas(
  fieldSchemas: FieldSchemaMap | null | undefined,
  blocks: EditorBlock[] | null | undefined,
): FieldSchemaMap {
  const referenced = collectReferencedFieldSchemaIds(blocks, fieldSchemas);
  const pruned: FieldSchemaMap = {};

  for (const id of referenced) {
    const schema = fieldSchemas?.[id];
    if (!schema) continue;
    pruned[id] =
      schema.type === 'child'
        ? pruneNestedChildSchema(schema as ChildSchema, fieldSchemas, blocks)
        : schema;
  }

  return pruned;
}

/** Remove stored values for fields that are no longer referenced in blocks. */
export function pruneUnusedBlockValues(
  blocks: EditorBlock[] | null | undefined,
  fieldSchemas: FieldSchemaMap | null | undefined,
): EditorBlock[] {
  const referenced = collectReferencedFieldSchemaIds(blocks, fieldSchemas);

  return cloneBlocks(blocks).map((block) => {
    const data = (block.data ?? {}) as Record<string, any>;

    if (block.type === 'documentSection' && data.fieldValues) {
      const fieldValues: ValueMap = {};
      for (const key of referenced) {
        if (Object.prototype.hasOwnProperty.call(data.fieldValues, key)) {
          fieldValues[key] = data.fieldValues[key];
        }
      }
      return { ...block, data: { ...data, fieldValues } };
    }

    if (data.cells && typeof data.cells === 'object') {
      const cells: ValueMap = {};
      for (const key of referenced) {
        if (Object.prototype.hasOwnProperty.call(data.cells, key)) {
          cells[key] = data.cells[key];
        }
      }
      return { ...block, data: { ...data, cells } };
    }

    return block;
  });
}

function pruneDocumentForExport(doc: DocumentState): {
  fieldSchemas: FieldSchemaMap;
  blocks: EditorBlock[];
} {
  const blocks = doc.blocks ?? [];
  const fieldSchemas = pruneUnusedFieldSchemas(doc.fieldSchemas ?? {}, blocks);
  return {
    fieldSchemas,
    blocks: pruneUnusedBlockValues(blocks, fieldSchemas),
  };
}

export function findMissingRequiredFields(doc: DocumentState): Array<{ fieldId: string; label: string }> {
  const fieldSchemas = doc.fieldSchemas ?? {};
  const blocks = doc.blocks ?? [];
  const values = collectAllValues(blocks);
  enrichComputedValues(values, fieldSchemas, blocks);
  const fieldIds = collectFieldIdsInBlocks(blocks, fieldSchemas);
  const missing: Array<{ fieldId: string; label: string }> = [];

  for (const fieldId of fieldIds) {
    const schema = fieldSchemas[fieldId];
    if (!isSchemaRequired(schema)) continue;

    if (schema?.type === 'computed') {
      const { value, error } = evaluateComputedField(fieldId, values, fieldSchemas, { blocks });
      if (error || isFieldEmpty(value)) {
        missing.push({
          fieldId,
          label: (schema.label as string | undefined) ?? fieldId,
        });
      }
      continue;
    }

    if (schema?.type === 'child') {
      if (!repeaterHasContent(values[fieldId], schema)) {
        missing.push({
          fieldId,
          label: (schema.label as string | undefined) ?? fieldId,
        });
      }
      continue;
    }

    if (isFieldEmpty(values[fieldId], { htmlEditor: !!schema?.htmlEditor })) {
      missing.push({
        fieldId,
        label: (schema?.label as string | undefined) ?? fieldId,
      });
    }
  }

  missing.sort((a, b) => a.label.localeCompare(b.label));
  return missing;
}

export function validateRequiredFields(doc: DocumentState): {
  valid: boolean;
  missing: Array<{ fieldId: string; label: string }>;
} {
  const missing = findMissingRequiredFields(doc);
  return { valid: missing.length === 0, missing };
}

export function stripValuesFromBlocks(
  blocks: EditorBlock[] | null | undefined,
  fieldSchemas: FieldSchemaMap | null | undefined,
): EditorBlock[] {
  return cloneBlocks(blocks).map((block) => {
    const data = { ...(block.data as Record<string, any> | undefined) } as Record<string, any>;

    if (block.type === 'documentSection') {
      const fieldValues = { ...(data.fieldValues ?? {}) } as ValueMap;
      for (const seg of data.segments ?? []) {
        if (seg.type === 'field') {
          fieldValues[seg.id] = defaultForField(seg.id, fieldSchemas);
        }
      }
      for (const key of Object.keys(fieldValues)) {
        fieldValues[key] = defaultForField(key, fieldSchemas);
      }
      return { ...block, data: { ...data, fieldValues } };
    }

    if (data.cells && typeof data.cells === 'object') {
      const cells: ValueMap = {};
      for (const key of Object.keys(data.cells)) {
        cells[key] = defaultForField(key, fieldSchemas);
      }
      return { ...block, data: { ...data, cells } };
    }

    if (block.type === 'templateBlock') {
      const next = { ...data };
      if (next.fieldType === 'child') {
        next.value = {};
      } else if (next.fieldType !== 'table' && next.fieldId) {
        next.value = defaultForField(next.fieldId, fieldSchemas);
      }
      return { ...block, data: next };
    }

    return block;
  });
}

function clonePageSetup(pageSetup: unknown): TemplatePageSetup | undefined {
  if (!pageSetup || typeof pageSetup !== 'object') return undefined;
  return JSON.parse(JSON.stringify(pageSetup)) as TemplatePageSetup;
}

export function buildTemplateExport(doc: DocumentState): Record<string, any> {
  const { fieldSchemas, blocks } = pruneDocumentForExport(doc);
  const exportData: Record<string, any> = {
    kind: 'template',
    version: IO_VERSION,
    time: doc.time ?? Date.now(),
    fieldSchemas: normalizeTemplateFieldSchemas(fieldSchemas),
    blocks: stripValuesFromBlocks(blocks, fieldSchemas),
  };
  const pageSetup = clonePageSetup(doc.pageSetup);
  if (pageSetup) exportData.pageSetup = pageSetup;
  if (doc.fieldMapping) exportData.fieldMapping = doc.fieldMapping;
  return exportData;
}

export function buildFieldsExport(
  doc: DocumentState,
  options: { hideEmptyValues?: boolean } = {},
): Record<string, any> {
  const hideEmpty = options.hideEmptyValues === true;
  const { fieldSchemas, blocks } = pruneDocumentForExport(doc);
  const flatValues = collectAllValues(blocks);
  enrichComputedValues(flatValues, fieldSchemas, blocks);
  let sections = buildSectionedDocumentFromValues(
    blocks,
    fieldSchemas,
    flatValues,
    { includeAllFields: !hideEmpty },
  );
  if (hideEmpty) {
    sections = filterEmptySections(sections, blocks, fieldSchemas);
  }
  // Fill mode may have expanded `_source` arrays into cloned section blocks;
  // collapse them back so export keeps `sections.Name: [{…}, {…}]` for preview/PDF.
  if (hasMaterializedSourceSections(blocks)) {
    sections = collapseMaterializedSourceSections(
      blocks,
      fieldSchemas,
      sections,
    ) as typeof sections;
  }
  return {
    kind: 'field',
    version: IO_VERSION,
    time: doc.time ?? Date.now(),
    sections,
  };
}

/** @deprecated Use buildFieldsExport */
export const buildDocumentExport = buildFieldsExport;

export function normalizeDocumentValues(
  data: { sections?: Record<string, any>; values?: ValueMap } | null | undefined,
  blocks: EditorBlock[],
  fieldSchemas?: FieldSchemaMap | null,
): ValueMap {
  if (data?.sections && typeof data.sections === 'object') {
    return expandSectionedDocument(data.sections, blocks, fieldSchemas ?? {});
  }
  return data?.values ?? {};
}

export function buildDocExport(doc: DocumentState): Record<string, any> {
  const { fieldSchemas, blocks } = pruneDocumentForExport(doc);
  const exportData: Record<string, any> = {
    kind: 'document',
    version: IO_VERSION,
    time: doc.time ?? Date.now(),
    fieldSchemas: { ...fieldSchemas },
    blocks: cloneBlocks(blocks),
  };
  const pageSetup = clonePageSetup(doc.pageSetup);
  if (pageSetup) exportData.pageSetup = pageSetup;
  return exportData;
}

function syncComputedValuesToBlocks(
  blocks: EditorBlock[] | null | undefined,
  fieldSchemas: FieldSchemaMap | null | undefined,
  flatValues: ValueMap,
): void {
  for (const block of blocks ?? []) {
    const data = (block.data ?? {}) as Record<string, any>;

    if (block.type === 'documentSection') {
      const fieldValues = data.fieldValues ?? {};
      // Walk nested columns so computed fields beside tables (e.g. Sub-Total)
      // receive recalculated values after mapping / import.
      walkSegments(data.segments ?? [], (seg) => {
        if ((seg.type === 'field' || seg.type === 'child') && seg.id) {
          const schema = fieldSchemas?.[seg.id];
          if (schema?.type === 'computed') {
            fieldValues[seg.id] = flatValues[seg.id] ?? '';
          }
        }
        if (seg.type === 'table' && seg.id) {
          const tableSchema = fieldSchemas?.[seg.id] as TableSchema | undefined;
          const rows = seg.rows ?? tableSchema?.rows ?? [];
          for (const row of rows) {
            for (const col of tableSchema?.columns ?? []) {
              const cellId = cellFieldId(seg.id, row.key, col.key);
              if (fieldSchemas?.[cellId]?.type === 'computed') {
                fieldValues[cellId] = flatValues[cellId] ?? '';
              }
            }
          }
        }
      });
      continue;
    }

    if (block.type === 'templateBlock' && data.fieldId) {
      if (fieldSchemas?.[data.fieldId]?.type === 'computed') {
        data.value = flatValues[data.fieldId] ?? '';
      }
    }
  }
}

export function applyDocumentValues(
  blocks: EditorBlock[] | null | undefined,
  values: ValueMap | null | undefined,
  fieldSchemas: FieldSchemaMap | null | undefined,
): {
  blocks: EditorBlock[];
  fieldSchemas: FieldSchemaMap;
  applied: number;
  skipped: number;
} {
  const expandedValues = expandTableArraysInValues(values ?? {}, fieldSchemas ?? {});
  const appliedKeys = new Set<string>();
  const nextBlocks = cloneBlocks(blocks);
  let nextFieldSchemas: FieldSchemaMap = { ...(fieldSchemas ?? {}) };

  for (const block of nextBlocks) {
    const data = (block.data ?? {}) as Record<string, any>;

    if (block.type === 'documentSection') {
      const fieldValues = { ...(data.fieldValues ?? {}) } as ValueMap;

      for (const key of Object.keys(fieldValues)) {
        if (!Object.prototype.hasOwnProperty.call(expandedValues, key)) continue;
        if (nextFieldSchemas[key]?.type === 'computed') continue;
        fieldValues[key] = expandedValues[key];
        appliedKeys.add(key);
      }

      // Walk nested columns so tables/fields inside a 2-column layout still
      // receive mapped row expansions (master-detail $values).
      const segments = mapSegments(data.segments ?? [], (seg) => {
        if (seg.type === 'field' && seg.id && Object.prototype.hasOwnProperty.call(expandedValues, seg.id)) {
          const fieldSchema = nextFieldSchemas[seg.id];
          if (fieldSchema?.type === 'computed') return seg;
          let nextValue = expandedValues[seg.id];
          if (fieldSchema?.type === 'child') {
            nextValue = normalizeRepeaterValue(nextValue, fieldSchema);
            nextFieldSchemas[seg.id] = ensureRepeaterChildSchemas(
              fieldSchema,
              nextValue,
              nextFieldSchemas,
              blocks,
            );
          }
          fieldValues[seg.id] = nextValue;
          appliedKeys.add(seg.id);
          return seg;
        }

        if (seg.type === 'child' && seg.id && Object.prototype.hasOwnProperty.call(expandedValues, seg.id)) {
          const fieldSchema = nextFieldSchemas[seg.id];
          if (fieldSchema?.type === 'child') {
            const nextValue = normalizeRepeaterValue(expandedValues[seg.id], fieldSchema);
            fieldValues[seg.id] = nextValue;
            nextFieldSchemas[seg.id] = ensureRepeaterChildSchemas(
              fieldSchema,
              nextValue,
              nextFieldSchemas,
              blocks,
            );
            appliedKeys.add(seg.id);
          }
          return seg;
        }

        if (seg.type !== 'table' || !seg.id) return seg;

        const tableSchema = nextFieldSchemas[seg.id] as TableSchema | undefined;
        if (!tableSchema) return seg;

        if ((tableSchema as any).type === 'pivotTable') {
          if (Object.prototype.hasOwnProperty.call(expandedValues, seg.id)) {
            fieldValues[seg.id] = expandedValues[seg.id];
            appliedKeys.add(seg.id);
          }
          return seg;
        }

        const rawTableRows = values?.[seg.id];
        const replacingTable =
          isTableRowArray(rawTableRows) || expandedValuesIncludeTable(seg.id, expandedValues);
        if (replacingTable) {
          clearTableFlatKeysInRecord(seg.id, fieldValues, tableSchema as any);
        }

        const discoveredRowKeys = extractRowKeysFromTableValues(
          seg.id,
          tableSchema,
          expandedValues,
        ) as Set<string>;
        let mergedRows: TableRowInstance[] = replacingTable
          ? [...discoveredRowKeys]
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
              .map((key) => ({ key, label: '' }))
          : (mergeTableInstanceRows(seg.rows, discoveredRowKeys, tableSchema) as TableRowInstance[]);

        // When flat keys were missing but the payload still has a row array,
        // force instance rows from that array length (nested-column tables).
        if (replacingTable && mergedRows.length === 0 && isTableRowArray(rawTableRows)) {
          mergedRows = assignRowKeysForImport(tableSchema, rawTableRows.length).map((key) => ({
            key,
            label: '',
          }));
        }

        let nextSeg = seg;
        if (mergedRows.length > 0) {
          nextSeg = { ...seg, rows: mergedRows };
          nextFieldSchemas = ensureCellSchemasForRows(
            tableSchema,
            seg.id,
            nextFieldSchemas,
            mergedRows,
          );
        }

        for (const row of mergedRows) {
          for (const col of tableSchema.columns ?? []) {
            const cellId = cellFieldId(seg.id, row.key, col.key);
            if (Object.prototype.hasOwnProperty.call(expandedValues, cellId)) {
              fieldValues[cellId] = expandedValues[cellId];
              appliedKeys.add(cellId);
              continue;
            }
            // Fallback when flat keys still use payload property names
            // (`table_1_row2_name`) but the column key is `column_1`.
            const rowPrefix = `${seg.id}_${row.key}_`;
            const label = String(col.label ?? col.name ?? '')
              .trim()
              .toLowerCase();
            for (const [key, value] of Object.entries(expandedValues)) {
              if (!key.startsWith(rowPrefix)) continue;
              const prop = key.slice(rowPrefix.length);
              if (!prop) continue;
              if (
                prop === col.key ||
                (label && prop.toLowerCase() === label) ||
                prop.toLowerCase() === String(col.key).toLowerCase()
              ) {
                fieldValues[cellId] = value;
                appliedKeys.add(cellId);
                break;
              }
            }
          }
        }

        if (replacingTable) {
          const pruned = pruneTableCellDataForRows(
            seg.id,
            mergedRows.map((row) => row.key),
            fieldValues,
            nextFieldSchemas,
          ) as { fieldValues: ValueMap; fieldSchemas: FieldSchemaMap };
          Object.assign(fieldValues, pruned.fieldValues);
          nextFieldSchemas = pruned.fieldSchemas;
        }

        return nextSeg;
      });

      block.data = { ...data, segments, fieldValues };
      continue;
    }

    if (data.cells && typeof data.cells === 'object') {
      const cells = { ...data.cells } as ValueMap;
      for (const key of Object.keys(cells)) {
        if (!Object.prototype.hasOwnProperty.call(expandedValues, key)) continue;
        if (nextFieldSchemas[key]?.type === 'computed') continue;
        cells[key] = expandedValues[key];
        appliedKeys.add(key);
      }
      block.data = { ...data, cells };
      continue;
    }

    if (block.type === 'templateBlock' && data.fieldId) {
      const { fieldType, fieldId } = data;
      if (Object.prototype.hasOwnProperty.call(expandedValues, fieldId)) {
        const fieldSchema = fieldSchemas?.[fieldId];
        if (fieldSchema?.type === 'computed') continue;
        let nextValue = expandedValues[fieldId];
        if (fieldSchema?.type === 'child' || fieldType === 'child') {
          nextValue = normalizeRepeaterValue(nextValue, fieldSchema);
          if (fieldSchema) {
            nextFieldSchemas[fieldId] = ensureRepeaterChildSchemas(
              fieldSchema,
              nextValue,
              nextFieldSchemas,
              blocks,
            );
          }
        }
        block.data = { ...data, value: nextValue };
        appliedKeys.add(fieldId);
      }
    }
  }

  for (const [fieldId, schema] of Object.entries(fieldSchemas ?? {})) {
    if (schema?.type === 'table' && Array.isArray(values?.[fieldId])) {
      appliedKeys.add(fieldId);
    }
  }

  const skipped = Object.keys(values ?? {}).filter((key) => !appliedKeys.has(key)).length;

  const flatValues = collectAllValues(nextBlocks);
  enrichComputedValues(flatValues, nextFieldSchemas, nextBlocks);
  syncComputedValuesToBlocks(nextBlocks, nextFieldSchemas, flatValues);

  return {
    blocks: nextBlocks,
    fieldSchemas: nextFieldSchemas,
    applied: appliedKeys.size,
    skipped,
  };
}

/**
 * Apply one repeatable-section instance onto a document clone.
 */
export function applySectionInstanceToBlocks(
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap | null | undefined,
  sectionBlockIndex: number,
  instanceFieldMap: ValueMap,
): { blocks: EditorBlock[]; fieldSchemas: FieldSchemaMap } {
  const nextBlocks = cloneBlocks(blocks);
  const sectionBlock = nextBlocks[sectionBlockIndex];
  if (!sectionBlock || sectionBlock.type !== 'documentSection') {
    return { blocks: nextBlocks, fieldSchemas: { ...(fieldSchemas ?? {}) } };
  }

  const flatValues = expandSectionFieldMap(
    instanceFieldMap,
    sectionBlock,
    nextBlocks,
    fieldSchemas ?? {},
  );
  return applyDocumentValues(nextBlocks, flatValues, fieldSchemas);
}

type SectionFieldMap = Record<string, unknown>;
type DocumentSectionValues = SectionFieldMap | SectionFieldMap[];

/**
 * Copy a section block with new field IDs (schemas are copied, not moved) so
 * multiple `_source` instances can coexist in fill mode.
 */
function duplicateSectionBlockWithNewIds(
  block: EditorBlock,
  fieldSchemas: FieldSchemaMap,
  sectionName: string,
): { block: EditorBlock; fieldSchemas: FieldSchemaMap } {
  const nextBlock = cloneBlocks([block])[0]!;
  const data = { ...(nextBlock.data as Record<string, any>) };
  data.name = sectionName;
  data.label = data.label ?? sectionName;

  let schemas: FieldSchemaMap = { ...fieldSchemas };
  const usedIds = new Set(Object.keys(schemas));
  const idRenames: Record<string, string> = {};

  data.segments = mapSegments(data.segments ?? [], (seg) => {
    if (seg.type !== 'field' && seg.type !== 'table' && seg.type !== 'child') return seg;
    const oldId = seg.id;
    if (!oldId || typeof oldId !== 'string') return seg;
    if (oldId.startsWith(REPEATER_CHILD_FIELD_PREFIX)) return seg;
    const schema = schemas[oldId];
    if (!schema) return seg;

    const fieldName = String(schema.name ?? schema.label ?? oldId);
    const newId = deriveFieldId(sectionName, fieldName, usedIds);
    usedIds.add(newId);
    if (newId === oldId) return seg;

    idRenames[oldId] = newId;
    schemas[newId] = JSON.parse(JSON.stringify(schema)) as FieldSchema;

    if (schema.type === 'table') {
      const oldPrefix = `${oldId}_`;
      for (const key of Object.keys(fieldSchemas)) {
        if (!key.startsWith(oldPrefix)) continue;
        const cellNewId = `${newId}_${key.slice(oldPrefix.length)}`;
        if (schemas[key] && !schemas[cellNewId]) {
          schemas[cellNewId] = JSON.parse(JSON.stringify(schemas[key])) as FieldSchema;
          usedIds.add(cellNewId);
        }
      }
    }

    return { ...seg, id: newId };
  });

  if (data.fieldValues && typeof data.fieldValues === 'object') {
    const nextFv: ValueMap = {};
    for (const [key, value] of Object.entries(data.fieldValues as ValueMap)) {
      let nextKey = key;
      for (const [oldId, newId] of Object.entries(idRenames)) {
        if (key === oldId) {
          nextKey = newId;
          break;
        }
        if (key.startsWith(`${oldId}_`)) {
          nextKey = `${newId}_${key.slice(oldId.length + 1)}`;
          break;
        }
      }
      nextFv[nextKey] = value;
    }
    data.fieldValues = nextFv;
  }

  nextBlock.data = data;
  return { block: nextBlock, fieldSchemas: schemas };
}

/**
 * Expand `_source` section instance arrays into concrete fill-mode section blocks
 * (one block per array element, including nested table rows). Preview/PDF already
 * clone via `repeatableSectionInstances`; without this, the editor only shows
 * `instances[0]`.
 */
export function materializeRepeatableSectionInstances(
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
  loadedSections: Record<string, DocumentSectionValues> | null | undefined,
): { blocks: EditorBlock[]; fieldSchemas: FieldSchemaMap; materialized: boolean } {
  const plan = resolveRepeatablePagePlan(blocks, fieldSchemas, {}, loadedSections);
  if (!plan || plan.instances.length <= 1) {
    return {
      blocks: cloneBlocks(blocks),
      fieldSchemas: { ...fieldSchemas },
      materialized: false,
    };
  }

  const before = cloneBlocks(blocks.slice(0, plan.repeatableBlockIndex));
  const after = cloneBlocks(blocks.slice(plan.repeatableBlockIndex + 1));
  const seed = stripValuesFromBlocks(
    [blocks[plan.repeatableBlockIndex]!],
    fieldSchemas,
  )[0]!;

  let schemas: FieldSchemaMap = { ...fieldSchemas };
  const instanceBlocks: EditorBlock[] = [];

  for (let i = 0; i < plan.instances.length; i += 1) {
    let block = cloneBlocks([seed])[0]!;
    const instanceName = i === 0 ? plan.sectionName : `${plan.sectionName}__src${i}`;
    block.data = {
      ...(block.data as Record<string, any>),
      name: instanceName,
      label: (seed.data as Record<string, any> | undefined)?.label ?? plan.sectionName,
      [SOURCE_INSTANCE_OF_KEY]: plan.sectionName,
      [SOURCE_INSTANCE_INDEX_KEY]: i,
    };

    if (i > 0) {
      const duplicated = duplicateSectionBlockWithNewIds(block, schemas, instanceName);
      block = duplicated.block;
      schemas = duplicated.fieldSchemas;
    }

    const applied = applySectionInstanceToBlocks([block], schemas, 0, plan.instances[i]!);
    schemas = applied.fieldSchemas;
    instanceBlocks.push(applied.blocks[0]!);
  }

  return {
    blocks: [...before, ...instanceBlocks, ...after],
    fieldSchemas: schemas,
    materialized: true,
  };
}

const SOURCE_CLONE_NAME_RE = /^(.*)__src(\d+)$/;

function resolveSourceInstanceGroup(
  block: EditorBlock,
): { sourceName: string; index: number } | null {
  const data = block.data as Record<string, any> | undefined;
  const sourceOf = data?.[SOURCE_INSTANCE_OF_KEY];
  if (typeof sourceOf === 'string' && sourceOf.trim()) {
    const rawIndex = data?.[SOURCE_INSTANCE_INDEX_KEY];
    const index =
      typeof rawIndex === 'number' && Number.isFinite(rawIndex)
        ? rawIndex
        : Number(rawIndex);
    return {
      sourceName: sourceOf.trim(),
      index: Number.isFinite(index) ? index : 0,
    };
  }

  // Fallback when DocumentSection stripped markers but kept `name__srcN`.
  const name = resolveSectionName(data);
  const match = SOURCE_CLONE_NAME_RE.exec(name);
  if (!match) return null;
  return {
    sourceName: match[1]!,
    index: Number(match[2]),
  };
}

/**
 * Rebuild `_source` instance arrays from fill-mode section clones so export keeps
 * the same shape preview/PDF expect (`sections.items: [{…}, {…}]`).
 */
export function collapseMaterializedSourceSections(
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
  sections: Record<string, unknown>,
): Record<string, unknown> {
  const groups = new Map<string, Array<{ block: EditorBlock; index: number }>>();
  const sourceNames = new Set<string>();

  for (const block of blocks) {
    if (block.type !== 'documentSection') continue;
    const grouped = resolveSourceInstanceGroup(block);
    if (grouped) {
      sourceNames.add(grouped.sourceName);
      const list = groups.get(grouped.sourceName) ?? [];
      list.push({ block, index: grouped.index });
      groups.set(grouped.sourceName, list);
      continue;
    }
  }

  // Include the seed section (`name` without `__srcN`) once clones exist.
  for (const block of blocks) {
    if (block.type !== 'documentSection') continue;
    const name = resolveSectionName(block.data);
    if (!sourceNames.has(name)) continue;
    if (SOURCE_CLONE_NAME_RE.test(name)) continue;
    const list = groups.get(name) ?? [];
    if (list.some((entry) => entry.block === block)) continue;
    const rawIndex = (block.data as Record<string, any> | undefined)?.[SOURCE_INSTANCE_INDEX_KEY];
    const index =
      typeof rawIndex === 'number' && Number.isFinite(rawIndex)
        ? rawIndex
        : Number(rawIndex);
    list.push({ block, index: Number.isFinite(index) ? index : 0 });
    groups.set(name, list);
  }

  if (groups.size === 0) return sections;

  const next: Record<string, unknown> = { ...sections };
  for (const [sourceName, groupBlocks] of groups) {
    if (groupBlocks.length <= 1) continue;
    const ordered = [...groupBlocks].sort((a, b) => a.index - b.index);

    const instances: SectionFieldMap[] = [];
    for (const entry of ordered) {
      const name = resolveSectionName(entry.block.data);
      delete next[name];
      const flat = collectAllValues([entry.block]);
      const built = buildSectionedDocumentFromValues(
        [entry.block],
        fieldSchemas,
        flat,
        { includeAllFields: true },
      );
      const map = (built[name] ?? built[sourceName] ?? {}) as SectionFieldMap;
      const cleaned: SectionFieldMap = { ...map };
      delete cleaned[SOURCE_INSTANCE_OF_KEY];
      delete cleaned[SOURCE_INSTANCE_INDEX_KEY];
      instances.push(cleaned);
    }

    if (instances.length > 0) {
      next[sourceName] = instances;
    }
  }
  return next;
}

export function hasMaterializedSourceSections(
  blocks: EditorBlock[] | null | undefined,
): boolean {
  for (const block of blocks ?? []) {
    if (block.type !== 'documentSection') continue;
    if (resolveSourceInstanceGroup(block)) return true;
  }
  return false;
}

export function normalizeImportedDoc(data: Record<string, any> | null | undefined): DocumentState {
  if (isFieldsExport(data)) {
    throw new Error('This is a field values file. Use Document â†’ Load.');
  }

  if (
    data?.kind === 'template' ||
    data?.kind === 'document' ||
    data?.blocks
  ) {
    const doc: DocumentState = {
      time: data.time ?? Date.now(),
      fieldSchemas:
        data?.kind === 'template'
          ? (normalizeTemplateFieldSchemas(data.fieldSchemas ?? {}) as FieldSchemaMap)
          : { ...(data.fieldSchemas ?? {}) },
      blocks: data.blocks ?? [],
    };
    const pageSetup = clonePageSetup(data.pageSetup);
    if (pageSetup) doc.pageSetup = migratePageSetup(pageSetup);
    if (data.fieldMapping) doc.fieldMapping = data.fieldMapping;
    return doc;
  }

  throw new Error('Unrecognized file format. Use a document or template JSON file.');
}
