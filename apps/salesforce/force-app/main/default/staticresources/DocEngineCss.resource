/* @docengine/editor LWC bundle — generated, do not edit */
:root {
  --me-document-font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --me-document-font-size: 16px;
  --me-document-font-weight: 400;
  --me-document-line-height: 1.65;
  --me-table-font-size: 14px;
  --me-field-fill-bg: transparent;
  --me-field-fill-color: #0000FF;
  --me-field-fill-font-weight: 500;
  --me-field-fill-border-width: 1px;
  --me-field-active-outline: #0000FF;
  --me-font-family: var(--me-document-font-family);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border: 1px solid #999;
  border-radius: 3px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  background: #f0f0f0;
}

/* Author .btn { display } beats UA [hidden]; keep hide working. */
.btn[hidden] {
  display: none !important;
}

/* Author .schema-form__row { display: flex } beats UA [hidden]. */
.schema-form__row[hidden],
.image-modal__browse-row[hidden],
.image-modal__preview[hidden] {
  display: none !important;
}

.btn-primary {
  background: #4a7ab5;
  border-color: #3a6a9f;
  color: #fff;
}

.btn-primary:hover {
  background: #3a6a9f;
}

.btn-secondary:hover {
  background: #e8e8e8;
}

/* Editor.js overrides */
.codex-editor {
  padding: 0;
}

.codex-editor__redactor {
  padding: 12px 16px !important;
  margin: 0 !important;
}

.ce-block__content {
  max-width: 100% !important;
  margin: 0 !important;
}

.ce-block {
  padding: 2px 0;
}

.ce-block + .ce-block {
  margin-top: 0;
}

/* Inline document */
.document-section {
  padding: 0;
}

.document-section--border-top {
  border-top: 1px solid #000;
  padding-top: 6px;
}

.document-section--border-bottom {
  border-bottom: 1px solid #000;
  padding-bottom: 6px;
}

.document-section__header {
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  font-weight: 600;
  color: #1a1a1a;
  padding: 6px 0 4px;
  border-bottom: 1px solid #ccc;
  margin-bottom: 6px;
}

.document-section__header--collapsible {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.document-section__header-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.document-section__name-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 2px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 400;
  color: #555;
  background: #fafafa;
}

.document-section__name-input:focus {
  outline: none;
  border-color: #4a7ab5;
  background: #fff;
}

.document-section--selected .document-section__header {
  color: #2a5a9e;
  border-bottom-color: #4a7ab5;
}

.document-section:focus,
.document-table:focus,
.document-columns:focus {
  outline: none;
}

.document-section__header--selectable {
  cursor: pointer;
  user-select: none;
}

.document-section__header--selectable:hover {
  color: #4a7ab5;
}

.document-section__label-text--placeholder {
  color: #888;
  font-style: italic;
}

.document-section__header--collapsible:not(:has(.document-section__label-input)) {
  cursor: pointer;
  user-select: none;
}

.document-section__header--collapsible:not(:has(.document-section__label-input)):hover {
  color: #4a7ab5;
}

.document-section__collapse-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #bbb;
  border-radius: 3px;
  background: #f5f5f5;
  color: #333;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.document-section__collapse-btn:hover {
  background: #e8e8e8;
  border-color: #999;
}

.document-section--collapsed .document-section__collapse-btn {
  transform: rotate(-90deg);
}

.document-section--collapsed .document-section__content {
  display: none;
}

.document-section__label-input {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid #bbb;
  border-radius: 3px;
  padding: 4px 8px;
  font: inherit;
  font-weight: 600;
  background: #fff;
}

.document-section__label-input:focus {
  outline: none;
  border-color: #4a7ab5;
}

.document-section__label-text {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
}

.preview-document .document-section__header {
  margin-bottom: 8px;
}

.document-section__body {
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  font-weight: var(--me-document-font-weight);
  line-height: var(--me-document-line-height);
  color: #000;
  caret-color: var(--me-selection-outline, #2563eb);
  outline: none;
  min-height: 1.5em;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.document-section__body:focus {
  outline: none;
}

.document-section__body ul,
.document-section__body ol {
  margin: 0.25em 0;
  padding-left: 1.5em;
}

.document-section__body b,
.document-section__body strong {
  font-weight: bold;
}

.document-section__body i,
.document-section__body em {
  font-style: italic;
}

.document-section__body u,
.document-section__body [style*='underline'] {
  text-decoration: underline;
}

.document-section__body s,
.document-section__body strike {
  text-decoration: line-through;
}

.document-section__body mark {
  background-color: #fff59d;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}

.document-section__body code {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 0.92em;
  background: #f0f0f0;
  padding: 0 3px;
  border-radius: 2px;
  border: 1px solid #ddd;
}

.document-section__body h1,
.preview-document h1 {
  display: block;
  font-size: 1.6em;
  font-weight: 700;
  line-height: 1.25;
  margin: 0.65em 0 0.35em;
}

.document-section__body h2,
.preview-document h2 {
  display: block;
  font-size: 1.35em;
  font-weight: 700;
  line-height: 1.3;
  margin: 0.55em 0 0.3em;
}

.document-section__body h3,
.preview-document h3 {
  display: block;
  font-size: 1.15em;
  font-weight: 700;
  line-height: 1.35;
  margin: 0.45em 0 0.25em;
}

.editor-drag-handle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: #1d202b;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  line-height: 0;
  vertical-align: middle;
  box-sizing: border-box;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.field-token--design:hover > .editor-drag-handle,
.field-token--selected > .editor-drag-handle,
.field-token--dragging > .editor-drag-handle,
.document-columns:hover .document-columns__toolbar .editor-drag-handle,
.document-columns--selected .document-columns__toolbar .editor-drag-handle,
.document-columns--dragging .editor-drag-handle,
.document-table:hover .document-table__toolbar .editor-drag-handle,
.document-table--selected .document-table__toolbar .editor-drag-handle,
.document-table--dragging .editor-drag-handle,
.schema-tree__row:hover .editor-drag-handle,
.schema-tree__node.is-dragging .editor-drag-handle,
.schema-items__row:hover .editor-drag-handle,
.schema-items__row.is-dragging .editor-drag-handle {
  opacity: 1;
  pointer-events: auto;
}

.editor-drag-handle:hover,
.editor-drag-handle:focus-visible {
  background-color: #e3e8ee;
  border-color: rgba(201, 201, 204, 0.72);
}

.editor-drag-handle:active {
  cursor: grabbing;
  background-color: #e3e8ee;
}

.editor-drag-handle svg {
  width: 20px;
  height: 20px;
  display: block;
  pointer-events: none;
}


.editor-drag-handle__hint {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  min-width: max-content;
  padding: 6px 10px;
  border-radius: 8px;
  background: #1d202b;
  color: #fff;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.12s ease, visibility 0.12s ease;
}

.editor-drag-handle__hint::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: #1d202b;
}

.editor-drag-handle__hint-title {
  display: block;
}

.editor-drag-handle__hint-shortcut {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.65);
}

.editor-drag-handle:hover .editor-drag-handle__hint,
.editor-drag-handle:focus-visible .editor-drag-handle__hint {
  opacity: 1;
  visibility: visible;
}

.document-columns {
  margin: 0.5em 0;
}

.document-columns__toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  margin-bottom: 4px;
  font-size: 11px;
  color: #666;
  background: #f4f4f4;
  border: 1px dashed #ccc;
  border-radius: 4px;
}

/* Center grip in the toolbar chrome (like section); × stays on the right. */
.document-columns__toolbar .editor-drag-handle,
.document-table__toolbar .editor-drag-handle {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  z-index: 2;
}

.document-columns__toolbar .document-columns__delete,
.document-table__toolbar .document-table__delete {
  margin-left: auto;
}

.document-columns--dragging {
  opacity: 0.55;
}

.document-columns--selected > .document-columns__toolbar {
  border-color: #4a90d9;
  background: #eef5fc;
}

.document-table--selected > .document-table__toolbar {
  border-color: #4a90d9;
  background: #eef5fc;
}

.document-columns .document-columns {
  margin: 0.25em 0;
}

.document-columns__label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.document-columns__delete {
  border: 1px solid #c44;
  background: #fff;
  color: #c44;
  font-size: 14px;
  line-height: 1;
  width: 22px;
  height: 22px;
  padding: 0;
  cursor: pointer;
  border-radius: 3px;
}

.document-columns__delete:hover {
  background: #fee;
}

.document-columns__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* Percent tracks (table-synced totals) must not add gap or they overflow 100%. */
  gap: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  align-items: stretch;
}

.document-columns__grid--design {
  gap: 0;
  grid-template-columns: 1fr 12px 1fr;
  min-height: 48px;
}

.document-columns__col {
  position: relative;
  min-width: 0;
  min-height: 1.5em;
  outline: none;
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  line-height: var(--me-document-line-height);
  color: #000;
  caret-color: var(--me-selection-outline, #2563eb);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.document-columns__grid--design > .document-columns__col {
  min-height: 48px;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  padding: 4px 6px;
  box-sizing: border-box;
}

.document-columns__col-resizer {
  display: block;
  position: relative;
  z-index: 2;
  width: 100%;
  min-height: 48px;
  align-self: stretch;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
  background: transparent;
}

.document-columns__col-resizer::after {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: #94a3b8;
}

.document-columns__col-resizer:hover::after,
.document-columns__col-resizer--active::after {
  background: #4a7ab5;
  width: 3px;
  margin-left: -1.5px;
}

.document-columns--selected .document-columns__col-resizer::after {
  background: #4a90d9;
}

.document-columns__grid--resizing,
body.document-columns-col-resize-active {
  cursor: col-resize;
  user-select: none;
}

body.document-columns-col-resize-active .field-token {
  pointer-events: none;
}

.document-columns__col:focus {
  outline: none;
}

.document-table {
  margin: 0.5em 0;
}

.document-table__toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  margin-bottom: 4px;
  font-size: 11px;
  color: #666;
  background: #f4f4f4;
  border: 1px dashed #ccc;
  border-radius: 4px;
}

.document-table__label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.document-table__delete {
  border: 1px solid #c44;
  background: #fff;
  color: #c44;
  font-size: 14px;
  line-height: 1;
  width: 22px;
  height: 22px;
  padding: 0;
  cursor: pointer;
  border-radius: 3px;
}

.document-table__delete:hover {
  background: #fee;
}

.document-table--dragging {
  opacity: 0.55;
}

.document-section__body.document-section--drop-target {
  outline: 1px dashed #2563eb;
  outline-offset: 2px;
  border-radius: 2px;
}

.editor-drop-caret {
  position: fixed;
  width: 2px;
  background: #2563eb;
  pointer-events: none;
  z-index: 10000;
}

.field-token--design.is-drop-before {
  box-shadow: inset 0 2px 0 0 #2563eb;
}

.field-token--design.is-drop-after {
  box-shadow: inset 0 -2px 0 0 #2563eb;
}

.document-table.is-drop-after,
.document-columns.is-drop-after {
  box-shadow: inset 0 -2px 0 0 #2563eb;
}

.document-section__body .document-columns__col ul,
.document-section__body .document-columns__col ol,
.preview-document .document-columns__col ul,
.preview-document .document-columns__col ol {
  margin: 0.25em 0;
  padding-left: 1.5em;
}

.editor-top-chrome {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.editor-top-chrome--sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #f0f0f0;
  padding-bottom: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.editor-top-chrome .field-palette,
.editor-top-chrome .rich-text-toolbar {
  margin-bottom: 0;
}

.rich-text-toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  margin-bottom: 8px;
  background: #f4f4f4;
  border: 1px solid #ccc;
  border-radius: 4px;
  overflow-x: auto;
}

.rich-text-toolbar__preview {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-right: 8px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  border: 1px solid #93c5fd;
  border-radius: 4px;
  background: #eff6ff;
  color: #1e40af;
  cursor: pointer;
}

.rich-text-toolbar__preview:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #2563eb;
}

.rich-text-toolbar__preview[hidden] {
  display: none !important;
}

.rich-text-toolbar__preview:disabled {
  opacity: 0.55;
  cursor: default;
}

/* Dim format controls only — Preview stays a full-strength document action. */
.rich-text-toolbar--inactive > :not(.rich-text-toolbar__preview) {
  opacity: 0.65;
}

.rich-text-toolbar--field-style {
  background: #eef3fa;
  border-color: #8ab0d8;
}

.rich-text-toolbar--field-style:not(.rich-text-toolbar--inactive) {
  opacity: 1;
}

.rich-text-toolbar__btn--active {
  background: #d8e8f8;
  border-color: #4a7ab5;
}

.rich-text-toolbar__input--color {
  width: 36px;
  height: 28px;
  padding: 2px;
  cursor: pointer;
}

.rich-text-toolbar__hint {
  flex: 1 1 auto;
  min-width: 0;
  margin-left: auto;
  padding-left: 8px;
  font-size: 11px;
  color: #666;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rich-text-toolbar[hidden] {
  display: none;
}

.rich-text-toolbar__title {
  font-size: 12px;
  font-weight: 600;
  color: #555;
  margin-right: 6px;
}

.rich-text-toolbar__btn {
  min-width: 28px;
  padding: 4px 8px;
  font-size: 13px;
  font-family: 'Segoe UI', Tahoma, sans-serif;
  border: 1px solid #bbb;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  line-height: 1.2;
}

.rich-text-toolbar__btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  width: 28px;
  height: 28px;
  padding: 0;
  flex-shrink: 0;
}

.rich-text-toolbar__btn--icon svg {
  width: 16px;
  height: 16px;
}

.rich-text-toolbar__btn:hover:not(:disabled) {
  background: #e8e8e8;
}

.rich-text-toolbar__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.rich-text-toolbar__font-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding-left: 8px;
  border-left: 1px solid #ccc;
  flex-shrink: 0;
}

.rich-text-toolbar__align-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding-left: 8px;
  border-left: 1px solid #ccc;
  flex-shrink: 0;
}

.rich-text-toolbar__heading-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding-left: 8px;
  border-left: 1px solid #ccc;
  flex-shrink: 0;
}

.rich-text-toolbar__align-group[hidden] {
  display: none;
}

.rich-text-toolbar__label {
  font-size: 11px;
  font-weight: 600;
  color: #555;
}

.rich-text-toolbar__input {
  width: 120px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: 'Segoe UI', Tahoma, sans-serif;
  border: 1px solid #aaa;
  border-radius: 3px;
  background: #fff;
  flex-shrink: 0;
}

.rich-text-toolbar__input--size {
  width: 56px;
}

.rich-text-toolbar__input--size[type='number'] {
  -moz-appearance: auto;
  appearance: auto;
}

.rich-text-toolbar__select {
  width: 120px;
  cursor: pointer;
}

.rich-text-toolbar__input--custom {
  width: 100px;
}

.rich-text-toolbar__input:disabled,
.rich-text-toolbar__select:disabled {
  opacity: 0.5;
  cursor: default;
  background: #f0f0f0;
}

.field-token {
  color: #0000cc;
  text-decoration: underline;
  cursor: pointer;
  white-space: pre-wrap;
}

.field-token--empty {
  font-style: italic;
  color: #0000cc;
}

.field-token--required {
  outline: 1px dashed #c9a227;
  outline-offset: 2px;
  border-radius: 2px;
}

.field-token--required-missing {
  background: #fff3cd;
  outline: 2px solid #e6a800;
}

.field-token--required-missing.field-token--empty {
  color: #8a6400;
}

.field-token--computed {
  cursor: default;
  text-decoration: none;
  color: #333;
  font-style: normal;
}

.field-token--readonly {
  cursor: default;
  text-decoration: none;
  color: #333;
  font-style: normal;
}

.field-token--repeater {
  display: block;
  width: 100%;
  max-width: 100%;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  font-style: normal;
  white-space: normal;
  padding: 6px 8px;
  margin: 4px 0;
  border: 1px solid #d8e8f4;
  border-radius: 3px;
  background: #f8fbfd;
  overflow-x: auto;
}

.field-token--design.field-token--repeater {
  cursor: default;
}

.field-token--repeater .field-token__repeater-preview,
.field-token--repeater .field-token__repeater-instance-body {
  pointer-events: none;
}

.field-token--repeater .vision-table {
  table-layout: auto;
  width: max-content;
  min-width: 100%;
}

.field-token--repeater .vision-table th,
.field-token--repeater .vision-table td {
  overflow: visible;
  white-space: nowrap;
}

.field-token__repeater-preview {
  display: block;
  width: 100%;
}

.field-token__repeater-instance + .field-token__repeater-instance {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e3edf5;
}

.field-token__repeater-instance-title {
  font-size: 12px;
  font-weight: 600;
  color: #2f6b9a;
  margin-bottom: 4px;
}

.field-token__repeater-instance-body {
  font-size: 13px;
  line-height: 1.45;
}

.field-token__repeater-instance-body .preview-document {
  padding: 0;
}

.field-token__repeater-instance-empty {
  color: #888;
  font-style: italic;
}

.field-token--cell {
  display: inline-block;
  min-width: 2.5em;
  font-family: var(--me-document-font-family);
  font-size: var(--me-table-font-size);
}

.vision-table .field-token--cell {
  min-width: 0;
  max-width: 100%;
}

.vision-table .field-token--cell.field-token--computed {
  white-space: nowrap;
}

/* Fill mode: values read like document text, not hyperlinks */
.document-section__body .field-token:not(.field-token--design),
.vision-table .field-token--cell:not(.field-token--design) {
  color: #000;
  text-decoration: none;
  font-style: normal;
}

.document-section__body .field-token:not(.field-token--design).field-token--empty,
.vision-table .field-token--cell:not(.field-token--design).field-token--empty {
  color: #666;
  font-style: italic;
}

/* Fill mode: underline all field values with configured highlight color */
.editor-holder--show-fields .document-section__body .field-token:not(.field-token--design):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--html):not(.field-token--required-missing),
.editor-holder--show-fields .vision-table .field-token--cell:not(.field-token--design):not(.field-token--computed):not(.field-token--readonly):not(.field-token--required-missing) {
  text-decoration: underline;
  text-decoration-color: var(--me-field-fill-color, #0000FF);
  text-decoration-thickness: var(--me-field-fill-border-width, 1px);
  text-underline-offset: 2px;
  cursor: pointer;
}

.editor-holder--show-fields .document-section__body .field-token:not(.field-token--design).field-token--empty:not(.field-token--required-missing):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--html),
.editor-holder--show-fields .vision-table .field-token--cell:not(.field-token--design).field-token--empty:not(.field-token--readonly):not(.field-token--required-missing),
.document-section__body .field-token--design.field-token--empty:not(.field-token--required-missing):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--html),
.vision-table .field-token--cell.field-token--design.field-token--empty:not(.field-token--readonly):not(.field-token--required-missing),
.document-section--mapping .document-section__body .field-token.field-token--empty:not(.field-token--required-missing):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--html),
.document-section--mapping .vision-table .field-token--cell.field-token--empty:not(.field-token--readonly):not(.field-token--required-missing) {
  background: var(--me-field-fill-bg, transparent);
  color: var(--me-field-fill-color, #0000FF);
  font-weight: var(--me-field-fill-font-weight, 500);
  font-style: italic;
}

.editor-holder--show-fields .document-section__body .field-token:not(.field-token--design).field-token--required-missing,
.editor-holder--show-fields .vision-table .field-token--cell:not(.field-token--design).field-token--required-missing {
  background: #fff3cd;
  color: #8a6400;
  font-weight: var(--me-field-fill-font-weight, 500);
  text-decoration: underline;
  text-decoration-color: #8a6400;
  text-underline-offset: 2px;
  outline: 2px solid #e6a800;
  outline-offset: 1px;
}

.field-token--focused:not(.field-token--design),
.editor-holder--show-fields .field-token--active:not(.field-token--design) {
  outline: 2px solid var(--me-field-active-outline, #0000FF);
  outline-offset: 2px;
}

.field-token--image {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  margin: 0.5em 0;
  padding: 0;
  clear: both;
}

.document-align--center > .field-token--image {
  margin-inline: auto;
}

.document-align--right > .field-token--image {
  margin-inline-start: auto;
  margin-inline-end: 0;
}

.document-align--left > .field-token--image {
  margin-inline-start: 0;
  margin-inline-end: auto;
}

.field-token__thumb {
  display: block;
  width: auto;
  height: auto;
  max-width: var(--field-image-max-width, 320px);
  max-height: none;
  border-radius: 2px;
  border: 1px solid #ccc;
}

.field-token__caption {
  font-size: 12px;
  color: #333;
}

.image-modal__preview {
  margin-bottom: 10px;
  text-align: center;
}

.image-modal__preview img {
  max-width: 100%;
  max-height: 200px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.image-modal__browse-row {
  margin-bottom: 10px;
}

.image-modal__browse-row .btn {
  width: 100%;
}

.signature-modal__disclaimer {
  font-size: 12px;
  color: #666;
  margin-bottom: 10px;
}

.signature-modal__canvas-wrap {
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  overflow: hidden;
}

.signature-modal__canvas {
  display: block;
  width: 100%;
  max-width: 400px;
  height: auto;
  touch-action: none;
  cursor: crosshair;
}

.field-token--logical {
  font-weight: 600;
  cursor: pointer;
}

.field-token--logical-yes {
  color: #0a7a2f;
}

.field-token--logical-no {
  color: #b42318;
}

.field-token--preview.field-token--logical-yes,
.field-token--preview.field-token--logical-no {
  cursor: default;
}

.image-files-modal-overlay {
  z-index: 10050;
}

.image-files-modal .image-modal__existing-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(50vh, 360px);
  overflow: auto;
  margin-top: 6px;
  padding: 4px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fafafa;
}

.image-modal__existing-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.image-modal__existing-item:hover:not(:disabled) {
  border-color: #99c;
  background: #f3f7ff;
}

.image-modal__existing-item--selected {
  border-color: #006fea;
  background: #e8f2ff;
}

.image-modal__existing-item:disabled {
  opacity: 0.7;
  cursor: wait;
}

.image-modal__existing-thumb {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #eee;
  font-size: 10px;
  color: #555;
}

.image-modal__existing-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-modal__existing-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal__input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #aaa;
  border-radius: 2px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}

/* Vision table */
.vision-table-block {
  margin: 8px 0;
}

.vision-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--me-document-font-family);
  font-size: var(--me-table-font-size);
  table-layout: fixed;
}

.vision-table th,
.vision-table td {
  border: 1px solid #999;
  padding: 4px 8px;
  min-width: 0;
  overflow: hidden;
}

.vision-table--borderless th,
.vision-table--borderless td {
  border: none;
}

.vision-table th {
  background: #f0f0f0;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  font-style: inherit;
  color: inherit;
  text-transform: none;
  letter-spacing: normal;
  text-align: center;
  position: relative;
}

.vision-table__col-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  z-index: 2;
  width: 7px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
}

/* Always-visible design-mode splitters (match `.document-columns__col-resizer`). */
.vision-table__col-resizer::after {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: #94a3b8;
}

.vision-table__col-resizer:hover::after,
.vision-table__col-resizer--active::after {
  background: #4a7ab5;
  width: 3px;
  margin-left: -1.5px;
}

/* Body column guides in design mode (resizers only exist then). */
.vision-table:has(.vision-table__col-resizer) > tbody > tr > td:not(.vision-table__row-label):not(:last-child) {
  box-shadow: inset -1px 0 0 #cbd5e1;
}

.vision-table__resize-head .vision-table__resize-th {
  height: 10px;
  padding: 0;
  background: transparent;
  border-bottom-color: #c5d4e4;
  font-size: 0;
  line-height: 0;
}

.vision-table--resizing,
body.vision-table-col-resize-active {
  cursor: col-resize;
  user-select: none;
}

.vision-table--resizing .field-token,
body.vision-table-col-resize-active .field-token {
  pointer-events: none;
}

.vision-table td.vision-table__cell--with-remove {
  position: relative;
  padding-right: 20px;
  overflow: visible;
}

.vision-table .vision-table__row-remove {
  position: absolute;
  top: 50%;
  right: 1px;
  z-index: 2;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1;
  width: 16px;
  height: 16px;
  padding: 0;
  cursor: pointer;
  border-radius: 3px;
}

.vision-table .vision-table__row-remove:hover {
  background: #fee;
  color: #c44;
}

.vision-table__row-label-head {
  width: 3em;
  padding: 4px 8px;
}

.vision-table__row-label {
  width: 3em;
  padding: 4px 8px;
  font-weight: 600;
  white-space: nowrap;
  vertical-align: middle;
}

.repeater-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  line-height: var(--me-document-line-height);
}

.repeater-block__instance {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.repeater-block__instance-header {
  padding: 6px 10px;
  background: #f5f7fa;
  font-weight: 600;
  font-size: 13px;
  color: #444;
  border-bottom: 1px solid #e8e8e8;
}

.repeater-block__instance-body {
  padding: 8px 10px;
}

.repeater-block__field-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 4px;
}

.repeater-block__field-row:last-child {
  margin-bottom: 0;
}

.repeater-block__field-label {
  color: #555;
}

.repeater-block__preview {
  color: #666;
  font-style: italic;
  font-size: 14px;
}

.template-block--repeater .template-block__body {
  padding-top: 4px;
}

.preview-document .repeater-block__instance {
  border-color: #ddd;
}

.preview-document .repeater-block__instance-header {
  background: #fafafa;
}

.modal--repeater-editor {
  width: min(96vw, 1200px);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
}

.repeater-editor-modal__body {
  flex: 1;
  min-height: 420px;
  max-height: calc(92vh - 120px);
  overflow: auto;
  padding: 0;
}

.repeater-editor-modal__mount {
  min-height: 400px;
}

.repeater-editor-modal__holder {
  min-height: 400px;
}

.repeater-editor-modal__holder .design-shell {
  min-height: 380px;
}

.repeater-block__instance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.repeater-block__preview-content .preview-document {
  font-size: 14px;
}

.repeater-block__preview-empty {
  color: #888;
  font-style: italic;
  font-size: 14px;
}

.document-table__row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  margin-top: 6px;
}

.document-repeater {
  margin: 8px 0;
  border: 1px dashed #c8d4e0;
  border-radius: 6px;
  background: #fafbfc;
}

.document-repeater__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px dashed #dde4ea;
  background: #f0f4f8;
}

.document-repeater__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #556;
  flex: 1;
}

.document-repeater__delete {
  border: none;
  background: transparent;
  color: #888;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.document-repeater .repeater-block {
  padding: 8px;
}

.document-repeater--dragging {
  opacity: 0.6;
}

.ce-toolbar {
  display: none !important;
}

body.design-mode .ce-toolbar {
  display: flex !important;
}

.ce-toolbar__plus,
.ce-toolbar__plus-shortcut {
  display: none !important;
}

body.design-mode .ce-block__content {
  border: 1px dashed #ccc;
  padding: 4px;
}

.ce-block--selected .ce-block__content {
  background: transparent;
}

/* Form blocks */
.form-block {
  border: 1px solid #d0d0d0;
  padding: 10px 12px;
  background: #fafafa;
}

.form-block__label {
  font-weight: 600;
  margin-bottom: 8px;
  color: #333;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 140px;
}

.form-field--narrow {
  flex: 0 0 120px;
  min-width: 100px;
}

.form-field label {
  font-size: 12px;
  color: #555;
}

.form-field input,
.form-field select {
  padding: 6px 8px;
  border: 1px solid #aaa;
  border-radius: 2px;
  font-size: 13px;
  font-family: inherit;
}

.form-field input[type='number'] {
  width: 80px;
}

.form-textarea {
  min-height: 60px;
  padding: 8px;
  border: 1px solid #aaa;
  border-radius: 2px;
  background: #fff;
  outline: none;
  line-height: 1.5;
}

.form-textarea:focus {
  border-color: #4a7ab5;
}

/* Selection list */
.selection-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.selection-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #ccc;
  background: #fff;
  min-height: 36px;
}

.selection-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid #e0e0e0;
}

.selection-list__item:last-child {
  border-bottom: none;
}

.selection-list__empty {
  padding: 8px 10px;
  color: #888;
  font-style: italic;
}

.selection-list__remove {
  background: none;
  border: none;
  color: #c44;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  line-height: 1;
}

.selection-list__remove:hover {
  color: #a00;
}

.btn-pick {
  padding: 5px 14px;
  font-size: 12px;
  background: #e8e8e8;
  border: 1px solid #aaa;
  border-radius: 2px;
  cursor: pointer;
}

.btn-pick:hover {
  background: #ddd;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-overlay[hidden] {
  display: none !important;
}

.modal {
  background: #fff;
  border: 1px solid #666;
  border-radius: 4px;
  width: min(480px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}

.modal__header {
  padding: 10px 14px;
  font-weight: 600;
  border-bottom: 1px solid #ccc;
  background: #f0f0f0;
}

.schema-editor-modal__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.schema-editor-modal__title {
  font-weight: 600;
}

.schema-editor-modal__field-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 400;
  color: #555;
  word-break: break-all;
}

.modal__body {
  padding: 10px 14px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.modal--list .modal__body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal--list .list-root {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.modal__search {
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 10px;
  border: 1px solid #aaa;
  border-radius: 2px;
  font-size: inherit;
  font-family: inherit;
  box-sizing: border-box;
}

.modal__status {
  font-size: 12px;
  color: #666;
  margin: -4px 0 8px;
  min-height: 1.2em;
  line-height: 1.2;
}

.modal__status--empty {
  visibility: hidden;
}

.modal__status--error {
  color: #b00020;
  visibility: visible;
}

.list-root {
  min-height: 220px;
  max-height: min(50vh, 400px);
  overflow-y: auto;
  overflow-x: hidden;
}

.list-root--loading {
  opacity: 0.55;
  pointer-events: none;
}

.modal--list {
  width: min(520px, 94vw);
  height: min(480px, 80vh);
}

.modal--tree {
  width: min(520px, 94vw);
  height: min(480px, 80vh);
}

.modal--resizable {
  position: relative;
}

.modal__resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  touch-action: none;
  background:
    linear-gradient(
      135deg,
      transparent 0 50%,
      rgba(120, 120, 120, 0.45) 50% 58%,
      transparent 58% 64%,
      rgba(120, 120, 120, 0.45) 64% 72%,
      transparent 72%
    );
  border-bottom-right-radius: 4px;
}

body.modal-resize-active {
  user-select: none;
  cursor: nwse-resize;
}

.modal--movable .modal__header {
  cursor: grab;
  touch-action: none;
}

.modal--dragging .modal__header,
body.modal-move-active {
  cursor: grabbing;
  user-select: none;
}

/* After drag, leave flex centering so left/top stick. */
.modal--moved {
  position: absolute;
  margin: 0;
}

.modal--tree .modal__body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal--tree .tree-root {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.modal__textarea {
  width: 100%;
  min-height: 120px;
  padding: 8px 10px;
  border: 1px solid #aaa;
  border-radius: 2px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.modal--html-text {
  width: min(640px, 94vw);
}

.html-text-modal__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
  background: #f8f8f8;
}

.html-text-modal__align-group {
  display: flex;
  gap: 2px;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid #ddd;
}

.html-text-modal__heading-group {
  display: flex;
  gap: 2px;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid #ddd;
}

.html-text-modal__editor h1 {
  font-size: 1.6em;
  font-weight: 700;
  margin: 0.65em 0 0.35em;
}

.html-text-modal__editor h2 {
  font-size: 1.35em;
  font-weight: 700;
  margin: 0.55em 0 0.3em;
}

.html-text-modal__editor h3 {
  font-size: 1.15em;
  font-weight: 700;
  margin: 0.45em 0 0.25em;
}

.html-text-modal__toolbar-btn {
  width: 28px;
  height: 28px;
  padding: 0;
}

.html-text-modal__editor {
  min-height: 160px;
  max-height: 50vh;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid #aaa;
  border-radius: 2px;
  font-size: 14px;
  line-height: 1.45;
  outline: none;
}

.html-text-modal__editor:focus {
  border-color: #4a90d9;
  box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.2);
}

/*
 * HTML text values can include block nodes (ul/ol/p). Those force anonymous
 * blocks inside the default inline field-token span, so outline/background
 * fragment into per-line boxes (and a stray corner that looks like a "0").
 * One inline-block box keeps focus + fill chrome around the whole value.
 */
.field-token--html {
  display: inline-block;
  max-width: 100%;
  vertical-align: top;
  white-space: normal;
}

.field-token--html ul,
.field-token--html ol,
.html-text-modal__editor ul,
.html-text-modal__editor ol {
  margin: 0.25em 0;
  padding-left: 1.5em;
}

.field-token--html mark,
.html-text-modal__editor mark {
  background: #fff3a0;
}

.field-token--html code,
.html-text-modal__editor code {
  font-family: ui-monospace, monospace;
  font-size: 0.92em;
  background: #f0f0f0;
  padding: 0 0.15em;
  border-radius: 2px;
}

.modal__hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #666;
}

.modal__number {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #aaa;
  border-radius: 2px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}

.modal__error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #b00020;
}

.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #ccc;
  background: #f8f8f8;
}

.modal__footer [data-action="clear"] {
  margin-right: auto;
}

.modal__custom-entries {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.modal__custom-entries[hidden] {
  display: none !important;
}

.modal__custom-entries-label {
  font-size: 12px;
  font-weight: 600;
  color: #444;
}

.modal__custom-entries-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 48px;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font: inherit;
}

/* Tree */
.tree-root {
  max-height: min(50vh, 400px);
  overflow-y: auto;
  overflow-x: hidden;
}

.tree-node {
  user-select: none;
}

.tree-node__row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
  cursor: pointer;
}

.tree-node__row:hover {
  background: #f0f4f8;
}

.tree-node__toggle {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #555;
  flex-shrink: 0;
}

.tree-node__toggle--leaf {
  visibility: hidden;
}

.tree-node__checkbox {
  flex-shrink: 0;
}

.tree-node__label {
  flex: 1;
}

.tree-node__children {
  margin-left: 20px;
}

.tree-node__children[hidden] {
  display: none;
}

/* List modal */
.list-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 0;
  cursor: pointer;
}

.list-item:hover {
  background: #f0f4f8;
}

.list-item__label {
  flex: 1;
  line-height: 1.4;
}

.list-item__code {
  color: #666;
  font-size: 12px;
}

.list-item__highlight {
  background: #fff3b0;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}

/* Design mode — match Preview accent action chrome */
.design-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  padding: 3px 8px;
  border: 1px solid #93c5fd;
  border-radius: 4px;
  background: #eff6ff;
  color: #1e40af;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.design-toggle:hover:not(:has(input:disabled)) {
  background: #dbeafe;
  border-color: #2563eb;
}

.design-toggle:has(input:disabled) {
  opacity: 0.55;
  cursor: default;
}

.document-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.document-actions__title {
  font-size: 11px;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  margin-right: 2px;
}

.document-actions__btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  width: 32px;
  height: 32px;
  padding: 0;
}

.document-actions__btn--icon svg {
  width: 18px;
  height: 18px;
}

.field-palette {
  display: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #e8f0fa;
  border: 1px solid #9ab;
  border-radius: 4px;
}

body.design-mode .field-palette {
  display: flex;
}

body.design-mode--panels .field-palette--vertical {
  display: flex;
}

.field-palette--vertical {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.field-palette__header {
  flex-shrink: 0;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--me-border, #ccc);
  background: var(--me-surface-100, #fafafa);
}

.field-palette--vertical .field-palette__title {
  display: block;
  font-weight: 700;
  font-size: 14px;
  margin: 0;
  color: var(--me-text, #1a1a1a);
}

.field-palette__body {
  flex: 1 1 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--me-surface-100, transparent);
}

.field-palette__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-palette__group-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--me-text-muted, #567);
  padding: 0 4px;
}

.field-palette__item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  text-align: left;
  font-size: 13px;
  background: var(--me-surface-0, #fff);
  border: 1px solid var(--me-border, #b8c8d8);
  border-radius: 4px;
  cursor: grab;
  color: var(--me-text, #1a1a1a);
}

.field-palette__item:hover {
  background: var(--me-accent-hover, #f0f8ff);
  border-color: var(--me-accent-hover-border, #7a9);
}

.field-palette__item--dragging {
  opacity: 0.55;
}

.field-palette__footer {
  flex-shrink: 0;
  padding: 10px 14px 14px;
  border-top: 1px solid var(--me-border, #ccc);
  background: var(--me-surface-100, #fafafa);
}

.field-palette--vertical .field-palette__hint {
  flex-basis: auto;
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
}

.design-shell {
  display: block;
  background: transparent;
  border: none;
  border-radius: 0;
  overflow: visible;
}

.design-shell--active {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 300px;
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: var(--me-surface-200, #d8d8d8);
  border: 1px solid var(--me-border, #aaa);
  border-radius: 4px;
  overflow: hidden;
  color: var(--me-text, inherit);
}

.design-shell--active > .design-panel {
  min-height: 0;
  overflow: hidden;
}

.design-shell:not(.design-shell--active) .design-panel--left,
.design-shell:not(.design-shell--active) .design-panel--right {
  display: none;
}

/* Fill mode (default / embeds / Salesforce): content-sized so the editor is visible
 * without a viewport-tall flex parent. Viewport-locked scrolling is scoped to `.page` below. */
.design-shell:not(.design-shell--active) {
  display: flex;
  flex-direction: column;
  min-height: 320px;
  overflow: visible;
}

.design-shell:not(.design-shell--active) .design-panel--center {
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  min-height: 0;
  height: auto;
  padding: 0;
  background: transparent;
  overflow: visible;
}

.design-shell:not(.design-shell--active) .design-panel__toolbar {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 50;
  margin-bottom: 0;
  padding-bottom: 8px;
  background: var(--me-surface-50, #f8fafc);
}

.design-shell:not(.design-shell--active) .design-panel__editor-scroll {
  flex: 0 1 auto;
  min-height: 200px;
  height: auto;
  overflow: visible;
  background: #fff;
  border: none;
  border-radius: 0;
}

.design-shell:not(.design-shell--active) .design-panel__editor-scroll .editor-holder,
.design-shell:not(.design-shell--active) .design-panel__editor-scroll #editorjs {
  min-height: 200px;
}

/* Demo `.page` host: pin format toolbar; only the document scrolls within the viewport */
.page > .design-shell:not(.design-shell--active) {
  flex: 1 1 0;
  min-height: 0;
  height: auto;
  overflow: hidden;
}

.page > .design-shell:not(.design-shell--active) .design-panel--center {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.page > .design-shell:not(.design-shell--active) .design-panel__editor-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.design-panel {
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--me-surface-100, #ececec);
}

.design-panel--left {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--me-border, #aaa);
  background: var(--me-surface-100, #e4eaf2);
  min-height: 0;
  overflow: hidden;
}

.design-panel--left .field-palette--vertical {
  /* Same fill pattern as .properties-panel: occupy panel height, scroll inside body. */
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  max-height: none;
  align-self: stretch;
}

.design-panel--center {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--me-surface-200, #c8c8c8);
  padding: 12px;
  box-sizing: border-box;
}

.design-panel--right {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--me-border, #aaa);
  background: var(--me-surface-100, #f4f4f4);
  overflow: hidden;
}

.design-panel--right .properties-panel {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  align-self: stretch;
}

.design-panel__toolbar {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.design-panel__editor-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  /* Document paper stays light even when chrome is dark. */
  background: #fff;
  border: 1px solid var(--me-border, #999);
  border-radius: 2px;
}

.design-panel--center .design-panel__editor-scroll .editor-holder,
.design-panel--center .design-panel__editor-scroll #editorjs {
  min-height: 200px;
  border: none;
  background: transparent;
}

.design-shell .properties-panel,
.design-shell .field-palette,
.design-shell .design-panel__toolbar,
.editor-top-chrome,
.modal--schema-designer,
.modal--schema-designer .modal,
.modal.modal--wide:has(.schema-editor) {
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  font-style: inherit;
}

.design-shell .properties-panel__title,
.design-shell .properties-panel__subtitle,
.design-shell .properties-panel__empty,
.design-shell .properties-panel__field-id,
.design-shell .schema-form__row span,
.design-shell .schema-form__row input,
.design-shell .schema-form__row select,
.design-shell .schema-form__row textarea,
.design-shell .schema-form__hint,
.design-shell .schema-form__subtitle,
.design-shell .field-palette__group-title,
.design-shell .field-palette__item,
.design-shell .field-palette__hint,
.design-shell .display-style-form,
.design-shell .display-style-form legend,
.design-shell .display-style-form label,
.design-shell .display-style-form input,
.design-shell .display-style-form select,
.design-shell .display-style-form__preview,
.design-shell .display-style-form__reset,
.design-shell .display-style-form__toolbar .rich-text-toolbar__btn,
.design-shell .field-highlight-form,
.design-shell .field-highlight-form legend,
.design-shell .field-highlight-form label,
.design-shell .field-highlight-form input,
.design-shell .formula-field-picker,
.design-shell .btn,
.modal--schema-designer .schema-form__row span,
.modal--schema-designer .schema-form__row input,
.modal--schema-designer .schema-form__row select,
.modal--schema-designer .schema-form__hint,
.modal--schema-designer .schema-items__row input,
.modal--schema-designer .schema-tree__row input,
.modal--schema-designer .btn,
.modal.modal--wide:has(.schema-editor) .schema-form__row span,
.modal.modal--wide:has(.schema-editor) .schema-form__row input,
.modal.modal--wide:has(.schema-editor) .schema-form__row select,
.modal.modal--wide:has(.schema-editor) .schema-form__hint,
.modal.modal--wide:has(.schema-editor) .schema-editor-modal__title,
.modal.modal--wide:has(.schema-editor) .schema-editor-modal__field-id,
.modal.modal--wide:has(.schema-editor) .btn {
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  font-style: inherit;
}

/* Preview must not inherit panel textStyle bold/italic — form controls set those explicitly. */
.design-shell .display-style-form__preview {
  font-weight: normal;
  font-style: normal;
  text-decoration: none;
}

body.design-mode--panels,
/* Standalone `.page` hosts: same viewport lock in fill mode so the format toolbar stays pinned */
body:has(.page > .design-shell:not(.design-shell--active)) {
  overflow: hidden;
  height: 100vh;
}

body.design-mode--panels .page,
body:has(.page > .design-shell:not(.design-shell--active)) .page {
  display: flex;
  flex-direction: column;
  max-width: none;
  height: 100vh;
  margin: 0 auto;
  padding: 12px 16px 16px;
  box-sizing: border-box;
  overflow: hidden;
}

body.design-mode--panels .page > .design-shell--active,
.page > .design-shell:not(.design-shell--active) {
  flex: 1 1 0;
  min-height: 0;
  height: auto;
  align-self: stretch;
}

body.design-mode--panels .page-sticky-chrome,
.page:has(> .design-shell:not(.design-shell--active)) > .page-sticky-chrome {
  flex-shrink: 0;
}

body.design-mode--panels .editor-top-chrome {
  display: none;
}

.editor-holder--palette-drop {
  outline: 2px dashed #6a8;
  outline-offset: 2px;
}

.ce-block.is-drop-before-block {
  box-shadow: inset 0 3px 0 0 #3a7;
}

.properties-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.properties-panel__header {
  flex-shrink: 0;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--me-border, #ccc);
  background: var(--me-surface-100, #fafafa);
}

.properties-panel__header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.properties-panel__setup-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.2;
}

.properties-panel__setup-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.properties-panel__setup-icon svg {
  width: 14px;
  height: 14px;
}

.properties-panel__title {
  display: block;
  font-weight: 700;
  font-size: 14px;
  color: var(--me-text, #1a1a1a);
}

.properties-panel__subtitle {
  display: block;
  font-size: 11px;
  color: var(--me-text-muted, #678);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.properties-panel__body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 12px 14px 16px;
  background: var(--me-surface-100, transparent);
}

.properties-panel__empty {
  font-size: 13px;
  color: var(--me-text-muted, #678);
  line-height: 1.5;
}

.properties-panel__field-id {
  font-size: 11px;
  color: #567;
  font-family: Consolas, monospace;
  margin-bottom: 10px;
  word-break: break-all;
}

.properties-panel__field-form .schema-form {
  padding: 0;
}

.properties-panel__style-forms {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 24px;
}

.display-style-form {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fafafa;
  min-width: 0;
}

.display-style-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.display-style-form__legend {
  display: block;
  float: none;
  width: auto;
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
  font-size: 12px;
  font-weight: 600;
  line-height: 24px;
  color: #333;
}

.display-style-form__reset {
  position: static;
  top: auto;
  right: auto;
  z-index: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.display-style-form__reset:hover {
  background: #e2e8f0;
  color: #334155;
}

.display-style-form__reset:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.display-style-form__reset svg {
  display: block;
}

.display-style-form__toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.display-style-form__toolbar.rich-text-toolbar--compact {
  flex-wrap: nowrap;
}

.display-style-form__font-group {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  flex: 0 0 auto;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
  order: 0;
}

.display-style-form__font-group .rich-text-toolbar__select {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.display-style-form__font-group .rich-text-toolbar__input--custom {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.display-style-form__font-group .rich-text-toolbar__input--size {
  width: 56px;
  flex: 0 0 56px;
  margin-left: 0;
}

.display-style-form__format-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.display-style-form__style-group {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
  flex: 0 0 auto;
}

.display-style-form__style-group .rich-text-toolbar__btn {
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  min-width: 30px;
  width: 30px;
  height: 30px;
}

.display-style-form__style-group .rich-text-toolbar__btn + .rich-text-toolbar__btn {
  border-left: 1px solid #e2e8f0;
}

.display-style-form__style-group .rich-text-toolbar__btn:hover:not(:disabled) {
  background: #f1f5f9;
}

.display-style-form__style-group .rich-text-toolbar__btn--active {
  background: #e2e8f0;
  border-color: #e2e8f0;
}

.display-style-form__style-group .rich-text-toolbar__btn--active + .rich-text-toolbar__btn,
.display-style-form__style-group .rich-text-toolbar__btn + .rich-text-toolbar__btn--active {
  border-left-color: #cbd5e1;
}

.display-style-form__color-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  margin-left: auto;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  flex: 0 0 auto;
}

.display-style-form__color-control:hover {
  background: #f8fafc;
}

.display-style-form__color-swatch {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 4px;
  background: #000000;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.display-style-form__color-label {
  flex: 0 0 auto;
}

.display-style-form__color-chevron {
  display: inline-flex;
  color: #94a3b8;
}

.display-style-form__color-chevron svg {
  display: block;
}

.display-style-form__color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  opacity: 0;
  border: none;
  cursor: pointer;
}

.display-style-form__preview {
  margin-top: 0;
  padding: 8px 10px;
  border: 1px dashed #bbb;
  border-radius: 6px;
  background: #fff;
  line-height: 1.45;
  min-height: 2.5em;
  word-break: break-word;
  font-weight: normal;
  font-style: normal;
  text-decoration: none;
}

.display-style-form .schema-form__row {
  margin-bottom: 8px;
}

.display-style-form .schema-form__row:last-child {
  margin-bottom: 0;
}

.form-callout {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f8fafc;
  color: #64748b;
}

.form-callout__icon {
  flex: 0 0 auto;
  display: inline-flex;
  margin-top: 1px;
  color: #94a3b8;
}

.form-callout__icon svg {
  display: block;
}

.form-callout__text {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.color-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.color-field__label {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  line-height: 1.2;
}

.color-field__control {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.color-field__swatch {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
}

.color-field__swatch::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-field__swatch::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
}

.color-field__swatch::-moz-color-swatch {
  border: none;
  border-radius: 50%;
}

.color-field__hex {
  flex: 1 1 auto;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.field-highlight-form__colors {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.field-highlight-form__preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.field-highlight-form__preview-caption {
  font-size: 11px;
  font-weight: 500;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-highlight-form__preview-sample {
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
}

.field-highlight-form__preview-token {
  display: inline;
  padding: 0 1px;
  border-radius: 2px;
}

.field-highlight-form__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-highlight-form__options .schema-form__row {
  margin-bottom: 0;
}

.field-palette__title {
  font-weight: 600;
  font-size: 13px;
  margin-right: 4px;
}

.field-palette__hint {
  flex-basis: 100%;
  font-size: 12px;
  color: #456;
  font-style: italic;
}

.btn-palette {
  padding: 5px 12px;
  font-size: 12px;
  background: #fff;
  border: 1px solid #7a9;
  border-radius: 3px;
  cursor: pointer;
}

.btn-palette:hover {
  background: #f0f8ff;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.field-token--design {
  display: inline-flex;
  align-items: center;
  /* gap: 4px; */
  outline: 1px dashed #6699cc;
  /* outline-offset: 2px; */
  position: relative;
  /* padding: 2px 18px 2px 4px; */
  vertical-align: baseline;
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  cursor: pointer;
}

.field-token--design:hover {
  background-color: rgba(51, 136, 204, 0.08);
}

.field-token--design:active,
.field-token--design.field-token--dragging {
  cursor: grabbing;
}

/* Grip floats outside the label so it does not shift prose or steal text DnD. */
.field-token--design > .editor-drag-handle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translate(-100%, -50%);
  margin-right: 0;
}

.field-token--design.field-token--dragging > .editor-drag-handle,
.field-token--design > .editor-drag-handle:active {
  cursor: grabbing;
}

.field-token__thumb {
  -webkit-user-drag: none;
}

.document-section__body .vision-table .field-token--cell.field-token--design {
  font-size: var(--me-table-font-size);
  font-family: var(--me-document-font-family);
}

.field-token--design.field-token--image {
  align-items: flex-start;
}

.field-token--dragging {
  opacity: 0.55;
}

.field-token--selected {
  outline: 2px solid #3388cc;
  outline-offset: 2px;
}

.document-section__design-bar,
.template-block__toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 0 8px;
  border-bottom: 1px dashed #ddd;
  margin-bottom: 6px;
}

.template-block__type {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
}

.template-block__inline {
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  line-height: var(--me-document-line-height);
}

.modal--wide {
  width: min(560px, 94vw);
}

.modal--preview {
  width: min(1200px, 94vw);
  /* Fixed viewport so HTML / hide-empty / PDF do not resize the dialog. */
  height: min(90vh, 900px);
  max-height: min(90vh, 900px);
  display: flex;
  flex-direction: column;
}

.modal--field-mapping {
  width: min(1200px, 96vw);
  height: min(720px, 90vh);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-overlay--field-mapping-fullscreen {
  padding: 0;
  align-items: stretch;
}

.modal--field-mapping--fullscreen {
  width: 100vw !important;
  height: 100vh !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
  border-radius: 0;
}

.modal--field-mapping--fullscreen .field-mapping-modal__body {
  min-height: 0;
  flex: 1;
}

.modal--field-mapping .modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-mapping-modal__fullscreen {
  margin-left: auto;
  line-height: 1;
}

.modal--field-mapping .modal__body {
  overflow: hidden;
  flex: 1;
  min-height: 0;
  padding: 10px 14px;
}

.modal--field-mapping .field-mapping-modal__body {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 0;
  min-height: 420px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.field-mapping-panel {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--me-border-color, #ddd);
  border-radius: 4px;
  padding: 8px;
  background: var(--me-surface-muted, #fafafa);
  overflow: hidden;
}

.field-mapping-panel--source {
  flex-basis: 25%;
  width: 25%;
}

.field-mapping-panel--editor {
  flex-basis: 50%;
  width: 50%;
}

.field-mapping-panel--result {
  flex-basis: 25%;
  width: 25%;
}

.field-mapping-splitter {
  flex: 0 0 6px;
  width: 6px;
  min-width: 6px;
  align-self: stretch;
  cursor: col-resize;
  touch-action: none;
  background: var(--me-border-color, #ccc);
  transition: background 0.15s;
  margin: 0 2px;
  border-radius: 3px;
  z-index: 1;
}

.field-mapping-splitter:hover,
.field-mapping-splitter--active {
  background: var(--me-accent-color, #2563eb);
}

body.field-mapping-split-active {
  cursor: col-resize;
  user-select: none;
}

.field-mapping-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 600;
}

.field-mapping-panel__textarea {
  width: 100%;
  min-height: 120px;
  flex: 1;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.4;
}

.field-mapping-panel__textarea--expression {
  min-height: 180px;
}

.field-mapping-panel__preview,
.field-mapping-target__tree {
  flex: 1;
  min-height: 160px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
}

.field-mapping-tree {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
}

.field-mapping-tree__node {
  margin-left: 12px;
}

.field-mapping-tree__key,
.field-mapping-tree__leaf {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.field-mapping-tree__key:hover,
.field-mapping-tree__leaf:hover {
  text-decoration: underline;
}

.field-mapping-source-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.field-mapping-source-toolbar .modal__search {
  flex: 1;
  min-width: 0;
}

.field-mapping-source-expand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.field-mapping-schema {
  flex: 1;
  min-height: 200px;
  overflow: auto;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
}

.field-mapping-schema > .field-mapping-schema__node {
  margin-left: 0;
}

.field-mapping-schema__node {
  margin-left: 10px;
}

.field-mapping-schema__row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0;
}

.field-mapping-schema__toggle {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 10px;
  color: #555;
  cursor: pointer;
}

.field-mapping-schema__toggle--leaf {
  visibility: hidden;
  pointer-events: none;
}

/* Class-based collapse (LWS-safe). Do not rely on [hidden] — Locker strips it from innerHTML. */
.field-mapping-schema__children--collapsed {
  display: none;
}

.field-mapping-schema__drag {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--me-surface-muted, #f5f5f5);
  padding: 4px 8px;
  cursor: grab;
  font: inherit;
  text-align: left;
}

.field-mapping-schema__drag:hover,
.field-mapping-schema__drag--active {
  border-color: var(--me-accent-color, #2563eb);
  background: #eef4ff;
}

.field-mapping-schema__key {
  font-weight: 600;
}

.field-mapping-schema__type {
  color: #666;
  font-size: 11px;
  text-transform: uppercase;
}

.field-mapping-editor-mount {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
}

.field-mapping-editor-holder {
  min-height: 240px;
}

.field-mapping-editor-holder .editor-top-chrome {
  display: none;
}

.document-section--mapping .document-section__body {
  cursor: default;
}

.field-token--mapping-drop {
  outline: 2px dashed var(--me-accent-color, #2563eb);
  outline-offset: 2px;
}

.field-token--mapped {
  box-shadow: inset 0 0 0 1px var(--me-accent-color, #2563eb);
  cursor: pointer;
}

.field-token__mapping-badge {
  margin-left: 4px;
  font-size: 10px;
  color: var(--me-accent-color, #2563eb);
  vertical-align: super;
}

.field-mapping-panel__textarea--compact {
  min-height: 72px;
}

.field-mapping-panel__textarea--result {
  min-height: 160px;
  flex: 1;
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
  resize: none;
  overflow: auto;
  background: #fff;
  color: inherit;
  caret-color: var(--me-text, #1a1a1a);
}

.field-mapping-result-editor {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.field-mapping-result-editor--highlighted .field-mapping-panel__textarea--result {
  background: transparent;
  color: transparent;
}

.field-mapping-result-highlight {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: auto;
  pointer-events: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.4;
  color: var(--me-text, #1a1a1a);
  background: #fff;
}

.field-mapping-result-highlight__mark {
  color: inherit;
  border-radius: 2px;
}

.field-mapping-result-highlight__mark--warning {
  background: rgba(220, 38, 38, 0.12);
  text-decoration: underline wavy #dc2626;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
}

.field-mapping-result-highlight__mark--error {
  background: rgba(176, 0, 32, 0.16);
  text-decoration: underline wavy #b00020;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
}

.field-mapping-path-helper {
  position: fixed;
  z-index: 10050;
  min-width: 200px;
  max-width: 320px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--me-border-color, #ddd);
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.field-mapping-path-helper__header {
  padding: 6px 8px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #888;
  border-bottom: 1px solid var(--me-border-color, #eee);
}

.field-mapping-path-helper__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 6px 8px;
  font: inherit;
  cursor: pointer;
}

.field-mapping-path-helper__item:hover,
.field-mapping-path-helper__item--active {
  background: #eef4ff;
}

.field-mapping-path-helper__key {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-mapping-path-helper__type {
  flex: 0 0 auto;
  font-size: 10px;
  color: #888;
  text-transform: lowercase;
}

.field-mapping-source-json summary,
.field-mapping-resolved summary {
  cursor: pointer;
  margin: 8px 0 4px;
  font-size: 12px;
}

.field-mapping-panel__preview--resolved {
  min-height: 120px;
}

.field-mapping-target summary {
  cursor: pointer;
  margin: 8px 0 4px;
}

@media (max-width: 960px) {
  .modal--field-mapping .field-mapping-modal__body {
    flex-direction: column;
    overflow: auto;
  }

  .field-mapping-splitter {
    display: none;
  }

  .field-mapping-panel--source,
  .field-mapping-panel--editor,
  .field-mapping-panel--result {
    flex: 1 1 auto !important;
    width: 100% !important;
  }
}

.preview-modal__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.preview-modal__body--html {
  display: flex;
  flex-direction: column;
  background: #fff;
}

.preview-modal__body--pdf {
  display: flex;
  flex-direction: column;
  background: #525659;
}

.preview-modal__html {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px;
}

.preview-modal__sheet {
  width: min(100%, var(--doc-page-content-width, 180mm));
  max-width: min(100%, var(--doc-page-content-width, 180mm));
  margin: 0 auto;
  box-sizing: border-box;
  background: #fff;
}

.preview-modal__html .preview-document {
  width: 100%;
  max-width: 100%;
  margin: 0;
}

.preview-modal__loading {
  margin: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 20px;
  text-align: center;
  font-size: 14px;
  color: #555;
  background: #fff;
}

.preview-modal__loading-title {
  margin: 0;
}

.preview-modal__loading-hint {
  margin: 0;
  max-width: 28rem;
  font-size: 13px;
  line-height: 1.4;
  color: #777;
}

.preview-modal__loading--error {
  color: #a00;
}

.preview-modal__loading--error .preview-modal__loading-hint {
  color: #a00;
}

.preview-modal__pdf {
  display: block;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  height: 100%;
  border: none;
  background: #525659;
}

.preview-modal__pdf--canvas {
  overflow: auto;
  box-sizing: border-box;
}

.preview-pdf-export {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: #fff;
  overflow: auto;
  padding: 20mm;
  opacity: 1;
  pointer-events: none;
}

.preview-pdf-export__status {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 1;
  padding: 8px 12px;
  font-size: 13px;
  background: #f5f5f5;
  border: 1px solid #ccc;
  border-radius: 4px;
  color: #333;
}

.preview-pdf-export__sheet {
  width: var(--doc-page-content-width, 180mm);
  max-width: var(--doc-page-content-width, 180mm);
  margin: 0 auto;
  background: #fff;
  color: #000;
}

.preview-document__image-fallback {
  font-style: italic;
  color: #444;
}

.preview-document--pdf {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0;
  background: #fff;
  color: #000;
}

.preview-document__title {
  font-family: var(--me-document-font-family);
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 1em;
  color: #000;
}

.preview-modal__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.preview-modal__footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-modal__option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  user-select: none;
  margin-right: 4px;
}

.preview-modal__option input {
  margin: 0;
  cursor: pointer;
}

.preview-modal__pdf-hint {
  font-size: 12px;
  color: #706e6b;
  max-width: 22rem;
  line-height: 1.35;
}

.preview-modal__save.btn-icon,
.preview-modal__share.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  width: 28px;
  height: 28px;
  padding: 0;
}

.preview-modal__save.btn-icon svg,
.preview-modal__share.btn-icon svg {
  width: 16px;
  height: 16px;
}

.preview-document {
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  line-height: var(--me-document-line-height);
  color: #000;
}

.preview-document__section-wrap {
  margin-bottom: 1em;
}

.preview-document__section {
  outline: none;
  min-height: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.preview-document .document-columns__col {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
}

.preview-document .document-table,
.preview-document .vision-table-block,
.preview-document .preview-document__block {
  display: block;
  width: 100%;
  min-width: 100%;
  max-width: 100%;
  white-space: normal;
}

.preview-document .vision-table {
  display: table;
  width: 100%;
  min-width: 100%;
  max-width: none;
  table-layout: fixed;
  border-collapse: collapse;
  white-space: normal;
}

.preview-document .vision-table th {
  font-family: var(--me-document-font-family);
  font-size: var(--me-document-font-size);
  font-weight: var(--me-document-font-weight);
  color: inherit;
  text-transform: none;
  letter-spacing: normal;
  text-align: center;
}

.preview-document .vision-table .field-token--cell {
  font-family: var(--me-document-font-family);
  font-size: var(--me-table-font-size);
  font-weight: normal;
}

.preview-document .vision-table th,
.preview-document .vision-table td {
  overflow: visible;
  white-space: normal;
}

.preview-document .vision-table--borderless th,
.preview-document .vision-table--borderless td {
  border: none;
}

.preview-document__block {
  margin-bottom: 1em;
}

.preview-document__line {
  margin-bottom: 0.5em;
}

.preview-document__empty {
  color: #666;
  font-style: italic;
  margin: 0;
}

.preview-document .field-token--preview:not(.field-token--image) {
  color: #000;
  text-decoration: none;
  cursor: default;
  font-style: normal;
}

.preview-document--hide-empty .field-token--preview.field-token--empty:not(.field-token--required-missing) {
  display: none;
}

.preview-document:not(.preview-document--hide-empty) .field-token--preview.field-token--empty:not(.field-token--repeater),
.preview-document .field-token--preview.field-token--required-missing {
  color: #888;
  font-style: italic;
}

.preview-document .field-token--preview.field-token--image {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  margin: 0.5em 0;
  padding: 0;
  clear: both;
}

.preview-document .document-align--center > .field-token--preview.field-token--image {
  margin-inline: auto;
}

.preview-document .document-align--right > .field-token--preview.field-token--image {
  margin-inline-start: auto;
  margin-inline-end: 0;
}

.preview-document .document-align--left > .field-token--preview.field-token--image {
  margin-inline-start: 0;
  margin-inline-end: auto;
}

.schema-form__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.schema-form__row span {
  font-size: 12px;
  color: #555;
}

.schema-form__row input,
.schema-form__row select {
  padding: 6px 8px;
  border: 1px solid #aaa;
  border-radius: 2px;
}

.schema-form__row input[readonly] {
  background: #f5f5f5;
  color: #666;
}

.schema-form__row--checkbox {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.schema-form__row--checkbox input[type="checkbox"] {
  width: auto;
  flex: 0 0 auto;
}

.schema-form__row--actions {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.schema-form__subtitle {
  font-weight: 600;
  margin: 12px 0 8px;
}

.schema-items__row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.schema-items__row input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #aaa;
}

.schema-items__row.is-dragging {
  opacity: 0.45;
}

.schema-items__row.is-drop-before {
  box-shadow: inset 0 2px 0 0 #2563eb;
}

.schema-items__row.is-drop-after {
  box-shadow: inset 0 -2px 0 0 #2563eb;
}

.btn-icon {
  background: none;
  border: 1px solid #ccc;
  border-radius: 2px;
  cursor: pointer;
  padding: 2px 8px;
}

.schema-tree__row .btn-icon {
  padding: 2px 6px;
  min-width: 26px;
}

.schema-tree__node.is-dragging {
  opacity: 0.45;
}

.schema-tree__node.is-drop-before > .schema-tree__row {
  box-shadow: inset 0 2px 0 0 #2563eb;
}

.schema-tree__node.is-drop-after > .schema-tree__row {
  box-shadow: inset 0 -2px 0 0 #2563eb;
}

.schema-tree__node.is-drop-child > .schema-tree__row,
.schema-tree__children.is-drop-target {
  background: #eff6ff;
  outline: 1px dashed #2563eb;
  border-radius: 2px;
}

.schema-tree__children.is-drop-target {
  min-height: 20px;
}

.schema-tree__row {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.schema-tree-root .schema-tree {
  margin-left: 0;
}

.schema-tree-scroll {
  max-height: min(45vh, 360px);
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 6px 8px;
  margin-bottom: 8px;
  background: #fafafa;
}

.schema-tree-scroll--modal {
  max-height: min(60vh, 520px);
}

.schema-designer-launch {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 4px;
}

.schema-designer-launch__summary {
  margin: 0;
}

.modal--schema-designer .schema-items-designer-modal__body {
  min-height: 240px;
}

.schema-items-designer-modal__footer {
  justify-content: flex-start;
}

.schema-items-designer-modal__footer-spacer {
  flex: 1;
}

.schema-items-designer-modal__error {
  margin: 0 14px 8px;
}

.schema-tree__children {
  margin-left: 16px;
}

.schema-tree-root .btn-sm {
  margin-top: 8px;
}

.schema-tree__row input {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid #aaa;
}

.schema-form__hint {
  font-size: 12px;
  color: #666;
  font-style: italic;
}

.schema-form__hint--error {
  color: #b42318;
  font-style: normal;
}

.formula-field-picker {
  margin-top: 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px;
  background: #fafafa;
}

.formula-field-picker__search {
  width: 100%;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.formula-field-picker__tree {
  max-height: 180px;
  overflow: auto;
  margin-bottom: 8px;
}

.formula-field-picker__summary {
  cursor: pointer;
  font-weight: 500;
}

.formula-field-picker__children {
  margin-left: 12px;
}

.formula-field-picker__leaf {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 4px;
}

.formula-field-picker__leaf:hover {
  background: #e8f0fe;
}

.formula-field-picker__functions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.formula-field-picker__functions-label {
  font-size: 12px;
  color: #666;
}

.formula-field-picker__fn {
  min-width: 3.5em;
}

.schema-form__row--stacked {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.collection-tree-picker {
  margin-top: 4px;
  border: 1px solid var(--me-border-color, #ddd);
  border-radius: 6px;
  padding: 8px;
  background: var(--me-surface-muted, #fafafa);
}

.collection-tree-picker__selected {
  font-size: 12px;
  color: var(--me-text-muted, #555);
  margin-bottom: 8px;
}

.collection-tree-picker__search {
  width: 100%;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.collection-tree-picker__bookmarks {
  margin-bottom: 8px;
}

.collection-tree-picker__bookmarks-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--me-text-muted, #666);
  margin-bottom: 4px;
}

.collection-tree-picker__bookmarks-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.collection-tree-picker__bookmark-chip {
  border: 1px solid var(--me-border-color, #d0d7de);
  background: #fff;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}

.collection-tree-picker__bookmark-chip--selected {
  border-color: var(--me-primary, #2563eb);
  background: #eff6ff;
}

.collection-tree-picker__tree {
  max-height: 220px;
  overflow: auto;
}

.collection-tree-picker__summary {
  cursor: pointer;
  font-weight: 500;
  list-style-position: outside;
}

.collection-tree-picker__collection-select {
  display: inline;
  border: none;
  background: transparent;
  padding: 2px 4px;
  margin: 0;
  font: inherit;
  font-weight: 500;
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
}

.collection-tree-picker__collection-select:hover {
  background: #e8f0fe;
}

.collection-tree-picker__collection-select--selected {
  background: #dbeafe;
}

.collection-tree-picker__children {
  margin-left: 12px;
}

.collection-tree-picker__leaf-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.collection-tree-picker__leaf-row--selected .collection-tree-picker__leaf {
  background: #dbeafe;
}

.collection-tree-picker__leaf {
  flex: 1 1 auto;
  display: block;
  text-align: left;
  border: none;
  background: transparent;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 4px;
}

.collection-tree-picker__leaf:hover {
  background: #e8f0fe;
}

.collection-tree-picker__leaf-row--preset {
  padding-left: 4px;
}

.collection-tree-picker__preset-icon {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 1;
}

.collection-tree-picker__leaf--preset {
  font-size: 12px;
}

.collection-tree-picker__summary--selected {
  background: #dbeafe;
  border-radius: 4px;
}

.collection-tree-picker__highlight {
  background: #fef08a;
  padding: 0;
}

.app-notifications {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

.app-notification {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: auto;
}

.app-notification--visible {
  opacity: 1;
  transform: translateY(0);
}

.app-notification--leaving {
  opacity: 0;
  transform: translateY(-8px);
}

.app-notification--error {
  background: #fff3f3;
  border: 1px solid #e0a0a0;
  color: #7a1f1f;
}

.app-notification__message {
  margin: 0;
  flex: 1;
  line-height: 1.4;
}

.app-notification__close {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 20px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
  opacity: 0.7;
}

.app-notification__close:hover {
  opacity: 1;
}

/* Fill mode — paper window from Page Setup (format + orientation), +10% via CSS vars */
.page.page--fill-page,
.page:has(.editor-holder--fill-page),
.doc-shell.doc-shell--fill-page,
.doc-shell:has(.editor-holder--fill-page) {
  max-width: min(100%, calc(var(--doc-page-width, 231mm) + 4rem));
  margin-inline: auto;
  width: 100%;
}

.design-panel__editor-scroll--fill-page,
.design-shell:not(.design-shell--active)
  .design-panel__editor-scroll:has(.editor-holder--fill-page) {
  background: var(--me-surface-100, #ececec);
}

.editor-holder.editor-holder--fill-page,
.doc-shell .editor-root.editor-holder--fill-page,
.editor-holder.editor-holder--fill-page.doc-editor-host__surface {
  background: var(--me-surface-100, #ececec);
  box-shadow: none;
  border-radius: 0;
  padding: 16px 12px 24px;
  box-sizing: border-box;
}

.editor-holder--fill-page > .codex-editor,
.editor-holder--fill-page .codex-editor,
.doc-shell .editor-holder--fill-page .codex-editor {
  width: min(100%, var(--doc-page-width, 231mm));
  max-width: var(--doc-page-width, 231mm);
  min-height: var(--doc-page-min-height, 326.7mm);
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
  padding: var(--doc-page-margin, 16.5mm);
  background: var(--me-surface-0, #fff);
  border: 1px solid var(--me-border-strong, #999);
  border-radius: 2px;
  box-shadow: 0 4px 24px rgb(15 23 42 / 0.12);
}

.editor-holder--fill-page .codex-editor__redactor,
.doc-shell .editor-holder--fill-page .codex-editor__redactor {
  padding: 0 !important;
}


/**
 * Document editor theme bridge — shared design tokens and modern UI overrides.
 *
 * Import after @docengine/editor/styles.css, then optionally load a host
 * adapter (prime.css or slds.css) to map tokens to your design system.
 *
 *   import '@docengine/editor/styles.css';
 *   import '@docengine/editor/themes/bridge.css';
 */

:root {
  /* Spacing */
  --me-space-1: 4px;
  --me-space-2: 8px;
  --me-space-3: 12px;
  --me-space-4: 16px;
  --me-space-5: 24px;

  /* Brand */
  --me-primary: #2563eb;
  --me-primary-hover: #1d4ed8;
  --me-primary-contrast: #fff;
  --me-primary-muted: #1e40af;

  /* Surfaces */
  --me-surface-0: #ffffff;
  --me-surface-50: #f8fafc;
  --me-surface-100: #f1f5f9;
  --me-surface-200: #f1f5f9;
  --me-surface-300: #e2e8f0;
  --me-surface-muted: #f8fafc;

  /* Borders */
  --me-border: #e2e8f0;
  --me-border-strong: #cbd5e1;
  --me-border-input: #e2e8f0;
  --me-border-subtle: #f1f5f9;

  /* Text */
  --me-text: #0f172a;
  --me-text-body: #1e293b;
  --me-text-muted: #64748b;
  --me-text-subtle: #64748b;
  --me-text-placeholder: #94a3b8;
  --me-text-link: #1d4ed8;

  /* Accent panels */
  --me-accent-surface: #eff6ff;
  --me-accent-border: #bfdbfe;
  --me-accent-hover: #dbeafe;
  --me-accent-hover-border: #93c5fd;
  --me-accent-panel: #f8fafc;

  /* Focus / selection / drag */
  --me-focus-color: var(--me-primary);
  --me-focus-ring: 0 0 0 2px color-mix(in srgb, var(--me-primary) 30%, transparent);
  --me-selection-outline: #2563eb;
  --me-selection-bg: #eff6ff;
  --me-drop-indicator: #2563eb;

  /* Semantic */
  --me-danger: #c44;
  --me-danger-strong: #b00020;
  --me-danger-bg: #fee;
  --me-danger-surface: #fff3f3;
  --me-danger-border: #e0a0a0;
  --me-warning: #f59e0b;
  --me-warning-bg: #fffbeb;
  --me-warning-outline: #f59e0b;
  --me-success-outline: #3a7;
  --me-highlight: #fff3b0;
  --me-search-highlight: #fff3a0;

  /* Field state semantics */
  --me-field-optional-color: #94a3b8;
  --me-field-optional-bg: transparent;
  --me-field-missing-color: #b45309;
  --me-field-missing-bg: #fffbeb;
  --me-field-missing-outline: #f59e0b;
  --me-field-filled-color: #1e293b;
  --me-field-inert-color: #64748b;
  --me-field-active-outline: #2563eb;
  --me-field-fill-color: var(--me-field-optional-color);
  --me-field-fill-bg: var(--me-field-optional-bg);
  --me-field-fill-font-weight: 500;
  --me-field-fill-border-width: 0;

  /* Design-mode structural chrome */
  --me-design-outline: #93c5fd;
  --me-design-outline-faint: rgba(147, 197, 253, 0.15);

  /* Document typography */
  --me-document-font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --me-document-font-size: 16px;
  --me-document-font-weight: 400;
  --me-document-line-height: 1.65;
  --me-table-font-size: 14px;

  /* Typography */
  --me-font-family: var(--me-document-font-family);
  --me-font-family-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --me-font-size: 13px;
  --me-font-size-sm: 12px;
  --me-font-size-xs: 11px;

  /* Layout */
  --me-radius-sm: 6px;
  --me-radius-md: 6px;
  --me-overlay-z-index: 10000;
  --me-shadow-modal: 0 8px 24px rgb(0 0 0 / 0.12);
  --me-shadow-sticky: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
}

/* ── Unified typography ─────────────────────────────────────────────────── */

.design-shell,
.design-shell .field-palette,
.design-shell .properties-panel,
.editor-top-chrome,
.rich-text-toolbar,
.modal {
  font-family: var(--me-document-font-family);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */

.btn,
.btn-palette,
.btn-pick {
  font-family: var(--me-font-family);
  font-size: var(--me-font-size);
  border-radius: var(--me-radius-sm);
  border: 1px solid var(--me-border-strong);
  background: var(--me-surface-200);
  color: var(--me-text-body);
}

.btn[hidden],
.btn-palette[hidden],
.btn-pick[hidden] {
  display: none !important;
}

.btn-primary {
  background: var(--me-primary);
  border-color: var(--me-primary-hover);
  color: var(--me-primary-contrast);
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.btn-primary:hover {
  background: var(--me-primary-hover);
}

.btn-secondary:hover,
.btn-pick:hover {
  background: var(--me-surface-300);
}

.btn-palette {
  background: var(--me-surface-0);
  border-color: var(--me-accent-hover-border);
}

.btn-palette:hover {
  background: var(--me-accent-hover);
  border-color: var(--me-accent-hover-border);
}

.btn-pick {
  background: var(--me-surface-300);
  border-color: var(--me-border-input);
}

/* ── Document sections ─────────────────────────────────────────────────── */

.document-section__header {
  font-family: var(--me-font-family);
  color: var(--me-text);
  border-bottom-color: var(--me-border);
}

.document-section__name-input {
  border-color: var(--me-border);
  color: var(--me-text-muted);
  background: var(--me-surface-muted);
}

.document-section__name-input:focus {
  border-color: var(--me-focus-color);
  background: var(--me-surface-0);
  box-shadow: var(--me-focus-ring);
}

.document-section--selected .document-section__header {
  color: var(--me-primary-muted);
  border-bottom-color: var(--me-focus-color);
}

.document-section__header--selectable:hover {
  color: var(--me-focus-color);
}

.document-section__label-text--placeholder {
  color: var(--me-text-placeholder);
}

.document-section__collapse-btn {
  border-color: var(--me-border-strong);
  background: var(--me-surface-100);
  color: var(--me-text-body);
}

.document-section__collapse-btn:hover {
  background: var(--me-surface-300);
  border-color: var(--me-border-strong);
}

/* ── Field tokens (fill mode) ─────────────────────────────────────────── */

.field-token {
  color: var(--me-text-link);
}

.field-token--empty {
  color: var(--me-text-link);
}

.field-token--required {
  outline-color: var(--me-warning-outline);
}

.field-token--required-missing {
  background: var(--me-warning-bg);
  outline-color: var(--me-warning);
}

.field-token--required-missing.field-token--empty {
  color: var(--me-field-missing-color);
}

.field-token--computed {
  color: var(--me-text-body);
}

.field-token--readonly {
  color: var(--me-text-body);
}

.field-token--repeater {
  border-color: #d8e8f4;
  background: #f8fbfd;
}

.field-token__repeater-instance-title {
  color: #2f6b9a;
}

.field-token__repeater-instance-empty,
.field-token__caption {
  color: var(--me-text-placeholder);
}

.field-token__thumb {
  border-color: var(--me-border);
}

.editor-holder--show-fields .field-token:not(.field-token--design) {
  text-decoration: none;
  padding: 1px var(--me-space-2);
  border-radius: var(--me-radius-sm);
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.editor-holder--show-fields .field-token:not(.field-token--design):not(.field-token--empty) {
  color: var(--me-field-filled-color);
  font-style: normal;
  background: transparent;
}

.editor-holder--show-fields .document-section__body .field-token:not(.field-token--design):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--required-missing),
.editor-holder--show-fields .vision-table .field-token--cell:not(.field-token--design):not(.field-token--computed):not(.field-token--readonly):not(.field-token--required-missing) {
  text-decoration: none;
  cursor: pointer;
}

.editor-holder--show-fields .document-section__body .field-token:not(.field-token--design).field-token--empty:not(.field-token--required-missing):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--html),
.editor-holder--show-fields .vision-table .field-token--cell:not(.field-token--design).field-token--empty:not(.field-token--readonly):not(.field-token--required-missing),
.document-section__body .field-token--design.field-token--empty:not(.field-token--required-missing):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--html),
.vision-table .field-token--cell.field-token--design.field-token--empty:not(.field-token--readonly):not(.field-token--required-missing),
.document-section--mapping .document-section__body .field-token.field-token--empty:not(.field-token--required-missing):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--html),
.document-section--mapping .vision-table .field-token--cell.field-token--empty:not(.field-token--readonly):not(.field-token--required-missing) {
  background: var(--me-field-fill-bg);
  color: var(--me-field-fill-color);
  font-weight: var(--me-field-fill-font-weight);
  font-style: italic;
}

.editor-holder--show-fields .document-section__body .field-token:not(.field-token--design).field-token--required-missing,
.editor-holder--show-fields .vision-table .field-token--cell:not(.field-token--design).field-token--required-missing {
  color: var(--me-field-missing-color);
  background: var(--me-field-missing-bg);
  outline: 1px solid var(--me-field-missing-outline);
  outline-offset: 0;
  font-style: normal;
  font-weight: 600;
  text-decoration: none;
}

.editor-holder--show-fields .field-token--computed,
.editor-holder--show-fields .field-token--readonly {
  color: var(--me-field-inert-color);
  background: transparent;
}

.field-token--focused:not(.field-token--design),
.editor-holder--show-fields .field-token--active:not(.field-token--design) {
  outline: 2px solid var(--me-field-active-outline);
  outline-offset: 1px;
}

.editor-holder--show-fields .field-token:not(.field-token--design):not(.field-token--computed):not(.field-token--readonly):hover {
  background: #eff6ff;
}

/* Filled values render as ultra-light rounded pills (e.g. OD/OS → "Hyperemia"). */
.editor-holder--show-fields .field-token:not(.field-token--design):not(.field-token--empty):not(.field-token--computed):not(.field-token--readonly):not(.field-token--repeater):not(.field-token--image):not(.field-token--html):not(.field-token--required-missing) {
  background-color: var(--me-surface-200, #f1f5f9);
  color: var(--me-text-body, #1e293b);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.95em;
}

/* HTML tokens are multi-line blocks — one light surface, not per-line pills. */
.editor-holder--show-fields .field-token--html:not(.field-token--design):not(.field-token--empty):not(.field-token--required-missing) {
  background-color: var(--me-surface-200, #f1f5f9);
  color: var(--me-text-body, #1e293b);
  padding: 4px 8px;
  border-radius: 4px;
}

/* ── Rich text toolbar ─────────────────────────────────────────────────── */

.editor-top-chrome--sticky {
  background: var(--me-surface-50);
  box-shadow: none;
}

.rich-text-toolbar {
  background: var(--me-surface-0);
  border-color: var(--me-border);
  border-radius: var(--me-radius-sm);
}

.rich-text-toolbar--field-style {
  background: var(--me-accent-surface);
  border-color: var(--me-accent-border);
}

.rich-text-toolbar__btn--active {
  background: var(--me-accent-hover);
  border-color: var(--me-focus-color);
}

.rich-text-toolbar__btn {
  border-color: var(--me-border-strong);
  background: var(--me-surface-0);
  border-radius: var(--me-radius-sm);
  font-family: var(--me-font-family);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.rich-text-toolbar__preview {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  margin-right: 0.5rem;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  border: 1px solid var(--me-accent-hover-border);
  border-radius: var(--me-radius-sm);
  background: var(--me-accent-surface);
  color: var(--me-primary-muted);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.rich-text-toolbar__preview[hidden] {
  display: none !important;
}

.rich-text-toolbar__preview svg {
  flex-shrink: 0;
}

.rich-text-toolbar__preview:hover:not(:disabled) {
  background: var(--me-accent-hover);
  border-color: var(--me-primary);
  color: var(--me-primary);
}

.rich-text-toolbar__preview:disabled {
  opacity: 0.55;
  cursor: default;
}

.rich-text-toolbar__btn:hover:not(:disabled) {
  background: var(--me-surface-100);
}

.rich-text-toolbar__hint,
.rich-text-toolbar__title,
.rich-text-toolbar__label {
  color: var(--me-text-muted);
  font-weight: 500;
}

.rich-text-toolbar__input,
.rich-text-toolbar__select {
  border: 1px solid var(--me-border-input);
  border-radius: var(--me-radius-sm);
  background: var(--me-surface-0);
  font-family: var(--me-font-family);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.rich-text-toolbar__input:focus,
.rich-text-toolbar__select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.rich-text-toolbar__font-group,
.rich-text-toolbar__align-group,
.rich-text-toolbar__heading-group {
  border-left-color: var(--me-border);
}

/* ── Field palette ─────────────────────────────────────────────────────── */

.field-palette {
  background: var(--me-accent-surface);
  border-color: var(--me-accent-border);
  border-radius: var(--me-radius-md);
}

.field-palette__group-title {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: none;
  color: var(--me-text-muted);
}

.field-palette__item {
  font-family: var(--me-font-family);
  font-weight: 500;
  font-size: 13px;
  color: var(--me-text);
  background: var(--me-surface-0);
  border: 1px solid var(--me-border);
  border-radius: var(--me-radius-sm);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.field-palette__item:hover {
  background: var(--me-accent-hover);
  border-color: var(--me-accent-hover-border);
}

.field-palette__item-label {
  font-weight: 500;
}

.field-palette__hint {
  color: var(--me-text-muted);
  font-style: normal;
}

.field-palette--vertical {
  background: transparent;
}

.field-palette__header {
  border-color: var(--me-border);
  background: var(--me-surface-100);
}

.field-palette__footer {
  border-color: var(--me-border);
  background: var(--me-surface-100);
}

.field-palette--vertical .field-palette__title {
  font-weight: 600;
  color: var(--me-text);
}

.field-palette__body {
  background: var(--me-surface-100);
}

.design-panel--left .field-palette--vertical {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  max-height: none;
}

/* ── Design shell (panels layout) ──────────────────────────────────────── */

/*
 * Salesforce/LWC embed: the standalone app owns the viewport and uses
 * `body.design-mode--panels { height:100vh; overflow:hidden }` plus a `.page`
 * wrapper for shell height. Inside a Lightning record page there is no `.page`
 * ancestor and hijacking the body breaks the whole layout — so bound the shell
 * to its own container and neutralize the page-wide body rules.
 */
body.design-mode--panels {
  overflow: visible;
  height: auto;
}

/* Restore viewport lock only for standalone `.page` hosts (demos), not LWC. */
body:has(.page > .design-shell--active),
body:has(.page > .design-shell:not(.design-shell--active)) {
  overflow: hidden;
  height: 100vh;
}

.design-shell--active {
  background: var(--me-surface-100);
  border: none;
  border-radius: var(--me-radius-md);
  height: min(80vh, 960px);
  min-height: 540px;
}

.design-panel--left {
  border-right: 1px solid var(--me-border);
  background: var(--me-surface-100);
}

.design-panel--right {
  border-left: 1px solid var(--me-border);
  background: var(--me-surface-100);
}

.design-panel--center {
  background: var(--me-surface-100);
  padding: var(--me-space-4);
}

.design-panel {
  background: var(--me-surface-100);
}

.design-panel__editor-scroll {
  border: none;
  border-radius: var(--me-radius-md);
  box-shadow: var(--me-shadow-sticky);
  /* Document paper stays light even when chrome is dark. */
  background: #ffffff;
}

.design-panel__editor-scroll .editor-holder,
.design-panel--center .editor-holder {
  background: #ffffff;
  box-shadow: none;
}

/* ── Properties panel ───────────────────────────────────────────────────── */

.properties-panel {
  background: var(--me-surface-100);
  color: var(--me-text);
}

.properties-panel__header {
  border-color: var(--me-border);
  background: var(--me-surface-100);
}

.properties-panel__body {
  background: var(--me-surface-100);
}

.properties-panel__title {
  font-weight: 600;
  color: var(--me-text);
}

.properties-panel__subtitle {
  text-transform: none;
  letter-spacing: normal;
  color: var(--me-text-muted);
  font-weight: 500;
}

.properties-panel__empty {
  color: var(--me-text-muted);
}

.properties-panel__field-id {
  color: var(--me-text-muted);
  font-family: var(--me-font-family-mono);
}

.display-style-form {
  border: 1px solid var(--me-border);
  border-radius: var(--me-radius-sm);
  background: var(--me-surface-0);
}

.display-style-form__legend {
  color: var(--me-text-body);
}

.display-style-form__style-group {
  border-color: var(--me-border);
  background: var(--me-surface-0);
  border-radius: var(--me-radius-sm);
}

.display-style-form__style-group .rich-text-toolbar__btn {
  border-radius: 0;
  background: transparent;
}

.display-style-form__style-group .rich-text-toolbar__btn + .rich-text-toolbar__btn {
  border-left-color: var(--me-border);
}

.display-style-form__style-group .rich-text-toolbar__btn:hover:not(:disabled) {
  background: var(--me-surface-100);
}

.display-style-form__style-group .rich-text-toolbar__btn--active {
  background: var(--me-surface-300);
  border-color: var(--me-border);
}

.display-style-form__color-control {
  border-color: var(--me-border);
  background: var(--me-surface-0);
  color: var(--me-text-body);
  border-radius: var(--me-radius-sm);
  font-family: var(--me-font-family);
}

.display-style-form__color-control:hover {
  background: var(--me-surface-100);
}

.display-style-form__color-chevron {
  color: var(--me-text-subtle, #94a3b8);
}

.display-style-form__preview,
.field-highlight-form__preview {
  border: 1px solid var(--me-border);
  border-radius: var(--me-radius-sm);
  background: var(--me-surface-0);
  color: var(--me-text-body);
}

.display-style-form__reset {
  color: var(--me-text-muted);
}

.display-style-form__reset:hover {
  background: var(--me-surface-200);
  color: var(--me-text-body);
}

.form-callout {
  background: var(--me-surface-100, #f8fafc);
  color: var(--me-text-muted, #64748b);
}

.form-callout__icon {
  color: var(--me-text-subtle, #94a3b8);
}

.color-field__label {
  color: var(--me-text-muted, #64748b);
}

.color-field__swatch {
  border-color: var(--me-border-input, #cbd5e1);
}

.properties-panel input:not([type='checkbox']):not([type='color']),
.properties-panel select,
.properties-panel textarea,
.properties-panel .schema-form__row input:not([type='checkbox']):not([type='color']),
.properties-panel .schema-form__row select,
.properties-panel .schema-form__row textarea,
.properties-panel .display-style-form input:not([type='checkbox']):not([type='color']),
.properties-panel .display-style-form select,
.properties-panel .field-highlight-form input:not([type='checkbox']):not([type='color']),
.properties-panel .color-field__hex {
  padding: 8px 12px;
  border: 1px solid var(--me-border-input, #cbd5e1);
  border-radius: 6px;
  background: var(--me-surface-0, #fff);
  color: var(--me-text-body);
  font-family: var(--me-font-family);
  font-size: 13px;
  line-height: 1.4;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.properties-panel .color-field__hex {
  padding: 6px 10px;
  font-family: var(--me-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
}

.properties-panel input:not([type='checkbox']):not([type='color']):focus,
.properties-panel select:focus,
.properties-panel textarea:focus,
.properties-panel .schema-form__row input:not([type='checkbox']):not([type='color']):focus,
.properties-panel .schema-form__row select:focus,
.properties-panel .schema-form__row textarea:focus,
.properties-panel .display-style-form input:not([type='checkbox']):not([type='color']):focus,
.properties-panel .display-style-form select:focus,
.properties-panel .field-highlight-form input:not([type='checkbox']):not([type='color']):focus,
.properties-panel .color-field__hex:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.properties-panel input[readonly] {
  background: var(--me-surface-100, #f8fafc);
  color: var(--me-text-muted);
}

.properties-panel .schema-form__row--checkbox {
  cursor: pointer;
  user-select: none;
}

.properties-panel .schema-form__row--checkbox span {
  color: var(--me-text-body);
  font-size: 13px;
  font-weight: 500;
}

.properties-panel .schema-form__row--checkbox input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  width: 36px;
  height: 20px;
  margin: 0;
  flex: 0 0 auto;
  border: none;
  border-radius: 999px;
  background: #cbd5e1;
  cursor: pointer;
  position: relative;
  transition: background-color 0.2s ease;
}

.properties-panel .schema-form__row--checkbox input[type='checkbox']::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  transition: transform 0.2s ease;
}

.properties-panel .schema-form__row--checkbox input[type='checkbox']:hover {
  background: #94a3b8;
}

.properties-panel .schema-form__row--checkbox input[type='checkbox']:checked {
  background: #2563eb;
}

.properties-panel .schema-form__row--checkbox input[type='checkbox']:checked:hover {
  background: #1d4ed8;
}

.properties-panel .schema-form__row--checkbox input[type='checkbox']:checked::before {
  transform: translateX(16px);
}

.properties-panel .schema-form__row--checkbox input[type='checkbox']:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

/* ── Modals ────────────────────────────────────────────────────────────── */

.modal-overlay {
  z-index: var(--me-overlay-z-index);
}

/* Inside LightningModal / .doc-shell — cover the host, stay in focus trap */
.modal-overlay--contained {
  position: absolute;
  inset: 0;
  z-index: 30;
  /* Keep editor page color — no dim scrim over the document */
  background: transparent;
}

/* Field picker — command palette (Spotlight-style) */
.modal-overlay--palette {
  align-items: flex-start;
  justify-content: center;
  padding-top: min(12vh, 96px);
  background: rgba(15, 23, 42, 0.28);
}

/* Dim chrome (header/footer) while a field dialog covers the full Lightning shell. */
.modal-overlay--palette.modal-overlay--contained {
  background: rgba(15, 23, 42, 0.28);
  z-index: 100;
}

/* Document preview — fill the Lightning modal shell (not the narrow page column) */
.modal-overlay--contained.modal-overlay--preview {
  background: rgba(15, 23, 42, 0.35);
  z-index: 100;
  align-items: center;
  justify-content: center;
  padding: 1.25rem 1.5rem;
}

.modal-overlay--contained.modal-overlay--preview .modal--preview {
  width: min(960px, 94%);
  max-width: 960px;
  height: min(88%, 900px);
  max-height: 88%;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--me-field-fill-color, var(--me-primary));
  box-shadow: 0 16px 48px rgb(15 23 42 / 0.28);
}

.modal-overlay--contained.modal-overlay--preview .preview-modal__body {
  flex: 1 1 auto;
  min-height: 0;
}

.modal-overlay--contained.modal-overlay--preview .preview-modal__html .preview-document,
.modal-overlay--contained.modal-overlay--preview .preview-document--pdf {
  width: 100%;
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
}

.modal-overlay--contained.modal-overlay--preview .preview-modal__sheet {
  width: min(100%, var(--doc-page-content-width, var(--doc-page-width, 180mm)));
  max-width: min(100%, var(--doc-page-content-width, var(--doc-page-width, 180mm)));
}

.modal-overlay--palette.modal-overlay--contained .modal {
  border: 2px solid var(--me-field-fill-color);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--me-field-fill-color) 25%, transparent),
    0 12px 40px rgb(15 23 42 / 0.22);
}

.modal-overlay--palette .modal {
  border: 1px solid var(--me-border);
  box-shadow: var(--me-shadow-modal);
  animation: me-palette-drop 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes me-palette-drop {
  from {
    opacity: 0;
    transform: translateY(-14px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .modal-overlay--palette .modal {
    animation: none;
  }
}

.modal {
  font-family: var(--me-font-family);
  background: var(--me-surface-0);
  border-color: var(--me-border-strong);
  border-radius: var(--me-radius-md);
  box-shadow: var(--me-shadow-modal);
}

.modal__header {
  border-bottom-color: var(--me-border);
  background: var(--me-surface-200);
}

.schema-editor-modal__field-id {
  color: var(--me-text-muted);
  font-family: var(--me-font-family-mono);
}

.modal__search,
.modal__input,
.modal__textarea,
.modal__number {
  border-color: var(--me-border-input);
  border-radius: var(--me-radius-sm);
}

.modal__search:focus,
.modal__input:focus,
.modal__textarea:focus,
.modal__number:focus {
  border-color: var(--me-focus-color);
  box-shadow: var(--me-focus-ring);
  outline: none;
}

.modal__selection-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 8px;
  min-height: 0;
}

.modal__selection-panel {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--me-border-subtle);
}

.modal__selection-panel .modal__search {
  margin-bottom: 6px;
  padding: 8px 10px;
  border: 1px solid var(--me-border-input);
  border-radius: 6px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.modal__selection-panel .modal__search:hover {
  border-color: var(--me-accent-hover-border);
}

.modal__selection-panel .modal__search:focus {
  border-color: var(--me-focus-color);
  box-shadow: var(--me-focus-ring);
  outline: none;
}

.modal__selection-panel .modal__selection-pills {
  margin: 0 0 4px;
}

.modal__selection-panel .modal__status {
  margin: 4px 0 0;
}

.modal__selection-pills {
  gap: 0;
}

.modal__selection-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin: 4px;
  padding: 3px 6px 3px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--me-text);
  background: var(--me-accent-surface);
  border: 1px solid var(--me-accent-border);
  border-radius: 999px;
}

.modal__selection-pill-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal__selection-pill-remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  color: var(--me-text-muted);
  background: transparent;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease;
}

.modal__selection-pill-remove:hover {
  color: var(--me-danger-strong);
  background: color-mix(in srgb, var(--me-danger-strong) 12%, transparent);
}

.modal__status {
  color: var(--me-text-subtle);
}

.modal__status--error,
.modal__error {
  color: var(--me-danger-strong);
}

.modal__hint {
  color: var(--me-text-subtle);
}

.modal__footer {
  border-top-color: var(--me-border);
  background: var(--me-surface-50);
}

.modal-overlay--palette .modal__footer-hint {
  align-self: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--me-text-muted);
  user-select: none;
  white-space: nowrap;
}

.modal--html-text .html-text-modal__toolbar {
  border-bottom-color: var(--me-border-subtle);
  background: var(--me-surface-50);
}

.html-text-modal__editor {
  border-left-color: var(--me-border-subtle);
}

.list-item__highlight {
  background: var(--me-search-highlight);
}

/* ── Lists / trees in modals ───────────────────────────────────────────── */

.list-item:hover,
.tree-node__row:hover {
  background: var(--me-surface-100);
}

.tree-node__row.modal-picker-row--active,
.list-item.modal-picker-row--active {
  background: var(--me-accent-surface);
  outline: 1px solid var(--me-focus-color);
  outline-offset: -1px;
}

/* Tree rows: comfortable spacing + thin muted chevrons */
.tree-node__row {
  gap: 6px;
  padding: 4px 6px;
  border-radius: var(--me-radius-sm);
}

.tree-node__children {
  margin-left: 20px;
}

.tree-node__toggle {
  position: relative;
  width: 14px;
  height: 14px;
  font-size: 0;
  color: transparent;
}

.tree-node__toggle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  transform: translate(-60%, -50%) rotate(-45deg);
  transition: transform 0.15s ease;
}

.tree-node__toggle--open::before {
  transform: translate(-50%, -70%) rotate(45deg);
}

.tree-node__toggle--leaf::before {
  content: none;
}

.tree-node__row:hover .tree-node__toggle::before {
  border-color: var(--me-text-muted);
}

.list-item__code {
  color: var(--me-text-subtle);
}

/* ── Design mode / drag ────────────────────────────────────────────────── */

body.design-mode .ce-block__content {
  border: 1px dashed var(--me-design-outline-faint);
  border-radius: var(--me-radius-sm);
  transition: border-color 0.2s ease;
}

body.design-mode .ce-block:hover .ce-block__content,
body.design-mode .ce-block--selected .ce-block__content {
  border-color: var(--me-design-outline);
}

.field-token--design {
  outline: 1px dashed var(--me-design-outline-faint);
  border-radius: var(--me-radius-sm);
  transition: outline-color 0.2s ease;
}

.field-token--design:hover,
.field-token--design.field-token--selected {
  outline-color: var(--me-design-outline);
}

.document-columns__toolbar,
.document-table__toolbar {
  border: 1px solid transparent;
  border-radius: var(--me-radius-sm);
  background: var(--me-surface-50);
  transition: border-color 0.2s ease, opacity 0.2s ease;
  opacity: 0.35;
}

.document-columns:hover .document-columns__toolbar,
.document-table:hover .document-table__toolbar,
.document-columns--selected .document-columns__toolbar,
.document-table--selected .document-table__toolbar {
  border-color: var(--me-border);
  opacity: 1;
}

.document-columns__label,
.document-table__label {
  text-transform: none;
  font-weight: 500;
  letter-spacing: normal;
  color: var(--me-text-muted);
}

.document-repeater {
  border: 1px solid var(--me-design-outline-faint);
  border-radius: var(--me-radius-md);
  background: var(--me-surface-50);
  transition: border-color 0.2s ease;
}

.document-repeater:hover {
  border-color: var(--me-design-outline);
}

.document-repeater__toolbar {
  border-bottom: 1px solid var(--me-border-subtle);
  background: var(--me-surface-50);
}

.document-repeater__label {
  text-transform: none;
  font-weight: 500;
  color: var(--me-text-muted);
}

.field-token--design.is-drop-before {
  box-shadow: inset 0 2px 0 0 var(--me-drop-indicator);
}

.field-token--design.is-drop-after {
  box-shadow: inset 0 -2px 0 0 var(--me-drop-indicator);
}

.document-table.is-drop-after,
.document-columns.is-drop-after {
  box-shadow: inset 0 -2px 0 0 var(--me-drop-indicator);
}

.document-section__body.document-section--drop-target {
  outline-color: var(--me-selection-outline);
  opacity: 1 !important;
}

.editor-drop-caret {
  background: var(--me-drop-indicator);
}

.ce-block.is-drop-before-block {
  box-shadow: inset 0 3px 0 0 var(--me-success-outline);
}

.field-token--selected:not(.field-token--design) {
  outline-color: var(--me-selection-outline);
}

.field-token--mapping-drop {
  outline-color: var(--me-primary) !important;
  opacity: 1 !important;
}

.ce-block--selected .ce-block__content {
  outline-color: var(--me-selection-outline);
}

.editor-holder--palette-drop {
  outline-color: #6a8;
}

.schema-tree__node.is-drop-before > .schema-tree__row {
  box-shadow: inset 0 2px 0 0 var(--me-drop-indicator);
}

.schema-tree__node.is-drop-after > .schema-tree__row {
  box-shadow: inset 0 -2px 0 0 var(--me-drop-indicator);
}

.schema-tree__node.is-drop-child > .schema-tree__row,
.schema-tree__children.is-drop-target {
  background: var(--me-selection-bg);
  outline-color: var(--me-selection-outline);
}

.document-section__design-bar,
.template-block__toolbar {
  border-bottom: 1px solid var(--me-border-subtle);
  opacity: 0.35;
  transition: opacity 0.2s ease;
}

.document-section:hover .document-section__design-bar,
.template-block:hover .template-block__toolbar,
.document-section--selected .document-section__design-bar {
  opacity: 1;
}

.template-block__type {
  text-transform: none;
  font-weight: 500;
  color: var(--me-text-muted);
}

/* ── Schema editor ─────────────────────────────────────────────────────── */

.design-shell .schema-form__row span,
.schema-form__row span {
  font-size: 12px;
  font-weight: 500;
  color: var(--me-text-muted);
}

.design-shell .schema-form__row input,
.design-shell .schema-form__row select,
.design-shell .schema-form__row textarea,
.schema-form__row input,
.schema-form__row select {
  border: 1px solid var(--me-border-input);
  border-radius: var(--me-radius-sm);
  font-family: var(--me-font-family);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.schema-form__row input:focus,
.schema-form__row select:focus {
  border-color: var(--me-focus-color);
  box-shadow: var(--me-focus-ring);
  outline: none;
}

.schema-form__hint {
  color: var(--me-text-subtle);
}

.schema-form__hint--error {
  color: var(--me-danger-strong);
}

.schema-tree__row .schema-tree__label--muted {
  color: var(--me-text-placeholder);
}

.formula-field-picker__hint {
  color: var(--me-text-subtle);
}

/* ── Tables (inline / vision) ──────────────────────────────────────────── */

.document-table__toolbar {
  background: var(--me-surface-100);
  border-color: var(--me-border);
}

.document-table__delete {
  border-color: var(--me-danger);
  color: var(--me-danger);
}

.document-table__delete:hover {
  background: var(--me-danger-bg);
}

.vision-table th,
.vision-table td {
  border: none;
  border-bottom: 1px solid #e2e8f0;
  padding: var(--me-space-2) var(--me-space-3);
}

.vision-table th {
  background: #f8fafc;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  font-style: inherit;
  color: inherit;
  text-transform: none;
  letter-spacing: normal;
  text-align: inherit;
  border-bottom: 1px solid #e2e8f0;
}

.vision-table tbody tr:nth-child(even) td {
  background: transparent;
}

.vision-table tbody tr:hover td {
  background: #f8fafc;
}

.vision-table__col-resizer:hover::after,
.vision-table__col-resizer--active::after {
  background: var(--me-primary);
}

.document-columns__col-resizer:hover::after,
.document-columns__col-resizer--active::after,
.document-columns--selected .document-columns__col-resizer::after {
  background: var(--me-primary);
}

.vision-table td.vision-table__cell--with-remove {
  padding-right: 20px;
}

.vision-table .vision-table__row-remove {
  border: none;
  background: transparent;
  color: #94a3b8;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.vision-table .vision-table__row-remove:hover {
  background: #fef2f2;
  color: #ef4444;
}

.document-table__row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: var(--me-space-2);
}

.document-table__add-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: #64748b;
  font-family: var(--me-document-font-family);
  font-size: var(--me-table-font-size, 14px);
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.document-table__add-row-icon {
  font-size: 1.1em;
  font-weight: 600;
  line-height: 1;
}

.document-table__add-row:hover {
  background: #f1f5f9;
  color: #2563eb;
}

/* ── Preview modal ─────────────────────────────────────────────────────── */

.preview-modal__loading {
  color: var(--me-text-muted);
}

.preview-modal__loading-hint {
  color: var(--me-text-muted);
  opacity: 0.9;
}

.preview-modal__loading--error {
  color: #a00;
}

.preview-modal__body--pdf,
.preview-modal__pdf {
  background: #525659;
}

.preview-modal__pdf--canvas {
  overflow: auto;
  padding: 0;
  box-sizing: border-box;
}

.preview-modal__pdf--viewer {
  display: block;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  height: 100%;
  border: 0;
  background: #525659;
}

.preview-modal__pdf-pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.preview-modal__pdf-page {
  display: block;
  max-width: 100%;
  height: auto;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}

/* ── Notifications ─────────────────────────────────────────────────────── */

.app-notification {
  font-family: var(--me-font-family);
  background: var(--me-surface-0);
  border: 1px solid var(--me-border);
  color: var(--me-text-body);
  border-radius: var(--me-radius-md);
}

.app-notification--error {
  background: var(--me-danger-surface);
  border-color: var(--me-danger-border);
  color: #7a1f1f;
}

/* ── Design toggle (if host reuses editor class) — match Preview accent ─── */

.design-toggle {
  font-family: var(--me-font-family);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--me-accent-hover-border);
  border-radius: var(--me-radius-sm);
  background: var(--me-accent-surface);
  color: var(--me-primary-muted);
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.design-toggle:hover:not(:has(input:disabled)) {
  background: var(--me-accent-hover);
  border-color: var(--me-primary);
  color: var(--me-primary);
}

.design-toggle:has(input:disabled) {
  opacity: 0.55;
  cursor: default;
}

.document-actions__title {
  color: var(--me-text-muted);
}

/* ── Host shell helpers (optional — use in your app layout) ──────────────── */

.doc-editor-host.editor-holder,
.editor-holder.doc-editor-host {
  background: var(--me-surface-0);
  border: none;
  border-radius: var(--me-radius-md);
  box-shadow: var(--me-shadow-sticky);
}

.page-sticky-chrome.doc-editor-host,
.doc-editor-host.page-sticky-chrome {
  background: var(--me-surface-50);
  box-shadow: none;
}

/* ── LWC / Lightning page shell helpers ─────────────────────────────────── */

.doc-editor-host__sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--me-surface-50);
  padding-bottom: 8px;
  box-shadow: none;
}

.doc-editor-host__sticky .editor-top-chrome {
  margin-bottom: 0;
}

.doc-editor-host__surface {
  background: var(--me-surface-0);
  border: none;
  border-radius: var(--me-radius-md);
  box-shadow: var(--me-shadow-sticky);
  min-height: 200px;
}

/* Fill mode — Page Setup paper sheet (format + orientation), sized via JS (+10%) */
.doc-shell.doc-shell--fill-page,
.doc-shell:has(.editor-holder--fill-page),
.page.page--fill-page,
.page:has(.editor-holder--fill-page) {
  max-width: min(100%, calc(var(--doc-page-width, 231mm) + 4rem));
  margin-inline: auto;
  width: 100%;
}

.design-shell:not(.design-shell--active) .design-panel__toolbar {
  background: var(--me-surface-50);
}

.design-panel__editor-scroll--fill-page,
.design-shell:not(.design-shell--active) .design-panel__editor-scroll:has(.editor-holder--fill-page) {
  background: var(--me-surface-100, #ececec);
}

.doc-shell .editor-root.editor-holder--fill-page,
.editor-holder.editor-holder--fill-page.doc-editor-host__surface,
.editor-holder.editor-holder--fill-page {
  background: var(--me-surface-100, #ececec);
  box-shadow: none;
  border-radius: 0;
  padding: 16px 12px 24px;
  box-sizing: border-box;
}

.doc-shell .editor-holder--fill-page .codex-editor,
.editor-holder--fill-page > .codex-editor,
.editor-holder--fill-page .codex-editor {
  width: min(100%, var(--doc-page-width, 231mm));
  max-width: var(--doc-page-width, 231mm);
  min-height: var(--doc-page-min-height, 326.7mm);
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
  padding: var(--doc-page-margin, 16.5mm);
  background: var(--me-surface-0, #fff);
  border: 1px solid var(--me-border-strong, #999);
  border-radius: 2px;
  box-shadow: 0 4px 24px rgb(15 23 42 / 0.12);
}

.doc-shell .editor-holder--fill-page .codex-editor__redactor,
.editor-holder--fill-page .codex-editor__redactor {
  padding: 0 !important;
}

.doc-editor-host__actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* ── Print / PDF-safe output ────────────────────────────────────────────── */

@media print {
  .design-panel--left,
  .design-panel--right,
  .rich-text-toolbar,
  .editor-drag-handle {
    display: none !important;
  }

  .editor-holder,
  .design-panel__editor-scroll {
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
  }

  .field-token {
    background: transparent !important;
    outline: none !important;
    padding: 0 !important;
    color: #000 !important;
    text-decoration: none !important;
  }

  .field-token--required-missing {
    font-weight: 700 !important;
    text-decoration: underline !important;
  }

  .vision-table th,
  .vision-table td {
    border: 1px solid #cbd5e1 !important;
    background: #fff !important;
  }

  .vision-table th {
    font-weight: inherit !important;
  }

  .vision-table tbody tr:nth-child(even) td {
    background: #fff !important;
  }

  .document-section__header {
    break-after: avoid;
  }

  .vision-table tr,
  .field-token--repeater {
    break-inside: avoid;
  }
}

@media (prefers-reduced-motion: reduce) {
  .editor-holder--show-fields .field-token:not(.field-token--design),
  .field-palette__item,
  .rich-text-toolbar__btn,
  .btn-primary,
  .properties-panel .schema-form__row--checkbox input[type='checkbox'],
  .properties-panel .schema-form__row--checkbox input[type='checkbox']::before,
  body.design-mode .ce-block__content,
  .field-token--design,
  .document-columns__toolbar,
  .document-table__toolbar,
  .document-repeater,
  .document-section__design-bar,
  .template-block__toolbar {
    transition: none;
  }
}


/**
 * Salesforce Lightning (SLDS / LWC) theme adapter for @docengine/editor.
 *
 * Load editor CSS from a Static Resource in LWC, then include this bridge file.
 * Import after styles.css and bridge.css:
 *
 *   loadStyle(this, editorStylesResource);
 *   loadStyle(this, editorBridgeResource);
 *   loadStyle(this, editorSldsResource);
 *
 * Maps --me-* tokens to SLDS / LWC CSS custom properties. Fallbacks match
 * Lightning Design System defaults when tokens are unavailable outside LWC.
 */

:root,
.doc-editor-host,
.doc-editor-root {
  /* Brand */
  --me-primary: var(--lwc-brandPrimary, var(--slds-c-button-brand-color-background, #0176d3));
  --me-primary-hover: var(--slds-c-button-brand-color-background-hover, #014486);
  --me-primary-contrast: var(--slds-c-button-brand-text-color, #fff);
  --me-primary-muted: var(--lwc-brandPrimaryActive, #014486);

  /* Surfaces */
  --me-surface-0: var(--lwc-colorBackgroundAlt, var(--slds-g-color-neutral-base-100, #fff));
  --me-surface-50: var(--lwc-colorBackground, var(--slds-g-color-neutral-base-95, #f3f3f3));
  --me-surface-100: var(--lwc-colorBackgroundRowHover, #f3f3f3);
  --me-surface-200: var(--lwc-colorBackgroundShade, #ecebea);
  --me-surface-300: var(--lwc-colorBackgroundStencil, #ecebea);
  --me-surface-muted: var(--lwc-colorBackgroundAlt, #fafafa);

  /* Borders */
  --me-border: var(--lwc-colorBorder, var(--slds-g-color-border-base-1, #c9c9c9));
  --me-border-strong: var(--lwc-colorBorderInput, #747474);
  --me-border-input: var(--lwc-colorBorderInput, #747474);
  --me-border-subtle: var(--lwc-colorBorderSeparator, #e5e5e5);

  /* Text */
  --me-text: var(--lwc-colorTextDefault, #181818);
  --me-text-body: var(--lwc-colorTextDefault, #181818);
  --me-text-muted: var(--lwc-colorTextLabel, #444);
  --me-text-subtle: var(--lwc-colorTextWeak, #706e6b);
  --me-text-placeholder: var(--lwc-colorTextInputDisabled, #747474);

  /* Accent panels */
  --me-accent-surface: var(--lwc-colorBackgroundHighlight, #f3f2f2);
  --me-accent-border: var(--lwc-colorBorder, #c9c9c9);
  --me-accent-hover: var(--lwc-colorBackgroundRowHover, #f3f3f3);
  --me-accent-hover-border: var(--lwc-brandPrimary, #0176d3);
  --me-accent-panel: var(--lwc-colorBackgroundShade, #ecebea);

  /* Focus / selection */
  --me-focus-color: var(--lwc-brandPrimary, #0176d3);
  --me-focus-ring: 0 0 0 2px var(--lwc-colorBackgroundRowSelected, rgba(1, 118, 211, 0.25));
  --me-selection-outline: var(--lwc-brandPrimary, #0176d3);
  --me-selection-bg: var(--lwc-colorBackgroundRowSelected, rgba(1, 118, 211, 0.08));
  --me-drop-indicator: var(--lwc-brandPrimary, #0176d3);

  /* Semantic */
  --me-danger: var(--lwc-colorTextError, #ba0517);
  --me-danger-strong: var(--lwc-colorTextError, #ba0517);
  --me-danger-bg: var(--lwc-colorBackgroundToastError, #fef1ee);
  --me-danger-surface: var(--lwc-colorBackgroundToastError, #fef1ee);
  --me-danger-border: var(--lwc-colorBorderError, #ea001e);
  --me-warning: var(--lwc-colorBackgroundWarning, #ffb75d);
  --me-warning-bg: var(--lwc-colorBackgroundToastWarning, #fff8e6);
  --me-warning-outline: #fe9339;

  /* Typography — use the standard Salesforce font (no bundled Inter). */
  --me-font-family: var(--lwc-fontFamily, var(--slds-g-font-family, 'Salesforce Sans', Arial, sans-serif));
  --me-document-font-family: var(--lwc-fontFamily, var(--slds-g-font-family, 'Salesforce Sans', Arial, sans-serif));
  --me-font-size: 0.8125rem;
  --me-font-size-sm: 0.75rem;
  --me-font-size-xs: 0.6875rem;

  /* Layout */
  --me-radius-sm: var(--lwc-borderRadiusMedium, 0.25rem);
  --me-radius-md: var(--lwc-borderRadiusMedium, 0.25rem);
  /* Salesforce modals commonly sit above standard page chrome */
  --me-overlay-z-index: 9001;
  --me-shadow-modal: var(--lwc-shadowDropDown, 0 2px 3px rgba(0, 0, 0, 0.16));
  --me-shadow-sticky: var(--lwc-shadowHeader, 0 2px 4px rgba(0, 0, 0, 0.07));
}

/* SLDS-aligned button sizing inside editor UI */
.btn {
  height: 2rem;
  padding: 0 0.75rem;
  line-height: 1.875rem;
}

.btn-sm {
  height: 1.625rem;
  padding: 0 0.5rem;
  font-size: var(--me-font-size-sm);
}

.btn-primary {
  background: var(--me-primary);
  border-color: var(--me-primary);
  color: var(--me-primary-contrast);
}

.btn-primary:hover {
  background: var(--me-primary-hover);
  border-color: var(--me-primary-hover);
}

.modal__input,
.modal__search,
.modal__textarea,
.modal__number,
.rich-text-toolbar__input,
.rich-text-toolbar__select,
.document-section__name-input {
  min-height: 2rem;
}
