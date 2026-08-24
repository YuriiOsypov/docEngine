import { appendHtmlToFragment } from './rich-text.js';
import {
  tableSegmentHasContent,
  tableSegmentHasRequiredEmpty,
  buildPreviewTableElement,
} from './table-field.js';
import { renderRepeaterFieldPreview } from './repeater-field.js';
import { repeaterHasContent } from '../core/repeater-io.js';
import { collectAllValues, enrichComputedValues } from '../core/document-io.js';
import {
  applyDocumentBodyTextStyle,
  applyFieldHighlightCssVars,
  resolvePageSetupFieldValueStyle,
  resolvePageSetupFieldHighlightStyle,
  resolvePageSetupTextStyle,
} from '../core/page-setup-styles.js';
import { evaluateComputedField } from '../core/computed-formula.js';
import {
  createFieldToken,
  isFieldEmpty,
  renderSegmentsToDom,
  textToFragment,
  resolveValueOrFillDefault,
} from './inline-fields.js';
import { isSchemaRequired } from '../core/field-schemas.js';
import { evaluateSectionVisibility } from '@docengine/engine';

function resolveFieldValue(fieldId: any, fieldValues: any, fieldSchemas: any, blocks: any = []) {
  const schema = fieldSchemas?.[fieldId];
  if (schema?.type === 'computed') {
    if (Object.prototype.hasOwnProperty.call(fieldValues, fieldId)) {
      return fieldValues[fieldId];
    }
    return evaluateComputedField(fieldId, fieldValues, fieldSchemas, { blocks }).value;
  }
  return resolveValueOrFillDefault(schema, fieldValues[fieldId], { designMode: false });
}

function isLabelText(content: any) {
  return typeof content === 'string' && /:\s*$/.test(content);
}

function trimLabelSuffix(content: any) {
  if (typeof content !== 'string') return content;
  const match = content.match(/^(.*?)([A-Za-zА-Яа-я0-9][^:]*:\s*)$/s);
  if (!match) return content;
  return match[1];
}

function getTextSegmentPlainText(seg: any) {
  if (seg.type !== 'text') return '';
  if (seg.html) {
    const doc = new DOMParser().parseFromString(seg.html, 'text/html');
    return doc.body.textContent ?? '';
  }
  return seg.content ?? '';
}

function isRowSeparatorOnlyText(text: any) {
  if (typeof text !== 'string') return false;
  if (!text.includes('.') && text.trim() === '' && text.includes('\n')) return false;
  return text.replace(/[\s.]/g, '') === '';
}

/** Peer separators such as `, ` between OD/OS (punctuation only; not bare newlines). */
function isPunctuationOnlyText(text: any) {
  if (typeof text !== 'string') return false;
  if (!/[.,;]/.test(text)) return false;
  return text.replace(/[\s.,;]/g, '') === '';
}

function isOrphanPunctuationText(text: any) {
  return isPunctuationOnlyText(text) || isRowSeparatorOnlyText(text);
}

function isContentBearingSegment(seg: any) {
  if (!seg) return false;
  if (seg.type === 'field' || seg.type === 'table' || seg.type === 'child') return true;
  if (seg.type === 'columns') {
    return (seg.columns ?? []).some((col: any) => (col ?? []).some(isContentBearingSegment));
  }
  if (seg.type === 'text') {
    const plain = getTextSegmentPlainText(seg);
    if (isOrphanPunctuationText(plain)) return false;
    if (String(plain).trim()) return true;
    return String(plain).includes('\n');
  }
  return false;
}

function normalizeFieldHeading(text: any) {
  return String(text ?? '').trim().replace(/:\s*$/, '');
}

function escapeRegExp(text: any) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {import('../types.d.ts').FieldSchema | undefined} schema
 * @param {{ placeholder?: string }} [seg]
 */
function getFieldHeadingCandidates(schema: any, seg: any) {
  const candidates = [
    seg?.placeholder,
    schema?.label,
    schema?.name,
  ]
    .map((value: any) => normalizeFieldHeading(value))
    .filter(Boolean);
  return [...new Set(candidates)];
}

function plainTextIsOnlyFieldHeading(plainText: any, candidates: any) {
  const text = String(plainText ?? '');
  if (!text.trim()) return false;

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (normalizeFieldHeading(text) === candidate) return true;

    const withoutSeparators = text.replace(/[\s.\n]+/g, ' ').trim();
    if (normalizeFieldHeading(withoutSeparators) === candidate) return true;

    const suffixPattern = new RegExp(`^[\\s.\\n]*${escapeRegExp(candidate)}\\s*:?\\s*$`, 's');
    if (suffixPattern.test(text)) return true;
  }

  return false;
}

/**
 * @param {string} content
 * @param {string[]} candidates
 */
function trimFieldHeadingSuffix(content: any, candidates: any) {
  let result = content;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const escaped = escapeRegExp(candidate);
    const patterns = [
      new RegExp(`([\\s\\n]*)${escaped}\\s*:?\\s*$`, 's'),
      new RegExp(`\\.\\n${escaped}\\s*:?\\n?$`, 's'),
    ];
    for (const pattern of patterns) {
      const next = result.replace(pattern, '');
      if (next !== result) {
        result = next;
        break;
      }
    }
  }
  return result;
}

function computeTextAfterLabelRemoval(plainText: any, fieldHints: any = null) {
  if (!plainText) return { action: 'remove' };

  const candidates = fieldHints?.candidates ?? [];
  const leadingPeriodMatch = String(plainText).match(/^(\.)([\s\n]*)([\s\S]*)$/);
  const withoutLeadingPeriod = leadingPeriodMatch ? leadingPeriodMatch[3] : null;

  // `.\nNextLabel: ` — drop the next-row label but keep the `.` that ends the previous row.
  if (
    withoutLeadingPeriod != null &&
    withoutLeadingPeriod !== plainText &&
    (isLabelText(withoutLeadingPeriod) ||
      (candidates.length && plainTextIsOnlyFieldHeading(withoutLeadingPeriod, candidates)))
  ) {
    return { action: 'update', remaining: '.' };
  }

  if (isLabelText(plainText)) return { action: 'remove' };

  if (candidates.length && plainTextIsOnlyFieldHeading(plainText, candidates)) {
    return { action: 'remove' };
  }

  if (candidates.length) {
    const remaining = trimFieldHeadingSuffix(plainText, candidates);
    if (remaining !== plainText) {
      if (!remaining) return { action: 'remove' };
      if (isRowSeparatorOnlyText(remaining)) {
        // Prefer a bare `.` row terminator over deleting the previous sentence end.
        return remaining.includes('.')
          ? { action: 'update', remaining: '.' }
          : { action: 'remove' };
      }
      return { action: 'update', remaining };
    }
  }

  const remaining = trimLabelSuffix(plainText);
  if (remaining !== plainText) {
    if (!remaining) return { action: 'remove' };
    if (isRowSeparatorOnlyText(remaining)) {
      return remaining.includes('.')
        ? { action: 'update', remaining: '.' }
        : { action: 'remove' };
    }
    return { action: 'update', remaining };
  }
  return { action: 'keep' };
}

function applyTextSegmentContent(seg: any, text: any) {
  delete seg.html;
  seg.content = text;
}

/**
 * @param {Array<import('../types.d.ts').DocumentSegment>} result
 * @param {{ id?: string, placeholder?: string }} [fieldSeg]
 * @param {Record<string, import('../types.d.ts').FieldSchema>} [fieldSchemas]
 */
function removePrecedingLabelSegment(result: any, fieldSeg: any, fieldSchemas: any) {
  if (!result.length) return;
  const prev = result[result.length - 1];
  if (prev.type !== 'text') return;

  const schema = fieldSeg?.id ? fieldSchemas?.[fieldSeg.id] : undefined;
  const candidates = getFieldHeadingCandidates(schema, fieldSeg);
  const fieldHints = candidates.length ? { candidates } : null;

  const { action, remaining } = computeTextAfterLabelRemoval(
    getTextSegmentPlainText(prev),
    fieldHints,
  );
  if (action === 'remove') {
    result.pop();
  } else if (action === 'update') {
    applyTextSegmentContent(prev, remaining);
  }
}

/** Drop a peer `, ` left in front of an empty field — not sentence-ending periods. */
function removePrecedingPunctuationSegment(result: any) {
  if (!result.length) return;
  const prev = result[result.length - 1];
  if (isPeerCommaSeparatorSegment(prev)) {
    result.pop();
  }
}

function isPreviewEmptyFieldValue(value: any, fieldId: any, fieldSchemas: any, seg: any) {
  const schema = fieldSchemas?.[fieldId];
  if (isFieldEmpty(value, {
    htmlEditor: !!schema?.htmlEditor,
    repeaterSchema: schema?.type === 'child' ? schema : undefined,
  })) {
    return true;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '.') return true;
    const label = schema?.label?.trim();
    const placeholder = seg?.placeholder?.trim();
    if (label && trimmed === label) return true;
    if (placeholder && trimmed === placeholder) return true;
  }

  return false;
}

function isPeerCommaSeparatorSegment(seg: any) {
  if (seg?.type !== 'text') return false;
  const plain = getTextSegmentPlainText(seg);
  return isPunctuationOnlyText(plain) && plain.includes(',');
}

function fieldKeptForPreview(seg: any, fieldValues: any, fieldSchemas: any) {
  if (seg?.type !== 'field') return false;
  const schema = fieldSchemas?.[seg.id];
  const value = resolveFieldValue(seg.id, fieldValues, fieldSchemas);
  return !isPreviewEmptyFieldValue(value, seg.id, fieldSchemas, seg) || isSchemaRequired(schema);
}

/** Leading `.\n` / `. ` that terminated a previous row that was removed by hide-empty. */
function stripLeadingOrphanRowSeparator(text: any) {
  if (typeof text !== 'string') return text;
  return text.replace(/^\.[\s\n]*/, '');
}

function stripLeadingOrphanRowSeparatorFromSegment(seg: any) {
  if (seg.type !== 'text') return seg;
  if (seg.html) {
    const plain = getTextSegmentPlainText(seg);
    const stripped = stripLeadingOrphanRowSeparator(plain);
    if (stripped === plain) return seg;
    if (!stripped) return null;
    // Keep markup only when plain text still matches after strip; otherwise flatten.
    applyTextSegmentContent(seg, stripped);
    return seg;
  }
  const content = seg.content ?? '';
  const stripped = stripLeadingOrphanRowSeparator(content);
  if (!stripped) return null;
  if (stripped === content) return seg;
  return { ...seg, content: stripped };
}

function cleanupSegments(segments: any) {
  const cleaned = [];

  for (const seg of segments) {
    if (seg.type === 'columns') {
      const cols = (seg.columns ?? [[], []]).map((col: any) => cleanupSegments(col));
      const entry: any = { type: 'columns', columns: cols };
      if (seg.id) entry.id = seg.id;
      if (seg.widths?.[0] || seg.widths?.[1]) entry.widths = seg.widths;
      cleaned.push(entry);
      continue;
    }

    if (seg.type === 'table') {
      cleaned.push({ ...seg });
      continue;
    }

    if (seg.type === 'text') {
      if (seg.html) {
        if (!seg.html.trim()) continue;
        cleaned.push(seg);
        continue;
      }
      const content = seg.content ?? '';
      if (content === '') continue;
      cleaned.push({ ...seg, content });
      continue;
    }
    cleaned.push(seg);
  }

  // Drop orphaned punctuation (`, `, `.\n`, …) unless it sits between kept content,
  // or anchors an OD/OS comma / sentence-ending period next to kept field content.
  const withoutOrphans = cleaned.filter((seg, i, arr) => {
    if (seg.type !== 'text') return true;
    const plain = getTextSegmentPlainText(seg);
    if (!isOrphanPunctuationText(plain)) return true;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    if (
      plain.includes(',') &&
      (prev?.type === 'field' || next?.type === 'field')
    ) {
      return true;
    }
    // Keep `.` that ends a kept eye value when the following empty row was removed.
    if (
      isRowSeparatorOnlyText(plain) &&
      plain.includes('.') &&
      (prev?.type === 'field' ||
        (isPeerCommaSeparatorSegment(prev) && arr[i - 2]?.type === 'field'))
    ) {
      return true;
    }
    const hasLeft = arr.slice(0, i).some(isContentBearingSegment);
    const hasRight = arr.slice(i + 1).some(isContentBearingSegment);
    return hasLeft && hasRight;
  });

  // Strip a leading `.\n` glued onto the next kept label when earlier rows were removed.
  // Normalize bare row terminators to `.` (e.g. `.\n` trailing after the last kept value).
  return withoutOrphans
    .map((seg, i, arr) => {
      if (seg.type !== 'text') return seg;
      const plain = getTextSegmentPlainText(seg);
      if (
        !seg.html &&
        isRowSeparatorOnlyText(plain) &&
        plain.includes('.') &&
        (arr[i - 1]?.type === 'field' ||
          (isPeerCommaSeparatorSegment(arr[i - 1]) && arr[i - 2]?.type === 'field'))
      ) {
        return { ...seg, content: '.' };
      }
      const hasLeft = arr.slice(0, i).some(isContentBearingSegment);
      if (hasLeft) return seg;
      return stripLeadingOrphanRowSeparatorFromSegment(seg);
    })
    .filter(Boolean);
}

export function filterSegmentsForPreview(segments: any, fieldValues: any, fieldSchemas: any) {
  const result = [];
  const list = segments ?? [];

  for (let i = 0; i < list.length; i++) {
    const seg = list[i];

    if (seg.type === 'columns') {
      const filteredCols = (seg.columns ?? [[], []]).map((col: any) =>
        filterSegmentsForPreview(col, fieldValues, fieldSchemas)
      );
      const hasContent = filteredCols.some((col: any) => col.length > 0);
      if (hasContent) {
        const entry: any = { type: 'columns', columns: filteredCols };
        if (seg.id) entry.id = seg.id;
        if (seg.widths?.[0] || seg.widths?.[1]) entry.widths = seg.widths;
        result.push(entry);
      }
      continue;
    }

    if (seg.type === 'table') {
      if (
        tableSegmentHasContent(seg.id, fieldValues, fieldSchemas, seg.rows) ||
        tableSegmentHasRequiredEmpty(seg.id, fieldValues, fieldSchemas, seg.rows)
      ) {
        result.push({ ...seg });
      }
      continue;
    }

    if (seg.type === 'child' || (seg.type === 'field' && fieldSchemas?.[seg.id]?.type === 'child')) {
      const schema = fieldSchemas?.[seg.id];
      if (repeaterHasContent(fieldValues?.[seg.id], schema) || isSchemaRequired(schema)) {
        result.push({ type: 'field', id: seg.id });
      }
      continue;
    }

    if (seg.type !== 'field') {
      result.push({ ...seg });
      continue;
    }

    const value = resolveFieldValue(seg.id, fieldValues, fieldSchemas);
    const schema = fieldSchemas?.[seg.id];
    if (!isPreviewEmptyFieldValue(value, seg.id, fieldSchemas, seg) || isSchemaRequired(schema)) {
      // Keep required empties (with placeholder) even when hide-empty is on.
      result.push({ ...seg });
      continue;
    }

    // Ophthalmology-style pair: `Label: [empty OD], [filled OS]` → `Label: , value`
    // Keep the row label and the peer comma; omit only the empty field.
    const peerSep = list[i + 1];
    const peerField = list[i + 2];
    if (
      isPeerCommaSeparatorSegment(peerSep) &&
      fieldKeptForPreview(peerField, fieldValues, fieldSchemas)
    ) {
      continue;
    }

    // `Label: [filled OD], [empty OS]` → keep the comma slot (`Label: value,`).
    const prev = result[result.length - 1];
    if (
      isPeerCommaSeparatorSegment(prev) &&
      result.length >= 2 &&
      result[result.length - 2]?.type === 'field'
    ) {
      continue;
    }

    removePrecedingLabelSegment(result, seg, fieldSchemas);
    removePrecedingPunctuationSegment(result);
  }

  return cleanupSegments(result);
}

export function shouldShowTemplateBlock(blockData: any, fieldValues: any, fieldSchemas: any, options: any = {}) {
  if (options.hideEmptyValues !== true) return true;
  if (!blockData?.fieldId) return true;
  if (blockData.fieldType === 'table') return true;
  const schema = fieldSchemas?.[blockData.fieldId];
  if (isSchemaRequired(schema)) return true;
  if (blockData.fieldType === 'child') {
    return repeaterHasContent(blockData.value, schema);
  }
  const value = resolveFieldValue(blockData.fieldId, fieldValues, fieldSchemas);
  return !isFieldEmpty(value, {
    htmlEditor: !!schema?.htmlEditor,
    repeaterSchema: schema?.type === 'child' ? schema : undefined,
  });
}

function renderPreviewTable(fieldId: any, cells: any, fieldSchemas: any, fieldValues: any, previewContext: any, tableRows?: any) {
  return buildPreviewTableElement(fieldId, { ...fieldValues, ...cells }, {
    fieldSchemas,
    previewContext,
    previewMode: true,
    showEmptyRows: previewContext?.hideEmptyValues !== true,
    tableRows,
  });
}

function renderPreviewTemplateBlock(blockData: any, fieldValues: any, fieldSchemas: any, previewContext: any) {
  if (!shouldShowTemplateBlock(blockData, fieldValues, fieldSchemas, previewContext)) return null;

  const wrap = document.createElement('div');
  wrap.className = 'preview-document__block';

  if (blockData.fieldType === 'table') {
    const table = renderPreviewTable(
      blockData.fieldId,
      blockData.cells,
      fieldSchemas,
      fieldValues,
      previewContext,
    );
    if (table) wrap.appendChild(table);
    else return null;
    return wrap;
  }

  if (blockData.fieldType === 'child') {
    const schema = fieldSchemas[blockData.fieldId];
    const fieldLabel = schema?.label ?? blockData.label ?? '';
    const line = document.createElement('div');
    line.className = 'preview-document__line';
    if (fieldLabel) {
      const label = document.createElement('span');
      label.textContent = `${fieldLabel}: `;
      line.appendChild(label);
    }
    line.appendChild(
      renderRepeaterFieldPreview(
        blockData.fieldId,
        blockData.value ?? {},
        previewContext,
      ),
    );
    wrap.appendChild(line);
    return wrap;
  }

  const schema = fieldSchemas[blockData.fieldId];
  const fieldLabel = schema?.label ?? blockData.label ?? '';
  const value = resolveFieldValue(blockData.fieldId, fieldValues, fieldSchemas) ?? blockData.value;

  const line = document.createElement('div');
  line.className = 'preview-document__line';

  if (blockData.prefixText) {
    const prefix = document.createElement('span');
    prefix.textContent = blockData.prefixText;
    line.appendChild(prefix);
  }

  if (blockData.fieldType === 'text') {
    if (value && !isFieldEmpty(value, { htmlEditor: !!schema?.htmlEditor })) {
      if (schema?.htmlEditor) {
        appendHtmlToFragment(line, String(value));
      } else {
        line.appendChild(textToFragment(String(value)));
      }
    }
  } else {
    if (fieldLabel && blockData.fieldType !== 'text') {
      const label = document.createElement('span');
      label.textContent = `${fieldLabel}: `;
      line.appendChild(label);
    }
    if (!isFieldEmpty(value, { htmlEditor: !!schema?.htmlEditor })) {
      const token = createFieldToken(blockData.fieldId, value, fieldLabel, previewContext);
      token.classList.add('field-token--preview');
      line.appendChild(token);
    } else if (!previewContext.hideEmptyValues) {
      const token = createFieldToken(blockData.fieldId, value ?? '', fieldLabel, previewContext);
      token.classList.add('field-token--preview');
      line.appendChild(token);
    }
  }

  wrap.appendChild(line);
  return wrap;
}

export function renderDocumentPreview(doc: any, options: any = {}) {
  const fieldSchemas = doc.fieldSchemas ?? {};
  const blocks = doc.blocks ?? [];
  const values = collectAllValues(blocks);
  enrichComputedValues(values, fieldSchemas, blocks);
  const hideEmpty = options.hideEmptyValues === true;
  const pageSetup = doc.pageSetup ?? options.pageSetup ?? {};
  const fieldValueStyle = resolvePageSetupFieldValueStyle(pageSetup, options.fieldValueStyle);
  const fieldHighlightStyle = resolvePageSetupFieldHighlightStyle(
    pageSetup,
    options.fieldHighlight,
  );
  const textStyle = resolvePageSetupTextStyle(pageSetup);
  const previewContext = {
    previewMode: true,
    fieldSchemas,
    fieldValueStyle,
    documentTextStyle: textStyle,
    blocks,
    hideEmptyValues: hideEmpty,
  };

  const root = document.createElement('div');
  root.className = 'preview-document';
  if (hideEmpty) {
    root.classList.add('preview-document--hide-empty');
  }
  applyFieldHighlightCssVars(root, fieldHighlightStyle);

  // Carry the last table across consecutive sections so a Totals "2 columns"
  // block in the next section can inherit that table's right-column split.
  let lastTableSegForColumns: any = null;

  for (const block of blocks) {
    const data = block.data ?? {};

    if (block.type === 'documentSection') {
      if (!evaluateSectionVisibility(data.visibility, values, fieldSchemas)) continue;
      const sectionLabel = String(data.label ?? '').trim();
      const showTitle = !!sectionLabel && !data.hideTitleInPreview;
      const segments = hideEmpty
        ? filterSegmentsForPreview(data.segments, values, fieldSchemas)
        : (data.segments ?? []);

      let bodyEl = null;
      if (segments.length) {
        bodyEl = document.createElement('div');
        bodyEl.className = 'preview-document__section document-section__body';
        applyDocumentBodyTextStyle(bodyEl, textStyle);
        bodyEl.appendChild(
          renderSegmentsToDom(segments, values, {
            ...previewContext,
            lastTableSegForColumns,
            onLastTableSegForColumns: (seg: any) => {
              lastTableSegForColumns = seg;
            },
          }),
        );
        if (hideEmpty && !bodyEl.textContent?.trim() && !bodyEl.querySelector('img')) {
          bodyEl = null;
        }
      }

      if (!showTitle && !bodyEl) continue;

      const wrap = document.createElement('div');
      wrap.className = 'preview-document__section-wrap';
      if (data.repeatable) wrap.dataset.repeatable = 'true';
      if (data.borderTop) wrap.classList.add('document-section--border-top');
      if (data.borderBottom) wrap.classList.add('document-section--border-bottom');

      if (showTitle) {
        const header = document.createElement('div');
        header.className = 'document-section__header';
        const text = document.createElement('span');
        text.className = 'document-section__label-text';
        text.textContent = sectionLabel;
        header.appendChild(text);
        wrap.appendChild(header);
      }

      if (bodyEl) wrap.appendChild(bodyEl);
      root.appendChild(wrap);
      continue;
    }

    if (block.type === 'visionTable') {
      const table = renderPreviewTable(data.fieldId, data.cells, fieldSchemas, values, previewContext);
      if (table) {
        const wrap = document.createElement('div');
        wrap.className = 'preview-document__block';
        wrap.appendChild(table);
        root.appendChild(wrap);
      }
      continue;
    }

    if (block.type === 'templateBlock') {
      const el = renderPreviewTemplateBlock(data, values, fieldSchemas, previewContext);
      if (el) root.appendChild(el);
    }
  }

  if (!root.childNodes.length && hideEmpty) {
    const empty = document.createElement('p');
    empty.className = 'preview-document__empty';
    empty.textContent = 'No filled content to preview.';
    root.appendChild(empty);
  }

  return root;
}
