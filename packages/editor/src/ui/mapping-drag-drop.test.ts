import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getSectionSourcePath,
  preferRelativePathsUnderSectionSource,
} from './mapping-drag-drop.js';

describe('mapping-drag-drop section source helpers', () => {
  it('reads section _source path from rules', () => {
    assert.equal(
      getSectionSourcePath('main', [
        {
          section: 'main',
          field: '_source',
          sourcePath: '$payload.Contacts',
          sourceArrayPath: '$payload.Contacts',
        },
      ]),
      '$payload.Contacts',
    );
    assert.equal(getSectionSourcePath('other', [{ section: 'main', field: '_source', sourcePath: '$payload.X' }]), null);
  });

  it('rewrites absolute field paths under section source to relative', () => {
    const next = preferRelativePathsUnderSectionSource(
      [
        {
          section: 'main',
          field: 'Name',
          sourcePath: '$payload.Contacts.Name',
        },
        {
          section: 'main',
          field: 'Phone',
          sourcePath: '$payload.AccountPhone',
        },
      ],
      '$payload.Contacts',
    );
    assert.equal(next[0].sourcePath, '$Name');
    assert.equal(next[1].sourcePath, '$payload.AccountPhone');
  });

  it('shortens nested values.amount column drops to $amount under $values', () => {
    const next = preferRelativePathsUnderSectionSource(
      [
        {
          section: 'Letter',
          field: 'Table',
          fieldId: 'table_1',
          columnKey: 'amount',
          sourcePath: '$payload.sections.items.Table.values.amount',
          sourceArrayPath: '$payload.sections.items.Table.values',
        },
      ],
      '$payload.sections.items.Table',
    );
    assert.equal(next[0].sourceArrayPath, '$values');
    assert.equal(next[0].sourcePath, '$amount');
  });
});
