# @docengine/editor — Interface Specifications

Version: **0.0.105** · IO format version: **`IO_VERSION = 1`**

This document defines every public contract of the library: factory options, instance API, data shapes, catalogs, pickers, and extension points.

---

## 1. Package entry points

| Import | Purpose |
|--------|---------|
| `@docengine/editor` | Factory, utilities, field registry, formula registry, types |
| `@docengine/editor/node` | Headless / n8n subset (document I/O, `evaluateComputedField`, `registerFormulaFunction`) |
| `@docengine/engine` | Headless core: I/O, mapping, formula evaluation and function registry |
| `@docengine/editor/styles.css` | Editor UI styles (modals, tokens, blocks, toolbar) |

**Peer dependency:** `@editorjs/editorjs ^2.30.8`

---

## 2. `createEditor(options)` → `DocEditorInstance`

### 2.1 `CreateEditorOptions`

```ts
interface CreateEditorOptions {
  /** Required. DOM element or CSS selector (e.g. '#editor'). */
  holder: HTMLElement | string;

  /** Initial document. Falls back to defaultDocument or a single empty section. */
  data?: EditorDocument;

  /** Used when data is empty or on first normalize. Always ensured to contain ≥1 documentSection. */
  defaultDocument?: EditorDocument;

  /** Injected value lists and trees for commonListId / commonTreeId. */
  catalogs?: CatalogsInput;

  /** Start in design mode (schema editing, field palette). Default: false. */
  designMode?: boolean;

  /**
   * Enabled Editor.js block tools.
   * Default: ['documentSection', 'templateBlock']
   */
  tools?: Array<'documentSection' | 'templateBlock' | 'visionTable'>;

  /** Required when tools includes 'visionTable'. Custom block class (domain-specific). */
  visionTableTool?: EditorJsToolClass;

  /** Prefix for legacy visionTable cell key migration. Default: 'visionTable'. */
  visionTableFieldId?: string;

  /** Image upload configuration (global for this editor instance). */
  imageUpload?: ImageUploadConfig;

  /**
   * Extra computed-formula functions (add or override built-ins). See §5.5 and §14.3.
   * Same as `registerFormulaFunction` before createEditor — writes the process-wide
   * engine registry, not a per-instance evaluator. Headless hosts (n8n, PDF) must
   * register the same functions or formulas will error at render time.
   */
  formulaFunctions?: FormulaFunctionDef[];

  /** Override built-in field picker modals (partial override allowed). */
  pickers?: Partial<PickerCallbacks>;

  /** Chrome placement and visibility. */
  ui?: CreateEditorUiOptions;

  /** Called after any editor content change. */
  onChange?: (doc: EditorDocument) => void;

  /** Called when field schemas are added, updated, or removed. */
  onSchemaChange?: (fieldSchemas: Record<string, FieldSchema>) => void;

  /** Error hook (reserved for future use). */
  onError?: (error: Error) => void;
}
```

### 2.2 `CreateEditorUiOptions`

```ts
interface CreateEditorUiOptions {
  /** Show "Add block" palette. Default: true */
  palette?: boolean;

  /** Show rich-text toolbar for document sections. Default: true */
  richTextToolbar?: boolean;

  /**
   * Append palette + format toolbar inside this container (e.g. a sticky page header wrapper).
   */
  chromeParent?: HTMLElement | string;

  /** Pin palette + format toolbar while scrolling. Default: true (unless chromeParent handles stickiness). */
  stickyChrome?: boolean;

  /**
   * Insert palette + format chrome after this element (selector or node).
   * Example: '.page-header'
   */
  paletteAfter?: HTMLElement | string;

  /**
   * Insert palette inside this parent, before holder (if holder is child),
   * or after parent (if holder is not a child).
   */
  paletteParent?: HTMLElement | string;

  /** Same pattern for toolbar (before holder by default). */
  toolbarParent?: HTMLElement | string;
  toolbarBefore?: HTMLElement | string;

  /** Show Preview action (icon button). Default: true */
  documentActions?: boolean;

  /** Append document actions inside this container (e.g. app header). */
  documentActionsContainer?: HTMLElement | string;
  documentActionsParent?: HTMLElement | string;
  documentActionsAfter?: HTMLElement | string;

  /** Default PDF filename suggested when saving from preview or exportPdf(). Default: 'document.pdf' */
  pdfFilename?: string;
  /** Optional title prepended in PDF exports. */
  pdfTitle?: string;

  /**
   * Underline / highlight empty fields in fill mode (`.editor-holder--show-fields`).
   * Default: true. Focus ring (`.field-token--focused`) is independent — see §10.1.
   */
  showFieldsInFillMode?: boolean;
}
```

### 2.3 `DocEditorInstance`

```ts
interface DocEditorInstance {
  holder: HTMLElement;
  registry: SchemaRegistry;
  palette: { element: HTMLElement };
  richTextToolbar: { element: HTMLElement; show: (editable: HTMLElement) => void; clearActive: () => void };
  documentActions: { element: HTMLElement; setBusy(busy: boolean): void };

  /** Resolves when Editor.js is ready. */
  readonly ready: Promise<void>;

  /** Current in-memory document (saves blocks first). */
  getDocument(): Promise<EditorDocument>;

  /** Persist Editor.js block state without returning document. */
  save(): Promise<EditorDocument>;

  /** Export formats — see §4. */
  exportDoc(): Promise<DocExport>;
  exportTemplate(): Promise<TemplateExport>;
  exportFields(options?: FieldsExportOptions): Promise<FieldsExport>;
  /** @deprecated Use exportFields() */
  exportDocument(options?: FieldsExportOptions): Promise<FieldsExport>;

  /** Load document, template, or field-values JSON — see §4. */
  load(data: DocExport | TemplateExport | FieldsExport): Promise<void>;

  /** Toggle design vs fill mode (re-inits editor, preserves document). */
  setDesignMode(enabled: boolean): Promise<void>;
  getDesignMode(): boolean;

  /** Toggle empty-field underlines in fill mode (see §10.1). */
  setShowFieldsInFillMode(enabled: boolean): void;
  getShowFieldsInFillMode(): boolean;

  /** Open read-only preview modal. */
  preview(): Promise<void>;

  /** Download document as PDF (same content as preview). */
  exportPdf(options?: PdfExportOptions): Promise<void>;

  /** Check required fields — see §4.5. */
  validate(): Promise<ValidationResult>;

  /** Tear down Editor.js, UI chrome, and holder registry. */
  destroy(): void;
}
```

---

## 3. Document model

### 3.1 `EditorDocument` (in-memory)

```ts
interface EditorDocument {
  time: number;                              // Unix ms timestamp
  fieldSchemas: Record<string, FieldSchema>;
  blocks: EditorBlock[];
  pageSetup?: TemplatePageSetup;
  /** Optional payload→template mapping (see §18). Persisted on template exports. */
  fieldMapping?: FieldMappingSpec;
}
```

An empty editor always starts with **one** `documentSection`. Documents with no sections are normalized to include one empty section. The last remaining section cannot be deleted (toolbar delete is blocked; keyboard deletion is restored immediately with a status notification).

### 3.2 `EditorBlock` (Editor.js block)

Each block has `{ type: string, data: object }`. Supported types:

#### `documentSection`

Prose block with inline field tokens.

```ts
interface DocumentSectionData {
  /** Stable section name — document export key and field ID prefix. Defaults to `label`. */
  name?: string;
  /** Section header shown above prose (editable in design mode). Hidden when empty. */
  label?: string;
  /** When true, section body is hidden in the editor (persisted in document/template). */
  collapsed?: boolean;
  /** When true, this section's content becomes the PDF page header on every page. */
  repeatable?: boolean;
  /** When true, the section title is omitted from document preview (and preview-first PDF). */
  hideTitleInPreview?: boolean;
  /** When true, draw a horizontal rule above the section (editor + preview/PDF). */
  borderTop?: boolean;
  /** When true, draw a horizontal rule below the section (editor + preview/PDF). */
  borderBottom?: boolean;
  segments: Segment[];
  fieldValues: Record<string, FieldValue>;
}

type ColumnsSegment = {
  type: 'columns';
  id?: string;  // stable id for design-mode selection
  widths?: [string?, string?];  // CSS grid track sizes per column (e.g. 1fr, 50%, 200px)
  columns: [Segment[], Segment[]];  // exactly 2 columns
};

type TableSegment = {
  type: 'table';
  id: string;  // table field schema id
  rows?: Array<{ key: string; label: string }>;  // instance rows (fill-time)
};

type Segment =
  | { type: 'text'; content?: string; html?: string; align?: TextAlign }
  | { type: 'field'; id: string; placeholder?: string; align?: TextAlign }
  | ColumnsSegment
  | TableSegment;

type TextAlign = 'left' | 'center' | 'right';
```

- `content` — plain text (may include `\n`)
- `html` — sanitized rich HTML (bold, italic, font, alignment divs)
- `columns` — two-column layout block; each column holds `text`, `field`, `table`, and nested `columns` segments; optional `widths` set column split in design mode
- `table` — inline table block; cell values use `cellFieldId(tableId, rowKey, colKey)` keys in flat `fieldValues`; `rows` on the segment stores runtime instance rows (starts with one empty row; users add/remove rows while filling)
- `fieldValues` — map of `fieldId → value` for all inline fields in this block (flat; includes fields inside columns and table cells)
- `label` — shown in preview whenever non-empty, even when all fields in the section are empty
- `name` — stable Section Name for document export (`sections` keys) and field ID prefix; defaults to `label` when omitted
- `collapsed` — editor-only; preview always shows available body content expanded (no collapse control)
- `borderTop` / `borderBottom` — optional horizontal rules above/below the section in editor, preview, and PDF

#### `templateBlock`

Standalone field or table block.

```ts
interface TemplateBlockData {
  fieldType: FieldType;
  fieldId: string;
  label: string;
  prefixText?: string;
  value?: FieldValue;           // omitted for table
  cells?: Record<string, FieldValue>;  // table only: cellFieldId → value
}
```

#### `visionTable` (legacy, optional tool)

```ts
interface VisionTableData {
  fieldId: string;                // table schema id
  cells: Record<string, FieldValue>;  // keys: {tableId}_{rowKey}_{colKey}
}
```

### 3.3 `FieldValue` (runtime values)

| Field type | Value shape |
|------------|-------------|
| `text` | `string` |
| `integer` | `string` (digits) or `''` |
| `date` | `string` ISO `YYYY-MM-DD` or `''` |
| `choice` | `string` (selected label) or `''` |
| `list` | `string[]` (selected labels) |
| `tree` | `string[]` (selected leaf paths) |
| `image` | `ImageValue` |
| `computed` | `string` (read-only, evaluated) |
| table cells | same as cell `cellType` |

```ts
interface ImageValue {
  url: string;
  caption?: string;
}
```

---

## 4. Import / export formats

All exports include `version: 1` (`IO_VERSION`).

### 4.1 Document export (`kind: 'document'`)

Full save: schemas + blocks + all field values.

```ts
interface DocExport {
  kind: 'document';
  version: 1 | 2;
  time: number;
  fieldSchemas: Record<string, FieldSchema>;
  blocks: EditorBlock[];
  pageSetup?: TemplatePageSetup;
}
```

**Function:** `buildDocExport(doc: EditorDocument): DocExport`

### 4.2 Template export (`kind: 'template'`)

Layout and schemas; values reset to schema defaults.

```ts
interface TemplateExport {
  kind: 'template';
  version: 1;
  time: number;
  fieldSchemas: Record<string, FieldSchema>;
  blocks: EditorBlock[];
  pageSetup?: TemplatePageSetup;
  /** Optional payload→template mapping (see §18). */
  fieldMapping?: FieldMappingSpec;
}
```

**Function:** `buildTemplateExport(doc: EditorDocument): TemplateExport`

### 4.3 Fields export (`kind: 'field'`)

Values only — for filling an existing template. **Version 2** uses nested sections keyed by section label and field name.

```ts
interface FieldsExport {
  kind: 'field';
  version: 1 | 2;
  time: number;
  /** v1 — flat field-id map (legacy import) */
  values?: Record<string, FieldValue | TableDocumentRows>;
  /** v2 — section → field name → value */
  sections?: Record<string, Record<string, FieldValue | TableDocumentRows>>;
}
```

**Function:** `buildFieldsExport(doc: EditorDocument, options?: FieldsExportOptions): FieldsExport`

Deprecated alias: `buildDocumentExport`, type `DocumentExport`. Legacy import accepts values-only JSON with `kind: 'document'` (no `blocks`).

Computed fields are included (evaluated). Export uses `version: 2` and `sections`.

**v2 shape:**

```json
{
  "kind": "field",
  "version": 2,
  "sections": {
    "Examination": {
      "Orbit OD": "norm",
      "Orbit OS": "norm",
      "Visual acuity": [
        { "vis": "0.8", "sph": "-1.0" },
        { "vis": "0.9" }
      ]
    },
    "_root": {
      "Visual acuity": [{ "vis": "0.8" }]
    }
  }
}
```

- **Section key** = `documentSection.data.name` (falls back to `label`, e.g. `"Examination"`) or `"_root"` for standalone blocks (`visionTable`, root-level `templateBlock`)
- **Field key** = `schema.name` (Field Name), not internal field ID
- **Tables** = row array (`[{ colKey: value }, …]`); empty cells omitted on export
- **v1 import** — flat `values` map still accepted (`normalizeDocumentValues` / `expandTableArraysInValues`)

Adapter helpers: `buildSectionedDocumentFromValues`, `expandSectionedDocument`, `collapseTablesInValues`, `expandTableArraysInValues` (see §4.6).

### 4.4 Import

| Function | Input | Output / behavior |
|----------|-------|-------------------|
| `normalizeImportedDoc(data)` | document or template JSON | `EditorDocument` |
| `applyDocumentValues(blocks, values, fieldSchemas)` | blocks + field values | `{ blocks, fieldSchemas, applied, skipped }` |
| `docEngine.load(data)` | document \| template \| field values | Re-inits editor |

**`docEngine.load` rules:**
- `kind: 'document'` (with `blocks`), `kind: 'template'`, or raw `{ blocks, fieldSchemas }` → full replace
- `kind: 'field'`, or legacy values-only `kind: 'document'` (no `blocks`) → merge via `normalizeDocumentValues` then `applyDocumentValues`; accepts v2 `sections` or v1 flat `values`

### 4.5 Validation

```ts
interface ValidationResult {
  valid: boolean;
  missing: Array<{ fieldId: string; label: string }>;
}
```

**Function:** `validateRequiredFields(doc: EditorDocument): ValidationResult`

Required fields (`schema.required === true`) must be non-empty. Computed required fields must evaluate without error.

### 4.6 Value helpers

| Function | Description |
|----------|-------------|
| `collectAllValues(blocks)` | Flat map `fieldId → value` from all blocks |
| `collectFieldIdsInBlocks(blocks, fieldSchemas)` | Set of field IDs referenced in layout |
| `enrichComputedValues(values, fieldSchemas, blocks)` | Adds computed field values in-place |
| `collapseTablesInValues(values, fieldSchemas, blocks)` | Document export: flat cell keys → table row arrays |
| `expandTableArraysInValues(values, fieldSchemas)` | Document import: table row arrays → flat cell keys |
| `tableRowsToFlatValues(tableId, rows, schema)` | Convert external row array to flat cell map |
| `flatValuesToTableRows(tableId, flat, schema, rows?)` | Convert flat cell map to external row array |
| `buildSectionedDocumentFromValues(blocks, schemas, flat)` | Build v2 `sections` map from flat values |
| `expandSectionedDocument(sections, blocks, schemas)` | v2 sections → flat field-id map for import |
| `normalizeDocumentValues(data, blocks, schemas)` | Accept v1 `values` or v2 `sections` |
| `resolveSectionName(data)` | Section name for export/IDs (`name ?? label`) |
| `deriveFieldId(sectionName, fieldName)` | Auto-generate internal field ID |
| `migrateFieldIds(blocks, fieldSchemas)` | Re-derive IDs from names + section placement |

---

## 5. Field schemas (`FieldSchema`)

Schemas live in `fieldSchemas[fieldId]` and drive picker UI, defaults, and validation.

**Naming:**
- **`name`** — Field Name (design-editable; document export key; unique per section)
- **`label`** — short display in the document UI (e.g. `OD`, `OS`)
- **Field ID** — registry key, auto-generated: `{sectionSlug}_{fieldNameSlug}` (table cells: `{tableId}_{rowKey}_{colKey}`)

Standalone blocks export under section key `_root` (`ROOT_SECTION_KEY`).

### 5.1 `FieldType`

```ts
type FieldType =
  | 'text'
  | 'integer'
  | 'date'      // requires @docengine/field-date plugin
  | 'logical'
  | 'choice'
  | 'list'
  | 'tree'
  | 'image'
  | 'signature'
  | 'barcode'
  | 'table'
  | 'pivotTable'
  | 'child'
  | 'computed';
```

`getFieldTypes()` — live palette list from the field-handler registry (built-in order: text, integer, computed, logical, image, signature, barcode, list, choice, tree, table, pivotTable, child). Host plugins such as `@docengine/field-date` appear after they call `registerField`.

`FIELD_TYPES` — snapshot of built-ins at module load; prefer `getFieldTypes()` when host plugins may be registered.

### 5.2 Common properties

```ts
interface FieldSchemaBase {
  type: FieldType;
  name: string;         // Field Name — export key, drives field ID
  label: string;        // short UI label in document
  required?: boolean;   // default false
}
```

### 5.3 Per-type schemas

#### `text`

```ts
interface TextFieldSchema extends FieldSchemaBase {
  type: 'text';
  defaultText?: string;
}
```

#### `integer` (UI label: **Number**)

Palette and type dropdown show **Number**. Schema `type` remains `'integer'` for compatibility with existing templates.

```ts
interface IntegerFieldSchema extends FieldSchemaBase {
  type: 'integer';
  min?: number;         // default 0
  max?: number;         // default 999
  defaultValue?: string | number | '';
  suffix?: string;      // unit text for plain/number display (e.g. mmHg); not stored in field value
  displayFormat?: 'plain' | 'number' | 'currency'; // default 'plain'
  currencyCode?: string; // ISO 4217 when displayFormat is 'currency'; default 'EUR'
  fractionDigits?: number; // optional; for number/currency display
}
```

Stored values remain a plain number/string. `displayFormat` / `currencyCode` / `fractionDigits` / `suffix` control how the value is shown in the editor, preview, and PDF (via `formatNumericDisplay`).

Mapping may also append a currency `#suffix` (see §18.4) when formatting at map time into a text target.

#### `date`

Provided by **`@docengine/field-date`** (not registered by core). Schema shape when the plugin is loaded:

```ts
interface DateFieldSchema extends FieldSchemaBase {
  type: 'date';
  defaultMode?: 'today' | 'fixed';  // default 'today'
  defaultDate?: string;             // ISO date when defaultMode is 'fixed'
  dateFormat?: 'iso' | 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'd mmm yyyy' | 'custom'; // display; default 'dd/mm/yyyy'
  customDateFormat?: string;        // pattern when dateFormat is 'custom' (YYYY YY MMMM MMM MM M DD D)
}
```

Stored values remain ISO `YYYY-MM-DD`. `dateFormat` / `customDateFormat` control how the value is shown in the editor, preview, and PDF.

When filling from a payload, mapping source paths may also append a `#dateFormat` suffix (see §18.3) to format the resolved value at map time (independent of the field’s display format).

#### `choice`

```ts
interface ChoiceFieldSchema extends FieldSchemaBase {
  type: 'choice';
  multi?: false;
  items?: ListItem[];
  commonListId?: string;
  withCode?: boolean;
  defaultValue?: string;
}
```

#### `list`

```ts
interface ListFieldSchema extends FieldSchemaBase {
  type: 'list';
  multi?: true;
  items?: ListItem[];
  commonListId?: string;
  withCode?: boolean;
  itemLayout?: 'inline' | 'lines' | 'bullet' | 'numeric' | 'custom';
  itemPrefix?: string;   // used when itemLayout is 'custom'
  defaultValue?: string[];
}
```

#### `tree`

```ts
interface TreeFieldSchema extends FieldSchemaBase {
  type: 'tree';
  tree?: TreeNode[];
  commonTreeId?: string;
  defaultValue?: string[];
}
```

#### `image`

```ts
interface ImageFieldSchema extends FieldSchemaBase {
  type: 'image';
  maxWidth?: number;    // default 320 (px)
  altText?: string;
}
```

#### `logical`

Boolean Yes/No field. Stored as `true`, `false`, or empty (`null` in templates).

```ts
interface LogicalFieldSchema extends FieldSchemaBase {
  type: 'logical';
  defaultValue?: boolean | null;
}
```

Fill mode uses **inline click-to-cycle** (empty → Yes, then Yes ↔ No). No modal. Export/PDF display: `Yes` / `No`.

#### `signature`

HTML5 canvas capture (mouse/touch). On save, the value is a **PNG data URL** string:

```json
"Patient Signature": "data:image/png;base64,iVBORw0KGgo..."
```

```ts
interface SignatureFieldSchema extends FieldSchemaBase {
  type: 'signature';
  maxWidth?: number;    // default 320 (px) in preview/PDF
}
```

> **Legal scope:** Display-only signature pad for internal acknowledgment and validation. **Not** a cryptographically signed or legally binding electronic signature (ESIGN, eIDAS, DocuSign, etc.). Integrators requiring compliant e-signatures must use a certified provider separately.

Preview and PDF render the signature like an image token (`field-token--image`).

#### `barcode`

Built-in inline field. Value is the **string to encode**; the token renders a generated barcode/QR image (`field-token--image` + `field-token--barcode`) via `bwip-js`.

```ts
type BarcodeSymbology = 'qr' | 'code128' | 'ean13' | 'code39';

interface BarcodeFieldSchema extends FieldSchemaBase {
  type: 'barcode';
  symbology?: BarcodeSymbology; // default 'code128'
  maxWidth?: number;            // default 180
  height?: number;              // 1D bar height; ignored for QR
  displayValue?: boolean;       // human-readable text under 1D bars
  quietZone?: boolean;
}
```

Fill mode reuses the text picker. Mapping is a scalar `$payload…` path (same as text). Invalid codes (e.g. bad EAN-13 checksum) show the raw value plus an error hint — they do not throw.

#### `table`

```ts
interface TableFieldSchema extends FieldSchemaBase {
  type: 'table';
  columns: Array<{ key: string; label: string; name?: string; width?: string }>;
  rows?: Array<{ key: string; label: string }>;  // optional fixed rows for catalog tables (e.g. vision table OD/OS)
  cellType?: 'choice' | 'list' | 'text' | 'integer';
  cellItems?: ListItem[];
  cellCommonListId?: string;
}
```

Table column properties:

- **`label`** — header text shown in the table UI (Columns input in design mode)
- **`name`** — logical column field name (Column field Names input); persisted; defaults to `label`
- **`key`** — auto-generated via `labelToFieldKey(name)`; used in cell field IDs and document export row keys; not user-editable

Cell field IDs: `cellFieldId(tableId, rowKey, colKey)` → `{tableId}_{rowKey}_{colKey}`

#### `pivotTable`

Auto-pivot / cross-tab field (`insertion: 'table'`). At mapping time, DocEngine reads a **source array**, groups by schema row/column properties, aggregates the value property, and stores a structured matrix.

```ts
type PivotAggregation = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'first';

interface PivotTableFieldSchema extends FieldSchemaBase {
  type: 'pivotTable';
  rowProperty?: string;
  columnProperty?: string;
  valueProperty?: string;
  aggregation?: PivotAggregation;
  showRowTotals?: boolean;
  showColumnTotals?: boolean;
  showGrandTotal?: boolean;
  emptyCell?: string;
  sortRows?: 'asc' | 'desc' | 'none';
  sortColumns?: 'asc' | 'desc' | 'none';
}

interface PivotTableValue {
  columns: Array<{ key: string; label: string }>;
  rows: Array<{
    key: string;
    label: string;
    cells: Record<string, number | string | null>;
    rowTotal?: number | string | null;
  }>;
  columnTotals?: Record<string, number | string | null>;
  grandTotal?: number | string | null;
}
```

Mapping rule (one per pivot field — no `columnKey`):

```json
{ "section": "Main", "field": "salesPivot", "sourceArrayPath": "$payload.OrderItems" }
```

Rendered as a read-only `table.vision-table.pivot-table` inside `.document-table--pivot` (PDF uses the existing vision-table converter).

#### `computed`

```ts
interface ComputedFieldSchema extends FieldSchemaBase {
  type: 'computed';
  formula: string;   // see §5.5 (language + registerFormulaFunction)
  suffix?: string;
  displayFormat?: 'plain' | 'number' | 'currency'; // default 'plain'
  currencyCode?: string; // ISO 4217 when displayFormat is 'currency'; default 'EUR'
  fractionDigits?: number; // optional; for number/currency display
}
```

Computed results remain unformatted internally. `displayFormat` / `currencyCode` / `fractionDigits` / `suffix` control how the value is shown in the editor, preview, and PDF (via `formatNumericDisplay`) — same as Number fields.
### 5.4 Shared catalog types

```ts
interface ListItem {
  id: string;
  label: string;
  code?: string;     // when withCode is true (e.g. ICD-10)
}

interface TreeNode {
  id?: string;
  label: string;
  children?: TreeNode[];
}
```

### 5.5 Computed formula language

Owned by `@docengine/engine` and re-exported from `@docengine/editor` / `@docengine/editor/node`. Preview, PDF, n8n, and `document-io` all call the same evaluator.

- **Scalar references:** `{Section.FieldName}` — uses section name and field `name` (same keys as document export)
- **Table column references:** `{Section.TableName.ColumnName}` — all rows in that column; bare reference joins non-empty values with `; `
- **Legacy references:** `{fieldId}` — internal field ID (still supported)
- **Quoted segments:** `{Section."Name.With.Dots"}` when a name contains `.`
- **Operators:** `+`, `-`, `*`, `/` (numeric `+` when both operands are numeric; otherwise string concatenation for `+`)
- **Cycle detection:** circular references are blocked on save and shown as errors at runtime
- **Unknown function / syntax / type errors:** evaluation returns `{ value: '—', error: string }` (display shows an em dash)

Templates store **only** the formula string on `ComputedFieldSchema.formula`. Function implementations are never serialized. Hosts register code via the function registry (§5.5.4, §14.3).

#### 5.5.1 Built-in functions

| Name | Kind | Arity | Behavior |
|------|------|-------|----------|
| `concat(a, b, …)` | scalar | any | Join arguments as strings (`null`/`undefined` → `''`) |
| `age(date)` | scalar | 1 | Whole years from an ISO date (`YYYY-MM-DD`) to today; empty input → `''`; invalid date errors |
| `sum(ref)` | aggregate | one `{Field}` | Sum of numeric non-empty values; no numerics → `''` |
| `avg(ref)` | aggregate | one `{Field}` | Average of numeric non-empty values; no numerics → `''` |
| `min(ref)` | aggregate | one `{Field}` | Minimum numeric value; no numerics → `''` |
| `max(ref)` | aggregate | one `{Field}` | Maximum numeric value; no numerics → `''` |
| `count(ref)` | aggregate | one `{Field}` | Count of non-empty values |

Aggregates take **one field or column reference**, not a comma-separated expression list: `sum({Examination.Labs.Value})`.

Numeric results are formatted with at most 3 decimal places. Integers stay unpadded.

#### 5.5.2 Evaluation APIs

```ts
evaluateFormula(formula, values, fieldSchemas, options?: {
  evaluating?: Iterable<string>;
  selfId?: string;
  blocks?: EditorBlock[];           // required for {Section.Field} / column paths
  formulaFunctions?: FormulaFunctionDef[];  // per-call overlay, see §5.5.4
}): { value: string; error: string | null }

evaluateComputedField(fieldId, values, fieldSchemas, options?: {
  blocks?: EditorBlock[];
  formulaFunctions?: FormulaFunctionDef[];
}): { value: string; error: string | null }

extractFormulaDependencies(formula): string[]
extractFormulaDependencyFieldIds(formula, blocks, fieldSchemas): string[]
detectCircularDependency(fieldId, formula, fieldSchemas, blocks?): boolean
```

Nested computed fields (a formula that references another computed field) reuse the same `formulaFunctions` overlay and process registry.

Exported from `@docengine/engine`. `@docengine/editor` and `@docengine/editor/node` re-export `evaluateComputedField` plus the registry helpers (`registerFormulaFunction`, `unregisterFormulaFunction`, `listFormulaFunctions`, …). `evaluateFormula` is the engine primitive; editor hosts typically call `evaluateComputedField`.

#### 5.5.3 `FormulaFunctionDef`

```ts
type FormulaFunctionKind = 'scalar' | 'aggregate';
type FormulaFunctionArity = number | { min?: number; max?: number };

interface FormulaFunctionDef {
  /** Identifier in formulas. Must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`. */
  name: string;
  /**
   * `aggregate` — one `{Field}` / column reference (like `sum`).
   * `scalar` (default) — comma-separated expressions (like `concat` / `age`).
   */
  kind?: FormulaFunctionKind;
  /**
   * Scalar argument count. Omitted = any count.
   * Not applied to the resolved value array of aggregates (aggregates always take one field ref).
   */
  arity?: FormulaFunctionArity;
  /**
   * Scalar: evaluated argument values.
   * Aggregate: resolved cell/field values from the referenced column or field.
   */
  impl: (args: unknown[]) => unknown;
  /** Formula-picker button label. Defaults to `name`. */
  label?: string;
  /** Tooltip on the picker wrap button. */
  description?: string;
  /** When `false`, omit from the formula picker wrap buttons. Default `true`. */
  picker?: boolean;
}
```

`registerFormulaFunction` throws if `name` is invalid or `impl` is not a function.

Scalar arity errors (wrong argument count) surface as formula `error` strings, e.g. `round() expects 1 argument`.

#### 5.5.4 Function registry

Process-wide table in `@docengine/engine`. Built-ins are always present. Plugin/host entries overlay built-ins by **name** and do not delete them.

```ts
registerFormulaFunction(def: FormulaFunctionDef): FormulaFunctionDef
unregisterFormulaFunction(name: string): boolean  // removes host override only; built-in returns
resetFormulaFunctions(): void                     // drop all host overrides (tests / teardown)
getFormulaFunction(name, overlay?): FormulaFunctionDef | undefined
listFormulaFunctions(overlay?): FormulaFunctionDef[]
listFormulaPickerFunctions(overlay?): FormulaFunctionDef[]  // `picker !== false`
```

**Lookup order** for a call `fn(...)`:

1. Per-call `options.formulaFunctions` overlay (last matching name wins)
2. Host/plugin map from `registerFormulaFunction`
3. Built-in table

`listFormulaFunctions` merges in that same order, then sorts **aggregates first**, then scalars, each group A–Z by `name`.

`createEditor({ formulaFunctions })` calls `registerFormulaFunction` for each def (same process registry — not a second evaluator). See §14.3.

The registry is **process-wide**. Two editors with different function sets in one JS process will share (and overwrite) names. Typical hosts (one Salesforce LWC, one n8n worker) register once at startup.

#### 5.5.5 Designer formula picker

The computed-field properties panel wrap buttons (`Wrap selection:`) come from `listFormulaPickerFunctions()`, including built-ins (`sum`, `concat`, `age`, …) and registered plugins. Pass `formulaFunctions` into `renderFormulaFieldPicker` to preview an overlay without registering globally. `picker: false` hides a function from the wrap row without removing it from evaluation.


### 5.6 Schema utilities

| Function | Description |
|----------|-------------|
| `createDefaultSchema(type, label?)` | New schema for a type |
| `createDefaultBlockData(fieldType)` | New `templateBlock` data + generated `fieldId` |
| `convertSchemaType(schema, newType, catalogProvider?)` | Type conversion preserving data where possible |
| `applyFieldIdChange(oldId, newId, schema, fieldSchemas, blocks)` | Rename ID across schemas, segments, formulas, cells |
| `ensureCellSchemas(tableSchema, tableId, fieldSchemas)` | Generate per-cell schemas for schema seed rows |
| `ensureCellSchemasForRows(tableSchema, tableId, fieldSchemas, rows)` | Generate per-cell schemas for instance rows |
| `generateTableRowKey(existingRows?)` | New stable row key |
| `resolveTableInstanceRows(segmentRows, tableSchema)` | Instance rows, fixed `schema.rows`, or one default inline row |
| `labelToFieldKey(label, usedKeys?)` | Slugify column name to valid field key |
| `buildTableColumnsFromLabels(labels, widths?, previousColumns?, columnNames?)` | Build column defs; keys slugified from column names |
| `syncTableColumnKeyChanges(tableId, oldColumns, newColumns, fieldSchemas, blocks)` | Rename cell schemas/values when column keys change |
| `syncBlocksAfterSchemaChange(blocks, fieldId, newSchema)` | Reset block values after type change |
| `resolveSchemaDefaultValue(schema, { forTemplate? })` | Default value for fill vs template export |
| `generateFieldId(prefix?)` | Unique `field_*` id |
| `isValidFieldId(id)` | `/^[a-zA-Z_][a-zA-Z0-9_]*$/` |
| `cellFieldId(tableId, rowKey, colKey)` | Cell schema key |
| `isSchemaRequired(schema)` | `!!schema.required` |

---

## 6. Catalog provider

Schemas may reference shared catalogs instead of inline `items` / `tree`:

```ts
interface CatalogsInput {
  lists?: Record<string, CatalogListEntry>;
  trees?: Record<string, CatalogTreeEntry>;
}

interface CatalogListEntry {
  id?: string;
  label?: string;
  items: ListItem[];
  withCode?: boolean;
}

interface CatalogTreeEntry {
  id?: string;
  label?: string;
  tree: TreeNode[];
}
```

**Factory:** `createCatalogProvider(catalogs: CatalogsInput): CatalogProvider`

### 6.1 `CatalogProvider` interface

```ts
interface CatalogProvider {
  getList(id: string): CatalogListEntry | null;
  getTree(id: string): CatalogTreeEntry | null;
  listIds(): { lists: string[]; trees: string[] };
  listCommonValueLists(): Array<{ id: string; label: string; itemCount: number; withCode: boolean }>;
  listCommonValueTrees(): Array<{ id: string; label: string; nodeCount: number; rootLabels: string[] }>;
  resolveSchemaItems(schema: FieldSchema): ListItem[];
  resolveSchemaWithCode(schema: FieldSchema): boolean;
  resolveSchemaTree(schema: FieldSchema): TreeNode[];
}
```

Schema fields `commonListId` and `commonTreeId` must match keys in `catalogs.lists` / `catalogs.trees`.

---

## 7. `SchemaRegistry`

Per-editor instance (not a global singleton). Created internally by `createEditor`; also usable standalone.

```ts
class SchemaRegistry {
  constructor(catalogProvider?: CatalogProvider);

  setFieldSchemas(schemas: Record<string, FieldSchema>): void;
  getFieldSchemas(): Record<string, FieldSchema>;
  updateFieldSchema(fieldId: string, schema: FieldSchema): void;
  removeFieldSchema(fieldId: string): void;

  /** Resolved picker config for a field (label, items, min/max, etc.). */
  getFieldDef(fieldId: string): FieldPickerConfig | null;
  schemaToPickerConfig(schema: FieldSchema): FieldPickerConfig | null;

  readonly catalogs: CatalogProvider;
}
```

### 7.1 Tool config registry access

Editor.js clones tool config, so **do not pass `SchemaRegistry` in config directly**. Tools receive:

```ts
interface EditorToolConfig {
  editorHolder: HTMLElement;
  getRegistry: () => SchemaRegistry;
  designMode: boolean;
  onEditSchema: (fieldId: string) => void;
  onDeleteSchema: (fieldId: string) => void;
  // + PickerCallbacks spread
}
```

**Helpers:**
- `getRegistryFromConfig(config)` — from tool config
- `getRegistryFromNode(domNode)` — from `[data-doc-editor]` holder

---

## 8. Picker callbacks (`PickerCallbacks`)

Override via `createEditor({ pickers: { ... } })`. Each returns a `Promise` resolved on OK, rejected on cancel.

Simple form pickers (text, integer, date, and field plugins) should use `createFieldFormModal()` so they share position, drag, Esc, and Ctrl+Enter. Tree/list keep their own picker shells but use the same `FIELD_PICKER_POSITION_COOKIE`.

```ts
interface PickerCallbacks {
  openListPicker(opts: ListPickerOptions): Promise<string | string[]>;
  openTreePicker(opts: TreePickerOptions): Promise<string[]>;
  openTextPicker(opts: TextPickerOptions): Promise<string>;
  openIntegerPicker(opts: IntegerPickerOptions): Promise<string>;
  openImagePicker(opts: ImagePickerOptions): Promise<ImageValue>;
  openDatePicker(opts: DatePickerOptions): Promise<string>;
}
```

### 8.1 Picker option shapes

```ts
interface ListPickerOptions {
  title: string;
  items: ListItem[];
  selected: string[];
  withCode?: boolean;
  multi: boolean;
}

interface TreePickerOptions {
  title: string;
  tree: TreeNode[];
  selected: string[];
}

interface TextPickerOptions {
  title: string;
  value: string;
  placeholder?: string;
}

interface IntegerPickerOptions {
  title: string;
  value: string;
  min: number;
  max: number;
}

interface ImagePickerOptions {
  title: string;
  value: ImageValue;
}

interface DatePickerOptions {
  title: string;
  value: string;
}
```

---

## 9. Image upload

```ts
interface ImageUploadConfig {
  uploadUrl?: string;   // base URL; endpoints: /uploadFile, /fetchUrl
  stub?: boolean;       // default true when uploadUrl is empty
}
```

**Function:** `configureImageUpload(config: ImageUploadConfig): void`

When `stub` is true (default in Salesforce and demos without `VITE_UPLOAD_BASE_URL`), **Upload file** embeds the image as a `data:` URL in the field value so fill HTML preview, save/reload, and PDF can still render it. Ephemeral `blob:` URLs are not used for the stored value (they break outside the live editor). Prefer a real `uploadUrl` for large images so document JSON stays small.

**Upload API response** (server):

```json
{ "success": 1, "file": { "url": "https://..." } }
```

**Helpers:** `uploadByFile(file)`, `uploadByUrl(url)`, `fileToDataUrl(file)`, `normalizeImageValue(value)`, `createEmptyImageValue()`, `isImageValueEmpty(value)`

---

## 10. Design mode

| Function | Description |
|----------|-------------|
| `applyDesignMode(enabled: boolean)` | Toggles `body.design-mode` CSS class |
| `isDesignMode()` | Reads class from `document.body` |

When design mode is on:
- Field palette visible (`body.design-mode .field-palette`)
- Field tokens editable (schema editor, Delete/Backspace to remove, clipboard)
- Table cell / column fields are not removable with Delete/Backspace or Cut (edit the table schema instead)
- Selected tables, column blocks, and sections can be removed with Delete/Backspace (same as field tokens; ignored while typing in inputs)
- `templateBlock` shows schema toolbar
- Document sections show **"+ Field"** and **"+ Columns"** bars
- Palette **Table** inserts an inline table at the text caret inside the focused document section (not as a bottom block)
- Inline tables can be repositioned in design mode by dragging the grip handle on the table toolbar (grip shown on block hover), including across sections
- Inline tables support **+ Row** at fill time; **×** removes a row (minimum one row). Column widths are set in the table schema editor (comma-separated, aligned with columns).
- Column blocks can be repositioned in design mode by dragging the grip handle on the columns toolbar (grip shown on block hover), including across sections
- Inline field tokens can be repositioned in design mode by dragging the grip handle on each field (prose and columns; table cell fields excluded), including across sections. Grips are hidden until hover over the field, while selected, or while dragging
- Cross-section moves re-derive owned field IDs for the target section and update computed-formula paths accordingly
- Column blocks show a design toolbar (label + remove); each column is an independent editable region for text and inline fields
- Column widths are edited in the properties panel when the columns toolbar is selected (presets or custom CSS grid track sizes)
- Nested columns are supported inside either column
- Field clipboard (copy/cut/paste) works inside column editables

### 10.1 Fill mode — keyboard field navigation

When `designMode` is **false** (fill / run mode), end users enter values through field picker dialogs. In addition to click-to-edit, the editor supports keyboard traversal between editable fields.

#### Behavior

| Input | Action |
|-------|--------|
| **Click** field token | Set fill focus + open value picker |
| **Tab** | Move fill focus to the next editable field (document order) |
| **Shift+Tab** | Move fill focus to the previous editable field |
| **Enter** or **Space** (focused field) | Open the same value picker as click |
| Picker **OK** / **Cancel** | Close dialog; restore focus ring + caret on the same field so Tab can continue |

- Traversal includes **inline prose tokens** and **table cell** tokens, across document sections.
- **Skipped:** computed fields, `readonly` fields, and handlers with `editableInFill: false`.
- **Ignored** while a `.modal-overlay:not([hidden])` is open (picker / schema modals keep their own keyboard handling).
- At the first/last editable field, Tab / Shift+Tab **stay** on that field (no wrap).
- With no current focus, Tab focuses the first editable field; Shift+Tab focuses the last.

#### Focus vs design selection

| Class | Mode | Role |
|-------|------|------|
| `.field-token--focused` | Fill | Current keyboard / click target (persistent after picker closes) |
| `.field-token--active` | Fill | Temporary outline while the value picker is open |
| `.field-token--selected` | Design | Schema selection / properties / clipboard — **not** used in fill mode |

#### Related UI

- `ui.showFieldsInFillMode` (default `true`) and `setShowFieldsInFillMode` / `getShowFieldsInFillMode` control empty-field underlines via `.editor-holder--show-fields`. The **focus ring** (`.field-token--focused`) remains visible even when show-fields is off.
- Outline color: `var(--me-field-active-outline)`.

---

## 11. Preview

**Function:** `renderDocumentPreview(doc: EditorDocument): HTMLElement`

Read-only DOM: hides empty fields, labels, and adjacent punctuation. Used internally for PDF generation (html2canvas capture).

- **Section headers:** `documentSection.label` is rendered in preview whenever non-empty, independent of whether any field values remain after filtering. A labeled section with no filled content shows the header only.
- **Columns:** `columns` segments render as a two-column grid in preview and PDF. Empty columns are omitted only when both columns are empty after field filtering.
- **Tables:** `table` segments render as vision tables in preview and PDF. Omitted when no cell has a value after filtering.
- **Collapse:** `collapsed` is not applied in preview; body content is always shown expanded when present.

**Preview modal:** `docEngine.preview()` opens a modal that generates a PDF (via html2canvas + jsPDF) and displays it in an embedded viewer. A **Save PDF** icon button opens the native system save dialog (`showSaveFilePicker` when available).

**PDF export:** `generateDocumentPdfBlob(doc, options?)`, `exportDocumentPdf(doc, options?)`, and `docEngine.exportPdf(options?)` generate PDF from the same filtered preview DOM. Options: `filename` (default `document.pdf`), `format` (`a4` | `letter`), `margin` (mm), optional `title`, `download` (default `true`). Saves use the native system save dialog via `saveBlobToDisk()`.

- Remote images without CORS headers may appear blank in the PDF.

```ts
interface PdfExportOptions {
  filename?: string;
  format?: 'a4' | 'letter';
  margin?: number | [number, number, number, number];
  title?: string;
  download?: boolean;
}
```

---

## 12. Web Component

```ts
function defineDocEditorElement(tagName?: string): void;  // default 'doc-editor'
```

### 12.1 Element API

```html
<doc-editor
  design-mode
  data-document='{"time":...,"fieldSchemas":{},"blocks":[]}'
></doc-editor>
```

```ts
// Before connect (or set via JS):
element.catalogs = CatalogsInput;
element.imageUpload = ImageUploadConfig;

// After connect:
element.editor;  // DocEditorInstance

// Events:
element.addEventListener('change', (e) => { e.detail /* EditorDocument */ });
```

---

## 13. Low-level field DOM API (advanced)

For custom tools or host integration:

| Function | Description |
|----------|-------------|
| `createFieldToken(fieldId, value, placeholder?)` | `<span class="field-token">` |
| `updateFieldToken(token, value, placeholder?)` | Refresh token display |
| `readTokenValue(token)` | Read value from token DOM |
| `openFieldPicker(fieldId, currentValue, callbacks)` | Open appropriate picker |
| `pickFillFieldFromToken(token, callbacks, onUpdate?, options?)` | Fill-mode activate: focus + picker + update (used by click and keyboard) |
| `showNotification(message, { type?, durationMs? })` | Toast (`type`: `'error'` \| `'status'`) |

---

## 14. Custom Editor.js tools

To add a domain-specific block (e.g. legacy vision table):

```ts
createEditor({
  tools: ['documentSection', 'templateBlock', 'visionTable'],
  visionTableTool: MyVisionTableClass,
  visionTableFieldId: 'visionTable',
});
```

Custom tool `config` receives `EditorToolConfig` (§7.1). Use `getRegistryFromConfig(this.config)` for schemas.

Hosts may pass additional Editor.js tools via `tools` / `visionTableTool`. Those are **block tools**, not field-type plugins.

### 14.1 Field handler plugins

Built-in field types are registered through a `FieldHandler` registry. Hosts can add or replace types.

**Simplest path:** call `registerField` before `createEditor`, and reuse an existing picker. Implement designer / display / PDF hooks for a complete plugin.

```js
import { registerField, createEditor, getFieldTypes, createDefaultSchema } from '@docengine/editor';

registerField({
  type: 'score',
  label: 'Score',
  paletteOrder: 55,          // where it appears in the palette
  insertion: 'inline',       // default; use 'table' only for table-like fields
  createSchema(label, name) {
    return { type: 'score', label, name, required: false, max: 10 };
  },
  getEmptyValue: () => '',
  resolveDefaultValue: (schema) => schema.defaultValue ?? '',
  toDisplayConfig: (schema) => ({
    picker: 'integer',       // must match a known picker
    label: schema.label,
  }),
  toPickerConfig: (schema) => ({
    picker: 'integer',
    label: schema.label,
    min: 0,
    max: schema.max ?? 10,
  }),
  renderSchemaFields(host, schema) {
    host.innerHTML = `
      <label class="schema-form__row">
        <span>Max</span>
        <input type="number" data-field="max" value="${schema.max ?? 10}" />
      </label>
    `;
  },
  readSchemaFields(host) {
    return { max: Number(host.querySelector('[data-field="max"]')?.value || 10) };
  },
  formatDisplay(value, { emptyLabel, schema }) {
    if (value == null || value === '') return emptyLabel ?? '';
    return `${value}/${schema.max ?? 10}`;
  },
  isEmpty(value) {
    return value == null || value === '';
  },
  pdfRenderMode: () => 'plain', // or 'html' for HTML→PDF blocks
});

createEditor({ holder: document.getElementById('editor'), /* ... */ });

getFieldTypes();                 // includes Score in the palette
createDefaultSchema('score', 'Score');
```

That gives you: palette entry, default schema, designer extras, empty/default values, display/PDF text, and fill-mode picking via an existing picker modal.

#### Required handler fields

| Property | Role |
|----------|------|
| `type` | Stable id in schemas/documents |
| `label` | Palette label |
| `createSchema` | Default schema shape |
| `getEmptyValue` | Empty runtime value |
| `resolveDefaultValue` | Value from schema defaults |
| `toDisplayConfig` | Preview/token config (no catalogs) |
| `toPickerConfig` | Fill picker config (with catalogs) |

#### Optional handler fields

| Property | Role |
|----------|------|
| `paletteOrder` | Ascending palette sort |
| `insertion` | `'inline' \| 'table' \| 'block'` |
| `editableInFill` | When `false`, fill mode is read-only |
| `blockLabel` | Default template-block label |
| `renderSchemaFields` | Designer type-specific form into the schema-form extra host |
| `readSchemaFields` | Read designer extras; `undefined` values remove schema keys |
| `formatDisplay` | Token / preview / PDF plain text (`null` = core fallback) |
| `isEmpty` | Emptiness for hide-empty preview/PDF (`undefined` = core fallback) |
| `pdfRenderMode` | `'plain'` (default) or `'html'` for HTML→PDF blocks |

#### Picker kinds you can reuse today

`text`, `integer`, `date`, `signature`, `list`, `tree`, `image`, `child`, `computed`

Logical fields use inline click-to-cycle in fill mode (no picker modal). Hosts may still supply `openLogicalPicker` for a custom modal, but the built-in handler cycles inline by default.

Point `picker` at one of these in `toDisplayConfig` / `toPickerConfig`. Fully custom pickers can also be supplied via `createEditor({ pickers: ... })`.

Built-ins `text`, `integer`, and `image` implement designer + display + PDF hooks in `@docengine/editor`. `computed` implements display-format designer hooks (appended after the formula UI) plus `formatDisplay`. Complex types (`list`, `choice`, `tree`, `table`, `child`) still use legacy designer forms in the schema editor.

**`date` is not a core built-in.** Hosts must install and register `@docengine/field-date` (the reference field plugin).

### 14.2 Reference package: `@docengine/field-date`

Canonical example of a field plugin. **Required** for date fields in the palette / fill UI:

```js
import { registerField, createEditor } from '@docengine/editor';
import {
  dateFieldHandler,
  registerDateField,
  createDatePickerCallbacks,
} from '@docengine/field-date';

registerDateField({ registerField }); // or registerField(dateFieldHandler)

createEditor({
  holder: document.getElementById('editor'),
  pickers: createDatePickerCallbacks(), // required for fill-mode date picking
});
```

Without registration, existing documents that already contain `type: 'date'` schemas still load, but Date will not appear in the palette and the date picker will not open until the plugin is registered.

See `packages/field-date/README.md` for the full copy-this-pattern guide.

### 14.3 Formula function plugins

Computed fields stay `type: 'computed'`. Plugins extend the **formula language** (§5.5), not the field-type catalog (§14.1).

Do **not** store JavaScript in template / document JSON. Register implementations in the host process; formulas only contain names like `round({Section.Weight})`.

**Simplest path:** call `registerFormulaFunction` before `createEditor` (and before any headless `evaluateComputedField` / `renderDocument` / PDF). The same registration is required in every process that evaluates the formula (editor, n8n node, pdf-service). Without it, evaluation returns `Unknown function: round`.

```js
import { registerFormulaFunction, createEditor } from '@docengine/editor';
// Headless: import { registerFormulaFunction } from '@docengine/engine';

registerFormulaFunction({
  name: 'round',
  arity: 1,
  label: 'round',
  description: 'Round to nearest integer',
  impl: ([value]) => Math.round(Number(value)),
});

registerFormulaFunction({
  name: 'product',
  kind: 'aggregate',
  description: 'Product of numeric column values',
  impl: (values) => {
    const nums = values.map(Number).filter((n) => !Number.isNaN(n));
    return nums.length ? nums.reduce((a, b) => a * b, 1) : '';
  },
});

createEditor({
  holder: document.getElementById('editor'),
  // Optional shortcut: same registry as registerFormulaFunction (add or override by name)
  formulaFunctions: [
    {
      name: 'ifEmpty',
      arity: 2,
      impl: ([value, fallback]) => (value == null || value === '' ? fallback : value),
    },
  ],
});
```

#### Required vs optional (`FormulaFunctionDef`)

| Property | Role |
|----------|------|
| `name` | Identifier in formulas (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) |
| `impl` | Implementation. Scalar: evaluated args. Aggregate: resolved field/column values |
| `kind` | `'scalar'` (default) or `'aggregate'` (one `{Field}` ref, like `sum`) |
| `arity` | Scalar argument count (`number` or `{ min, max }`). Ignored for aggregate value arrays |
| `label` | Picker wrap-button text (default: `name`) |
| `description` | Picker tooltip |
| `picker` | `false` hides the wrap button; function still evaluates |

#### Host rules

| Without this | Result |
|--------------|--------|
| No `registerFormulaFunction` / `formulaFunctions` for a custom name | Formula error `Unknown function: <name>` in fill, preview, PDF, n8n |
| Register only in the editor | PDF / n8n / `document-io` still fail — they evaluate in `@docengine/engine` |
| `createEditor({ formulaFunctions })` only | Registers onto the **process** registry (same as the plugin API). Not instance-isolated |
| Override a built-in name (`concat`, `sum`, …) | Host `impl` wins until `unregisterFormulaFunction(name)` restores the built-in |

Per-call overlay (does not mutate the process registry):

```js
evaluateFormula('ifEmpty({n}, "n/a")', values, schemas, {
  blocks,
  formulaFunctions: [{ name: 'ifEmpty', arity: 2, impl: ([v, f]) => v || f }],
});
```

A later `registerFormulaFunction` with the same `name` replaces the previous host impl. `resetFormulaFunctions()` clears all host overrides (built-ins remain); intended for tests and host teardown.

---

## 15. CSS contract

Import `@docengine/editor/styles.css`. Key classes host apps should not override aggressively:

| Class | Role |
|-------|------|
| `.field-token` | Inline field chip |
| `.field-token--image` | Image field block layout |
| `.field-token--focused` | Fill-mode current field (keyboard / click target) |
| `.field-token--active` | Fill-mode field while value picker is open |
| `.field-token--selected` | Design-mode selection |
| `.editor-holder--show-fields` | Fill-mode empty-field underline highlights |
| `.document-section__header` | Section title (label input in design mode) |
| `.document-section--border-top` / `--border-bottom` | Optional horizontal rules on the section wrapper |
| `.document-section__body` | Contenteditable prose |
| `.document-align--{left\|center\|right}` | Text/image alignment wrapper |
| `.field-palette` | Add-block bar (visible in design mode) |
| `.editor-drag-handle` | Six-dot grip for drag repositioning (hidden until parent hover, selection, or drag) |
| `.rich-text-toolbar` | Formatting toolbar |
| `.editor-top-chrome` | Wrapper for palette + format toolbar |
| `.editor-top-chrome--sticky` | Sticky palette + format when host has no `chromeParent` |
| `.modal-overlay` | Picker / schema editor modals |
| `.vision-table` | Table block grid |
| `body.design-mode` | Design-mode global state |

Demo app adds its own `demo.css` for `.page-sticky-chrome`, `.page-header`, `.io-group`, `.editor-holder`.

**Sticky chrome:** Palette and format toolbar mount inside `.editor-top-chrome`. Set `ui.chromeParent` to append that wrapper inside a host sticky container (demo: `.page-sticky-chrome` wraps the page header so title, Add blocks, and Format stay visible while scrolling). When `chromeParent` is omitted, `stickyChrome` (default `true`) adds `.editor-top-chrome--sticky` so palette + format pin to the viewport top.

### 15.1 Host theming (PrimeVue 4 / Salesforce Lightning)

Theme files map editor UI to host design tokens via `--me-*` CSS variables:

| Import | Purpose |
|--------|---------|
| `@docengine/editor/styles.css` | Base editor styles (required) |
| `@docengine/editor/themes/bridge.css` | Shared `--me-*` tokens + overrides |
| `@docengine/editor/themes/prime.css` | Maps `--p-*` (PrimeVue 4) → `--me-*` |
| `@docengine/editor/themes/slds.css` | Maps `--lwc-*` / SLDS → `--me-*` |

**PrimeVue 4:** Import bridge + prime after PrimeVue theme setup. Enable `cssLayer` in PrimeVue config so bridge styles can override cleanly. Style page chrome with PrimeVue components; mount editor chrome via `ui.chromeParent` and `ui.documentActionsContainer`.

**Salesforce Lightning:** Bundle `styles.css`, `bridge.css`, and `slds.css` as Static Resources; load with `loadStyle` in LWC. Style page chrome with `lightning-button`, `lightning-card`, etc. Modals use `z-index: 9001` in the SLDS adapter to sit above page chrome.

**Host shell class:** Add `doc-editor-host` to the editor container (`.editor-holder`) for optional surface/border helpers.

**Field document typography** (separate from UI chrome):

```js
fieldValueStyle: {
  default: {
    fontFamily: 'var(--p-font-family)', // PrimeVue
    fontSize: '0.875rem',
    color: 'var(--p-text-color)',
  },
},
```

**Design mode caveat:** `body.design-mode` and `body.design-mode--panels` are toggled on `document.body`. On Lightning pages, prefer `designLayout: 'chrome'` if panel layout causes page-wide side effects.

#### 15.1.1 LWC integration (Lightning page)

**CSS bundle:** Run `npm run build:lib` to produce `dist/editor-lwc.css` (editor + bridge + SLDS). Deploy as a single Static Resource, or load the three files separately.

```js
import { loadStyle, loadScript } from 'lightning/platformResourceLoader';
import editorCss from '@salesforce/resourceUrl/DocEditorLwcCss';
import editorJs from '@salesforce/resourceUrl/DocEditorBundle';

await loadStyle(this, editorCss);
await loadScript(this, editorJs);
```

**Two styling zones:**

| Zone | Styled with | Examples |
|------|-------------|----------|
| Page chrome | SLDS / base Lightning | `lightning-card`, `lightning-button`, `lightning-input` |
| Editor internals | Static Resource CSS | Field tokens, modals, palette, `.btn` inside editor |

**Wrapper classes** (on `lwc:dom="manual"` elements):

| Class | Role |
|-------|------|
| `doc-editor-root doc-editor-host` | Editor mount + SLDS token inheritance |
| `doc-editor-host__sticky` | Sticky container for `ui.chromeParent` |
| `doc-editor-host__surface` | Card-like editor holder |
| `doc-editor-host__actions` | Container for `ui.documentActionsContainer` |

**Token inheritance:** LWC defines `--lwc-*` on the component `:host`, not on `document.documentElement`. Mirror tokens in the LWC component CSS onto `.doc-editor-root` (see `integrations/lwc/docEditor.css`). The SLDS adapter also maps tokens on `.doc-editor-host` and `.doc-editor-root`.

**Recommended `createEditor` options for Lightning:**

```js
this._editor = window.DocEditor.createEditor({
  holder: this._editorRoot,
  data: this._document,
  catalogs: this.catalogs,
  ui: {
    designLayout: 'chrome',
    chromeParent: this._stickyChrome,
    documentActionsContainer: this._docActions,
    stickyChrome: false,
  },
  fieldValueStyle: {
    default: {
      fontFamily: "'Salesforce Sans', Arial, sans-serif",
      fontSize: '0.8125rem',
    },
  },
  resolveListItems: this.resolveRemoteLists.bind(this),
  onChange: (doc) => { this._document = doc; },
});
```

Reference LWC files: `integrations/lwc/` (template, component CSS, init snippet).

---

## 16. Migration notes

On load, `createEditor` automatically:
- Removes deprecated `group` field schemas and blocks
- Removes legacy `image` blocks
- Normalizes `visionTable` cell keys (`od_vis` → `visionTable_od_vis`)

---

## 17. Minimal integration example

```js
import {
  createEditor,
  buildDocExport,
  IO_VERSION,
} from '@docengine/editor';
import '@docengine/editor/styles.css';

const docEngine = createEditor({
  holder: '#editor',
  data: {
    time: Date.now(),
    fieldSchemas: {
      complaints: { type: 'text', label: 'Complaints', defaultText: '' },
    },
    blocks: [{
      type: 'documentSection',
      data: {
        segments: [
          { type: 'text', content: 'Complaints: ' },
          { type: 'field', id: 'complaints', placeholder: 'Complaints' },
        ],
        fieldValues: { complaints: '' },
      },
    }],
  },
  catalogs: { lists: {}, trees: {} },
  onChange: (doc) => console.log('changed', doc),
});

await docEngine.ready;

document.querySelector('#save').onclick = async () => {
  const json = await docEngine.exportDoc();
  console.log(json.kind, json.version); // 'document', 2
};
```

---

## 18. Field mapping

Templates may include a `fieldMapping` spec that maps a source payload (e.g. Salesforce / API JSON) onto template field names. The Mapping UI edits this as a **Mapping result** JSON of `$payload…` paths; applying the mapping produces a `kind: 'field'` export (or merges values into the document).

Core APIs live in `@docengine/engine` and are re-exported from `@docengine/editor`: `applyFieldMapping`, `previewFieldMapping`, `resolveMappedSourceValue`, `parseMappingSourcePath`, `formatDateValue`, etc.

### 18.1 `FieldMappingSpec`

```ts
interface FieldMappingSpec {
  kind: 'fieldMapping';
  version: 1;
  /** Design-time sample payload for preview only. */
  sourceSample?: unknown;
  /** Visual drag-and-drop mapping rules (primary). */
  rules?: FieldMappingRule[];
  /** Optional compiled JS expression (advanced / legacy). */
  expression?: string;
}

interface FieldMappingRule {
  section: string;
  field: string;
  childField?: string;
  /** Dot-separated child field path, e.g. "Address.City". */
  childFieldPath?: string;
  /** Table column key when mapping a table column to a source array. */
  columnKey?: string;
  /** Source path, e.g. `$payload.CreatedDate` or `$payload.CreatedDate#dd/mm/yyyy`. */
  sourcePath: string;
  /** Base source array path for table column mapping. */
  sourceArrayPath?: string;
  fieldId?: string;
  childFieldId?: string;
}
```

### 18.2 Source paths

- Paths usually start with `$payload` (e.g. `$payload.Name`, `$payload.Account.BillingCity`).
- Drag-and-drop writes a plain path with **no** format suffix.
- Path existence checks (`sourcePathExists`, validation warnings) ignore any `#…` suffix (see below).

### 18.3 Date format suffix (`#format`)

A mapping source path may append `#` + a date format so the **resolved value** is formatted when the mapping is applied / previewed:

```json
{
  "kind": "field",
  "version": 2,
  "sections": {
    "Order Details": {
      "Date Added": "$payload.CreatedDate#dd/mm/yyyy",
      "Order ID": "$payload.Name"
    }
  }
}
```

**Resolution**

1. Split on the last `#` → `{ path, dateFormat }` (`parseMappingSourcePath`).
2. Resolve `path` against the payload (`resolveSourcePath`).
3. If `dateFormat` is present, format the value (`formatDateValue` / `resolveMappedSourceValue`).

Accepts ISO dates (`YYYY-MM-DD`) and datetimes (`YYYY-MM-DDTHH:mm:ss…`, e.g. Salesforce `CreatedDate`); the calendar date portion is used.

**Presets** (case-insensitive)

| Suffix | Example output for `2026-07-22` |
|--------|--------------------------------|
| `#dd/mm/yyyy` | `22/07/2026` |
| `#mm/dd/yyyy` | `07/22/2026` |
| `#iso` or `#yyyy-mm-dd` | `2026-07-22` |
| `#d mmm yyyy` | `22 Jul 2026` |

**Custom patterns** — any other suffix is treated as a token pattern (same tokens as Date field `customDateFormat`):

| Token | Meaning |
|-------|---------|
| `YYYY` | 4-digit year |
| `YY` | 2-digit year |
| `MMMM` | Full month name |
| `MMM` | Short month name |
| `MM` | Month, 2 digits |
| `M` | Month, no pad |
| `DD` | Day, 2 digits |
| `D` | Day, no pad |

Examples:

```text
$payload.CreatedDate#DD.MM.YYYY     → 22.07.2026
$payload.CreatedDate#D MMMM YYYY    → 22 July 2026
$payload.CreatedDate#YYYY/MM/DD     → 2026/07/22
```

**Notes**

- The suffix formats the **mapped field value** written into the document / fields export. It is independent of the Date field’s schema `dateFormat` (which still controls how an ISO date token is displayed when no mapping format was applied, or for user-entered dates).
- Prefer storing ISO in Date fields when possible (`#iso`); use `#dd/mm/yyyy` (or custom) when the target is text or you need a display string at map time.
- Table column `sourcePath` values support the same `#format` suffix.
- Do not put `#` inside the path itself; the last `#` always starts the format.

### 18.4 Currency / number format suffix

The same `#suffix` syntax can format numbers at map time (optional override; prefer a Number field’s `displayFormat` when the target is a Number/`integer` field):

```json
"Total": "$payload.Amount#EUR:2"
"Qty": "$payload.Quantity#number"
```

| Suffix | Meaning |
|--------|---------|
| `#currency` | Default currency (`EUR`) via `Intl.NumberFormat` |
| `#EUR` / `#USD` / … | ISO 4217 currency code |
| `#EUR:2` | Currency with fixed fraction digits |
| `#number` | Locale decimal grouping |
| `#number:2` | Decimal with fixed fraction digits |

Examples (locale `en-US`):

```text
$payload.Amount#EUR:2       → €1,234.50
$payload.Amount#USD         → $1,234.50
$payload.Amount#number:2    → 1,234.50
```

**Notes**

- Prefer leaving mapping as `$payload.Amount` and setting **Display format = Currency** on the Number field so fill mode, preview, and PDF stay consistent.
- Use a mapping `#currency` / `#EUR` suffix when writing into a **text** field or when you need a one-off formatted string in the mapped value.

### 18.5 Combining static text and fields

**Mapping result JSON** (rules / Mapping UI) maps each field to a **single `$payload…` path** (optional `#dateFormat` / `#currency` suffix). It does **not** support string concatenation syntax such as:

```json
"Order Number": "prefix " + "$payload.Name"
```

Values must start with `$` to be treated as mappings; anything else is ignored when parsing rules.

To combine static text with one or more payload fields, use `FieldMappingSpec.expression` — a JavaScript expression evaluated with `$payload` (and `$template`, `$get`):

```js
{
  kind: "field",
  version: 2,
  sections: {
    "Order Details": {
      "Order Number": "ORD-" + $payload.Name,
      "Customer": $payload.FirstName + " " + $payload.LastName
    }
  }
}
```

**Alternatives**

- Put the static prefix/suffix as plain text in the template next to the mapped field token.
- Use a **computed** field formula (`concat(…)`, `+`) in the document after mapping raw values.
