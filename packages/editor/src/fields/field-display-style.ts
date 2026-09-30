import { findColumnDisplayStyle, parseCellFieldId } from '../core/field-schemas.js';
import {
  DEFAULT_DOCUMENT_BODY_STYLE,
  DOCUMENT_TABLE_HEADER_STYLE,
  DOCUMENT_TABLE_TEXT_STYLE,
} from '../core/document-display-defaults.js';
import { normalizeFontFamily, normalizeFontSize } from './rich-text.js';

const STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'color',
  'backgroundColor',
  'textDecoration',
  'textAlign',
];

function resetTableCellTokenAlignment(token: any, td: any) {
  if (td) td.style.textAlign = '';
  token.style.removeProperty('display');
  token.style.removeProperty('width');
  token.style.removeProperty('textAlign');
}

function applyTableCellBackground(td: any, style: any) {
  if (!td) return;
  if (style?.backgroundColor) td.style.backgroundColor = style.backgroundColor;
  else td.style.backgroundColor = '';
}
function normalizeFontWeight(value: any) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'normal' || v === '400') return 'normal';
  if (v === 'bold' || v === '700') return 'bold';
  return null;
}

function normalizeFontStyle(value: any) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'normal') return 'normal';
  if (v === 'italic') return 'italic';
  return null;
}

function normalizeColor(value: any) {
  const v = String(value ?? '').trim();
  if (!v || v.length > 32) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^[a-z]+$/i.test(v)) return v;
  return null;
}

function normalizeTextAlign(value: any) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'left' || v === 'center' || v === 'right') return v;
  return null;
}

function normalizeTextDecoration(value: any) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'none' || v === 'underline' || v === 'line-through') return v;
  return null;
}

/**
 * @param {import('../types.js').FieldDisplayStyle | null | undefined} style
 * @returns {import('../types.js').FieldDisplayStyle}
 */
export function normalizeFieldDisplayStyle(style: any) {
  if (!style || typeof style !== 'object') return {} as any;

  const next: any = {};
  const fontFamily = normalizeFontFamily(style.fontFamily);
  const fontSize = normalizeFontSize(style.fontSize);
  const fontWeight = normalizeFontWeight(style.fontWeight);
  const fontStyle = normalizeFontStyle(style.fontStyle);
  const color = normalizeColor(style.color);
  const backgroundColor = normalizeColor(style.backgroundColor);
  const textDecoration = normalizeTextDecoration(style.textDecoration);
  const textAlign = normalizeTextAlign(style.textAlign);

  if (fontFamily) next.fontFamily = fontFamily;
  if (fontSize) next.fontSize = fontSize;
  if (fontWeight) next.fontWeight = fontWeight;
  if (fontStyle) next.fontStyle = fontStyle;
  if (color) next.color = color;
  if (backgroundColor) next.backgroundColor = backgroundColor;
  if (textDecoration) next.textDecoration = textDecoration;
  if (textAlign) next.textAlign = textAlign;

  return next;
}

/**
 * @param {import('../types.js').FieldSchema | null | undefined} schema
 * @param {import('../types.js').FieldDisplayStyle | null | undefined} globalDefault
 */
export function resolveFieldDisplayStyle(schema: any, globalDefault: any) {
  const base = normalizeFieldDisplayStyle(globalDefault);
  const override = normalizeFieldDisplayStyle(schema?.displayStyle);
  return { ...base, ...override };
}

/**
 * Shared column/cell styling for table headers and cell tokens.
 * @param {string} tableFieldId
 * @param {string} colKey
 * @param {import('../types.js').FieldSchema | null | undefined} cellSchema
 * @param {Record<string, import('../types.js').FieldSchema>} fieldSchemas
 */
export function resolveTableCellDisplayStyle(tableFieldId: any, colKey: any, cellSchema: any, fieldSchemas: any, fieldValueStyle?: any) {
  const columnStyle = findColumnDisplayStyle(tableFieldId, colKey, fieldSchemas);
  const effectiveSchema = columnStyle
    ? { ...cellSchema, displayStyle: { ...columnStyle, ...cellSchema?.displayStyle } }
    : cellSchema;
  const base = { ...DOCUMENT_TABLE_TEXT_STYLE, ...normalizeFieldDisplayStyle(fieldValueStyle?.default) };
  return resolveFieldDisplayStyle(effectiveSchema, base);
}

/**
 * Table header styling: Page setup / document body text style (not column cell overrides).
 * @param {string} _tableFieldId
 * @param {string} _colKey
 * @param {Record<string, import('../types.js').FieldSchema>} _fieldSchemas
 * @param {import('../types.js').FieldValueStyleOptions | null | undefined} _fieldValueStyle
 * @param {import('../types.js').FieldDisplayStyle | null | undefined} [documentTextStyle]
 */
export function resolveTableColumnDisplayStyle(
  _tableFieldId: any,
  _colKey: any,
  _fieldSchemas: any,
  _fieldValueStyle?: any,
  documentTextStyle?: any,
) {
  const base = {
    ...DOCUMENT_TABLE_HEADER_STYLE,
    ...normalizeFieldDisplayStyle(documentTextStyle),
  };
  return resolveFieldDisplayStyle(null, base);
}

/**
 * @param {import('../types.js').FieldDisplayStyle} style
 * @returns {import('../types.js').FieldDisplayStyle}
 */
function omitHighlightControlledStyles(style: any) {
  const { color, textDecoration, fontWeight, ...rest } = style;
  return rest;
}

function isFillModeHighlightActive(token: any, context: any) {
  if (context?.fillModeFieldHighlight === true) return true;
  if (context?.fillModeFieldHighlight === false) return false;
  return !!token?.closest?.('.editor-holder--show-fields');
}

/**
 * Empty fields use mention/highlight colors in fill, design, and mapping modes so
 * placeholders match across those views.
 * @param {HTMLElement} token
 * @param {{ fillModeFieldHighlight?: boolean, mappingMode?: boolean } | null | undefined} context
 */
function shouldHighlightEmptyField(token: any, context: any) {
  if (!token?.classList) return false;
  if (token.classList.contains('field-token--computed')) return false;
  if (token.classList.contains('field-token--readonly')) return false;
  if (token.classList.contains('field-token--repeater')) return false;
  if (token.classList.contains('field-token--image')) return false;
  if (token.classList.contains('field-token--required-missing')) return false;
  if (!token.classList.contains('field-token--empty')) return false;
  // Design-mode empties always use the same highlight look as fill mode.
  if (token.classList.contains('field-token--design')) return true;
  // Mapping-mode empties match designer placeholders (not fill-mode grey).
  if (context?.mappingMode === true) return true;
  if (token?.closest?.('.document-section--mapping')) return true;
  return isFillModeHighlightActive(token, context);
}

function shouldUnderlineFieldInFillMode(token: any, context: any) {
  if (!token?.classList) return false;
  if (token.classList.contains('field-token--design')) return false;
  if (token.classList.contains('field-token--computed')) return false;
  if (token.classList.contains('field-token--readonly')) return false;
  if (token.classList.contains('field-token--repeater')) return false;
  if (token.classList.contains('field-token--image')) return false;
  if (token.classList.contains('field-token--required-missing')) return false;
  return isFillModeHighlightActive(token, context);
}

/**
 * @param {import('../types.js').FieldSchema | null | undefined} schema
 * @param {import('../types.js').FieldDisplayStyle | null | undefined} globalDefault
 * @param {boolean} isTableCell
 * @param {import('../types.js').FieldValueStyleOptions | null | undefined} fieldValueStyle
 * @param {{ fillModeFieldHighlight?: boolean } | null | undefined} context
 * @param {HTMLElement | null | undefined} [token]
 */
export function resolveTokenDisplayStyle(schema: any, globalDefault: any, isTableCell: any, fieldValueStyle?: any, context?: any, token?: any) {
  if (isTableCell) {
    const base = { ...DOCUMENT_TABLE_TEXT_STYLE, ...fieldValueStyle?.default };
    return resolveFieldDisplayStyle(schema, base);
  }
  const base = {
    ...DEFAULT_DOCUMENT_BODY_STYLE,
    ...globalDefault,
    ...fieldValueStyle?.default,
  };
  const style = resolveFieldDisplayStyle(schema, base);
  if (token && shouldHighlightEmptyField(token, context)) {
    return omitHighlightControlledStyles(style);
  }
  return style;
}

/**
 * @param {HTMLElement} element
 * @param {import('../types.js').FieldDisplayStyle} style
 */
export function applyFieldDisplayStyle(element: any, style: any) {
  const resolved = normalizeFieldDisplayStyle(style);
  for (const key of STYLE_KEYS) {
    if (resolved[key] != null && resolved[key] !== '') {
      element.style[key] = resolved[key];
    } else {
      // Clear any stale inline value (e.g. a previously toggled-on style
      // with no default, such as fontStyle) instead of leaving it stuck.
      element.style[key] = '';
    }
  }
}

/**
 * Let mention-style fill-mode CSS control text color and underline.
 * @param {HTMLElement} token
 * @param {{ fillModeFieldHighlight?: boolean } | null | undefined} [context]
 */
export function clearFieldHighlightOverriddenStyles(token: any, context: any) {
  if (shouldHighlightEmptyField(token, context)) {
    token.style.removeProperty('color');
    token.style.removeProperty('text-decoration');
    token.style.removeProperty('text-decoration-color');
    token.style.removeProperty('text-decoration-thickness');
    token.style.removeProperty('font-weight');
    return;
  }
  if (shouldUnderlineFieldInFillMode(token, context)) {
    token.style.removeProperty('text-decoration');
    token.style.removeProperty('text-decoration-color');
    token.style.removeProperty('text-decoration-thickness');
  }
}

/**
 * Table data cells: alignment on the full-width td, fonts on the inline token.
 * @param {HTMLElement} token
 * @param {string} fieldId
 * @param {import('../types.js').FieldSchema | null | undefined} schema
 * @param {Record<string, import('../types.js').FieldSchema>} fieldSchemas
 * @param {{ fillModeFieldHighlight?: boolean } | null | undefined} [options]
 */
export function applyTableCellDisplayStyle(token: any, fieldId: any, schema: any, fieldSchemas: any, options?: any) {
  const cellRef = parseCellFieldId(fieldId, fieldSchemas);
  const td = token.closest('td');
  const isEmpty = token.classList.contains('field-token--empty');
  const { fieldValueStyle } = options ?? {};

  if (!cellRef) {
    const fallbackBase = { ...DOCUMENT_TABLE_TEXT_STYLE, ...normalizeFieldDisplayStyle(fieldValueStyle?.default) };
    const resolvedStyle = resolveFieldDisplayStyle(schema, fallbackBase);
    if (isEmpty) {
      const tokenStyle = { ...resolvedStyle };
      delete tokenStyle.textAlign;
      delete tokenStyle.backgroundColor;
      if (shouldHighlightEmptyField(token, options)) {
        delete tokenStyle.color;
        delete tokenStyle.textDecoration;
        delete tokenStyle.fontWeight;
      }
      applyFieldDisplayStyle(token, tokenStyle);
      applyTableCellBackground(td, resolvedStyle);
      resetTableCellTokenAlignment(token, td);
      return;
    }
    const tokenStyle = { ...resolvedStyle };
    delete tokenStyle.backgroundColor;
    applyFieldDisplayStyle(token, tokenStyle);
    applyTableCellBackground(td, resolvedStyle);
    return;
  }

  const displayStyle = resolveTableCellDisplayStyle(
    cellRef.tableFieldId,
    cellRef.colKey,
    schema,
    fieldSchemas,
    fieldValueStyle,
  );
  const align = displayStyle.textAlign;

  if (isEmpty) {
    const tokenStyle = { ...displayStyle };
    delete tokenStyle.textAlign;
    delete tokenStyle.backgroundColor;
    if (shouldHighlightEmptyField(token, options)) {
      delete tokenStyle.color;
      delete tokenStyle.textDecoration;
      delete tokenStyle.fontWeight;
    }
    applyFieldDisplayStyle(token, tokenStyle);
    applyTableCellBackground(td, displayStyle);
    if (align) {
      if (td) td.style.textAlign = align;
      token.style.display = 'block';
      token.style.width = '100%';
      token.style.textAlign = align;
    } else {
      resetTableCellTokenAlignment(token, td);
    }
    return;
  }

  const tokenStyle =
    options?.fillModeFieldHighlight && isEmpty
      ? omitHighlightControlledStyles({ ...displayStyle })
      : { ...displayStyle };
  delete tokenStyle.textAlign;
  delete tokenStyle.backgroundColor;

  applyFieldDisplayStyle(token, tokenStyle);
  applyTableCellBackground(td, displayStyle);

  if (td) {
    if (align) {
      td.style.textAlign = align;
    } else {
      td.style.textAlign = '';
    }
  }

  if (align) {
    token.style.display = 'block';
    token.style.width = '100%';
    token.style.textAlign = align;
  } else {
    resetTableCellTokenAlignment(token, td);
  }
}

/**
 * Re-apply column cell styles in the DOM (e.g. after toolbar formatting).
 * @param {string[]} fieldIds
 * @param {Record<string, import('../types.js').FieldSchema>} fieldSchemas
 * @param {ParentNode} [root]
 */
export function refreshTableColumnStylesForFieldIds(fieldIds: any, fieldSchemas: any, root: any = document, fieldValueStyle: any) {
  const seen = new Set();
  const scope = root?.querySelector ? root : document;

  for (const fieldId of fieldIds) {
    const cellRef = parseCellFieldId(fieldId, fieldSchemas);
    if (!cellRef) continue;

    const columnKey = `${cellRef.tableFieldId}:${cellRef.colKey}`;
    if (seen.has(columnKey)) continue;
    seen.add(columnKey);

    const selector = `.field-token--cell[data-table-id="${CSS.escape(cellRef.tableFieldId)}"][data-col-key="${CSS.escape(cellRef.colKey)}"]`;
    for (const token of scope.querySelectorAll(selector)) {
      const tokenFieldId = token.dataset.fieldId;
      if (!tokenFieldId) continue;
      applyTableCellDisplayStyle(
        token,
        tokenFieldId,
        fieldSchemas[tokenFieldId],
        fieldSchemas,
        { fieldValueStyle },
      );
    }
  }
}

/**
 * @param {import('../types.js').FieldDisplayStyle} style
 * @returns {boolean}
 */
export function isEmptyFieldDisplayStyle(style: any) {
  return STYLE_KEYS.every((key: any) => !style?.[key]);
}
