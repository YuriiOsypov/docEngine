import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  applyPercentWidthsToColumns,
  clampColumnWidthPx,
  percentToColWidthCss,
  redistributeAdjacentWidths,
  scalePercentCssWidthsToFill,
  widthsPxToPercents,
  wireTableColumnResize,
} from './wire-table-column-resize.js';
import { buildTableElement } from './table-field.js';

before(() => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.window = window;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.CSS = { escape: (value: any) => String(value).replace(/"/g, '\\"') } as any;
});

describe('wire-table-column-resize helpers', () => {
  it('clamps column widths to the minimum', () => {
    assert.equal(clampColumnWidthPx(12), 40);
    assert.equal(clampColumnWidthPx(120.6), 121);
  });

  it('maps measured pixel widths onto percent column defs of the table', () => {
    const next = applyPercentWidthsToColumns(
      [
        { key: 'a', label: 'A', width: 'auto' },
        { key: 'b', label: 'B' },
      ],
      [234, 234],
      500,
    );
    assert.equal(next[0].width, '50%');
    assert.equal(next[1].width, '50%');
    assert.deepEqual(widthsPxToPercents([140, 120], 260), [53.8, 46.2]);
  });

  it('uses plain percents for col CSS', () => {
    assert.equal(percentToColWidthCss(42), '42%');
    assert.equal(percentToColWidthCss(58.5), '58.5%');
  });

  it('scales percent col widths so they fill the table', () => {
    assert.deepEqual(scalePercentCssWidthsToFill(['42%', '17%']), ['71.2%', '28.8%']);
    assert.deepEqual(scalePercentCssWidthsToFill(['70%', '30%']), ['70%', '30%']);
    assert.deepEqual(scalePercentCssWidthsToFill(['40%', '']), ['40%', '']);
  });

  it('keeps adjacent pair total constant when redistributing', () => {
    assert.deepEqual(redistributeAdjacentWidths([100, 100], 0, 40), [140, 60]);
    assert.deepEqual(redistributeAdjacentWidths([100, 100], 0, -40), [60, 140]);
    assert.deepEqual(redistributeAdjacentWidths([100, 100], 1, 40), [60, 140]);
    assert.deepEqual(redistributeAdjacentWidths([80, 100, 120], 0, 20), [100, 80, 120]);
  });
});

describe('table column resize handles', () => {
  const tableId = 'resize_table';
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
    },
    [`${tableId}_row1_id`]: { type: 'text', label: 'id' },
    [`${tableId}_row1_items`]: { type: 'text', label: 'items' },
  };

  it('adds resizer handles in design mode', () => {
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      fieldSchemas,
      tableRows: [{ key: 'row1', label: '' }],
    });
    const handles = table.querySelectorAll('.vision-table__col-resizer');
    assert.equal(handles.length, 1);
    assert.equal((handles[0] as HTMLElement).dataset.colIndex, '0');
    assert.equal(table.dataset.colResizeWired, 'true');
  });

  it('offers resize handles when the header is hidden for preview', () => {
    const schemas = {
      ...fieldSchemas,
      [tableId]: { ...fieldSchemas[tableId], hideHeader: true },
    };
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      fieldSchemas: schemas,
      tableRows: [{ key: 'row1', label: '' }],
    });
    assert.ok(table.querySelector('thead'));
    assert.match(table.querySelector('thead')?.textContent ?? '', /id/);
    assert.equal(table.querySelectorAll('.vision-table__col-resizer').length, 1);
    assert.equal(table.dataset.colResizeWired, 'true');
  });

  it('persists dragged widths as percents of the table', () => {
    /** @type {Record<string, any>} */
    let schemas = structuredClone(fieldSchemas);
    const registry = {
      getFieldSchemas: () => schemas,
      updateFieldSchema(id: any, schema: any) {
        schemas = { ...schemas, [id]: schema };
      },
    };

    const table = document.createElement('table');
    table.className = 'vision-table';
    table.getBoundingClientRect = () => ({
      width: 400,
      height: 40,
      top: 0,
      left: 0,
      right: 400,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const colgroup = document.createElement('colgroup');
    const col0 = document.createElement('col');
    const col1 = document.createElement('col');
    colgroup.appendChild(col0);
    colgroup.appendChild(col1);
    table.appendChild(colgroup);

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.innerHTML = '<span class="vision-table__col-resizer" data-col-index="0"></span>';
    const th1 = document.createElement('th');
    th1.innerHTML = '<span class="vision-table__col-resizer" data-col-index="1"></span>';
    tr.appendChild(th0);
    tr.appendChild(th1);
    thead.appendChild(tr);
    table.appendChild(thead);
    document.body.appendChild(table);

    [col0, col1].forEach((col: any, index: any) => {
      col.getBoundingClientRect = () => ({
        width: 100 + index * 20,
        height: 20,
        top: 0,
        left: 0,
        right: 100,
        bottom: 20,
        x: 0,
        y: 0,
        toJSON() {},
      });
    });

    let committed: any = null;
    wireTableColumnResize(table, {
      tableId,
      getRegistry: () => registry,
      onTableColumnWidthsChange: (id: any, columns: any) => {
        committed = { id, columns };
      },
    });

    const handle = table.querySelector('.vision-table__col-resizer[data-col-index="0"]');
    assert.ok(handle);

    function fire(target: any, type: any, clientX: any) {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'button', { value: 0 });
      Object.defineProperty(event, 'isPrimary', { value: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'clientX', { value: clientX });
      target.dispatchEvent(event);
    }

    fire(handle, 'pointerdown', 50);
    fire(document, 'pointermove', 90);
    fire(document, 'pointerup', 90);

    // Start 100+120 data px; drag +40 → 140/80 → 63.6% / 36.4% of data columns.
    assert.equal((schemas[tableId].columns[0] as any).width, '63.6%');
    assert.equal((schemas[tableId].columns[1] as any).width, '36.4%');
    assert.equal(committed?.id, tableId);
    assert.equal(committed?.columns[0].width, '63.6%');
    assert.equal(col0.style.width, '63.6%');
    assert.equal(col1.style.width, '36.4%');
    assert.equal(th0.style.width, '63.6%');
    assert.equal(th1.style.width, '36.4%');
    table.remove();
  });

  it('persists only the two columns on either side of the dragged splitter', () => {
    /** @type {Record<string, any>} */
    let schemas = {
      [tableId]: {
        type: 'table',
        label: 'Table',
        name: 'Table',
        columns: [
          { key: 'a', label: 'A', width: '40%' },
          { key: 'b', label: 'B', width: '30%' },
          { key: 'c', label: 'C', width: '30%' },
        ],
        rows: [{ key: 'row1', label: '' }],
      },
    };
    const registry = {
      getFieldSchemas: () => schemas,
      updateFieldSchema(id: any, schema: any) {
        schemas = { ...schemas, [id]: schema };
      },
    };

    const table = document.createElement('table');
    table.className = 'vision-table';
    table.getBoundingClientRect = () => ({
      width: 500,
      height: 40,
      top: 0,
      left: 0,
      right: 500,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const colgroup = document.createElement('colgroup');
    const col0 = document.createElement('col');
    const col1 = document.createElement('col');
    const col2 = document.createElement('col');
    col2.style.width = '30%';
    colgroup.append(col0, col1, col2);
    table.appendChild(colgroup);

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.innerHTML = '<span class="vision-table__col-resizer" data-col-index="0"></span>';
    tr.append(th0, document.createElement('th'), document.createElement('th'));
    thead.appendChild(tr);
    table.appendChild(thead);
    document.body.appendChild(table);

    [col0, col1, col2].forEach((col: any, index: any) => {
      const width = [200, 150, 150][index];
      col.getBoundingClientRect = () => ({
        width,
        height: 20,
        top: 0,
        left: 0,
        right: width,
        bottom: 20,
        x: 0,
        y: 0,
        toJSON() {},
      });
    });

    wireTableColumnResize(table, {
      tableId,
      getRegistry: () => registry,
    });

    const handle = table.querySelector('.vision-table__col-resizer[data-col-index="0"]');
    function fire(target: any, type: any, clientX: any) {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'button', { value: 0 });
      Object.defineProperty(event, 'isPrimary', { value: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'clientX', { value: clientX });
      target.dispatchEvent(event);
    }

    fire(handle, 'pointerdown', 50);
    fire(document, 'pointermove', 90);
    fire(document, 'pointerup', 90);

    // Pair 200+150 of a 500px table, drag +40 → 48% / 22%; third column stays 30%.
    assert.equal((schemas[tableId].columns[0] as any).width, '48%');
    assert.equal((schemas[tableId].columns[1] as any).width, '22%');
    assert.equal((schemas[tableId].columns[2] as any).width, '30%');
    assert.equal(col2.style.width, '30%');
    table.remove();
  });

  it('does not persist widths on a click without a drag', () => {
    /** @type {Record<string, any>} */
    let schemas = structuredClone(fieldSchemas);
    schemas[tableId] = {
      ...schemas[tableId],
      columns: [
        { key: 'id', label: 'id', width: '42%' },
        { key: 'items', label: 'items', width: '58%' },
      ],
    } as any;
    const registry = {
      getFieldSchemas: () => schemas,
      updateFieldSchema(id: any, schema: any) {
        schemas = { ...schemas, [id]: schema };
      },
    };

    const table = document.createElement('table');
    table.className = 'vision-table';
    const colgroup = document.createElement('colgroup');
    const col0 = document.createElement('col');
    col0.style.width = '42%';
    const col1 = document.createElement('col');
    col1.style.width = '58%';
    colgroup.appendChild(col0);
    colgroup.appendChild(col1);
    table.appendChild(colgroup);

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.innerHTML = '<span class="vision-table__col-resizer" data-col-index="0"></span>';
    const th1 = document.createElement('th');
    th1.innerHTML = '<span class="vision-table__col-resizer" data-col-index="1"></span>';
    tr.appendChild(th0);
    tr.appendChild(th1);
    thead.appendChild(tr);
    table.appendChild(thead);
    document.body.appendChild(table);

    let committed: any = null;
    wireTableColumnResize(table, {
      tableId,
      getRegistry: () => registry,
      onTableColumnWidthsChange: (id: any, columns: any) => {
        committed = { id, columns };
      },
    });

    const handle = table.querySelector('.vision-table__col-resizer[data-col-index="0"]');
    function fire(target: any, type: any, clientX: any) {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'button', { value: 0 });
      Object.defineProperty(event, 'isPrimary', { value: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'clientX', { value: clientX });
      target.dispatchEvent(event);
    }

    fire(handle, 'pointerdown', 50);
    fire(document, 'pointerup', 50);

    assert.equal(committed, null);
    assert.equal((schemas[tableId].columns[0] as any).width, '42%');
    assert.equal((schemas[tableId].columns[1] as any).width, '58%');
    table.remove();
  });

  it('writes leftover auto columns into the persisted width list', () => {
    /** @type {Record<string, any>} */
    let schemas = {
      [tableId]: {
        type: 'table',
        label: 'Table',
        name: 'Table',
        columns: [
          { key: 'a', label: 'A', width: '40%' },
          { key: 'b', label: 'B', width: '20%' },
          { key: 'c', label: 'C' },
          { key: 'd', label: 'D' },
        ],
        rows: [{ key: 'row1', label: '' }],
      },
    };
    const registry = {
      getFieldSchemas: () => schemas,
      updateFieldSchema(id: any, schema: any) {
        schemas = { ...schemas, [id]: schema };
      },
    };

    const table = document.createElement('table');
    table.className = 'vision-table';
    table.getBoundingClientRect = () => ({
      width: 400,
      height: 40,
      top: 0,
      left: 0,
      right: 400,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const colgroup = document.createElement('colgroup');
    const cols = [0, 1, 2, 3].map(() => document.createElement('col'));
    colgroup.append(...cols);
    table.appendChild(colgroup);

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.innerHTML = '<span class="vision-table__col-resizer" data-col-index="0"></span>';
    tr.append(th0, document.createElement('th'), document.createElement('th'), document.createElement('th'));
    thead.appendChild(tr);
    table.appendChild(thead);
    document.body.appendChild(table);

    cols.forEach((col: any, index: any) => {
      const width = [160, 80, 80, 80][index];
      col.getBoundingClientRect = () => ({
        width,
        height: 20,
        top: 0,
        left: 0,
        right: width,
        bottom: 20,
        x: 0,
        y: 0,
        toJSON() {},
      });
    });

    let committed: any = null;
    wireTableColumnResize(table, {
      tableId,
      getRegistry: () => registry,
      onTableColumnWidthsChange: (_id: any, columns: any) => {
        committed = columns;
      },
    });

    const handle = table.querySelector('.vision-table__col-resizer[data-col-index="0"]');
    function fire(target: any, type: any, clientX: any) {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'button', { value: 0 });
      Object.defineProperty(event, 'isPrimary', { value: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'clientX', { value: clientX });
      target.dispatchEvent(event);
    }

    fire(handle, 'pointerdown', 50);
    fire(document, 'pointermove', 90);
    fire(document, 'pointerup', 90);

    // 160+80+80+80 of 400px; drag +40 → 200/40/80/80 → 50% / 10% / 20% / 20%.
    assert.equal((schemas[tableId].columns[0] as any).width, '50%');
    assert.equal((schemas[tableId].columns[1] as any).width, '10%');
    assert.equal((schemas[tableId].columns[2] as any).width, '20%');
    assert.equal((schemas[tableId].columns[3] as any).width, '20%');
    assert.equal(committed[2].width, '20%');
    table.remove();
  });
});
