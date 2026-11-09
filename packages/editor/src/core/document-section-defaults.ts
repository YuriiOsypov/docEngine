import {
  allocateUniqueSectionName,
  collectUsedSectionNames,
  DEFAULT_SECTION_NAME,
  resolveSectionName,
} from './field-id.js';

/** Default empty document section used when the editor has no sections. */
export function createEmptyDocumentSectionBlock(usedNames?: Set<string>) {
  const name = allocateUniqueSectionName(usedNames ?? new Set(), DEFAULT_SECTION_NAME);
  return {
    type: 'documentSection',
    data: {
      name,
      label: '',
      collapsed: false,
      repeatable: false,
      hideTitleInPreview: false,
      keepOnOnePage: false,
      segments: [],
      fieldValues: {},
    },
  };
}

export function countDocumentSections(blocks) {
  return (blocks ?? []).filter((block) => block?.type === 'documentSection').length;
}

/**
 * Ensure every documentSection has a unique export `name`.
 * Empty names become Untitled / Untitled_2 / … so fill/export keys do not collide.
 */
export function ensureUniqueSectionNames(blocks) {
  const list = Array.isArray(blocks)
    ? blocks.map((block) => (block?.data ? { ...block, data: { ...block.data } } : block))
    : [];
  const used = new Set<string>();
  for (const block of list) {
    if (block?.type !== 'documentSection') continue;
    const current = resolveSectionName(block.data ?? {});
    if (!used.has(current)) {
      used.add(current);
      if (!String(block.data?.name ?? '').trim()) {
        block.data.name = current;
      }
      continue;
    }
    const next = allocateUniqueSectionName(used, current);
    used.add(next);
    block.data.name = next;
  }
  return list;
}

/**
 * Ensure the document always has at least one `documentSection`.
 * @param {Array<{ type: string, data?: object }>} blocks
 * @returns {Array<{ type: string, data?: object }>}
 */
export function ensureAtLeastOneDocumentSection(blocks) {
  const list = ensureUniqueSectionNames(Array.isArray(blocks) ? blocks : []);
  if (countDocumentSections(list) === 0) {
    list.unshift(createEmptyDocumentSectionBlock(collectUsedSectionNames(list)));
  }
  return list;
}
