# DocEngine

Document template design, fill, and export — as an embeddable TypeScript library, with demos, a PDF service, an n8n node, and a Salesforce package.

DocEngine lets you design structured document templates (sections, fields, catalogs), fill them with data, and export to JSON, HTML, or PDF. The same core powers browser apps, Salesforce Lightning, and automation workflows.

**[Documentation](https://docengine.pro/docs)** · **[Playground](https://docengine.pro/playground)**

<p align="center">
  <img src="./apps/n8n-nodes-docengine/nodes/DocEngine/docengine.svg" alt="DocEngine" width="72" />
</p>

## Screenshots

### Design mode

Template editing with a field palette, section layout, and property panel.

![DocEngine design mode](./docs/images/editor-design.png)

### Fill mode

End users complete documents against the template schema.

![DocEngine fill mode](./docs/images/editor-fill.png)

### Document preview

Read-only preview with optional PDF export from the same document model.

![DocEngine document preview](./docs/images/pdf-preview.png)

## Features

- **Template editor** — Editor.js-based design mode with inline fields, schema editing, and JSON import/export
- **Logical & signature fields** — built-in Yes/No (`logical`) and canvas signature capture (`signature`, stored as PNG data URLs in JSON). The signature pad is **display-only for internal validation — not a cryptographically signed legal e-signature**.
- **Headless engine** — field schemas, mapping, formulas, and document I/O without a UI
- **PDF & HTML export** — pdfmake-based multi-page rendering (page setup, headers/footers, flowing tables) for browser and Node
- **Salesforce** — managed-package-ready metadata (templates, filler LWCs, Apex controllers)
- **n8n** — community node to generate HTML/PDF from templates in workflows
- **Themes** — PrimeVue and Salesforce Lightning (SLDS) bridges

## PDF layout & pagination

Common questions about print output — current behavior:

### Multi-page documents and automatic page breaks

Content flows across pages via pdfmake (block layout, not a fixed X/Y canvas). Optional section flags: `eachRowOnNewPage` (forced break per repeatable row) and `keepOnOnePage` (pdfmake `unbreakable`; PDF only).

### Tables that continue across pages

Tables paginate naturally; column headers repeat (`headerRows`). Long repeatable/inline tables can be chunked to fit the page body.

### Headers, footers and page numbering

Configured on the template/document via `pageSetup`. Mark a section **Show on each page** (`repeatable`) for a dynamic page header. Footer supports static `footer.text` and optional `footer.showPageNumbers`. Deprecated static header `lines` / `variables` — use the repeatable section instead.

### Large images and signature fields

`image` and `signature` (PNG data URL; display-only, not a legal e-signature) render in preview and PDF; `maxWidth` caps size. Prefer a real `uploadUrl` for large images so document JSON stays small. Remote images without CORS may appear blank in the PDF.

### Consistent output between browser preview and generated PDF

HTML preview and pdfmake PDF share the same document model and empty-field filtering. Expect small differences: preview is continuous scroll (print CSS approximates breaks); PDF owns true pagination, headers/footers, and `keepOnOnePage`. Salesforce in-org `Blob.toPdf` from HTML can diverge more than browser / n8n / pdf-service (all pdfmake); External PDF uses the same renderer as the demos.

Details: [`packages/pdf-renderer`](./packages/pdf-renderer/README.md), [editor preview specs](./packages/editor/SPECIFICATIONS.md#11-preview).

## Architecture

`@docengine/engine` is the headless core. UI and export packages sit on top of it; apps host those packages (Salesforce loads a built static resource, not the npm package at runtime).

### Packages

```mermaid
flowchart TB
  Date["@docengine/field-date"] -.->|plugin| Editor["@docengine/editor"]
  Editor --> Engine["@docengine/engine"]
  Editor --> PDF["@docengine/pdf-renderer"]
  PDF --> Engine
  Date --> Engine
```

### Hosts

```mermaid
flowchart LR
  Demos["Vite demos"] --> Editor["editor"]
  Demos --> Date["field-date"]
  SF["Salesforce LWCs"] --> Bundle["DocEngineBundle"]
  Bundle --> Editor
  Bundle --> Date
  N8N["n8n node"] --> Engine["engine"]
  N8N --> PDF["pdf-renderer"]
  PdfSvc["pdf-service"] --> PDF
  SfPdf["Salesforce PDF"] --> PdfSvc
```

## Repository layout

```text
docEngine/
├── packages/
│   ├── editor/          # @docengine/editor — embeddable template editor
│   ├── engine/          # @docengine/engine — headless document core
│   ├── field-date/      # @docengine/field-date — date field plugin
│   └── pdf-renderer/    # @docengine/pdf-renderer — PDF/HTML export
├── apps/
│   ├── ophthalmology-demo/   # Primary Vite demo
│   ├── primevue-demo/        # PrimeVue-themed demo
│   ├── pdf-service/          # Node PDF HTTP service
│   ├── n8n-nodes-docengine/  # n8n community node
│   └── salesforce/           # Salesforce DX source (DocEngine + DocEngine_PDF)
├── integrations/        # Architecture & packaging notes (SF, LWC)
├── unpackaged/          # Post-install / callout config (not in managed package)
├── examples/            # Sample templates & docs
├── docs/images/         # README screenshots
└── scripts/             # Build helpers (SF bundle, LWC styles)
```

## Packages

| Package | Description |
|---------|-------------|
| [`@docengine/editor`](./packages/editor) | Embeddable template editor (`createEditor`, web component) |
| [`@docengine/engine`](./packages/engine) | Headless I/O, schemas, mapping, formulas |
| [`@docengine/field-date`](./packages/field-date) | Date field handler / modal plugin |
| [`@docengine/pdf-renderer`](./packages/pdf-renderer) | PDF (pdfmake) and HTML export |

Full editor API: [`packages/editor/SPECIFICATIONS.md`](./packages/editor/SPECIFICATIONS.md)

## Quick start

### Prerequisites

- Node.js 20+
- npm (workspaces) — `package-lock.json` is the primary lockfile

### Install

```bash
npm install
```

### Run demos

```bash
# Ophthalmology demo (default)
npm run dev

# PrimeVue demo
npm run dev:primevue

# PDF service
npm run dev:pdf
```

### Build & test

```bash
npm run build:lib      # Library + LWC styles
npm run build          # Lib + ophthalmology demo
npm run build:sf       # Salesforce static resource bundle
npm run typecheck
npm test
```

### Environment

Copy `.env.example` to `.env` if you need image upload configuration:

```bash
# VITE_UPLOAD_BASE_URL=http://localhost:8008
# VITE_IMAGE_UPLOAD_STUB=true
```

## Embed the editor

```js
import { createEditor } from '@docengine/editor';
import '@docengine/editor/styles.css';

const docEngine = createEditor({
  holder: '#editor',
  data: {
    time: Date.now(),
    fieldSchemas: {},
    blocks: [],
  },
  catalogs: {
    lists: { /* commonListId → { items } */ },
    trees: { /* commonTreeId → { tree } */ },
  },
});

await docEngine.ready;
const doc = await docEngine.exportDoc();
```

Optional theme bridges:

```js
import '@docengine/editor/themes/bridge.css';
import '@docengine/editor/themes/prime.css'; // or themes/slds.css
```

## Salesforce

Two SFDX packages:

| Package | Path | Role |
|---------|------|------|
| **DocEngine** | `apps/salesforce/force-app` | Templates, filler, Apex, LWCs |
| **DocEngine_PDF** | `apps/salesforce/force-app-pdf` | Optional Named Credential → `pdf-service` |

Scratch / unmanaged deploy:

```bash
npm run build:sf
sf project deploy start --source-dir apps/salesforce/force-app
sf project deploy start --source-dir unpackaged/post-install
sf org assign permset --name DocEngine_Admin
```

See [`integrations/salesforce/README.md`](./integrations/salesforce/README.md) for architecture, packaging, PDF setup, and security review notes.

## n8n

Two options:

1. **DocEngine.pro API** (any n8n, including Cloud) — use the built-in **HTTP Request** node: `POST https://docengine.pro/api/v1/render/pdf` with a Bearer API token from the dashboard. No community package required.
2. **Self-hosted local render** — install the community node [`n8n-nodes-docengine`](./apps/n8n-nodes-docengine) (**Settings → Community nodes**, self-hosted only). Bundled PDF/HTML; no outbound call to DocEngine.pro.

This node is **not** in n8n’s verified catalog (utility / local renderer). Details, examples, and Salesforce webhook wiring: [`apps/n8n-nodes-docengine/README.md`](./apps/n8n-nodes-docengine/README.md). Community thread: [Built with n8n — DocEngine](https://community.n8n.io/t/docengine-is-an-open-source-visual-document-builder-and-more/309509).

## Scripts reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Ophthalmology demo |
| `npm run dev:primevue` | PrimeVue demo |
| `npm run dev:pdf` | PDF service (watch) |
| `npm run build` | Build lib + demo |
| `npm run build:lib` | Vite library build + LWC styles |
| `npm run build:sf` | Salesforce bundle |
| `npm run typecheck` | TypeScript project references |
| `npm test` | Unit tests across packages |

## Documentation

- [Docs](https://docengine.pro/docs) — fields, mapping, storage, and the API
- [Playground](https://docengine.pro/playground) — try the editor in the browser
- [Editor README](./packages/editor/README.md) — install & API overview
- [Editor specifications](./packages/editor/SPECIFICATIONS.md) — data contracts & extension points
- [Salesforce integration](./integrations/salesforce/README.md) — deploy, packaging, PDF, LWS
- [PDF renderer](./packages/pdf-renderer/README.md) — browser vs Node entry points; see also [PDF layout & pagination](#pdf-layout--pagination)
- [Editor preview specs](./packages/editor/SPECIFICATIONS.md#11-preview) — HTML preview vs PDF export behavior

## License

[MIT](./LICENSE)
