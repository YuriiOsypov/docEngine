# @docengine/editor

Embeddable document template editor built on Editor.js with inline fields, design mode, and JSON import/export.

## Install

```bash
npm install @docengine/editor @editorjs/editorjs
```

See [SPECIFICATIONS.md](./SPECIFICATIONS.md) for the full interface reference (data contracts, export formats, catalogs, pickers, tool config).

## Quick start

```js
import { createEditor } from '@docengine/editor';
import '@docengine/editor/styles.css';
```

`styles.css` bundles **Inter** (weights 400, 500, 600) via `@fontsource/inter`. If your host app loads Inter another way, you can omit the bundled faces and rely on the same stack from `EDITOR_FONT_FAMILY` / Page setup.

```js
// Optional: theme bridge for PrimeVue 4 / OpenVue or Salesforce Lightning
// import '@docengine/editor/themes/bridge.css';
// import '@docengine/editor/themes/prime.css';
```

`themes/prime.css` maps Template design chrome (`--me-surface-*`, accents, formula picker, design panels) to PrimeVue/OpenVue semantic tokens so light and dark hosts (e.g. `darkModeSelector: '.app-dark'`) stay readable. Prefer this over host-app CSS overrides for dark mode.

```js
const docEngine = createEditor({
  holder: '#editor',
  data: {
    time: Date.now(),
    fieldSchemas: {},
    blocks: [],
  },
  catalogs: {
    lists: { /* commonListId → { items, withCode? } */ },
    trees: { /* commonTreeId → { tree } */ },
  },
});

await docEngine.ready;
const doc = await docEngine.exportDoc();
```

## API

### `createEditor(options)`

| Option | Description |
|--------|-------------|
| `holder` | DOM element or CSS selector |
| `data` | Initial `{ time, fieldSchemas, blocks }` |
| `defaultDocument` | Fallback when loading empty data |
| `catalogs` | `{ lists, trees }` for `commonListId` / `commonTreeId` |
| `designMode` | Start in design mode |
| `tools` | `['documentSection', 'templateBlock']` (+ optional `visionTable`) |
| `visionTableTool` | Custom Editor.js tool class for legacy tables |
| `imageUpload` | `{ uploadUrl, stub }` |
| `onChange` | `(doc) => void` |
| `onSchemaChange` | `(fieldSchemas) => void` |

### Instance methods

- `getDocument()`, `exportDoc()`, `exportTemplate()`, `exportFields()`
- `load(data)` — document, template, or fields JSON
- `setDesignMode(bool)`, `preview()`, `exportPdf(options?)`, `validate()`, `destroy()`

Deprecated alias (still works): `exportDocument()` → `exportFields()`.

### Utilities (import without mounting)

`IO_VERSION`, `buildDocExport`, `buildFieldsExport`, `normalizeImportedDoc`, `validateRequiredFields`, `renderDocumentPreview`, `exportDocumentPdf`, `SchemaRegistry`, `createCatalogProvider`, `getFieldTypes`, `registerField`, `FIELD_TYPES`

Date fields require the separate plugin `@docengine/field-date` (see SPEC §14.2).

### Web Component

```js
import { defineDocEditorElement } from '@docengine/editor';

defineDocEditorElement();
// <doc-editor design-mode></doc-editor>
```

## Theming (PrimeVue 4 / Salesforce Lightning)

Import the base stylesheet, then the shared bridge and one host adapter:

```js
import '@docengine/editor/styles.css';
import '@docengine/editor/themes/bridge.css';
import '@docengine/editor/themes/prime.css'; // or themes/slds.css
```

**Salesforce LWC:** From the monorepo root run `npm run build:sf`, then deploy Static Resources from `apps/salesforce/force-app/`:

```bash
npm run build:sf
# DocEngineCss + DocEngineBundle → apps/salesforce/force-app/main/default/staticresources/
```

Or import the CSS only in a Vite host:

```js
import '@docengine/editor/themes/lwc.css'; // dist/editor-lwc.css
```

See `integrations/lwc/` for a reference Lightning component and `integrations/salesforce/ARCHITECTURE.md` for the AppExchange data model.

Add class `doc-editor-host` to your editor container (and optionally sticky chrome wrapper). Map document field typography via `fieldValueStyle.default`. See SPECIFICATIONS.md §15.1 for full integration notes.

## Demo

See `apps/ophthalmology-demo` in the monorepo for a full ophthalmology template example.
