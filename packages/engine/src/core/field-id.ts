import { labelToFieldKey, applyFieldIdChange, cellFieldId } from './field-schemas.js';
import { walkSegments } from './segment-tree.js';
import type { DocumentSectionData, EditorBlock, FieldSchema } from '../types.js';

type FieldSchemaMap = Record<string, FieldSchema>;

type SchemaRegistry =
  | { getFieldSchemas?: () => FieldSchemaMap }
  | FieldSchemaMap
  | null
  | undefined;

export const ROOT_SECTION_KEY = '_root';

/** Fallback export key when a section has no name/label. */
export const DEFAULT_SECTION_NAME = 'Untitled';

// Repeater child editors namespace their field ids with this prefix so the
// round-trip through the modal is stable. These ids must NOT be re-derived from
// section/field names, otherwise the saved values can no longer be mapped back
// to their storage keys and the Child value comes back empty.
const REPEATER_CHILD_FIELD_PREFIX = '_repeater_';

function isRepeaterChildFieldId(fieldId: string | null | undefined): boolean {
  return typeof fieldId === 'string' && fieldId.startsWith(REPEATER_CHILD_FIELD_PREFIX);
}

export function resolveSectionName(
  data: DocumentSectionData | Record<string, unknown> | null | undefined,
): string {
  return String(data?.name ?? data?.label ?? '').trim() || DEFAULT_SECTION_NAME;
}

/**
 * Collect resolved section export keys from document blocks.
 */
export function collectUsedSectionNames(
  blocks: EditorBlock[] | null | undefined,
  options: { reservedNames?: Set<string> } = {},
): Set<string> {
  const used = new Set(options.reservedNames ?? []);
  for (const block of blocks ?? []) {
    if (block?.type !== 'documentSection') continue;
    used.add(resolveSectionName(block.data ?? {}));
  }
  return used;
}

/**
 * Allocate a unique section export key (Untitled, Untitled_2, …).
 * Prevents duplicate `sections.Untitled` keys when multiple empty sections exist.
 */
export function allocateUniqueSectionName(
  usedNames: Set<string> = new Set(),
  baseName: string = DEFAULT_SECTION_NAME,
): string {
  const base = String(baseName ?? '').trim() || DEFAULT_SECTION_NAME;
  if (!usedNames.has(base)) return base;
  let index = 2;
  while (usedNames.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

export function slugSectionKey(sectionName: string | null | undefined): string {
  if (!sectionName || sectionName === ROOT_SECTION_KEY) return ROOT_SECTION_KEY;
  const slug = labelToFieldKey(sectionName);
  return slug || ROOT_SECTION_KEY;
}

export function deriveFieldId(
  sectionName: string | null | undefined,
  fieldName: string,
  usedIds: Set<string> = new Set(),
): string {
  const sectionSlug = slugSectionKey(sectionName);
  const nameSlug = labelToFieldKey(String(fieldName ?? '').trim() || 'field');
  let id = `${sectionSlug}_${nameSlug}`;
  let index = 2;
  while (usedIds.has(id)) {
    id = `${sectionSlug}_${nameSlug}_${index}`;
    index += 1;
  }
  return id;
}

export function deriveUniqueFieldName(baseName: string, usedNames: Set<string> = new Set()): string {
  const base = String(baseName ?? '').trim() || 'field';
  if (!usedNames.has(base)) return base;
  let index = 2;
  while (usedNames.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

export function collectUsedFieldNamesInSection(
  sectionBody: HTMLElement,
  registry: SchemaRegistry,
  options: { reservedNames?: Set<string>; excludeFieldId?: string | null } = {},
): Set<string> {
  const { reservedNames = new Set(), excludeFieldId = null } = options;
  const sectionName = findSectionNameForNode(sectionBody);
  const used = new Set(reservedNames);
  const holder = sectionBody.closest?.('[data-doc-editor]') ?? sectionBody;
  const schemas: FieldSchemaMap =
    typeof (registry as { getFieldSchemas?: unknown } | null | undefined)?.getFieldSchemas ===
    'function'
      ? (registry as { getFieldSchemas: () => FieldSchemaMap }).getFieldSchemas()
      : ((registry as FieldSchemaMap | null | undefined) ?? {});

  for (const body of holder.querySelectorAll('.document-section__body')) {
    if (findSectionNameForNode(body as HTMLElement) !== sectionName) continue;

    for (const token of body.querySelectorAll('.field-token[data-field-id]')) {
      const fieldId = (token as HTMLElement).dataset.fieldId;
      if (!fieldId || fieldId === excludeFieldId) continue;
      const schema = schemas[fieldId];
      const name = String(schema?.name ?? schema?.label ?? '').trim();
      if (name) used.add(name);
    }

    for (const table of body.querySelectorAll('.document-table[data-table-id]')) {
      const fieldId = (table as HTMLElement).dataset.tableId;
      if (!fieldId || fieldId === excludeFieldId) continue;
      const schema = schemas[fieldId];
      const name = String(schema?.name ?? schema?.label ?? '').trim();
      if (name) used.add(name);
    }
  }

  return used;
}

export function allocateFieldIdentity(
  sectionBody: HTMLElement,
  registry: SchemaRegistry,
  baseName: string,
  options: {
    reservedIds?: Set<string>;
    reservedNames?: Set<string>;
    excludeFieldId?: string | null;
  } = {},
): { fieldId: string; fieldName: string } {
  const { reservedIds = new Set(), reservedNames = new Set(), excludeFieldId = null } = options;
  const sectionName = findSectionNameForNode(sectionBody);
  const schemas: FieldSchemaMap =
    typeof (registry as { getFieldSchemas?: unknown } | null | undefined)?.getFieldSchemas ===
    'function'
      ? (registry as { getFieldSchemas: () => FieldSchemaMap }).getFieldSchemas()
      : ((registry as FieldSchemaMap | null | undefined) ?? {});
  const usedIds = new Set(Object.keys(schemas ?? {}));
  for (const id of reservedIds) usedIds.add(id);

  const usedNames = collectUsedFieldNamesInSection(sectionBody, registry, {
    reservedNames,
    excludeFieldId,
  });
  const fieldName = deriveUniqueFieldName(baseName, usedNames);
  const fieldId = deriveFieldId(sectionName, fieldName, usedIds);
  return { fieldId, fieldName };
}

export function deriveCellFieldId(tableFieldId: string, rowKey: string, colKey: string): string {
  return cellFieldId(tableFieldId, rowKey, colKey);
}

export function ensureSchemaName(schema: FieldSchema, fallback = ''): FieldSchema {
  if (!schema) return schema;
  if (schema.name) return schema;
  return { ...schema, name: fallback || schema.label || 'Field' };
}

export function ensureSchemasHaveName(fieldSchemas: FieldSchemaMap = {}): FieldSchemaMap {
  const next: FieldSchemaMap = {};
  for (const [id, schema] of Object.entries(fieldSchemas)) {
    next[id] = ensureSchemaName(schema, id);
  }
  return next;
}

export function findFieldPlacement(
  fieldId: string,
  blocks: EditorBlock[] = [],
): {
  sectionName: string;
  sectionLabel: string;
  sectionKey: string;
  blockIndex: number;
  blockType: string;
} {
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const data = (block.data ?? {}) as DocumentSectionData & Record<string, any>;

    if (block.type === 'documentSection') {
      let found = false;
      walkSegments(data.segments ?? [], (seg) => {
        if (
          !found &&
          (seg.type === 'field' || seg.type === 'table' || seg.type === 'child') &&
          seg.id === fieldId
        ) {
          found = true;
        }
      });
      if (found) {
        const sectionName = resolveSectionName(data);
        return {
          sectionName,
          sectionLabel: sectionName,
          sectionKey: slugSectionKey(sectionName),
          blockIndex,
          blockType: 'documentSection',
        };
      }
    }

    if (block.type === 'visionTable' && data.fieldId === fieldId) {
      return {
        sectionName: ROOT_SECTION_KEY,
        sectionLabel: ROOT_SECTION_KEY,
        sectionKey: ROOT_SECTION_KEY,
        blockIndex,
        blockType: 'visionTable',
      };
    }

    if (block.type === 'templateBlock' && data.fieldId === fieldId) {
      return {
        sectionName: ROOT_SECTION_KEY,
        sectionLabel: ROOT_SECTION_KEY,
        sectionKey: ROOT_SECTION_KEY,
        blockIndex,
        blockType: 'templateBlock',
      };
    }
  }

  return {
    sectionName: ROOT_SECTION_KEY,
    sectionLabel: ROOT_SECTION_KEY,
    sectionKey: ROOT_SECTION_KEY,
    blockIndex: -1,
    blockType: 'unknown',
  };
}

export function collectFieldsInSection(
  block: EditorBlock,
  fieldSchemas: FieldSchemaMap = {},
): Array<{ fieldId: string; name: string; type: string }> {
  if (block.type !== 'documentSection') return [];
  const items: Array<{ fieldId: string; name: string; type: string }> = [];
  walkSegments((block.data as DocumentSectionData | undefined)?.segments ?? [], (seg) => {
    if (seg.type !== 'field' && seg.type !== 'child' && seg.type !== 'table') return;
    if (!seg.id) return;
    const schema = fieldSchemas[seg.id];
    items.push({
      fieldId: seg.id,
      name: schema?.name ?? schema?.label ?? seg.id,
      type: schema?.type ?? 'text',
    });
  });
  return items;
}

export function isFieldNameTakenInSection(
  sectionName: string,
  fieldName: string,
  currentFieldId: string,
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
): boolean {
  const normalized = String(fieldName ?? '').trim();
  if (!normalized) return false;

  for (const block of blocks ?? []) {
    if (block.type !== 'documentSection') continue;
    const blockName = resolveSectionName(block.data);
    if (blockName !== sectionName) continue;

    for (const item of collectFieldsInSection(block, fieldSchemas)) {
      if (item.fieldId === currentFieldId) continue;
      if (item.name === normalized) return true;
    }
  }

  if (sectionName === ROOT_SECTION_KEY) {
    for (const block of blocks ?? []) {
      if (block.type === 'visionTable' || block.type === 'templateBlock') {
        const fieldId = (block.data as Record<string, any> | undefined)?.fieldId;
        if (!fieldId || fieldId === currentFieldId) continue;
        const schema = fieldSchemas[fieldId];
        const name = schema?.name ?? schema?.label ?? fieldId;
        if (name === normalized) return true;
      }
    }
  }

  return false;
}

function fieldNameMatches(candidate: unknown, normalized: string): boolean {
  const name = String(candidate ?? '').trim();
  if (!name) return false;
  return name === normalized || name.toLowerCase() === normalized.toLowerCase();
}

export function resolveFieldIdByName(
  sectionName: string,
  fieldName: string,
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
): string | null {
  const normalized = String(fieldName ?? '').trim();
  if (!normalized) return null;

  if (sectionName === ROOT_SECTION_KEY) {
    for (const block of blocks ?? []) {
      if (block.type === 'visionTable' || block.type === 'templateBlock') {
        const fieldId = (block.data as Record<string, any> | undefined)?.fieldId;
        if (!fieldId) continue;
        const schema = fieldSchemas[fieldId];
        const name = schema?.name ?? schema?.label ?? fieldId;
        if (fieldNameMatches(name, normalized)) return fieldId;
      }
      if (block.type === 'documentSection') {
        let matchId: string | null = null;
        walkSegments((block.data as DocumentSectionData | undefined)?.segments ?? [], (seg) => {
          if (matchId || (seg.type !== 'field' && seg.type !== 'child' && seg.type !== 'table'))
            return;
          const schema = fieldSchemas[seg.id];
          const name = schema?.name ?? schema?.label ?? seg.id;
          if (fieldNameMatches(name, normalized)) matchId = seg.id;
        });
        if (matchId) return matchId;
      }
    }
    return null;
  }

  for (const block of blocks ?? []) {
    if (block.type !== 'documentSection') continue;
    const blockName = resolveSectionName(block.data);
    if (blockName !== sectionName && blockName.toLowerCase() !== sectionName.toLowerCase()) {
      continue;
    }

    let matchId: string | null = null;
    walkSegments((block.data as DocumentSectionData | undefined)?.segments ?? [], (seg) => {
      if (matchId || (seg.type !== 'field' && seg.type !== 'child' && seg.type !== 'table')) return;
      const schema = fieldSchemas[seg.id];
      const name = schema?.name ?? schema?.label ?? seg.id;
      if (fieldNameMatches(name, normalized)) matchId = seg.id;
    });
    if (matchId) return matchId;
  }

  return null;
}

export function rebuildFieldIdsForSection(
  block: EditorBlock,
  fieldSchemas: FieldSchemaMap,
  allBlocks: EditorBlock[],
): {
  fieldSchemas: FieldSchemaMap;
  blocks: EditorBlock[];
  /** old fieldId → new fieldId for mapping / formula consumers */
  idRenames: Record<string, string>;
} {
  if (block.type !== 'documentSection') {
    return { fieldSchemas, blocks: allBlocks, idRenames: {} };
  }

  const sectionName = resolveSectionName(block.data);
  let schemas: FieldSchemaMap = { ...fieldSchemas };
  let blocks = allBlocks;
  const usedIds = new Set(Object.keys(schemas));

  const renames: Array<{ oldId: string; newId: string; schema: FieldSchema }> = [];
  walkSegments((block.data as DocumentSectionData | undefined)?.segments ?? [], (seg) => {
    if (seg.type !== 'field' && seg.type !== 'table') return;
    const oldId = seg.id;
    if (!oldId) return;
    if (isRepeaterChildFieldId(oldId)) return;
    const schema = schemas[oldId];
    if (!schema) return;

    const fieldName = schema.name ?? schema.label ?? oldId;
    usedIds.delete(oldId);
    const newId = deriveFieldId(sectionName, fieldName, usedIds);
    usedIds.add(newId);

    if (newId !== oldId) {
      renames.push({ oldId, newId, schema });
    }
  });

  /** @type {Record<string, string>} */
  const idRenames: Record<string, string> = {};
  for (const { oldId, newId, schema } of renames) {
    const result = applyFieldIdChange(oldId, newId, schema, schemas, blocks);
    schemas = result.fieldSchemas;
    blocks = result.blocks;
    idRenames[oldId] = newId;
  }

  return { fieldSchemas: schemas, blocks, idRenames };
}

export function migrateFieldIds(
  blocks: EditorBlock[],
  fieldSchemas: FieldSchemaMap,
): { fieldSchemas: FieldSchemaMap; blocks: EditorBlock[] } {
  let schemas = ensureSchemasHaveName(fieldSchemas);
  let nextBlocks: EditorBlock[] = JSON.parse(JSON.stringify(blocks ?? []));

  for (const block of nextBlocks) {
    if (block.type === 'documentSection') {
      const result = rebuildFieldIdsForSection(block, schemas, nextBlocks);
      schemas = result.fieldSchemas;
      nextBlocks = result.blocks;
      continue;
    }

    if (block.type === 'visionTable' || block.type === 'templateBlock') {
      const oldId = (block.data as Record<string, any> | undefined)?.fieldId;
      if (!oldId) continue;
      if (isRepeaterChildFieldId(oldId)) continue;
      const schema = schemas[oldId];
      if (!schema) continue;

      const fieldName = schema.name ?? schema.label ?? oldId;
      const usedIds = new Set(Object.keys(schemas));
      usedIds.delete(oldId);
      const newId = deriveFieldId(ROOT_SECTION_KEY, fieldName, usedIds);

      if (newId === oldId) continue;

      const result = applyFieldIdChange(oldId, newId, schema, schemas, nextBlocks);
      schemas = result.fieldSchemas;
      nextBlocks = result.blocks;
    }
  }

  return { fieldSchemas: schemas, blocks: nextBlocks };
}

export function findSectionNameForNode(editable: HTMLElement | null | undefined): string {
  const section = editable?.closest?.('.document-section') as HTMLElement | null | undefined;
  if (!section) return ROOT_SECTION_KEY;

  const nameInput = section.querySelector('.document-section__name-input') as HTMLInputElement | null;
  if (nameInput) {
    const value = nameInput.value?.trim();
    if (value) return value;
  }

  const storedName = section.dataset.sectionName?.trim();
  if (storedName) return storedName;

  const labelInput = section.querySelector(
    '.document-section__label-input',
  ) as HTMLInputElement | null;
  if (labelInput) {
    const value = labelInput.value?.trim();
    return value || DEFAULT_SECTION_NAME;
  }

  const text = section.querySelector('.document-section__label-text');
  const label = text?.textContent?.trim();
  return label || DEFAULT_SECTION_NAME;
}

/** @deprecated Use findSectionNameForNode */
export function findSectionLabelForNode(editable: HTMLElement | null | undefined): string {
  return findSectionNameForNode(editable);
}
