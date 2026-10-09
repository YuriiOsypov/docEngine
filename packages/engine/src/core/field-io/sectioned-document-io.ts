import { ROOT_SECTION_KEY, resolveSectionName, resolveFieldIdByName } from '../field-id.js';
import { walkSegments } from '../segment-tree.js';
import {
  collapseTablesInValues,
  expandTableArraysInValues,
  isTableRowArray,
  filterTableRowsWithContent,
  projectTableRowsOntoColumns,
} from './table-field-io.js';
import { normalizeRepeaterValue, repeaterHasContent } from '../repeater-io.js';
import { resolveSchemaDefaultValue } from '../field-schemas.js';
import { isFieldEmpty } from '../../utils/field-values.js';
import type { EditorBlock, FieldSchema, Segment } from '../../types.js';

type FieldSchemaMap = Record<string, FieldSchema>;
type ValueMap = Record<string, unknown>;
type SectionFieldMap = Record<string, unknown>;
type DocumentSectionValues = SectionFieldMap | SectionFieldMap[];

type TableColumn = {
  key: string;
  label?: string;
  [key: string]: unknown;
};

type TableSchema = FieldSchema & {
  type: 'table';
  columns?: TableColumn[];
};

type AdjacentTableCandidate = {
  block: EditorBlock;
  index: number;
  tableId: string;
  blockKind: string;
};

type RepeatablePagePlan = {
  sectionName: string;
  repeatableBlockIndex: number;
  instances: SectionFieldMap[];
  companionBlockIndex: null;
  companionTableRows: null;
};

export function isSectionInstanceArray(value: unknown): value is SectionFieldMap[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item != null && typeof item === 'object' && !Array.isArray(item))
  );
}

export function findRepeatableSectionBlock(
  blocks: EditorBlock[] | null | undefined,
): { index: number; block: EditorBlock; sectionName: string } | null {
  for (let index = 0; index < (blocks ?? []).length; index += 1) {
    const block = blocks![index];
    if (block.type === 'documentSection' && block.data?.repeatable) {
      return {
        index,
        block,
        sectionName: resolveSectionName(block.data),
      };
    }
  }
  return null;
}

export function isRepeatableSectionName(
  blocks: EditorBlock[] | null | undefined,
  sectionName: string,
): boolean {
  for (const block of blocks ?? []) {
    if (block.type === 'documentSection' && resolveSectionName(block.data) === sectionName) {
      return !!block.data?.repeatable;
    }
  }
  return false;
}

/**
 * When a mapped field name does not resolve, fall back to the only table in the
 * section so master-detail `$values` arrays still bind.
 */
function findSoleTableFieldId(
  sectionBlock: EditorBlock,
  fieldSchemas: FieldSchemaMap,
): string | null {
  const ids: string[] = [];
  walkSegments(sectionBlock.data?.segments ?? [], (seg) => {
    if (seg.type === 'table' && seg.id && fieldSchemas[seg.id]?.type === 'table') {
      ids.push(seg.id);
    }
  });
  return ids.length === 1 ? ids[0] : null;
}

export function expandSectionFieldMap(
  fieldMap: SectionFieldMap | null | undefined,
  sectionBlock: EditorBlock,
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
): ValueMap {
  const flat: ValueMap = {};
  const sectionName = resolveSectionName(sectionBlock.data ?? {});
  const soleTableId = findSoleTableFieldId(sectionBlock, fieldSchemas);

  for (const [fieldName, value] of Object.entries(fieldMap ?? {})) {
    let fieldId = resolveFieldIdByName(sectionName, fieldName, blocks, fieldSchemas);
    if (!fieldId && soleTableId && isTableRowArray(value)) {
      fieldId = soleTableId;
    }
    if (!fieldId) continue;

    const schema = fieldSchemas[fieldId];
    if (schema?.type === 'table' && isTableRowArray(value)) {
      flat[fieldId] = projectTableRowsOntoColumns(value, schema as TableSchema);
    } else if (schema?.type === 'pivotTable') {
      flat[fieldId] = value;
    } else if (
      schema?.type === 'child' &&
      value != null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      flat[fieldId] = normalizeRepeaterValue(value, schema);
    } else {
      flat[fieldId] = value;
    }
  }

  return expandTableArraysInValues(flat, fieldSchemas);
}

export function buildSectionedDocumentFromValues(
  blocks: EditorBlock[] | null | undefined,
  fieldSchemas: FieldSchemaMap,
  flatValues: ValueMap,
  options: { includeAllFields?: boolean } = {},
): Record<string, SectionFieldMap> {
  const { includeAllFields = false } = options;
  const values = collapseTablesInValues(flatValues, fieldSchemas, blocks ?? []);

  const sections: Record<string, SectionFieldMap> = {};

  const ensureSection = (label: string): SectionFieldMap => {
    if (!sections[label]) sections[label] = {};
    return sections[label];
  };

  for (const block of blocks ?? []) {
    const data = block.data ?? {};

    if (block.type === 'documentSection') {
      const sectionName = resolveSectionName(data);
      const sectionMap = ensureSection(sectionName);

      walkSegments(data.segments ?? [], (seg) => {
        if ((seg.type === 'field' || seg.type === 'child') && seg.id) {
          const schema = fieldSchemas[seg.id];
          const name = (schema?.name as string | undefined) ?? (schema?.label as string | undefined) ?? seg.id;
          const hasValue = Object.prototype.hasOwnProperty.call(values, seg.id);
          if (includeAllFields || hasValue) {
            const raw = hasValue
              ? values[seg.id]
              : resolveSchemaDefaultValue(schema, { forTemplate: true });
            sectionMap[name] =
              schema?.type === 'child'
                ? normalizeRepeaterValue(raw, schema)
                : raw;
          }
        }

        if (seg.type === 'table' && seg.id) {
          const schema = fieldSchemas[seg.id];
          const name = (schema?.name as string | undefined) ?? (schema?.label as string | undefined) ?? seg.id;
          const hasValue = Object.prototype.hasOwnProperty.call(values, seg.id);
          if (includeAllFields || hasValue) {
            sectionMap[name] = hasValue
              ? values[seg.id]
              : schema?.type === 'pivotTable'
                ? { columns: [], rows: [] }
                : [];
          }
        }
      });
      continue;
    }

    if (block.type === 'visionTable' || (block.type === 'templateBlock' && data.fieldType === 'table')) {
      const fieldId = data.fieldId;
      if (!fieldId) continue;
      const schema = fieldSchemas[fieldId];
      const name = (schema?.name as string | undefined) ?? (schema?.label as string | undefined) ?? fieldId;
      const sectionMap = ensureSection(ROOT_SECTION_KEY);
      const hasValue = Object.prototype.hasOwnProperty.call(values, fieldId);
      if (includeAllFields || hasValue) {
        sectionMap[name] = hasValue ? values[fieldId] : [];
      }
      continue;
    }

    if (block.type === 'templateBlock' && data.fieldId && data.fieldType !== 'table') {
      const schema = fieldSchemas[data.fieldId];
      const name = (schema?.name as string | undefined) ?? (schema?.label as string | undefined) ?? data.fieldId;
      const sectionMap = ensureSection(ROOT_SECTION_KEY);
      const hasValue = Object.prototype.hasOwnProperty.call(values, data.fieldId);
      if (includeAllFields || hasValue) {
        const raw = hasValue
          ? values[data.fieldId]
          : resolveSchemaDefaultValue(schema, { forTemplate: true });
        sectionMap[name] =
          schema?.type === 'child'
            ? normalizeRepeaterValue(raw, schema)
            : raw;
      }
    }
  }

  return sections;
}

/**
 * Remove empty field values from a sectioned document export.
 */
export function filterEmptySections(
  sections: Record<string, SectionFieldMap> | null | undefined,
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
): Record<string, SectionFieldMap> {
  const result: Record<string, SectionFieldMap> = {};

  for (const [sectionName, sectionMap] of Object.entries(sections ?? {})) {
    const filtered: SectionFieldMap = {};

    for (const [fieldName, value] of Object.entries(sectionMap ?? {})) {
      const fieldId = resolveFieldIdByName(sectionName, fieldName, blocks, fieldSchemas);
      if (!fieldId) continue;

      const schema = fieldSchemas[fieldId];
      if (schema?.type === 'table' && isTableRowArray(value)) {
        const rows = filterTableRowsWithContent(value, schema as TableSchema);
        if (rows.length) filtered[fieldName] = rows;
        continue;
      }

      if (schema?.type === 'child') {
        if (repeaterHasContent(value, schema)) filtered[fieldName] = value;
        continue;
      }

      if (!isFieldEmpty(value, { htmlEditor: !!schema?.htmlEditor })) {
        filtered[fieldName] = value;
      }
    }

    if (Object.keys(filtered).length) {
      result[sectionName] = filtered;
    }
  }

  return result;
}

export function expandSectionedDocument(
  sections: Record<string, DocumentSectionValues> | null | undefined,
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
): ValueMap {
  const flat: ValueMap = {};

  for (const [sectionLabel, fields] of Object.entries(sections ?? {})) {
    let fieldMap: unknown = fields;
    if (isSectionInstanceArray(fields)) {
      fieldMap = fields[0] ?? {};
    }
    if (!fieldMap || typeof fieldMap !== 'object' || Array.isArray(fieldMap)) continue;

    for (const [fieldName, value] of Object.entries(fieldMap as SectionFieldMap)) {
      const fieldId = resolveFieldIdByName(sectionLabel, fieldName, blocks, fieldSchemas);
      if (!fieldId) continue;

      const schema = fieldSchemas[fieldId];
      if (schema?.type === 'table' && isTableRowArray(value)) {
        flat[fieldId] = projectTableRowsOntoColumns(value, schema as TableSchema);
      } else if (
        schema?.type === 'child' &&
        value != null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        flat[fieldId] = normalizeRepeaterValue(value, schema);
      } else {
        flat[fieldId] = value;
      }
    }
  }

  return expandTableArraysInValues(flat, fieldSchemas);
}

export function extractRepeatableSectionInstances(
  sections: Record<string, DocumentSectionValues> | null | undefined,
  blocks: EditorBlock[],
): Record<string, SectionFieldMap[]> {
  const instances: Record<string, SectionFieldMap[]> = {};
  const repeatable = findRepeatableSectionBlock(blocks);
  if (!repeatable) return instances;

  const raw = sections?.[repeatable.sectionName];
  if (isSectionInstanceArray(raw)) {
    instances[repeatable.sectionName] = raw;
  }
  return instances;
}

/**
 * Build repeatable section instances from multi-row tables in the editor.
 */
export function buildRepeatableInstancesFromEditor(
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
  flatValues: ValueMap,
): Record<string, SectionFieldMap[]> {
  const repeatable = findRepeatableSectionBlock(blocks);
  if (!repeatable) return {};

  const sections = buildSectionedDocumentFromValues(blocks, fieldSchemas, flatValues);
  const sectionMap = sections[repeatable.sectionName];
  if (!sectionMap || typeof sectionMap !== 'object' || Array.isArray(sectionMap)) return {};

  let driverRows: SectionFieldMap[] | null = null;

  for (const value of Object.values(sectionMap)) {
    if (isTableRowArray(value) && value.length > 1) {
      if (!driverRows || value.length > driverRows.length) {
        driverRows = value;
      }
    }
  }

  if (!driverRows || driverRows.length <= 1) return {};

  const instances = driverRows.map((_, rowIndex) => {
    const instance: SectionFieldMap = {};
    for (const [fieldName, value] of Object.entries(sectionMap)) {
      if (isTableRowArray(value)) {
        const row = value[rowIndex];
        instance[fieldName] = row != null ? [row] : [];
      } else {
        instance[fieldName] = value;
      }
    }
    return instance;
  });

  return { [repeatable.sectionName]: instances };
}

export function resolveRepeatableSectionInstances(
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
  flatValues: ValueMap,
  loadedSections: Record<string, DocumentSectionValues> | null | undefined,
): Record<string, SectionFieldMap[]> {
  const plan = resolveRepeatablePagePlan(blocks, fieldSchemas, flatValues, loadedSections);
  if (!plan || plan.instances.length <= 1) return {};
  return { [plan.sectionName]: plan.instances };
}

function findFirstTableSegment(segments: Segment[] | undefined): Segment | null {
  let found: Segment | null = null;
  walkSegments(segments ?? [], (seg) => {
    if (!found && seg.type === 'table' && seg.id) {
      found = seg;
    }
  });
  return found;
}

export function findAdjacentTableBlock(
  blocks: EditorBlock[] | null | undefined,
  afterIndex: number,
  options: { shouldUse?: (candidate: AdjacentTableCandidate) => boolean } = {},
): AdjacentTableCandidate | null {
  const shouldUse = options.shouldUse;

  for (let i = afterIndex + 1; i < (blocks ?? []).length; i += 1) {
    const block = blocks![i];
    let candidate: AdjacentTableCandidate | null = null;

    if (block.type === 'documentSection') {
      const tableSeg = findFirstTableSegment(block.data?.segments);
      if (tableSeg && tableSeg.type === 'table' && tableSeg.id) {
        candidate = {
          block,
          index: i,
          tableId: String(tableSeg.id),
          blockKind: 'section',
        };
      }
    } else if (block.type === 'visionTable') {
      const tableId = block.data?.fieldId ?? 'visionTable';
      candidate = {
        block,
        index: i,
        tableId: String(tableId),
        blockKind: 'vision',
      };
    } else if (block.type === 'templateBlock' && block.data?.fieldType === 'table' && block.data?.fieldId) {
      candidate = {
        block,
        index: i,
        tableId: String(block.data.fieldId),
        blockKind: 'template',
      };
    }

    if (!candidate) continue;
    if (shouldUse && !shouldUse(candidate)) continue;
    return candidate;
  }

  return null;
}

/**
 * Find a section that has multiple loaded instances (e.g. from `_source` mapping),
 * even when the block is not yet flagged `repeatable`.
 */
function findSectionWithInstanceArray(
  blocks: EditorBlock[] | null | undefined,
  loadedSections: Record<string, DocumentSectionValues> | null | undefined,
): { index: number; block: EditorBlock; sectionName: string; instances: SectionFieldMap[] } | null {
  if (!loadedSections) return null;
  for (let index = 0; index < (blocks ?? []).length; index += 1) {
    const block = blocks![index];
    if (block.type !== 'documentSection') continue;
    const sectionName = resolveSectionName(block.data);
    const raw = loadedSections[sectionName];
    if (isSectionInstanceArray(raw) && raw.length > 1) {
      return { index, block, sectionName, instances: raw };
    }
  }
  return null;
}

export function resolveRepeatablePagePlan(
  blocks: EditorBlock[],
  _fieldSchemas: FieldSchemaMap,
  _flatValues: ValueMap,
  loadedSections: Record<string, DocumentSectionValues> | null | undefined,
): RepeatablePagePlan | null {
  const repeatable = findRepeatableSectionBlock(blocks);
  if (repeatable) {
    const sectionName = repeatable.sectionName;
    const rawLoaded = loadedSections?.[sectionName];
    if (isSectionInstanceArray(rawLoaded) && rawLoaded.length > 1) {
      return {
        sectionName,
        repeatableBlockIndex: repeatable.index,
        instances: rawLoaded,
        companionBlockIndex: null,
        companionTableRows: null,
      };
    }
  }

  // `_source` mapping stores instance arrays before/without the repeatable flag.
  const fromInstances = findSectionWithInstanceArray(blocks, loadedSections);
  if (fromInstances) {
    return {
      sectionName: fromInstances.sectionName,
      repeatableBlockIndex: fromInstances.index,
      instances: fromInstances.instances,
      companionBlockIndex: null,
      companionTableRows: null,
    };
  }

  return null;
}

export { ROOT_SECTION_KEY };
