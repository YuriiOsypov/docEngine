import {
  createEmptyImageValue,
  isImageValueEmpty,
  normalizeImageValue,
} from '../../services/image-upload.js';
import { isHtmlValueEmpty } from '../rich-text.js';
import { registerField } from './registry.js';
import {
  escapeAttr,
  normalizeIntegerDisplayFormat,
  infoTipHtml,
  readCheckbox,
  readInputValue,
  readNumericDisplayFormatFields,
  renderNumericDisplayFormatFields,
} from './schema-form-dom.js';
import { formatNumericDisplay } from '@docengine/engine';

function baseSchema(type: any, label: any, name: any) {
  return { type, label, name: name || label, required: false };
}

function scalarEmpty(value: any) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** @type {import('./registry.js').FieldHandler[]} */
const BUILTIN_HANDLERS = [
  {
    type: 'text',
    label: 'Text',
    paletteOrder: 10,
    createSchema(label: any, name: any) {
      return { ...baseSchema('text', label, name), defaultText: '' };
    },
    getEmptyValue: () => '',
    resolveDefaultValue(schema: any) {
      return schema.defaultText ?? '';
    },
    toDisplayConfig(schema: any) {
      return { picker: 'text', label: schema.label, htmlEditor: !!schema.htmlEditor };
    },
    toPickerConfig(schema: any) {
      return {
        picker: 'text',
        label: schema.label,
        defaultText: schema.defaultText ?? '',
        htmlEditor: !!schema.htmlEditor,
      };
    },
    renderSchemaFields(host: any, schema: any) {
      host.innerHTML = `
        <label class="schema-form__row">
          <span>Default text</span>
          <input type="text" data-field="defaultText" value="${escapeAttr(schema.defaultText ?? '')}" />
        </label>
        <label class="schema-form__row schema-form__row--checkbox">
          <input type="checkbox" data-field="htmlEditor"${schema.htmlEditor ? ' checked' : ''} />
          <span>HTML editor</span>
        </label>
      `;
    },
    readSchemaFields(host: any) {
      const patch: any = { defaultText: readInputValue(host, 'defaultText') };
      if (readCheckbox(host, 'htmlEditor')) patch.htmlEditor = true;
      else patch.htmlEditor = undefined;
      return patch;
    },
    formatDisplay(value: any, { emptyLabel }: any) {
      if (scalarEmpty(value)) return emptyLabel ?? '';
      return String(value);
    },
    isEmpty(value: any, schema: any) {
      if (schema?.htmlEditor && typeof value === 'string') return isHtmlValueEmpty(value);
      return scalarEmpty(value);
    },
    pdfRenderMode(schema: any): 'html' | 'plain' {
      return schema?.htmlEditor ? 'html' : 'plain';
    },
  },
  {
    type: 'integer',
    label: 'Number',
    paletteOrder: 20,
    createSchema(label: any, name: any) {
      return {
        ...baseSchema('integer', label, name),
        min: 0,
        max: 999,
        defaultValue: '',
        suffix: '',
        displayFormat: 'plain',
        currencyCode: 'EUR',
      };
    },
    getEmptyValue: () => '',
    resolveDefaultValue(schema: any) {
      const value = schema.defaultValue;
      return value === '' || value == null ? '' : String(value);
    },
    toDisplayConfig(schema: any) {
      return {
        picker: 'integer',
        label: schema.label,
        suffix: schema.suffix ?? '',
        displayFormat: normalizeIntegerDisplayFormat(schema.displayFormat),
        currencyCode: schema.currencyCode ?? 'EUR',
        fractionDigits: schema.fractionDigits,
      };
    },
    toPickerConfig(schema: any) {
      return {
        picker: 'integer',
        label: schema.label,
        min: schema.min ?? 0,
        max: schema.max ?? 999,
        defaultValue: schema.defaultValue ?? '',
        suffix: schema.suffix ?? '',
        displayFormat: normalizeIntegerDisplayFormat(schema.displayFormat),
        currencyCode: schema.currencyCode ?? 'EUR',
        fractionDigits: schema.fractionDigits,
      };
    },
    renderSchemaFields(host: any, schema: any) {
      host.innerHTML = `
        <label class="schema-form__row">
          <span>Min</span>
          <input type="number" data-field="min" value="${schema.min ?? 0}" />
        </label>
        <label class="schema-form__row">
          <span>Max</span>
          <input type="number" data-field="max" value="${schema.max ?? 999}" />
        </label>
        <label class="schema-form__row">
          <span>Default value</span>
          <input type="number" data-field="defaultValue" value="${escapeAttr(schema.defaultValue ?? '')}" />
        </label>
      `;
      renderNumericDisplayFormatFields(host, schema, { append: true });
    },
    readSchemaFields(host: any) {
      const defaultValue = readInputValue(host, 'defaultValue');
      return {
        min: Number(readInputValue(host, 'min') || 0),
        max: Number(readInputValue(host, 'max') || 999),
        defaultValue: defaultValue === '' ? '' : String(defaultValue),
        ...readNumericDisplayFormatFields(host),
      };
    },
    formatDisplay(value: any, { schema, def, emptyLabel }: any) {
      if (scalarEmpty(value)) return emptyLabel ?? '';
      return formatNumericDisplay(value, {
        displayFormat: def?.displayFormat ?? schema?.displayFormat,
        currencyCode: def?.currencyCode ?? schema?.currencyCode,
        fractionDigits: def?.fractionDigits ?? schema?.fractionDigits,
        suffix: def?.suffix ?? schema?.suffix,
      });
    },
    isEmpty(value: any) {
      return scalarEmpty(value);
    },
    pdfRenderMode: () => 'plain',
  },
  {
    type: 'computed',
    label: 'Computed',
    paletteOrder: 40,
    editableInFill: false,
    createSchema(label: any, name: any) {
      return {
        ...baseSchema('computed', label, name),
        formula: '',
        suffix: '',
        displayFormat: 'plain',
        currencyCode: 'EUR',
      };
    },
    getEmptyValue: () => '',
    resolveDefaultValue() {
      return '';
    },
    toDisplayConfig(schema: any) {
      return {
        picker: 'computed',
        label: schema.label,
        suffix: schema.suffix ?? '',
        displayFormat: normalizeIntegerDisplayFormat(schema.displayFormat),
        currencyCode: schema.currencyCode ?? 'EUR',
        fractionDigits: schema.fractionDigits,
      };
    },
    toPickerConfig(schema: any) {
      return {
        picker: 'computed',
        label: schema.label,
        formula: schema.formula ?? '',
        suffix: schema.suffix ?? '',
        displayFormat: normalizeIntegerDisplayFormat(schema.displayFormat),
        currencyCode: schema.currencyCode ?? 'EUR',
        fractionDigits: schema.fractionDigits,
      };
    },
    /** Appended after the formula UI in the schema editor (does not replace it). */
    renderSchemaFields(host: any, schema: any) {
      renderNumericDisplayFormatFields(host, schema, {
        append: true,
        hint: 'Computed result stays unformatted internally. Format applies in the document, preview, and PDF.',
      });
    },
    readSchemaFields(host: any) {
      return {
        formula: readInputValue(host, 'formula'),
        ...readNumericDisplayFormatFields(host),
      };
    },
    formatDisplay(value: any, { schema, def, emptyLabel }: any) {
      if (scalarEmpty(value)) return emptyLabel ?? '';
      return formatNumericDisplay(value, {
        displayFormat: def?.displayFormat ?? schema?.displayFormat,
        currencyCode: def?.currencyCode ?? schema?.currencyCode,
        fractionDigits: def?.fractionDigits ?? schema?.fractionDigits,
        suffix: def?.suffix ?? schema?.suffix,
      });
    },
    isEmpty(value: any) {
      return scalarEmpty(value);
    },
    pdfRenderMode: () => 'plain',
  },
  {
    type: 'image',
    label: 'Image',
    paletteOrder: 50,
    createSchema(label: any, name: any) {
      return { ...baseSchema('image', label, name), maxWidth: 320, altText: '' };
    },
    getEmptyValue: () => createEmptyImageValue(),
    resolveDefaultValue() {
      return createEmptyImageValue();
    },
    toDisplayConfig(schema: any) {
      return {
        picker: 'image',
        label: schema.label,
        maxWidth: schema.maxWidth ?? 320,
        altText: schema.altText ?? '',
      };
    },
    toPickerConfig(schema: any) {
      return {
        picker: 'image',
        label: schema.label,
        maxWidth: schema.maxWidth ?? 320,
        altText: schema.altText ?? '',
      };
    },
    renderSchemaFields(host: any, schema: any) {
      host.innerHTML = `
        <label class="schema-form__row">
          <span>Max width (px)</span>
          <input type="number" data-field="maxWidth" value="${schema.maxWidth ?? 320}" />
        </label>
        <label class="schema-form__row">
          <span>Alt text</span>
          <input type="text" data-field="altText" value="${escapeAttr(schema.altText ?? '')}" />
        </label>
        <p class="schema-form__hint">Image is chosen when filling the document, not in design mode.</p>
      `;
    },
    readSchemaFields(host: any) {
      return {
        maxWidth: Number(readInputValue(host, 'maxWidth') || 320),
        altText: readInputValue(host, 'altText'),
      };
    },
    formatDisplay(value: any, { emptyLabel }: any) {
      if (isImageValueEmpty(value)) return emptyLabel ?? '';
      const img = normalizeImageValue(value);
      return img.caption || '[Image]';
    },
    isEmpty(value: any) {
      return isImageValueEmpty(value);
    },
    pdfRenderMode: () => 'plain',
  },
  {
    type: 'logical',
    label: 'Logical',
    paletteOrder: 45,
    createSchema(label: any, name: any) {
      return { ...baseSchema('logical', label, name), defaultValue: null };
    },
    getEmptyValue: () => null,
    resolveDefaultValue(schema: any) {
      const value = schema.defaultValue;
      return value === true || value === false ? value : null;
    },
    toDisplayConfig(schema: any) {
      return { picker: 'logical', label: schema.label };
    },
    toPickerConfig(schema: any) {
      return { picker: 'logical', label: schema.label };
    },
    renderSchemaFields(host: any, schema: any) {
      const defaultValue = schema.defaultValue;
      host.innerHTML = `
        <label class="schema-form__row">
          <span>Default value</span>
          <select data-field="defaultValue">
            <option value=""${defaultValue !== true && defaultValue !== false ? ' selected' : ''}>Empty</option>
            <option value="true"${defaultValue === true ? ' selected' : ''}>Yes</option>
            <option value="false"${defaultValue === false ? ' selected' : ''}>No</option>
          </select>
        </label>
      `;
    },
    readSchemaFields(host: any) {
      const raw = readInputValue(host, 'defaultValue');
      if (raw === 'true') return { defaultValue: true };
      if (raw === 'false') return { defaultValue: false };
      return { defaultValue: undefined };
    },
    formatDisplay(value: any, { emptyLabel }: any) {
      if (value !== true && value !== false) return emptyLabel ?? '';
      return value ? 'Yes' : 'No';
    },
    isEmpty(value: any) {
      return value !== true && value !== false;
    },
    pdfRenderMode: () => 'plain',
  },
  {
    type: 'signature',
    label: 'Signature',
    paletteOrder: 52,
    createSchema(label: any, name: any) {
      return { ...baseSchema('signature', label, name), maxWidth: 320 };
    },
    getEmptyValue: () => '',
    resolveDefaultValue() {
      return '';
    },
    toDisplayConfig(schema: any) {
      return {
        picker: 'signature',
        label: schema.label,
        maxWidth: schema.maxWidth ?? 320,
      };
    },
    toPickerConfig(schema: any) {
      return {
        picker: 'signature',
        label: schema.label,
        maxWidth: schema.maxWidth ?? 320,
      };
    },
    renderSchemaFields(host: any, schema: any) {
      host.innerHTML = `
        <label class="schema-form__row">
          <span>Max width (px)</span>
          <input type="number" data-field="maxWidth" value="${schema.maxWidth ?? 320}" />
        </label>
        <p class="schema-form__hint">Drawn in fill mode and stored as a PNG data URL in document JSON.</p>
        <p class="schema-form__hint schema-form__hint--legal">Display-only signature pad for internal validation — not a cryptographically signed legal e-signature.</p>
      `;
    },
    readSchemaFields(host: any) {
      return {
        maxWidth: Number(readInputValue(host, 'maxWidth') || 320),
      };
    },
    formatDisplay(value: any, { emptyLabel }: any) {
      if (isImageValueEmpty(value)) return emptyLabel ?? '';
      return '[Signature]';
    },
    isEmpty(value: any) {
      return isImageValueEmpty(value);
    },
    pdfRenderMode: () => 'plain',
  },
  {
    type: 'barcode',
    label: 'Barcode',
    paletteOrder: 55,
    createSchema(label: any, name: any) {
      return {
        ...baseSchema('barcode', label, name),
        symbology: 'code128',
        maxWidth: 180,
        height: 10,
        displayValue: true,
        quietZone: true,
      };
    },
    getEmptyValue: () => '',
    resolveDefaultValue() {
      return '';
    },
    toDisplayConfig(schema: any) {
      return {
        picker: 'barcode',
        label: schema.label,
        symbology: schema.symbology ?? 'code128',
        maxWidth: schema.maxWidth ?? 180,
        height: schema.height ?? 10,
        displayValue: schema.displayValue !== false,
        quietZone: schema.quietZone !== false,
      };
    },
    toPickerConfig(schema: any) {
      return {
        picker: 'text',
        label: schema.label,
        defaultText: '',
      };
    },
    renderSchemaFields(host: any, schema: any) {
      const symbology = schema.symbology ?? 'code128';
      host.innerHTML = `
        <label class="schema-form__row">
          <span>Symbology</span>
          <select data-field="symbology">
            <option value="code128"${symbology === 'code128' ? ' selected' : ''}>Code 128</option>
            <option value="qr"${symbology === 'qr' ? ' selected' : ''}>QR Code</option>
            <option value="ean13"${symbology === 'ean13' ? ' selected' : ''}>EAN-13</option>
            <option value="code39"${symbology === 'code39' ? ' selected' : ''}>Code 39</option>
          </select>
        </label>
        <label class="schema-form__row">
          <span>Max width (px)</span>
          <input type="number" data-field="maxWidth" value="${schema.maxWidth ?? 180}" />
        </label>
        <label class="schema-form__row">
          <span>Bar height</span>
          <input type="number" data-field="height" value="${schema.height ?? 10}" />
        </label>
        <label class="schema-form__row schema-form__row--checkbox">
          <input type="checkbox" data-field="displayValue"${schema.displayValue !== false ? ' checked' : ''} />
          <span>Show value under bars</span>
        </label>
        <label class="schema-form__row schema-form__row--checkbox">
          <input type="checkbox" data-field="quietZone"${schema.quietZone !== false ? ' checked' : ''} />
          <span>Quiet zone</span>
        </label>
        <p class="schema-form__hint">Value is entered when filling (or mapped from a scalar payload path). Invalid codes show a placeholder.</p>
      `;
    },
    readSchemaFields(host: any) {
      return {
        symbology: readInputValue(host, 'symbology') || 'code128',
        maxWidth: Number(readInputValue(host, 'maxWidth') || 180),
        height: Number(readInputValue(host, 'height') || 10),
        displayValue: readCheckbox(host, 'displayValue'),
        quietZone: readCheckbox(host, 'quietZone'),
      };
    },
    formatDisplay(value: any, { emptyLabel }: any) {
      if (scalarEmpty(value)) return emptyLabel ?? '';
      return String(value);
    },
    isEmpty(value: any) {
      return scalarEmpty(value);
    },
    pdfRenderMode: () => 'plain',
  },
  {
    type: 'list',
    label: 'List',
    paletteOrder: 60,
    createSchema(label: any, name: any) {
      return {
        ...baseSchema('list', label, name),
        multi: true,
        itemLayout: 'inline',
        itemPrefix: '',
        items: [{ id: 'item1', label: 'Option 1' }],
        defaultValue: [] as any[],
      };
    },
    getEmptyValue: (): any[] => [],
    resolveDefaultValue(schema: any) {
      return Array.isArray(schema.defaultValue) ? [...schema.defaultValue] : [];
    },
    toDisplayConfig(schema: any) {
      return {
        picker: 'list',
        label: schema.label,
        schemaType: 'list',
        multi: true,
        itemLayout: schema.itemLayout ?? 'inline',
        itemPrefix: schema.itemPrefix ?? '',
      };
    },
    toPickerConfig(schema: any, catalogs: any) {
      return {
        picker: 'list',
        label: schema.label,
        multi: true,
        withCode: catalogs.resolveSchemaWithCode(schema),
        listSource: schema.listSource,
        sourceCollection: schema.sourceCollection,
        sourceLabelField: schema.sourceLabelField,
        schemaType: 'list',
        itemLayout: schema.itemLayout ?? 'inline',
        itemPrefix: schema.itemPrefix ?? '',
        defaultValue: Array.isArray(schema.defaultValue) ? [...schema.defaultValue] : [],
        // Remote lists never use static Option 1 leftovers.
        items:
          schema.listSource === 'remote' || schema.sourceCollection
            ? []
            : catalogs.resolveSchemaItems(schema),
      };
    },
    formatDisplay(value: any, { schema, def, emptyLabel }: any) {
      if (value == null || (Array.isArray(value) && value.length === 0) || value === '') {
        return emptyLabel ?? '';
      }
      // Let non-list shapes fall through to generic formatting.
      if (typeof value === 'object' && !Array.isArray(value)) return null;
      const items = def?.items ?? schema?.items ?? [];
      const resolveOne = (raw: any) => {
        const key = String(raw ?? '');
        const found = items.find((item: any) => item?.id === key || item?.label === key);
        return found?.label ?? key;
      };
      const labels = Array.isArray(value) ? value.map(resolveOne) : [resolveOne(value)];
      const layout = def?.itemLayout ?? schema?.itemLayout ?? 'inline';
      const prefix = def?.itemPrefix ?? schema?.itemPrefix ?? '';
      switch (layout) {
        case 'lines':
          return labels.join('\n');
        case 'bullet':
          return labels.map((v: any) => `• ${v}`).join('\n');
        case 'numeric':
          return labels.map((v: any, i: any) => `${i + 1}. ${v}`).join('\n');
        case 'custom':
          return labels.map((v: any) => `${prefix}${v}`).join('\n');
        default:
          return labels.join('; ');
      }
    },
    isEmpty(value: any) {
      return scalarEmpty(value);
    },
  },
  {
    type: 'choice',
    label: 'Choice',
    paletteOrder: 70,
    createSchema(label: any, name: any) {
      return {
        ...baseSchema('choice', label, name),
        multi: false,
        items: [{ id: 'item1', label: 'Option 1' }],
        defaultValue: '',
      };
    },
    getEmptyValue: () => '',
    resolveDefaultValue(schema: any) {
      return schema.defaultValue ?? '';
    },
    toDisplayConfig(schema: any) {
      return {
        picker: 'list',
        label: schema.label,
        schemaType: 'choice',
        multi: schema.multi ?? false,
      };
    },
    toPickerConfig(schema: any, catalogs: any) {
      return {
        picker: 'list',
        label: schema.label,
        multi: schema.multi ?? false,
        withCode: catalogs.resolveSchemaWithCode(schema),
        listSource: schema.listSource,
        sourceCollection: schema.sourceCollection,
        sourceLabelField: schema.sourceLabelField,
        schemaType: 'choice',
        itemLayout: 'inline',
        defaultValue: schema.defaultValue ?? '',
        items:
          schema.listSource === 'remote' || schema.sourceCollection
            ? []
            : catalogs.resolveSchemaItems(schema),
      };
    },
    formatDisplay(value: any, { schema, def, emptyLabel }: any) {
      if (scalarEmpty(value)) return emptyLabel ?? '';
      const items = def?.items ?? schema?.items ?? [];
      const withCode = !!(def?.withCode ?? schema?.withCode);
      const resolveOne = (raw: any) => {
        const key = String(raw ?? '');
        const found = items.find((item: any) => item?.id === key || item?.label === key);
        if (!found) return key;
        if (withCode && found.code) return `${found.code} — ${found.label}`;
        return found.label ?? key;
      };
      if (Array.isArray(value)) {
        return value.map(resolveOne).filter(Boolean).join('; ');
      }
      return resolveOne(value);
    },
    isEmpty(value: any) {
      return scalarEmpty(value);
    },
  },
  {
    type: 'tree',
    label: 'Tree',
    paletteOrder: 80,
    createSchema(label: any, name: any) {
      return {
        ...baseSchema('tree', label, name),
        tree: [{ label: 'Node 1', children: [{ label: 'Leaf 1' }] }],
        defaultValue: [] as any[],
      };
    },
    getEmptyValue: (): any[] => [],
    resolveDefaultValue(schema: any) {
      return Array.isArray(schema.defaultValue) ? [...schema.defaultValue] : [];
    },
    toDisplayConfig(schema: any) {
      return { picker: 'tree', label: schema.label, schemaType: 'tree', multi: true };
    },
    toPickerConfig(schema: any, catalogs: any) {
      return {
        picker: 'tree',
        label: schema.label,
        tree: catalogs.resolveSchemaTree(schema),
        multi: true,
        defaultValue: Array.isArray(schema.defaultValue) ? [...schema.defaultValue] : [],
      };
    },
    isEmpty(value: any) {
      return scalarEmpty(value);
    },
  },
  {
    type: 'table',
    label: 'Table',
    paletteOrder: 90,
    insertion: 'table',
    createSchema(label: any, name: any) {
      return {
        ...baseSchema('table', label, name),
        columns: [
          { key: 'column_1', label: 'Column 1' },
          { key: 'column_2', label: 'Column 2' },
        ],
        cellType: 'text',
      };
    },
    getEmptyValue: () => ({}),
    resolveDefaultValue() {
      return {};
    },
    toDisplayConfig(schema: any) {
      return { picker: 'text', label: schema.label ?? '' };
    },
    toPickerConfig(schema: any) {
      return { picker: 'text', label: schema.label ?? '' };
    },
  },
  {
    type: 'pivotTable',
    label: 'Pivot Table',
    paletteOrder: 95,
    insertion: 'table',
    editableInFill: false,
    createSchema(label: any, name: any) {
      return {
        ...baseSchema('pivotTable', label, name),
        rowProperty: 'Region',
        columnProperty: 'Product',
        valueProperty: 'Amount',
        aggregation: 'sum',
        showRowTotals: true,
        showColumnTotals: true,
        showGrandTotal: true,
        emptyCell: '',
        sortRows: 'asc',
        sortColumns: 'asc',
        displayFormat: 'plain',
        currencyCode: 'EUR',
        valueAlign: 'right',
      };
    },
    getEmptyValue: () => ({ columns: [], rows: [] }),
    resolveDefaultValue() {
      return { columns: [], rows: [] };
    },
    toDisplayConfig(schema: any) {
      return { picker: 'pivotTable', label: schema.label ?? '' };
    },
    toPickerConfig(schema: any) {
      return { picker: 'pivotTable', label: schema.label ?? '' };
    },
    renderSchemaFields(host: any, schema: any) {
      const aggregation = schema.aggregation ?? 'sum';
      const sortRows = schema.sortRows ?? 'asc';
      const sortColumns = schema.sortColumns ?? 'asc';
      const valueAlign =
        schema.valueAlign === 'left' || schema.valueAlign === 'center' || schema.valueAlign === 'right'
          ? schema.valueAlign
          : 'right';
      host.innerHTML = `
        <label class="schema-form__row">
          <span class="schema-form__label-row">
            <span>Row property</span>
            ${infoTipHtml('Bind a source array in Field Mapping. Properties are paths on each array element (e.g. Item__r.Name).')}
          </span>
          <input type="text" data-field="rowProperty" value="${escapeAttr(schema.rowProperty ?? '')}" placeholder="Region" />
        </label>
        <label class="schema-form__row">
          <span>Column property</span>
          <input type="text" data-field="columnProperty" value="${escapeAttr(schema.columnProperty ?? '')}" placeholder="Product" />
        </label>
        <label class="schema-form__row">
          <span>Value property</span>
          <input type="text" data-field="valueProperty" value="${escapeAttr(schema.valueProperty ?? '')}" placeholder="Amount" />
        </label>
        <label class="schema-form__row">
          <span>Aggregation</span>
          <select data-field="aggregation">
            <option value="sum"${aggregation === 'sum' ? ' selected' : ''}>Sum</option>
            <option value="count"${aggregation === 'count' ? ' selected' : ''}>Count</option>
            <option value="avg"${aggregation === 'avg' ? ' selected' : ''}>Average</option>
            <option value="min"${aggregation === 'min' ? ' selected' : ''}>Min</option>
            <option value="max"${aggregation === 'max' ? ' selected' : ''}>Max</option>
            <option value="first"${aggregation === 'first' ? ' selected' : ''}>First</option>
          </select>
        </label>
        <label class="schema-form__row">
          <span>Sort rows</span>
          <select data-field="sortRows">
            <option value="asc"${sortRows === 'asc' ? ' selected' : ''}>Ascending</option>
            <option value="desc"${sortRows === 'desc' ? ' selected' : ''}>Descending</option>
            <option value="none"${sortRows === 'none' ? ' selected' : ''}>None</option>
          </select>
        </label>
        <label class="schema-form__row">
          <span>Sort columns</span>
          <select data-field="sortColumns">
            <option value="asc"${sortColumns === 'asc' ? ' selected' : ''}>Ascending</option>
            <option value="desc"${sortColumns === 'desc' ? ' selected' : ''}>Descending</option>
            <option value="none"${sortColumns === 'none' ? ' selected' : ''}>None</option>
          </select>
        </label>
        <label class="schema-form__row">
          <span>Empty cell</span>
          <input type="text" data-field="emptyCell" value="${escapeAttr(schema.emptyCell ?? '')}" placeholder="(blank)" />
        </label>
        <label class="schema-form__row">
          <span class="schema-form__label-row">
            <span>Value align</span>
            ${infoTipHtml('Aligns aggregation and total cells only — column headers stay left-aligned.')}
          </span>
          <select data-field="valueAlign">
            <option value="left"${valueAlign === 'left' ? ' selected' : ''}>Left</option>
            <option value="center"${valueAlign === 'center' ? ' selected' : ''}>Center</option>
            <option value="right"${valueAlign === 'right' ? ' selected' : ''}>Right</option>
          </select>
        </label>
        <label class="schema-form__row schema-form__row--checkbox">
          <input type="checkbox" data-field="showRowTotals"${schema.showRowTotals ? ' checked' : ''} />
          <span>Show row totals</span>
        </label>
        <label class="schema-form__row schema-form__row--checkbox">
          <input type="checkbox" data-field="showColumnTotals"${schema.showColumnTotals ? ' checked' : ''} />
          <span>Show column totals</span>
        </label>
        <label class="schema-form__row schema-form__row--checkbox">
          <input type="checkbox" data-field="showGrandTotal"${schema.showGrandTotal ? ' checked' : ''} />
          <span class="schema-form__label-row">
            <span>Show grand total</span>
            ${infoTipHtml('Grand total is the bottom-right cell (intersection of row totals and column totals) — the aggregate of every value in the pivot.')}
          </span>
        </label>
      `;
      renderNumericDisplayFormatFields(host, schema, {
        append: true,
        infoTip:
          'Formats aggregation and total cells in the document, preview, and PDF. Stored pivot numbers stay unformatted.',
      });
    },
    readSchemaFields(host: any) {
      const valueAlignRaw = readInputValue(host, 'valueAlign');
      const valueAlign =
        valueAlignRaw === 'left' || valueAlignRaw === 'center' || valueAlignRaw === 'right'
          ? valueAlignRaw
          : 'right';
      return {
        rowProperty: readInputValue(host, 'rowProperty'),
        columnProperty: readInputValue(host, 'columnProperty'),
        valueProperty: readInputValue(host, 'valueProperty'),
        aggregation: readInputValue(host, 'aggregation') || 'sum',
        sortRows: readInputValue(host, 'sortRows') || 'asc',
        sortColumns: readInputValue(host, 'sortColumns') || 'asc',
        emptyCell: readInputValue(host, 'emptyCell'),
        valueAlign,
        showRowTotals: readCheckbox(host, 'showRowTotals'),
        showColumnTotals: readCheckbox(host, 'showColumnTotals'),
        showGrandTotal: readCheckbox(host, 'showGrandTotal'),
        ...readNumericDisplayFormatFields(host),
      };
    },
    formatDisplay() {
      return '[Pivot Table]';
    },
    isEmpty(value: any) {
      if (value == null) return true;
      if (typeof value !== 'object' || Array.isArray(value)) return true;
      return !Array.isArray(value.rows) || value.rows.length === 0;
    },
    pdfRenderMode: () => 'plain',
  },
  {
    type: 'child',
    label: 'Child',
    paletteOrder: 100,
    createSchema(label: any, name: any) {
      return { ...baseSchema('child', label, name), fieldSchemas: {} };
    },
    getEmptyValue: () => ({}),
    resolveDefaultValue() {
      return {};
    },
    toDisplayConfig(schema: any) {
      return { picker: 'child', label: schema.label, schemaType: 'child' };
    },
    toPickerConfig(schema: any) {
      return { picker: 'child', label: schema.label, schemaType: 'child' };
    },
  },
];

let registered = false;

/** Register all built-in field types (idempotent). */
export function registerBuiltinFields() {
  if (registered) return;
  for (const handler of BUILTIN_HANDLERS) {
    registerField(handler);
  }
  registered = true;
}

registerBuiltinFields();
