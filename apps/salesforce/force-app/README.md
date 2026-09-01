# Salesforce (SFDX) package

Deployable metadata for DocEngine on Lightning. Architecture: [ARCHITECTURE.md](../../../integrations/salesforce/ARCHITECTURE.md).

## Build Static Resources

From the monorepo root:

```bash
npm run build:sf
```

| Static Resource | File |
|---|---|
| `DocEngineCss` | `apps/salesforce/force-app/main/default/staticresources/DocEngineCss.resource` |
| `DocEngineBundle` | `apps/salesforce/force-app/main/default/staticresources/DocEngineBundle.resource` |

## LWCs (P3)

| Component | Placement | Mode |
|---|---|---|
| `docEngineTemplateBuilder` | `DocEngine_Template__c` record page, App Page, Tab | Design — save via `DocEngineTemplateController.saveTemplate` |
| `docEngineFiller` | Any record page / App Page | Fill — pick template, merge, save `DocEngine_Document__c` |
| `docEngineRun` | Record Quick Action / App Page / URL button | Button runner — fixed template, fill on/off, export pdf/html, preview on/off |
| `docEngineShareDialog` | (internal) | Preview Share — device share sheet, public link, or email (+ optional Create a task, default on) |
| `docEngineLib` | (internal) | Shared `loadScript` / `createEditor` helpers |

### Record button (P7)

1. Deploy metadata (includes `DocEngine_Button_Config__c` + Account Quick Action **Generate Document**).
2. Open **DocEngine Button Configs** tab → New:
   - **Config Label** = e.g. Account Generate Document
   - **Developer Name** = `Account_Generate_Document` (must match the Quick Action default key `{Object}_Generate_Document`)
   - **Template** = lookup to your `DocEngine_Template__c` (not a raw Id)
   - **Filling On**, **Export Mode** (`none` / `pdf` / `html`), **Show Preview**
3. Account **Page Layout** (or Dynamic Actions) → add **Generate Document** to Mobile & Lightning Actions.
4. Open an Account → **Generate Document** → pick a template when more than one exists for that object.

**URL button** (Object Manager → Buttons, Links, and Actions → New Button or Link):

```text
/lightning/action/quick/Account.Generate_Document?objectApiName=Account&context=RECORD_DETAIL&recordId={!Account.Id}
```

Or App Page with query params:

```text
/lightning/n/Your_App_Page?c__recordId={!Account.Id}&c__config=Account_Generate_Document
```

Optional overrides: `c__templateId`, `c__fill=0`, `c__export=html`, `c__preview=0`.

### Suggested setup after deploy

**Managed package install** runs `DocEnginePostInstall` automatically: org settings, `DocEngine_Admin` for the installer, and a starter Account template + `Account_Generate_Document` button config.

**Unmanaged / source deploy** — run once in Developer Console → Execute Anonymous:

```apex
DocEnginePostInstall.runFirstTimeSetup();
```

Then:

1. Assign **DocEngine End User** permission set group to fillers (or **DocEngine Administrator** for designers).
2. Open **DocEngine** app → edit **Getting Started (Account)** or create templates.
3. Account **Page Layout** → add **Generate Document** to Mobile & Lightning Actions (one-time per object).
4. Optionally add `docEngineFiller` to record pages for in-page fill.

Previously manual steps (now automated on install / `runFirstTimeSetup`):

- Assign `DocEngine_Admin` to installer
- Create first Account template and button config for **Generate Document**

## Data model (P2)

| Object | Role |
|---|---|
| `DocEngine_Template__c` | Design-time templates; many per `Object_API_Name__c` |
| `DocEngine_Document__c` | Filled docs; `Record_Id__c` links to any Salesforce record |
| `DocEngine_Button_Config__c` | Record-button presets; **Template** lookup + fill/export/preview |

## Apex

| Class | Purpose |
|---|---|
| `DocEngineTemplateController` | `getTemplate`, `getVersion`, `listVersions`, `saveTemplate`, `listForObject`, `getObjectApiName` |
| `DocEngineInstanceController` | `getInstance`, `listForRecord`, `saveInstance`, `savePdf`, `prepareShare`, `sendShareEmail` |
| `DocEngineMergeController` | `buildPayload` → feed `applyFieldMapping` |
| `DocEnginePdfController` | `generateAndSavePdf` → Named Credential → Files |
| `DocEngineButtonController` | `getConfig`, `resolveTemplateId` for record buttons |

## PDF (P4)

1. Default: **Salesforce** HTML→PDF (`Blob.toPdf`) — no external host (Use External PDF unchecked).
2. Optional: check Custom Setting **DocEngine Settings → Use External PDF**, point Named Credential `DocEngine_Pdf` at **https://docengine.pro** (password = API token). Callout is `POST /api/v1/render/pdf`.
3. On `docEngineFiller`, use **Save + PDF**.

See [integrations/salesforce/PDF.md](../../../integrations/salesforce/PDF.md) (BYO section) and [LWS.md](../../../integrations/salesforce/LWS.md).

## Permission sets

- `DocEngine_Admin` — templates + documents (CRUD), Files attach, org settings
- `DocEngine_User` — read templates, create/edit documents, Files attach

Permission set groups (easier bulk assignment):

- `DocEngine_Administrator` — contains `DocEngine_Admin`
- `DocEngine_End_User` — contains `DocEngine_User`

## Deploy

```bash
npm run build:sf
sf project deploy start --source-dir apps/salesforce/force-app
sf org assign permset --name DocEngine_Admin
```

Orgs that still have the old `Doc_Template__c` / `Doc_Instance__c` objects (pre-rename): deploy the new metadata first, migrate any data you need, then remove the old objects:

```bash
sf project deploy start --manifest apps/salesforce/force-app/destructive/package.xml --post-destructive-changes apps/salesforce/force-app/destructive/objectRename-destructiveChanges.xml
```

## Status

| Phase | Status |
|---|---|
| P1 Bundle + Static Resources | Done |
| P2 Objects + Apex | Done |
| P3 Builder + Filler LWCs | Done |
| P4 PDF service + LWS hardening | Done |
| P5 Managed package + security review prep | Done |
| P6 Agentforce action | Planned |
| P7 Record buttons (fill / export / preview) | Done |

Packaging: [integrations/salesforce/PACKAGING.md](../integrations/salesforce/PACKAGING.md) · Security: [SECURITY_REVIEW.md](../integrations/salesforce/SECURITY_REVIEW.md)
