// @ts-nocheck
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDocumentValues,
  applySectionInstanceToBlocks,
  buildFieldsExport,
  buildTemplateExport,
  buildDocExport,
  normalizeDocumentValues,
  normalizeImportedDoc,
} from './document-io.js';
import {
  cellFieldId,
  extractRowKeysFromTableValues,
  mergeTableInstanceRows,
} from './field-schemas.js';

const tableId = 'table_test';
const tableSchema = {
  type: 'table',
  name: 'Table',
  label: 'Table',
  columns: [
    { key: 'col1', label: 'Column 1' },
    { key: 'col2', label: 'Column 2' },
  ],
  rows: [
    { key: 'row1', label: 'Row1' },
    { key: 'row2', label: 'Row2' },
  ],
  cellType: 'choice',
  cellItems: [{ id: 'normal', label: 'normal' }],
};

function makeTemplateBlocks(rows = tableSchema.rows) {
  return [
    {
      type: 'documentSection',
      data: {
        label: 'Section',
        segments: [{ type: 'table', id: tableId, rows }],
        fieldValues: {
          [cellFieldId(tableId, 'row1', 'col1')]: '',
          [cellFieldId(tableId, 'row1', 'col2')]: '',
          [cellFieldId(tableId, 'row2', 'col1')]: '',
          [cellFieldId(tableId, 'row2', 'col2')]: '',
        },
      },
    },
  ];
}

function makeFieldSchemas(extraCellIds = []) {
  const schemas = { [tableId]: tableSchema };
  for (const row of tableSchema.rows) {
    for (const col of tableSchema.columns) {
      const id = cellFieldId(tableId, row.key, col.key);
      schemas[id] = {
        type: 'choice',
        label: col.label,
        items: tableSchema.cellItems,
      };
    }
  }
  for (const id of extraCellIds) {
    schemas[id] = schemas[cellFieldId(tableId, 'row1', 'col1')];
  }
  return schemas;
}

describe('extractRowKeysFromTableValues', () => {
  it('discovers row keys from cell value keys', () => {
    const values = {
      [cellFieldId(tableId, 'row1', 'col1')]: 'a',
      [cellFieldId(tableId, 'row3', 'col2')]: 'b',
    };
    const keys = extractRowKeysFromTableValues(tableId, tableSchema, values);
    assert.deepEqual([...keys].sort(), ['row1', 'row3']);
  });
});

describe('mergeTableInstanceRows', () => {
  it('keeps existing order and appends new keys sorted', () => {
    const merged = mergeTableInstanceRows(
      [{ key: 'row1', label: '' }, { key: 'row2', label: '' }],
      new Set(['row3', 'row10']),
      tableSchema,
    );
    assert.deepEqual(
      merged.map((row) => row.key),
      ['row1', 'row2', 'row3', 'row10'],
    );
  });
});

describe('applyDocumentValues', () => {
  it('expands inline table rows and applies extra row values', () => {
    const blocks = makeTemplateBlocks();
    const fieldSchemas = makeFieldSchemas();
    const values = {
      [cellFieldId(tableId, 'row1', 'col1')]: 'normal',
      [cellFieldId(tableId, 'row1', 'col2')]: 'normal',
      [cellFieldId(tableId, 'row2', 'col1')]: 'normal',
      [cellFieldId(tableId, 'row2', 'col2')]: 'normal',
      [cellFieldId(tableId, 'row3', 'col1')]: 'normal 2',
      [cellFieldId(tableId, 'row3', 'col2')]: 'normal 1',
    };

    const result = applyDocumentValues(blocks, values, fieldSchemas);
    const section = result.blocks[0].data;
    const tableSeg = section.segments.find((seg) => seg.type === 'table');

    assert.equal(tableSeg.rows.length, 3);
    assert.equal(section.fieldValues[cellFieldId(tableId, 'row3', 'col1')], 'normal 2');
    assert.equal(section.fieldValues[cellFieldId(tableId, 'row3', 'col2')], 'normal 1');
    assert.ok(result.fieldSchemas[cellFieldId(tableId, 'row3', 'col1')]);
    assert.equal(result.skipped, 0);
    assert.equal(result.applied, 6);
  });

  it('does not duplicate rows already in the template', () => {
    const blocks = makeTemplateBlocks();
    const fieldSchemas = makeFieldSchemas();
    const values = {
      [cellFieldId(tableId, 'row1', 'col1')]: 'a',
      [cellFieldId(tableId, 'row2', 'col2')]: 'b',
    };

    const result = applyDocumentValues(blocks, values, fieldSchemas);
    const tableSeg = result.blocks[0].data.segments.find((seg) => seg.type === 'table');
    assert.equal(tableSeg.rows.length, 2);
  });

  it('skips cell keys for tables not present in the template', () => {
    const blocks = makeTemplateBlocks();
    const fieldSchemas = makeFieldSchemas();
    const values = {
      other_table_row1_col1: 'orphan',
    };

    const result = applyDocumentValues(blocks, values, fieldSchemas);
    assert.equal(result.skipped, 1);
  });

  it('accepts table row array via sections and loads into inline table segment', () => {
    const blocks = makeTemplateBlocks([{ key: 'row1', label: '' }]);
    const fieldSchemas = makeFieldSchemas();
    fieldSchemas[tableId].name = 'Table';
    const values = normalizeDocumentValues(
      { sections: { Section: { Table: [{ col1: 'alpha', col2: 'beta' }] } } },
      blocks,
      fieldSchemas,
    );

    const result = applyDocumentValues(blocks, values, fieldSchemas);
    const section = result.blocks[0].data;
    const tableSeg = section.segments.find((seg) => seg.type === 'table');

    assert.equal(tableSeg.rows.length, 1);
    assert.equal(section.fieldValues[cellFieldId(tableId, 'row1', 'col1')], 'alpha');
    assert.equal(section.fieldValues[cellFieldId(tableId, 'row1', 'col2')], 'beta');
    assert.equal(result.skipped, 0);
  });

  it('replaces prior table rows when applying one row via section instance map', () => {
    const manyRows = Array.from({ length: 5 }, (_, index) => ({
      key: `row${index + 1}`,
      label: '',
    }));
    const blocks = makeTemplateBlocks(manyRows);
    const fieldSchemas = makeFieldSchemas();
    fieldSchemas[tableId].name = 'Table';
    const fieldValues = {};
    for (const row of manyRows) {
      fieldValues[cellFieldId(tableId, row.key, 'col1')] = 'stale';
      fieldValues[cellFieldId(tableId, row.key, 'col2')] = 'stale';
    }
    blocks[0].data.fieldValues = fieldValues;

    const result = applySectionInstanceToBlocks(blocks, fieldSchemas, 0, {
      Table: [{ col1: 'only-a', col2: 'only-b' }],
    });
    const section = result.blocks[0].data;
    const tableSeg = section.segments.find((seg) => seg.type === 'table');

    assert.equal(tableSeg.rows.length, 1);
    assert.equal(section.fieldValues[cellFieldId(tableId, 'row1', 'col1')], 'only-a');
    assert.equal(section.fieldValues[cellFieldId(tableId, 'row1', 'col2')], 'only-b');
    assert.equal(section.fieldValues[cellFieldId(tableId, 'row2', 'col1')], undefined);
  });
});

describe('buildFieldsExport', () => {
  it('emits v2 sections with table row arrays', () => {
    const blocks = makeTemplateBlocks();
    const fieldSchemas = makeFieldSchemas();
    fieldSchemas[tableId].name = 'Table';
    blocks[0].data.fieldValues = {
      [cellFieldId(tableId, 'row1', 'col1')]: 'a',
      [cellFieldId(tableId, 'row1', 'col2')]: 'b',
      [cellFieldId(tableId, 'row2', 'col1')]: 'c',
      [cellFieldId(tableId, 'row2', 'col2')]: 'd',
    };

    const exported = buildFieldsExport({
      time: 1,
      fieldSchemas,
      blocks,
    });

    assert.equal(exported.version, 2);
    assert.equal(exported.kind, 'field');
    assert.deepEqual(exported.sections.Section.Table, [
      { col1: 'a', col2: 'b' },
      { col1: 'c', col2: 'd' },
    ]);
    assert.equal(exported.values, undefined);
  });

  it('filters empty table rows when hideEmptyValues is true', () => {
    const blocks = makeTemplateBlocks();
    const fieldSchemas = makeFieldSchemas();
    fieldSchemas[tableId].name = 'Table';
    blocks[0].data.fieldValues = {
      [cellFieldId(tableId, 'row1', 'col1')]: 'a',
      [cellFieldId(tableId, 'row1', 'col2')]: 'b',
    };

    const exported = buildFieldsExport(
      { time: 1, fieldSchemas, blocks },
      { hideEmptyValues: true },
    );

    assert.deepEqual(exported.sections.Section.Table, [{ col1: 'a', col2: 'b' }]);
  });

  it('includes empty table rows by default in document export', () => {
    const blocks = makeTemplateBlocks();
    const fieldSchemas = makeFieldSchemas();
    fieldSchemas[tableId].name = 'Table';
    blocks[0].data.fieldValues = {
      [cellFieldId(tableId, 'row1', 'col1')]: 'a',
      [cellFieldId(tableId, 'row1', 'col2')]: 'b',
    };

    const exported = buildFieldsExport({ time: 1, fieldSchemas, blocks });

    assert.equal(exported.sections.Section.Table.length, 2);
  });
});

describe('export pruning', () => {
  const usedFieldId = 'mammologyexam_notes';
  const orphanChoiceId = 'choice_mr0oawdv_iqyi4';

  const blocks = [
    {
      type: 'documentSection',
      data: {
        label: 'Section',
        segments: [{ type: 'field', id: usedFieldId }],
        fieldValues: {
          [usedFieldId]: 'Patient note',
          [orphanChoiceId]: 'Option 1',
        },
      },
    },
  ];

  const fieldSchemas = {
    [usedFieldId]: { type: 'text', name: 'Notes', label: 'Notes' },
    [orphanChoiceId]: {
      type: 'choice',
      name: 'Choice',
      label: 'Choice',
      items: [{ id: 'item1', label: 'Option 1' }],
      defaultValue: '',
    },
  };

  const doc = { time: 1, fieldSchemas, blocks };

  it('prunes unused schemas from template export', () => {
    const exported = buildTemplateExport(doc);
    assert.deepEqual(Object.keys(exported.fieldSchemas).sort(), [usedFieldId]);
    assert.deepEqual(Object.keys(exported.blocks[0].data.fieldValues).sort(), [usedFieldId]);
    assert.equal(exported.blocks[0].data.fieldValues[usedFieldId], '');
  });

  it('prunes unused schemas from document export', () => {
    const exported = buildDocExport(doc);
    assert.equal(exported.kind, 'document');
    assert.deepEqual(Object.keys(exported.fieldSchemas).sort(), [usedFieldId]);
    assert.deepEqual(Object.keys(exported.blocks[0].data.fieldValues).sort(), [usedFieldId]);
    assert.equal(exported.blocks[0].data.fieldValues[usedFieldId], 'Patient note');
  });

  it('ignores orphaned values during document export', () => {
    const exported = buildFieldsExport(doc);
    assert.deepEqual(exported.sections.Section, { Notes: 'Patient note' });
    assert.equal(exported.sections.Section[orphanChoiceId], undefined);
  });

  it('keeps table schemas and cell schemas referenced in blocks', () => {
    const tableBlocks = makeTemplateBlocks();
    const tableSchemas = makeFieldSchemas([cellFieldId(tableId, 'row9', 'col1')]);
    const exported = buildTemplateExport({
      time: 1,
      fieldSchemas: tableSchemas,
      blocks: tableBlocks,
    });

    assert.ok(exported.fieldSchemas[tableId]);
    assert.ok(exported.fieldSchemas[cellFieldId(tableId, 'row1', 'col1')]);
    assert.equal(exported.fieldSchemas[cellFieldId(tableId, 'row9', 'col1')], undefined);
  });
});

describe('template pageSetup export/import', () => {
  it('round-trips pageSetup through template export and import', () => {
    const doc = {
      time: 1,
      fieldSchemas: {},
      blocks: [],
      pageSetup: {
        format: 'letter',
        margin: 12,
        title: 'Clinic form',
        protectFieldsInFillMode: true,
        autoAdvanceFillFields: true,
        footer: { showPageNumbers: true },
      },
    };

    const exported = buildTemplateExport(doc);
    assert.equal(exported.pageSetup.format, 'letter');
    assert.equal(exported.pageSetup.margin, 12);
    assert.equal(exported.pageSetup.title, 'Clinic form');
    assert.equal(exported.pageSetup.protectFieldsInFillMode, true);
    assert.equal(exported.pageSetup.autoAdvanceFillFields, true);
    assert.equal(exported.pageSetup.footer.showPageNumbers, true);

    const imported = normalizeImportedDoc(exported);
    assert.deepEqual(imported.pageSetup, exported.pageSetup);
  });

  it('round-trips fieldMapping through template export and import', () => {
    const fieldMapping = {
      kind: 'fieldMapping',
      version: 1,
      rules: [{ section: 'Section', field: 'Notes', sourcePath: '$payload.Notes' }],
      sourceSample: { Notes: 'hello' },
    };
    const doc = {
      time: 1,
      fieldSchemas: {},
      blocks: [],
      fieldMapping,
    };

    const templateExported = buildTemplateExport(doc);
    assert.deepEqual(templateExported.fieldMapping, fieldMapping);
    assert.deepEqual(normalizeImportedDoc(templateExported).fieldMapping, fieldMapping);
  });

  it('omits fieldMapping from template export when absent', () => {
    const doc = { time: 1, fieldSchemas: {}, blocks: [] };
    assert.equal(Object.prototype.hasOwnProperty.call(buildTemplateExport(doc), 'fieldMapping'), false);
  });

  it('strips tree node ids from template export', () => {
    const doc = {
      time: Date.now(),
      fieldSchemas: {
        status: {
          type: 'tree',
          name: 'Status',
          label: 'Status',
          tree: [{ id: 'n_abc123', label: 'OK', children: [{ id: 'n_def456', label: 'Child' }] }],
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Section',
            segments: [{ type: 'field', id: 'status' }],
            fieldValues: { status: [] },
          },
        },
      ],
    };

    const exported = buildTemplateExport(doc);
    assert.deepEqual(exported.fieldSchemas.status.tree, [
      { label: 'OK', children: [{ label: 'Child' }] },
    ]);
  });
});

describe('applyDocumentValues computed fields', () => {
  const amountTableId = 'items_table';
  const totalFieldId = 'items_total';

  const fieldSchemas = {
    [amountTableId]: {
      type: 'table',
      name: 'Items',
      label: 'Items',
      columns: [{ key: 'amount', label: 'Amount' }],
      rows: [{ key: 'row1', label: '' }],
    },
    [totalFieldId]: {
      type: 'computed',
      name: 'Total',
      label: 'Total',
      formula: 'sum({Section.Items.Amount})',
    },
  };

  for (const row of fieldSchemas[amountTableId].rows) {
    for (const col of fieldSchemas[amountTableId].columns) {
      const id = cellFieldId(amountTableId, row.key, col.key);
      fieldSchemas[id] = { type: 'integer', label: col.label };
    }
  }

  const blocks = [
    {
      type: 'documentSection',
      data: {
        label: 'Section',
        segments: [
          { type: 'table', id: amountTableId, rows: [{ key: 'row1', label: '' }] },
          { type: 'field', id: totalFieldId },
        ],
        fieldValues: {
          [cellFieldId(amountTableId, 'row1', 'amount')]: '1',
          [totalFieldId]: '999',
        },
      },
    },
  ];

  it('recalculates computed fields instead of keeping imported stale values', () => {
    fieldSchemas[amountTableId].name = 'Items';
    const values = normalizeDocumentValues(
      {
        sections: {
          Section: {
            Items: [{ amount: '2' }, { amount: '5' }],
            Total: '999',
          },
        },
      },
      blocks,
      fieldSchemas,
    );

    const result = applyDocumentValues(blocks, values, fieldSchemas);
    const section = result.blocks[0].data;

    assert.equal(section.fieldValues[totalFieldId], '7');
  });

  it('recalculates computed fields nested inside columns after mapping', () => {
    fieldSchemas[amountTableId].name = 'Items';
    const columnBlocks = [
      {
        type: 'documentSection',
        data: {
          label: 'Section',
          segments: [
            { type: 'table', id: amountTableId, rows: [{ key: 'row1', label: '' }] },
            {
              type: 'columns',
              columns: [
                [],
                [{ type: 'field', id: totalFieldId }],
              ],
            },
          ],
          fieldValues: {
            [cellFieldId(amountTableId, 'row1', 'amount')]: '1',
            [totalFieldId]: '0',
          },
        },
      },
    ];

    const values = normalizeDocumentValues(
      {
        sections: {
          Section: {
            Items: [{ amount: '1000' }, { amount: '3000' }, { amount: '500' }],
            Total: '0',
          },
        },
      },
      columnBlocks,
      fieldSchemas,
    );

    const result = applyDocumentValues(columnBlocks, values, fieldSchemas);
    assert.equal(result.blocks[0].data.fieldValues[totalFieldId], '4500');
  });

  it('prunes cell data for table rows removed during import', () => {
    fieldSchemas[amountTableId].name = 'Items';
    blocks[0].data.fieldValues[cellFieldId(amountTableId, 'row1', 'amount')] = '1';
    blocks[0].data.fieldValues[cellFieldId(amountTableId, 'row2', 'amount')] = '9';
    blocks[0].data.segments[0].rows = [
      { key: 'row1', label: '' },
      { key: 'row2', label: '' },
    ];
    fieldSchemas[cellFieldId(amountTableId, 'row2', 'amount')] = { type: 'integer', label: 'Amount' };

    const values = normalizeDocumentValues(
      { sections: { Section: { Items: [{ amount: '4' }] } } },
      blocks,
      fieldSchemas,
    );

    const result = applyDocumentValues(blocks, values, fieldSchemas);
    const section = result.blocks[0].data;

    assert.equal(section.fieldValues[cellFieldId(amountTableId, 'row2', 'amount')], undefined);
    assert.equal(result.fieldSchemas[cellFieldId(amountTableId, 'row2', 'amount')], undefined);
    assert.equal(section.fieldValues[totalFieldId], '4');
  });
});
