import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHTML } from 'linkedom';

import { DEFAULT_DOCUMENT_BODY_STYLE } from './document-display-defaults.js';
import {
  compactPageSetupStyle,
  compactFieldHighlightStyle,
  migratePageSetup,
  normalizeFieldHighlightStyle,
  applyDesignPanelTextStyle,
  applyDocumentTextStyleCssVars,
  applyPageFormatCssVars,
  clearPageFormatCssVars,
  FILL_MODE_PAGE_SCALE,
  resolvePageFormatSizeMm,
  resolvePageContentWidthMm,
  resolvePageSetupFieldHighlightStyle,
  resolvePageSetupFieldValueStyle,
  resolvePageSetupTextStyle,
} from './page-setup-styles.js';
import { DEFAULT_FIELD_HIGHLIGHT_STYLE } from './document-display-defaults.js';

describe('resolvePageFormatSizeMm', () => {
  it('returns portrait A4 by default', () => {
    assert.deepEqual(resolvePageFormatSizeMm({}), { widthMm: 210, heightMm: 297 });
  });

  it('swaps dimensions for landscape orientation', () => {
    assert.deepEqual(resolvePageFormatSizeMm({ format: 'a4', orientation: 'landscape' }), {
      widthMm: 297,
      heightMm: 210,
    });
    assert.deepEqual(resolvePageFormatSizeMm({ format: 'letter', orientation: 'landscape' }), {
      widthMm: 279.4,
      heightMm: 215.9,
    });
  });

  it('uses custom width/height and swaps for landscape', () => {
    assert.deepEqual(
      resolvePageFormatSizeMm({ format: 'custom', widthMm: 100, heightMm: 200 }),
      { widthMm: 100, heightMm: 200 },
    );
    assert.deepEqual(
      resolvePageFormatSizeMm({
        format: 'custom',
        widthMm: 100,
        heightMm: 200,
        orientation: 'landscape',
      }),
      { widthMm: 200, heightMm: 100 },
    );
  });
});

describe('resolvePageContentWidthMm', () => {
  it('uses A4 minus default margins', () => {
    assert.equal(resolvePageContentWidthMm({}), 180);
    assert.equal(resolvePageContentWidthMm({ format: 'a4', margin: 15 }), 180);
  });

  it('honors asymmetric side margins from pageSetup', () => {
    assert.equal(
      resolvePageContentWidthMm({ format: 'a4', margin: [36, 40, 36, 40] }),
      130,
    );
  });

  it('uses letter width when format is letter', () => {
    assert.equal(resolvePageContentWidthMm({ format: 'letter', margin: 15 }), 185.9);
  });

  it('uses custom width when format is custom', () => {
    assert.equal(
      resolvePageContentWidthMm({ format: 'custom', widthMm: 100, heightMm: 200, margin: 10 }),
      80,
    );
  });
});

describe('applyPageFormatCssVars', () => {
  it('applies format/orientation at fill-mode +10% scale', () => {
    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.HTMLElement = document.defaultView.HTMLElement;

    const el = document.createElement('div');
    applyPageFormatCssVars(
      el,
      { format: 'a4', orientation: 'landscape', margin: 15 },
      { scale: FILL_MODE_PAGE_SCALE, fillPage: true },
    );

    assert.equal(el.style.getPropertyValue('--doc-page-width'), '326.7mm');
    assert.equal(el.style.getPropertyValue('--doc-page-min-height'), '231mm');
    assert.equal(el.style.getPropertyValue('--doc-page-margin'), '16.5mm');
    assert.equal(el.style.getPropertyValue('--doc-page-content-width'), '293.7mm');
    assert.equal(el.classList.contains('editor-holder--fill-page'), true);

    clearPageFormatCssVars(el);
    assert.ok(!el.style.getPropertyValue('--doc-page-width'));
    assert.ok(!el.style.getPropertyValue('--doc-page-content-width'));
    assert.equal(el.classList.contains('editor-holder--fill-page'), false);
  });
});

describe('resolvePageSetupTextStyle', () => {
  it('uses Inter 16px as the default document style', () => {
    const style = resolvePageSetupTextStyle({});
    assert.equal(style.fontSize, '16px');
    assert.equal(style.fontWeight, 'normal');
    assert.match(style.fontFamily ?? '', /Inter/);
  });

  it('uses template textStyle over defaults', () => {
    const style = resolvePageSetupTextStyle({
      textStyle: { fontFamily: 'Times New Roman', fontWeight: 'bold' },
    });
    assert.equal(style.fontFamily, '"Times New Roman"');
    assert.equal(style.fontWeight, 'bold');
    assert.equal(style.fontSize, DEFAULT_DOCUMENT_BODY_STYLE.fontSize);
  });
});

describe('applyDesignPanelTextStyle', () => {
  it('does not apply Default text style to Interface chrome', () => {
    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.HTMLElement = document.defaultView.HTMLElement;

    const shell = document.createElement('div');
    shell.className = 'design-shell';
    const panel = document.createElement('div');
    panel.className = 'properties-panel';
    const title = document.createElement('span');
    title.className = 'properties-panel__title';
    title.textContent = 'Properties';
    panel.appendChild(title);
    shell.appendChild(panel);
    document.body.appendChild(shell);

    applyDesignPanelTextStyle(shell, {
      textStyle: { fontFamily: 'Georgia', fontSize: '18px', fontWeight: 'bold' },
    });

    assert.ok(!panel.style.fontFamily);
    assert.ok(!panel.style.fontSize);
    assert.ok(!panel.style.fontWeight);
  });
});

describe('applyDocumentTextStyleCssVars', () => {
  it('sets document font vars on the template host only', () => {
    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.HTMLElement = document.defaultView.HTMLElement;

    const holder = document.createElement('div');
    holder.className = 'editor-holder';
    document.body.appendChild(holder);

    applyDocumentTextStyleCssVars(holder, {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      fontWeight: 'bold',
    });

    assert.equal(holder.style.getPropertyValue('--me-document-font-family'), 'Georgia, serif');
    assert.equal(holder.style.getPropertyValue('--me-document-font-size'), '18px');
    assert.equal(holder.style.getPropertyValue('--me-document-font-weight'), '700');
    assert.ok(!holder.style.fontFamily);
  });
});

describe('resolvePageSetupFieldValueStyle', () => {
  it('merges template valueStyle with editor options', () => {
    const resolved = resolvePageSetupFieldValueStyle(
      { valueStyle: { fontStyle: 'italic', color: '#333333' } },
      { default: { fontFamily: 'Arial' } },
    );
    assert.equal(resolved.default.fontFamily, 'Arial');
    assert.equal(resolved.default.fontStyle, 'italic');
    assert.equal(resolved.default.color, '#333333');
  });
});

describe('compactPageSetupStyle', () => {
  it('drops empty style objects', () => {
    assert.equal(compactPageSetupStyle({}), undefined);
    assert.deepEqual(compactPageSetupStyle({ fontWeight: 'bold' }), { fontWeight: 'bold' });
  });

  it('drops properties that match document defaults', () => {
    assert.equal(compactPageSetupStyle(DEFAULT_DOCUMENT_BODY_STYLE), undefined);
    assert.deepEqual(compactPageSetupStyle({ ...DEFAULT_DOCUMENT_BODY_STYLE, fontStyle: 'italic' }), {
      fontStyle: 'italic',
    });
  });
});

describe('resolvePageSetupFieldHighlightStyle', () => {
  it('uses default blue mention colors and medium weight border', () => {
    const style = resolvePageSetupFieldHighlightStyle({}, undefined);
    assert.equal(style.color, DEFAULT_FIELD_HIGHLIGHT_STYLE.color);
    assert.equal(style.backgroundColor, DEFAULT_FIELD_HIGHLIGHT_STYLE.backgroundColor);
    assert.equal(style.fontWeight, '500');
    assert.equal(style.borderWidth, '1px');
  });

  it('merges page setup and editor defaults', () => {
    const style = resolvePageSetupFieldHighlightStyle(
      { fieldHighlight: { color: '#7c3aed' } },
      { color: '#111111', backgroundColor: '#eeeeee' },
    );
    assert.equal(style.color, '#7C3AED');
    assert.equal(style.backgroundColor, '#EEEEEE');
  });
});

describe('compactFieldHighlightStyle', () => {
  it('drops values equal to defaults', () => {
    assert.equal(compactFieldHighlightStyle(DEFAULT_FIELD_HIGHLIGHT_STYLE), undefined);
    assert.deepEqual(compactFieldHighlightStyle({ color: '#7C3AED' }), {
      color: '#7C3AED',
      backgroundColor: DEFAULT_FIELD_HIGHLIGHT_STYLE.backgroundColor,
      fontWeight: DEFAULT_FIELD_HIGHLIGHT_STYLE.fontWeight,
      borderWidth: DEFAULT_FIELD_HIGHLIGHT_STYLE.borderWidth,
    });
  });
});

describe('migratePageSetup', () => {
  it('upgrades legacy pill-style field highlight to link defaults', () => {
    const migrated = migratePageSetup({
      format: 'a4',
      fieldHighlight: { color: '#2563eb', backgroundColor: '#dbeafe' },
    });
    assert.deepEqual(migrated.fieldHighlight, DEFAULT_FIELD_HIGHLIGHT_STYLE);
    assert.equal(migrated.format, 'a4');
  });

  it('leaves custom field highlight colors unchanged', () => {
    const pageSetup = {
      fieldHighlight: { color: '#7c3aed', backgroundColor: 'transparent' },
    };
    assert.deepEqual(migratePageSetup(pageSetup), pageSetup);
  });

  it('returns empty object for null input', () => {
    assert.deepEqual(migratePageSetup(null), {});
  });
});
