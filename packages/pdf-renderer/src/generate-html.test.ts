import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellFieldId } from '@docengine/editor/node';
import { generateHtmlFromTemplate } from './generate-html.js';

const tableId = 'items_table';
const tableSchema = {
  type: 'table',
  name: 'Items',
  label: 'Items',
  columns: [
    { key: 'column_1', label: 'Column 1' },
    { key: 'column_2', label: 'Column 2' },
  ],
  rows: [{ key: 'row1', label: '' }],
  cellType: 'text',
};

function makeTemplate() {
  const cell1 = cellFieldId(tableId, 'row1', 'column_1');
  const cell2 = cellFieldId(tableId, 'row1', 'column_2');
  return {
    kind: 'template',
    version: 2,
    time: Date.now(),
    fieldSchemas: {
      [tableId]: tableSchema,
      [cell1]: { type: 'text', label: 'Column 1', name: 'Column 1' },
      [cell2]: { type: 'text', label: 'Column 2', name: 'Column 2' },
    },
    blocks: [
      {
        type: 'documentSection',
        data: {
          label: 'items',
          name: 'items',
          segments: [{ type: 'table', id: tableId, rows: tableSchema.rows }],
          fieldValues: {
            [cell1]: '',
            [cell2]: '',
          },
        },
      },
    ],
  };
}

describe('generateHtmlFromTemplate', () => {
  it('styles vision-table at full width in standalone HTML export', async () => {
    const template = makeTemplate();
    const cell1 = cellFieldId(tableId, 'row1', 'column_1');
    const cell2 = cellFieldId(tableId, 'row1', 'column_2');
    const html = await generateHtmlFromTemplate({
      template,
      document: {
        kind: 'field',
        version: 2,
        time: Date.now(),
        sections: {
          items: {
            Items: [{ column_1: '111', column_2: '22' }],
          },
        },
      },
      fullDocument: true,
    });

    assert.match(html, /\.preview-document \.vision-table\{[^}]*width:100%/);
    assert.match(html, /class="document-table"[^>]*>[\s\S]*<table[^>]*class="vision-table"/);
    assert.match(html, new RegExp(`data-field-id="${cell1}"`));
    assert.match(html, new RegExp(`data-field-id="${cell2}"`));
    assert.doesNotMatch(html, /\.document-table\{width:100%/);
  });

  it('includes pre-wrap on section bodies so list line layouts render correctly', async () => {
    const html = await generateHtmlFromTemplate({
      template: makeListTemplate('lines'),
      document: makeListDocument(['Alpha', 'Beta']),
      fullDocument: true,
    });

    assert.match(html, /\.preview-document__section\{white-space:pre-wrap/);
    assert.match(html, /data-field-id="diagnosis_list"[^>]*>[\s\S]*Alpha[\s\S]*Beta/);
  });

  it('preserves newline-separated list layouts in exported field tokens', async () => {
    // Plain multiline values render as text + <br> (not literal \\n in HTML).
    for (const [layout, expectedSnippet] of [
      ['lines', 'Alpha<br>Beta'],
      ['bullet', '• Alpha<br>• Beta'],
      ['numeric', '1. Alpha<br>2. Beta'],
      ['custom', '- Alpha<br>- Beta'],
    ]) {
      const html = await generateHtmlFromTemplate({
        template: makeListTemplate(layout, layout === 'custom' ? '- ' : ''),
        document: makeListDocument(['Alpha', 'Beta']),
        fullDocument: true,
      });
      assert.match(
        html,
        new RegExp(`data-field-id="diagnosis_list"[^>]*>${escapeRegExp(expectedSnippet)}`),
        `expected ${layout} layout to preserve line breaks`,
      );
    }
  });

  it('keeps inline list layout on one line', async () => {
    const html = await generateHtmlFromTemplate({
      template: makeListTemplate('inline'),
      document: makeListDocument(['Alpha', 'Beta']),
      fullDocument: true,
    });

    assert.match(html, /data-field-id="diagnosis_list"[^>]*>Alpha; Beta/);
    assert.doesNotMatch(html, /data-field-id="diagnosis_list"[^>]*>Alpha\nBeta/);
  });

  it('includes hide-empty class and CSS when hideEmptyValues is true', async () => {
    const html = await generateHtmlFromTemplate({
      template: makeEmptyFieldTemplate(),
      document: makeEmptyFieldDocument(),
      fullDocument: true,
      hideEmptyValues: true,
    });

    assert.match(html, /class="preview-document preview-document--hide-empty"/);
    assert.match(
      html,
      /\.preview-document--hide-empty \.field-token--preview\.field-token--empty:not\(\.field-token--required-missing\)\{display:none\}/,
    );
    assert.doesNotMatch(html, /data-field-id="notes"/);
  });

  it('renders child field column layout with document-columns grid CSS', async () => {
    const html = await generateHtmlFromTemplate({
      template: makeChildColumnsTemplate(),
      document: makeChildColumnsDocument(),
      fullDocument: true,
    });

    assert.match(html, /\.document-columns__grid\{display:grid;grid-template-columns:1fr 1fr/);
    assert.match(html, /class="document-columns"/);
    assert.match(html, /class="document-columns__grid"/);
    assert.match(html, /milan/);
    assert.match(html, /via per arogno 4/);
  });
});

function makeListTemplate(itemLayout: any, itemPrefix = '') {
  return {
    kind: 'template',
    version: 2,
    time: Date.now(),
    fieldSchemas: {
      diagnosis_list: {
        type: 'list',
        name: 'ICD-10',
        label: 'ICD-10',
        multi: true,
        itemLayout,
        ...(itemPrefix ? { itemPrefix } : {}),
        defaultValue: [],
      },
    },
    blocks: [
      {
        type: 'documentSection',
        data: {
          label: 'Diagnosis',
          name: 'Diagnosis',
          segments: [
            { type: 'text', content: 'Diagnosis: ' },
            { type: 'field', id: 'diagnosis_list', placeholder: 'ICD-10' },
          ],
          fieldValues: { diagnosis_list: [] },
        },
      },
    ],
  };
}

function makeListDocument(values: any) {
  return {
    kind: 'field',
    version: 2,
    time: Date.now(),
    sections: {
      Diagnosis: {
        'ICD-10': values,
      },
    },
  };
}

function escapeRegExp(text: any) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeEmptyFieldTemplate() {
  return {
    kind: 'template',
    version: 2,
    time: Date.now(),
    fieldSchemas: {
      notes: { type: 'text', name: 'Notes', label: 'Notes' },
    },
    blocks: [
      {
        type: 'documentSection',
        data: {
          label: 'Section',
          name: 'Section',
          segments: [{ type: 'field', id: 'notes' }],
          fieldValues: { notes: '' },
        },
      },
    ],
  };
}

function makeEmptyFieldDocument() {
  return {
    kind: 'field',
    version: 2,
    time: Date.now(),
    sections: {
      Section: {
        Notes: '',
      },
    },
  };
}

function makeChildColumnsTemplate() {
  return {
    kind: 'template',
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
                  {
                    type: 'columns',
                    columns: [
                      [{ type: 'field', id: 'city' }],
                      [{ type: 'field', id: 'address' }],
                    ],
                  },
                ],
                fieldValues: {},
              },
            },
          ],
        },
      },
    },
    blocks: [
      {
        type: 'documentSection',
        data: {
          label: 'header',
          name: 'header',
          segments: [{ type: 'field', id: 'addressField' }],
          fieldValues: { addressField: {} },
        },
      },
    ],
  };
}

function makeChildColumnsDocument() {
  return {
    kind: 'field',
    version: 2,
    time: Date.now(),
    sections: {
      header: {
        address: { city: 'milan', address: 'via per arogno 4' },
      },
    },
  };
}
