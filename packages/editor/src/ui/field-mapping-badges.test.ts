import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { parseHTML } from 'linkedom';
import { applyMappingBadges, findRuleForMappedToken } from './field-mapping-badges.js';

describe('field-mapping-badges', () => {
  beforeEach(() => {
    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.CSS = {
      escape: (value: any) => String(value).replace(/"/g, '\\"'),
    } as typeof CSS;
  });

  it('sets source path tooltip on mapped tokens', () => {
    const holder = document.createElement('div');
    holder.innerHTML = `<span class="field-token field-token--empty" data-field-id="fld1" data-placeholder="Complaints">Complaints</span>`;
    const rules = [
      {
        section: 'Anamnesis',
        field: 'Complaints',
        fieldId: 'fld1',
        sourcePath: '$payload.sections.anamnesis.complaints',
      },
    ];

    applyMappingBadges(holder, rules);

    const token = holder.querySelector('.field-token');
    assert.ok(token.classList.contains('field-token--mapped'));
    assert.equal(token.title, '$payload.sections.anamnesis.complaints');
    assert.equal(token.dataset.sourcePath, '$payload.sections.anamnesis.complaints');
    assert.equal(
      token.querySelector('.field-token__mapping-badge')?.title,
      '$payload.sections.anamnesis.complaints',
    );
  });

  it('shows _source badge on section header', () => {
    const holder = document.createElement('div');
    holder.innerHTML = `
      <div class="document-section" data-section-name="main">
        <div class="document-section__header">
          <span class="document-section__label-text">main</span>
        </div>
      </div>
    `;
    applyMappingBadges(holder, [
      {
        section: 'main',
        field: '_source',
        sourcePath: '$payload.Contacts',
        sourceArrayPath: '$payload.Contacts',
      },
    ]);
    const header = holder.querySelector('.document-section__header');
    assert.ok(header?.classList.contains('document-section__header--sourced'));
    assert.equal(header?.dataset.sectionSource, '$payload.Contacts');
    assert.match(
      header?.querySelector('.document-section__source-badge')?.textContent ?? '',
      /_source:\s*Contacts/,
    );
  });

  it('findRuleForMappedToken resolves simple and column rules', () => {
    const holder = document.createElement('div');
    holder.innerHTML = `
      <span class="field-token field-token--empty" data-field-id="fld1">Complaints</span>
      <span class="field-token field-token--cell field-token--empty" data-field-id="tbl_r1_vis" data-table-id="tbl" data-col-key="vis">vis</span>
    `;
    const rules = [
      {
        section: 'Anamnesis',
        field: 'Complaints',
        fieldId: 'fld1',
        sourcePath: '$payload.a',
      },
      {
        section: 'VA',
        field: 'Table',
        fieldId: 'tbl',
        columnKey: 'vis',
        sourcePath: '$payload.b',
      },
    ];
    applyMappingBadges(holder, rules);

    const plain = holder.querySelector('[data-field-id="fld1"]');
    const cell = holder.querySelector('.field-token--cell');
    assert.equal(findRuleForMappedToken(plain, rules)?.sourcePath, '$payload.a');
    assert.equal(findRuleForMappedToken(cell, rules)?.sourcePath, '$payload.b');
  });
});
