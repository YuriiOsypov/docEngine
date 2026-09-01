# DocEngine — Solution Architecture and Usage

Security Review Package Documentation  
Version: 1.0

---

## 1. Solution overview

DocEngine is a managed Salesforce Lightning application that lets administrators design document templates bound to Salesforce objects and lets users generate filled documents (JSON + PDF) from record pages.

**Primary user flows:**

- **Design** — Admin authors a template, maps Salesforce fields, saves to `DocEngine_Template__c`.
- **Fill** — User opens a record, selects a template, merges record data, completes fields, saves `DocEngine_Document__c`.
- **Export** — User generates PDF (in-org or optional external renderer) stored as `ContentVersion` on the record.
- **Share** — User sends preview via email, public Content Delivery link, or device share sheet.

No standalone mobile app, browser extension, or desktop client. Runs entirely in Lightning Experience.

---

## 2. Architecture components

### UI (Lightning Web Components)

| Component | Purpose |
|---|---|
| `docEngineTemplateBuilder` | Template design |
| `docEngineFiller` | Record-based fill |
| `docEngineRun` | Quick Action / URL button runner |
| `docEngineShareDialog` | Share preview (email / link / device) |
| `docEngineLib` | Loads `DocEngineBundle` + `DocEngineCss` Static Resources |

### Apex (with sharing, CRUD/FLS enforced)

| Class | Purpose |
|---|---|
| `DocEngineTemplateController` | Template CRUD + version history |
| `DocEngineInstanceController` | Document save, PDF attach, share email |
| `DocEngineMergeController` | Reads record fields → merge payload |
| `DocEngineListController` | Dynamic list resolution for editor fields |
| `DocEnginePdfController` | PDF routing (Salesforce vs external) |
| `DocEngineButtonController` | Quick Action config resolution |
| `DocEngineAccess` | Template access group enforcement |
| `DocEnginePostInstall` | Install-time seeding (settings, starter template, admin perm set) |

**Optional add-on (DocEngine_PDF package):**

- `DocEnginePdfCallout` — HTTPS callout to subscriber-configured PDF endpoint

### Custom objects

- `DocEngine_Template__c`, `DocEngine_Template_Version__c`, `DocEngine_Document__c`, `DocEngine_Button_Config__c`
- Hierarchy Custom Setting: `DocEngine_Settings__c` (`Use_External_PDF__c` checkbox)

### Standard platform features used

- `ContentVersion` / `ContentDocument` / `ContentDocumentLink` (PDF storage)
- `Messaging.SingleEmailMessage` (share email)
- `Task` (optional activity on share)
- Named Credential `DocEngine_Pdf` (subscriber-configured, no secrets in package)

---

## 3. Data flow

```
[User Browser / Lightning]
        │
        ▼
[LWC: docEngineTemplateBuilder | docEngineFiller | docEngineRun]
        │  @AuraEnabled Apex calls (session auth — Salesforce platform)
        ▼
[Apex Controllers — with sharing, WITH SECURITY_ENFORCED / stripInaccessible]
        │
        ├──► SOQL/DML on custom objects + mapped standard objects (merge)
        │
        ├──► [Default PDF path] Blob.toPdf(html) in-org
        │         └──► ContentVersion → ContentDocumentLink → source record
        │
        └──► [Optional PDF path — admin-enabled only]
                  HTTPS POST via Named Credential DocEngine_Pdf
                  → https://docengine.pro/api/v1/render/pdf (or compatible host)
                  Body: { template, document } JSON only
                  Response: application/pdf binary
                  └──► ContentVersion stored in subscriber org
```

All persistent data remains in the subscriber Salesforce org unless the subscriber chooses an external PDF host (transient render request only; no off-platform storage by the packaged app).

---

## 4. Authentication and authorization

### Authentication

- Standard Salesforce session (Lightning). No custom login or OAuth Connected App.

### Authorization

- Permission sets: `DocEngine_Admin` (design + fill), `DocEngine_User` (fill)
- Permission set groups: `DocEngine_Administrator`, `DocEngine_End_User`
- Apex runs with sharing; CRUD/FLS enforced on queries and DML
- Template access optionally restricted via `Access_Group_Id__c` (Public Group membership)
- Named Credential credentials configured by subscriber admin post-install

### External PDF auth (optional)

- Named Credential Password protocol; API token stored in Named Credential (encrypted by platform)
- Apex callout: `callout:DocEngine_Pdf/api/v1/render/pdf`
- No API keys in Static Resources, LWC, or package metadata

---

## 5. Encryption and sensitive data

- **Data at rest:** Salesforce platform encryption (subscriber org settings).
- **Data in transit:** HTTPS/TLS for all Lightning and Apex callouts.
- Template/document JSON may contain business data mapped from Salesforce fields; stored in Long Text Area fields within the subscriber org.
- PDF files stored as `ContentVersion` (platform-managed).
- Share email uses Salesforce Email Deliverability; attachments are org-owned Files.
- Public share links use Salesforce Content Distribution (org-controlled, optional password).
- No PII is sent to external systems unless subscriber enables external PDF rendering (template structure + field values in POST body for PDF generation only).

---

## 6. Usage instructions for security reviewers

### Post-install (automatic via `DocEnginePostInstall`)

- Org-default `DocEngine_Settings__c` (`Use External PDF` = false)
- `DocEngine_Admin` assigned to installer
- Starter Account template **Getting Started (Account)** + **Generate Document** button config

### Reviewer test path (default — no external services required)

1. Log in to provided test org.
2. Confirm `DocEngine_Admin` (or **DocEngine Administrator** group) is assigned.
3. Open **DocEngine** app → **DocEngine Templates** → open **Getting Started (Account)**.
4. Edit template in builder (optional) → **Save**.
5. Open any Account record.
6. Click **Generate Document** (Quick Action) or use `docEngineFiller` on record page.
7. Fill remaining fields → **Save** → **Save + PDF**.
8. Verify PDF appears in Account **Files** related list and `DocEngine_Document__c` record exists.

### Optional external PDF test

1. Setup → Named Credentials → **DocEngine_Pdf** → URL `https://docengine.pro`, token as password.
2. Setup → Custom Settings → **DocEngine Settings** → **Use External PDF** = checked.
3. Repeat **Save + PDF**; verify PDF still attaches to record.

### Permission test (standard user)

- Assign **DocEngine End User** group only (no admin).
- Confirm user can fill/save documents but cannot create templates without admin perm set.

---

## Related documentation

- Architecture: `integrations/salesforce/ARCHITECTURE.md`
- PDF setup: `integrations/salesforce/PDF.md`
- LWS hardening: `integrations/salesforce/LWS.md`
- Deploy/setup: `apps/salesforce/force-app/README.md`
