import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  assertTemplate,
  buildDocumentExportFromInput,
  buildFullDocumentExport,
  getByPath,
  isFilledDocumentSnapshot,
  renderDocument,
  resolveInputValues,
  resolveTemplateFromItem,
} from './docengine-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleTemplatePath = join(__dirname, '../../../../../examples/mammology-document-template.json');

test('assertTemplate accepts editor template export', () => {
  const template = JSON.parse(readFileSync(exampleTemplatePath, 'utf8'));
  assert.equal(assertTemplate(template).kind, 'template');
});

test('assertTemplate rejects invalid payload', () => {
  assert.throws(() => assertTemplate({ kind: 'bogus' }), /kind "template"/);
});

test('getByPath reads nested values', () => {
  assert.equal(getByPath('body.patient', { body: { patient: 'Ann' } }), 'Ann');
  assert.deepEqual(getByPath('', { a: 1 }), { a: 1 });
});

test('buildDocumentExportFromInput accepts flat field map', () => {
  const template = JSON.parse(readFileSync(exampleTemplatePath, 'utf8'));
  const document = buildDocumentExportFromInput(template, { statusLocalis: ['тканина однорідна'] });
  assert.equal(document.kind, 'field');
  assert.ok(document.sections);
});

test('buildFullDocumentExport returns template, fields, and doc', () => {
  const template = JSON.parse(readFileSync(exampleTemplatePath, 'utf8'));
  const full = buildFullDocumentExport(template, { statusLocalis: ['тканина однорідна'] });
  assert.equal(full.kind, 'docengine-document');
  assert.equal(full.template.kind, 'template');
  assert.equal(full.fields.kind, 'field');
  assert.equal(full.doc.kind, 'document');
  assert.ok(full.doc.blocks?.length);
});

test('assertTemplate strips tree node ids from field schemas', () => {
  const template = assertTemplate({
    kind: 'template',
    version: 2,
    fieldSchemas: {
      status: {
        type: 'tree',
        tree: [{ id: 'n_old', label: 'OK' }],
      },
    },
    blocks: [],
  });
  assert.deepEqual(template.fieldSchemas.status.tree, [{ label: 'OK' }]);
});

test('resolveTemplateFromItem reads nested path', () => {
  const template = JSON.parse(readFileSync(exampleTemplatePath, 'utf8'));
  const resolved = resolveTemplateFromItem({ body: { template } }, 'body.template');
  assert.equal(resolved.kind, 'template');
  assert.ok(resolved.blocks?.length);
});

test('resolveTemplateFromItem uses whole item when path is empty', () => {
  const template = JSON.parse(readFileSync(exampleTemplatePath, 'utf8'));
  const resolved = resolveTemplateFromItem(template);
  assert.equal(resolved.kind, 'template');
});

test('resolveTemplateFromItem parses JSON string at path', () => {
  const template = JSON.parse(readFileSync(exampleTemplatePath, 'utf8'));
  const resolved = resolveTemplateFromItem(
    { template: JSON.stringify(template) },
    'template',
  );
  assert.equal(resolved.kind, 'template');
});

test('resolveTemplateFromItem accepts a resolved template object from n8n expressions', () => {
  const template = JSON.parse(readFileSync(exampleTemplatePath, 'utf8'));
  const resolved = resolveTemplateFromItem({ body: { other: 1 } }, template);
  assert.equal(resolved.kind, 'template');
  assert.ok(resolved.blocks?.length);
});

test('filled document snapshot keeps token values instead of rebinding the empty template', () => {
  const template = {
    kind: 'template' as const,
    blocks: [
      {
        id: 'sec1',
        type: 'documentSection',
        data: { name: 'Main', label: 'Main', segments: [{ type: 'field', id: 'order_id' }] },
      },
    ],
    fieldSchemas: { order_id: { type: 'text', label: 'Order ID' } },
  };
  const filled = {
    kind: 'document',
    fieldSchemas: { order_id: { type: 'text', label: 'Order ID' } },
    blocks: [
      {
        id: 'sec1',
        type: 'documentSection',
        data: {
          name: 'Main',
          label: 'Main',
          fieldValues: { order_id: '99' },
          segments: [{ type: 'field', id: 'order_id' }],
        },
      },
    ],
  };
  const full = buildFullDocumentExport(template, filled);
  assert.equal(full.doc.blocks[0].data.fieldValues.order_id, '99');
});

test('Salesforce snapshot without kind is treated as filled document', () => {
  // SF DocEnginePdfCallout often omits kind; values live on blocks[].data.fieldValues
  const snapshot = {
    fieldSchemas: { order_id: { type: 'text', label: 'Order ID' } },
    blocks: [
      {
        id: 'sec1',
        type: 'documentSection',
        data: {
          name: 'Main',
          fieldValues: { order_id: '99', totals_grand_total: '4100' },
          segments: [
            { type: 'field', id: 'order_id' },
            { type: 'field', id: 'totals_grand_total' },
          ],
        },
      },
    ],
    pageSetup: { format: 'a4' },
  };
  assert.equal(isFilledDocumentSnapshot(snapshot), true);
  assert.equal(isFilledDocumentSnapshot({ kind: 'template', blocks: [] }), false);
  assert.equal(isFilledDocumentSnapshot({ kind: 'field', sections: {} }), false);

  const template = {
    kind: 'template' as const,
    blocks: [{ id: 'sec1', type: 'documentSection', data: { name: 'Main', segments: [] } }],
    fieldSchemas: { totals_grand_total: { type: 'text', label: 'Grand Total' } },
  };
  const full = buildFullDocumentExport(template, snapshot);
  assert.equal(full.doc.blocks[0].data.fieldValues.order_id, '99');
  assert.equal(full.doc.blocks[0].data.fieldValues.totals_grand_total, '4100');
});

test('resolveInputValues uses a mapped object from n8n JS/expression mode', () => {
  const incoming = {
    kind: 'document',
    sections: {
      Anamnesis: {
        Complaints: ['Vision disturbance decreased acuity.', 'Tearing'],
        'Life history': ['Chronic conditions hypertension'],
      },
    },
  };
  const mapped = {
    sections: {
      Anamnesis: {
        Complaints: 'Vision disturbance decreased acuity.',
        'Life history': 'Chronic conditions hypertension',
      },
    },
  };
  assert.deepEqual(resolveInputValues(mapped, incoming), mapped);
});

test('resolveInputValues parses a JSON object string', () => {
  const incoming = { kind: 'document', sections: { Anamnesis: { Complaints: ['all'] } } };
  const json = '{"Complaints":"first only"}';
  assert.deepEqual(resolveInputValues(json, incoming), { Complaints: 'first only' });
});

test('resolveInputValues reads a dot-path', () => {
  const incoming = { body: { patient: 'Ann' } };
  assert.deepEqual(resolveInputValues('body', incoming), { patient: 'Ann' });
});

test('resolveInputValues uses the whole item when path is empty', () => {
  const incoming = { kind: 'document', sections: { A: { x: 1 } } };
  assert.equal(resolveInputValues('', incoming), incoming);
  assert.equal(resolveInputValues(null, incoming), incoming);
});

test('resolveInputValues does not fall back to the incoming document for a missing path', () => {
  const incoming = { kind: 'document', sections: { A: { x: 1 } } };
  assert.throws(
    () => resolveInputValues('missing.path', incoming),
    /not found on the incoming item/,
  );
});

test('CJS bundle exports DocEngine and resolves PDF fonts', async () => {
  const require = createRequire(import.meta.url);
  const { DocEngine } = require('./DocEngine.node.cjs');
  assert.equal(typeof DocEngine, 'function');
  const node = new DocEngine();
  assert.equal(node.description.name, 'docEngine');
  assert.equal(node.description.displayName, 'DocEngine');

  const template = JSON.parse(readFileSync(exampleTemplatePath, 'utf8'));
  const result = await renderDocument(template, { sections: {} }, { outputFormat: 'pdf' });
  assert.equal(result.mimeType, 'application/pdf');
  assert.ok(Buffer.isBuffer(result.data));
  assert.ok(result.data.length > 100);
  assert.equal(result.data.subarray(0, 4).toString('utf8'), '%PDF');
});
