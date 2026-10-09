import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import { cellFieldId } from '../core/field-schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mammologyTemplate = JSON.parse(
  readFileSync(join(__dirname, '../../../../examples/mammology-document-template.json'), 'utf8'),
);

let filterSegmentsForPreview: any;
let renderDocumentPreview: any;

const mammologySegments = mammologyTemplate.blocks[0].data.segments;
const fieldSchemas = mammologyTemplate.fieldSchemas;

const filledFieldValues = {
  statusLocalis: ['Права грудна залоза дольчата', 'Ліва грудна залоза бугристі структури різної величини'],
  focalPalpation: ['Утворення до 1 см'],
  nippleDischarge: "кров'янисті",
  regionalLymphNodes: 'щільні',
  skinChanges: ['втягнення шкіри'],
  diagnosis: ['Складна кіста правої грудної залози', 'Проста кіста лівої грудної залози'],
  recommended: ['Консультація онколога', 'МРТ грудних залоз'],
};

const emptyFieldValues = mammologyTemplate.blocks[0].data.fieldValues;

before(async () => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.DocumentFragment = window.DocumentFragment;
  globalThis.DOMParser = class {
    parseFromString(markup: any, mimeType: any) {
      if (mimeType !== 'text/html') {
        return parseHTML('<!DOCTYPE html><html><body></body></html>').document;
      }
      const html = String(markup ?? '');
      const wrapped = /<html[\s>]/i.test(html)
        ? html
        : `<!DOCTYPE html><html><body>${html}</body></html>`;
      return parseHTML(wrapped).document;
    }
  };

  const { registerBuiltinFields } = await import('./handlers/index.js');
  registerBuiltinFields();

  const preview = await import('./document-preview.js');
  filterSegmentsForPreview = preview.filterSegmentsForPreview;
  renderDocumentPreview = preview.renderDocumentPreview;
});

describe('filterSegmentsForPreview', () => {
  it('preserves row separator newlines in text segments when fields are filled', () => {
    const filtered = filterSegmentsForPreview(
      mammologySegments,
      filledFieldValues,
      fieldSchemas,
    );

    const rowSeparators = filtered.filter(
      (seg: any) => seg.type === 'text' && !seg.html && String(seg.content ?? '').includes('.\n'),
    );
    assert.ok(rowSeparators.length >= 5, 'row separators with .\\n should remain');
    assert.ok(
      filtered.some(
        (seg: any) =>
          seg.type === 'text' &&
          seg.content === '.\nВогнещевої патології пальпаторно: ',
      ),
    );
  });

  it('does not drop standalone newline segments between field and row label', () => {
    const segments = [
      { type: 'field', id: 'statusLocalis' },
      { type: 'text', content: '\n' },
      { type: 'text', content: '.\nВогнещевої патології пальпаторно: ' },
      { type: 'field', id: 'focalPalpation' },
    ];

    const filtered = filterSegmentsForPreview(segments, filledFieldValues, fieldSchemas);
    assert.ok(
      filtered.some((seg: any) => seg.type === 'text' && seg.content === '\n'),
      'standalone newline segment should be preserved',
    );
  });

  it('preserves html row separators with embedded newlines', () => {
    const segments = [
      { type: 'text', html: '<b>ST.LOCALIS: </b>' },
      { type: 'field', id: 'statusLocalis' },
      { type: 'text', html: '<b>.\nВогнещевої патології пальпаторно: </b>' },
      { type: 'field', id: 'focalPalpation' },
    ];

    const filtered = filterSegmentsForPreview(segments, filledFieldValues, fieldSchemas);
    assert.ok(
      filtered.some(
        (seg: any) => seg.type === 'text' && seg.html?.includes('.\nВогнещевої'),
      ),
    );
  });

  it('removes all mammology rows when every field is empty', () => {
    const filtered = filterSegmentsForPreview(
      mammologySegments,
      emptyFieldValues,
      fieldSchemas,
    );

    assert.deepEqual(filtered, []);
  });

  it('removes html labels when the following field is empty', () => {
    const segments = [
      { type: 'text', html: '<b>ST.LOCALIS: </b>' },
      { type: 'field', id: 'statusLocalis' },
      {
        type: 'text',
        html: '.\nРегіонарні <mark>лімфатичні вузли</mark>: ',
      },
      { type: 'field', id: 'regionalLymphNodes', placeholder: 'Регіонарні límphatичні vузли' },
    ];

    const filtered = filterSegmentsForPreview(segments, emptyFieldValues, fieldSchemas);
    assert.deepEqual(filtered, []);
  });

  it('treats placeholder-like and separator field values as empty', () => {
    const segments = [
      { type: 'text', content: '.\nРегіонарні límphatичні vузли: ' },
      { type: 'field', id: 'regionalLymphNodes', placeholder: 'Регіонарні límphatичні vузли' },
    ];

    assert.deepEqual(
      filterSegmentsForPreview(segments, { regionalLymphNodes: '.' }, fieldSchemas),
      [],
    );
    assert.deepEqual(
      filterSegmentsForPreview(
        segments,
        { regionalLymphNodes: 'Регіонарні límphatичні vузли' },
        fieldSchemas,
      ),
      [],
    );
  });

  it('removes standalone field headings without a trailing colon', () => {
    const segments = [
      { type: 'text', content: '.\nNotes\n' },
      { type: 'field', id: 'notes', placeholder: 'Notes' },
    ];

    assert.deepEqual(
      filterSegmentsForPreview(segments, { notes: '' }, fieldSchemas),
      [],
    );
  });

  it('removes html field headings without a trailing colon', () => {
    const segments = [
      {
        type: 'text',
        html: '<b><div style="text-align: center"><h1>Рекомендовано</h1></div></b> ',
      },
      { type: 'field', id: 'recommended', placeholder: 'Рекомендовано' },
    ];

    assert.deepEqual(
      filterSegmentsForPreview(segments, { recommended: [] }, fieldSchemas),
      [],
    );
  });

  it('removes orphaned OD/OS commas when both eye fields are empty', () => {
    const schemas = {
      orbitOd: { type: 'choice', label: 'OD', name: 'orbitOd' },
      orbitOs: { type: 'choice', label: 'OS', name: 'orbitOs' },
      eyelidsOd: { type: 'choice', label: 'OD', name: 'eyelidsOd' },
      eyelidsOs: { type: 'choice', label: 'OS', name: 'eyelidsOs' },
    };
    const segments = [
      { type: 'text', content: 'Orbit: ' },
      { type: 'field', id: 'orbitOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'orbitOs', placeholder: 'OS' },
      { type: 'text', content: '.\nEyelids: ' },
      { type: 'field', id: 'eyelidsOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'eyelidsOs', placeholder: 'OS' },
      { type: 'text', content: '.\n' },
    ];

    assert.deepEqual(
      filterSegmentsForPreview(segments, {}, schemas),
      [],
    );
  });

  it('keeps the comma between filled OD and OS values', () => {
    const schemas = {
      orbitOd: { type: 'choice', label: 'OD', name: 'orbitOd' },
      orbitOs: { type: 'choice', label: 'OS', name: 'orbitOs' },
    };
    const segments = [
      { type: 'text', content: 'Orbit: ' },
      { type: 'field', id: 'orbitOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'orbitOs', placeholder: 'OS' },
      { type: 'text', content: '.\n' },
    ];

    const filtered = filterSegmentsForPreview(
      segments,
      { orbitOd: 'normal', orbitOs: 'normal' },
      schemas,
    );

    assert.deepEqual(filtered, [
      { type: 'text', content: 'Orbit: ' },
      { type: 'field', id: 'orbitOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'orbitOs', placeholder: 'OS' },
      { type: 'text', content: '.' },
    ]);
  });

  it('keeps the peer comma when only one eye field has a value', () => {
    const schemas = {
      orbitOd: { type: 'choice', label: 'OD', name: 'orbitOd' },
      orbitOs: { type: 'choice', label: 'OS', name: 'orbitOs' },
    };
    const segments = [
      { type: 'text', content: 'Orbit: ' },
      { type: 'field', id: 'orbitOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'orbitOs', placeholder: 'OS' },
      { type: 'text', content: '.\n' },
    ];

    // Filled OD + empty OS → `Orbit: normal, .`
    assert.deepEqual(
      filterSegmentsForPreview(segments, { orbitOd: 'normal' }, schemas),
      [
        { type: 'text', content: 'Orbit: ' },
        { type: 'field', id: 'orbitOd', placeholder: 'OD' },
        { type: 'text', content: ', ' },
        { type: 'text', content: '.' },
      ],
    );

    // Empty OD + filled OS → `Orbit: , normal.`
    assert.deepEqual(
      filterSegmentsForPreview(segments, { orbitOs: 'normal' }, schemas),
      [
        { type: 'text', content: 'Orbit: ' },
        { type: 'text', content: ', ' },
        { type: 'field', id: 'orbitOs', placeholder: 'OS' },
        { type: 'text', content: '.' },
      ],
    );
  });

  it('keeps each eye-row label and comma when only OS is filled on later rows', () => {
    const schemas = {
      orbitOd: { type: 'choice', label: 'OD', name: 'orbitOd' },
      orbitOs: { type: 'choice', label: 'OS', name: 'orbitOs' },
      eyelidsOd: { type: 'choice', label: 'OD', name: 'eyelidsOd' },
      eyelidsOs: { type: 'choice', label: 'OS', name: 'eyelidsOs' },
    };
    const segments = [
      { type: 'text', content: 'Orbit: ' },
      { type: 'field', id: 'orbitOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'orbitOs', placeholder: 'OS' },
      { type: 'text', content: '.\nEyelids: ' },
      { type: 'field', id: 'eyelidsOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'eyelidsOs', placeholder: 'OS' },
      { type: 'text', content: '.\n' },
    ];

    const filtered = filterSegmentsForPreview(
      segments,
      { orbitOs: 'clear', eyelidsOs: 'absent' },
      schemas,
    );

    assert.deepEqual(filtered, [
      { type: 'text', content: 'Orbit: ' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'orbitOs', placeholder: 'OS' },
      { type: 'text', content: '.\nEyelids: ' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'eyelidsOs', placeholder: 'OS' },
      { type: 'text', content: '.' },
    ]);
  });

  it('strips a leading row-ending period when earlier empty rows are removed', () => {
    const schemas = {
      eyelidsOd: { type: 'choice', label: 'OD', name: 'eyelidsOd' },
      eyelidsOs: { type: 'choice', label: 'OS', name: 'eyelidsOs' },
      anteriorOd: { type: 'choice', label: 'OD', name: 'anteriorOd' },
      anteriorOs: { type: 'choice', label: 'OS', name: 'anteriorOs' },
    };
    const segments = [
      { type: 'text', content: 'Eyelids: ' },
      { type: 'field', id: 'eyelidsOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'eyelidsOs', placeholder: 'OS' },
      { type: 'text', content: '.\nAnterior chamber: ' },
      { type: 'field', id: 'anteriorOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'anteriorOs', placeholder: 'OS' },
      { type: 'text', content: '.\n' },
    ];

    const filtered = filterSegmentsForPreview(
      segments,
      { anteriorOd: 'wide' },
      schemas,
    );

    assert.deepEqual(filtered, [
      { type: 'text', content: 'Anterior chamber: ' },
      { type: 'field', id: 'anteriorOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'text', content: '.' },
    ]);
    assert.ok(
      !filtered.some((seg: any) => String(seg.content ?? '').startsWith('.\n')),
      'orphaned leading period-from-previous-row glue should be removed from labels',
    );
  });

  it('keeps the sentence-ending period when the next empty row is removed', () => {
    const schemas = {
      patencyOd: { type: 'choice', label: 'OD', name: 'patencyOd' },
      patencyOs: { type: 'choice', label: 'OS', name: 'patencyOs' },
      scleraOd: { type: 'choice', label: 'OD', name: 'scleraOd' },
      scleraOs: { type: 'choice', label: 'OS', name: 'scleraOs' },
    };
    const segments = [
      { type: 'text', content: 'Patency: ' },
      { type: 'field', id: 'patencyOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'patencyOs', placeholder: 'OS' },
      { type: 'text', content: '.\nSclera: ' },
      { type: 'field', id: 'scleraOd', placeholder: 'OD' },
      { type: 'text', content: ', ' },
      { type: 'field', id: 'scleraOs', placeholder: 'OS' },
      { type: 'text', content: '.\n' },
    ];

    // Empty OD + OS "clear", following row empty → `Patency: , clear.` (not trailing comma)
    assert.deepEqual(
      filterSegmentsForPreview(segments, { patencyOs: 'clear' }, schemas),
      [
        { type: 'text', content: 'Patency: ' },
        { type: 'text', content: ', ' },
        { type: 'field', id: 'patencyOs', placeholder: 'OS' },
        { type: 'text', content: '.' },
      ],
    );
  });
});

describe('renderDocumentPreview', () => {
  it('renders mammology rows without collapsing line breaks', () => {
    const doc = {
      fieldSchemas,
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Огляд',
            segments: mammologySegments,
            fieldValues: filledFieldValues,
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    const html = root.innerHTML;

    assert.doesNotMatch(html, /дольчата\.Вогнещевої/);
    assert.doesNotMatch(html, /1 см\.Виділення/);
    assert.match(html, /дольчата[\s\S]*<br>[\s\S]*Вогнещевої патології пальпаторно:/);
  });

  it('renders html bold row separators with line breaks', () => {
    const doc = {
      fieldSchemas,
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Огляд',
            segments: [
              { type: 'text', html: '<b>ST.LOCALIS: </b>' },
              { type: 'field', id: 'statusLocalis' },
              { type: 'text', html: '<b>.\nВогнещевої патології пальпаторно: </b>' },
              { type: 'field', id: 'focalPalpation' },
            ],
            fieldValues: filledFieldValues,
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    const html = root.innerHTML;

    assert.doesNotMatch(html, /дольчата\.Вогнещевої/);
    assert.match(html, /<b>[\s\S]*Вогнещевої патології пальпаторно:/);
    assert.match(html, /<br>/);
  });

  it('hides empty mammology rows in preview output when hideEmptyValues is true', () => {
    const doc = {
      fieldSchemas,
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Огляд',
            segments: mammologySegments,
            fieldValues: emptyFieldValues,
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: true });
    const html = root.innerHTML;

    assert.doesNotMatch(html, new RegExp(fieldSchemas.regionalLymphNodes.label));
    assert.doesNotMatch(html, /ST\.LOCALIS/);
    assert.match(html, /preview-document__empty|document-section__header/);
  });

  it('shows section structure in preview by default when fields are empty', () => {
    const doc = {
      fieldSchemas,
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Огляд',
            segments: [{ type: 'field', id: 'diagnosis' }],
            fieldValues: { diagnosis: '' },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    assert.doesNotMatch(root.innerHTML, /preview-document__empty/);
    assert.match(root.innerHTML, /document-section__header/);
  });

  it('shows placeholder for empty required fields in preview', () => {
    const doc = {
      fieldSchemas: {
        notes: { type: 'text', label: 'Notes', name: 'notes', required: true },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Section',
            segments: [
              { type: 'text', content: 'Notes: ' },
              { type: 'field', id: 'notes', placeholder: 'Notes' },
            ],
            fieldValues: { notes: '' },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    const token = root.querySelector('.field-token--preview.field-token--required-missing');
    assert.ok(token, 'required-missing token should render');
    assert.match(token.textContent ?? '', /Notes/);
  });

  it('keeps empty required fields visible with placeholder when hideEmptyValues is true', () => {
    const schemas = {
      notes: { type: 'text', label: 'Notes', name: 'notes', required: true },
      other: { type: 'text', label: 'Other', name: 'other', required: false },
    };
    const segments = [
      { type: 'text', content: 'Notes: ' },
      { type: 'field', id: 'notes', placeholder: 'Notes' },
      { type: 'text', content: '.\nOther: ' },
      { type: 'field', id: 'other', placeholder: 'Other' },
    ];

    const filtered = filterSegmentsForPreview(segments, {}, schemas);
    assert.ok(filtered.some((seg: any) => seg.type === 'field' && seg.id === 'notes'));
    assert.ok(!filtered.some((seg: any) => seg.type === 'field' && seg.id === 'other'));

    const root = renderDocumentPreview(
      {
        fieldSchemas: schemas,
        blocks: [
          {
            type: 'documentSection',
            data: { label: 'Section', segments, fieldValues: {} },
          },
        ],
      },
      { hideEmptyValues: true },
    );
    const token = root.querySelector('.field-token--preview.field-token--required-missing');
    assert.ok(token, 'required empty field should remain visible');
    assert.match(token.textContent ?? '', /Notes/);
    assert.equal(root.querySelector('[data-field-id="other"]'), null);
  });

  it('keeps empty optional field tokens blank in preview when hideEmptyValues is false', () => {
    const doc = {
      fieldSchemas: {
        notes: { type: 'text', label: 'Notes', name: 'notes' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Section',
            segments: [
              { type: 'text', content: 'Notes: ' },
              { type: 'field', id: 'notes' },
            ],
            fieldValues: { notes: '' },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    assert.ok(!root.classList.contains('preview-document--hide-empty'));
    const token = root.querySelector('.field-token--preview.field-token--empty');
    assert.ok(token, 'empty field token should render');
    assert.equal((token.textContent ?? '').trim(), '');
  });

  it('hides empty field tokens in preview when hideEmptyValues is true', () => {
    const doc = {
      fieldSchemas: {
        notes: { type: 'text', label: 'Notes', name: 'notes' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Section',
            segments: [{ type: 'field', id: 'notes' }],
            fieldValues: { notes: '' },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: true });
    assert.ok(root.classList.contains('preview-document--hide-empty'));
    assert.equal(root.querySelector('.field-token--preview'), null);
  });

  it('shows populated template child field in preview when hideEmptyValues is true', () => {
    const doc = {
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
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'header',
            segments: [{ type: 'field', id: 'addressField' }],
            fieldValues: {
              addressField: { city: 'milan', address: 'via per arogno 4' },
            },
          },
        },
      ],
    };

    const filtered = filterSegmentsForPreview(
      doc.blocks[0].data.segments,
      { addressField: { city: 'milan', address: 'via per arogno 4' } },
      doc.fieldSchemas,
    );
    assert.equal(filtered.length, 1);

    const root = renderDocumentPreview(doc, { hideEmptyValues: true });
    assert.ok(root.classList.contains('preview-document--hide-empty'));
    assert.match(root.textContent ?? '', /milan/);
    assert.match(root.textContent ?? '', /via per arogno 4/);
  });

  it('renders empty child field template with blank nested empties when hideEmptyValues is false', () => {
    const doc = {
      fieldSchemas: {
        childField: {
          type: 'child',
          label: 'Child',
          name: 'child',
          fieldSchemas: {
            age: { type: 'integer', label: 'age', name: 'age' },
          },
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'header',
            segments: [{ type: 'field', id: 'childField' }],
            fieldValues: { childField: {} },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    const repeater = root.querySelector('.field-token--repeater.field-token--preview');
    assert.ok(repeater, 'child field token should render');
    const nestedEmpty = repeater.querySelector('.field-token--preview.field-token--empty');
    assert.ok(nestedEmpty, 'empty nested field token should render');
    assert.equal((nestedEmpty.textContent ?? '').trim(), '');
  });

  it('renders child field values inside table cells in HTML preview', () => {
    const childId = 'main_table_row1_column_2';
    const doc = {
      fieldSchemas: {
        main_table: {
          type: 'table',
          label: 'main',
          columns: [
            { key: 'column_1', label: 'Column 1' },
            { key: 'column_2', label: 'Column 2' },
          ],
          rows: [{ key: 'row1', label: '' }],
        },
        main_table_row1_column_1: { type: 'text', label: 'Column 1' },
        [childId]: {
          type: 'child',
          label: 'Column 2',
          name: 'Column 2',
          fieldSchemas: {
            id: { type: 'text', label: 'id', name: 'id' },
            name: { type: 'text', label: 'name', name: 'name' },
          },
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'main',
            segments: [
              {
                type: 'table',
                id: 'main_table',
                rows: [{ key: 'row1', label: '' }],
              },
            ],
            fieldValues: {
              main_table_row1_column_1: '2',
              [childId]: { id: '10', name: 'nameW' },
            },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    assert.match(root.textContent ?? '', /nameW/, 'child nested name should appear in preview');
    assert.match(root.textContent ?? '', /10/, 'child nested id should appear in preview');
    const childToken = root.querySelector('.field-token--repeater');
    assert.ok(childToken, 'child cell token should render inside the preview table');
  });

  it('inherits table last-column split for a following 2-column totals row', () => {
    const tableId = 'products_table';
    const doc = {
      fieldSchemas: {
        [tableId]: {
          type: 'table',
          label: 'Products',
          columns: [
            { key: 'product', label: 'Product', width: '72%' },
            { key: 'total', label: 'Total', width: '28%' },
          ],
          rows: [{ key: 'r1', label: '' }],
        },
        [`${tableId}_r1_product`]: { type: 'text', label: 'Product' },
        [`${tableId}_r1_total`]: { type: 'text', label: 'Total' },
        grand_total_label: { type: 'text', label: 'Total label' },
        grand_total_value: { type: 'text', label: 'Total value' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'main',
            segments: [
              { type: 'table', id: tableId, rows: [{ key: 'r1', label: '' }] },
              {
                type: 'columns',
                columns: [
                  [{ type: 'field', id: 'grand_total_label' }],
                  [{ type: 'field', id: 'grand_total_value' }],
                ],
              },
            ],
            fieldValues: {
              [`${tableId}_r1_product`]: 'Item',
              [`${tableId}_r1_total`]: '$100.00',
              grand_total_label: 'Total:',
              grand_total_value: '$100.00',
            },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    const grid = root.querySelector('.document-columns__grid') as HTMLElement | null;
    assert.ok(grid, 'columns grid should render');
    assert.equal(grid?.style.gridTemplateColumns, '72% 28%');
  });

  it('overrides default 50/50 totals columns split after a table in preview', () => {
    const tableId = 'products_table_equal_split';
    const doc = {
      fieldSchemas: {
        [tableId]: {
          type: 'table',
          label: 'Products',
          columns: [
            { key: 'product', label: 'Product', width: '72%' },
            { key: 'total', label: 'Total', width: '28%' },
          ],
          rows: [{ key: 'r1', label: '' }],
        },
        [`${tableId}_r1_product`]: { type: 'text', label: 'Product' },
        [`${tableId}_r1_total`]: { type: 'text', label: 'Total' },
        grand_total_label_2: { type: 'text', label: 'Total label 2' },
        grand_total_value_2: { type: 'text', label: 'Total value 2' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'main',
            segments: [
              { type: 'table', id: tableId, rows: [{ key: 'r1', label: '' }] },
              {
                type: 'columns',
                widths: ['50%', '50%'],
                columns: [
                  [{ type: 'field', id: 'grand_total_label_2' }],
                  [{ type: 'field', id: 'grand_total_value_2' }],
                ],
              },
            ],
            fieldValues: {
              [`${tableId}_r1_product`]: 'Item',
              [`${tableId}_r1_total`]: '$100.00',
              grand_total_label_2: 'Total:',
              grand_total_value_2: '$100.00',
            },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    const grid = root.querySelector('.document-columns__grid') as HTMLElement | null;
    assert.ok(grid, 'columns grid should render');
    assert.equal(grid?.style.gridTemplateColumns, '72% 28%');
  });

  it('overrides explicit totals columns split after a table in preview', () => {
    const tableId = 'products_table_custom_split';
    const doc = {
      fieldSchemas: {
        [tableId]: {
          type: 'table',
          label: 'Products',
          columns: [
            { key: 'product', label: 'Product', width: '72%' },
            { key: 'total', label: 'Total', width: '28%' },
          ],
          rows: [{ key: 'r1', label: '' }],
        },
        [`${tableId}_r1_product`]: { type: 'text', label: 'Product' },
        [`${tableId}_r1_total`]: { type: 'text', label: 'Total' },
        grand_total_label_3: { type: 'text', label: 'Total label 3' },
        grand_total_value_3: { type: 'text', label: 'Total value 3' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'main',
            segments: [
              { type: 'table', id: tableId, rows: [{ key: 'r1', label: '' }] },
              {
                type: 'columns',
                widths: ['60%', '40%'],
                columns: [
                  [{ type: 'field', id: 'grand_total_label_3' }],
                  [{ type: 'field', id: 'grand_total_value_3' }],
                ],
              },
            ],
            fieldValues: {
              [`${tableId}_r1_product`]: 'Item',
              [`${tableId}_r1_total`]: '$100.00',
              grand_total_label_3: 'Total:',
              grand_total_value_3: '$100.00',
            },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    const grid = root.querySelector('.document-columns__grid') as HTMLElement | null;
    assert.ok(grid, 'columns grid should render');
    assert.equal(grid?.style.gridTemplateColumns, '72% 28%');
  });

  it('inherits table last-column split across consecutive preview sections', () => {
    const tableId = 'products_table_cross_section';
    const doc = {
      fieldSchemas: {
        [tableId]: {
          type: 'table',
          label: 'Products',
          columns: [
            { key: 'product', label: 'Product', width: '72%' },
            { key: 'total', label: 'Total', width: '28%' },
          ],
          rows: [{ key: 'r1', label: '' }],
        },
        [`${tableId}_r1_product`]: { type: 'text', label: 'Product' },
        [`${tableId}_r1_total`]: { type: 'text', label: 'Total' },
        grand_total_label_4: { type: 'text', label: 'Total label 4' },
        grand_total_value_4: { type: 'text', label: 'Total value 4' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Products',
            hideTitleInPreview: true,
            segments: [
              { type: 'table', id: tableId, rows: [{ key: 'r1', label: '' }] },
            ],
            fieldValues: {
              [`${tableId}_r1_product`]: 'Item',
              [`${tableId}_r1_total`]: '$100.00',
            },
          },
        },
        {
          type: 'documentSection',
          data: {
            label: 'Totals',
            hideTitleInPreview: true,
            segments: [
              {
                type: 'columns',
                widths: ['60%', '40%'],
                columns: [
                  [{ type: 'field', id: 'grand_total_label_4' }],
                  [{ type: 'field', id: 'grand_total_value_4' }],
                ],
              },
            ],
            fieldValues: {
              grand_total_label_4: 'Total:',
              grand_total_value_4: '$100.00',
            },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    const grid = root.querySelector('.document-columns__grid') as HTMLElement | null;
    assert.ok(grid, 'columns grid should render in the Totals section');
    assert.equal(grid?.style.gridTemplateColumns, '72% 28%');
  });

  it('applies field highlight CSS vars on preview root', () => {
    const doc = {
      pageSetup: { fieldHighlight: { color: '#7c3aed' } },
      fieldSchemas,
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Огляд',
            segments: [{ type: 'field', id: 'diagnosis' }],
            fieldValues: { diagnosis: ['Test diagnosis'] },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    assert.equal(root.style.getPropertyValue('--me-field-fill-color'), '#7C3AED');
    const token = root.querySelector('.field-token--preview');
    assert.ok(token, 'preview field token should render');
  });

  it('omits sections hidden by visibility rules', () => {
    const doc = {
      fieldSchemas: {
        status: { type: 'text', name: 'Status' },
        hiddenNote: { type: 'text', name: 'Hidden note' },
        visibleNote: { type: 'text', name: 'Visible note' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Driver',
            segments: [{ type: 'field', id: 'status' }],
            fieldValues: { status: 'hide-details' },
          },
        },
        {
          type: 'documentSection',
          data: {
            label: 'Hidden details',
            visibility: {
              fieldId: 'status',
              mode: 'hide',
              operator: 'equals',
              value: 'hide-details',
            },
            segments: [{ type: 'field', id: 'hiddenNote' }],
            fieldValues: { hiddenNote: 'Should not render' },
          },
        },
        {
          type: 'documentSection',
          data: {
            label: 'Visible details',
            visibility: {
              fieldId: 'status',
              mode: 'show',
              operator: 'equals',
              value: 'hide-details',
            },
            segments: [{ type: 'field', id: 'visibleNote' }],
            fieldValues: { visibleNote: 'Should render' },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    assert.doesNotMatch(root.textContent ?? '', /Hidden details/);
    assert.doesNotMatch(root.textContent ?? '', /Should not render/);
    assert.match(root.textContent ?? '', /Visible details/);
    assert.match(root.textContent ?? '', /Should render/);
  });

  it('omits the section title when hideTitleInPreview is true', () => {
    const doc = {
      fieldSchemas: {
        complaints: { type: 'text', name: 'Complaints' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Anamnesis',
            hideTitleInPreview: true,
            segments: [{ type: 'field', id: 'complaints' }],
            fieldValues: { complaints: 'Headache' },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    assert.equal(root.querySelector('.document-section__label-text'), null);
    assert.doesNotMatch(root.textContent ?? '', /Anamnesis/);
    assert.match(root.textContent ?? '', /Headache/);
  });

  it('applies top and bottom border classes when borderTop/borderBottom are set', () => {
    const doc = {
      fieldSchemas: {
        vitals: { type: 'text', name: 'Vitals' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Vitals',
            hideTitleInPreview: true,
            borderTop: true,
            borderBottom: true,
            segments: [{ type: 'field', id: 'vitals' }],
            fieldValues: { vitals: '120/80' },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    const wrap = root.querySelector('.preview-document__section-wrap');
    assert.ok(wrap);
    assert.ok(wrap?.classList.contains('document-section--border-top'));
    assert.ok(wrap?.classList.contains('document-section--border-bottom'));
  });

  it('renders image fields from fieldValues data URLs in HTML preview', () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const doc = {
      fieldSchemas: {
        logo_logo: { type: 'image', name: 'logo', label: 'logo', maxWidth: 320 },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'logo',
            hideTitleInPreview: true,
            segments: [{ type: 'field', id: 'logo_logo' }],
            fieldValues: { logo_logo: { url: dataUrl, caption: '' } },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    const img = root.querySelector('img.field-token__thumb') as HTMLImageElement | null;
    assert.ok(img, 'preview should include the image thumb');
    assert.equal(img?.getAttribute('src') || img?.src, dataUrl);
    assert.equal(img?.getAttribute('width'), '320');
    assert.doesNotMatch(root.textContent ?? '', /^logo$/);
  });

  it('renders bullet and inline list field values in document preview', () => {
    const doc = {
      fieldSchemas: {
        painAreas: {
          type: 'list',
          name: 'Pain areas',
          label: 'Areas of pain',
          itemLayout: 'bullet',
          items: [
            { id: 'pain-neck', label: 'Neck pain' },
            { id: 'pain-head', label: 'Headaches' },
          ],
        },
        postImpact: {
          type: 'list',
          name: 'Post-impact',
          label: 'Immediately after impact',
          itemLayout: 'inline',
          items: [
            { id: 'pi-no-loc', label: 'No loss of consciousness' },
            { id: 'pi-no-er', label: 'Did not go to ER' },
          ],
        },
        imaging: {
          type: 'list',
          name: 'Imaging',
          label: 'Imaging referred',
          itemLayout: 'bullet',
          items: [
            { id: 'img-mri-l', label: 'MRI Lumbar Spine' },
            { id: 'img-mri-r-sh', label: 'MRI Right Shoulder' },
          ],
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Accident',
            segments: [
              { type: 'text', content: 'Immediately after impact: ' },
              { type: 'field', id: 'postImpact' },
              { type: 'text', content: '\nPain areas: ' },
              { type: 'field', id: 'painAreas' },
              { type: 'text', content: '\nImaging: ' },
              { type: 'field', id: 'imaging' },
            ],
            fieldValues: {
              postImpact: ['No loss of consciousness', 'Did not go to ER'],
              painAreas: ['Neck pain', 'Headaches'],
              imaging: ['MRI Right Shoulder', 'MRI Lumbar Spine'],
            },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    const text = root.textContent ?? '';
    assert.match(text, /No loss of consciousness;\s*Did not go to ER/);
    assert.match(text, /•\s*Neck pain/);
    assert.match(text, /•\s*Headaches/);
    assert.match(text, /•\s*MRI Right Shoulder/);
    assert.match(text, /•\s*MRI Lumbar Spine/);
  });

  it('resolves choice default ids to labels in document preview', () => {
    const doc = {
      fieldSchemas: {
        causation: {
          type: 'choice',
          name: 'Causation',
          label: 'Causation opinion',
          defaultValue: 'causation-yes',
          items: [
            {
              id: 'causation-yes',
              label: 'Injuries are directly and proximately caused by the accident noted above',
            },
          ],
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Assessment',
            segments: [
              { type: 'text', content: 'Causation: ' },
              { type: 'field', id: 'causation' },
            ],
            fieldValues: { causation: '' },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc, { hideEmptyValues: false });
    const text = root.textContent ?? '';
    assert.match(text, /Injuries are directly and proximately caused/);
    assert.doesNotMatch(text, /causation-yes/);
  });

  it('applies cell backgroundColor on table td in HTML preview', () => {
    const tableId = 'visual_acuity';
    const visOd = cellFieldId(tableId, 'row1', 'vis');
    const visOs = cellFieldId(tableId, 'row2', 'vis');
    const sphOd = cellFieldId(tableId, 'row1', 'sph');
    const doc = {
      kind: 'document',
      version: 1,
      fieldSchemas: {
        [tableId]: {
          type: 'table',
          name: 'Visual acuity',
          label: 'Visual acuity',
          columns: [
            { key: 'sph', label: 'Sph' },
            { key: 'vis', label: 'Vis' },
          ],
          rows: [
            { key: 'row1', label: 'OD' },
            { key: 'row2', label: 'OS' },
          ],
        },
        [visOd]: {
          type: 'text',
          label: 'Vis',
          displayStyle: { backgroundColor: '#e8eef5' },
        },
        [visOs]: {
          type: 'text',
          label: 'Vis',
          displayStyle: { backgroundColor: '#e8eef5' },
        },
        [sphOd]: { type: 'text', label: 'Sph' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            label: 'Visual acuity',
            segments: [{ type: 'table', id: tableId }],
            fieldValues: {
              [visOd]: '0.3',
              [visOs]: '0.9',
              [sphOd]: '-1.00',
            },
          },
        },
      ],
    };

    const root = renderDocumentPreview(doc);
    const visTokens = [...root.querySelectorAll('.field-token--cell')].filter(
      (token: any) => token.dataset.colKey === 'vis' || String(token.dataset.fieldId ?? '').endsWith('_vis'),
    );
    assert.ok(visTokens.length >= 1);
    for (const token of visTokens) {
      const td = token.closest('td');
      assert.ok(td);
      assert.match(td.style.backgroundColor, /^(#e8eef5|rgb\(232,\s*238,\s*245\))$/i);
      assert.equal((token as HTMLElement).style.backgroundColor, '');
    }
  });

  it('clones a section once per repeatableSectionInstances entry (_source arrays)', () => {
    const doc = {
      fieldSchemas: {
        letter_date: { type: 'text', name: 'Date', label: 'Date', defaultValue: '' },
        letter_to: { type: 'text', name: 'To', label: 'To', defaultValue: '' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'letter',
            label: 'Letter',
            repeatable: true,
            borderBottom: true,
            segments: [
              { type: 'text', content: 'Date: ' },
              { type: 'field', id: 'letter_date' },
              { type: 'text', content: ' To: ' },
              { type: 'field', id: 'letter_to' },
            ],
            fieldValues: {
              letter_date: '2',
              letter_to: 'Test name',
            },
          },
        },
      ],
      repeatableSectionInstances: {
        letter: [
          { Date: '2', To: 'Test name' },
          { Date: '5', To: 'Test name' },
        ],
      },
    };

    const root = renderDocumentPreview(doc);
    const wraps = root.querySelectorAll('.preview-document__section-wrap');
    assert.equal(wraps.length, 2, root.textContent);
    // "Show on each page" → section title on every instance.
    assert.equal(root.querySelectorAll('.document-section__header').length, 2);
    assert.equal(root.querySelectorAll('.document-section__label-text').length, 2);
    assert.equal(root.querySelector('.document-section__label-text')?.textContent, 'Letter');
    assert.match(root.textContent ?? '', /Date:\s*2/);
    assert.match(root.textContent ?? '', /Date:\s*5/);
    // Section borderBottom applies to every repeated row.
    assert.equal(root.querySelectorAll('.document-section--border-bottom').length, 2);
  });

  it('keeps title once for _source clones when Show on each page is off', () => {
    const doc = {
      fieldSchemas: {
        letter_date: { type: 'text', name: 'Date', label: 'Date', defaultValue: '' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'letter',
            label: 'Letter',
            repeatable: false,
            borderBottom: true,
            segments: [
              { type: 'text', content: 'Date: ' },
              { type: 'field', id: 'letter_date' },
            ],
            fieldValues: { letter_date: '2' },
          },
        },
      ],
      repeatableSectionInstances: {
        letter: [{ Date: '2' }, { Date: '5' }],
      },
    };

    const root = renderDocumentPreview(doc);
    assert.equal(root.querySelectorAll('.preview-document__section-wrap').length, 2);
    assert.equal(root.querySelectorAll('.document-section__header').length, 1);
  });

  it('marks continuation rows with new-page class when eachRowOnNewPage is set', () => {
    const doc = {
      fieldSchemas: {
        letter_date: { type: 'text', name: 'Date', label: 'Date', defaultValue: '' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'letter',
            label: 'Letter',
            repeatable: true,
            eachRowOnNewPage: true,
            segments: [
              { type: 'text', content: 'Date: ' },
              { type: 'field', id: 'letter_date' },
            ],
            fieldValues: { letter_date: '2' },
          },
        },
      ],
      repeatableSectionInstances: {
        letter: [{ Date: '2' }, { Date: '5' }],
      },
    };

    const root = renderDocumentPreview(doc);
    const wraps = root.querySelectorAll('.preview-document__section-wrap');
    assert.equal(wraps.length, 2);
    // Title on every page when each row starts a new page.
    assert.equal(root.querySelectorAll('.document-section__header').length, 2);
    assert.equal(wraps[0].classList.contains('preview-document__section-wrap--new-page'), false);
    assert.equal(wraps[1].classList.contains('preview-document__section-wrap--new-page'), true);
  });

  it('repeats a separate Show-on-each-page header before every eachRowOnNewPage row', () => {
    const doc = {
      fieldSchemas: {
        amount: { type: 'number', name: 'amount', label: 'amount' },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'hdr',
            label: '',
            hideTitleInPreview: true,
            repeatable: true,
            segments: [{ type: 'text', content: 'page header' }],
            fieldValues: {},
          },
        },
        {
          type: 'documentSection',
          data: {
            name: 'body',
            label: 'Body',
            hideTitleInPreview: true,
            eachRowOnNewPage: true,
            borderBottom: true,
            segments: [
              { type: 'text', content: 'amount: ' },
              { type: 'field', id: 'amount' },
            ],
            fieldValues: { amount: 2 },
          },
        },
      ],
      repeatableSectionInstances: {
        body: [{ amount: 2 }, { amount: 5 }],
      },
    };

    const root = renderDocumentPreview(doc);
    const text = root.textContent ?? '';
    assert.equal([...text.matchAll(/page header/g)].length, 2, text);
    assert.match(text, /page header[\s\S]*amount:\s*2[\s\S]*page header[\s\S]*amount:\s*5/);
  });

  it('renders nested master-detail table rows from loaded section instances', () => {
    const tableId = 'table_1';
    const doc = {
      fieldSchemas: {
        amount: { type: 'text', name: 'amount', label: 'amount', defaultValue: '' },
        [tableId]: {
          type: 'table',
          name: 'Table',
          label: 'Table',
          columns: [{ key: 'column_1', label: 'Name' }],
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Letter',
            label: 'Letter',
            hideTitleInPreview: true,
            segments: [
              { type: 'field', id: 'amount' },
              { type: 'text', content: ':' },
              {
                type: 'table',
                id: tableId,
                // Seed single row — instances must expand to 3 / 2 rows.
                rows: [{ key: 'row1', label: '' }],
              },
            ],
            fieldValues: {
              amount: 'Test name 2',
              [`${tableId}_row1_column_1`]: 'value1',
            },
          },
        },
      ],
      loadedDocumentSections: {
        Letter: [
          {
            amount: 'Test name 2',
            Table: [
              { column_1: 'value1' },
              { column_1: 'value2' },
              { column_1: 'value3' },
            ],
          },
          {
            amount: 'Test name 5',
            Table: [{ column_1: 'value1' }, { column_1: 'value2' }],
          },
        ],
      },
    };

    const root = renderDocumentPreview(doc);
    const text = (root.textContent ?? '').replace(/\s+/g, ' ');
    assert.match(text, /Test name 2/);
    assert.match(text, /Test name 5/);
    assert.match(text, /value1.*value2.*value3.*Test name 5.*value1.*value2/);
    const rowCounts = [...root.querySelectorAll('table')].map(
      (table) => table.querySelectorAll('tbody tr').length,
    );
    assert.deepEqual(rowCounts, [3, 2]);
  });

  it('expands master-detail rows when the table is nested inside columns', () => {
    const tableId = 'table_1';
    const doc = {
      fieldSchemas: {
        amount: { type: 'text', name: 'amount', label: 'amount', defaultValue: '' },
        [tableId]: {
          type: 'table',
          name: 'Table',
          label: 'Table',
          columns: [{ key: 'column_1', label: 'Name' }],
        },
      },
      blocks: [
        {
          type: 'documentSection',
          data: {
            name: 'Letter',
            label: 'Letter',
            hideTitleInPreview: true,
            segments: [
              { type: 'field', id: 'amount' },
              {
                type: 'columns',
                id: 'cols_1',
                columns: [
                  [{ type: 'table', id: tableId, rows: [{ key: 'row1', label: '' }] }],
                  [],
                ],
              },
            ],
            fieldValues: {
              amount: 'Test name 2',
              [`${tableId}_row1_column_1`]: 'value1',
            },
          },
        },
      ],
      loadedDocumentSections: {
        Letter: [
          {
            amount: 'Test name 2',
            Table: [
              { column_1: 'value1' },
              { column_1: 'value2' },
              { column_1: 'value3' },
            ],
          },
          {
            amount: 'Test name 5',
            Table: [{ column_1: 'valueA' }, { column_1: 'valueB' }],
          },
        ],
      },
    };

    const root = renderDocumentPreview(doc);
    const text = (root.textContent ?? '').replace(/\s+/g, ' ');
    assert.match(text, /value1.*value2.*value3.*Test name 5.*valueA.*valueB/);
    const rowCounts = [...root.querySelectorAll('table')].map(
      (table) => table.querySelectorAll('tbody tr').length,
    );
    assert.deepEqual(rowCounts, [3, 2]);
  });
});
