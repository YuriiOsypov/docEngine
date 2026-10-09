// @ts-nocheck
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyFieldMapping,
  evaluateFieldMappingExpression,
  normalizeMappingResult,
  previewFieldMapping,
  unwrapMappingExpression,
  validateMappedValues,
  buildTargetSchemaTree,
  isFieldMappingSpec,
  normalizeFieldMappingSpec,
  buildMappingResultFromRules,
  buildSourcePayloadTree,
  parseMappingResultToRules,
  createMappingRuleFromDrop,
  createMappingRulesFromDrop,
  collectRepeaterLeafFields,
  parsePathTokenContext,
  getSourceFieldsAtPath,
  sourcePathExists,
  resolveMappedSourceValue,
  resolveSourcePath,
  parseMappingSourcePath,
  formatDateValue,
  formatCurrencyValue,
  omitMappedFields,
  collectMappedSectionFieldKeys,
  syncMappingRulesToSchema,
  syncFieldMappingSpecToSchema,
  SECTION_SOURCE_KEY,
  createSectionSourceRule,
  isSectionSourceRule,
  applySectionSourceRepeatable,
  resolvePathForSectionItem,
} from './field-mapping.js';
import {
  applyDocumentValues,
  applySectionInstanceToBlocks,
  normalizeDocumentValues,
} from './document-io.js';
import { formatNumericDisplay } from './currency-format.js';

describe('field-mapping', () => {
  const fieldSchemas = {
    anamnesis_complaints: {
      type: 'list',
      name: 'Complaints',
      label: 'Complaints',
      items: [],
      defaultValue: [],
    },
    anamnesis_life: {
      type: 'child',
      name: 'Life anamnesis',
      label: 'Life anamnesis',
      fieldSchemas: {
        life_history: {
          type: 'list',
          name: 'Life history',
          label: 'Life history',
          items: [],
          defaultValue: [],
        },
      },
    },
  };

  const blocks = [
    {
      type: 'documentSection',
      data: {
        name: 'Anamnesis',
        label: 'Anamnesis',
        segments: [
          { type: 'field', id: 'anamnesis_complaints' },
          { type: 'child', id: 'anamnesis_life' },
        ],
        fieldValues: {
          anamnesis_complaints: [],
          anamnesis_life: {},
        },
      },
    },
  ];

  const template = { blocks, fieldSchemas };

  const payload = {
    sections: {
      Anamnesis: {
        Complaints: ['Tearing', 'Photophobia'],
        'Life history': ['Chronic conditions hypertension'],
      },
    },
  };

  const mappingSpec = {
    kind: 'fieldMapping',
    version: 1,
    expression: `{
      kind: "field",
      version: 2,
      sections: {
        Anamnesis: {
          Complaints: $payload.sections.Anamnesis.Complaints,
          "Life anamnesis": {
            "Life history": $payload.sections.Anamnesis["Life history"]
          }
        }
      }
    }`,
  };

  it('detects field mapping spec', () => {
    assert.ok(isFieldMappingSpec(mappingSpec));
    assert.ok(!isFieldMappingSpec({ kind: 'template' }));
  });

  it('unwraps n8n-style expression braces', () => {
    assert.strictEqual(unwrapMappingExpression('{{ { a: 1 } }}'), '{ a: 1 }');
  });

  it('evaluates mapping expression against payload', () => {
    const raw = evaluateFieldMappingExpression(mappingSpec.expression, payload, template);
    assert.deepEqual(raw.sections.Anamnesis.Complaints, ['Tearing', 'Photophobia']);
  });

  it('normalizes full sections result', () => {
    const raw = evaluateFieldMappingExpression(mappingSpec.expression, payload, template);
    const fieldsExport = normalizeMappingResult(raw, blocks, fieldSchemas);
    assert.strictEqual(fieldsExport.kind, 'field');
    assert.ok(fieldsExport.sections?.Anamnesis);
  });

  it('normalizes flat field map into sections', () => {
    const fieldsExport = normalizeMappingResult(
      {
        Complaints: ['A'],
        'Life anamnesis': { 'Life history': ['B'] },
      },
      blocks,
      fieldSchemas,
    );
    assert.deepEqual(fieldsExport.sections?.Anamnesis?.Complaints, ['A']);
  });

  it('validates child nested object', () => {
    const validation = validateMappedValues(
      {
        kind: 'field',
        version: 2,
        time: Date.now(),
        sections: {
          Anamnesis: {
            'Life anamnesis': ['not-an-object'],
          },
        },
      },
      blocks,
      fieldSchemas,
    );
    assert.strictEqual(validation.valid, false);
    assert.match(validation.errors[0].message, /child field/i);
  });

  it('previews mapping', () => {
    const preview = previewFieldMapping(payload, mappingSpec, template);
    assert.strictEqual(preview.validation.valid, true);
    assert.deepEqual(preview.fieldsExport.sections?.Anamnesis?.Complaints, [
      'Tearing',
      'Photophobia',
    ]);
  });

  it('treats index-free table column paths as existing source paths', () => {
    const tablePayload = {
      sections: {
        Untitled: {
          Table_2: [{ column_1: 'A' }, { column_1: 'B' }],
        },
      },
    };
    assert.equal(
      sourcePathExists('$payload.sections.Untitled.Table_2.column_1', tablePayload),
      true,
    );
    assert.equal(
      sourcePathExists('$payload.sections.Untitled.Table_2.missing', tablePayload),
      false,
    );
  });

  it('does not warn for nested table lookups or lazy child stubs in sample JSON', () => {
    const tableFieldSchemas = {
      products_table: {
        type: 'table',
        name: 'Line Items',
        columns: [
          { key: 'model', label: 'Model' },
          { key: 'quantity', label: 'Qty' },
        ],
      },
    };
    const tableBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Products',
          label: 'Products',
          segments: [{ type: 'table', id: 'products_table' }],
          fieldValues: { products_table: [] },
        },
      },
    ];
    const template = { blocks: tableBlocks, fieldSchemas: tableFieldSchemas };

    const expandedPayload = {
      GFERP__Sales_Lines__r: [
        {
          GFERP__EDI_Quantity__c: 2,
          GFERP__Item__r: { Name: 'SKU-1' },
        },
      ],
    };
    const expandedPreview = previewFieldMapping(
      expandedPayload,
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          {
            section: 'Products',
            field: 'Line Items',
            columnKey: 'model',
            sourcePath: '$payload.GFERP__Sales_Lines__r.GFERP__Item__r.Name',
            sourceArrayPath: '$payload.GFERP__Sales_Lines__r.GFERP__Item__r',
          },
          {
            section: 'Products',
            field: 'Line Items',
            columnKey: 'quantity',
            sourcePath: '$payload.GFERP__Sales_Lines__r.GFERP__EDI_Quantity__c',
            sourceArrayPath: '$payload.GFERP__Sales_Lines__r',
          },
        ],
      },
      template,
    );
    assert.equal(
      expandedPreview.validation.warnings.filter((w) => /does not exist in the payload/.test(w.message))
        .length,
      0,
      JSON.stringify(expandedPreview.validation.warnings),
    );

    const lazyPayload = {
      GFERP__Sales_Lines__r: [{ __lazy: true, __kind: 'child', _: 'Expand' }],
    };
    const lazyPreview = previewFieldMapping(
      lazyPayload,
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          {
            section: 'Products',
            field: 'Line Items',
            columnKey: 'model',
            sourcePath: '$payload.GFERP__Sales_Lines__r.GFERP__Item__r.Name',
            sourceArrayPath: '$payload.GFERP__Sales_Lines__r.GFERP__Item__r',
          },
          {
            section: 'Products',
            field: 'Line Items',
            columnKey: 'quantity',
            sourcePath: '$payload.GFERP__Sales_Lines__r.GFERP__EDI_Quantity__c',
            sourceArrayPath: '$payload.GFERP__Sales_Lines__r',
          },
        ],
      },
      template,
    );
    assert.equal(
      lazyPreview.validation.warnings.filter((w) => /does not exist in the payload/.test(w.message))
        .length,
      0,
      JSON.stringify(lazyPreview.validation.warnings),
    );
  });

  it('warns when a rule source path is missing from the payload', () => {
    const preview = previewFieldMapping(
      payload,
      {
        kind: 'fieldMapping',
        version: 1,
        expression: '',
        rules: [
          {
            section: 'Anamnesis',
            field: 'Complaints',
            sourcePath: '$payload.sections.Untitled.TT',
          },
        ],
      },
      template,
    );
    assert.ok(
      preview.validation.warnings.some((item) =>
        /Source path "\$payload\.sections\.Untitled\.TT" does not exist/.test(item.message),
      ),
    );
    assert.equal(
      preview.validation.warnings.find((item) => item.sourcePath)?.sourcePath,
      '$payload.sections.Untitled.TT',
    );
  });

  it('applies mapping to template blocks', () => {
    const result = applyFieldMapping(payload, mappingSpec, template);
    assert.ok(result.applied >= 2);
    const values = normalizeDocumentValues(result.fieldsExport, blocks, fieldSchemas);
    const merged = applyDocumentValues(blocks, values, fieldSchemas);
    const section = merged.blocks[0].data.fieldValues;
    assert.deepEqual(section.anamnesis_complaints, ['Tearing', 'Photophobia']);
    assert.deepEqual(section.anamnesis_life.life_history, ['Chronic conditions hypertension']);
  });

  it('builds target schema tree', () => {
    const tree = buildTargetSchemaTree(blocks, fieldSchemas);
    assert.strictEqual(tree.sections[0].name, 'Anamnesis');
    assert.strictEqual(tree.sections[0].fields[1].type, 'child');
    assert.ok(tree.sections[0].fields[1].children?.length);
  });

  it('normalizes empty mapping spec', () => {
    assert.deepEqual(normalizeFieldMappingSpec(null), {
      kind: 'fieldMapping',
      version: 1,
      expression: '',
      rules: [],
    });
  });

  it('maps via drag-and-drop rules', () => {
    const rules = [
      {
        section: 'Anamnesis',
        field: 'Complaints',
        sourcePath: '$payload.sections.Anamnesis.Complaints',
        fieldId: 'anamnesis_complaints',
      },
      {
        section: 'Anamnesis',
        field: 'Life anamnesis',
        childField: 'Life history',
        sourcePath: '$payload.sections.Anamnesis["Life history"]',
        fieldId: 'anamnesis_life',
        childFieldId: 'life_history',
      },
    ];

    const mappingSpec = { kind: 'fieldMapping', version: 1, rules };
    const result = applyFieldMapping(payload, mappingSpec, template);
    assert.ok(result.applied >= 2);

    const mappingResult = buildMappingResultFromRules(rules);
    assert.strictEqual(
      mappingResult.sections.Anamnesis.Complaints,
      '$payload.sections.Anamnesis.Complaints',
    );
    assert.deepEqual(mappingResult.sections.Anamnesis['Life anamnesis'], {
      'Life history': '$payload.sections.Anamnesis["Life history"]',
    });
  });

  it('builds source payload tree', () => {
    const tree = buildSourcePayloadTree(payload);
    assert.ok(tree.some((node) => node.key === 'sections'));
  });

  it('builds source payload tree with table columns instead of row indices', () => {
    const tablePayload = {
      sections: {
        items: {
          Table: [
            { name: 'A', amount: '1' },
            { name: 'B', amount: '2' },
          ],
        },
      },
    };

    const tree = buildSourcePayloadTree(tablePayload);
    const tableNode = tree
      .find((node) => node.key === 'sections')
      ?.children
      ?.find((node) => node.key === 'items')
      ?.children
      ?.find((node) => node.key === 'Table');

    assert.ok(tableNode);
    assert.strictEqual(tableNode.type, 'array');
    assert.ok(tableNode.children?.some((node) => node.key === 'name' && node.path === '$payload.sections.items.Table.name'));
    assert.ok(tableNode.children?.some((node) => node.key === 'amount' && node.path === '$payload.sections.items.Table.amount'));
    assert.ok(!tableNode.children?.some((node) => /^\[\d+\]$/.test(node.key)));
  });

  it('builds nested children for object columns in table-style arrays', () => {
    const tablePayload = {
      document_item_rows: [
        {
          quantity: 1,
          item: {
            id: 1,
            name: 'Sample item',
            price: 10,
          },
        },
      ],
    };

    const tree = buildSourcePayloadTree(tablePayload);
    const rowsNode = tree.find((node) => node.key === 'document_item_rows');
    const itemNode = rowsNode?.children?.find((node) => node.key === 'item');

    assert.ok(itemNode);
    assert.strictEqual(itemNode.path, '$payload.document_item_rows.item');
    assert.strictEqual(itemNode.type, 'object');
    assert.ok(itemNode.children?.some((node) => node.key === 'name'));
    assert.ok(itemNode.children?.some((node) => node.key === 'price'));
  });

  it('builds nested children for array columns in table-style arrays', () => {
    const tablePayload = {
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

    const tree = buildSourcePayloadTree(tablePayload);
    const valuesNode = tree
      .find((node) => node.key === 'sections')
      ?.children
      ?.find((node) => node.key === 'items')
      ?.children
      ?.find((node) => node.key === 'Table')
      ?.children
      ?.find((node) => node.key === 'values');

    assert.ok(valuesNode);
    assert.strictEqual(valuesNode.type, 'array');
    assert.ok(
      valuesNode.children?.some(
        (node) => node.key === 'name' && node.path === '$payload.sections.items.Table.values.name',
      ),
    );
    assert.ok(
      valuesNode.children?.some(
        (node) => node.key === 'amount' && node.path === '$payload.sections.items.Table.values.amount',
      ),
    );
    assert.ok(!valuesNode.children?.some((node) => /^\[\d+\]$/.test(node.key)));
  });

  it('resolves nested values array despite Array.prototype.values', () => {
    const tablePayload = {
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

    const nested = resolveSourcePath('$payload.sections.items.Table.values', tablePayload);
    assert.ok(Array.isArray(nested), 'must not return Array.prototype.values');
    assert.equal(nested.length, 2);
    assert.equal(
      resolveSourcePath('$payload.sections.items.Table.values.amount', tablePayload),
      '1',
    );
    assert.equal(
      resolveSourcePath('$payload.sections.items.Table.values.name', tablePayload),
      'value1',
    );
  });

  it('parses mapping result JSON back into rules', () => {
    const rules = [
      {
        section: 'Anamnesis',
        field: 'Complaints',
        sourcePath: '$payload.sections.Anamnesis.Complaints',
        fieldId: 'anamnesis_complaints',
      },
      {
        section: 'Anamnesis',
        field: 'Life anamnesis',
        childField: 'Life history',
        sourcePath: '$payload.sections.Anamnesis["Life history"]',
        fieldId: 'anamnesis_life',
        childFieldId: 'life_history',
      },
    ];

    const mappingResult = buildMappingResultFromRules(rules);
    const parsed = parseMappingResultToRules(mappingResult, blocks, fieldSchemas);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].sourcePath, rules[0].sourcePath);
    assert.strictEqual(parsed[1].childField, rules[1].childField);
    assert.strictEqual(parsed[1].childFieldId, 'life_history');
  });

  it('maps table columns from source array rows', () => {
    const tableFieldSchemas = {
      items_table: {
        type: 'table',
        name: 'Table',
        label: 'Table',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: [{ key: 'row1', label: 'Row1' }],
      },
    };

    const tableBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'items',
          label: 'items',
          segments: [{ type: 'table', id: 'items_table' }],
          fieldValues: { items_table: [] },
        },
      },
    ];

    const tableTemplate = { blocks: tableBlocks, fieldSchemas: tableFieldSchemas };
    const tablePayload = {
      sections: {
        items: {
          Table: [
            { name: 'Test name', amount: '2' },
            { name: 'Test name', amount: '3' },
          ],
        },
      },
    };

    const tableRules = [
      {
        section: 'items',
        field: 'Table',
        fieldId: 'items_table',
        columnKey: 'name',
        sourcePath: '$payload.sections.items.Table.name',
        sourceArrayPath: '$payload.sections.items.Table',
      },
      {
        section: 'items',
        field: 'Table',
        fieldId: 'items_table',
        columnKey: 'amount',
        sourcePath: '$payload.sections.items.Table.amount',
        sourceArrayPath: '$payload.sections.items.Table',
      },
    ];

    const mappingResult = buildMappingResultFromRules(tableRules);
    assert.deepEqual(mappingResult.sections.items.Table, {
      [SECTION_SOURCE_KEY]: '$payload.sections.items.Table',
      items: {
        name: '$name',
        amount: '$amount',
      },
    });

    const preview = previewFieldMapping(
      tablePayload,
      { kind: 'fieldMapping', version: 1, rules: tableRules },
      tableTemplate,
    );
    assert.strictEqual(preview.validation.valid, true);
    assert.ok(
      !preview.validation.warnings.some((item) =>
        /Source path "\$payload\.sections\.items\.Table\.(name|amount)" does not exist/.test(item.message),
      ),
      'index-free table column paths should be valid source paths',
    );
    assert.deepEqual(preview.fieldsExport.sections?.items?.Table, [
      { name: 'Test name', amount: '2' },
      { name: 'Test name', amount: '3' },
    ]);

    const fromDrop = createMappingRuleFromDrop(
      'items_table_row1_amount',
      '$payload.sections.items.Table[0].amount',
      tableBlocks,
      tableFieldSchemas,
    );
    assert.ok(fromDrop);
    assert.strictEqual(fromDrop.columnKey, 'amount');
    assert.strictEqual(fromDrop.fieldId, 'items_table');
    assert.strictEqual(fromDrop.section, 'items');
    assert.strictEqual(fromDrop.sourcePath, '$payload.sections.items.Table.amount');
    assert.strictEqual(fromDrop.sourceArrayPath, '$payload.sections.items.Table');

    const parsed = parseMappingResultToRules(mappingResult, tableBlocks, tableFieldSchemas);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].columnKey, 'name');
    assert.strictEqual(parsed[0].sourcePath, '$payload.sections.items.Table.name');
    assert.strictEqual(parsed[0].sourceArrayPath, '$payload.sections.items.Table');
    assert.strictEqual(parsed[1].columnKey, 'amount');
    assert.strictEqual(parsed[1].sourcePath, '$payload.sections.items.Table.amount');
    assert.strictEqual(parsed[1].sourceArrayPath, '$payload.sections.items.Table');

    const applied = applyFieldMapping(
      tablePayload,
      { kind: 'fieldMapping', version: 1, rules: tableRules },
      tableTemplate,
    );
    assert.ok(applied.applied >= 1);
    const sectionValues = applied.blocks[0].data.fieldValues;
    assert.strictEqual(sectionValues.items_table_row1_amount, '2');
    assert.strictEqual(sectionValues.items_table_row2_amount, '3');
  });

  it('parses legacy table mapping array template-row format', () => {
    const tableFieldSchemas = {
      items_table: {
        type: 'table',
        name: 'Table',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: [{ key: 'row1', label: 'Row1' }],
      },
    };
    const tableBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'items',
          label: 'items',
          segments: [{ type: 'table', id: 'items_table' }],
          fieldValues: { items_table: [] },
        },
      },
    ];

    const legacyResult = {
      kind: 'field',
      version: 2,
      sections: {
        items: {
          Table: [
            {
              name: '$payload.sections.items.Table.name',
              amount: '$payload.sections.items.Table.amount',
            },
          ],
        },
      },
    };

    const parsed = parseMappingResultToRules(legacyResult, tableBlocks, tableFieldSchemas);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].columnKey, 'name');
    assert.strictEqual(parsed[0].sourceArrayPath, '$payload.sections.items.Table');
    assert.strictEqual(parsed[1].columnKey, 'amount');
  });

  it('round-trips relative table item paths with format suffixes', () => {
    const tableFieldSchemas = {
      visits_table: {
        type: 'table',
        name: 'Table',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'start', label: 'Start' },
        ],
        rows: [{ key: 'row1', label: 'Row1' }],
      },
    };
    const tableBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'list',
          label: 'list',
          segments: [{ type: 'table', id: 'visits_table' }],
          fieldValues: { visits_table: [] },
        },
      },
    ];

    // Legacy `source` key is still accepted when parsing.
    const mappingResult = {
      kind: 'field',
      version: 2,
      sections: {
        list: {
          Table: {
            source: '$payload.records',
            items: {
              name: '$name',
              start: '$date_visit_start#DD-MM-YY',
            },
          },
        },
      },
    };

    const parsed = parseMappingResultToRules(mappingResult, tableBlocks, tableFieldSchemas);
    assert.strictEqual(parsed.length, 2);
    assert.deepEqual(
      parsed.map((rule) => ({
        columnKey: rule.columnKey,
        sourcePath: rule.sourcePath,
        sourceArrayPath: rule.sourceArrayPath,
      })),
      [
        {
          columnKey: 'name',
          sourcePath: '$payload.records.name',
          sourceArrayPath: '$payload.records',
        },
        {
          columnKey: 'start',
          sourcePath: '$payload.records.date_visit_start#DD-MM-YY',
          sourceArrayPath: '$payload.records',
        },
      ],
    );

    const rebuilt = buildMappingResultFromRules(parsed);
    assert.deepEqual(rebuilt.sections.list.Table, {
      [SECTION_SOURCE_KEY]: '$payload.records',
      items: {
        name: '$name',
        start: '$date_visit_start#DD-MM-YY',
      },
    });

    const preview = previewFieldMapping(
      {
        records: [
          { name: 'Visit A', date_visit_start: '2026-07-22' },
          { name: 'Visit B', date_visit_start: '2026-01-05' },
        ],
      },
      { kind: 'fieldMapping', version: 1, rules: parsed },
      { blocks: tableBlocks, fieldSchemas: tableFieldSchemas },
    );
    assert.deepEqual(preview.fieldsExport.sections?.list?.Table, [
      { name: 'Visit A', start: '22-07-26' },
      { name: 'Visit B', start: '05-01-26' },
    ]);
  });

  it('resolves nested object fields on table rows (child → parent lookup)', () => {
    const tableFieldSchemas = {
      products_table: {
        type: 'table',
        name: 'Line Items',
        columns: [
          { key: 'product', label: 'Product' },
          { key: 'model', label: 'Model' },
          { key: 'quantity', label: 'Qty' },
        ],
      },
    };
    const tableBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Products',
          label: 'Products',
          segments: [{ type: 'table', id: 'products_table' }],
          fieldValues: { products_table: [] },
        },
      },
    ];
    const mappingResult = {
      kind: 'field',
      version: 2,
      sections: {
        Products: {
          'Line Items': [
            {
              quantity: '$payload.GFERP__Sales_Lines__r.GFERP__EDI_Quantity__c',
              model: '$payload.GFERP__Sales_Lines__r.GFERP__Item__r.Name',
              product: '$payload.GFERP__Sales_Lines__r.GFERP__Item__r.GFERP__Description__c',
            },
          ],
        },
      },
    };
    const payload = {
      GFERP__Sales_Lines__r: [
        {
          GFERP__EDI_Quantity__c: 3,
          GFERP__Item__r: { Name: 'SKU-1', GFERP__Description__c: 'Widget' },
        },
        {
          GFERP__EDI_Quantity__c: 1,
          GFERP__Item__r: { Name: 'SKU-2', GFERP__Description__c: 'Gadget' },
        },
      ],
    };

    const rules = parseMappingResultToRules(mappingResult, tableBlocks, tableFieldSchemas);
    assert.ok(rules.length >= 3);

    const applied = applyFieldMapping(
      payload,
      { kind: 'fieldMapping', version: 1, rules },
      { blocks: tableBlocks, fieldSchemas: tableFieldSchemas },
    );
    const values = applied.blocks[0].data.fieldValues;
    assert.strictEqual(values.products_table_row1_quantity, 3);
    assert.strictEqual(values.products_table_row1_model, 'SKU-1');
    assert.strictEqual(values.products_table_row1_product, 'Widget');
    assert.strictEqual(values.products_table_row2_model, 'SKU-2');
  });

  it('does not treat child-field objects as table mapping', () => {
    const fieldSchemas = {
      items_child: {
        type: 'child',
        name: 'Child',
        fieldSchemas: {
          note_f: { type: 'text', name: 'Note' },
          city_f: { type: 'text', name: 'City' },
        },
      },
    };
    const blocks = [
      {
        type: 'documentSection',
        data: {
          name: 'items',
          label: 'items',
          segments: [{ type: 'child', id: 'items_child' }],
          fieldValues: { items_child: {} },
        },
      },
    ];

    const mappingResult = {
      kind: 'field',
      version: 2,
      sections: {
        items: {
          Child: {
            Note: '$payload.header.note',
            City: '$payload.header.city',
          },
        },
      },
    };

    const rules = parseMappingResultToRules(mappingResult, blocks, fieldSchemas);
    assert.strictEqual(rules.length, 2);
    assert.ok(rules.every((rule) => !rule.columnKey && !rule.sourceArrayPath));
    assert.strictEqual(rules[0].childFieldPath, 'Note');
    assert.strictEqual(rules[0].sourcePath, '$payload.header.note');
    assert.strictEqual(rules[1].childFieldPath, 'City');
  });

  it('maps nested child fields and bulk-assigns child leaves', () => {
    const fieldSchemas = {
      items_child: {
        type: 'child',
        name: 'Child',
        fieldSchemas: {
          address_child: {
            type: 'child',
            name: 'Address',
            fieldSchemas: {
              city_f: { type: 'text', name: 'City' },
              addr_f: { type: 'text', name: 'Address' },
            },
          },
          note_f: { type: 'text', name: 'Note' },
        },
      },
    };

    const blocks = [
      {
        type: 'documentSection',
        data: {
          name: 'items',
          label: 'items',
          segments: [{ type: 'child', id: 'items_child' }],
          fieldValues: { items_child: {} },
        },
      },
    ];

    const template = { blocks, fieldSchemas };
    const sourcePath = '$payload.sections.header.Text';

    const bulkRules = createMappingRulesFromDrop(
      'items_child',
      sourcePath,
      blocks,
      fieldSchemas,
      { bulkChild: true },
    );
    assert.strictEqual(bulkRules.length, 3);

    const mappingResult = buildMappingResultFromRules(bulkRules);
    assert.deepEqual(mappingResult.sections.items.Child, {
      Address: {
        City: sourcePath,
        Address: sourcePath,
      },
      Note: sourcePath,
    });

    const parsed = parseMappingResultToRules(mappingResult, blocks, fieldSchemas);
    assert.strictEqual(parsed.length, 3);
    assert.ok(parsed.some((rule) => rule.childFieldPath === 'Address.City'));
  });

  it('lists source fields at current path level', () => {
    const payload = {
      sections: {
        header: { Text: 'hello' },
        items: {
          Table: [{ name: 'A', amount: '1' }],
          Child: { Address: { City: 'x' } },
        },
      },
    };

    assert.deepEqual(
      getSourceFieldsAtPath(payload, '$payload').map((field) => field.key),
      ['sections'],
    );

    const sectionFields = getSourceFieldsAtPath(payload, '$payload.sections.');
    assert.ok(sectionFields.some((field) => field.key === 'header' && field.type === 'object'));
    assert.ok(sectionFields.some((field) => field.key === 'items' && field.type === 'object'));

    const itemsFields = getSourceFieldsAtPath(payload, '$payload.sections.items.');
    assert.ok(itemsFields.some((field) => field.key === 'Table' && field.type === 'array'));

    const tableFields = getSourceFieldsAtPath(payload, '$payload.sections.items.Table.');
    assert.ok(tableFields.some((field) => field.key === 'name' && field.type === 'string'));
    assert.ok(tableFields.some((field) => field.key === 'amount' && field.type === 'string'));
    assert.ok(tableFields.every((field) => !/^\[\d+\]$/.test(field.key)));
    assert.ok(tableFields.some((field) => field.path === '$payload.sections.items.Table.name'));

    const rowFields = getSourceFieldsAtPath(payload, '$payload.sections.items.Table[0].');
    assert.ok(rowFields.some((field) => field.key === 'name'));
    assert.ok(rowFields.some((field) => field.key === 'amount'));
  });

  it('parsePathTokenContext splits base path and segment', () => {
    assert.deepEqual(parsePathTokenContext('$payload.sections.he'), {
      basePath: '$payload.sections',
      segmentPrefix: 'he',
      segmentStartInToken: 18,
    });
    assert.deepEqual(parsePathTokenContext('$payload.sections.'), {
      basePath: '$payload.sections',
      segmentPrefix: '',
      segmentStartInToken: 18,
    });
  });

  it('supports #dateFormat suffix on mapping source paths', () => {
    assert.deepEqual(parseMappingSourcePath('$payload.CreatedDate#dd/mm/yyyy'), {
      path: '$payload.CreatedDate',
      dateFormat: 'dd/mm/yyyy',
    });
    assert.deepEqual(parseMappingSourcePath('$payload.CreatedDate#DD.MM.YYYY'), {
      path: '$payload.CreatedDate',
      dateFormat: 'DD.MM.YYYY',
    });

    const payload = {
      CreatedDate: '2026-07-22T14:32:00.000Z',
      Name: 'INV-1',
      Amount: 1234.5,
    };

    assert.equal(
      resolveMappedSourceValue('$payload.CreatedDate#dd/mm/yyyy', payload),
      '22/07/2026',
    );
    assert.equal(
      resolveMappedSourceValue('$payload.CreatedDate#DD.MM.YYYY', payload),
      '22.07.2026',
    );
    assert.equal(
      resolveMappedSourceValue('$payload.CreatedDate#iso', payload),
      '2026-07-22',
    );
    assert.equal(resolveMappedSourceValue('$payload.CreatedDate', payload), payload.CreatedDate);
    assert.equal(formatDateValue('2026-07-22', 'mm/dd/yyyy'), '07/22/2026');

    assert.equal(
      resolveMappedSourceValue('$payload.Amount#EUR:2', payload),
      formatCurrencyValue(1234.5, 'EUR:2'),
    );
    assert.equal(
      resolveMappedSourceValue('$payload.Amount#number:2', payload),
      formatCurrencyValue(1234.5, 'number:2'),
    );

    assert.equal(sourcePathExists('$payload.CreatedDate#dd/mm/yyyy', payload), true);
    assert.equal(sourcePathExists('$payload.Missing#dd/mm/yyyy', payload), false);

    const mappingSpec = {
      kind: 'fieldMapping',
      version: 1,
      rules: [
        {
          section: 'Order Details',
          field: 'Date Added',
          fieldId: 'date_added',
          sourcePath: '$payload.CreatedDate#dd/mm/yyyy',
        },
      ],
    };
    const template = {
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Order Details',
            label: 'Order Details',
            segments: [{ type: 'field', id: 'date_added' }],
            fieldValues: { date_added: '' },
          },
        },
      ],
      fieldSchemas: {
        date_added: { type: 'date', name: 'Date Added', label: 'Date Added' },
      },
    };

    const result = applyFieldMapping(payload, mappingSpec, template);
    assert.equal(result.fieldsExport.sections['Order Details']['Date Added'], '22/07/2026');
  });
});

describe('omitMappedFields', () => {
  const mappingSpec = {
    kind: 'fieldMapping',
    version: 1,
    rules: [
      { section: 'Exam', field: 'Patient Name', sourcePath: 'Account.Name' },
      {
        section: 'Exam',
        field: 'Labs',
        columnKey: 'result',
        sourcePath: 'Lab.Result',
        sourceArrayPath: 'Lab',
      },
      {
        section: 'Exam',
        field: 'History',
        childField: 'allergies',
        sourcePath: 'Patient.Allergies',
      },
      { section: 'Billing', field: 'Amount', sourcePath: 'Invoice.Total' },
    ],
  };

  it('collects unique section+field keys from rules', () => {
    const keys = collectMappedSectionFieldKeys(mappingSpec);
    assert.equal(keys.size, 4);
    assert.ok(keys.has('Exam\0Patient Name'));
    assert.ok(keys.has('Exam\0Labs'));
    assert.ok(keys.has('Exam\0History'));
    assert.ok(keys.has('Billing\0Amount'));
  });

  it('omits mapped fields and keeps unmapped ones', () => {
    const fieldsExport = {
      kind: 'field',
      version: 2,
      sections: {
        Exam: {
          'Patient Name': 'Ada Lovelace',
          complaints: ['Blurred vision'],
          Labs: [{ result: '5.2' }],
          History: { allergies: ['Penicillin'] },
          notes: 'Routine visit',
        },
        Billing: {
          Amount: 120,
          memo: 'Cash',
        },
        Notes: {
          summary: 'All good',
        },
      },
    };

    const filtered = omitMappedFields(fieldsExport, mappingSpec);
    assert.deepEqual(filtered.sections, {
      Exam: {
        complaints: ['Blurred vision'],
        notes: 'Routine visit',
      },
      Billing: {
        memo: 'Cash',
      },
      Notes: {
        summary: 'All good',
      },
    });
    // Input not mutated
    assert.equal(fieldsExport.sections.Exam['Patient Name'], 'Ada Lovelace');
  });

  it('filters mapped fields from repeatable section instances', () => {
    const fieldsExport = {
      kind: 'field',
      version: 2,
      sections: {
        Exam: [
          { 'Patient Name': 'A', notes: 'one' },
          { 'Patient Name': 'B', notes: 'two' },
        ],
      },
    };
    const filtered = omitMappedFields(fieldsExport, mappingSpec);
    assert.deepEqual(filtered.sections.Exam, [{ notes: 'one' }, { notes: 'two' }]);
  });

  it('drops empty sections after filtering', () => {
    const fieldsExport = {
      kind: 'field',
      version: 2,
      sections: {
        Billing: { Amount: 10 },
      },
    };
    const filtered = omitMappedFields(fieldsExport, mappingSpec);
    assert.deepEqual(filtered.sections, {});
  });

  it('returns a clone unchanged when mapping has no rules', () => {
    const fieldsExport = {
      kind: 'field',
      version: 2,
      sections: { Exam: { notes: 'x' } },
    };
    const filtered = omitMappedFields(fieldsExport, { kind: 'fieldMapping', rules: [] });
    assert.deepEqual(filtered.sections, { Exam: { notes: 'x' } });
    assert.notEqual(filtered, fieldsExport);
  });

  it('syncs mapping rule section and field names after renames', () => {
    const fieldSchemas = {
      main_start: { type: 'text', name: 'Start', label: 'Start' },
      main_name: { type: 'text', name: 'Name', label: 'Name' },
      main_patient: { type: 'text', name: 'Patient', label: 'Patient' },
    };
    const blocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Main',
          label: 'Main',
          segments: [
            { type: 'field', id: 'main_start' },
            { type: 'field', id: 'main_name' },
            { type: 'field', id: 'main_patient' },
          ],
          fieldValues: {},
        },
      },
    ];

    const staleRules = [
      {
        section: 'Untitled',
        field: 'Date Visit Start',
        fieldId: 'main_start',
        sourcePath: '$payload.meta.parent.date_visit_start',
      },
      {
        section: 'Main',
        field: 'Name_2',
        fieldId: 'main_name',
        sourcePath: '$payload.meta.parent.name',
      },
      {
        section: 'Untitled',
        field: 'Name',
        fieldId: 'main_patient',
        sourcePath: '$payload.meta.parent.patient.name',
      },
    ];

    const synced = syncMappingRulesToSchema(staleRules, blocks, fieldSchemas);
    assert.deepEqual(
      synced.map((rule) => ({ section: rule.section, field: rule.field, fieldId: rule.fieldId })),
      [
        { section: 'Main', field: 'Start', fieldId: 'main_start' },
        { section: 'Main', field: 'Name', fieldId: 'main_name' },
        { section: 'Main', field: 'Patient', fieldId: 'main_patient' },
      ],
    );

    const mappingResult = buildMappingResultFromRules(synced);
    assert.deepEqual(mappingResult.sections, {
      Main: {
        Start: '$payload.meta.parent.date_visit_start',
        Name: '$payload.meta.parent.name',
        Patient: '$payload.meta.parent.patient.name',
      },
    });
  });

  it('syncs mapping rule fieldIds through rename map and child paths', () => {
    const fieldSchemas = {
      main_child: {
        type: 'child',
        name: 'Patient',
        fieldSchemas: {
          city_f: { type: 'text', name: 'City' },
        },
      },
    };
    const blocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Visit',
          label: 'Visit',
          segments: [{ type: 'child', id: 'main_child' }],
          fieldValues: {},
        },
      },
    ];

    const staleRules = [
      {
        section: 'Untitled',
        field: 'Person',
        childField: 'Town',
        childFieldPath: 'Town',
        fieldId: 'old_child',
        childFieldId: 'city_f',
        sourcePath: '$payload.city',
      },
    ];

    const synced = syncMappingRulesToSchema(staleRules, blocks, fieldSchemas, {
      fieldIdRenames: { old_child: 'main_child' },
    });
    assert.equal(synced[0].section, 'Visit');
    assert.equal(synced[0].field, 'Patient');
    assert.equal(synced[0].fieldId, 'main_child');
    assert.equal(synced[0].childField, 'City');
    assert.equal(synced[0].childFieldPath, 'City');

    const spec = syncFieldMappingSpecToSchema(
      { kind: 'fieldMapping', version: 1, rules: staleRules },
      blocks,
      fieldSchemas,
      { fieldIdRenames: { old_child: 'main_child' } },
    );
    assert.equal(spec.rules[0].field, 'Patient');
  });
});

describe('section _source mapping', () => {
  const fieldSchemas = {
    contact_name: { type: 'text', name: 'Name', label: 'Name', defaultValue: '' },
    contact_phone: { type: 'text', name: 'Phone', label: 'Phone', defaultValue: '' },
    line_items: {
      type: 'table',
      name: 'Lines',
      label: 'Lines',
      columns: [
        { key: 'sku', label: 'SKU' },
        { key: 'qty', label: 'Qty' },
      ],
    },
  };
  const blocks = [
    {
      type: 'documentSection',
      data: {
        name: 'main',
        label: 'main',
        repeatable: false,
        segments: [
          { type: 'field', id: 'contact_name' },
          { type: 'field', id: 'contact_phone' },
          { type: 'table', id: 'line_items' },
        ],
        fieldValues: {},
      },
    },
  ];
  const template = { blocks, fieldSchemas };

  it('round-trips _source through build/parse', () => {
    const rules = [
      createSectionSourceRule('main', '$payload.Contacts'),
      {
        section: 'main',
        field: 'Name',
        fieldId: 'contact_name',
        sourcePath: '$payload.Contacts.Name',
        sourceArrayPath: '$payload.Contacts',
      },
      {
        section: 'main',
        field: 'Phone',
        fieldId: 'contact_phone',
        sourcePath: '$payload.AccountPhone',
      },
    ];
    const result = buildMappingResultFromRules(rules);
    assert.equal(result.sections.main[SECTION_SOURCE_KEY], '$payload.Contacts');
    assert.equal(result.sections.main.Name, '$Name');
    assert.equal(result.sections.main.Phone, '$payload.AccountPhone');

    const parsed = parseMappingResultToRules(result, blocks, fieldSchemas);
    assert.ok(parsed.some(isSectionSourceRule));
    assert.equal(
      parsed.find(isSectionSourceRule)?.sourceArrayPath,
      '$payload.Contacts',
    );
    assert.equal(parsed.find((r) => r.field === 'Name')?.sourcePath, '$Name');
    assert.equal(parsed.find((r) => r.field === 'Phone')?.sourcePath, '$payload.AccountPhone');
  });

  it('resolves relative and absolute paths into N instances', () => {
    const preview = previewFieldMapping(
      {
        AccountPhone: '111',
        Contacts: [
          { Name: 'Ada', Phone: '555' },
          { Name: 'Bob', Phone: '666' },
        ],
      },
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          createSectionSourceRule('main', '$payload.Contacts'),
          {
            section: 'main',
            field: 'Name',
            fieldId: 'contact_name',
            sourcePath: '$Name',
          },
          {
            section: 'main',
            field: 'Phone',
            fieldId: 'contact_phone',
            sourcePath: '$payload.AccountPhone',
          },
        ],
      },
      template,
    );
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation));
    assert.deepEqual(preview.fieldsExport.sections.main, [
      { Name: 'Ada', Phone: '111' },
      { Name: 'Bob', Phone: '111' },
    ]);
  });

  it('emits empty array when source array is empty', () => {
    const preview = previewFieldMapping(
      { Contacts: [], AccountPhone: 'x' },
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          createSectionSourceRule('main', '$payload.Contacts'),
          {
            section: 'main',
            field: 'Name',
            fieldId: 'contact_name',
            sourcePath: '$Name',
          },
        ],
      },
      template,
    );
    assert.deepEqual(preview.fieldsExport.sections.main, []);
  });

  it('resolves nested table under a sourced section', () => {
    const preview = previewFieldMapping(
      {
        Contacts: [
          {
            Name: 'Ada',
            Lines: [
              { Sku: 'A1', Qty: 2 },
              { Sku: 'A2', Qty: 1 },
            ],
          },
        ],
      },
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          createSectionSourceRule('main', '$payload.Contacts'),
          {
            section: 'main',
            field: 'Name',
            fieldId: 'contact_name',
            sourcePath: '$Name',
          },
          {
            section: 'main',
            field: 'Lines',
            fieldId: 'line_items',
            columnKey: 'sku',
            sourcePath: '$payload.Contacts.Lines.Sku',
            sourceArrayPath: '$payload.Contacts.Lines',
          },
          {
            section: 'main',
            field: 'Lines',
            fieldId: 'line_items',
            columnKey: 'qty',
            sourcePath: '$payload.Contacts.Lines.Qty',
            sourceArrayPath: '$payload.Contacts.Lines',
          },
        ],
      },
      template,
    );
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation));
    const instances = preview.fieldsExport.sections.main;
    assert.equal(instances.length, 1);
    assert.equal(instances[0].Name, 'Ada');
    assert.deepEqual(instances[0].Lines, [
      { sku: 'A1', qty: 2 },
      { sku: 'A2', qty: 1 },
    ]);
  });

  it('projects nested $values when mapping field name case differs from schema', () => {
    const detailSchemas = {
      amount: { type: 'text', name: 'amount', label: 'amount', defaultValue: '' },
      table_1: {
        type: 'table',
        name: 'Table',
        label: 'Table',
        columns: [{ key: 'column_1', label: 'Name' }],
      },
    };
    const detailBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'letter',
          label: 'Letter',
          repeatable: false,
          segments: [
            { type: 'field', id: 'amount' },
            { type: 'table', id: 'table_1' },
          ],
          fieldValues: {},
        },
      },
    ];
    const preview = previewFieldMapping(
      {
        sections: {
          items: {
            Table: [
              {
                name: 'Test name 2',
                values: [
                  { name: 'value1' },
                  { name: 'value2' },
                  { name: 'value3' },
                ],
              },
            ],
          },
        },
      },
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          createSectionSourceRule('letter', '$payload.sections.items.Table'),
          {
            section: 'letter',
            field: 'amount',
            fieldId: 'amount',
            sourcePath: '$name',
          },
          // Lowercase field name as in edited Mapping result JSON
          {
            section: 'letter',
            field: 'table',
            sourcePath: '$values',
          },
        ],
      },
      { blocks: detailBlocks, fieldSchemas: detailSchemas },
    );
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation));
    assert.deepEqual(preview.fieldsExport.sections.letter[0].table, [
      { column_1: 'value1' },
      { column_1: 'value2' },
      { column_1: 'value3' },
    ]);
  });

  it('projects nested $values array onto table columns by label (master-detail)', () => {
    const detailSchemas = {
      amount: { type: 'text', name: 'amount', label: 'amount', defaultValue: '' },
      table_1: {
        type: 'table',
        name: 'Table',
        label: 'Table',
        columns: [{ key: 'column_1', label: 'Name' }],
      },
    };
    const detailBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'letter',
          label: 'Letter',
          repeatable: false,
          segments: [
            { type: 'field', id: 'amount' },
            { type: 'table', id: 'table_1' },
          ],
          fieldValues: {},
        },
      },
    ];
    const preview = previewFieldMapping(
      {
        sections: {
          items: {
            Table: [
              {
                name: 'Test name 2',
                values: [
                  { name: 'value1', amount: '1' },
                  { name: 'value2', amount: '2' },
                  { name: 'value3', amount: '3' },
                ],
              },
              {
                name: 'Test name 5',
                values: [
                  { name: 'valueA', amount: '4' },
                  { name: 'valueB', amount: '5' },
                ],
              },
            ],
          },
        },
      },
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          createSectionSourceRule('letter', '$payload.sections.items.Table'),
          {
            section: 'letter',
            field: 'amount',
            fieldId: 'amount',
            sourcePath: '$name',
          },
          {
            section: 'letter',
            field: 'Table',
            fieldId: 'table_1',
            sourcePath: '$values',
          },
        ],
      },
      { blocks: detailBlocks, fieldSchemas: detailSchemas },
    );
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation));
    const instances = preview.fieldsExport.sections.letter;
    assert.equal(instances.length, 2);
    assert.equal(instances[0].amount, 'Test name 2');
    assert.deepEqual(instances[0].Table, [
      { column_1: 'value1' },
      { column_1: 'value2' },
      { column_1: 'value3' },
    ]);
    assert.equal(instances[1].amount, 'Test name 5');
    assert.deepEqual(instances[1].Table, [
      { column_1: 'valueA' },
      { column_1: 'valueB' },
    ]);
  });

  it('expands nested $values rows when the table sits inside columns', () => {
    const detailSchemas = {
      amount: { type: 'text', name: 'amount', label: 'amount', defaultValue: '' },
      table_1: {
        type: 'table',
        name: 'Table',
        label: 'Table',
        columns: [{ key: 'column_1', label: 'Name' }],
      },
    };
    const detailBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Letter',
          label: 'Letter',
          segments: [
            { type: 'field', id: 'amount' },
            {
              type: 'columns',
              id: 'cols_1',
              columns: [
                [{ type: 'table', id: 'table_1', rows: [{ key: 'row1', label: '' }] }],
                [],
              ],
            },
          ],
          fieldValues: {
            amount: '',
            table_1_row1_column_1: '',
          },
        },
      },
    ];
    const payload = {
      tests: [
        {
          name: 'Test name 2',
          values: [{ name: 'value1' }, { name: 'value2' }, { name: 'value3' }],
        },
      ],
    };
    const result = applyFieldMapping(
      payload,
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          createSectionSourceRule('Letter', '$payload.tests'),
          {
            section: 'Letter',
            field: 'amount',
            fieldId: 'amount',
            sourcePath: '$name',
          },
          {
            section: 'Letter',
            field: 'Table',
            fieldId: 'table_1',
            sourcePath: '$values',
          },
        ],
      },
      { blocks: detailBlocks, fieldSchemas: detailSchemas },
    );
    assert.deepEqual(result.fieldsExport.sections.Letter[0].Table, [
      { column_1: 'value1' },
      { column_1: 'value2' },
      { column_1: 'value3' },
    ]);

    const applied = applySectionInstanceToBlocks(
      detailBlocks,
      detailSchemas,
      0,
      result.fieldsExport.sections.Letter[0],
    );
    const nestedTable = applied.blocks[0].data.segments[1].columns[0].find(
      (seg) => seg.type === 'table',
    );
    assert.equal(nestedTable.rows.length, 3);
    assert.equal(applied.blocks[0].data.fieldValues.table_1_row1_column_1, 'value1');
    assert.equal(applied.blocks[0].data.fieldValues.table_1_row2_column_1, 'value2');
    assert.equal(applied.blocks[0].data.fieldValues.table_1_row3_column_1, 'value3');
  });

  it('shortens absolute nested column paths to $amount beside $name under $values', () => {
    const detailSchemas = {
      table_1: {
        type: 'table',
        name: 'Table',
        label: 'Table',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'amount', label: 'Amount' },
        ],
      },
    };
    const detailBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Letter',
          label: 'Letter',
          segments: [{ type: 'table', id: 'table_1' }],
          fieldValues: {},
        },
      },
    ];
    const mappingResult = buildMappingResultFromRules(
      [
        createSectionSourceRule('Letter', '$payload.sections.items.Table'),
        {
          section: 'Letter',
          field: 'Table',
          fieldId: 'table_1',
          columnKey: 'name',
          sourcePath: '$name',
          sourceArrayPath: '$values',
        },
        {
          section: 'Letter',
          field: 'Table',
          fieldId: 'table_1',
          columnKey: 'amount',
          sourcePath: '$payload.sections.items.Table.values.amount',
          sourceArrayPath: '$payload.sections.items.Table.values',
        },
      ],
      { blocks: detailBlocks, fieldSchemas: detailSchemas },
    );
    assert.deepEqual(mappingResult.sections.Letter.Table, {
      [SECTION_SOURCE_KEY]: '$values',
      items: {
        name: '$name',
        amount: '$amount',
      },
    });
  });

  it('heals cell-drop of $values array bound into one column (master-detail)', () => {
    const detailSchemas = {
      amount: { type: 'text', name: 'amount', label: 'amount', defaultValue: '' },
      table_1: {
        type: 'table',
        name: 'Table',
        label: 'Table',
        columns: [{ key: 'column_1', label: 'Name' }],
      },
    };
    const detailBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Letter',
          label: 'Letter',
          repeatable: false,
          segments: [
            { type: 'field', id: 'amount' },
            { type: 'table', id: 'table_1' },
          ],
          fieldValues: {},
        },
      },
    ];
    // Broken shape from dropping $values onto a Name cell:
    // items.column_1 = "$values" (array itself) instead of "$name".
    const preview = previewFieldMapping(
      {
        sections: {
          items: {
            Table: [
              {
                name: 'Test name 2',
                values: [{ name: 'value1' }, { name: 'value2' }, { name: 'value3' }],
              },
            ],
          },
        },
      },
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          createSectionSourceRule('Letter', '$payload.sections.items.Table'),
          {
            section: 'Letter',
            field: 'amount',
            fieldId: 'amount',
            sourcePath: '$name',
          },
          {
            section: 'Letter',
            field: 'Table',
            fieldId: 'table_1',
            columnKey: 'column_1',
            sourcePath: '$values',
            sourceArrayPath: '$values',
          },
        ],
      },
      { blocks: detailBlocks, fieldSchemas: detailSchemas },
    );
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation));
    assert.deepEqual(preview.fieldsExport.sections.Letter[0].Table, [
      { column_1: 'value1' },
      { column_1: 'value2' },
      { column_1: 'value3' },
    ]);
  });

  it('createMappingRulesFromDrop maps array drops on cells onto all table columns', () => {
    const detailSchemas = {
      table_1: {
        type: 'table',
        name: 'Table',
        label: 'Table',
        columns: [{ key: 'column_1', label: 'Name' }],
      },
    };
    const detailBlocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Letter',
          label: 'Letter',
          segments: [{ type: 'table', id: 'table_1' }],
          fieldValues: {},
        },
      },
    ];
    const rules = createMappingRulesFromDrop(
      'table_1_row1_column_1',
      '$values',
      detailBlocks,
      detailSchemas,
      { sourceType: 'array' },
    );
    assert.equal(rules.length, 1);
    assert.equal(rules[0].columnKey, 'column_1');
    assert.equal(rules[0].sourceArrayPath, '$values');
    assert.equal(rules[0].sourcePath, '$values.name');
  });

  it('resolvePathForSectionItem supports relative and absolute', () => {
    const payload = { AccountPhone: '111', Contacts: [{ Name: 'Ada' }] };
    const item = payload.Contacts[0];
    assert.equal(resolvePathForSectionItem('$Name', payload, item), 'Ada');
    assert.equal(resolvePathForSectionItem('Name', payload, item), 'Ada');
    assert.equal(resolvePathForSectionItem('$payload.AccountPhone', payload, item), '111');
  });

  it('applySectionSourceRepeatable does not flip repeatable from _source', () => {
    const localBlocks = JSON.parse(JSON.stringify(blocks));
    assert.equal(localBlocks[0].data.repeatable, false);
    applySectionSourceRepeatable(localBlocks, [
      createSectionSourceRule('main', '$payload.Contacts'),
    ]);
    assert.equal(localBlocks[0].data.repeatable, false);
  });

  it('warns when _source path is not an array', () => {
    const preview = previewFieldMapping(
      { Contacts: { Name: 'Ada' } },
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [createSectionSourceRule('main', '$payload.Contacts')],
      },
      template,
    );
    assert.ok(
      preview.validation.warnings.some((w) => /is not an array/.test(w.message)),
      JSON.stringify(preview.validation.warnings),
    );
  });
});

describe('pivotTable mapping', () => {
  it('expands sourceArrayPath into a pivot matrix', () => {
    const fieldSchemas = {
      sales_pivot: {
        type: 'pivotTable',
        name: 'Sales Pivot',
        label: 'Sales Pivot',
        rowProperty: 'Region',
        columnProperty: 'Product',
        valueProperty: 'Amount',
        aggregation: 'sum',
        showRowTotals: true,
        showColumnTotals: true,
        showGrandTotal: true,
      },
    };
    const blocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Main',
          label: 'Main',
          segments: [{ type: 'table', id: 'sales_pivot' }],
          fieldValues: {},
        },
      },
    ];
    const preview = previewFieldMapping(
      {
        OrderItems: [
          { Region: 'West', Product: 'A', Amount: 10 },
          { Region: 'West', Product: 'B', Amount: 5 },
          { Region: 'East', Product: 'A', Amount: 7 },
        ],
      },
      {
        kind: 'fieldMapping',
        version: 1,
        rules: [
          {
            section: 'Main',
            field: 'Sales Pivot',
            fieldId: 'sales_pivot',
            sourceArrayPath: '$payload.OrderItems',
          },
        ],
      },
      { blocks, fieldSchemas },
    );
    assert.equal(preview.validation.valid, true, JSON.stringify(preview.validation));
    const pivot = preview.fieldsExport.sections.Main['Sales Pivot'];
    assert.ok(pivot && Array.isArray(pivot.columns));
    assert.ok(Array.isArray(pivot.rows));
    assert.equal(pivot.rows.length, 2);
    assert.equal(pivot.grandTotal, 22);
  });
});
