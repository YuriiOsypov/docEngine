import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySourcePathDrop,
  buildTableMappingRulesFromSourceDrop,
  mergeMappingRulesIntoSpec,
  sanitizeColumnKey,
  sourcePathLeafKey,
  humanizeFieldKey,
  isArrayMemberSourcePath,
  findTableIdForSourceArrayPath,
  fieldTypeFromSourceType,
} from './source-path-canvas-drop.js';

const SAMPLE = {
  meta: {
    collection: 'visits',
    count: 2,
  },
  status: 'open',
  inactive: false,
  sort: 3,
  project: {
    id: 9,
    name: 'Alpha',
    progress: 0.5,
  },
  records: [
    {
      id: 1,
      name: 'Alice',
      note: 'ok',
      total: 10,
      blocks: [{ x: 1 }],
    },
    {
      id: 2,
      name: 'Bob',
      note: 'fine',
      total: 20,
      blocks: [],
    },
  ],
};

describe('source-path-canvas-drop helpers', () => {
  it('sourcePathLeafKey extracts the last segment', () => {
    assert.equal(sourcePathLeafKey('$payload.records.name'), 'name');
    assert.equal(sourcePathLeafKey('$payload.records'), 'records');
    assert.equal(sourcePathLeafKey('$payload["Odd Key"]'), 'Odd Key');
  });

  it('sanitizeColumnKey normalizes keys', () => {
    assert.equal(sanitizeColumnKey('name'), 'name');
    assert.equal(sanitizeColumnKey('Odd Key!'), 'Odd_Key');
  });

  it('humanizeFieldKey cleans Salesforce API names', () => {
    assert.equal(humanizeFieldKey('AccountNumber'), 'Account Number');
    assert.equal(humanizeFieldKey('Account_Number2__c'), 'Account Number2');
    assert.equal(humanizeFieldKey('AcctSeed__Accounting_Active__c'), 'Accounting Active');
  });

  it('fieldTypeFromSourceType maps payload types', () => {
    assert.equal(fieldTypeFromSourceType('string'), 'text');
    assert.equal(fieldTypeFromSourceType('number'), 'number');
    assert.equal(fieldTypeFromSourceType('boolean'), 'logical');
  });

  it('detects array-member paths vs object/scalar paths', () => {
    assert.equal(isArrayMemberSourcePath('$payload.records.name', SAMPLE), true);
    assert.equal(isArrayMemberSourcePath('$payload.status', SAMPLE), false);
    assert.equal(isArrayMemberSourcePath('$payload.project.name', SAMPLE), false);
    assert.equal(isArrayMemberSourcePath('$payload.records', SAMPLE), false);
  });

  it('classifies nested values.amount as a table column (not a scalar field)', () => {
    const sample = {
      sections: {
        items: {
          Table: [
            {
              name: 'Test name 2',
              amount: '2',
              values: [
                { name: 'value1', amount: '1' },
                { name: 'value2', amount: '2' },
              ],
            },
          ],
        },
      },
    };
    assert.equal(
      isArrayMemberSourcePath('$payload.sections.items.Table.values.amount', sample),
      true,
    );
    const plan = classifySourcePathDrop({
      path: '$payload.sections.items.Table.values.amount',
      type: 'string',
      sample,
    });
    assert.equal(plan.kind, 'table-column');
    if (plan.kind !== 'table-column') return;
    assert.equal(plan.column.key, 'amount');
    assert.equal(plan.column.label, 'Amount');
    assert.equal(plan.sourceArrayPath, '$payload.sections.items.Table.values');
    assert.equal(plan.sourcePath, '$payload.sections.items.Table.values.amount');
  });

  it('classifies scalars as typed fields', () => {
    assert.deepEqual(
      classifySourcePathDrop({ path: '$payload.status', type: 'string', sample: SAMPLE }),
      { kind: 'field', label: 'Status', fieldType: 'text', sourcePath: '$payload.status' },
    );
    assert.deepEqual(
      classifySourcePathDrop({ path: '$payload.sort', type: 'number', sample: SAMPLE }),
      { kind: 'field', label: 'Sort', fieldType: 'number', sourcePath: '$payload.sort' },
    );
    assert.deepEqual(
      classifySourcePathDrop({ path: '$payload.inactive', type: 'boolean', sample: SAMPLE }),
      { kind: 'field', label: 'Inactive', fieldType: 'logical', sourcePath: '$payload.inactive' },
    );
    assert.deepEqual(
      classifySourcePathDrop({ path: '$payload.project.name', type: 'string', sample: SAMPLE }),
      { kind: 'field', label: 'Name', fieldType: 'text', sourcePath: '$payload.project.name' },
    );
  });

  it('classifies array members as table columns', () => {
    const plan = classifySourcePathDrop({
      path: '$payload.records.name',
      type: 'string',
      sample: SAMPLE,
    });
    assert.equal(plan.kind, 'table-column');
    if (plan.kind !== 'table-column') return;
    assert.equal(plan.column.key, 'name');
    assert.equal(plan.column.label, 'Name');
    assert.equal(plan.sourcePath, '$payload.records.name');
    assert.equal(plan.sourceArrayPath, '$payload.records');
  });

  it('uses humanized field labels for table columns', () => {
    const plan = classifySourcePathDrop({
      path: '$payload.records.date_visit_start',
      type: 'string',
      sample: {
        records: [{ date_visit_start: '2026-10-05T09:00:00+02:00' }],
      },
    });
    assert.equal(plan.kind, 'table-column');
    if (plan.kind !== 'table-column') return;
    assert.equal(plan.column.key, 'date_visit_start');
    assert.equal(plan.column.label, 'Date Visit Start');
    assert.equal(plan.column.name, 'Date Visit Start');
  });

  it('prefers explicit drag label for table columns', () => {
    const plan = classifySourcePathDrop({
      path: '$payload.records.date_visit_start',
      type: 'string',
      label: 'Date Visit Start',
      sample: {
        records: [{ date_visit_start: '2026-10-05T09:00:00+02:00' }],
      },
    });
    assert.equal(plan.kind, 'table-column');
    if (plan.kind !== 'table-column') return;
    assert.equal(plan.column.label, 'Date Visit Start');
  });

  it('classifies array-of-objects as multi-column table', () => {
    const plan = classifySourcePathDrop({
      path: '$payload.records',
      type: 'array',
      sample: SAMPLE,
    });
    assert.equal(plan.kind, 'table-array');
    if (plan.kind !== 'table-array') return;
    const keys = plan.columns.map((c) => c.key).sort();
    assert.deepEqual(keys, ['id', 'name', 'note', 'total']);
    assert.equal(plan.columnSourcePaths.length, 4);
  });

  it('builds mapping rules with sourceArrayPath for table columns', () => {
    const plan = classifySourcePathDrop({
      path: '$payload.records.name',
      type: 'string',
      sample: SAMPLE,
    });
    assert.equal(plan.kind, 'table-column');
    if (plan.kind !== 'table-column') return;

    const blocks = [
      {
        type: 'documentSection',
        data: {
          name: 'main',
          label: 'Main',
          segments: [{ type: 'table', id: 'main_name' }],
        },
      },
    ];
    const fieldSchemas = {
      main_name: {
        type: 'table',
        name: 'name',
        label: 'name',
        columns: [plan.column],
      },
    };
    const rules = buildTableMappingRulesFromSourceDrop({
      tableFieldId: 'main_name',
      blocks,
      fieldSchemas,
      columnSourcePaths: [{ columnKey: plan.column.key, sourcePath: plan.sourcePath }],
    });
    assert.equal(rules.length, 1);
    assert.equal(rules[0].columnKey, 'name');
    assert.equal(rules[0].sourcePath, '$payload.records.name');
    assert.equal(rules[0].sourceArrayPath, '$payload.records');
  });

  it('findTableIdForSourceArrayPath locates an existing mapped table', () => {
    const id = findTableIdForSourceArrayPath(
      [
        {
          fieldId: 'tbl1',
          columnKey: 'name',
          sourceArrayPath: '$payload.records',
          sourcePath: '$payload.records.name',
        },
      ],
      '$payload.records',
    );
    assert.equal(id, 'tbl1');
    assert.equal(findTableIdForSourceArrayPath([], '$payload.records'), null);
  });

  it('mergeMappingRulesIntoSpec upserts rules and preserves sourceSample', () => {
    const merged = mergeMappingRulesIntoSpec(
      { kind: 'fieldMapping', version: 1, sourceSample: SAMPLE, rules: [] },
      [
        {
          section: 'main',
          field: 'status',
          fieldId: 'main_status',
          sourcePath: '$payload.status',
        },
      ],
    );
    assert.equal(merged.sourceSample, SAMPLE);
    assert.equal(merged.rules.length, 1);
  });
});
