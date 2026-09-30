import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  labelToFieldKey,
  buildTableColumnsFromLabels,
  syncTableColumnKeyChanges,
  cellFieldId,
  isCellFieldId,
  parseCellFieldId,
  ensureCellSchemasForRows,
  buildRepeaterInstancesFromLabels,
  isSchemaReadonly,
  isTableCellInheritedReadonly,
  isFieldEditableInFillMode,
  convertSchemaType,
  ensureSchemaForFieldProperties,
} from './field-schemas.js';

describe('labelToFieldKey', () => {
  it('slugifies labels into valid keys', () => {
    assert.equal(labelToFieldKey('Visual acuity'), 'visual_acuity');
    assert.equal(labelToFieldKey('IOP'), 'iop');
  });

  it('dedupes keys within usedKeys', () => {
    const used = new Set(['visual_acuity']);
    assert.equal(labelToFieldKey('Visual acuity', used), 'visual_acuity_2');
  });
});

describe('buildTableColumnsFromLabels', () => {
  it('keeps existing keys when labels and names are unchanged', () => {
    const columns = buildTableColumnsFromLabels(
      ['Column 1', 'Column 2'],
      [],
      [
        { key: 'col1', label: 'Column 1', name: 'Column 1' },
        { key: 'col2', label: 'Column 2', name: 'Column 2' },
      ],
      ['Column 1', 'Column 2'],
    );
    assert.deepEqual(columns.map((col) => col.key), ['col1', 'col2']);
  });

  it('slugifies keys from labels when column names are blank', () => {
    const columns = buildTableColumnsFromLabels(['Visus', 'IOP'], [], []);
    assert.deepEqual(columns.map((col) => col.key), ['visus', 'iop']);
    assert.deepEqual(columns.map((col) => col.name), ['Visus', 'IOP']);
  });

  it('uses separate labels and column names for display vs keys', () => {
    const columns = buildTableColumnsFromLabels(
      ['Vis', 'Sph'],
      [],
      [],
      ['Visual acuity', 'Sphere'],
    );
    assert.deepEqual(columns.map((col) => col.label), ['Vis', 'Sph']);
    assert.deepEqual(columns.map((col) => col.key), ['visual_acuity', 'sphere']);
    assert.deepEqual(columns.map((col) => col.name), ['Visual acuity', 'Sphere']);
  });

  it('slugifies keys from column names for non-Latin labels', () => {
    const columns = buildTableColumnsFromLabels(
      ['мета file', 'тест дата'],
      [],
      [],
      ['meta file', 'test date'],
    );
    assert.deepEqual(columns.map((col) => col.key), ['meta_file', 'test_date']);
    assert.deepEqual(columns.map((col) => col.label), ['мета file', 'тест дата']);
    assert.deepEqual(columns.map((col) => col.name), ['meta file', 'test date']);
  });

  it('falls back to label for key generation when column name is blank', () => {
    const columns = buildTableColumnsFromLabels(['Visus'], [], [], ['']);
    assert.equal(columns[0].key, 'visus');
    assert.equal(columns[0].label, 'Visus');
    assert.equal(columns[0].name, 'Visus');
  });

  it('throws on duplicate column names that reuse the same key', () => {
    assert.throws(
      () => buildTableColumnsFromLabels(
        ['A', 'B'],
        [],
        [
          { key: 'visual_acuity', label: 'A', name: 'Visual acuity' },
          { key: 'visual_acuity', label: 'B', name: 'Visual acuity' },
        ],
        ['Visual acuity', 'Visual acuity'],
      ),
      /Duplicate column field ID: visual_acuity/,
    );
  });

  it('stores unitless column widths as percentages', () => {
    const columns = buildTableColumnsFromLabels(
      ['Product', 'Total'],
      ['42', '17%'],
      [],
      ['Product', 'Total'],
    );
    assert.equal(columns[0].width, '42%');
    assert.equal(columns[1].width, '17%');
  });
});

describe('isCellFieldId', () => {
  it('detects table cell field ids', () => {
    const tableId = 'anamnesis_items';
    const fieldSchemas = {
      [tableId]: {
        type: 'table',
        label: 'Table',
        columns: [{ key: 'first', label: 'first col' }],
      },
      [cellFieldId(tableId, 'row1', 'first')]: { type: 'choice', label: 'first col' },
    };
    const cellId = cellFieldId(tableId, 'row1', 'first');
    assert.equal(isCellFieldId(cellId, fieldSchemas), true);
    assert.deepEqual(parseCellFieldId(cellId, fieldSchemas), {
      tableFieldId: tableId,
      rowKey: 'row1',
      colKey: 'first',
    });
    assert.equal(isCellFieldId(tableId, fieldSchemas), false);
  });
});

describe('syncTableColumnKeyChanges', () => {
  it('renames cell schemas and document values when a column key changes', () => {
    const tableId = 'table_test';
    const oldColumns = [
      { key: 'col1', label: 'Column 1' },
      { key: 'col2', label: 'Column 2' },
    ];
    const newColumns = [
      { key: 'visus', label: 'Visus' },
      { key: 'col2', label: 'Column 2' },
    ];
    const oldCellId = cellFieldId(tableId, 'row1', 'col1');
    const newCellId = cellFieldId(tableId, 'row1', 'visus');
    const fieldSchemas = {
      [tableId]: { type: 'table', label: 'Table', columns: newColumns },
      [oldCellId]: { type: 'choice', label: 'Column 1', items: [] },
    };
    const blocks = [
      {
        type: 'documentSection',
        data: {
          fieldValues: {
            [oldCellId]: 'normal',
          },
        },
      },
    ];

    const result = syncTableColumnKeyChanges(
      tableId,
      oldColumns,
      newColumns,
      fieldSchemas,
      blocks,
    );

    assert.ok(result.fieldSchemas[newCellId]);
    assert.equal(result.fieldSchemas[oldCellId], undefined);
    assert.equal(result.blocks[0].data.fieldValues[newCellId], 'normal');
    assert.equal(result.blocks[0].data.fieldValues[oldCellId], undefined);
  });
});

describe('ensureCellSchemasForRows', () => {
  it('clones cell schemas from the previous row when adding rows', () => {
    const tableId = 'examination_table';
    const tableSchema = {
      type: 'table',
      label: 'Table',
      columns: [
        { key: 'visus', label: 'Visus', name: 'Visus' },
        { key: 'iop', label: 'IOP', name: 'IOP' },
      ],
    };
    const row1Cell = cellFieldId(tableId, 'row1', 'visus');
    const fieldSchemas = {
      [tableId]: tableSchema,
      [row1Cell]: {
        type: 'integer',
        label: 'Visus',
        min: 0,
        max: 120,
        suffix: 'mmHg',
        displayStyle: { fontWeight: 'bold' },
      },
    };

    const next = ensureCellSchemasForRows(tableSchema, tableId, fieldSchemas, [
      { key: 'row1', label: '' },
      { key: 'row2', label: '' },
    ]);

    const row2Visus = cellFieldId(tableId, 'row2', 'visus');
    const row2Iop = cellFieldId(tableId, 'row2', 'iop');

    assert.equal(next[row2Visus].type, 'integer');
    assert.equal(next[row2Visus].min, 0);
    assert.equal(next[row2Visus].max, 120);
    assert.equal(next[row2Visus].suffix, 'mmHg');
    assert.equal(next[row2Visus].displayStyle.fontWeight, 'bold');
    assert.equal(next[row2Iop].type, 'text');
  });

  it('resets Child nested table rows to seed when cloning for a new table row', () => {
    const tableId = 'main_table';
    const row1ChildId = cellFieldId(tableId, 'row1', 'column_2');
    const row2ChildId = cellFieldId(tableId, 'row2', 'column_2');
    const nestedTableId = `_repeater_${row1ChildId}_item_table`;
    const tableSchema = {
      type: 'table',
      label: 'main',
      columns: [
        { key: 'column_1', label: 'Column 1' },
        { key: 'column_2', label: 'Column 2' },
      ],
    };
    const fieldSchemas = {
      [tableId]: tableSchema,
      [row1ChildId]: {
        type: 'child',
        label: 'Column 2',
        name: 'Column 2',
        fieldSchemas: {},
        template: {
          fieldSchemas: {
            [nestedTableId]: {
              type: 'table',
              label: 'Table',
              columns: [
                { key: 'id', label: 'id' },
                { key: 'name', label: 'name' },
              ],
              rows: [{ key: 'row1', label: '' }],
            },
            [`${nestedTableId}_row1_id`]: { type: 'text', label: 'id' },
            [`${nestedTableId}_row1_name`]: { type: 'text', label: 'name' },
            [`${nestedTableId}_row2_id`]: { type: 'text', label: 'id' },
            [`${nestedTableId}_row2_name`]: { type: 'text', label: 'name' },
            [`${nestedTableId}_row3_id`]: { type: 'text', label: 'id' },
            [`${nestedTableId}_row3_name`]: { type: 'text', label: 'name' },
          },
          blocks: [
            {
              type: 'documentSection',
              data: {
                label: 'item',
                segments: [
                  {
                    type: 'table',
                    id: nestedTableId,
                    // Polluted: instance rows from previous fill leaked into template.
                    rows: [
                      { key: 'row1', label: '' },
                      { key: 'row2', label: '' },
                      { key: 'row3', label: '' },
                    ],
                  },
                ],
                fieldValues: {},
              },
            },
          ],
        },
      },
    };

    const next = ensureCellSchemasForRows(tableSchema, tableId, fieldSchemas, [
      { key: 'row1', label: '' },
      { key: 'row2', label: '' },
    ]);

    const cloned = next[row2ChildId];
    assert.equal(cloned.type, 'child');
    const clonedTableId = `_repeater_${row2ChildId}_item_table`;
    const tableSeg = cloned.template.blocks[0].data.segments.find((seg) => seg.type === 'table');
    assert.equal(tableSeg.id, clonedTableId);
    assert.deepEqual(
      (tableSeg.rows ?? []).map((row) => row.key),
      ['row1'],
      'new row Child must use template seed rows, not previous instance rows',
    );
    assert.ok(cloned.template.fieldSchemas[`${clonedTableId}_row1_id`]);
    assert.equal(cloned.template.fieldSchemas[`${clonedTableId}_row2_id`], undefined);
    assert.equal(cloned.template.fieldSchemas[`${clonedTableId}_row3_id`], undefined);
  });
});

describe('buildRepeaterInstancesFromLabels', () => {
  it('preserves keys when labels are unchanged', () => {
    const prev = [{ key: 'shipping', label: 'Shipping' }];
    const next = buildRepeaterInstancesFromLabels(['Shipping', 'Billing'], prev);
    assert.equal(next[0].key, 'shipping');
    assert.equal(next[1].label, 'Billing');
  });
});

describe('ensureSchemaForFieldProperties', () => {
  it('returns existing schema unchanged', () => {
    const fieldId = 'note';
    const fieldSchemas = {
      [fieldId]: { type: 'text', label: 'Note', name: 'Note' },
    };
    const result = ensureSchemaForFieldProperties(fieldId, fieldSchemas);
    assert.equal(result.schema, fieldSchemas[fieldId]);
    assert.equal(result.fieldSchemas, fieldSchemas);
  });

  it('materialises a missing table cell schema from table + cell hint', () => {
    const tableId = 'exam_table';
    const cellId = cellFieldId(tableId, 'row1', 'items');
    const tableSchema = {
      type: 'table',
      label: 'Table',
      cellType: 'text',
      columns: [
        { key: 'id', label: 'id' },
        { key: 'items', label: 'items' },
      ],
    };
    const fieldSchemas = { [tableId]: tableSchema };

    const result = ensureSchemaForFieldProperties(cellId, fieldSchemas, {
      tableId,
      rowKey: 'row1',
      colKey: 'items',
      rows: [{ key: 'row1', label: '' }],
    });

    assert.ok(result.schema);
    assert.equal(result.schema.type, 'text');
    assert.equal(result.schema.label, 'items');
    assert.equal(result.fieldSchemas[cellId], result.schema);
    assert.ok(result.fieldSchemas[cellFieldId(tableId, 'row1', 'id')]);
  });

  it('materialises a missing cell schema by parsing the field id', () => {
    const tableId = 'exam_table';
    const cellId = cellFieldId(tableId, 'row2', 'id');
    const tableSchema = {
      type: 'table',
      label: 'Table',
      columns: [
        { key: 'id', label: 'id' },
        { key: 'items', label: 'items' },
      ],
      rows: [{ key: 'row1', label: '' }],
    };
    const fieldSchemas = {
      [tableId]: tableSchema,
      [cellFieldId(tableId, 'row1', 'id')]: { type: 'integer', label: 'id' },
      [cellFieldId(tableId, 'row1', 'items')]: { type: 'child', label: 'items' },
    };

    const result = ensureSchemaForFieldProperties(cellId, fieldSchemas);

    assert.ok(result.schema);
    assert.equal(result.schema.type, 'integer');
    assert.equal(result.schema.label, 'id');
  });
});

describe('readonly schema helpers', () => {
  it('detects readonly schemas', () => {
    assert.equal(isSchemaReadonly({ type: 'text', name: 'a', label: 'A', readonly: true }), true);
    assert.equal(isSchemaReadonly({ type: 'text', name: 'a', label: 'A' }), false);
  });

  it('blocks fill-mode editing for readonly and computed fields', () => {
    assert.equal(isFieldEditableInFillMode({ type: 'text', name: 'a', label: 'A', readonly: true }), false);
    assert.equal(isFieldEditableInFillMode({ type: 'computed', name: 'a', label: 'A', formula: '1' }), false);
    assert.equal(isFieldEditableInFillMode({ type: 'text', name: 'a', label: 'A' }), true);
  });

  it('inherits table readonly for cell fields in fill mode', () => {
    const tableId = 'visual_acuity';
    const cellId = cellFieldId(tableId, 'od', 'sph');
    const fieldSchemas = {
      [tableId]: {
        type: 'table',
        name: 'visual_acuity',
        label: 'Visual acuity',
        readonly: true,
        columns: [{ key: 'sph', label: 'Sph' }],
        rows: [{ key: 'od', label: 'OD' }],
      },
      [cellId]: { type: 'text', name: 'sph', label: 'Sph' },
    };

    assert.equal(isTableCellInheritedReadonly(cellId, fieldSchemas), true);
    assert.equal(
      isFieldEditableInFillMode(fieldSchemas[cellId], { fieldId: cellId, fieldSchemas }),
      false,
    );
    assert.equal(isFieldEditableInFillMode(fieldSchemas[cellId]), true);
  });

  it('preserves readonly when converting schema type', () => {
    const next = convertSchemaType(
      { type: 'text', name: 'note', label: 'Note', readonly: true },
      'integer',
    );
    assert.equal(next.readonly, true);
  });

  it('preserves table hideHeader, hideBorders, and allowAddRows when converting table to table', () => {
    const next = convertSchemaType(
      {
        type: 'table',
        name: 'grid',
        label: 'Grid',
        columns: [{ key: 'col1', label: 'Col1' }],
        hideHeader: true,
        hideBorders: true,
        allowAddRows: true,
      },
      'table',
    );
    assert.equal(next.hideHeader, true);
    assert.equal(next.hideBorders, true);
    assert.equal(next.allowAddRows, true);
  });
});
