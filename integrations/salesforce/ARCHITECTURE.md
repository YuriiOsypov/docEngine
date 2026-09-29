# Salesforce App — Architecture (DocEngine for Salesforce)

## 1. Purpose & scope

Deliver a Salesforce application built on `@docengine/editor`:

- **Design mode** — admins author document templates bound to a Salesforce object type. Many templates per object.
- **Fill mode** — users open a record, pick a template, auto-fill from the record, complete remaining fields, and store the result (JSON + PDF) back on the record.
- Distributable as a managed package (AppExchange) with an Agentforce (AgentExchange) invocable action on top.

Non-goals (v1): e-signature workflow, multi-recipient approval routing. The engine already produces PDFs and structured data; signature can be layered later. **In scope:** share a preview file from the record (device share sheet, public Content Delivery link, or outbound email with attachment).

## 2. Feature mapping

| Capability | This app | Engine hook |
|---|---|---|
| Template builder | Design-mode LWC | `createEditor({ designMode: true })`, `exportTemplate()` |
| Field/data merge | Field mapping | `getFieldMapping()`, `applyFieldMapping(payload)` |
| Prepare & fill | Fill-mode LWC | `createEditor({ designMode: false })`, `exportFields()` / `exportDoc()` |
| Completed document on record | PDF + JSON persistence | `exportPdf()`, `preview()`, `validate()` |
| Template ↔ object binding | `DocEngine_Template__c.Object_API_Name__c` | — |
| Document stored on record | `DocEngine_Document__c` + `ContentDocumentLink` | — |
| Share preview (link / email) | `docEngineShareDialog` + `prepareShare` / `sendShareEmail` | Host preview artifact (`Blob` + filename) |
| Log shared email as Task | Optional **Create a task** on send (default on) | — |

## 3. Current state & prerequisite gaps

Reference (non-deployable) assets already exist under `integrations/lwc/` and a frozen host contract (`integrations/lwc/doc-editor-contract.d.ts`). Two gaps must close before deploy:

- **G1 — Bundle format.** The library Vite build produces `formats: ['es']` with `@editorjs/editorjs` as `external`. Salesforce `loadScript` needs a **classic script** that assigns `window.DocEditor` **and inlines EditorJS**. → Dedicated IIFE build (`vite.config.sf.js`) via `npm run build:sf`.
- **G2 — Lightning Web Security.** The editor mutates `document.body.classList` (design mode), binds a global `focusin` listener, and mounts modals on `document.body`. Must be validated in a scratch org; prefer `ui.designLayout: 'chrome'` to avoid page-wide `body.design-mode--panels` effects.

## 4. Data model (field-level)

### 4.1 `DocEngine_Template__c` — design-time definition (mutable head)

| Field API name | Type | Req | Notes |
|---|---|---|---|
| `Name` | Text(80) | ✓ | Template title |
| `Object_API_Name__c` | Text(80) | ✓ | Binds template to SObject type: `Account`, `Opportunity`, `My_Obj__c`. Indexed/external-id for fast filter. |
| `Template_JSON__c` | Long Text Area(131072) | ✓ | Denormalized copy of **current** `exportTemplate()` JSON (includes `fieldMapping`) |
| `Is_Active__c` | Checkbox |  | Default `true`; only active templates appear in the fill picker |
| `Version__c` | Number(4,0) |  | Current / latest version number |
| `Current_Version__c` | Lookup(`DocEngine_Template_Version__c`) |  | Points at the immutable row used for new fills |
| `Description__c` | Text Area(255) |  | Admin note |
| `PDF_Filename__c` | Text(120) |  | Passed to `exportPdf({ filename })` |
| `Access_Group_Id__c` | Text(18) |  | Public Group Id (`Group.Type = Regular`). Not a platform Lookup (unsupported). Builder exposes a Public Group combobox that stores this Id. Blank = any user with template access; set = fill picker / getTemplate limited to that group (View All bypasses). |

### 4.1b `DocEngine_Template_Version__c` — immutable snapshots

| Field API name | Type | Req | Notes |
|---|---|---|---|
| `Name` | Auto Number `TV-{00000}` | ✓ | |
| `Template__c` | Master-Detail(`DocEngine_Template__c`) | ✓ | Parent template (sharing controlled by parent) |
| `Version__c` | Number(4,0) | ✓ | Semantic version within the template (1, 2, 3, …) |
| `Template_JSON__c` | Long Text Area(131072) | ✓ | Frozen `exportTemplate()` payload |
| `Version_Key__c` | Text(40), External Id, Unique |  | `{TemplateId}_{Version}` for find-or-create |

**Builder:** open any version via `listVersions` / `getVersion`; **Save always inserts a new version** and updates `Current_Version__c` (never mutates an old row).

**Documents:** first `saveInstance` pins `Template_Version__c` (lazy find-or-create from current head if missing). Later saves do not retarget.

Query for the fill picker:

```sql
SELECT Id, Name FROM DocEngine_Template__c
WHERE Object_API_Name__c = :objectApiName AND Is_Active__c = true
ORDER BY Name
```

### 4.2 `DocEngine_Document__c` — fill-time result (one per generated document)

| Field API name | Type | Req | Notes |
|---|---|---|---|
| `Name` | Auto Number `DOC-{00000}` | ✓ | |
| `Template__c` | Lookup(`DocEngine_Template__c`) | ✓ | Source template |
| `Template_Version__c` | Lookup(`DocEngine_Template_Version__c`) |  | Pinned layout/mapping used for this fill (Restrict delete) |
| `Record_Id__c` | Text(18), External Id | ✓ | **Polymorphic link** to source record (any object) |
| `Object_API_Name__c` | Text(80) | ✓ | Denormalized from template/record for reporting |
| `Document_JSON__c` | Long Text Area(131072) | ✓ | Values-only `exportFields()` payload (`kind: field`). Structure comes from `Template_Version__c`. Legacy full document JSON still opens. |
| `Status__c` | Picklist |  | `Draft` (default), `Completed`, `Signed` |
| `Completed_Date__c` | DateTime |  | Set when Status → Completed |

The generated PDF is **not** a field — it's a `ContentVersion` linked to both the `DocEngine_Document__c` and the source record via `ContentDocumentLink` (see §5).

### 4.3 Field-level rationale

- `Long Text Area` max is 131,072 chars. Template/document JSON should fit; if a template can exceed it, fall back to storing JSON as a `ContentVersion` and keep only a pointer field. Flag for review.
- `Object_API_Name__c` as **text, not lookup** — one lookup can't span objects, and text lets the same builder serve every object (including custom) with zero schema change.
- Template versions are immutable so completed documents keep the layout/mapping they were filled against.
## 5. Record linking strategy

Two complementary links:

1. **Document → record (data):** `DocEngine_Document__c.Record_Id__c` (text, 18-char, External Id). Generic across all objects; trade-off is no native cascade delete (handle via Apex trigger if needed).
2. **PDF → record (file):** `ContentDocumentLink` from the generated `ContentVersion` to the source record's Id. Natively polymorphic; the PDF appears in the record's **Files** related list automatically.

```
Account / Contact / Opportunity / Custom__c   (any SObject)
        │  (Object_API_Name__c = "Account")
        ▼
DocEngine_Template__c
  (head metadata + Current_Version__c)
        │
        ├── Template_Versions (immutable JSON snapshots)
        │
        └── DocEngine_Document__c ── Template_Version__c (pinned)
              Document_JSON__c (values only)
              Record_Id__c = 001xx… (polymorphic)
                    │
                    ▼
              ContentVersion (generated PDF)
              + ContentDocumentLink → source record
```

## 6. Apex layer

| Class | Method(s) | Responsibility |
|---|---|---|
| `DocEngineTemplateController` | `getTemplate`, `getVersion`, `listVersions`, `saveTemplate`, `listForObject`, `getObjectApiName` | CRUD + immutable version history |
| `DocEngineInstanceController` | `getInstance`, `saveInstance`, `savePdf`, `prepareShare`, `sendShareEmail`, … | CRUD + pin `Template_Version__c` + PDF → ContentVersion/Link; share prep + outbound email (+ optional Task) |
| `DocEngineMergeController` | `buildPayload(recordId, templateId, templateVersionId)` | Read record fields per mapping → payload for `applyFieldMapping` |
| `DocEngineListController` | `resolveListItems(fieldName, query, sourceCollection)` | Backs editor `resolveListItems`; uses `schema.sourceCollection` (`Object` or `Object.Field`) |
| `DocEngineObjectDescribeController` | `listSourceObjects`, `buildSourceSampleJson`, `listRemoteCollections`, `listRemoteLabelFields` | Template New picker; Field Mapping sample JSON; Remote search designer catalogs |

All `@AuraEnabled`, `with sharing`, enforce CRUD/FLS (`Security.stripInaccessible` or `WITH SECURITY_ENFORCED`). DTOs are plain Apex classes serialized to/from JSON. Lazy version snapshot for fill users uses a `without sharing` helper so read-only template users can still pin a version.

### 6.1 Share email + Create a task

From preview, the host opens `docEngineShareDialog`. **Send email** calls `DocEngineInstanceController.sendShareEmail`:

1. Attach the saved `ContentVersion` via `Messaging.SingleEmailMessage` (free-form To addresses; `setSaveAsActivity(false)` — recipients are not Contact/Lead Ids).
2. When **Create a task** is checked (default **true**), insert a standard `Task` on the document’s parent (`DocEngine_Document__c.Record_Id__c` → `Task.WhatId`): Account, custom Sales Order, or any object with Activities enabled.
3. Task defaults: `Subject = Email: {subject}`, `Status = Completed`, `ActivityDate = today`, `Description` includes recipients + message body, `TaskSubtype = Email` when creatable. No-op (no error) if parent Id is blank or Activities are disabled on that object.

Requires org **Email Deliverability** and Task create access. Max 10 recipients per send.

## 7. LWC components

| Component | Placement | Key config |
|---|---|---|
| `docEngineTemplateBuilder` | App Page / tab | `designMode: true`; Field Mapping opens with Source Object sample JSON; Remote list collections from picklists; save → `saveTemplate` (`Template_JSON__c` embeds `fieldMapping`) |
| `docEngineFiller` | Record Page (`@api recordId`) | `designMode: false`; template picker → `getTemplate` → `setFieldMapping` → `buildPayload` → `applyFieldMapping()`; save → `saveInstance` + PDF |
| `docEngineShareDialog` | (internal; opened from filler / modal / run preview) | Share panel: device share sheet, Copy link (`prepareShare`), Send email + **Create a task** checkbox (default on) → `sendShareEmail` |
| `docInstanceViewer` (opt.) | Record Page | Read-only render/preview of a stored instance |

Both reuse the mount pattern in `integrations/lwc/docEditor.js`: `loadStyle`/`loadScript` from Static Resources, `lwc:dom="manual"` roots, `ui.designLayout: 'chrome'`, `chromeParent`/`documentActionsContainer`, and the `--lwc-*` → `--me-*` token bridge in `docEditor.css`.

Host contract consumed (freeze — `integrations/lwc/doc-editor-contract.d.ts`): `ready`, `setDesignMode`, `load`, `exportDoc`, `exportFields`, `exportTemplate`, `getFieldMapping`, `applyFieldMapping`, `exportPdf`, `validate`, `destroy`.

## 8. Build & Static Resources

| Static Resource | Source | Build |
|---|---|---|
| `DocEngineBundle` (JS) | IIFE target → `packages/editor/dist/editor-lwc.js` | closes G1; sets `window.DocEditor`, inlines EditorJS |
| `DocEngineCss` | `packages/editor/dist/editor-lwc.css` | existing `scripts/build-lwc-styles.mjs` |

```bash
npm run build:sf
```

Produces both artifacts and copies them into `apps/salesforce/force-app/main/default/staticresources/`.

**5 MB limit:** Salesforce Static Resources max out at 5 MB. Full client-side PDF (pdfmake + DejaVu/Inter VFS) is ~8 MB, so the SF IIFE **stubs** PDF modules (`document-pdf.sf-stub.ts`, `browser.sf-stub.ts`). Preview/export PDF in the LWC should call Apex or `apps/pdf-service`, then `DocEngineInstanceController.savePdf`. Editor design/fill modes are unaffected.

## 9. Security & packaging

- **FLS/CRUD** enforced in Apex; ship **permission sets**: `DocEngine_Admin` (templates), `DocEngine_User` (fill).
- **Public Group access** — `DocEngineAccess` asserts `Access_Group_Id__c` (via `GroupMember` / nested Regular groups) on template get/list, merge payload, button resolve, and document get/list/save/delete/file. Documents inherit the parent template’s group. View All Records on templates bypasses the group check.
- **LWS** validation in scratch org (G2).
- **Packaging:** `sfdx-project.json`, 2GP **managed** package, namespace, then AppExchange security review. Keep an unmanaged/metadata path for internal deploys during dev.

## 10. Agentforce (AgentExchange) — later phase

`@InvocableMethod` wrapper, e.g. `GenerateDocumentAction(recordId, templateId)` → runs merge headless, creates a `DocEngine_Document__c`, returns PDF link. Exposes fill flow to Agentforce topics without the interactive LWC.

## 11. Phasing

1. **P1** — Bundle (G1) + Static Resources. ✅
2. **P2** — Objects + Apex CRUD. ✅
3. **P3** — `docEngineTemplateBuilder` + `docEngineFiller`; merge/pre-fill wiring. ✅
4. **P4** — PDF→Files (remote), LWS hardening. ✅
5. **P5** — Managed package + security review. ✅
6. **P6** — Agentforce action.
7. **P7** — Record Quick Action / URL button (`docEngineRun` + `DocEngine_Button_Config__c` with Template lookup, fill, export, preview). ✅
8. **P8** — Public Forms Mode (Experience Cloud guest link → create/update record + PDF). See [PUBLIC_FORMS.md](./PUBLIC_FORMS.md) (F1–F6 implemented).

## 12. Open questions for review

- **JSON size:** accept `Long Text Area` cap, or store JSON as Files from day one?
- **Cascade:** need an Apex trigger to delete `DocEngine_Document__c` when the source record is deleted (since `Record_Id__c` is text)?
- **Versioning:** `DocEngine_Template_Version__c` immutable history; builder can open any version; save always forks; documents pin a version (lazy snapshot if needed).
- **Namespace:** register and set in `sfdx-project.json` before first managed version (see PACKAGING.md).

## 13. Related paths

| Path | Role |
|---|---|
| `integrations/lwc/` | Reference LWC (pre–SFDX); host contract |
| `integrations/salesforce/` | This architecture + SF build notes |
| `integrations/salesforce/PUBLIC_FORMS.md` | Public Form Link / Google Forms–style intake (design) |
| `apps/salesforce/force-app/` | Deployable SFDX metadata (objects, Apex, LWC, Static Resources) |
| `vite.config.sf.js` | IIFE library build for `loadScript` |
| `scripts/build-sf.mjs` | CSS + IIFE + copy into `apps/salesforce/force-app` |
