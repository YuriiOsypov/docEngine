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
import { walkSegments } from './segment-tree.js';
import {
  expandTableArraysInValues,
  clearTableFlatKeysInRecord,
  expandedValuesIncludeTable,
  isTableRowArray,
} from './field-io/table-field-io.js';
import {
  buildSectionedDocumentFromValues,
  expandSectionedDocument,
  expandSectionFieldMap,
  filterEmptySections,
} from './field-io/sectioned-document-io.js';
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
      const segments = [...(data.segments ?? [])];

      for (const key of Object.keys(fieldValues)) {
        if (!Object.prototype.hasOwnProperty.call(expandedValues, key)) continue;
        if (nextFieldSchemas[key]?.type === 'computed') continue;
        fieldValues[key] = expandedValues[key];
        appliedKeys.add(key);
      }

      for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
        const seg = segments[segIndex];

        if (seg.type === 'field' && Object.prototype.hasOwnProperty.call(expandedValues, seg.id)) {
          const fieldSchema = nextFieldSchemas[seg.id];
          if (fieldSchema?.type === 'computed') continue;
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
          continue;
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
          continue;
        }

        if (seg.type !== 'table' || !seg.id) continue;

        const tableSchema = nextFieldSchemas[seg.id] as TableSchema | undefined;
        if (!tableSchema) continue;

        if ((tableSchema as any).type === 'pivotTable') {
          if (Object.prototype.hasOwnProperty.call(expandedValues, seg.id)) {
            fieldValues[seg.id] = expandedValues[seg.id];
            appliedKeys.add(seg.id);
          }
          continue;
        }

        const replacingTable =
          isTableRowArray(values?.[seg.id]) || expandedValuesIncludeTable(seg.id, expandedValues);
        if (replacingTable) {
          clearTableFlatKeysInRecord(seg.id, fieldValues, tableSchema as any);
        }

        const discoveredRowKeys = extractRowKeysFromTableValues(
          seg.id,
          tableSchema,
          expandedValues,
        ) as Set<string>;
        const mergedRows: TableRowInstance[] = replacingTable
          ? [...discoveredRowKeys]
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
              .map((key) => ({ key, label: '' }))
          : (mergeTableInstanceRows(seg.rows, discoveredRowKeys, tableSchema) as TableRowInstance[]);

        if (mergedRows.length > 0) {
          segments[segIndex] = { ...seg, rows: mergedRows };
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
      }

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
