import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellFieldId } from '@docengine/editor/node';
import {
  generateDocumentPdf,
  generatePdfFromTemplate,
  mergeTemplateAndDocument,
  renderDocumentToPdfDefinition,
} from './index.js';
import { buildPdfTable, createPdfRenderContext, renderSegmentsToPdfContent, renderSegmentsToPdfProseBlocks, buildRepeatableSectionTitleNode, buildPdfSectionTitleNode } from './segment-renderer.js';
import { htmlToPdfBlocks, isBlockLevelHtml, plainTextNewlinesToBrHtml, plainTextToPdfText, stampExplicitPdfBold, finalizePdfInlineParts } from './html-text.js';
import { renderDocumentToPdfContent, shouldUseLegacyPdfExport } from './multipage-renderer.js';
import { VISION_TABLE_PDF_LAYOUT, VISION_TABLE_BORDERLESS_PDF_LAYOUT } from './table-layout.js';
import { marginMmToPt, mmToPt, resolvePageSize } from './units.js';
import { buildRepeatableSectionPageHeader, computeRepeatableHeaderBandHeightPt, HEADER_LINE_SLACK_PT } from './repeatable-section-header.js';
import { estimatePdfContentHeightPt } from './repeatable-table-pagination.js';
import { buildFontRegistry } from './fonts-browser-registry.js';

const defaultFontRegistry = buildFontRegistry({ preset: 'Roboto' });

const tableId = 'table_pdf_test';
const tableSchema = {
  type: 'table',
  name: 'Acuity',
  label: 'Acuity',
  columns: [
    { key: 'od', label: 'OD' },
    { key: 'os', label: 'OS' },
  ],
  rows: [
    { key: 'row1', label: 'Row1' },
    { key: 'row2', label: 'Row2' },
  ],
  cellType: 'text',
};

function makeTemplate(): any {
  const cellOd = cellFieldId(tableId, 'row1', 'od');
  const cellOs = cellFieldId(tableId, 'row1', 'os');
  return {
    kind: 'template',
    version: 1,
    time: Date.now(),
    fieldSchemas: {
      [tableId]: tableSchema,
      [cellOd]: { type: 'text', label: 'OD', name: 'OD' },
      [cellOs]: { type: 'text', label: 'OS', name: 'OS' },
      exam_notes: { type: 'text', label: 'Notes', name: 'Notes' },
    },
    blocks: [
      {
        type: 'documentSection',
        data: {
          label: 'Examination',
          name: 'Examination',
          segments: [
            { type: 'text', content: 'Patient notes: ' },
            { type: 'field', id: 'exam_notes', placeholder: 'Notes' },
            { type: 'table', id: tableId, rows: tableSchema.rows },
          ],
          fieldValues: {
            exam_notes: '',
            [cellOd]: '',
            [cellOs]: '',
          },
        },
      },
    ],
  };
}

function makeDocument() {
  return {
    kind: 'field',
    version: 2,
    time: Date.now(),
    sections: {
      Examination: {
        Notes: 'Stable findings',
        Acuity: [{ od: '0.8', os: '0.9' }],
      },
    },
  };
}

describe('mergeTemplateAndDocument', () => {
  it('merges sectioned document values into template blocks', () => {
    const doc = mergeTemplateAndDocument(makeTemplate(), makeDocument());
    const section = doc.blocks[0].data;
    assert.equal(section.fieldValues.exam_notes, 'Stable findings');
    assert.equal(
      section.fieldValues[cellFieldId(tableId, 'row1', 'od')],
      '0.8',
    );
  });

  it('copies template pageSetup and repeatable section instances', () => {
    const template = makeTemplate();
    template.pageSetup = { format: 'letter', margin: 10 };
    template.blocks.push({
      type: 'documentSection',
      data: {
        label: 'Items',
        name: 'Items',
        repeatable: true,
        segments: [{ type: 'field', id: 'items_name', placeholder: 'Name' }],
        fieldValues: { items_name: '' },
      },
    });
    template.fieldSchemas.items_name = { type: 'text', name: 'Name', label: 'Name' };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Examination: makeDocument().sections.Examination,
        Items: [{ Name: 'A' }, { Name: 'B' }, { Name: 'C' }],
      },
    });

    assert.equal(doc.pageSetup.format, 'letter');
    assert.equal(doc.pageSetup.margin, 10);
    assert.deepEqual(doc.repeatableSectionInstances?.Items?.length, 3);
    assert.equal(doc.blocks.find((b: any) => b.data?.repeatable)?.data.fieldValues.items_name, 'A');
  });
});

function findPdfTable(nodes: any): any {
  for (const node of nodes ?? []) {
    if (node?.table) return node;
    if (node?.stack) {
      const found: any = findPdfTable(node.stack);
      if (found) return found;
    }
    if (node?.columns) {
      for (const col of node.columns) {
        const found: any = findPdfTable(col.stack);
        if (found) return found;
      }
    }
  }
  return null;
}

function findAllPdfTables(nodes: any): any[] {
  const tables: any[] = [];
  function walk(list: any) {
    for (const node of list ?? []) {
      if (node?.table) tables.push(node);
      if (node?.stack) walk(node.stack);
      if (node?.columns) {
        for (const col of node.columns) {
          walk(col.stack);
        }
      }
    }
  }
  walk(nodes);
  return tables;
}

function nodeContainsText(node: any, text: any): boolean {
  if (!node || typeof node !== 'object') return false;
  if (typeof node.text === 'string' && node.text.includes(text)) return true;
  if (Array.isArray(node.text)) {
    const joined = node.text
      .map((part: any) => (typeof part === 'string' ? part : part?.text ?? ''))
      .join('');
    if (joined.includes(text)) return true;
  }
  if (Array.isArray(node.stack)) {
    for (const child of node.stack) {
      if (nodeContainsText(child, text)) return true;
    }
  }
  return false;
}

function chunkContainsText(chunk: any, text: any): boolean {
  return nodeContainsText(chunk, text);
}

const defaultRenderOptions = {
  resolveFontName: defaultFontRegistry.resolveFontName,
  defaultFont: defaultFontRegistry.defaultFont,
  fieldValueStyle: {},
};

function assertAllPartsUseFont(parts: any, expectedFont = 'Roboto') {
  for (const part of parts) {
    if (typeof part === 'string') {
      assert.fail(`plain string part should have been stamped with font: ${part}`);
    }
    assert.equal(part.font, expectedFont, `expected font on part: ${part.text}`);
  }
}

function headerContainsText(docDefinition: any, text: any): boolean {
  if (typeof docDefinition.header !== 'function') return false;
  return nodeContainsText(docDefinition.header(), text);
}

function nodeTextJoined(node: any): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.text)) return joinPdfParts(node.text);
  if (Array.isArray(node.parts)) return joinPdfParts(node.parts);
  if (Array.isArray(node.stack)) return node.stack.map((child: any) => nodeTextJoined(child)).join('');
  if (Array.isArray(node.columns)) {
    return node.columns.map((col: any) => nodeTextJoined(col)).join('');
  }
  return '';
}

function joinPdfParts(parts: any): string {
  return parts
    .map((part: any) => {
      if (typeof part === 'string') return part;
      if (part?.lineBreak) return '\n';
      return part.text ?? '';
    })
    .join('');
}

function findHeaderBodyBlocks(stack: any): any[] {
  return stack.filter((node: any) => node.style !== 'sectionHeader' && node.text != null);
}

function pdfCellText(cell: any): string {
  if (cell == null || cell === '') return '';
  if (typeof cell === 'string') return cell;
  if (Array.isArray(cell.text)) {
    return cell.text.map((part: any) => (typeof part === 'string' ? part : part.text ?? '')).join('');
  }
  return String(cell.text ?? '');
}

function assertEmptyPdfTableCell(cell: any, alignment?: any) {
  assert.equal(pdfCellText(cell), '');
  if (alignment) assert.equal(cell.alignment, alignment);
  assert.equal(cell.lineHeight, 1);
}

describe('renderDocumentToPdfDefinition', () => {
  it('builds a pdfmake definition with table header rows', () => {
    const doc = mergeTemplateAndDocument(makeTemplate(), makeDocument());
    const { docDefinition } = renderDocumentToPdfDefinition(doc, {
      pageSetup: {
        title: 'Document summary',
        footer: { showPageNumbers: true },
      },
    });
    const def = docDefinition as any;

    assert.equal(def.defaultStyle.fontSize, 12);
    assert.equal(def.defaultStyle.font, 'Roboto');
    assert.equal(def.defaultStyle.lineHeight, 1.65);
    assert.ok(Array.isArray(def.content));
    const tableBlock = findPdfTable(def.content);
    assert.ok(tableBlock);
    assert.equal(tableBlock.table.headerRows, 1);
    assert.equal(tableBlock.table.body[0][0].text, 'OD');
    assert.equal(tableBlock.table.body[0][0].fontSize, 12);
    assert.equal(def.styles.tableHeader.lineHeight, 1);
    assert.equal(def.styles.tableBody.lineHeight, 1);
    assert.equal(typeof def.header, 'undefined');
    assert.ok(typeof def.footer === 'function');
  });

  it('renders pivotTable values as a pdfmake matrix (not an empty table)', () => {
    const doc = {
      fieldSchemas: {
        sales_pivot: {
          type: 'pivotTable',
          name: 'Sales Pivot',
          label: 'Sales',
          rowProperty: 'Region',
          columnProperty: 'Product',
          valueProperty: 'Amount',
          aggregation: 'sum',
          showRowTotals: true,
          showColumnTotals: true,
          showGrandTotal: true,
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Main',
            label: 'Main',
            segments: [{ type: 'table', id: 'sales_pivot' }],
            fieldValues: {
              sales_pivot: {
                columns: [
                  { key: 'a', label: 'A' },
                  { key: 'b', label: 'B' },
                ],
                rows: [
                  { key: 'west', label: 'West', cells: { a: 13, b: 5 }, rowTotal: 18 },
                  { key: 'east', label: 'East', cells: { a: 7, b: null }, rowTotal: 7 },
                ],
                columnTotals: { a: 20, b: 5 },
                grandTotal: 25,
              },
            },
          },
        },
      ],
    };
    const content = renderDocumentToPdfContent(doc as any, {
      resolveFontName: (n?: string | null) => n || 'Roboto',
      defaultFont: 'Roboto',
    });
    const tableBlock = findPdfTable(content);
    assert.ok(tableBlock, 'expected a pivot pdf table');
    assert.ok(tableBlock.table.body.length >= 3, 'header + data rows');
    assert.equal(tableBlock.table.body[0][1].text, 'A');
    assert.equal(tableBlock.table.body[1][0].text, 'West');
    assert.equal(tableBlock.table.body[1][1].text, '13');
    assert.equal(String(tableBlock.table.body[tableBlock.table.body.length - 1][3].text), '25');
  });

  it('omits empty pivotTable when hideEmptyValues is true', () => {
    const doc = {
      fieldSchemas: {
        sales_pivot: {
          type: 'pivotTable',
          name: 'Sales Pivot',
          label: 'Sales',
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Main',
            label: 'Main',
            segments: [{ type: 'table', id: 'sales_pivot' }],
            fieldValues: {
              sales_pivot: { columns: [], rows: [] },
            },
          },
        },
      ],
    };
    const content = renderDocumentToPdfContent(doc as any, {
      resolveFontName: (n?: string | null) => n || 'Roboto',
      defaultFont: 'Roboto',
      hideEmptyValues: true,
    });
    assert.equal(findPdfTable(content), null);
  });

  it('uses pageSetup saved on the document', () => {
    const doc = mergeTemplateAndDocument(makeTemplate(), makeDocument());
    doc.pageSetup = { format: 'letter', margin: 10 };
    const { docDefinition } = renderDocumentToPdfDefinition(doc, {});
    assert.equal(docDefinition.pageSize, resolvePageSize('letter'));
    assert.equal(docDefinition.pageOrientation, 'portrait');
    assert.deepEqual(docDefinition.pageMargins, marginMmToPt([10, 10, 10, 10]));
  });

  it('applies landscape orientation from pageSetup', () => {
    const doc = mergeTemplateAndDocument(makeTemplate(), makeDocument());
    doc.pageSetup = { format: 'a4', orientation: 'landscape', margin: 15 };
    const { docDefinition } = renderDocumentToPdfDefinition(doc, {});
    assert.equal(docDefinition.pageSize, resolvePageSize('a4'));
    assert.equal(docDefinition.pageOrientation, 'landscape');
  });

  it('emits canvas rules for section borderTop/borderBottom', () => {
    const doc = {
      fieldSchemas: {
        note: { type: 'text', name: 'note', label: 'Note' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Anamnesis',
            borderTop: true,
            borderBottom: true,
            segments: [{ type: 'field', id: 'note' }],
            fieldValues: { note: 'Headache' },
          },
        },
      ],
    };
    const { docDefinition } = renderDocumentToPdfDefinition(doc, {});
    const section = (docDefinition as any).content.find((node: any) => Array.isArray(node?.stack));
    assert.ok(section);
    const canvasNodes = section.stack.filter((node: any) => Array.isArray(node.canvas));
    assert.equal(canvasNodes.length, 2);
    assert.equal(canvasNodes[0].canvas[0].lineColor, '#000000');
    assert.equal(canvasNodes[0].canvas[0].lineWidth, 1);
    assert.equal(canvasNodes[1].canvas[0].lineColor, '#000000');
  });

  it('keeps table headers independent of column cell alignment styles', () => {
    const cell1 = cellFieldId(tableId, 'row1', 'od');
    const cell2 = cellFieldId(tableId, 'row1', 'os');
    const fieldSchemas = {
      ...makeTemplate().fieldSchemas,
      [cell1]: {
        type: 'text',
        label: 'OD',
        displayStyle: { textAlign: 'right', fontStyle: 'italic' },
      },
      [cell2]: {
        type: 'text',
        label: 'OS',
        displayStyle: { textAlign: 'right', fontWeight: 'bold' },
      },
    };
    const ctx = {
      fieldSchemas,
      blocks: [],
      fieldValues: { [cell1]: '0.8', [cell2]: '0.9' },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
    };

    const table = buildPdfTable(tableId, ctx, tableSchema.rows);
    assert.ok(table);
    const headerRow = table.table.body[0];
    for (const headerCell of headerRow) {
      assert.equal(headerCell.alignment, 'center');
      assert.equal(headerCell.bold, false);
      assert.notEqual(headerCell.italics, true);
    }
    assert.equal(table.table.body[1][0].alignment, 'right');
    assert.equal(table.table.body[1][1].alignment, 'right');
  });

  it('applies page setup text style to table headers', () => {
    const cell1 = cellFieldId(tableId, 'row1', 'od');
    const cell2 = cellFieldId(tableId, 'row1', 'os');
    const fieldSchemas = {
      ...makeTemplate().fieldSchemas,
      [cell1]: {
        type: 'text',
        label: 'OD',
        displayStyle: { textAlign: 'right', fontStyle: 'italic' },
      },
      [cell2]: {
        type: 'text',
        label: 'OS',
        displayStyle: { textAlign: 'right', fontWeight: 'bold' },
      },
    };
    const ctx = {
      fieldSchemas,
      blocks: [],
      fieldValues: { [cell1]: '0.8', [cell2]: '0.9' },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
      pageSetup: {
        textStyle: { fontSize: '15px', fontWeight: 'normal', color: '#111111' },
      },
    };

    const table = buildPdfTable(tableId, ctx, tableSchema.rows);
    assert.ok(table);
    const headerRow = table.table.body[0];
    for (const headerCell of headerRow) {
      assert.equal(headerCell.bold, false);
      assert.notEqual(headerCell.italics, true);
      assert.equal(headerCell.fontSize, 15 * 72 / 96);
      assert.equal(headerCell.color, '#111111');
    }
  });

  it('applies custom column widths from table schema', () => {
    const cell1 = cellFieldId(tableId, 'row1', 'od');
    const cell2 = cellFieldId(tableId, 'row1', 'os');
    const fieldSchemas = {
      ...makeTemplate().fieldSchemas,
      [tableId]: {
        ...tableSchema,
        columns: [
          { key: 'od', label: 'OD', width: '75%' },
          { key: 'os', label: 'OS', width: '25%' },
        ],
      },
    };
    const ctx = {
      fieldSchemas,
      blocks: [],
      fieldValues: { [cell1]: '0.8', [cell2]: '0.9' },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
    };

    const table = buildPdfTable(tableId, ctx, tableSchema.rows);
    assert.ok(table);
    assert.deepEqual(table.table.widths, ['75%', '25%']);
  });

  it('omits empty table cells and does not render column label placeholders', () => {
    const tableId = 'anamnesis_table';
    const cell1 = cellFieldId(tableId, 'row1', 'col1');
    const cell2 = cellFieldId(tableId, 'row1', 'col2');
    const cell3 = cellFieldId(tableId, 'row2', 'col1');
    const cell4 = cellFieldId(tableId, 'row2', 'col2');
    const cell5 = cellFieldId(tableId, 'row3', 'col1');
    const cell6 = cellFieldId(tableId, 'row3', 'col2');
    const fieldSchemas = {
      [tableId]: {
        type: 'table',
        columns: [
          { key: 'col1', label: 'Column 1' },
          { key: 'col2', label: 'Column 2' },
        ],
        rows: [
          { key: 'row1', label: 'Row 1' },
          { key: 'row2', label: 'Row 2' },
          { key: 'row3', label: 'Row 3' },
        ],
      },
      [cell1]: { type: 'text', label: 'Column 1' },
      [cell2]: { type: 'text', label: 'Column 2' },
      [cell3]: { type: 'text', label: 'Column 1' },
      [cell4]: { type: 'text', label: 'Column 2' },
      [cell5]: { type: 'text', label: 'Column 1' },
      [cell6]: { type: 'text', label: 'Column 2' },
    };
    const ctx = {
      fieldSchemas,
      blocks: [],
      fieldValues: {
        [cell1]: '1111111111',
        [cell2]: '22222222',
        [cell3]: '123',
        [cell4]: '333',
        [cell5]: '',
        [cell6]: '89',
      },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
      hideEmptyValues: true,
    };

    const table = buildPdfTable(tableId, ctx, fieldSchemas[tableId].rows);
    assert.ok(table);
    assert.equal(table.table.body.length, 4);
    assertEmptyPdfTableCell(table.table.body[3][0]);
    assert.notEqual(table.table.body[3][1].text?.[0]?.text ?? table.table.body[3][1].text, 'Column 2');

    const emptyRowTable = buildPdfTable(
      tableId,
      {
        ...ctx,
        fieldValues: {
          [cell5]: '',
          [cell6]: '',
        },
      },
      [{ key: 'row3' }],
    );
    assert.equal(emptyRowTable, null);
  });

  it('skips rows where only column label placeholders are stored as values', () => {
    const tableId = 'anamnesis_table';
    const cells = {
      row1: ['col1', 'col2'],
      row2: ['col1', 'col2'],
      row3: ['col1', 'col2'],
      row4: ['col1', 'col2'],
      row5: ['col1', 'col2'],
    };
    const fieldSchemas: any = {
      [tableId]: {
        type: 'table',
        columns: [
          { key: 'col1', label: 'Column 1' },
          { key: 'col2', label: 'Column 2' },
        ],
        rows: Object.keys(cells).map((key) => ({ key, label: key })),
      },
    };
    const fieldValues: any = {};
    for (const [rowKey, cols] of Object.entries(cells)) {
      for (const colKey of cols) {
        const id = cellFieldId(tableId, rowKey, colKey);
        fieldSchemas[id] = {
          type: 'text',
          label: colKey === 'col1' ? 'Column 1' : 'Column 2',
        };
        fieldValues[id] = '';
      }
    }
    fieldValues[cellFieldId(tableId, 'row1', 'col1')] = '1111111111';
    fieldValues[cellFieldId(tableId, 'row1', 'col2')] = '22222222';
    fieldValues[cellFieldId(tableId, 'row2', 'col1')] = '123';
    fieldValues[cellFieldId(tableId, 'row2', 'col2')] = '333';
    fieldValues[cellFieldId(tableId, 'row3', 'col2')] = '132';
    fieldValues[cellFieldId(tableId, 'row4', 'col2')] = '111';
    fieldValues[cellFieldId(tableId, 'row5', 'col1')] = 'Column 1';
    fieldValues[cellFieldId(tableId, 'row5', 'col2')] = 'Column 2';

    const ctx = {
      fieldSchemas,
      blocks: [],
      fieldValues,
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
      hideEmptyValues: true,
    };

    const table = buildPdfTable(tableId, ctx, fieldSchemas[tableId].rows);
    assert.ok(table);
    assert.equal(table.table.body.length, 5);
    assertEmptyPdfTableCell(table.table.body[4][0]);
    assert.equal(table.table.body[4][1].text?.[0]?.text ?? table.table.body[4][1].text, '111');
  });

  it('treats caret-anchor zero-width space as an empty table cell', () => {
    const tableId = 'anamnesis_table';
    const cell1 = cellFieldId(tableId, 'row1', 'col1');
    const cell2 = cellFieldId(tableId, 'row1', 'col2');
    const fieldSchemas = {
      [tableId]: {
        type: 'table',
        columns: [
          { key: 'col1', label: 'Column 1', displayStyle: { textAlign: 'right' } },
          { key: 'col2', label: 'Column 2', displayStyle: { textAlign: 'left' } },
        ],
        rows: [{ key: 'row1', label: 'Row 1' }],
      },
      [cell1]: { type: 'text', label: 'Column 1', displayStyle: { textAlign: 'right' } },
      [cell2]: { type: 'text', label: 'Column 2', displayStyle: { textAlign: 'left' } },
    };
    const ctx = {
      fieldSchemas,
      blocks: [],
      fieldValues: {
        [cell1]: '\u200B',
        [cell2]: '111',
      },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
    };

    const table = buildPdfTable(tableId, ctx, fieldSchemas[tableId].rows);
    assert.ok(table);
    assertEmptyPdfTableCell(table.table.body[1][0], 'right');
    assert.equal(table.table.body[1][1].text?.[0]?.text ?? table.table.body[1][1].text, '111');
    assert.equal(table.table.body[1][1].alignment, 'left');
  });

  it('emits fillColor from cell displayStyle backgroundColor', () => {
    const localTableId = 'fill_color_table';
    const labelCell = cellFieldId(localTableId, 'row1', 'label');
    const valueCell = cellFieldId(localTableId, 'row1', 'value');
    const fieldSchemas = {
      [localTableId]: {
        type: 'table',
        hideHeader: true,
        columns: [
          { key: 'label', label: 'Label' },
          { key: 'value', label: 'Value' },
        ],
        rows: [{ key: 'row1', label: 'Row 1' }],
      },
      [labelCell]: {
        type: 'text',
        label: 'Label',
        displayStyle: { backgroundColor: '#e8eef5' },
      },
      [valueCell]: { type: 'text', label: 'Value' },
    };
    const table = buildPdfTable(localTableId, {
      fieldSchemas,
      blocks: [],
      fieldValues: {
        [labelCell]: 'Patient',
        [valueCell]: 'Alice',
      },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
    }, fieldSchemas[localTableId].rows);

    assert.ok(table);
    assert.equal(table.table.body[0][0].fillColor, '#e8eef5');
    assert.equal(table.table.body[0][1].fillColor, undefined);
  });

  it('applies text background for inline fields with backgroundColor', () => {
    const content = renderSegmentsToPdfContent(
      [
        { type: 'text', content: 'Complaints: ' },
        { type: 'field', id: 'complaints' },
      ],
      {
        fieldSchemas: {
          complaints: {
            type: 'text',
            label: 'Complaints',
            displayStyle: { backgroundColor: '#e8eef5' },
          },
        },
        fieldValues: { complaints: 'Vision disturbance' },
        blocks: [],
        resolveFontName: (name: any) => name ?? 'Roboto',
        fieldValueStyle: {},
        bodyPdfStyle: {},
        defaultFont: 'Roboto',
      },
    );

    assert.ok(content.length >= 1);
    const row = content[0];
    assert.ok(row.text, 'label + field stay in one prose paragraph');
    assert.equal(row.columns, undefined, 'no fill-chip columns layout');
    const parts = Array.isArray(row.text) ? row.text : [row.text];
    const fieldPart = parts.find((p: any) =>
      typeof p === 'object' && String(p?.text ?? '').includes('Vision disturbance'),
    );
    assert.ok(fieldPart);
    assert.equal(fieldPart.background, '#e8eef5');
    assert.equal(fieldPart.fillColor, undefined);
  });

  it('uses vision-table grid layout for pdf tables', () => {
    const table = buildPdfTable(tableId, {
      fieldSchemas: makeTemplate().fieldSchemas,
      blocks: [],
      fieldValues: {
        [cellFieldId(tableId, 'row1', 'od')]: '0.8',
        [cellFieldId(tableId, 'row1', 'os')]: '0.9',
      },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
    }, tableSchema.rows);
    assert.ok(table);
    const layout = table.layout as any;
    assert.equal(table.layout, VISION_TABLE_PDF_LAYOUT);
    assert.equal(layout.paddingLeft(), 6);
    assert.equal(layout.paddingTop(), 3);
    assert.equal(layout.paddingBottom(), 3);
    assert.equal(layout.hLineColor(), '#999999');
    assert.equal(table.table.body[1][0].lineHeight, 1);
    assert.equal(table.table.body[0][0].lineHeight, 1);
  });

  it('honors hideHeader and hideBorders on pdf tables', () => {
    const schemas: any = makeTemplate().fieldSchemas;
    schemas[tableId] = {
      ...schemas[tableId],
      hideHeader: true,
      hideBorders: true,
    };
    const table = buildPdfTable(tableId, {
      fieldSchemas: schemas,
      blocks: [],
      fieldValues: {
        [cellFieldId(tableId, 'row1', 'od')]: '0.8',
        [cellFieldId(tableId, 'row1', 'os')]: '0.9',
      },
      resolveFontName: (name: any) => name ?? 'Roboto',
      fieldValueStyle: {},
    }, tableSchema.rows);
    assert.ok(table);
    assert.equal(table.table.headerRows, 0);
    assert.equal(table.table.keepWithHeaderRows, 0);
    assert.equal(table.table.body.length, 2);
    assert.equal(table.table.body[0][0].text?.[0]?.text ?? table.table.body[0][0].text, '0.8');
    assert.equal(table.layout, VISION_TABLE_BORDERLESS_PDF_LAYOUT);
    assert.equal((table.layout as any).hLineWidth(), 0);
    assert.equal((table.layout as any).vLineWidth(), 0);
  });

  it('converts rich text HTML in table cells with formatting', () => {
    const htmlCellId = cellFieldId(tableId, 'row1', 'od');
    const template = makeTemplate();
    template.fieldSchemas[htmlCellId] = {
      type: 'text',
      label: 'OD',
      name: 'OD',
      htmlEditor: true,
    };
    const doc = mergeTemplateAndDocument(template, makeDocument());
    doc.blocks[0].data.fieldValues[htmlCellId] = '<b>test</b><br><ul><li>column 1</li></ul><br>';

    const ctx = {
      fieldSchemas: doc.fieldSchemas,
      blocks: doc.blocks,
      fieldValues: doc.blocks[0].data.fieldValues,
      previewContext: {
        previewMode: true,
        fieldSchemas: doc.fieldSchemas,
        blocks: doc.blocks,
      },
      resolveFontName: (name: any) => name ?? 'Roboto',
      defaultFont: 'Roboto',
      fieldValueStyle: {},
      bodyPdfStyle: {},
    };

    const table = buildPdfTable(tableId, ctx, tableSchema.rows);
    assert.ok(table);
    const cell = table.table.body[1][0];
    const rendered = extractPdfCellText(cell);
    assert.match(rendered, /test/);
    assert.match(rendered, /column 1/);
    assert.doesNotMatch(rendered, /<b>/);
    const boldPart = findPdfBoldPart(cell);
    assert.equal(boldPart?.text, 'test\n');
  });

  it('applies segment align metadata to centered prose', () => {
    const doc = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {},
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Anamnesis',
            segments: [
              { type: 'text', content: '234234', align: 'center' },
              { type: 'text', html: '<ul><li>1111</li><li>22222</li></ul>', align: 'center' },
            ],
            fieldValues: {},
          },
        },
      ],
    };

    const ctx = {
      fieldSchemas: {},
      blocks: doc.blocks,
      fieldValues: {},
      previewContext: { previewMode: true, fieldSchemas: {}, blocks: doc.blocks },
      resolveFontName: (name: any) => name ?? 'Roboto',
      defaultFont: 'Roboto',
      fieldValueStyle: {},
      bodyPdfStyle: { fontSize: 11.25 },
    };

    const content = renderSegmentsToPdfContent(doc.blocks[0].data.segments, ctx);
    const combined = content
      .map((node: any) => (
        Array.isArray(node.text)
          ? node.text.map((part: any) => (typeof part === 'string' ? part : part.text)).join('')
          : String(node.text ?? '')
      ))
      .join('\n');
    assert.ok(content.length >= 2);
    assert.ok(content.every((node: any) => node.alignment === 'center'));
    assert.match(combined, /234234/);
    assert.match(combined, /1111/);
  });
});

function extractPdfCellText(cell: any): string {
  if (typeof cell === 'string') return cell;
  if (Array.isArray(cell.stack)) {
    return cell.stack.map((node: any) => extractPdfCellText(node)).join('\n');
  }
  const text = cell.text;
  if (Array.isArray(text)) {
    return text.map((part: any) => (typeof part === 'string' ? part : part.text)).join('');
  }
  return String(text ?? '');
}

function findPdfBoldPart(cell: any): any {
  if (typeof cell === 'string' || !cell) return null;
  if (Array.isArray(cell.stack)) {
    for (const node of cell.stack) {
      const found: any = findPdfBoldPart(node);
      if (found) return found;
    }
    return null;
  }
  const text = cell.text;
  if (!Array.isArray(text)) return text?.bold ? text : null;
  return text.find((part: any) => typeof part === 'object' && part.bold) ?? null;
}

function collectPageBreaks(nodes: any): number {
  let count = 0;
  for (const node of nodes ?? []) {
    if (node?.pageBreak) count += 1;
    if (node?.stack) count += collectPageBreaks(node.stack);
    if (node?.columns) {
      for (const col of node.columns) {
        count += collectPageBreaks(col.stack);
      }
    }
  }
  return count;
}

function collectNodesWithStyle(nodes: any, style: any): any[] {
  const results: any[] = [];
  function walk(chunkNodes: any) {
    for (const node of chunkNodes ?? []) {
      if (node?.style === style) results.push(node);
      if (node?.stack) walk(node.stack);
      if (node?.columns) {
        for (const col of node.columns) {
          walk(col.stack);
        }
      }
    }
  }
  walk(nodes);
  return results;
}

function findTextInPdfContent(nodes: any, text: any): boolean {
  for (const node of nodes ?? []) {
    if (typeof node?.text === 'string' && node.text.includes(text)) return true;
    if (Array.isArray(node?.text)) {
      const joined = node.text
        .map((part: any) => (typeof part === 'string' ? part : part.text ?? ''))
        .join('');
      if (joined.includes(text)) return true;
    }
    if (node?.stack && findTextInPdfContent(node.stack, text)) return true;
    if (node?.table?.body && findTextInPdfContent(node.table.body.flat(), text)) return true;
    if (node?.columns) {
      for (const col of node.columns) {
        if (findTextInPdfContent(col.stack, text)) return true;
      }
    }
  }
  return false;
}

describe('shouldUseLegacyPdfExport', () => {
  it('returns false for single-instance repeatable section (JSON renderer uses a page header)', () => {
    const tableId = 'items_table';
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        lifeAnamnesis: { type: 'tree', name: 'Life history', label: 'Life history' },
        [tableId]: {
          type: 'table',
          name: 'Results',
          label: 'Results',
          columns: [
            { key: 'col1', label: 'Column 1' },
            { key: 'col2', label: 'Column 2' },
          ],
          cellType: 'text',
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            repeatable: true,
            segments: [
              { type: 'text', content: 'Complaints: ' },
              { type: 'field', id: 'complaints' },
              { type: 'text', content: '.\nLife history: ' },
              { type: 'field', id: 'lifeAnamnesis' },
              { type: 'text', content: '.' },
            ],
            fieldValues: {
              complaints: ['Tearing'],
              lifeAnamnesis: ['Unremarkable'],
            },
          },
        },
        {
          type: 'documentSection',
          data: {
            name: 'items',
            label: 'Items',
            segments: [{ type: 'table', id: tableId, rows: [{ key: 'row1', label: '' }] }],
            fieldValues: { [cellFieldId(tableId, 'row1', 'col1')]: '111' },
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: {
          Complaints: ['Tearing'],
          'Life history': ['Unremarkable'],
        },
        items: {
          Results: [{ col1: '111' }],
        },
      },
    });

    assert.equal(shouldUseLegacyPdfExport(doc), false);

    // Legacy renderer still produces the correct page header for repeatable sections.
    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);
    assert.ok(headerContainsText(docDefinition, 'Anamnesis'));
    assert.ok(headerContainsText(docDefinition, 'Tearing'));
    assert.ok(headerContainsText(docDefinition, 'Unremarkable'));
    assert.ok(headerContainsText(docDefinition, 'Complaints:'));
    assert.ok(headerContainsText(docDefinition, 'Life history:'));
  });

  it('returns false for non-repeatable mammology-style sections', () => {
    const doc = mergeTemplateAndDocument(makeTemplate(), {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: { Complaints: ['Tearing'] },
      },
    });
    assert.equal(shouldUseLegacyPdfExport(doc), false);
  });
});

describe('renderDocumentToPdfContent multipage', () => {
  it('repeats a marked section once per document instance with page breaks', () => {
    const template = makeTemplate();
    template.blocks.unshift({
      type: 'documentSection',
      data: {
        label: 'Patient',
        name: 'Patient',
        segments: [
          { type: 'text', content: 'Patient: ' },
          { type: 'field', id: 'patient_name', placeholder: 'Name' },
        ],
        fieldValues: { patient_name: '' },
      },
    });
    template.blocks.push({
      type: 'documentSection',
      data: {
        label: 'Items',
        name: 'Items',
        repeatable: true,
        segments: [
          { type: 'text', content: 'Item: ' },
          { type: 'field', id: 'items_name', placeholder: 'Name' },
        ],
        fieldValues: { items_name: '' },
      },
    });
    template.blocks.push({
      type: 'documentSection',
      data: {
        label: 'Signature',
        name: 'Signature',
        segments: [{ type: 'text', content: 'Signed' }],
        fieldValues: {},
      },
    });
    template.fieldSchemas.patient_name = { type: 'text', name: 'Name', label: 'Name' };
    template.fieldSchemas.items_name = { type: 'text', name: 'Name', label: 'Name' };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Patient: { Name: 'John Doe' },
        Examination: makeDocument().sections.Examination,
        Items: [{ Name: 'Alpha' }, { Name: 'Beta' }, { Name: 'Gamma' }],
        Signature: {},
      },
    });

    const content = renderDocumentToPdfContent(doc, {
      resolveFontName: (name: any) => name ?? 'Roboto',
      defaultFont: 'Roboto',
      fieldValueStyle: {},
    });

    assert.equal(collectPageBreaks(content), 2);
    assert.equal(findTextInPdfContent(content, 'John Doe'), true);
    assert.equal(findTextInPdfContent(content, 'Alpha'), true);
    assert.equal(findTextInPdfContent(content, 'Beta'), true);
    assert.equal(findTextInPdfContent(content, 'Gamma'), true);
    assert.equal(findTextInPdfContent(content, 'Signed'), true);
  });

  it('renders adjacent vision table rows in one flow without forced page breaks', () => {
    const tableId = 'visionTable';
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        [tableId]: {
          type: 'table',
          name: 'Visual acuity',
          label: 'Visual acuity',
          columns: [
            { key: 'vis', label: 'vis' },
            { key: 'sph', label: 'Sph' },
          ],
          rows: [{ key: 'od', label: 'OD' }, { key: 'os', label: 'OS' }],
          cellType: 'choice',
        },
        exam_notes: { type: 'text', name: 'Notes', label: 'Notes' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            repeatable: true,
            segments: [{ type: 'field', id: 'complaints' }],
            fieldValues: { complaints: [] },
          },
        },
        {
          type: 'visionTable',
          data: { fieldId: tableId, cells: {} },
        },
        {
          type: 'documentSection',
          data: {
            name: 'Examination',
            label: 'Examination',
            segments: [{ type: 'field', id: 'exam_notes' }],
            fieldValues: { exam_notes: '' },
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: { Complaints: ['Tearing'] },
        Examination: { Notes: 'OK' },
      },
    });

    for (const [rowKey, vis] of [['od', '0.8'], ['os', '0.9']]) {
      doc.blocks[1].data.cells[cellFieldId(tableId, rowKey, 'vis')] = vis;
    }

    const content = renderDocumentToPdfContent(doc, {
      resolveFontName: (name: any) => name ?? 'Roboto',
      defaultFont: 'Roboto',
      fieldValueStyle: {},
    });

    assert.equal(collectPageBreaks(content), 0);
    assert.equal(findTextInPdfContent(content, 'Anamnesis'), false);
    assert.equal(findTextInPdfContent(content, '0.8'), true);
    assert.equal(findTextInPdfContent(content, '0.9'), true);
    assert.equal(findTextInPdfContent(content, 'OK'), true);
  });

  it('paginates a multi-row table naturally without forced page breaks', () => {
    const tableId = 'untitled_results';
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        [tableId]: {
          type: 'table',
          name: 'Results',
          label: 'Results',
          columns: [{ key: 'col1', label: 'Column 1' }],
          rows: [{ key: 'row1', label: '' }],
          cellType: 'text',
        },
        exam_notes: { type: 'text', name: 'Notes', label: 'Notes' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            repeatable: true,
            segments: [
              { type: 'text', content: 'Complaints: ' },
              { type: 'field', id: 'complaints' },
            ],
            fieldValues: { complaints: [] },
          },
        },
        {
          type: 'documentSection',
          data: {
            name: 'Untitled',
            label: 'Untitled section',
            segments: [{ type: 'table', id: tableId, rows: [{ key: 'row1', label: '' }] }],
            fieldValues: {},
          },
        },
        {
          type: 'documentSection',
          data: {
            name: 'Examination',
            label: 'Examination',
            segments: [{ type: 'field', id: 'exam_notes' }],
            fieldValues: { exam_notes: '' },
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: { Complaints: ['Tearing'] },
        Untitled: {
          Results: [{ col1: 'row-alpha' }, { col1: 'row-beta' }],
        },
        Examination: { Notes: 'OK' },
      },
    });

    const content = renderDocumentToPdfContent(doc, {
      resolveFontName: (name: any) => name ?? 'Roboto',
      defaultFont: 'Roboto',
      fieldValueStyle: {},
    });

    assert.equal(collectPageBreaks(content), 0);
    assert.equal(findTextInPdfContent(content, 'Anamnesis'), false);
    assert.equal(findTextInPdfContent(content, 'Tearing'), false);
    assert.equal(findTextInPdfContent(content, 'row-alpha'), true);
    assert.equal(findTextInPdfContent(content, 'row-beta'), true);
    assert.equal(findTextInPdfContent(content, 'OK'), true);
  });

  it('renders repeatable inline table chunks with section title in the page header', () => {
    const tableId = 'items_table';
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        [tableId]: {
          type: 'table',
          name: 'Results',
          label: 'Results',
          columns: [
            { key: 'col1', label: 'Column 1' },
            { key: 'col2', label: 'Column 2' },
          ],
          cellType: 'text',
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'items',
            label: 'items',
            repeatable: true,
            segments: [{ type: 'table', id: tableId, rows: [{ key: 'row1', label: '' }] }],
            fieldValues: {
              [cellFieldId(tableId, 'row1', 'col1')]: '111',
              [cellFieldId(tableId, 'row1', 'col2')]: 'aaa',
              [cellFieldId(tableId, 'row2', 'col1')]: '222',
              [cellFieldId(tableId, 'row2', 'col2')]: 'bbb',
            },
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        items: {
          Results: [
            { col1: '111', col2: 'aaa' },
            { col1: '222', col2: 'bbb' },
          ],
        },
      },
    });

    const content = renderDocumentToPdfContent(doc, defaultRenderOptions);
    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);

    assert.equal(collectPageBreaks(content), 0);
    assert.ok(headerContainsText(docDefinition, 'items'));
    const tables = findAllPdfTables(content);
    assert.equal(tables.length, 1);
    assert.equal(tables[0].table.headerRows, 1);
    assert.equal(tables[0].table.body[0][0].text, 'Column 1');
    assert.equal(tables[0].table.body.length, 3);
  });

  it('renders a long repeatable inline table as one pdfmake table in page header mode', () => {
    const tableId = 'items_table';
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      pageSetup: { format: 'a4', margin: 120 },
      fieldSchemas: {
        [tableId]: {
          type: 'table',
          name: 'Results',
          label: 'Results',
          columns: [{ key: 'col1', label: 'Column 1' }],
          cellType: 'text',
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'items',
            label: 'items',
            repeatable: true,
            segments: [{ type: 'table', id: tableId, rows: [{ key: 'row1', label: '' }] }],
            fieldValues: Object.fromEntries(
              Array.from({ length: 12 }, (_, index) => [
                cellFieldId(tableId, `row${index + 1}`, 'col1'),
                `value-${index + 1}`,
              ]),
            ),
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        items: {
          Results: Array.from({ length: 12 }, (_, index) => ({
            col1: `value-${index + 1}`,
          })),
        },
      },
    });

    const content = renderDocumentToPdfContent(doc, defaultRenderOptions);

    const tables = findAllPdfTables(content);
    assert.equal(tables.length, 1);
    assert.equal(tables[0].table.headerRows, 1);
    assert.equal(tables[0].table.body.length, 13);
    assert.equal(collectPageBreaks(content), 0);
  });

  it('renders an adjacent items table after prior sections in page header mode', () => {
    const tableId = 'items_table';
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        [tableId]: {
          type: 'table',
          name: 'Results',
          label: 'Results',
          columns: [{ key: 'col1', label: 'Column 1' }],
          cellType: 'text',
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            segments: [
              { type: 'text', content: 'Complaints: ' },
              { type: 'field', id: 'complaints' },
            ],
            fieldValues: { complaints: ['Tearing'] },
          },
        },
        {
          type: 'documentSection',
          data: {
            name: 'items',
            label: 'items',
            repeatable: true,
            segments: [{ type: 'table', id: tableId, rows: [{ key: 'row1', label: '' }] }],
            fieldValues: Object.fromEntries(
              Array.from({ length: 24 }, (_, index) => [
                cellFieldId(tableId, `row${index + 1}`, 'col1'),
                `value-${index + 1}`,
              ]),
            ),
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: { Complaints: ['Tearing'] },
        items: {
          Results: Array.from({ length: 24 }, (_, index) => ({
            col1: `value-${index + 1}`,
          })),
        },
      },
    });

    const content = renderDocumentToPdfContent(doc, defaultRenderOptions);

    const tables = findAllPdfTables(content);
    assert.equal(tables.length, 1);
    assert.equal(tables[0].table.headerRows, 1);
    assert.equal(tables[0].table.body[0][0].text, 'Column 1');
    assert.equal(tables[0].table.body.length, 25);
  });

  it('puts repeatable section content in the page header and table chunks in the body', () => {
    const tableId = 'items_table';
    const rowCount = 24;
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        lifeAnamnesis: { type: 'tree', name: 'Life history', label: 'Life history' },
        [tableId]: {
          type: 'table',
          name: 'Results',
          label: 'Results',
          columns: [
            { key: 'col1', label: 'Column 1' },
            { key: 'col2', label: 'Column 2' },
          ],
          cellType: 'text',
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            repeatable: true,
            segments: [
              { type: 'text', content: 'Complaints: ' },
              { type: 'field', id: 'complaints' },
              { type: 'text', content: '.\nLife history: ' },
              { type: 'field', id: 'lifeAnamnesis' },
              { type: 'text', content: '.' },
            ],
            fieldValues: {
              complaints: ['Tearing'],
              lifeAnamnesis: ['Unremarkable'],
            },
          },
        },
        {
          type: 'documentSection',
          data: {
            name: 'items',
            label: 'Items',
            segments: [{ type: 'table', id: tableId, rows: [{ key: 'row1', label: '' }] }],
            fieldValues: Object.fromEntries(
              Array.from({ length: rowCount }, (_, index) => [
                cellFieldId(tableId, `row${index + 1}`, 'col1'),
                `value-${index + 1}`,
              ]),
            ),
          },
        },
        {
          type: 'documentSection',
          data: {
            name: 'Diagnosis',
            label: 'Diagnosis',
            segments: [{ type: 'text', content: 'Diagnosis note' }],
            fieldValues: {},
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: {
          Complaints: ['Tearing'],
          'Life history': ['Unremarkable'],
        },
        items: {
          Results: Array.from({ length: rowCount }, (_, index) => ({
            col1: `value-${index + 1}`,
          })),
        },
        Diagnosis: {},
      },
    });

    const content = renderDocumentToPdfContent(doc, defaultRenderOptions);
    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);

    assert.ok(headerContainsText(docDefinition, 'Anamnesis'));
    assert.ok(headerContainsText(docDefinition, 'Tearing'));
    assert.ok(headerContainsText(docDefinition, 'Unremarkable'));
    assert.ok(headerContainsText(docDefinition, 'Complaints:'));
    assert.ok(headerContainsText(docDefinition, 'Life history:'));

    const tables = findAllPdfTables(content);
    assert.equal(tables.length, 1);
    assert.equal(tables[0].table.headerRows, 1);
    assert.equal(tables[0].table.body[0][0].text, 'Column 1');
    assert.equal(tables[0].table.body.length, rowCount + 1);
    assert.equal(findTextInPdfContent(content, 'Items'), true);
    assert.equal(collectPageBreaks(content), 0);

    assert.equal(findTextInPdfContent(content, 'Diagnosis note'), true);

    const standaloneItemsSections = content.filter((node: any) => {
      if (!Array.isArray(node.stack)) return false;
      if (node.unbreakable || node.pageBreak === 'before') return false;
      const headers = node.stack.filter((child: any) => child?.style === 'sectionHeader');
      return headers.length === 1 && headers[0]?.text === 'Items';
    });
    assert.equal(standaloneItemsSections.length, 0);
  });

  it('reserves enough header height for long wrapped Anamnesis prose', () => {
    const tableId = 'items_table';
    const longComplaints = [
      'Vision disturbance decreased acuity',
      'Tearing',
      'Redness JUST test , no more.',
    ];
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        lifeAnamnesis: { type: 'tree', name: 'Life history', label: 'Life history' },
        [tableId]: {
          type: 'table',
          name: 'Results',
          label: 'Results',
          columns: [
            { key: 'col1', label: 'Column 1' },
            { key: 'col2', label: 'Column 2' },
          ],
          cellType: 'text',
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            repeatable: true,
            segments: [
              { type: 'text', content: 'Complaints: ' },
              { type: 'field', id: 'complaints' },
              { type: 'text', content: '.\nLife history: ' },
              { type: 'field', id: 'lifeAnamnesis' },
              { type: 'text', content: '.' },
            ],
            fieldValues: {
              complaints: longComplaints,
              lifeAnamnesis: ['Chronic conditions diabetes mellitus', 'Unremarkable'],
            },
          },
        },
        {
          type: 'documentSection',
          data: {
            name: 'items',
            label: 'Items',
            segments: [{ type: 'table', id: tableId, rows: [{ key: 'row1', label: '' }] }],
            fieldValues: {},
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: {
          Complaints: longComplaints,
          'Life history': ['Chronic conditions diabetes mellitus', 'Unremarkable'],
        },
        items: { Results: [{ col1: '111' }] },
      },
    });

    const renderOptions = { ...defaultRenderOptions, pageSetup: { format: 'a4', margin: 15 } };
    const repeatableHeader = buildRepeatableSectionPageHeader(doc, renderOptions);
    assert.ok(repeatableHeader);
    assert.equal(findHeaderBodyBlocks(repeatableHeader.stack).length, 1);

    const pageSetup = {
      format: 'a4',
      margin: 15,
      header: { height: repeatableHeader.heightMm, fromRepeatableSection: true },
    };
    const estimatedPt = estimatePdfContentHeightPt(repeatableHeader.stack, pageSetup);
    assert.ok(estimatedPt <= mmToPt(repeatableHeader.heightMm));
    assert.equal(
      repeatableHeader.heightPt,
      computeRepeatableHeaderBandHeightPt(repeatableHeader.stack, pageSetup),
    );

    const { docDefinition } = renderDocumentToPdfDefinition(doc, renderOptions);
    assert.ok(headerContainsText(docDefinition, 'Life history:'));
    assert.ok(headerContainsText(docDefinition, 'Chronic conditions diabetes mellitus'));
    assert.ok(headerContainsText(docDefinition, 'Unremarkable'));
  });

  it('reserves header height for trailing prose lines like 123 and 456', () => {
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        lifeAnamnesis: { type: 'tree', name: 'Life history', label: 'Life history' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            repeatable: true,
            segments: [
              { type: 'text', content: 'Complaints: ' },
              { type: 'field', id: 'complaints' },
              { type: 'text', content: '.\nLife history: ' },
              { type: 'field', id: 'lifeAnamnesis' },
              { type: 'text', content: '.\n123\n456' },
            ],
            fieldValues: {
              complaints: ['Tearing'],
              lifeAnamnesis: ['Unremarkable'],
            },
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: {
          Complaints: ['Tearing'],
          'Life history': ['Unremarkable'],
        },
      },
    });

    const renderOptions = { ...defaultRenderOptions, pageSetup: { format: 'a4', margin: 15 } };
    const repeatableHeader = buildRepeatableSectionPageHeader(doc, renderOptions);
    assert.ok(repeatableHeader);
    const pageSetup = { format: 'a4', margin: 15, header: { height: repeatableHeader.heightMm, fromRepeatableSection: true } };
    const prose = nodeTextJoined(findHeaderBodyBlocks(repeatableHeader.stack)[0]);

    assert.ok(prose.includes('123'));
    assert.ok(prose.includes('456'));
    assert.ok(
      repeatableHeader.heightPt
      > estimatePdfContentHeightPt(repeatableHeader.stack, pageSetup) + HEADER_LINE_SLACK_PT,
    );

    const { docDefinition } = renderDocumentToPdfDefinition(doc, renderOptions);
    assert.ok(headerContainsText(docDefinition, '123'));
    assert.ok(headerContainsText(docDefinition, '456'));
  });

  it('merges label and field value into the same header prose block', () => {
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        lifeAnamnesis: { type: 'tree', name: 'Life history', label: 'Life history' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            repeatable: true,
            segments: [
              { type: 'text', content: 'Complaints: ' },
              { type: 'field', id: 'complaints' },
              { type: 'text', content: '.\nLife history: ' },
              { type: 'field', id: 'lifeAnamnesis' },
              { type: 'text', content: '.' },
            ],
            fieldValues: {
              complaints: ['Tearing', 'Redness'],
              lifeAnamnesis: ['Unremarkable'],
            },
          },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: {
          Complaints: ['Tearing', 'Redness'],
          'Life history': ['Unremarkable'],
        },
      },
    });

    const repeatableHeader = buildRepeatableSectionPageHeader(doc, defaultRenderOptions);
    assert.ok(repeatableHeader);
    const bodyBlocks = findHeaderBodyBlocks(repeatableHeader.stack);
    assert.equal(bodyBlocks.length, 1);

    const prose = nodeTextJoined(bodyBlocks[0]);
    assert.ok(prose.includes('Complaints:'));
    assert.ok(prose.includes('Tearing'));
    assert.ok(prose.includes('Redness'));
    assert.ok(prose.includes('Life history:'));
    assert.ok(prose.includes('Unremarkable'));
  });

  it('merges clinical diagnosis label value and punctuation into one prose block', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {
        clinicalDiagnosis: { type: 'choice', name: 'Clinical diagnosis', label: 'Clinical diagnosis' },
      },
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, {
      ...defaultRenderOptions,
      fieldSchemas: doc.fieldSchemas,
    });
    ctx.fieldValues = { clinicalDiagnosis: 'Conjunctivitis' };

    const blocks = renderSegmentsToPdfContent([
      { type: 'text', content: '.\nClinical diagnosis: ' },
      { type: 'field', id: 'clinicalDiagnosis' },
      { type: 'text', content: '.' },
    ], ctx);

    assert.equal(blocks.length, 1);
    assert.equal(nodeTextJoined(blocks[0]), '.\nClinical diagnosis: Conjunctivitis.');
    const fieldPart = blocks[0].text.find(
      (part: any) => typeof part === 'object' && String(part.text ?? '').includes('Conjunctivitis'),
    );
    assert.equal(fieldPart?.decoration, undefined);
    assert.equal(fieldPart?.decorationColor, undefined);
    const labelPart = blocks[0].text.find(
      (part: any) => typeof part === 'object' && String(part.text ?? '').includes('Clinical diagnosis'),
    );
    assert.equal(labelPart?.font, fieldPart?.font);
    assert.equal(labelPart?.font, 'Roboto');
  });

  it('does not apply fieldHighlight underline decoration in PDF export', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      pageSetup: { fieldHighlight: { color: '#7c3aed' } },
      fieldSchemas: {
        clinicalDiagnosis: { type: 'choice', name: 'Clinical diagnosis', label: 'Clinical diagnosis' },
      },
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, defaultRenderOptions);
    ctx.fieldValues = { clinicalDiagnosis: 'Conjunctivitis' };

    const blocks = renderSegmentsToPdfContent([
      { type: 'field', id: 'clinicalDiagnosis' },
    ], ctx);

    const fieldPart = blocks[0].text.find(
      (part: any) => typeof part === 'object' && String(part.text ?? '').includes('Conjunctivitis'),
    );
    assert.equal(fieldPart?.decoration, undefined);
    assert.equal(fieldPart?.decorationColor, undefined);
  });

  it('renders child field segments as nested repeater PDF content', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {
        addressField: {
          type: 'child',
          label: 'address',
          name: 'address',
          fieldSchemas: {},
          template: {
            fieldSchemas: {
              city: { type: 'text', name: 'City', label: 'City' },
              address: { type: 'text', name: 'Address', label: 'Address' },
            },
            blocks: [
              {
                type: 'documentSection',
                data: {
                  label: '',
                  segments: [
                    { type: 'field', id: 'city' },
                    { type: 'field', id: 'address' },
                  ],
                  fieldValues: {},
                },
              },
            ],
          },
        },
      },
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, defaultRenderOptions);
    ctx.fieldValues = {
      addressField: { city: 'milan', address: 'via per arogno 4' },
    };

    const blocks = renderSegmentsToPdfContent([
      { type: 'child', id: 'addressField' },
    ], ctx);

    assert.ok(blocks.length >= 1);
    const text = blocks.map((node) => nodeTextJoined(node)).join('\n');
    assert.match(text, /address:/);
    assert.match(text, /milan/);
    assert.match(text, /via per arogno 4/);
  });

  it('omits empty child field segments when hideEmptyValues is true', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {
        addressField: {
          type: 'child',
          label: 'address',
          name: 'address',
          fieldSchemas: {},
          template: {
            fieldSchemas: {
              city: { type: 'text', name: 'City', label: 'City' },
            },
            blocks: [
              {
                type: 'documentSection',
                data: {
                  label: '',
                  segments: [{ type: 'field', id: 'city' }],
                  fieldValues: {},
                },
              },
            ],
          },
        },
      },
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, { ...defaultRenderOptions, hideEmptyValues: true });
    ctx.fieldValues = { addressField: {} };

    const blocks = renderSegmentsToPdfContent([
      { type: 'field', id: 'addressField' },
    ], ctx);

    assert.equal(blocks.length, 0);
  });

  it('omits section header nodes when section label is empty', () => {
    assert.equal(buildRepeatableSectionTitleNode(''), null);
    assert.equal(buildRepeatableSectionTitleNode('   '), null);

    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {},
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: '',
            segments: [{ type: 'text', content: 'Section body only.' }],
            fieldValues: {},
          },
        },
      ],
    };

    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);
    const def = docDefinition as any;
    const headers = collectNodesWithStyle(def.content, 'sectionHeader');
    assert.equal(headers.length, 0);
    assert.ok(chunkContainsText({ stack: def.content }, 'Section body only.'));
  });

  it('omits section header nodes when hideTitleInPreview is true', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {},
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Order Details',
            hideTitleInPreview: true,
            segments: [{ type: 'text', content: 'GoldenDent' }],
            fieldValues: {},
          },
        },
        {
          type: 'documentSection',
          data: {
            label: 'Addresses',
            hideTitleInPreview: false,
            segments: [{ type: 'text', content: 'Payment Address' }],
            fieldValues: {},
          },
        },
      ],
    };

    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);
    const titleHeaders = collectNodesWithStyle((docDefinition as any).content, 'sectionHeader');
    assert.deepEqual(
      titleHeaders.map((node: any) => node.text),
      ['Addresses'],
    );
    assert.ok(chunkContainsText({ stack: (docDefinition as any).content }, 'GoldenDent'));
  });

  it('omits section header nodes when hideTitleInPreview is the string true', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {},
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Header',
            hideTitleInPreview: 'true',
            segments: [{ type: 'text', content: 'Invoice body' }],
            fieldValues: {},
          },
        },
      ],
    };

    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);
    const titleHeaders = collectNodesWithStyle((docDefinition as any).content, 'sectionHeader');
    assert.equal(titleHeaders.length, 0);
    assert.ok(chunkContainsText({ stack: (docDefinition as any).content }, 'Invoice body'));
  });

  it('formats date fields with the default display format instead of ISO', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {
        order_date: { type: 'date', label: 'Date', name: 'Date', dateFormat: 'dd/mm/yyyy' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Header',
            hideTitleInPreview: true,
            segments: [{ type: 'field', id: 'order_date' }],
            fieldValues: { order_date: '2026-08-19' },
          },
        },
      ],
    };

    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);
    assert.ok(chunkContainsText({ stack: (docDefinition as any).content }, '19/08/2026'));
    assert.equal(chunkContainsText({ stack: (docDefinition as any).content }, '2026-08-19'), false);
  });

  it('keeps newline characters inline within header prose blocks', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {},
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, defaultRenderOptions);
    const blocks = renderSegmentsToPdfProseBlocks([
      { type: 'text', content: 'Line one.\nLine two.' },
    ], ctx);

    assert.equal(blocks.length, 1);
    assert.equal(nodeTextJoined(blocks[0]), 'Line one.\nLine two.');
    const textParts = /** @type {Array<string | Record<string, unknown>>} */ (blocks[0].text);
    assert.ok(textParts.some((part: any) => {
      const text = typeof part === 'string' ? part : String(part.text ?? '');
      return text.includes('\n');
    }));
    assert.ok(!textParts.some((part: any) => typeof part === 'object' && part.lineBreak === true));
  });

  it('renders mammology plain-content row separators in PDF prose blocks', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {
        statusLocalis: { type: 'tree', name: 'ST.LOCALIS', label: 'ST.LOCALIS' },
        focalPalpation: { type: 'tree', name: 'Focal palpation', label: 'Вогнещевої патології пальпаторно' },
      },
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, defaultRenderOptions);
    ctx.fieldValues = { statusLocalis: ['дольчата'], focalPalpation: ['до 1 см'] };
    const blocks = renderSegmentsToPdfProseBlocks([
      { type: 'text', content: 'ST.LOCALIS: ' },
      { type: 'field', id: 'statusLocalis' },
      { type: 'text', content: '.\nВогнещевої патології пальпаторно: ' },
      { type: 'field', id: 'focalPalpation' },
    ], ctx);

    assert.equal(blocks.length, 1);
    const prose = nodeTextJoined(blocks[0]);
    assert.doesNotMatch(prose, /дольчата\.Вогнещевої/);
    assert.match(prose, /ST\.LOCALIS:/);
    assert.match(prose, /дольчата/);
    assert.match(prose, /Вогнещевої патології пальпаторно:/);

    const textParts = /** @type {Array<string | Record<string, unknown>>} */ (blocks[0].text);
    assert.ok(textParts.some((part: any) => {
      const text = typeof part === 'string' ? part : String(part.text ?? '');
      return text.includes('\n');
    }));
    assertAllPartsUseFont(textParts);
  });

  it('exports mammology section with inline font on title and prose labels', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {
        statusLocalis: { type: 'tree', name: 'ST.LOCALIS', label: 'ST.LOCALIS' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Огляд',
            segments: [
              { type: 'text', content: 'ST.LOCALIS: ' },
              { type: 'field', id: 'statusLocalis' },
            ],
            fieldValues: { statusLocalis: ['дольчата'] },
          },
        },
      ],
    };

    const { docDefinition } = renderDocumentToPdfDefinition(doc, {});
    const def = docDefinition as any;
    assert.equal(def.defaultStyle.font, 'Roboto');

    const sectionStack = def.content[0].stack as any[];
    assert.equal(sectionStack[0].font, 'Roboto');
    assert.equal(sectionStack[0].bold, true);

    const proseParts = sectionStack[1].text as any[];
    assertAllPartsUseFont(proseParts);
    const labelPart = proseParts.find((part: any) => String(part.text ?? '').includes('ST.LOCALIS'));
    const fieldPart = proseParts.find((part: any) => String(part.text ?? '').includes('дольчата'));
    assert.equal(labelPart?.font, fieldPart?.font);
  });

  it('renders mammology row separators and bold labels in PDF prose blocks', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {},
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, defaultRenderOptions);
    ctx.fieldValues = { statusLocalis: 'дольчата', focalPalpation: 'до 1 см' };
    const blocks = renderSegmentsToPdfProseBlocks([
      { type: 'text', html: '<b>ST.LOCALIS: </b>' },
      { type: 'field', id: 'statusLocalis' },
      { type: 'text', html: '<b>.\nВогнещевої патології пальпаторно: </b>' },
      { type: 'field', id: 'focalPalpation' },
    ], ctx);

    assert.equal(blocks.length, 1);
    const prose = nodeTextJoined(blocks[0]);
    assert.doesNotMatch(prose, /дольчата\.Вогнещевої/);
    assert.match(prose, /ST\.LOCALIS:/);
    assert.match(prose, /дольчата/);
    assert.match(prose, /Вогнещевої патології пальпаторно:/);

    const textParts = /** @type {Array<string | Record<string, unknown>>} */ (blocks[0].text);
    assert.ok(textParts.some((part: any) => typeof part === 'object' && part.bold === true));
    assert.ok(textParts.some((part: any) => typeof part === 'object' && part.bold === false && String(part.text ?? '').includes('дольчата')));
    assert.ok(textParts.some((part: any) => typeof part === 'object' && part.bold === false && String(part.text ?? '').includes('до 1 см')));
  });

  it('stampExplicitPdfBold leaves unmixed paragraphs unchanged', () => {
    const parts = ['plain text', { text: 'more text', fontSize: 15 }];
    assert.deepEqual(stampExplicitPdfBold(parts), parts);
  });

  it('stampExplicitPdfBold sets bold:false on non-bold parts in mixed paragraphs', () => {
    const stamped = stampExplicitPdfBold([
      { text: 'Label: ', bold: true },
      'value text',
    ]);
    assert.equal(stamped[0].bold, true);
    assert.equal(stamped[1].bold, false);
    assert.equal(stamped[1].text, 'value text');
  });

  it('ensurePdfPartFonts stamps font on string fragments after bold stamping', () => {
    const stamped = finalizePdfInlineParts([
      { text: 'Label: ', bold: true, font: 'dejavu' },
      'value text',
    ], { font: 'dejavu' });
    assert.equal(stamped[1].font, 'dejavu');
    assert.equal(stamped[1].bold, false);
  });

  it('buildPdfSectionTitleNode inlines section header font', () => {
    const node = buildPdfSectionTitleNode('Огляд', { font: 'dejavu', bold: true });
    assert.equal(node?.font, 'dejavu');
    assert.equal(node?.bold, true);
    assert.equal(node?.style, 'sectionHeader');
    assert.deepEqual(node?.margin, [0, 0, 0, 6]);
  });

  it('static bold labels and field values share the same font in mixed prose', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {
        statusLocalis: { type: 'tree', name: 'ST.LOCALIS', label: 'ST.LOCALIS' },
      },
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, defaultRenderOptions);
    ctx.fieldValues = { statusLocalis: ['дольчата'] };

    const blocks = renderSegmentsToPdfProseBlocks([
      { type: 'text', html: '<b>ST.LOCALIS: </b>' },
      { type: 'field', id: 'statusLocalis' },
    ], ctx);

    assert.equal(blocks.length, 1);
    const textParts = /** @type {Array<Record<string, unknown>>} */ (blocks[0].text);
    const labelPart = textParts.find((part: any) => String(part.text ?? '').includes('ST.LOCALIS'));
    const fieldPart = textParts.find((part: any) => String(part.text ?? '').includes('дольчата'));
    assert.equal(labelPart?.font, 'Roboto');
    assert.equal(fieldPart?.font, 'Roboto');
    assert.equal(labelPart?.font, fieldPart?.font);
  });

  it('keeps intentional bold on field values in mixed prose paragraphs', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {
        statusLocalis: { type: 'tree', name: 'ST.LOCALIS', label: 'ST.LOCALIS' },
        diagnosis: {
          type: 'list',
          name: 'Diagnosis',
          label: 'ДІАГНОЗ',
          displayStyle: { fontWeight: 'bold' },
        },
      },
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, defaultRenderOptions);
    ctx.fieldValues = { statusLocalis: ['дольчата'], diagnosis: ['Мастопатія'] };
    const blocks = renderSegmentsToPdfProseBlocks([
      { type: 'text', html: '<b>ST.LOCALIS: </b>' },
      { type: 'field', id: 'statusLocalis' },
      { type: 'text', html: '<b>.\nДІАГНОЗ: </b>' },
      { type: 'field', id: 'diagnosis' },
    ], ctx);

    assert.equal(blocks.length, 1);
    const textParts = /** @type {Array<Record<string, unknown>>} */ (blocks[0].text);
    assert.ok(textParts.some((part: any) => part.bold === true && String(part.text ?? '').includes('ST.LOCALIS')));
    assert.ok(textParts.some((part: any) => part.bold === false && String(part.text ?? '').includes('дольчата')));
    assert.ok(textParts.some((part: any) => part.bold === true && String(part.text ?? '').includes('Мастопатія')));
  });

  it('keeps bold styling on html row separators with embedded newlines', () => {
    const blocks = htmlToPdfBlocks('<b>.\nLabel: </b>');
    assert.equal(blocks.length, 1);
    const parts = blocks[0].parts;
    assert.equal(parts.length, 1);
    assert.equal(parts[0].bold, true);
    assert.match(String(parts[0].text ?? ''), /\.\nLabel:/);
  });

  it('applies segment alignment to centered h2 html blocks', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {},
      blocks: [],
    };
    const ctx = createPdfRenderContext(doc, defaultRenderOptions);
    const blocks = renderSegmentsToPdfProseBlocks([
      { type: 'text', html: '<h2>Рекомендовано</h2>', align: 'center' },
    ], ctx);

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].alignment, 'center');
    assert.equal(blocks[0].text[0].fontSize, 16.2);
    assert.match(nodeTextJoined(blocks[0]), /Рекомендовано/);
  });

  it('centers h2 inside aligned html wrapper', () => {
    const blocks = htmlToPdfBlocks(
      '<div class="document-align document-align--center" style="text-align: center"><h2>Рекомендовано</h2></div>',
    );
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].alignment, 'center');
    assert.match(nodeTextJoined({ text: blocks[0].parts }), /Рекомендовано/);
  });

  it('treats inline html as prose parts and block html as separate nodes', () => {
    assert.equal(isBlockLevelHtml('<b>Label: </b>'), false);
    assert.equal(isBlockLevelHtml('<h2>Title</h2>'), true);
  });

  it('converts plain text newlines to pdfmake line breaks', () => {
    const parts = plainTextToPdfText('Line one.\nLine two.');
    assert.deepEqual(parts, ['Line one.\nLine two.']);
  });

  it('converts html newlines to br before pdf block parsing', () => {
    assert.equal(plainTextNewlinesToBrHtml('<b>.\nLabel: </b>'), '<b>.<br>Label: </b>');
    const blocks = htmlToPdfBlocks('<b>.\nLabel: </b>');
    assert.equal(blocks.length, 1);
    assert.match(nodeTextJoined(blocks[0]), /\.\s*Label:/);
    assert.doesNotMatch(nodeTextJoined(blocks[0]), /\.Label:/);
    assert.equal(blocks[0].parts.length, 1);
    assert.equal(blocks[0].parts[0].bold, true);
    assert.match(String(blocks[0].parts[0].text ?? ''), /\n/);
  });

  it('paginates an adjacent vision table with repeatable section content in the page header', () => {
    const tableId = 'visionTable';
    const template = {
      kind: 'template',
      version: 1,
      time: Date.now(),
      pageSetup: { format: 'a4', margin: 120 },
      fieldSchemas: {
        complaints: { type: 'tree', name: 'Complaints', label: 'Complaints' },
        [tableId]: {
          type: 'table',
          name: 'Visual acuity',
          label: 'Visual acuity',
          columns: [
            { key: 'vis', label: 'vis' },
            { key: 'sph', label: 'Sph' },
          ],
          rows: Array.from({ length: 12 }, (_, index) => ({
            key: `row${index + 1}`,
            label: `Row ${index + 1}`,
          })),
          cellType: 'text',
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Anamnesis',
            label: 'Anamnesis',
            repeatable: true,
            segments: [{ type: 'field', id: 'complaints' }],
            fieldValues: { complaints: ['Tearing'] },
          },
        },
        {
          type: 'visionTable',
          data: { fieldId: tableId, cells: {} },
        },
      ],
    };

    const doc = mergeTemplateAndDocument(template, {
      kind: 'field',
      version: 2,
      time: Date.now(),
      sections: {
        Anamnesis: { Complaints: ['Tearing'] },
      },
    });

    for (let index = 0; index < 12; index += 1) {
      doc.blocks[1].data.cells[cellFieldId(tableId, `row${index + 1}`, 'vis')] = `value-${index + 1}`;
    }

    const content = renderDocumentToPdfContent(doc, defaultRenderOptions);
    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);

    assert.ok(headerContainsText(docDefinition, 'Anamnesis'));
    assert.ok(headerContainsText(docDefinition, 'Tearing'));

    const tables = findAllPdfTables(content);
    assert.equal(tables.length, 1);
    assert.equal(tables[0].table.headerRows, 1);
    assert.equal(tables[0].table.body[0][0].text, 'vis');
    assert.equal(tables[0].table.body.length, 13);
    assert.equal(collectPageBreaks(content), 0);
    assert.equal(content.some((node) => node?.table), true);
  });
});

describe('generatePdfFromTemplate', () => {
  it('returns a PDF buffer with text content', async () => {
    const buffer = await generatePdfFromTemplate({
      template: makeTemplate(),
      document: makeDocument(),
      pageSetup: { title: 'Document summary' },
    });

    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 500);
    assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
  });

  it('defaults pageSetup from the template', () => {
    const template = makeTemplate();
    template.pageSetup = { format: 'letter', title: 'Saved title' };
    const { docDefinition } = renderDocumentToPdfDefinition(
      mergeTemplateAndDocument(template, makeDocument()),
      {},
    );
    const def = docDefinition as any;
    assert.equal(def.pageSize, resolvePageSize('letter'));
    assert.equal(def.content[0].text, 'Saved title');
  });
});

describe('generateDocumentPdf', () => {
  it('generates a larger PDF when Cyrillic text is present', async () => {
    const template = makeTemplate();
    template.blocks[0].data.segments.unshift({
      type: 'text',
      content: 'Осмотр: ',
    });
    const doc = mergeTemplateAndDocument(template, makeDocument());
    const buffer = await generateDocumentPdf(doc);
    assert.ok(buffer.length > 500);
    assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
  });

  it('omits hidden section titles from the JSON API renderer', () => {
    const doc = {
      kind: 'document',
      version: 2,
      time: Date.now(),
      fieldSchemas: {},
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Order Details',
            hideTitleInPreview: true,
            segments: [
              { type: 'text', content: 'Date Added: ' },
              { type: 'text', content: '2026-07-10' },
            ],
            fieldValues: {},
          },
        },
        {
          type: 'documentSection',
          data: {
            label: 'Addresses',
            hideTitleInPreview: false,
            segments: [{ type: 'text', content: 'Payment Address' }],
            fieldValues: {},
          },
        },
      ],
    };

    const { docDefinition } = renderDocumentToPdfDefinition(doc, defaultRenderOptions);
    const text = ((docDefinition as any).content ?? [])
      .map((node: any) => nodeTextJoined(node))
      .join('\n');
    const titleHeaders = collectNodesWithStyle((docDefinition as any).content, 'sectionHeader');

    assert.doesNotMatch(text, /Order Details/);
    assert.match(text, /Addresses/);
    assert.match(text, /Payment Address/);
    assert.deepEqual(
      titleHeaders.map((node: any) => node.text),
      ['Addresses'],
    );
  });
});
