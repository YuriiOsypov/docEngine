# n8n-nodes-docengine

n8n community node: bind JSON values (or a source **payload** + template `fieldMapping`) to a DocEngine template and output **HTML** or **PDF** **on your n8n host** (offline / self-hosted).

The published package has **zero runtime `dependencies`**. PDF/HTML engines (`pdfmake`, `linkedom`, DocEngine packages) and DejaVu fonts are bundled into `dist/nodes/DocEngine/DocEngine.node.cjs`.

> **Not a verified n8n Cloud node.** n8n verifies third-party API integrations only. This package is a local renderer (utility). Install it on **self-hosted** n8n. For DocEngine.pro Cloud API, use the built-in **HTTP Request** node instead (no community package required).

## Two ways to use DocEngine with n8n

| Goal | Use | Notes |
|------|-----|--------|
| Hosted PDF/HTML via [docengine.pro](https://docengine.pro) | Built-in **HTTP Request** | `POST https://docengine.pro/api/v1/render/pdf` with `Authorization: Bearer <API token>` and body `{ "template", "document" }` or `{ "payload" }` for authorised links |
| Render on your own n8n server (no outbound DocEngine.pro call) | This package: **`n8n-nodes-docengine`** | Self-hosted n8n only · Settings → Community nodes |

### HTTP Request → DocEngine.pro (any n8n, including Cloud)

1. Create an API token or authorised link in the [DocEngine dashboard](https://docengine.pro).
2. In n8n, add **HTTP Request**:
   - Method: `POST`
   - URL: `https://docengine.pro/api/v1/render/pdf` (or `/api/v1/render/preview`)
   - Authentication: Header `Authorization` = `Bearer de_…`
   - Body: JSON template + values (same contracts as Salesforce Named Credential `DocEngine_Pdf`)
3. Response is PDF bytes (or HTML/JSON for preview).

Authorised fill links and embeds (`/r/…`, `/embed/…`) are separate from this automation path — see the dashboard “Authorised link created” dialog.

## Install (self-hosted community node)

In n8n: **Settings → Community nodes → Install** and enter:

```text
n8n-nodes-docengine
```

Or:

```bash
npm install n8n-nodes-docengine
```

Unverified community nodes require [self-hosted n8n](https://docs.n8n.io/integrations/community-nodes/installation-and-management/).

### From this monorepo

```bash
cd apps/n8n-nodes-docengine
npm install
npm run build
npm test
npm run scan:bundle
```

## Salesforce / custom app → PDF on your n8n host

Salesforce **DocEngine_PDF** can call `POST /api/v1/render/pdf` on **your** webhook (see [PDF.md](../../integrations/salesforce/PDF.md)).

```text
Salesforce Named Credential
  → Webhook (POST /api/v1/render/pdf)
  → DocEngine (this node)
       Template Source: From incoming
       Template JSON Path: body.template
       Values JSON Path: body.document
       Output format: PDF
  → Respond to Webhook (binary PDF)
```

Import [`examples/salesforce-render-pdf.workflow.json`](./examples/salesforce-render-pdf.workflow.json). Or point Salesforce at **https://docengine.pro** instead and skip this node.

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

When **Template Source** is Stored in Node, Values must be field values (or a `{ "sections": { … } }` map) — not a previous DocEngine PDF/document item.

Output always includes full document JSON on the item plus a binary file property (default `data`).

## Publish (maintainers)

Releases go through GitHub Actions with npm provenance (`.github/workflows/publish.yml`).

```bash
npm run release -w n8n-nodes-docengine
```

## Links

- Website / playground: https://docengine.pro
- Docs: https://docengine.pro/docs
- npm: https://www.npmjs.com/package/n8n-nodes-docengine
- GitHub: https://github.com/YuriiOsypov/docEngine
- n8n community thread: https://community.n8n.io/t/docengine-is-an-open-source-visual-document-builder-and-more/309509
