import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  addTableRowsFromText,
  buildTableElement,
  buildPreviewTableElement,
  parseTableRowLabelsText,
  readTableRowsFromDom,
  syncTableRowsDataset,
  applyTableColumnWidthsToElement,
  shouldShowTableRowActions,
} from './table-field.js';
import { SchemaRegistry } from '../registry/schema-registry.js';
import { syncFillComputedFields, updateFieldToken, refreshTableCellTokens } from './inline-fields.js';

before(() => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.CSS = { escape: (value: any) => String(value).replace(/"/g, '\\"') } as any;
});

describe('shouldShowTableRowActions', () => {
  it('shows the panel in design mode even when allowAddRows is off', () => {
    assert.equal(shouldShowTableRowActions({ type: 'table' }, true), true);
    assert.equal(shouldShowTableRowActions({ type: 'table', allowAddRows: false }, true), true);
  });

  it('hides the panel in fill mode by default', () => {
    assert.equal(shouldShowTableRowActions({ type: 'table' }, false), false);
    assert.equal(shouldShowTableRowActions({ type: 'table', allowAddRows: false }, false), false);
  });

  it('shows the panel in fill mode when allowAddRows is enabled', () => {
    assert.equal(shouldShowTableRowActions({ type: 'table', allowAddRows: true }, false), true);
  });

  it('keeps the panel hidden for read-only tables in fill mode', () => {
    assert.equal(
      shouldShowTableRowActions({ type: 'table', allowAddRows: true, readonly: true }, false),
      false,
    );
  });
});

describe('table presentation options', () => {
  const tableId = 'exam_table';
  const fieldSchemas = {
    [tableId]: {
      type: 'table',
      label: 'Table',
      name: 'Table',
      columns: [
        { key: 'id', label: 'id' },
        { key: 'items', label: 'items' },
      ],
      rows: [{ key: 'row1', label: '' }],
      hideHeader: true,
      hideBorders: true,
    },
    [`${tableId}_row1_id`]: { type: 'text', label: 'id' },
    [`${tableId}_row1_items`]: { type: 'text', label: 'items' },
  };

  it('shows header and borders in design mode even when hide options are set', () => {
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      fieldSchemas,
      tableRows: [{ key: 'row1', label: '' }],
    });
    assert.equal(table.classList.contains('vision-table--borderless'), false);
    assert.equal(table.classList.contains('vision-table--no-header'), false);
    const thead = table.querySelector('thead');
    assert.ok(thead);
    assert.equal(thead.classList.contains('vision-table__resize-head'), false);
    assert.match(thead.textContent ?? '', /id/);
    // Design mode header is always shown, so column resize stays available.
    assert.equal(table.querySelectorAll('.vision-table__col-resizer').length, 1);
    assert.ok(table.querySelector('tbody tr'));
  });

  it('omits thead and adds presentation classes in preview table render', () => {
    const table = buildPreviewTableElement(tableId, {
      [`${tableId}_row1_id`]: '1',
      [`${tableId}_row1_items`]: 'a',
    }, { fieldSchemas });
    assert.ok(table);
    assert.equal(table.classList.contains('vision-table--borderless'), true);
    assert.equal(table.classList.contains('vision-table--no-header'), true);
    assert.equal(table.querySelector('thead'), null);
  });

  it('styles empty design-mode cells like fill-mode highlights (no value color)', () => {
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      fieldSchemas,
      tableRows: [{ key: 'row1', label: '' }],
      fieldValueStyle: { default: { color: '#ff0000', fontStyle: 'italic' } },
    });
    const emptyCell = table.querySelector('.field-token--cell.field-token--design.field-token--empty');
    assert.ok(emptyCell);
    // Highlight CSS owns color/weight; inline value color must not stick.
    assert.notEqual(emptyCell.style.color, '#ff0000');
    assert.ok(!emptyCell.style.color || emptyCell.style.color === '');
    assert.ok(!emptyCell.style.fontWeight || emptyCell.style.fontWeight === '');
  });
});

describe('table column widths', () => {
  const tableId = 'line_items';
  const columns = [
    { key: 'product', label: 'Product', width: '42%' },
    { key: 'total', label: 'Total', width: '17%' },
  ];
  const fieldSchemas = {
    [tableId]: {
      type: 'table',
      label: 'Line Items',
      name: 'Line Items',
      columns,
      rows: [{ key: 'row1', label: '' }],
    },
    [`${tableId}_row1_product`]: { type: 'text', label: 'Product' },
    [`${tableId}_row1_total`]: { type: 'text', label: 'Total' },
  };

  it('applies plain percent widths in design mode', () => {
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      fieldSchemas,
      tableRows: [{ key: 'row1', label: '' }],
    });
    const cols = [...table.querySelectorAll(':scope > colgroup > col')];
    assert.equal(cols.length, 2);
    assert.equal(cols[0].style.width, '71.2%');
    assert.equal(cols[1].style.width, '28.8%');
    assert.equal(cols[0].style.minWidth, cols[0].style.width);
    assert.equal(cols[1].style.minWidth, cols[1].style.width);
    assert.equal(cols[0].style.maxWidth, '');
    assert.equal(cols[1].style.maxWidth, '');
    const headers = [...table.querySelectorAll('th')];
    assert.equal(headers[0]?.style.width, '71.2%');
    assert.equal(headers[1]?.style.width, '28.8%');
    assert.equal((table.querySelector('td:last-child') as HTMLElement | null)?.style.width ?? '', '');
    const removeBtn = table.querySelector('[data-action="remove-table-row"]');
    assert.ok(removeBtn);
    assert.ok(removeBtn?.closest('td')?.classList.contains('vision-table__cell--with-remove'));
    assert.equal(table.querySelectorAll('td.vision-table__row-actions').length, 0);
  });

  it('keeps plain percent widths in preview (no row-actions column)', () => {
    const table = buildPreviewTableElement(tableId, {
      [`${tableId}_row1_product`]: 'Widget',
      [`${tableId}_row1_total`]: '10',
    }, { fieldSchemas });
    const cols = [...table.querySelectorAll(':scope > colgroup > col')];
    assert.equal(cols.length, 2);
    assert.equal(cols[0].style.width, '71.2%');
    assert.equal(cols[1].style.width, '28.8%');
    assert.equal(cols[0].style.maxWidth, '');
    assert.equal(cols[1].style.maxWidth, '');
    const headers = [...table.querySelectorAll('th')];
    assert.equal(headers[0]?.style.width, '71.2%');
    assert.equal(headers[1]?.style.width, '28.8%');
    assert.equal((table.querySelector('td:last-child') as HTMLElement | null)?.style.width ?? '', '');
    assert.equal(table.style.width, '100%');
  });

  it('updates live col widths from schema without rebuilding the table', () => {
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      fieldSchemas,
      tableRows: [{ key: 'row1', label: '' }],
    });
    applyTableColumnWidthsToElement(table, [
      { key: 'product', width: '70%' },
      { key: 'total', width: '30%' },
    ]);
    const cols = [...table.querySelectorAll(':scope > colgroup > col')];
    assert.equal(cols[0].style.width, '70%');
    assert.equal(cols[1].style.width, '30%');
  });
});

describe('addTableRowsFromText', () => {
  it('parses one label per non-empty line', () => {
    assert.deepEqual(parseTableRowLabelsText('OD\nOS\n\nOU\n'), ['OD', 'OS', 'OU']);
  });

  it('appends labeled rows from pasted text', () => {
    const tableId = 'va_table';
    const fieldSchemas = {
      [tableId]: {
        type: 'table',
        label: 'VA',
        name: 'VA',
        showRowLabels: true,
        columns: [
          { key: 'vis', label: 'VIS' },
          { key: 'sph', label: 'SPH' },
        ],
        rows: [
          { key: 'od', label: 'OD' },
          { key: 'os', label: 'OS' },
        ],
      },
      [`${tableId}_od_vis`]: { type: 'text', label: 'VIS' },
      [`${tableId}_od_sph`]: { type: 'text', label: 'SPH' },
      [`${tableId}_os_vis`]: { type: 'text', label: 'VIS' },
      [`${tableId}_os_sph`]: { type: 'text', label: 'SPH' },
    };
    const registry = new SchemaRegistry({ fieldSchemas });
    const wrapper = document.createElement('div');
    wrapper.className = 'document-table';
    wrapper.dataset.tableId = tableId;
    syncTableRowsDataset(wrapper, [
      { key: 'od', label: 'OD' },
      { key: 'os', label: 'OS' },
    ]);
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      getRegistry: () => registry,
      tableRows: [
        { key: 'od', label: 'OD' },
        { key: 'os', label: 'OS' },
      ],
    });
    wrapper.appendChild(table);

    const added = addTableRowsFromText(wrapper, 'OU\nGlasses\n', {
      designMode: true,
      getRegistry: () => registry,
    });

    assert.deepEqual(added, [
      { key: 'ou', label: 'OU' },
      { key: 'glasses', label: 'Glasses' },
    ]);
    assert.deepEqual(readTableRowsFromDom(wrapper), [
      { key: 'od', label: 'OD' },
      { key: 'os', label: 'OS' },
      { key: 'ou', label: 'OU' },
      { key: 'glasses', label: 'Glasses' },
    ]);
    assert.equal(wrapper.querySelectorAll('.vision-table tbody tr').length, 4);
    assert.match(wrapper.textContent ?? '', /OU/);
    assert.match(wrapper.textContent ?? '', /Glasses/);
  });
});

describe('preview table computed cells', () => {
  it('renders computed row totals in preview mode', () => {
    const tableId = 'products_line_items';
    const rows = [
      { key: 'r1', label: '' },
      { key: 'r2', label: '' },
    ];
    const fieldSchemas = {
      [tableId]: {
        type: 'table',
        label: 'Products',
        name: 'Line Items',
        columns: [
          { key: 'quantity', label: 'Quantity', name: 'Quantity' },
          { key: 'unitPrice', label: 'Unit Price', name: 'Unit Price' },
          { key: 'total', label: 'Total', name: 'Total' },
        ],
        rows,
      },
      totals_sub_total: {
        type: 'computed',
        label: 'Sub-Total',
        name: 'Sub-Total',
        formula: 'sum({Products.Line Items.Total})',
      },
      [`${tableId}_r1_quantity`]: { type: 'text', label: 'Quantity' },
      [`${tableId}_r1_unitPrice`]: { type: 'text', label: 'Unit Price' },
      [`${tableId}_r1_total`]: {
        type: 'computed',
        label: 'Total',
        formula: '{Products.Line Items.Quantity} * {Products.Line Items.Unit Price}',
      },
      [`${tableId}_r2_quantity`]: { type: 'text', label: 'Quantity' },
      [`${tableId}_r2_unitPrice`]: { type: 'text', label: 'Unit Price' },
      [`${tableId}_r2_total`]: {
        type: 'computed',
        label: 'Total',
        formula: '{Products.Line Items.Quantity} * {Products.Line Items.Unit Price}',
      },
    };
    const blocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Products',
          segments: [{ type: 'table', id: tableId, rows }],
        },
      },
      {
        type: 'documentSection',
        data: {
          name: 'Totals',
          segments: [{ type: 'field', id: 'totals_sub_total' }],
        },
      },
    ];
    const values = {
      [`${tableId}_r1_quantity`]: '1',
      [`${tableId}_r1_unitPrice`]: '1000',
      [`${tableId}_r2_quantity`]: '3',
      [`${tableId}_r2_unitPrice`]: '1000',
    };

    const table = buildPreviewTableElement(tableId, values, {
      fieldSchemas,
      blocks,
      previewContext: { fieldSchemas, blocks, previewMode: true },
      tableRows: rows,
    });

    const totalCells = [...table.querySelectorAll('.field-token--cell[data-field-id$="_total"]')]
      .map((el: any) => (el.textContent ?? '').trim());
    assert.deepEqual(totalCells, ['1000', '3000']);
  });
});

describe('fill table computed cells', () => {
  const tableId = 'products_line_items';
  const rows = [{ key: 'r1', label: '' }];
  const qtyId = `${tableId}_r1_quantity`;
  const priceId = `${tableId}_r1_unitPrice`;
  const totalId = `${tableId}_r1_total`;

  function setupFillRow(quantity: string, unitPrice: string) {
    const fieldSchemas: any = {
      [tableId]: {
        type: 'table',
        label: 'Products',
        name: 'Line Items',
        columns: [
          { key: 'quantity', label: 'Quantity', name: 'Quantity' },
          { key: 'unitPrice', label: 'Unit Price', name: 'Unit Price' },
          { key: 'total', label: 'Total', name: 'Total' },
        ],
        rows,
      },
      [qtyId]: { type: 'text', label: 'Quantity', name: 'Quantity' },
      [priceId]: { type: 'text', label: 'Unit Price', name: 'Unit Price' },
      [totalId]: {
        type: 'computed',
        label: 'Total',
        name: 'Total',
        formula: '{Products.Line Items.Quantity} * {Products.Line Items.Unit Price}',
      },
    };
    const blocks = [
      {
        type: 'documentSection',
        data: {
          name: 'Products',
          segments: [{ type: 'table', id: tableId, rows }],
        },
      },
    ];
    const registry = new SchemaRegistry();
    registry.setFieldSchemas(fieldSchemas);
    registry.setBlocks(blocks);

    const values = { [qtyId]: quantity, [priceId]: unitPrice };
    const holder = document.createElement('div');
    holder.setAttribute('data-doc-editor', '');
    const section = document.createElement('div');
    section.className = 'document-section__body';
    const table = buildTableElement(tableId, values, {
      fieldSchemas,
      blocks,
      tableRows: rows,
      getRegistry: () => registry,
    });
    section.appendChild(table);
    holder.appendChild(section);
    return { holder, section, registry, values };
  }

  it('recomputes the row total from a just-saved quantity before the token is painted', () => {
    const { holder, section, registry, values } = setupFillRow('1', '50');
    const totalToken = section.querySelector(`[data-field-id="${totalId}"]`);
    assert.equal((totalToken?.textContent ?? '').trim(), '50');

    const nextValues = { ...values, [qtyId]: '2' };
    syncFillComputedFields(section, nextValues, {
      getRegistry: () => registry,
      editorHolder: holder,
      changedFieldId: qtyId,
    });

    assert.equal((totalToken?.textContent ?? '').trim(), '100');
  });

  it('recomputes the row total after the quantity token is painted', () => {
    const { holder, section, registry, values } = setupFillRow('1', '50');
    const qtyToken = section.querySelector(`[data-field-id="${qtyId}"]`);
    const totalToken = section.querySelector(`[data-field-id="${totalId}"]`);
    assert.ok(qtyToken);
    updateFieldToken(qtyToken, '2', 'Quantity', {
      getRegistry: () => registry,
      isTableCell: true,
    });

    syncFillComputedFields(section, { ...values, [qtyId]: '2' }, {
      getRegistry: () => registry,
      editorHolder: holder,
    });

    assert.equal((totalToken?.textContent ?? '').trim(), '100');
  });

  it('keeps computed cell styles when table tokens are refreshed after save', () => {
    const fieldValueStyle = {
      default: { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '11px' },
    };
    const { holder, section, registry, values } = setupFillRow('1', '1000');
    syncFillComputedFields(section, values, {
      getRegistry: () => registry,
      editorHolder: holder,
      fieldValueStyle,
    });

    const totalToken = section.querySelector(`[data-field-id="${totalId}"]`) as HTMLElement;
    assert.ok(totalToken?.classList.contains('field-token--computed'));
    const beforeFont = totalToken.style.fontFamily;
    const beforeSize = totalToken.style.fontSize;
    const beforeText = (totalToken.textContent ?? '').trim();
    assert.match(beforeFont, /Helvetica/);
    assert.equal(beforeSize, '11px');

    refreshTableCellTokens(section, {
      getRegistry: () => registry,
      editorHolder: holder,
      fieldValueStyle,
    });

    assert.equal(totalToken.style.fontFamily, beforeFont);
    assert.equal(totalToken.style.fontSize, beforeSize);
    assert.equal((totalToken.textContent ?? '').trim(), beforeText);
  });
});

describe('table readonly when filling', () => {
  const tableId = 'readonly_va';
  const fieldSchemas = {
    [tableId]: {
      type: 'table',
      label: 'Visual acuity',
      name: 'Visual acuity',
      readonly: true,
      columns: [
        { key: 'eye', label: 'Eye' },
        { key: 'sph', label: 'Sph' },
      ],
      rows: [
        { key: 'od', label: 'OD' },
        { key: 'os', label: 'OS' },
      ],
    },
    [`${tableId}_od_eye`]: { type: 'text', label: 'Eye' },
    [`${tableId}_od_sph`]: { type: 'text', label: 'Sph' },
    [`${tableId}_os_eye`]: { type: 'text', label: 'Eye' },
    [`${tableId}_os_sph`]: { type: 'text', label: 'Sph' },
  };

  it('marks fill-mode cells as readonly and omits row remove controls', () => {
    const table = buildTableElement(tableId, {
      [`${tableId}_od_eye`]: 'OD',
      [`${tableId}_od_sph`]: '-1.00',
    }, {
      fieldSchemas,
      tableRows: [
        { key: 'od', label: 'OD' },
        { key: 'os', label: 'OS' },
      ],
    });

    const cells = [...table.querySelectorAll('.field-token--cell')];
    assert.ok(cells.length >= 2);
    for (const cell of cells) {
      assert.ok(cell.classList.contains('field-token--readonly'));
    }
    assert.equal(table.querySelector('[data-action="remove-table-row"]'), null);
  });

  it('keeps design-mode row remove controls even when table is readonly', () => {
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      fieldSchemas,
      tableRows: [
        { key: 'od', label: 'OD' },
        { key: 'os', label: 'OS' },
      ],
    });
    assert.ok(table.querySelector('[data-action="remove-table-row"]'));
  });
});
