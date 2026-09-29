/** @docengine/editor — TypeScript declarations */

export const IO_VERSION = 2;

export type FieldType =
  | 'text'
  | 'integer'
  | 'date'
  | 'logical'
  | 'choice'
  | 'list'
  | 'tree'
  | 'image'
  | 'signature'
  | 'table'
  | 'child'
  | 'computed';

export type TextAlign = 'left' | 'center' | 'right';

export interface ImageValue {
  url: string;
  caption?: string;
}

export type FieldValue =
  | string
  | string[]
  | boolean
  | ImageValue
  | RepeaterValue
  | null
  | undefined;

/** Document export shape for a table field: one object per row keyed by column keys. */
export type TableDocumentRows = Array<Record<string, FieldValue>>;

export interface ListItem {
  id: string;
  label: string;
  code?: string;
}

export interface TreeNode {
  id?: string;
  label: string;
  children?: TreeNode[];
}

export interface FieldDisplayStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textDecoration?: 'none' | 'underline' | 'line-through';
  textAlign?: TextAlign;
}

export interface FieldValueStyleOptions {
  /** Default display styling for field values when a field has no displayStyle override. */
  default?: FieldDisplayStyle;
}

/** Mention-style colors for editable fields in fill mode. */
export interface FieldHighlightStyle {
  /** Text and underline color. */
  color?: string;
  backgroundColor?: string;
  /** Highlight text weight (500 = medium, 600 = semibold). */
  fontWeight?: '500' | '600';
  /** Bottom border width, e.g. `1px` or `2px`. */
  borderWidth?: string;
}

export interface FieldSchemaBase {
  type: FieldType;
  /** Export / logical field name (design-editable). */
  name: string;
  label: string;
  required?: boolean;
  /** When true, the field cannot be edited interactively in fill mode. */
  readonly?: boolean;
  /** Per-field value display styling; overrides createEditor fieldValueStyle.default. */
  displayStyle?: FieldDisplayStyle;
}

export interface TextFieldSchema extends FieldSchemaBase {
  type: 'text';
  defaultText?: string;
  /** WYSIWYG HTML picker and rendered HTML in field value. */
  htmlEditor?: boolean;
}

export interface IntegerFieldSchema extends FieldSchemaBase {
  type: 'integer';
  min?: number;
  max?: number;
  defaultValue?: string | number;
  /** Unit text appended for plain/number display (e.g. mmHg). Not stored in the value. */
  suffix?: string;
  /**
   * How the number is shown in the document / PDF.
   * - `plain` (default): raw value + optional suffix
   * - `number`: locale-grouped number (optional fractionDigits + suffix)
   * - `currency`: locale currency via `currencyCode` (default EUR)
   */
  displayFormat?: 'plain' | 'number' | 'currency';
  /** ISO 4217 code when `displayFormat` is `currency`. Default: `EUR`. */
  currencyCode?: string;
  /** Fraction digits for `number` / `currency` display. */
  fractionDigits?: number;
}

/** Display format for date field values. Stored value remains ISO `YYYY-MM-DD`. */
export type DateDisplayFormat = 'iso' | 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'd mmm yyyy' | 'custom';

export interface DateFieldSchema extends FieldSchemaBase {
  type: 'date';
  defaultMode?: 'today' | 'fixed';
  defaultDate?: string;
  /** How the date is shown in the document / PDF. Default: `dd/mm/yyyy`. */
  dateFormat?: DateDisplayFormat;
  /** Pattern when `dateFormat` is `custom` (tokens: YYYY YY MMMM MMM MM M DD D). */
  customDateFormat?: string;
}

export type ListSource = 'static' | 'remote';

export interface RemoteListCollectionOption {
  id: string;
  label: string;
}

export interface RemoteListCollectionTreeNode {
  id: string;
  label: string;
  kind: 'folder' | 'collection' | 'preset';
  /** Directus collection slug for collection and preset nodes. */
  collectionId?: string;
  /** Directus preset id when kind is preset. */
  presetId?: string;
  children?: RemoteListCollectionTreeNode[];
}

export interface RemoteListCollectionCatalog {
  bookmarks?: RemoteListCollectionOption[];
  tree: RemoteListCollectionTreeNode[];
}

export interface RemoteListLabelFieldOption {
  id: string;
  label: string;
}

export interface ChoiceFieldSchema extends FieldSchemaBase {
  type: 'choice';
  multi?: false;
  items?: ListItem[];
  commonListId?: string;
  /** When `'remote'`, options are fetched via `resolveListItems` at picker open / search. */
  listSource?: ListSource;
  /** Collection key passed to the host `resolveListItems` implementation (e.g. Directus collection). */
  sourceCollection?: string;
  /** Field on `sourceCollection` used as the option label. */
  sourceLabelField?: string;
  /** Directus bookmark preset id (`directus_presets`) applied when querying options. */
  sourcePresetId?: string;
  withCode?: boolean;
  defaultValue?: string;
  /** When true, users can enter free text outside catalog options. */
  allowManualEdit?: boolean;
}

export interface ListFieldSchema extends FieldSchemaBase {
  type: 'list';
  multi?: true;
  items?: ListItem[];
  commonListId?: string;
  listSource?: ListSource;
  sourceCollection?: string;
  sourceLabelField?: string;
  sourcePresetId?: string;
  withCode?: boolean;
  itemLayout?: 'inline' | 'lines' | 'bullet' | 'numeric' | 'custom';
  itemPrefix?: string;
  defaultValue?: string[];
  /** When true, users can enter free text outside catalog options. */
  allowManualEdit?: boolean;
}

export interface TreeFieldSchema extends FieldSchemaBase {
  type: 'tree';
  tree?: TreeNode[];
  commonTreeId?: string;
  defaultValue?: string[];
  /** When true, users can enter free text outside catalog options. */
  allowManualEdit?: boolean;
}

export interface ImageFieldSchema extends FieldSchemaBase {
  type: 'image';
  maxWidth?: number;
  altText?: string;
}

export interface LogicalFieldSchema extends FieldSchemaBase {
  type: 'logical';
  defaultValue?: boolean | null;
}

export interface SignatureFieldSchema extends FieldSchemaBase {
  type: 'signature';
  maxWidth?: number;
}

export interface TableColumnDef {
  key: string;
  label: string;
  /** Logical column field name; defaults to label. Used to derive `key`. */
  name?: string;
  /** CSS width, e.g. `120px`, `25%`, `auto`. */
  width?: string;
}

export interface TableFieldSchema extends FieldSchemaBase {
  type: 'table';
  columns: TableColumnDef[];
  rows?: Array<{ key: string; label: string }>;
  cellType?: 'choice' | 'list' | 'text' | 'integer';
  cellItems?: ListItem[];
  cellCommonListId?: string;
  /** Applied to choice/list table cells when set to `'remote'`. */
  cellListSource?: ListSource;
  cellSourceCollection?: string;
  cellSourceLabelField?: string;
  /** When true, omit the column header row. */
  hideHeader?: boolean;
  /** When true, render the table without cell borders. */
  hideBorders?: boolean;
  /** When true, show a leading column of row labels (e.g. OD / OS). */
  showRowLabels?: boolean;
}

export interface RepeaterInstanceDef {
  key: string;
  label: string;
}

export interface RepeaterEditorTemplate {
  time?: number;
  fieldSchemas: Record<string, FieldSchema>;
  blocks?: EditorBlock[];
}

export interface RepeaterValue extends Record<string, FieldValue> {
  /** @deprecated Legacy multi-instance wrapper — migrated on load. */
  instances?: Record<string, Record<string, FieldValue>>;
}

export interface RepeaterFieldSchema extends FieldSchemaBase {
  type: 'child';
  fieldSchemas: Record<string, FieldSchema>;
  /** @deprecated Legacy nested-editor template wrapper. */
  template?: RepeaterEditorTemplate;
  /** @deprecated Legacy multi-instance definitions. */
  instances?: RepeaterInstanceDef[];
}

export interface ComputedFieldSchema extends FieldSchemaBase {
  type: 'computed';
  formula: string;
  /** Unit text appended for plain/number display (e.g. mmHg). Not stored in the value. */
  suffix?: string;
  /**
   * How the computed result is shown in the document / PDF.
   * Same options as Number (`integer`) fields.
   */
  displayFormat?: 'plain' | 'number' | 'currency';
  /** ISO 4217 code when `displayFormat` is `currency`. Default: `EUR`. */
  currencyCode?: string;
  /** Fraction digits for `number` / `currency` display. */
  fractionDigits?: number;
}

export type FieldSchema =
  | TextFieldSchema
  | IntegerFieldSchema
  | DateFieldSchema
  | LogicalFieldSchema
  | ChoiceFieldSchema
  | ListFieldSchema
  | TreeFieldSchema
  | ImageFieldSchema
  | SignatureFieldSchema
  | TableFieldSchema
  | RepeaterFieldSchema
  | ComputedFieldSchema;

export interface ColumnsSegment {
  type: 'columns';
  /** Stable id for design-mode selection and width editing. */
  id?: string;
  /** CSS grid track sizes for each column (e.g. `1fr`, `50%`, `200px`). Defaults to equal columns. */
  widths?: [string?, string?];
  columns: [Segment[], Segment[]];
}

export interface TableRowInstance {
  key: string;
  label: string;
}

export interface TableSegment {
  type: 'table';
  id: string;
  /** Runtime rows for this table instance (seeded from schema on first use). */
  rows?: TableRowInstance[];
}

export interface RepeaterSegment {
  type: 'child';
  id: string;
}

export type Segment =
  | { type: 'text'; content?: string; html?: string; align?: TextAlign }
  | { type: 'field'; id: string; placeholder?: string; align?: TextAlign }
  | ColumnsSegment
  | TableSegment
  | RepeaterSegment;

export interface TemplatePageSetup {
  format?: 'a4' | 'letter';
  /** Page orientation. Defaults to portrait. */
  orientation?: 'portrait' | 'landscape';
  margin?: number | [number, number, number, number];
  title?: string;
  /** Default font and style for static text in document sections. */
  textStyle?: FieldDisplayStyle;
  /** Default font and style for field values (overrides createEditor fieldValueStyle.default). */
  valueStyle?: FieldDisplayStyle;
  /** Mention-style highlight colors for fields in fill mode. */
  fieldHighlight?: FieldHighlightStyle;
  /** When true (default), Backspace/Delete cannot remove field tokens in fill mode. */
  protectFieldsInFillMode?: boolean;
  header?: {
    height?: number;
    /** @deprecated Static header lines are no longer edited in Page setup. Ignored at render time. */
    lines?: string[];
    /** @deprecated Use repeatable section content for dynamic PDF headers. */
    variables?: Record<string, string>;
    /** Set at PDF render time when the repeatable section drives the page header. */
    fromRepeatableSection?: boolean;
  };
  footer?: {
    height?: number;
    text?: string;
    showPageNumbers?: boolean;
  };
}

export type SectionVisibilityOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'empty'
  | 'notEmpty';

export type SectionVisibilityMode = 'show' | 'hide';

export interface SectionVisibilityRule {
  /** Field whose value controls this section. */
  fieldId?: string;
  /** Show the section when the rule matches, or hide it when the rule matches. */
  mode?: SectionVisibilityMode;
  operator?: SectionVisibilityOperator;
  value?: unknown;
}

export interface DocumentSectionData {
  /** Stable section name for document export keys and field ID prefix. Defaults to `label`. */
  name?: string;
  /** Display header in editor and preview. */
  label?: string;
  collapsed?: boolean;
  /** When true, PDF repeats this section once per instance in document data. */
  repeatable?: boolean;
  /** When true, the section title is omitted from document preview and PDF. */
  hideTitleInPreview?: boolean;
  /** When true, draw a horizontal rule above the section (editor + preview/PDF). */
  borderTop?: boolean;
  /** When true, draw a horizontal rule below the section (editor + preview/PDF). */
  borderBottom?: boolean;
  /** Optional rule that controls whether the section is visible for current field values. */
  visibility?: SectionVisibilityRule | null;
  segments: Segment[];
  fieldValues: Record<string, FieldValue>;
}

export interface TemplateBlockData {
  fieldType: FieldType;
  fieldId: string;
  label: string;
  prefixText?: string;
  value?: FieldValue | RepeaterValue;
  cells?: Record<string, FieldValue>;
}

export interface VisionTableData {
  fieldId: string;
  cells: Record<string, FieldValue>;
}

export interface EditorBlock {
  type: string;
  data: DocumentSectionData | TemplateBlockData | VisionTableData | Record<string, unknown>;
}

export interface EditorDocument {
  time: number;
  fieldSchemas: Record<string, FieldSchema>;
  blocks: EditorBlock[];
  pageSetup?: TemplatePageSetup;
  fieldMapping?: FieldMappingSpec;
  /** Populated during template+document merge for multipage PDF rendering. */
  repeatableSectionInstances?: Record<string, Array<Record<string, FieldValue | TableDocumentRows>>>;
  /** Resolved page plan for repeatable PDF rendering. */
  repeatablePagePlan?: RepeatablePagePlan;
}

export interface DocExport {
  kind: 'document';
  version: 1 | 2;
  time: number;
  fieldSchemas: Record<string, FieldSchema>;
  blocks: EditorBlock[];
  pageSetup?: TemplatePageSetup;
}

export interface TemplateExport {
  kind: 'template';
  version: 1;
  time: number;
  fieldSchemas: Record<string, FieldSchema>;
  blocks: EditorBlock[];
  pageSetup?: TemplatePageSetup;
  fieldMapping?: FieldMappingSpec;
}

export interface FieldMappingSpec {
  kind: 'fieldMapping';
  version: 1;
  /** Design-time sample payload for preview only. */
  sourceSample?: unknown;
  /** Visual drag-and-drop mapping rules (primary). */
  rules?: FieldMappingRule[];
  /** Optional compiled JS expression (advanced / legacy). */
  expression?: string;
}

export interface FieldMappingRule {
  section: string;
  field: string;
  childField?: string;
  /** Dot-separated child field path, e.g. "Address.City". */
  childFieldPath?: string;
  /** Table column key when mapping a table column to a source array. */
  columnKey?: string;
  sourcePath: string;
  /** Base source array path for table column mapping. */
  sourceArrayPath?: string;
  fieldId?: string;
  childFieldId?: string;
}

export interface FieldMappingValidationIssue {
  section: string;
  field: string;
  message: string;
  /** Present when the issue refers to a missing/invalid source path. */
  sourcePath?: string;
}

export interface FieldMappingValidationResult {
  valid: boolean;
  errors: FieldMappingValidationIssue[];
  warnings: FieldMappingValidationIssue[];
}

export interface FieldMappingPreviewResult {
  fieldsExport: FieldsExport;
  validation: FieldMappingValidationResult;
  mappingResult?: FieldsExport | null;
  raw: unknown;
}

export interface TargetSchemaTreeField {
  name: string;
  type: FieldType;
  fieldId: string;
  children?: Array<{ name: string; type: FieldType }>;
}

export interface TargetSchemaTree {
  sections: Array<{
    name: string;
    fields: TargetSchemaTreeField[];
  }>;
}

/** Section field map or array of maps when the section is repeatable. */
export type DocumentSectionValues =
  | Record<string, FieldValue | TableDocumentRows>
  | Array<Record<string, FieldValue | TableDocumentRows>>;

export interface RepeatablePagePlan {
  sectionName: string;
  repeatableBlockIndex: number;
  /** Explicit document instance arrays only (not table row counts). */
  instances: Array<Record<string, FieldValue | TableDocumentRows>>;
  companionBlockIndex: number | null;
  companionTableRows: TableDocumentRows | null;
  companionTableName?: string | null;
  companionTableId?: string | null;
  companionBlockKind?: 'vision' | 'template' | 'section' | null;
}

export interface FieldsExport {
  kind: 'field';
  version: 1 | 2;
  time: number;
  /** v1 flat field-id map */
  values?: Record<string, FieldValue | TableDocumentRows>;
  /** v2 nested section → field name → value (or array for repeatable sections) */
  sections?: Record<string, DocumentSectionValues>;
}

/** @deprecated Renamed to FieldsExport (kind is now `'field'` instead of `'document'`) */
export interface DocumentExport extends Omit<FieldsExport, 'kind'> {
  kind: 'document';
}

export interface ValidationResult {
  valid: boolean;
  missing: Array<{ fieldId: string; label: string }>;
}

export interface CatalogListEntry {
  id?: string;
  label?: string;
  items: ListItem[];
  withCode?: boolean;
}

export interface CatalogTreeEntry {
  id?: string;
  label?: string;
  tree: TreeNode[];
}

export interface CatalogsInput {
  lists?: Record<string, CatalogListEntry>;
  trees?: Record<string, CatalogTreeEntry>;
}

export interface CatalogProvider {
  getList(id: string): CatalogListEntry | null;
  getTree(id: string): CatalogTreeEntry | null;
  listIds(): { lists: string[]; trees: string[] };
  listCommonValueLists(): Array<{ id: string; label: string; itemCount: number; withCode: boolean }>;
  listCommonValueTrees(): Array<{ id: string; label: string; nodeCount: number; rootLabels: string[] }>;
  resolveSchemaItems(schema: FieldSchema): ListItem[];
  resolveSchemaWithCode(schema: FieldSchema): boolean;
  resolveSchemaTree(schema: FieldSchema): TreeNode[];
}

export interface ImageUploadFileResult {
  success: 1;
  file: { url: string; name?: string; stub?: boolean };
}

export interface ExistingImageItem {
  id: string;
  name: string;
  url?: string;
  extension?: string;
}

export interface ImageUploadConfig {
  uploadUrl?: string;
  stub?: boolean;
  /** Host-provided uploader (e.g. Salesforce Apex). When set, skips fetch/stub. */
  uploadByFile?: (file: File) => Promise<ImageUploadFileResult>;
  uploadByUrl?: (url: string) => Promise<ImageUploadFileResult>;
  /** Optional browse list of existing host images (e.g. Salesforce Files on the record). */
  listExistingImages?: () => Promise<ExistingImageItem[]>;
  /** Resolve a selected existing image id to a persistable URL. */
  resolveExistingImage?: (id: string) => Promise<ImageUploadFileResult>;
}

export interface ResolveListItemsContext {
  /** Field Name from schema (`schema.name`, or `schema.label` when name is unset). */
  fieldName: string;
  schema: FieldSchema;
  fieldValues: Record<string, FieldValue>;
  query: string;
  selected: string[];
}

export type ResolveListItemsFn = (ctx: ResolveListItemsContext) => Promise<ListItem[]>;

export interface ListPickerRemoteSearch {
  search(query: string): Promise<ListItem[]>;
}

export interface ListPickerOptions {
  title: string;
  items: ListItem[];
  selected: string[];
  withCode?: boolean;
  multi: boolean;
  /** When set, search input triggers debounced remote lookups instead of filtering local items. */
  remoteSearch?: ListPickerRemoteSearch;
}

export interface TreePickerOptions {
  title: string;
  tree: TreeNode[];
  selected: string[];
}

export interface TextPickerOptions {
  title: string;
  value: string;
  placeholder?: string;
}

export interface HtmlTextPickerOptions extends TextPickerOptions {}

export interface IntegerPickerOptions {
  title: string;
  value: string;
  min: number;
  max: number;
}

export interface ImagePickerOptions {
  title: string;
  value: ImageValue;
}

export interface LogicalPickerOptions {
  title: string;
  value?: boolean | null;
}

export interface SignaturePickerOptions {
  title: string;
  value?: string | ImageValue | null;
}

export interface DatePickerOptions {
  title: string;
  value: string;
  /** Mount overlay under this host (fill editor shell). */
  parent?: HTMLElement | null;
}

export interface PickerCallbacks {
  openListPicker(opts: ListPickerOptions): Promise<string | string[]>;
  openTreePicker(opts: TreePickerOptions): Promise<string[]>;
  openTextPicker(opts: TextPickerOptions): Promise<string>;
  openHtmlTextPicker(opts: HtmlTextPickerOptions): Promise<string>;
  openIntegerPicker(opts: IntegerPickerOptions): Promise<string>;
  openImagePicker(opts: ImagePickerOptions): Promise<ImageValue>;
  openLogicalPicker(opts: LogicalPickerOptions): Promise<boolean | null>;
  openSignaturePicker(opts: SignaturePickerOptions): Promise<string>;
  openDatePicker(opts: DatePickerOptions): Promise<string>;
}

export interface CreateEditorUiOptions {
  palette?: boolean;
  richTextToolbar?: boolean;
  documentActions?: boolean;
  /**
   * Append palette + format toolbar inside this container (e.g. a sticky page header wrapper).
   */
  chromeParent?: HTMLElement | string;
  /** Pin palette + format toolbar while scrolling. Default: true (unless chromeParent is set). */
  stickyChrome?: boolean;
  /**
   * Design mode layout: `chrome` (horizontal palette bar) or `panels` (3-column shell).
   */
  designLayout?: 'chrome' | 'panels';
  /** When true, nested/embedded editors hide repeater and other chrome. */
  embedded?: boolean;
  paletteAfter?: HTMLElement | string;
  paletteParent?: HTMLElement | string;
  toolbarParent?: HTMLElement | string;
  toolbarBefore?: HTMLElement | string;
  /** Append document actions inside this container (e.g. app header toolbar). */
  documentActionsContainer?: HTMLElement | string;
  documentActionsParent?: HTMLElement | string;
  documentActionsAfter?: HTMLElement | string;
  /** Default filename suggested when saving PDF from preview or exportPdf(). */
  pdfFilename?: string;
  /** Optional title prepended in PDF exports from the document actions bar. */
  pdfTitle?: string;
  /**
   * When false, PDF preview downloads the file instead of embedding via blob: iframe.
   * Required under Salesforce LWS (blob: iframe.src is blocked). Default: true.
   */
  embedPdfInIframe?: boolean;
  /**
   * When true (default), fill mode highlights editable fields so users can find them.
   * Ignored in design mode.
   */
  showFieldsInFillMode?: boolean;
  /** Default field highlight colors when page setup has no fieldHighlight. */
  fieldHighlight?: FieldHighlightStyle;
}

export type FormulaFunctionKind = 'scalar' | 'aggregate';

export type FormulaFunctionArity = number | { min?: number; max?: number };

/** Host/plugin function for computed formulas. See `registerFormulaFunction`. */
export interface FormulaFunctionDef {
  name: string;
  kind?: FormulaFunctionKind;
  arity?: FormulaFunctionArity;
  impl: (args: unknown[]) => unknown;
  label?: string;
  description?: string;
  picker?: boolean;
}

export interface CreateEditorOptions {
  holder: HTMLElement | string;
  data?: EditorDocument;
  defaultDocument?: EditorDocument;
  catalogs?: CatalogsInput;
  /**
   * Remote list resolver for fields with `listSource: 'remote'`.
   * Called when the list picker opens and on each debounced search input.
   * Receives `fieldName` (schema Field Name), not the internal field ID.
   */
  resolveListItems?: ResolveListItemsFn;
  /**
   * Optional PDF generator for hosts where client pdfmake is unavailable
   * (e.g. Salesforce Static Resource). Used by preview "View as PDF" / exportPdf.
   */
  generatePdfBlob?: (
    doc: EditorDocument,
    options?: PdfExportOptions,
  ) => Promise<Blob>;
  /**
   * When false, hide "View as PDF" / PDF save in preview.
   * Prefer an explicit host check (e.g. Salesforce DocEngine_PDF Named Credential).
   * When omitted, PDF UI is shown if `generatePdfBlob` is set or client pdfmake is bundled.
   */
  pdfAvailable?: boolean | Promise<boolean> | (() => boolean | Promise<boolean>);
  /**
   * Optional http(s)/relative URL for iframe PDF preview when blob: is blocked (e.g. Salesforce LWS).
   */
  generatePdfPreviewUrl?: (
    doc: EditorDocument,
    options?: PdfExportOptions,
  ) => Promise<string>;
  /** Fired when Document preview modal opens/closes. */
  onPreviewStateChange?: (open: boolean) => void;
  /**
   * Fired when a nested field dialog (list/tree/text/… picker) opens/closes.
   * Hosts such as Salesforce LightningModal should set `disableClose` while true
   * so Escape closes only the nested dialog, not the editor shell.
   */
  onNestedModalStateChange?: (open: boolean) => void;
  /**
   * Fired when a nested field picker applies a result (OK / Clear), not when cancelled.
   * Hosts can use this for unsaved-changes tracking without false positives from open/close.
   */
  onFieldPickerApplied?: () => void;
  /**
   * Host share/email/Slack handler. When set, preview shows a Share button.
   * Receives the current-format artifact from `getPreviewArtifact`.
   */
  onShareDocument?: (artifact: PreviewArtifact) => void | Promise<void>;
  /** Collections offered in the field designer when list source is Remote search. */
  remoteListCollections?: () =>
    | RemoteListCollectionOption[]
    | RemoteListCollectionCatalog
    | Promise<RemoteListCollectionOption[] | RemoteListCollectionCatalog>;
  /** Label fields for a collection, used by the Remote search designer UI. */
  remoteListLabelFields?: (
    collection: string,
  ) => RemoteListLabelFieldOption[] | Promise<RemoteListLabelFieldOption[]>;
  /** Default + per-field value styling (see FieldDisplayStyle on schema). */
  fieldValueStyle?: FieldValueStyleOptions;
  designMode?: boolean;
  /** Read-only field mapping mode: drag source paths onto field tokens. */
  mappingMode?: boolean;
  /** Called when a source path is dropped onto a template field. */
  onMappingRuleChange?: (rule: FieldMappingRule) => void;
  tools?: Array<'documentSection' | 'templateBlock' | 'visionTable'>;
  visionTableTool?: new (args: { data: unknown; config: EditorToolConfig }) => unknown;
  visionTableFieldId?: string;
  imageUpload?: ImageUploadConfig;
  /**
   * Extra computed-formula functions for this process (add or override built-ins).
   * Same as calling `registerFormulaFunction` before createEditor. n8n / PDF hosts
   * that evaluate formulas must register the same functions.
   */
  formulaFunctions?: FormulaFunctionDef[];
  pickers?: Partial<PickerCallbacks>;
  ui?: CreateEditorUiOptions;
  onChange?: (doc: EditorDocument) => void;
  onSchemaChange?: (fieldSchemas: Record<string, FieldSchema>) => void;
  onError?: (error: Error) => void;
}

export interface EditorToolConfig extends PickerCallbacks {
  editorHolder: HTMLElement;
  getRegistry: () => SchemaRegistry;
  resolveListItems?: ResolveListItemsFn;
  fieldValueStyle?: FieldValueStyleOptions;
  designMode: boolean;
  mappingMode?: boolean;
  onMappingRuleChange?: (rule: FieldMappingRule) => void;
  designPropertiesPanel?: boolean;
  onEditSchema: (fieldId: string) => void;
  onDeleteSchema: (fieldId: string) => void;
  onSectionNameChange?: () => void;
}

export interface DocEditorInstance {
  holder: HTMLElement;
  registry: SchemaRegistry;
  palette: { element: HTMLElement };
  richTextToolbar: {
    element: HTMLElement;
    show: (editable: HTMLElement) => void;
    showForField: (options: {
      getResolvedStyle?: () => FieldDisplayStyle;
      getOverrideStyle?: () => FieldDisplayStyle;
      getGlobalDefault?: () => FieldDisplayStyle;
      hint?: string;
      onStyleChange?: (style: FieldDisplayStyle) => void;
      onClearStyle?: () => void;
    }) => void;
    clearActive: () => void;
    clearFieldMode: () => void;
    isFieldModeActive: () => boolean;
  };
  documentActions: {
    element: HTMLElement;
    setBusy(busy: boolean): void;
  };
  readonly ready: Promise<void>;
  getDocument(): Promise<EditorDocument>;
  save(): Promise<EditorDocument>;
  exportDoc(): Promise<DocExport>;
  exportTemplate(): Promise<TemplateExport>;
  exportFields(options?: FieldsExportOptions): Promise<FieldsExport>;
  /** @deprecated Use exportFields() */
  exportDocument(options?: FieldsExportOptions): Promise<FieldsExport>;
  load(
    data: DocExport | TemplateExport | FieldsExport | DocumentExport,
    options?: { omitMappedFields?: boolean },
  ): Promise<void>;
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
  canUndo(): boolean;
  canRedo(): boolean;
  getFieldMapping(): FieldMappingSpec | null;
  setFieldMapping(spec: FieldMappingSpec | null): void;
  previewFieldMapping(payload: unknown): Promise<FieldMappingPreviewResult>;
  applyFieldMapping(payload: unknown): Promise<{
    fieldsExport: FieldsExport;
    validation: FieldMappingValidationResult;
    blocks: EditorBlock[];
    fieldSchemas: Record<string, FieldSchema>;
    applied: number;
    skipped: number;
  }>;
  openFieldMapping(options?: {
    spec?: FieldMappingSpec;
    /** Lazy-load related object / child relationship fields when a source-tree node is expanded. */
    onExpandSourcePath?: (path: string) => Promise<unknown>;
  }): Promise<FieldMappingSpec>;
  setDesignMode(enabled: boolean): Promise<void>;
  getDesignMode(): boolean;
  setShowFieldsInFillMode(enabled: boolean): void;
  getShowFieldsInFillMode(): boolean;
  preview(options?: { hideEmptyValues?: boolean }): Promise<void>;
  isPreviewOpen(): boolean;
  closePreview(): void;
  /** Standalone HTML document string for Simple preview (export/attach). */
  exportPreviewHtml(options?: {
    hideEmptyValues?: boolean;
    title?: string;
  }): Promise<string>;
  /**
   * Build an HTML or PDF artifact for the host to email / Slack / attach.
   * `format: 'current'` follows the open preview view mode (defaults to html).
   */
  getPreviewArtifact(options?: PreviewArtifactOptions): Promise<PreviewArtifact>;
  exportPdf(options?: PdfExportOptions): Promise<void>;
  validate(): Promise<ValidationResult>;
  destroy(): void;
}

export class SchemaRegistry {
  constructor(catalogProvider?: CatalogProvider);
  catalogs: CatalogProvider;
  setFieldSchemas(schemas: Record<string, FieldSchema>): void;
  getFieldSchemas(): Record<string, FieldSchema>;
  updateFieldSchema(fieldId: string, schema: FieldSchema): void;
  removeFieldSchema(fieldId: string): void;
  getFieldDef(fieldId: string): Record<string, unknown> | null;
  schemaToPickerConfig(schema: FieldSchema): Record<string, unknown> | null;
}

export function createEditor(options: CreateEditorOptions): DocEditorInstance;
export function createCatalogProvider(catalogs?: CatalogsInput): CatalogProvider;
export function getRegistryFromConfig(config: EditorToolConfig): SchemaRegistry | null;
export function getRegistryFromNode(node: Node | null): SchemaRegistry | null;

export function buildDocExport(doc: EditorDocument): DocExport;
export function buildTemplateExport(doc: EditorDocument): TemplateExport;
export function buildFieldsExport(
  doc: EditorDocument,
  options?: FieldsExportOptions,
): FieldsExport;
/** @deprecated Use buildFieldsExport */
export function buildDocumentExport(
  doc: EditorDocument,
  options?: FieldsExportOptions,
): FieldsExport;
export function normalizeImportedDoc(data: unknown): EditorDocument;
export function isFieldsExport(data: unknown): data is FieldsExport;
export function isDocExport(data: unknown): data is DocExport;
export function validateRequiredFields(doc: EditorDocument): ValidationResult;

export const FIELD_MAPPING_KIND: 'fieldMapping';
export const FIELD_MAPPING_VERSION: 1;
export function isFieldMappingSpec(data: unknown): data is FieldMappingSpec;
export function getPayloadByPath(path: string, data: unknown): unknown;
export function payloadPathExists(path: string, data: unknown): boolean;
export function sourcePathExists(sourcePath: string, payload: unknown): boolean;
export function unwrapMappingExpression(expression: string): string;
export function evaluateFieldMappingExpression(
  expression: string,
  payload: unknown,
  template?: { blocks?: EditorBlock[]; fieldSchemas?: Record<string, FieldSchema> },
): unknown;
export function normalizeMappingResult(
  raw: unknown,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): FieldsExport;
export function validateMappedValues(
  fieldsExport: FieldsExport,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): FieldMappingValidationResult;
export function validateMappingSourcePaths(
  rules: FieldMappingRule[],
  payload: unknown,
): FieldMappingValidationResult;
export function buildTargetSchemaTree(
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): TargetSchemaTree;
export function applyFieldMapping(
  payload: unknown,
  mappingSpec: FieldMappingSpec,
  template: { blocks: EditorBlock[]; fieldSchemas: Record<string, FieldSchema> },
): {
  fieldsExport: FieldsExport;
  validation: FieldMappingValidationResult;
  blocks: EditorBlock[];
  fieldSchemas: Record<string, FieldSchema>;
  applied: number;
  skipped: number;
};
export function previewFieldMapping(
  payload: unknown,
  mappingSpec: FieldMappingSpec,
  template: { blocks: EditorBlock[]; fieldSchemas: Record<string, FieldSchema> },
): FieldMappingPreviewResult;
export function normalizeFieldMappingSpec(
  spec: FieldMappingSpec | null | undefined,
): FieldMappingSpec;
export function collectMappedSectionFieldKeys(
  mappingSpec: FieldMappingSpec | { rules?: FieldMappingRule[] } | null | undefined,
): Set<string>;
export function omitMappedFields(
  fieldsExport: FieldsExport | Record<string, unknown> | null | undefined,
  mappingSpec: FieldMappingSpec | { rules?: FieldMappingRule[] } | null | undefined,
): FieldsExport | Record<string, unknown> | null | undefined;

export function buildSourcePayloadTree(
  payload: unknown,
  basePath?: string,
): Array<{ key: string; path: string; type: string; children?: unknown[] }>;
export function resolveSourcePath(sourcePath: string, payload: unknown): unknown;
export function buildMappingResultFromRules(rules: FieldMappingRule[]): FieldsExport;
export function parseMappingResultToRules(
  mappingResult: unknown,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): FieldMappingRule[];
export function resolveRulesToFieldsExport(
  rules: FieldMappingRule[],
  payload: unknown,
  template: { blocks: EditorBlock[]; fieldSchemas: Record<string, FieldSchema> },
): FieldsExport;
export function upsertMappingRule(
  rules: FieldMappingRule[],
  rule: FieldMappingRule,
): FieldMappingRule[];
export function upsertMappingRules(
  rules: FieldMappingRule[],
  incoming: FieldMappingRule[],
): FieldMappingRule[];
export function createMappingRuleFromDrop(
  fieldId: string,
  sourcePath: string,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
  childFieldId?: string | null,
): FieldMappingRule | null;
export function createMappingRulesFromDrop(
  fieldId: string,
  sourcePath: string,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
  options?: { childFieldIds?: string[]; bulkChild?: boolean },
): FieldMappingRule[];
export function collectRepeaterLeafFields(
  repeaterSchema: FieldSchema,
  pathNames?: string[],
  pathIds?: string[],
): Array<{ pathNames: string[]; pathIds: string[] }>;
export function flattenSourcePayloadPaths(payload: unknown): string[];
export function parsePathTokenContext(token: string): {
  basePath: string;
  segmentPrefix: string;
  segmentStartInToken: number;
} | null;
export function getSourceFieldsAtPath(
  payload: unknown,
  pathToken: string,
): Array<{ key: string; path: string; type: string }>;
export function resolveFieldMappingTarget(
  fieldId: string,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
  childFieldId?: string | null,
): { section: string; field: string; childField?: string; fieldId: string; childFieldId?: string } | null;

export function collectAllValues(blocks: EditorBlock[]): Record<string, FieldValue>;
export function applyDocumentValues(
  blocks: EditorBlock[],
  values: Record<string, FieldValue>,
  fieldSchemas: Record<string, FieldSchema>,
): { blocks: EditorBlock[]; fieldSchemas: Record<string, FieldSchema>; applied: number; skipped: number };
export function enrichComputedValues(
  values: Record<string, FieldValue>,
  fieldSchemas: Record<string, FieldSchema>,
  blocks: EditorBlock[],
): Record<string, FieldValue>;
export function collectFieldIdsInBlocks(
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): Set<string>;
export function collectReferencedFieldSchemaIds(
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): Set<string>;
export function pruneUnusedFieldSchemas(
  fieldSchemas: Record<string, FieldSchema>,
  blocks: EditorBlock[],
): Record<string, FieldSchema>;
export function pruneUnusedBlockValues(
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): EditorBlock[];

export const ROOT_SECTION_KEY: '_root';

export function normalizeDocumentValues(
  data: { values?: Record<string, FieldValue>; sections?: Record<string, Record<string, FieldValue | TableDocumentRows>> },
  blocks: EditorBlock[],
  fieldSchemas?: Record<string, FieldSchema>,
): Record<string, FieldValue>;
export function buildSectionedDocumentFromValues(
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
  flatValues: Record<string, FieldValue>,
): Record<string, Record<string, FieldValue | TableDocumentRows>>;
export function expandSectionedDocument(
  sections: Record<string, Record<string, FieldValue | TableDocumentRows>>,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): Record<string, FieldValue>;
export function slugSectionKey(sectionName?: string | null): string;
export function deriveFieldId(sectionName: string | null | undefined, fieldName: string, usedIds?: Set<string>): string;
export function deriveUniqueFieldName(baseName: string, usedNames?: Set<string>): string;
export function allocateFieldIdentity(
  sectionBody: HTMLElement,
  registry: { getFieldSchemas?: () => Record<string, FieldSchema> } | Record<string, FieldSchema> | null | undefined,
  baseName: string,
  options?: { reservedIds?: Set<string>; reservedNames?: Set<string>; excludeFieldId?: string | null },
): { fieldId: string; fieldName: string };
export function resolveSectionName(data?: DocumentSectionData | Record<string, unknown> | null): string;
export function collectUsedSectionNames(
  blocks?: EditorBlock[] | null,
  options?: { reservedNames?: Set<string> },
): Set<string>;
export function allocateUniqueSectionName(usedNames?: Set<string>, baseName?: string): string;
export const DEFAULT_SECTION_NAME: string;
export function deriveCellFieldId(tableFieldId: string, rowKey: string, colKey: string): string;
export function ensureSchemaName(schema: FieldSchema, fallback?: string): FieldSchema;
export function ensureSchemasHaveName(fieldSchemas?: Record<string, FieldSchema>): Record<string, FieldSchema>;
export function findFieldPlacement(
  fieldId: string,
  blocks?: EditorBlock[],
): { sectionName: string; sectionLabel: string; sectionKey: string; blockIndex: number; blockType: string };
export function collectFieldsInSection(
  block: EditorBlock,
  fieldSchemas?: Record<string, FieldSchema>,
): Array<{ fieldId: string; name: string; type: string }>;
export function isFieldNameTakenInSection(
  sectionName: string,
  fieldName: string,
  currentFieldId: string,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): boolean;
export function resolveFieldIdByName(
  sectionName: string,
  fieldName: string,
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): string | null;
export function rebuildFieldIdsForSection(
  block: EditorBlock,
  fieldSchemas: Record<string, FieldSchema>,
  allBlocks: EditorBlock[],
): { fieldSchemas: Record<string, FieldSchema>; blocks: EditorBlock[] };
export function migrateFieldIds(
  blocks: EditorBlock[],
  fieldSchemas: Record<string, FieldSchema>,
): { fieldSchemas: Record<string, FieldSchema>; blocks: EditorBlock[] };
export function findSectionNameForNode(editable?: HTMLElement | null): string;
/** @deprecated Use findSectionNameForNode */
export function findSectionLabelForNode(editable?: HTMLElement | null): string;

export function expandTableArraysInValues(
  values: Record<string, FieldValue>,
  fieldSchemas?: Record<string, FieldSchema>,
): Record<string, FieldValue>;
export function collapseTablesInValues(
  values: Record<string, FieldValue>,
  fieldSchemas?: Record<string, FieldSchema>,
  blocks?: EditorBlock[],
): Record<string, FieldValue>;
export function tableRowsToFlatValues(
  tableId: string,
  rows: TableDocumentRows,
  tableSchema: TableFieldSchema,
  rowKeys?: string[],
): Record<string, FieldValue>;
export function flatValuesToTableRows(
  tableId: string,
  flatValues: Record<string, FieldValue>,
  tableSchema: TableFieldSchema,
  instanceRows?: TableRowInstance[],
): TableDocumentRows;
export function collectTableInstancesInBlocks(
  blocks: EditorBlock[],
  fieldSchemas?: Record<string, FieldSchema>,
): Array<{ tableId: string; rows?: TableRowInstance[] }>;
export function isTableRowArray(value: unknown): value is TableDocumentRows;

export function generateFieldId(prefix?: string): string;
export function isValidFieldId(id: string): boolean;
export function createDefaultSchema(type: FieldType, label?: string, name?: string): FieldSchema;
export function createDefaultBlockData(fieldType: FieldType): TemplateBlockData;
export function ensureCellSchemas(
  tableSchema: TableFieldSchema,
  tableId: string,
  fieldSchemas: Record<string, FieldSchema>,
  rows?: TableRowInstance[],
): Record<string, FieldSchema>;
export function ensureCellSchemasForRows(
  tableSchema: TableFieldSchema,
  tableId: string,
  fieldSchemas: Record<string, FieldSchema>,
  rows: TableRowInstance[],
): Record<string, FieldSchema>;
export function ensureSchemaForFieldProperties(
  fieldId: string,
  fieldSchemas?: Record<string, FieldSchema>,
  hint?: {
    tableId?: string;
    rowKey?: string;
    colKey?: string;
    rows?: TableRowInstance[];
  },
): { fieldSchemas: Record<string, FieldSchema>; schema: FieldSchema | null };
export function generateTableRowKey(existingRows?: TableRowInstance[]): string;
export function resolveTableInstanceRows(
  segmentRows: TableRowInstance[] | undefined,
  tableSchema: TableFieldSchema,
): TableRowInstance[];
export function extractRowKeysFromTableValues(
  tableId: string,
  tableSchema: TableFieldSchema,
  values: Record<string, FieldValue>,
): Set<string>;
export function labelToFieldKey(label: string, usedKeys?: Set<string>): string;
export function buildTableColumnsFromLabels(
  labels: string[],
  widths?: string[],
  previousColumns?: TableColumnDef[],
  columnNames?: string[],
): TableColumnDef[];
export function syncTableColumnKeyChanges(
  tableFieldId: string,
  oldColumns: TableColumnDef[] | undefined,
  newColumns: TableColumnDef[] | undefined,
  fieldSchemas: Record<string, FieldSchema>,
  blocks: EditorBlock[],
): { fieldSchemas: Record<string, FieldSchema>; blocks: EditorBlock[] };
export function mergeTableInstanceRows(
  existingRows: TableRowInstance[] | undefined,
  discoveredRowKeys: Iterable<string>,
  tableSchema: TableFieldSchema,
): TableRowInstance[];
export function removeTableRowCellData(
  tableFieldId: string,
  rowKey: string,
  fieldValues: Record<string, FieldValue>,
  fieldSchemas: Record<string, FieldSchema>,
): { fieldValues: Record<string, FieldValue>; fieldSchemas: Record<string, FieldSchema> };
export function getRepeaterFieldSchemas(
  repeaterSchema: RepeaterFieldSchema | null | undefined,
): Record<string, FieldSchema>;
export function normalizeRepeaterSchema(repeaterSchema: RepeaterFieldSchema): RepeaterFieldSchema;
export function isLegacyRepeaterInstancesWrapper(value: unknown): boolean;
export function createEmptyRepeaterValue(repeaterSchema: RepeaterFieldSchema): RepeaterValue;
export function normalizeRepeaterValue(
  value: RepeaterValue | null | undefined | unknown,
  repeaterSchema: RepeaterFieldSchema,
): RepeaterValue;
export function buildRepeaterPreviewDocument(
  repeaterSchema: RepeaterFieldSchema,
  repeaterValue: RepeaterValue,
): EditorDocument;
export function buildRepeaterFillDocument(
  repeaterSchema: RepeaterFieldSchema,
  repeaterValue: RepeaterValue | unknown,
): EditorDocument;
export function repeaterHasTemplate(repeaterSchema: RepeaterFieldSchema | null | undefined): boolean;
export function repeaterChildNamespacePrefix(repeaterFieldId: string): string;
export function namespaceRepeaterChildTemplate(
  doc: EditorDocument,
  repeaterFieldId: string,
): EditorDocument;
export function createDefaultRepeaterTemplateDocument(): EditorDocument;
export function buildRepeaterTemplateDocument(repeaterSchema: RepeaterFieldSchema): EditorDocument;
export function extractRepeaterFieldSchemasFromDocument(
  doc: EditorDocument,
): RepeaterFieldSchema['fieldSchemas'];
export function extractRepeaterValueFromDocument(
  doc: EditorDocument,
  repeaterSchema: RepeaterFieldSchema,
): RepeaterValue;
export function sanitizeRepeaterChildSchemas(
  repeaterSchema: RepeaterFieldSchema,
  parentFieldSchemas?: Record<string, FieldSchema>,
  blocks?: EditorBlock[],
): RepeaterFieldSchema;
export function inferRepeaterChildSchemasFromValue(
  value: unknown,
  repeaterSchema?: RepeaterFieldSchema,
  parentFieldSchemas?: Record<string, FieldSchema>,
  blocks?: EditorBlock[],
): RepeaterFieldSchema['fieldSchemas'];
export function ensureRepeaterChildSchemas(
  repeaterSchema: RepeaterFieldSchema,
  value?: unknown,
  parentFieldSchemas?: Record<string, FieldSchema>,
  blocks?: EditorBlock[],
): RepeaterFieldSchema;
export function extractRepeaterFieldValueFromBlocks(
  fieldId: string,
  blocks: EditorBlock[],
): unknown;
export function stripForeignKeysFromRepeaterValue(
  value: unknown,
  parentFieldSchemas?: Record<string, FieldSchema>,
  repeaterSchema?: RepeaterFieldSchema | null,
): unknown;
export function ensureRepeaterSchemasFromBlockValues(
  fieldSchemas: Record<string, FieldSchema>,
  blocks: EditorBlock[],
): Record<string, FieldSchema>;
export const REPEATER_CHILD_FIELD_PREFIX: '_repeater_';
export function toRepeaterChildEditorFieldId(storageKey: string): string;
export function fromRepeaterChildEditorFieldId(editorFieldId: string): string;
export function buildRepeaterTemplateExport(repeaterSchema: RepeaterFieldSchema): Record<string, unknown>;
export function parseRepeaterTemplateImport(
  data: unknown,
  repeaterFieldId?: string,
): {
  fieldSchemas: RepeaterFieldSchema['fieldSchemas'];
  template?: RepeaterFieldSchema['template'];
};
export function applyRepeaterTemplateImport(
  repeaterSchema: RepeaterFieldSchema,
  imported: ReturnType<typeof parseRepeaterTemplateImport>,
): RepeaterFieldSchema;
export const REPEATER_TEMPLATE_FILE_KIND: 'repeater-template';
export const REPEATER_TEMPLATE_FILE_VERSION: 3;
export function repeaterHasContent(
  value: RepeaterValue | null | undefined | unknown,
  repeaterSchema: RepeaterFieldSchema,
): boolean;
export function syncBlocksAfterSchemaChange(
  blocks: EditorBlock[],
  fieldId: string,
  newSchema: FieldSchema,
): EditorBlock[];
export function applyFieldIdChange(
  oldId: string,
  newId: string,
  updatedSchema: FieldSchema,
  fieldSchemas: Record<string, FieldSchema>,
  blocks: EditorBlock[],
): { fieldSchemas: Record<string, FieldSchema>; blocks: EditorBlock[] };
export function resolveSchemaDefaultValue(
  schema: FieldSchema | undefined,
  options?: { forTemplate?: boolean },
): FieldValue;
export function convertSchemaType(
  schema: FieldSchema,
  newType: FieldType,
  catalogProvider?: CatalogProvider | null,
): FieldSchema;
export function cellFieldId(tableId: string, rowKey: string, colKey: string): string;
export function parseCellFieldId(
  fieldId: string,
  fieldSchemas?: Record<string, FieldSchema>,
): { tableFieldId: string; rowKey: string; colKey: string } | null;
export function isCellFieldId(fieldId: string, fieldSchemas?: Record<string, FieldSchema>): boolean;
export function listColumnCellFieldIds(
  tableFieldId: string,
  colKey: string,
  fieldSchemas?: Record<string, FieldSchema>,
): string[];
export function tagTableCellToken(
  token: HTMLElement,
  tableFieldId: string,
  rowKey: string,
  colKey: string,
): void;
export function isSchemaRequired(schema: FieldSchema | undefined): boolean;
export function isSchemaReadonly(schema: FieldSchema | undefined): boolean;
export function isTableCellInheritedReadonly(
  fieldId: string | undefined,
  fieldSchemas?: Record<string, FieldSchema>,
): boolean;
export function isFieldEditableInFillMode(
  schema: FieldSchema | undefined,
  options?: { fieldId?: string; fieldSchemas?: Record<string, FieldSchema> },
): boolean;

/** Palette field entry. Prefer getFieldTypes() so host-registered plugins are included. */
export const FIELD_TYPES: Array<{ kind?: 'field'; type: FieldType | string; label: string }>;

export function getFieldTypes(): Array<{ kind: 'field'; type: string; label: string }>;

export type FieldInsertionMode = 'inline' | 'table' | 'block';

/**
 * Plugin interface for a field type. Built-ins are registered at package load;
 * hosts may call registerField() to add or replace types.
 */
export interface FieldHandler {
  type: string;
  label: string;
  paletteOrder?: number;
  insertion?: FieldInsertionMode;
  editableInFill?: boolean;
  blockLabel?: string;
  createSchema(label: string, name: string): FieldSchema | Record<string, unknown>;
  getEmptyValue(): unknown;
  resolveDefaultValue(
    schema: FieldSchema | Record<string, unknown>,
    options?: { forTemplate?: boolean },
  ): unknown;
  toDisplayConfig(schema: FieldSchema | Record<string, unknown>): Record<string, unknown> | null;
  toPickerConfig(
    schema: FieldSchema | Record<string, unknown>,
    catalogs: CatalogProvider,
  ): Record<string, unknown> | null;
  /** Render type-specific designer controls into the schema form extra host. */
  renderSchemaFields?(
    host: HTMLElement,
    schema: FieldSchema | Record<string, unknown>,
    ctx?: Record<string, unknown>,
  ): void;
  /** Read type-specific designer controls; `undefined` values remove keys from the schema. */
  readSchemaFields?(
    host: ParentNode,
    schema: FieldSchema | Record<string, unknown>,
  ): Record<string, unknown>;
  /**
   * Format a filled value for tokens / preview / PDF.
   * Return `null`/`undefined` to fall back to core formatting.
   */
  formatDisplay?(
    value: unknown,
    ctx: {
      schema?: FieldSchema | Record<string, unknown>;
      def?: Record<string, unknown> | null;
      emptyLabel?: string;
      fieldId?: string;
      context?: unknown;
    },
  ): string | null | undefined;
  /** Return true/false when the handler owns emptiness; omit/`undefined` uses core fallback. */
  isEmpty?(value: unknown, schema: FieldSchema | Record<string, unknown>): boolean | undefined;
  /** How PDF should render the field. `html` uses HTML→PDF blocks; default is plain text via formatDisplay. */
  pdfRenderMode?(schema: FieldSchema | Record<string, unknown>): 'plain' | 'html' | undefined;
}

export function registerField(handler: FieldHandler): FieldHandler;
export function unregisterField(type: string): boolean;
export function getFieldHandler(type: string): FieldHandler | undefined;
export function hasFieldHandler(type: string): boolean;
export function listFieldHandlers(): FieldHandler[];
export function getInlineFieldTypes(): string[];
export function isInlineFieldType(type: string): boolean;
export function registerBuiltinFields(): void;

export function registerFormulaFunction(def: FormulaFunctionDef): FormulaFunctionDef;
export function unregisterFormulaFunction(name: string): boolean;
export function resetFormulaFunctions(): void;
export function getFormulaFunction(
  name: string,
  overlay?: FormulaFunctionDef[],
): FormulaFunctionDef | undefined;
export function listFormulaFunctions(overlay?: FormulaFunctionDef[]): FormulaFunctionDef[];
export function listFormulaPickerFunctions(overlay?: FormulaFunctionDef[]): FormulaFunctionDef[];

export function applyDesignMode(enabled: boolean): void;
export function isDesignMode(): boolean;
export function configureImageUpload(config: ImageUploadConfig): void;


export interface PreviewExportOptions {
  fieldValueStyle?: FieldValueStyleOptions;
  fieldHighlight?: FieldHighlightStyle;
  pageSetup?: TemplatePageSetup;
  /** When true, omit empty fields, table rows, and repeaters from preview/PDF. Default false. */
  hideEmptyValues?: boolean;
}

export interface PreviewArtifactOptions extends PreviewExportOptions {
  /** Explicit format, or `current` to follow the open preview (default html when closed). */
  format?: 'html' | 'pdf' | 'current';
  filename?: string;
  title?: string;
  generatePdfBlob?: (
    doc: EditorDocument,
    options?: PdfExportOptions,
  ) => Promise<Blob>;
}

export interface PreviewArtifact {
  blob: Blob;
  filename: string;
  mimeType: string;
  format: 'html' | 'pdf';
}

export interface PdfExportOptions extends PreviewExportOptions {
  filename?: string;
  format?: 'a4' | 'letter';
  margin?: number | [number, number, number, number];
  title?: string;
  /** Clone of visible preview DOM (e.g. from preview modal) for reliable capture. */
  sourceElement?: HTMLElement;
  /** When true (default), save to disk after generation. Set false to only return a blob via generateDocumentPdfBlob. */
  download?: boolean;
  generatePdfBlob?: (
    doc: EditorDocument,
    options?: PdfExportOptions,
  ) => Promise<Blob>;
}

export interface FieldsExportOptions {
  /** When true, omit empty fields, table rows, and repeaters from exported values. Default false. */
  hideEmptyValues?: boolean;
  /**
   * When true, drop fields that have any field-mapping rule (scenario packs).
   * Uses the document's current fieldMapping.rules. Default false.
   */
  omitMappedFields?: boolean;
}

/** @deprecated Use FieldsExportOptions */
export type DocumentExportOptions = FieldsExportOptions;

export function renderDocumentPreview(
  doc: EditorDocument,
  options?: PreviewExportOptions,
): HTMLElement;
export function exportDocumentPdf(
  doc: EditorDocument,
  options?: PdfExportOptions,
): Promise<Blob>;
export function generateDocumentPdfBlob(
  doc: EditorDocument,
  options?: PdfExportOptions,
): Promise<Blob>;

export function createFieldToken(
  fieldId: string,
  value: FieldValue,
  placeholder?: string,
): HTMLElement;
export function updateFieldToken(
  token: HTMLElement,
  value: FieldValue,
  placeholder?: string,
): void;
export function readTokenValue(token: HTMLElement): FieldValue;
export function readRepeaterTokenValue(token: HTMLElement): Record<string, FieldValue>;
export function openFieldPicker(
  fieldId: string,
  currentValue: FieldValue,
  callbacks: PickerCallbacks & { getRegistry?: () => SchemaRegistry },
): Promise<FieldValue>;
export function pickFillFieldFromToken(
  token: HTMLElement,
  callbacks: PickerCallbacks & {
    getRegistry?: () => SchemaRegistry;
    editorHolder?: ParentNode;
    fieldValues?: Record<string, FieldValue>;
    fieldSchemas?: Record<string, FieldSchema>;
  },
  onUpdate?: (fieldId: string, value: FieldValue) => void,
  options?: {
    schema?: FieldSchema;
    placeholder?: string;
    currentValue?: FieldValue;
    updateContext?: unknown;
    root?: ParentNode;
  },
): Promise<FieldValue | undefined>;

export function showNotification(
  message: string,
  options?: { type?: 'error' | 'status'; durationMs?: number },
): void;

export function defineDocEditorElement(tagName?: string): void;

/** Shared fill-mode field dialog used by text, integer, date, and plugins. */
export function createFieldFormModal<TOpen extends { title?: string; parent?: HTMLElement | null }>(
  options: {
    parent?: HTMLElement | null;
    bodyHtml: string;
    modalClass?: string;
    focusSelector?: string;
    submitOnEnter?: boolean;
    selectAll?: boolean | ((opts: TOpen) => boolean);
    getValue: (els: {
      overlay: HTMLElement;
      modal: HTMLElement;
      body: HTMLElement;
      header: HTMLElement;
    }) => string;
    validate?: (
      els: {
        overlay: HTMLElement;
        modal: HTMLElement;
        body: HTMLElement;
        header: HTMLElement;
      },
      value: string,
    ) => string | null;
    onOpen?: (
      els: {
        overlay: HTMLElement;
        modal: HTMLElement;
        body: HTMLElement;
        header: HTMLElement;
      },
      opts: TOpen,
    ) => void;
    onClose?: (els: {
      overlay: HTMLElement;
      modal: HTMLElement;
      body: HTMLElement;
      header: HTMLElement;
    }) => void;
  },
): {
  open(opts?: TOpen): Promise<string>;
  overlay: HTMLElement;
  modal: HTMLElement;
  body: HTMLElement;
  header: HTMLElement;
};
