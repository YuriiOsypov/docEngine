import { updateFieldToken } from '../fields/inline-fields.js';

/**
 * @param {HTMLElement} token
 * @param {Record<string, unknown>} badgeContext
 * @param {import('../types.d.ts').FieldMappingRule} rule
 */
function markMappedToken(token: any, badgeContext: any, rule: any) {
  updateFieldToken(token, '', token.dataset.placeholder, badgeContext);
  token.classList.add('field-token--mapped');

  const sourcePath =
    (typeof rule?.sourcePath === 'string' && rule.sourcePath) ||
    (typeof rule?.sourceArrayPath === 'string' && rule.sourceArrayPath) ||
    '';
  const tip = sourcePath || 'Mapped';
  token.title = tip;
  token.dataset.sourcePath = sourcePath;
  if (rule?.section) token.dataset.mappingSection = rule.section;
  else delete token.dataset.mappingSection;
  if (rule?.field) token.dataset.mappingField = rule.field;
  else delete token.dataset.mappingField;
  if (rule?.columnKey) token.dataset.mappingColumnKey = rule.columnKey;
  else delete token.dataset.mappingColumnKey;
  if (rule?.childFieldId) token.dataset.mappingChildFieldId = rule.childFieldId;
  else delete token.dataset.mappingChildFieldId;

  let badge = token.querySelector('.field-token__mapping-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'field-token__mapping-badge';
    badge.textContent = '↔';
    token.appendChild(badge);
  }
  badge.title = tip;
}

function markMappedPivot(wrapper: any, rule: any) {
  wrapper.classList.add('document-table--mapped');
  const sourcePath =
    (typeof rule?.sourceArrayPath === 'string' && rule.sourceArrayPath) ||
    (typeof rule?.sourcePath === 'string' && rule.sourcePath) ||
    '';
  wrapper.title = sourcePath || 'Mapped';
  wrapper.dataset.sourcePath = sourcePath;
  let badge = wrapper.querySelector(':scope > .document-table__mapping-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'document-table__mapping-badge';
    badge.textContent = '↔';
    wrapper.appendChild(badge);
  }
  badge.title = sourcePath || 'Mapped';
}

function clearMappedPivot(wrapper: any) {
  wrapper.classList.remove('document-table--mapped');
  wrapper.removeAttribute('title');
  delete wrapper.dataset.sourcePath;
  wrapper.querySelector(':scope > .document-table__mapping-badge')?.remove();
}

/**
 * Clear mapped chrome from a token.
 * @param {HTMLElement} token
 */
function clearMappedToken(token: any) {
  token.classList.remove('field-token--mapped');
  token.removeAttribute('title');
  delete token.dataset.sourcePath;
  delete token.dataset.mappingSection;
  delete token.dataset.mappingField;
  delete token.dataset.mappingColumnKey;
  delete token.dataset.mappingChildFieldId;
  token.querySelector('.field-token__mapping-badge')?.remove();
}

/**
 * Resolve the mapping rule for a mapped template token.
 * @param {HTMLElement} token
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @returns {import('../types.d.ts').FieldMappingRule | null}
 */
export function findRuleForMappedToken(token: any, rules: any = []) {
  if (!token?.classList?.contains('field-token--mapped')) return null;
  const list = rules ?? [];

  if (token.classList.contains('field-token--cell')) {
    const tableId = token.dataset.tableId ?? '';
    const colKey = token.dataset.colKey ?? '';
    return (
      list.find(
        (rule: any) =>
          rule?.sourcePath &&
          rule.fieldId === tableId &&
          rule.columnKey === colKey,
      ) ?? null
    );
  }

  const outerRepeater = token.closest?.('.field-token--repeater');
  if (outerRepeater && token !== outerRepeater) {
    const parentId = outerRepeater.dataset.fieldId ?? '';
    const childId = token.dataset.fieldId ?? '';
    return (
      list.find(
        (rule: any) =>
          rule?.sourcePath &&
          rule.fieldId === parentId &&
          rule.childFieldId === childId,
      ) ?? null
    );
  }

  const fieldId = token.dataset.fieldId ?? '';
  return (
    list.find(
      (rule: any) =>
        rule?.sourcePath &&
        !rule.columnKey &&
        !rule.childFieldId &&
        (rule.fieldId === fieldId || rule.field === fieldId),
    ) ?? null
  );
}

/**
 * @param {HTMLElement} holder
 * @param {import('../types.d.ts').FieldMappingRule[]} rules
 * @param {Record<string, unknown>} [context]
 */
export function applyMappingBadges(holder: any, rules: any = [], context: any = {}) {
  const badgeContext = {
    ...context,
    // Keep designer empty-field highlight; avoid fill-mode underlines/pills.
    fillModeFieldHighlight: false,
    mappingMode: true,
  };

  holder.querySelectorAll('.field-token').forEach((token: any) => {
    clearMappedToken(token);
  });
  holder.querySelectorAll('.document-table--pivot').forEach((el: any) => {
    clearMappedPivot(el);
  });

  for (const rule of rules ?? []) {
    const hasPath = !!(rule?.sourcePath || rule?.sourceArrayPath);
    if (!hasPath) continue;

    if (rule.sourceArrayPath && !rule.columnKey && rule.fieldId) {
      const pivot = holder.querySelector(
        `.document-table--pivot[data-pivot-field-id="${CSS.escape(rule.fieldId)}"]`,
      );
      if (pivot) {
        markMappedPivot(pivot, rule);
        continue;
      }
    }

    if (!rule?.sourcePath) continue;

    if (rule.columnKey && rule.fieldId) {
      holder
        .querySelectorAll(
          `.field-token--cell[data-table-id="${CSS.escape(rule.fieldId)}"][data-col-key="${CSS.escape(rule.columnKey)}"]`,
        )
        .forEach((token: any) => markMappedToken(token, badgeContext, rule));
      continue;
    }

    if (rule.fieldId && rule.childFieldId) {
      const token = holder.querySelector(
        `.field-token--repeater[data-field-id="${CSS.escape(rule.fieldId)}"] .field-token[data-field-id="${CSS.escape(rule.childFieldId)}"]`,
      );
      if (token) markMappedToken(token, badgeContext, rule);
      continue;
    }

    const selector = `.field-token[data-field-id="${CSS.escape(rule.fieldId ?? rule.field ?? '')}"]`;
    const token = holder.querySelector(selector);
    if (!token) continue;
    markMappedToken(token, badgeContext, rule);
  }
}
