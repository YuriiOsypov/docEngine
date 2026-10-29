# n8n-nodes-docengine

n8n community node: bind JSON values (or a source **payload** + template `fieldMapping`) to a DocEngine template and output **HTML** or **PDF**.

The published package has **zero runtime `dependencies`**. PDF/HTML engines (`pdfmake`, `linkedom`, DocEngine packages) and DejaVu fonts are bundled into `dist/nodes/DocEngine/DocEngine.node.cjs` for n8n community-node verification.

## Install

In n8n: **Settings → Community nodes → Install** and enter:

```text
n8n-nodes-docengine
```

After n8n verifies the package, it also appears in the editor nodes panel (verified badge) and on [n8n.io/integrations](https://n8n.io/integrations). See [n8n community node install docs](https://docs.n8n.io/integrations/community-nodes/installation-and-management/).

### From this monorepo

```bash
cd apps/n8n-nodes-docengine
npm install
npm run build
npm test
npm run scan:bundle
```

Link or copy into your n8n `custom` / community nodes folder per [n8n docs](https://docs.n8n.io/integrations/creating-nodes/deploy/install-community-nodes/).

## Publish (npm provenance / Creator Portal)

Publishing must go through GitHub Actions with provenance — local `npm publish` is not accepted for verification.

### One-time npm Trusted Publisher

1. [npmjs.com/package/n8n-nodes-docengine](https://www.npmjs.com/package/n8n-nodes-docengine) → **Settings** → **Trusted Publishers** → **GitHub Actions**
2. Repository owner: `YuriiOsypov`  
   Repository name: `docEngine`  
   Workflow name: `publish.yml`  
   Environment: leave blank  
3. Or set repo secret `NPM_TOKEN` (granular automation token) as a fallback

### Release a version

```bash
# from monorepo root — bumps patch by default
npm run release -w n8n-nodes-docengine
# or: npm run release -w n8n-nodes-docengine -- minor
# or: npm run release -w n8n-nodes-docengine -- 0.0.110
```

That commits, tags `n8n-nodes-docengine-vX.Y.Z`, pushes, and triggers [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml) to build, test, scan, and `npm publish --provenance`.

Then re-submit the new version in the [n8n Creator Portal](https://creators.n8n.io/).

## Salesforce / custom app → PDF

Salesforce **DocEngine_PDF** calls `POST /api/v1/render/pdf` (see [PDF.md](../../integrations/salesforce/PDF.md)).

Use this node when you want PDFs on **your** n8n host. The webhook path must match Apex (`/api/v1/render/pdf`) or change `GENERATE_PATH` in `DocEnginePdfCallout`.

Apex sends **template + values** only (`DocEnginePdfCallout.buildRenderBody`):

| Shape | Body | Handle with |
|-------|------|-------------|
| Template + values | `{ "template", "document" }` values-only (`kind: "field"`) | **DocEngine** node |

### Importable example (recommended)

See [`examples/`](./examples/) — workflow JSON, sample requests, and setup:

```text
Salesforce Named Credential
  → Webhook (POST /api/v1/render/pdf)
  → DocEngine
       Template Source: From incoming
       Template JSON Path: body.template
       Values JSON Path: body.document
       Output format: PDF
  → Respond to Webhook (binary PDF)
```

Import `examples/salesforce-render-pdf.workflow.json` in n8n, activate, point Named Credential `DocEngine_Pdf` at the n8n origin (no trailing slash).

### Payload + field mapping

If the template includes `fieldMapping` and the body has a Salesforce-style source object:

- Values JSON Path: `body.payload` (or leave empty if the item *is* the payload)
- Enable **Use Template Field Mapping**

## Node options

| Option | Meaning |
|--------|---------|
| Template Source | Stored in node, or from incoming item |
| Values JSON / Path | JSON object of field values (expressions / JS ok), a dot-path (`sections`), or empty for the whole item |
| Use Template Field Mapping | Run `applyFieldMapping` before bind |
| Output format | `html` or `pdf` |
| Hide empty values | Omit empty fields/rows |

When **Template Source** is Stored in Node, Values must be field values (or a `{ "sections": { … } }` map) — not a previous DocEngine PDF/document item. A JSON mapping in Values is used as-is; it is no longer mistaken for a path.

Output always includes full document JSON on the item plus a binary file property (default `data`).
