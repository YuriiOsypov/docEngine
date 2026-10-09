import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { parseHTML } from 'linkedom';

let serializeEditableToSegments: any;
let renderSegmentsToDom: any;
let createFieldToken: any;
let textToFragment: any;
let plainTextNewlinesToBr: any;
let sanitizeHtml: any;
let execRichTextCommand: any;
let applyBlockHeading: any;
let applyBlockAlignment: any;

before(async () => {
  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Range = window.Range;
  globalThis.DocumentFragment = window.DocumentFragment;

  if (!window.getSelection) {
    const win = window as any;
    win._testSelection = null;
    window.getSelection = () => {
      if (!win._testSelection) {
        win._testSelection = {
          _ranges: [],
          get rangeCount() {
            return this._ranges.length;
          },
          get isCollapsed() {
            return !this._ranges.length || this._ranges[0].collapsed;
          },
          removeAllRanges() {
            this._ranges = [];
          },
          addRange(range: any) {
            this._ranges = [range];
          },
          getRangeAt(index: any) {
            return this._ranges[index];
          },
        };
      }
      return win._testSelection;
    };
  }

  if (window.Range?.prototype && !window.Range.prototype.intersectsNode) {
    window.Range.prototype.intersectsNode = function intersectsNode(node: any) {
      if (!node) return false;
      let ancestor: any = this.commonAncestorContainer;
      if (!ancestor) return false;
      if (ancestor.nodeType === 3) ancestor = ancestor.parentNode;
      return ancestor.contains?.(node) ?? false;
    };
  }
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

  const inline = await import('./inline-fields.js');
  const rich = await import('./rich-text.js');
  serializeEditableToSegments = inline.serializeEditableToSegments;
  renderSegmentsToDom = inline.renderSegmentsToDom;
  createFieldToken = inline.createFieldToken;
  textToFragment = inline.textToFragment;
  plainTextNewlinesToBr = rich.plainTextNewlinesToBr;
  sanitizeHtml = rich.sanitizeHtml;
  execRichTextCommand = rich.execRichTextCommand;
  applyBlockHeading = rich.applyBlockHeading;
  applyBlockAlignment = rich.applyBlockAlignment;
});

function buildSectionBody() {
  const body = document.createElement('div');
  body.className = 'document-section__body';
  body.contentEditable = 'true';
  document.body.appendChild(body);
  return body;
}

function selectNodeContentsRange(node: any) {
  // linkedom's Range is incomplete (selectNodeContents leaves containers unset).
  // Use a minimal range mock that supports alignment/heading wrap tests.
  const range: any = {
    collapsed: false,
    startContainer: node,
    startOffset: 0,
    endContainer: node,
    endOffset: node.childNodes.length,
    commonAncestorContainer: node,
    cloneRange() {
      return selectNodeContentsRange(node);
    },
    intersectsNode(other: any) {
      if (!other) return false;
      return node === other || node.contains?.(other);
    },
    extractContents() {
      const frag = document.createDocumentFragment();
      while (node.firstChild) frag.appendChild(node.firstChild);
      range.startOffset = 0;
      range.endOffset = 0;
      range.collapsed = true;
      return frag;
    },
    insertNode(el: any) {
      const ref = node.childNodes[range.startOffset] ?? null;
      node.insertBefore(el, ref);
      range.startOffset += 1;
      range.endOffset = range.startOffset;
    },
    deleteContents() {
      range.extractContents();
    },
    setStartBefore(el: any) {
      const parent = el.parentNode;
      range.startContainer = parent;
      range.startOffset = [...parent.childNodes].indexOf(el);
      range.commonAncestorContainer = parent;
      range.collapsed = false;
    },
    setEndAfter(el: any) {
      const parent = el.parentNode;
      range.endContainer = parent;
      range.endOffset = [...parent.childNodes].indexOf(el) + 1;
      range.commonAncestorContainer = parent;
      range.collapsed = false;
    },
    setEndBefore(el: any) {
      const parent = el.parentNode;
      range.endContainer = parent;
      range.endOffset = [...parent.childNodes].indexOf(el);
      range.commonAncestorContainer = parent;
      range.collapsed = false;
    },
    collapse(toStart = true) {
      if (toStart) {
        range.endContainer = range.startContainer;
        range.endOffset = range.startOffset;
      } else {
        range.startContainer = range.endContainer;
        range.startOffset = range.endOffset;
      }
      range.collapsed = true;
    },
  };
  return range;
}

describe('plainTextNewlinesToBr', () => {
  it('converts newlines in text nodes to br elements', () => {
    assert.equal(plainTextNewlinesToBr('line one\nline two'), 'line one<br>line two');
    assert.equal(plainTextNewlinesToBr('<b>a\nb</b>'), '<b>a<br>b</b>');
  });
});

describe('serializeEditableToSegments with headings', () => {
  it('keeps plain text and heading html as separate segments', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('field_a', 'value A', 'Field A', {}));
    body.appendChild(textToFragment('.\nLabel: '));
    body.appendChild(createFieldToken('field_b', 'value B', 'Field B', {}));
    const heading = document.createElement('h2');
    heading.textContent = 'Title';
    body.appendChild(heading);
    body.appendChild(createFieldToken('field_c', 'value C', 'Field C', {}));

    const segments = serializeEditableToSegments(body);
    const headingIndex = segments.findIndex((seg: any) => seg.html?.includes('<h2>'));
    assert.ok(headingIndex >= 0, 'heading should serialize as html segment');

    const prev = segments[headingIndex - 1];
    assert.notEqual(prev?.html?.includes('<h2>'), true);
    assert.ok(
      prev?.type === 'field' || (prev?.type === 'text' && !prev.html),
      'plain text before heading should stay a separate non-html segment',
    );
  });

  it('preserves br after heading when serializing', () => {
    const body = buildSectionBody();
    const heading = document.createElement('h2');
    heading.textContent = 'Recommended';
    body.appendChild(heading);
    body.appendChild(document.createElement('br'));
    body.appendChild(createFieldToken('field_rec', 'Biopsy', 'Recommended', {}));

    assert.ok(body.querySelector('h2 + br'), 'structural br after heading should remain');

    const segments = serializeEditableToSegments(body);
    const headingIndex = segments.findIndex((seg: any) => seg.html?.includes('<h2>'));
    assert.ok(headingIndex >= 0);
    const afterHeading = segments.slice(headingIndex + 1);
    assert.ok(
      afterHeading.some((seg: any) => seg.type === 'field' && seg.id === 'field_rec'),
      'field after heading should serialize after heading segment',
    );
  });
});

describe('renderSegmentsToDom round-trip', () => {
  it('preserves line breaks between field value and next label after heading segment', () => {
    const segments = [
      { type: 'text', content: 'ST.LOCALIS: ' },
      { type: 'field', id: 'statusLocalis', placeholder: 'ST.LOCALIS' },
      { type: 'text', content: '.\nВиділення із сосків: ' },
      { type: 'field', id: 'nippleDischarge', placeholder: 'Nipple discharge' },
      { type: 'text', html: '<h2>ДІАГНОЗ:</h2>' },
      { type: 'field', id: 'diagnosis', placeholder: 'Diagnosis' },
      { type: 'text', content: '.\nРекомендовано: ' },
      { type: 'field', id: 'recommended', placeholder: 'Recommended' },
    ];
    const fieldValues = {
      statusLocalis: 'normal',
      nippleDischarge: 'bloody',
      diagnosis: 'cyst',
      recommended: 'biopsy',
    };

    const rendered = renderSegmentsToDom(segments, fieldValues, {});
    const body = document.createElement('div');
    body.appendChild(rendered);

    const html = body.innerHTML;
    assert.match(html, /normal[\s\S]*<br>[\s\S]*Виділення із сосків:/);
    assert.match(html, /<h2>ДІАГНОЗ:<\/h2>/);
    assert.match(html, /bloody[\s\S]*<h2>ДІАГНОЗ:<\/h2>/);
    assert.match(html, /<h2>ДІАГНОЗ:<\/h2>[\s\S]*cyst/);
    assert.match(html, /cyst[\s\S]*<br>[\s\S]*Рекомендовано:/);
  });

  it('round-trips dom serialize after heading without collapsing lines', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('f1', 'first value', 'Field 1', {}));
    body.appendChild(textToFragment('.\nSecond label: '));
    body.appendChild(createFieldToken('f2', 'second value', 'Field 2', {}));
    const heading = document.createElement('h2');
    heading.textContent = 'Section title';
    body.appendChild(heading);
    body.appendChild(document.createElement('br'));
    body.appendChild(createFieldToken('f3', 'third value', 'Field 3', {}));

    const segments = serializeEditableToSegments(body);
    const rerendered = renderSegmentsToDom(
      segments,
      { f1: 'first value', f2: 'second value', f3: 'third value' },
      {},
    );

    const out = document.createElement('div');
    out.appendChild(rerendered);
    const text = out.textContent ?? '';
    assert.match(text, /first value[\s\S]*Second label:/);
    assert.match(text, /second value[\s\S]*Section title/);
    assert.match(text, /Section title[\s\S]*third value/);
  });

  it('preserves mammology-style line breaks across many fields after serialize', () => {
    const segments = [
      { type: 'text', content: 'ST.LOCALIS: ' },
      { type: 'field', id: 'statusLocalis', placeholder: 'ST.LOCALIS' },
      { type: 'text', content: '.\nВогнещевої патології пальпаторно: ' },
      { type: 'field', id: 'focalPalpation', placeholder: 'Focal' },
      { type: 'text', content: '.\nВиділення із сосків: ' },
      { type: 'field', id: 'nippleDischarge', placeholder: 'Nipple' },
      { type: 'text', content: '.\nДІАГНОЗ: ' },
      { type: 'field', id: 'diagnosis', placeholder: 'ДІАГНОЗ' },
      { type: 'text', html: '<h2>Рекомендовано</h2>' },
      { type: 'field', id: 'recommended', placeholder: 'Recommended' },
    ];
    const fieldValues = {
      statusLocalis: 'Права грудна залоза дольчата; Ліва грудна залоза бугристі',
      focalPalpation: 'Утворення до 1 см',
      nippleDischarge: "кров'янисті",
      diagnosis: 'Складна кіста правої грудної залози',
      recommended: 'Консультація онколога',
    };

    const body = buildSectionBody();
    body.appendChild(renderSegmentsToDom(segments, fieldValues, {}));

    const roundTripped = serializeEditableToSegments(body);
    const out = document.createElement('div');
    out.appendChild(renderSegmentsToDom(roundTripped, fieldValues, {}));

    const html = out.innerHTML;
    assert.doesNotMatch(html, /дольчата\.Вогнещевої/);
    assert.doesNotMatch(html, /1 см\.Виділення/);
    assert.doesNotMatch(html, /кров'янисті\.ДІАГНОЗ/);
    assert.match(html, /дольчата[\s\S]*<br>[\s\S]*Вогнещевої патології пальпаторно:/);
    assert.match(html, /<h2>Рекомендовано<\/h2>/);
    assert.match(html, /<h2>Рекомендовано<\/h2>[\s\S]*Консультація онколога/);
  });

  it('does not merge adjacent html segments when serializing formatted labels', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('f1', 'value one', 'Field 1', {}));
    const labelWrap = document.createElement('b');
    labelWrap.appendChild(textToFragment('.\nBold label: '));
    body.appendChild(labelWrap);
    body.appendChild(createFieldToken('f2', 'value two', 'Field 2', {}));

    const segments = serializeEditableToSegments(body);
    const fieldIndices = segments
      .map((seg: any, i: any) => (seg.type === 'field' ? i : -1))
      .filter((i: any) => i >= 0);
    assert.equal(fieldIndices.length, 2);
    assert.ok(
      segments.some(
        (seg: any) =>
          seg.type === 'text' &&
          (seg.content?.includes('Bold label') || seg.html?.includes('Bold label')),
      ),
    );

    const out = document.createElement('div');
    out.appendChild(
      renderSegmentsToDom(segments, { f1: 'value one', f2: 'value two' }, {}),
    );
    assert.match(out.textContent ?? '', /value one[\s\S]*Bold label:/);
  });

  it('does not add standalone newline when label is wrapped in DIV', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('f1', 'field value', 'Field 1', {}));
    const wrapper = document.createElement('div');
    wrapper.appendChild(textToFragment('.\nNext label: '));
    body.appendChild(wrapper);
    body.appendChild(createFieldToken('f2', 'second', 'Field 2', {}));

    const segments = serializeEditableToSegments(body);
    const f1Index = segments.findIndex((s: any) => s.type === 'field' && s.id === 'f1');
    const afterF1 = segments.slice(f1Index + 1);
    assert.ok(
      !afterF1.some((s: any) => s.type === 'text' && !s.html && s.content === '\n'),
      'should not have standalone newline between field and label text',
    );

    const out = document.createElement('div');
    out.appendChild(
      renderSegmentsToDom(segments, { f1: 'field value', f2: 'second' }, {}),
    );
    const html = out.innerHTML;
    const brCount = (html.match(/<br>/g) ?? []).length;
    assert.equal(brCount, 1, 'exactly one br from .\\n between rows');
    assert.match(html, /field value[\s\S]*<br>[\s\S]*Next label:/);
  });

  it('serializes collapsed period-label faithfully without inventing line breaks', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('f1', 'value', 'Field', {}));
    body.appendChild(document.createTextNode('.Next label: '));
    body.appendChild(createFieldToken('f2', 'v2', 'F2', {}));

    const segments = serializeEditableToSegments(body);
    const f1Index = segments.findIndex((s: any) => s.type === 'field' && s.id === 'f1');
    const textAfterF1 = segments[f1Index + 1];
    assert.equal(textAfterF1?.type, 'text');
    assert.equal(String(textAfterF1?.content ?? ''), '.Next label: ');

    const roundTripped = serializeEditableToSegments(body);
    assert.deepEqual(roundTripped, segments);
  });

  it('losslessly round-trips period-label with explicit line break', () => {
    const segments = [
      { type: 'field', id: 'f1' },
      { type: 'text', content: '.\nNext label: ' },
      { type: 'field', id: 'f2' },
    ];
    const body = buildSectionBody();
    body.appendChild(renderSegmentsToDom(segments, { f1: 'value', f2: 'v2' }, {}));

    const roundTripped = serializeEditableToSegments(body);
    const out = document.createElement('div');
    out.appendChild(renderSegmentsToDom(roundTripped, { f1: 'value', f2: 'v2' }, {}));
    assert.match(out.innerHTML, /value[\s\S]*<br>[\s\S]*Next label:/);
    assert.doesNotMatch(out.innerHTML, /value\.Next label/);
  });

  it('keeps mammology segment structure stable on round-trip', () => {
    const mammologySegments = [
      { type: 'text', content: 'ST.LOCALIS: ' },
      { type: 'field', id: 'statusLocalis', placeholder: 'ST.LOCALIS' },
      { type: 'text', content: '.\nВогнещевої патології пальпаторно: ' },
      { type: 'field', id: 'focalPalpation', placeholder: 'Focal' },
      { type: 'text', content: '.\nВиділення із сосків: ' },
      { type: 'field', id: 'nippleDischarge', placeholder: 'Nipple' },
      { type: 'text', content: '.\nРегіонарні лімфатичні вузли: ' },
      { type: 'field', id: 'regionalLymphNodes', placeholder: 'Lymph' },
      { type: 'text', content: '.\nЗміни зі сторони шкіри: ' },
      { type: 'field', id: 'skinChanges', placeholder: 'Skin' },
      { type: 'text', content: '.\nДІАГНОЗ: ' },
      { type: 'field', id: 'diagnosis', placeholder: 'ДІАГНОЗ' },
      { type: 'text', content: '.\nРекомендовано: ' },
      { type: 'field', id: 'recommended', placeholder: 'Recommended' },
      { type: 'text', content: '.' },
    ];
    const fieldValues = {
      statusLocalis: 'Права грудна залоза дольчата',
      focalPalpation: 'Утворення до 1 см',
      nippleDischarge: "кров'янисті",
      regionalLymphNodes: 'щільні',
      skinChanges: 'втягнення шкіри',
      diagnosis: 'Складна кіста',
      recommended: 'Консультація онколога',
    };

    const body = buildSectionBody();
    body.appendChild(renderSegmentsToDom(mammologySegments, fieldValues, {}));

    const roundTripped = serializeEditableToSegments(body);
    const standaloneNewlines = roundTripped.filter(
      (s: any) => s.type === 'text' && !s.html && s.content === '\n',
    );
    assert.equal(standaloneNewlines.length, 0, 'no extra standalone newline segments');
    assert.equal(
      roundTripped.filter((s: any) => s.type === 'field').length,
      mammologySegments.filter((s: any) => s.type === 'field').length,
    );

    const out = document.createElement('div');
    out.appendChild(renderSegmentsToDom(roundTripped, fieldValues, {}));
    const html = out.innerHTML;
    assert.doesNotMatch(html, /дольчата\.Вогнещевої/);
    assert.doesNotMatch(html, /1 см\.Виділення/);
  });

  it('round-trips bold label formatting without breaking line breaks', () => {
    const body = buildSectionBody();
    const label = document.createElement('b');
    label.textContent = 'ST.LOCALIS: ';
    body.appendChild(label);
    body.appendChild(createFieldToken('statusLocalis', 'дольчата', 'ST.LOCALIS', {}));
    const nextWrap = document.createElement('div');
    const nextLabel = document.createElement('b');
    nextLabel.appendChild(textToFragment('.\nВогнещевої патології пальпаторно: '));
    nextWrap.appendChild(nextLabel);
    body.appendChild(nextWrap);
    body.appendChild(createFieldToken('focalPalpation', 'до 1 см', 'Focal', {}));

    const segments = serializeEditableToSegments(body);
    const out = document.createElement('div');
    out.appendChild(
      renderSegmentsToDom(segments, { statusLocalis: 'дольчата', focalPalpation: 'до 1 см' }, {}),
    );

    const html = out.innerHTML;
    assert.match(html, /<b>ST\.LOCALIS:/);
    assert.match(html, /дольчата[\s\S]*<br>[\s\S]*Вогнещевої патології пальпаторно:/);
    assert.doesNotMatch(html, /дольчата\.Вогнещевої/);
    assert.ok(
      !segments.some((s: any) => s.type === 'text' && !s.html && s.content === '\n'),
      'no standalone newline segments',
    );
  });

  it('round-trips font span label formatting without breaking line breaks', () => {
    const body = buildSectionBody();
    const label = document.createElement('span');
    label.setAttribute('style', 'font-family: Times New Roman');
    label.textContent = 'ST.LOCALIS: ';
    body.appendChild(label);
    body.appendChild(createFieldToken('statusLocalis', 'дольчата', 'ST.LOCALIS', {}));
    const nextLabel = document.createElement('span');
    nextLabel.setAttribute('style', 'font-family: Times New Roman');
    nextLabel.appendChild(textToFragment('.\nВогнещевої патології пальпаторно: '));
    body.appendChild(nextLabel);
    body.appendChild(createFieldToken('focalPalpation', 'до 1 см', 'Focal', {}));

    const segments = serializeEditableToSegments(body);
    const out = document.createElement('div');
    out.appendChild(
      renderSegmentsToDom(segments, { statusLocalis: 'дольчата', focalPalpation: 'до 1 см' }, {}),
    );

    const html = out.innerHTML;
    assert.match(html, /Times New Roman/i);
    assert.match(html, /дольчата[\s\S]*<br>[\s\S]*Вогнещевої патології пальпаторно:/);
    assert.doesNotMatch(html, /дольчата\.Вогнещевої/);
  });

  it('does not add standalone newline between field and bold period line in DIV', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('f1', 'value', 'Field', {}));
    const wrapper = document.createElement('div');
    const label = document.createElement('b');
    label.appendChild(textToFragment('.\nNext label: '));
    wrapper.appendChild(label);
    body.appendChild(wrapper);
    body.appendChild(createFieldToken('f2', 'v2', 'F2', {}));

    const segments = serializeEditableToSegments(body);
    const f1Index = segments.findIndex((s: any) => s.type === 'field' && s.id === 'f1');
    const afterF1 = segments.slice(f1Index + 1);
    assert.ok(
      !afterF1.some((s: any) => s.type === 'text' && !s.html && s.content === '\n'),
      'no standalone newline between field and label html',
    );
  });

  it('serializes collapsed bold period-label faithfully without inventing line breaks', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('f1', 'value', 'Field', {}));
    const label = document.createElement('b');
    label.textContent = '.Next label: ';
    body.appendChild(label);
    body.appendChild(createFieldToken('f2', 'v2', 'F2', {}));

    const segments = serializeEditableToSegments(body);
    const f1Index = segments.findIndex((s: any) => s.type === 'field' && s.id === 'f1');
    const textAfterF1 = segments[f1Index + 1];
    assert.equal(textAfterF1?.type, 'text');
    assert.match(String(textAfterF1?.html ?? ''), /\.Next label:/);

    const roundTripped = serializeEditableToSegments(body);
    assert.deepEqual(roundTripped, segments);
  });

  it('losslessly round-trips bold period-label with explicit line break', () => {
    const segments = [
      { type: 'field', id: 'f1' },
      { type: 'text', html: '<b>.\nNext label: </b>' },
      { type: 'field', id: 'f2' },
    ];
    const body = buildSectionBody();
    body.appendChild(renderSegmentsToDom(segments, { f1: 'value', f2: 'v2' }, {}));

    const roundTripped = serializeEditableToSegments(body);
    const out = document.createElement('div');
    out.appendChild(renderSegmentsToDom(roundTripped, { f1: 'value', f2: 'v2' }, {}));
    assert.match(out.innerHTML, /value[\s\S]*<br>[\s\S]*Next label:/);
    assert.doesNotMatch(out.innerHTML, /value\.Next label/);
  });

  it('keeps mammology segment structure stable with mixed bold labels', () => {
    const mammologySegments = [
      { type: 'text', html: '<b>ST.LOCALIS: </b>' },
      { type: 'field', id: 'statusLocalis', placeholder: 'ST.LOCALIS' },
      { type: 'text', html: '<b>.\nВогнещевої патології пальпаторно: </b>' },
      { type: 'field', id: 'focalPalpation', placeholder: 'Focal' },
      { type: 'text', html: '<b>.\nДІАГНОЗ: </b>' },
      { type: 'field', id: 'diagnosis', placeholder: 'ДІАГНОЗ' },
    ];
    const fieldValues = {
      statusLocalis: 'дольчата',
      focalPalpation: 'до 1 см',
      diagnosis: 'кіста',
    };

    const body = buildSectionBody();
    body.appendChild(renderSegmentsToDom(mammologySegments, fieldValues, {}));

    const roundTripped = serializeEditableToSegments(body);
    const standaloneNewlines = roundTripped.filter(
      (s: any) => s.type === 'text' && !s.html && s.content === '\n',
    );
    assert.equal(standaloneNewlines.length, 0);

    const out = document.createElement('div');
    out.appendChild(renderSegmentsToDom(roundTripped, fieldValues, {}));
    assert.match(out.innerHTML, /<b>ST\.LOCALIS:/);
    assert.doesNotMatch(out.innerHTML, /дольчата\.Вогнещевої/);
  });

  it('round-trips centered heading after field without extra blank line', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('diagnosis', 'Складна кіста', 'ДІАГНОЗ', {}));
    const alignDiv = document.createElement('div');
    alignDiv.className = 'document-align document-align--center';
    alignDiv.style.textAlign = 'center';
    const heading = document.createElement('h2');
    heading.textContent = 'Рекомендовано';
    alignDiv.appendChild(heading);
    body.appendChild(alignDiv);
    body.appendChild(createFieldToken('recommended', 'Консультація онколога', 'Recommended', {}));

    const segments = serializeEditableToSegments(body);
    assert.ok(
      !segments.some((s: any) => s.type === 'text' && !s.html && s.content === '\n'),
      'no standalone newline before centered heading',
    );

    const out = document.createElement('div');
    out.appendChild(
      renderSegmentsToDom(
        segments,
        { diagnosis: 'Складна кіста', recommended: 'Консультація онколога' },
        {},
      ),
    );
    assert.doesNotMatch(out.innerHTML, /<br>\s*<h2>Рекомендовано<\/h2>/);
    assert.match(out.innerHTML, /<h2>Рекомендовано<\/h2>/);

    const roundTripped = serializeEditableToSegments(out);
    assert.ok(
      !roundTripped.some((s: any) => s.type === 'text' && !s.html && s.content === '\n'),
      'round-trip should not reintroduce standalone newline before heading',
    );
  });

  it('save-style clone serialize does not remove structural br from live dom', () => {
    const body = buildSectionBody();
    body.appendChild(createFieldToken('f1', 'first value', 'Field 1', {}));
    body.appendChild(textToFragment('.\nSecond label: '));
    body.appendChild(createFieldToken('f2', 'second value', 'Field 2', {}));
    const heading = document.createElement('h2');
    heading.textContent = 'Section title';
    body.appendChild(heading);
    body.appendChild(document.createElement('br'));
    body.appendChild(createFieldToken('f3', 'third value', 'Field 3', {}));

    const liveBrCount = body.querySelectorAll('br').length;
    const serializeRoot = body.cloneNode(true);
    serializeEditableToSegments(serializeRoot);

    assert.equal(
      body.querySelectorAll('br').length,
      liveBrCount,
      'live dom should keep structural br after save-style serialize',
    );
    assert.ok(body.querySelector('h2 + br'), 'structural br after heading should remain on live dom');
  });
});

describe('execRichTextCommand inline formatting', () => {
  it('routes bold, italic, underline, and strikeThrough through toggleInlineTag', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('./rich-text.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    assert.match(source, /const inlineTag = \{ bold: 'B', italic: 'I', underline: 'U', strikeThrough: 'S' \}/);
    assert.match(
      source,
      /if \(inlineTag\) \{\s*return finishRichTextCommand\(editable, toggleInlineTag\(editable, inlineTag, savedRange\)\);/,
    );
  });

  it('preserves row line breaks when bolding formatted static labels', () => {
    const body = buildSectionBody();
    const firstLabel = document.createElement('b');
    firstLabel.textContent = 'ST.LOCALIS: ';
    body.appendChild(firstLabel);
    body.appendChild(createFieldToken('statusLocalis', 'дольчата', 'ST.LOCALIS', {}));
    const secondLabel = document.createElement('b');
    secondLabel.appendChild(textToFragment('.\nВогнещевої патології пальпаторно: '));
    body.appendChild(secondLabel);
    body.appendChild(createFieldToken('focalPalpation', 'до 1 см', 'Focal', {}));

    const segments = serializeEditableToSegments(body);
    const out = document.createElement('div');
    out.appendChild(
      renderSegmentsToDom(
        segments,
        { statusLocalis: 'дольчата', focalPalpation: 'до 1 см' },
        {},
      ),
    );

    assert.match(out.innerHTML, /<b>ST\.LOCALIS:/);
    assert.match(out.innerHTML, /дольчата[\s\S]*<br>[\s\S]*Вогнещевої патології пальпаторно:/);
    assert.doesNotMatch(out.innerHTML, /дольчата\.Вогнещевої/);
  });

  it('does not format selections that intersect field tokens', () => {
    const body = buildSectionBody();
    body.appendChild(textToFragment('Label: '));
    body.appendChild(createFieldToken('f1', 'value', 'Field', {}));

    const beforeHtml = body.innerHTML;
    const applied = execRichTextCommand('bold', body, selectNodeContentsRange(body));

    assert.equal(applied, false);
    assert.equal(body.innerHTML, beforeHtml);
  });

  it('clear formatting unwraps alignment but keeps field tokens', () => {
    const body = buildSectionBody();
    const alignDiv = document.createElement('div');
    alignDiv.className = 'document-align document-align--center';
    alignDiv.setAttribute('style', 'text-align: center');
    alignDiv.appendChild(textToFragment('Label: '));
    alignDiv.appendChild(createFieldToken('f1', 'OD', 'OD', {}));
    body.appendChild(alignDiv);

    const range = selectNodeContentsRange(body);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const applied = execRichTextCommand('removeFormat', body, range);
    assert.equal(applied, true);
    assert.equal(body.querySelector('.document-align'), null);
    const token = body.querySelector('.field-token[data-field-id="f1"]');
    assert.ok(token);
    assert.equal(token.textContent, 'OD');
    assert.match(body.textContent ?? '', /Label:/);
  });
});

describe('applyBlockHeading and applyBlockAlignment', () => {
  it('uses extractContents for heading and alignment wrappers', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('./rich-text.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    const headingFn = source.match(/function wrapRangeInHeading[\s\S]*?^}/m)?.[0] ?? '';
    const alignFn = source.match(/function wrapRangeInAlignmentDiv[\s\S]*?^}/m)?.[0] ?? '';
    assert.match(headingFn, /range\.extractContents\(\)/);
    assert.doesNotMatch(headingFn, /surroundContents/);
    assert.match(alignFn, /range\.extractContents\(\)/);
    assert.doesNotMatch(alignFn, /surroundContents/);
  });

  it('does not apply heading when the caret is inside a field token', () => {
    const body = buildSectionBody();
    body.appendChild(textToFragment('ST.LOCALIS: '));
    const field = createFieldToken('statusLocalis', 'дольчата', 'ST.LOCALIS', {});
    body.appendChild(field);
    body.appendChild(textToFragment('.\nВогнещевої патології пальпаторно: '));
    body.appendChild(createFieldToken('focalPalpation', 'до 1 см', 'Focal', {}));

    const beforeHtml = body.innerHTML;
    const applied = applyBlockHeading(body, 2, selectNodeContentsRange(field));
    assert.equal(applied, false);
    assert.equal(body.innerHTML, beforeHtml);
  });

  it('preserves mammology row breaks after h2 on a single row label', () => {
    const body = buildSectionBody();
    body.appendChild(textToFragment('ST.LOCALIS: '));
    body.appendChild(createFieldToken('statusLocalis', 'дольчата', 'ST.LOCALIS', {}));
    const rowLabel = document.createElement('span');
    rowLabel.appendChild(textToFragment('.\nВогнещевої патології пальпаторно: '));
    body.appendChild(rowLabel);
    body.appendChild(createFieldToken('focalPalpation', 'до 1 см', 'Focal', {}));

    const heading = document.createElement('h2');
    heading.appendChild(textToFragment('.\nВогнещевої патології пальпаторно: '));
    body.replaceChild(heading, rowLabel);

    const segments = serializeEditableToSegments(body);
    const out = document.createElement('div');
    out.appendChild(
      renderSegmentsToDom(
        segments,
        { statusLocalis: 'дольчата', focalPalpation: 'до 1 см' },
        {},
      ),
    );

    assert.match(out.innerHTML, /<h2>[\s\S]*Вогнещевої патології пальпаторно:/);
    assert.match(out.innerHTML, /дольчата[\s\S]*<h2>[\s\S]*<br>[\s\S]*Вогнещевої/);
    assert.doesNotMatch(out.innerHTML, /дольчата\.Вогнещевої/);
  });

  it('preserves mammology row breaks after center alignment on a single row label', () => {
    const body = buildSectionBody();
    body.appendChild(textToFragment('ST.LOCALIS: '));
    body.appendChild(createFieldToken('statusLocalis', 'дольчата', 'ST.LOCALIS', {}));
    const rowLabel = document.createElement('span');
    rowLabel.appendChild(textToFragment('.\nВогнещевої патології пальпаторно: '));
    body.appendChild(rowLabel);
    body.appendChild(createFieldToken('focalPalpation', 'до 1 см', 'Focal', {}));

    const alignDiv = document.createElement('div');
    alignDiv.className = 'document-align document-align--center';
    alignDiv.style.textAlign = 'center';
    alignDiv.appendChild(textToFragment('.\nВогнещевої патології пальпаторно: '));
    body.replaceChild(alignDiv, rowLabel);

    const segments = serializeEditableToSegments(body);
    const out = document.createElement('div');
    out.appendChild(
      renderSegmentsToDom(
        segments,
        { statusLocalis: 'дольчата', focalPalpation: 'до 1 см' },
        {},
      ),
    );

    assert.match(out.innerHTML, /document-align--center/);
    assert.match(out.innerHTML, /дольчата[\s\S]*<br>[\s\S]*Вогнещевої патології пальпаторно:/);
    assert.doesNotMatch(out.innerHTML, /дольчата\.Вогнещевої/);
  });

  it('center-aligns selections that include field tokens', () => {
    const body = buildSectionBody();
    body.appendChild(textToFragment('Label: '));
    body.appendChild(createFieldToken('f1', 'value', 'Field', {}));

    const applied = applyBlockAlignment(body, 'center', selectNodeContentsRange(body));
    assert.equal(applied, true);
    const alignDiv = body.querySelector('.document-align--center');
    assert.ok(alignDiv);
    assert.ok(alignDiv.querySelector('.field-token[data-field-id="f1"]'));
    assert.match(alignDiv.textContent ?? '', /Label:/);
  });

  it('keeps document tables outside the alignment wrapper', () => {
    const body = buildSectionBody();
    body.appendChild(textToFragment('Before '));
    body.appendChild(createFieldToken('f1', 'value', 'Field', {}));
    const table = document.createElement('div');
    table.className = 'document-table';
    table.dataset.tableId = 't1';
    table.textContent = 'table';
    body.appendChild(table);
    body.appendChild(textToFragment(' After'));

    const applied = applyBlockAlignment(body, 'right', selectNodeContentsRange(body));
    assert.equal(applied, true);
    const alignDiv = body.querySelector('.document-align--right');
    assert.ok(alignDiv);
    assert.ok(alignDiv.querySelector('.field-token[data-field-id="f1"]'));
    assert.equal(alignDiv.querySelector('.document-table'), null);
    assert.ok(body.querySelector(':scope > .document-table'));
  });

  it('aligns only the selected line inside a multi-line alignment block', () => {
    const body = buildSectionBody();
    const wrap = document.createElement('div');
    wrap.className = 'document-align document-align--left';
    wrap.setAttribute('style', 'text-align: left');
    const line1 = document.createTextNode('First line');
    const br = document.createElement('br');
    const line2 = document.createTextNode('Second line');
    wrap.append(line1, br, line2);
    body.appendChild(wrap);

    // Partial selection of line2 only (not the whole left-aligned block).
    const partial = selectNodeContentsRange(wrap);
    partial.startOffset = 2;
    partial.endOffset = 3;
    partial.extractContents = () => {
      const frag = document.createDocumentFragment();
      if (line2.parentNode === wrap) frag.appendChild(line2);
      return frag;
    };
    partial.insertNode = (el: any) => {
      br.after(el);
    };

    const applied = applyBlockAlignment(body, 'center', partial);
    assert.equal(applied, true);

    // Outer block stays left; only the second line is wrapped as center.
    assert.equal(wrap.getAttribute('style'), 'text-align: left');
    const nested = wrap.querySelector('.document-align--center');
    assert.ok(nested);
    assert.match(nested?.textContent ?? '', /Second line/);
    assert.doesNotMatch(nested?.textContent ?? '', /First line/);
  });

  it('aligns a single list item without centering the whole editor', () => {
    const body = buildSectionBody();
    body.appendChild(textToFragment('Intro'));
    const ol = document.createElement('ol');
    const li1 = document.createElement('li');
    li1.textContent = 'one';
    const li2 = document.createElement('li');
    li2.textContent = 'two';
    ol.append(li1, li2);
    body.appendChild(ol);

    const caret: any = {
      collapsed: true,
      startContainer: li2.firstChild,
      startOffset: 0,
      endContainer: li2.firstChild,
      endOffset: 0,
      commonAncestorContainer: li2,
    };
    const applied = applyBlockAlignment(body, 'center', caret);
    assert.equal(applied, true);
    assert.equal(li2.style.textAlign, 'center');
    assert.equal(li1.style.textAlign || '', '');
    assert.equal(body.querySelector('.document-align--center'), null);
  });
});

describe('sanitizeHtml line breaks', () => {
  it('turns contenteditable div lines into br instead of an inline string', () => {
    const html = [
      '<div>7575 W 20th Ave, Denver,</div>',
      '<div>1111111</div>',
      '<div>Colorado 80214</div>',
      '<div>United States</div>',
    ].join('');
    assert.equal(
      sanitizeHtml(html),
      '7575 W 20th Ave, Denver,<br>1111111<br>Colorado 80214<br>United States',
    );
  });

  it('turns paragraph lines into br', () => {
    assert.equal(
      sanitizeHtml('<p>line one</p><p>line two</p>'),
      'line one<br>line two',
    );
  });

  it('keeps an empty contenteditable line as a blank break', () => {
    assert.equal(
      sanitizeHtml('<div>line one</div><div><br></div><div>line two</div>'),
      'line one<br><br>line two',
    );
  });

  it('does not flatten aligned divs', () => {
    const html = '<div style="text-align: center">Centered</div>';
    assert.match(sanitizeHtml(html), /<div style="text-align: center">Centered<\/div>/i);
  });

  it('does not insert an extra br when a br already separates lines', () => {
    assert.equal(sanitizeHtml('line one<br><div>line two</div>'), 'line one<br>line two');
  });
});
