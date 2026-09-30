/** Shared document/engine types owned by `@docengine/engine`. */

export type TextAlign = 'left' | 'center' | 'right';

export interface FieldDisplayStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  /** Cell / field background fill (e.g. table column shading). */
  backgroundColor?: string;
  textDecoration?: 'none' | 'underline' | 'line-through';
  textAlign?: TextAlign;
}

export interface FieldValueStyleOptions {
  default?: FieldDisplayStyle;
}

export interface FieldHighlightStyle {
  color?: string;
  backgroundColor?: string;
  fontWeight?: '500' | '600';
  borderWidth?: string;
}

export interface ColumnsSegment {
  type: 'columns';
  id?: string;
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

export interface TreeNode {
  label: string;
  id?: string;
  children?: TreeNode[];
}

export interface ImageValue {
  url: string;
  caption: string;
}

/** Soft schema type — plugins may add more keys. */
export interface FieldSchema {
  type: string;
  name?: string;
  label?: string;
  required?: boolean;
  readonly?: boolean;
  displayStyle?: FieldDisplayStyle;
  htmlEditor?: boolean;
  [key: string]: unknown;
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
  fieldId?: string;
  mode?: SectionVisibilityMode;
  operator?: SectionVisibilityOperator;
  value?: unknown;
}

export interface DocumentSectionData {
  name?: string;
  label?: string;
  segments?: Segment[];
  fieldValues?: Record<string, unknown>;
  repeatable?: boolean;
  /** When true, the section title is omitted from document preview and PDF. */
  hideTitleInPreview?: boolean;
  visibility?: SectionVisibilityRule | null;
  [key: string]: unknown;
}

export interface EditorBlock {
  type: string;
  data?: Record<string, unknown> & {
    fieldId?: string;
    fieldType?: string;
    segments?: Segment[];
    name?: string;
    label?: string;
    fieldValues?: Record<string, unknown>;
    repeatable?: boolean;
    hideTitleInPreview?: boolean;
    visibility?: SectionVisibilityRule | null;
  };
}

export interface TemplatePageSetup {
  format?: 'a4' | 'letter';
  orientation?: 'portrait' | 'landscape';
  margin?: number | [number, number, number, number];
  title?: string;
  textStyle?: FieldDisplayStyle;
  valueStyle?: FieldDisplayStyle;
  fieldHighlight?: FieldHighlightStyle;
  [key: string]: unknown;
}

/** Minimal FieldHandler surface used by configureFieldHandlers. */
export interface FieldHandler {
  type: string;
  label: string;
  blockLabel?: string;
  insertion?: 'inline' | 'table' | 'block';
  editableInFill?: boolean;
  createSchema(label: string, name: string): FieldSchema | Record<string, unknown>;
  getEmptyValue(): unknown;
  resolveDefaultValue(
    schema: FieldSchema | Record<string, unknown>,
    options?: { forTemplate?: boolean },
  ): unknown;
}
