import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPreviewHtmlStylesheet, resolvePreviewHtmlCssVars } from './preview-html-styles.js';

describe('preview-html-styles', () => {
  it('emits CSS variables from page setup text style', () => {
    const vars = resolvePreviewHtmlCssVars({
      pageSetup: { textStyle: { fontFamily: 'Georgia, serif', fontSize: '18px' } },
    });
    assert.equal(vars['--me-document-font-family'], 'Georgia, serif');
    assert.equal(vars['--me-document-font-size'], '18px');
  });

  it('includes preview and table selectors for standalone export', () => {
    const css = buildPreviewHtmlStylesheet({});
    assert.match(css, /\.preview-document\s*\{/);
    assert.match(css, /\.preview-export-sheet\s*\{/);
    assert.match(css, /\.document-section__header\s*\{/);
    assert.match(css, /\.document-section--border-top/);
    assert.match(css, /\.vision-table\s*,/);
    assert.match(css, /white-space:\s*normal/);
    assert.match(css, /--doc-page-width:/);
    assert.match(css, /list-style:\s*disc/);
    assert.match(css, /list-style:\s*decimal/);
    assert.doesNotMatch(css, /<\/style/i);
  });

  it('emits page geometry from page setup', () => {
    const vars = resolvePreviewHtmlCssVars({
      pageSetup: { format: 'a4', orientation: 'portrait', margin: 20 },
    });
    assert.equal(vars['--doc-page-width'], '210mm');
    assert.equal(vars['--doc-page-min-height'], '297mm');
    assert.equal(vars['--doc-page-margin'], '20mm');
    assert.equal(vars['--doc-page-content-width'], '170mm');
  });

  it('keeps </style> out of the stylesheet when font values are hostile', () => {
    const css = buildPreviewHtmlStylesheet({
      pageSetup: { textStyle: { fontFamily: 'Arial</style><script>alert(1)</script>' } },
    });
    assert.doesNotMatch(css, /<\/style/i);
    assert.doesNotMatch(css, /<script/i);
  });
});
