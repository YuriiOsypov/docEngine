import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  moveTableColumn,
  resolveTableColumnDropIndex,
  wireTableColumnReorder,
} from './wire-table-column-reorder.js';
import {
  buildTableElement,
  reorderTableColumnsInWrapper,
} from './table-field.js';
import { SchemaRegistry } from '../registry/schema-registry.js';

before(() => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.window = window as any;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.CSS = { escape: (value: any) => String(value).replace(/"/g, '\\"') } as any;
});

describe('moveTableColumn', () => {
  it('moves a column to a new index', () => {
    const columns = [
      { key: 'blocks', label: 'blocks' },
      { key: 'date', label: 'date' },
      { key: 'date_visit', label: 'date_visit' },
      { key: 'name', label: 'name' },
    ];
    const next = moveTableColumn(columns, 0, 1);
    assert.deepEqual(
      next.map((c) => c.key),
      ['date', 'blocks', 'date_visit', 'name'],
    );
  });

  it('returns null when indexes are unchanged or invalid', () => {
    const columns = [{ key: 'a' }, { key: 'b' }];
    assert.equal(moveTableColumn(columns, 0, 0), null);
    assert.equal(moveTableColumn(columns, -1, 1), null);
    assert.equal(moveTableColumn(columns, 0, 5), null);
  });
});

describe('resolveTableColumnDropIndex', () => {
  it('inserts before the target when pointer is on the left half', () => {
    const th = {
      getBoundingClientRect: () => ({ left: 100, width: 100 }),
    };
    // from 0 onto target 2, left half → insert before 2 → after removal → 1
    assert.equal(resolveTableColumnDropIndex(0, 2, 120, th as any), 1);
  });

  it('inserts after the target when pointer is on the right half', () => {
    const th = {
      getBoundingClientRect: () => ({ left: 100, width: 100 }),
    };
    // from 0 onto target 1, right half → insert after 1 → after removal → 1
    assert.equal(resolveTableColumnDropIndex(0, 1, 170, th as any), 1);
  });
});

describe('reorderTableColumnsInWrapper', () => {
  it('updates schema column order and rebuilds header cells', () => {
    const tableId = 'list_table';
    const registry = new SchemaRegistry();
    registry.setFieldSchemas({
      [tableId]: {
        type: 'table',
        label: 'list',
        name: 'list',
        columns: [
          { key: 'blocks', label: 'blocks', name: 'blocks' },
          { key: 'date', label: 'date', name: 'date' },
          { key: 'name', label: 'name', name: 'name' },
        ],
      },
      [`${tableId}_row1_blocks`]: { type: 'text', label: 'blocks' },
      [`${tableId}_row1_date`]: { type: 'text', label: 'date' },
      [`${tableId}_row1_name`]: { type: 'text', label: 'name' },
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'document-table';
    wrapper.dataset.tableId = tableId;
    const table = buildTableElement(tableId, {}, {
      designMode: true,
      getRegistry: () => registry,
      tableRows: [{ key: 'row1', label: '' }],
    });
    wrapper.appendChild(table);
    document.body.appendChild(wrapper);

    let notified: any = null;
    const result = reorderTableColumnsInWrapper(wrapper, 0, 1, {
      designMode: true,
      getRegistry: () => registry,
      onTableColumnsChange: (id: any, columns: any) => {
        notified = { id, keys: columns.map((c: any) => c.key) };
      },
    });

    assert.ok(result);
    assert.deepEqual(
      registry.getFieldSchemas()[tableId].columns.map((c: any) => c.key),
      ['date', 'blocks', 'name'],
    );
    assert.deepEqual(notified, { id: tableId, keys: ['date', 'blocks', 'name'] });

    const headers = [...wrapper.querySelectorAll('.vision-table__col-head')].map(
      (th) => th.textContent,
    );
    assert.deepEqual(headers, ['date', 'blocks', 'name']);
  });
});

describe('wireTableColumnReorder', () => {
  it('wires pointer handlers on header cells (not HTML5 draggable)', () => {
    const table = document.createElement('table');
    table.className = 'vision-table';
    table.innerHTML = `
      <thead><tr>
        <th class="vision-table__col-head" data-col-index="0">a</th>
        <th class="vision-table__col-head" data-col-index="1">b</th>
      </tr></thead>
      <tbody></tbody>
    `;
    let reordered: number[] | null = null;
    wireTableColumnReorder(table, {
      onReorder: (from: number, to: number) => {
        reordered = [from, to];
      },
    });
    const headers = [...table.querySelectorAll('.vision-table__col-head')] as HTMLElement[];
    assert.equal(headers[0].draggable, false);
    assert.equal(headers[1].draggable, false);
    assert.equal(table.dataset.columnReorderWired, 'true');

    // Simulate pointer drag from col 0 onto col 1 (right half → final index 1).
    function fire(target: any, type: any, clientX: any, clientY = 10) {
      const event = new (globalThis as any).window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'button', { value: 0 });
      Object.defineProperty(event, 'isPrimary', { value: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'clientX', { value: clientX });
      Object.defineProperty(event, 'clientY', { value: clientY });
      target.dispatchEvent(event);
    }

    const originalFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => headers[1];
    headers[1].getBoundingClientRect = () =>
      ({ left: 100, width: 100, top: 0, height: 20, right: 200, bottom: 20 }) as any;

    fire(headers[0], 'pointerdown', 10);
    fire(document, 'pointermove', 160);
    fire(document, 'pointerup', 160);

    document.elementFromPoint = originalFromPoint;
    assert.deepEqual(reordered, [0, 1]);
  });
});
