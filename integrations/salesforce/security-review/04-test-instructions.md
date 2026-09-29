# DocEngine — Security Review Test Instructions

Security Review Package Documentation  
Version: 1.0

---

## Test org access

| Field | Value |
|---|---|
| **Login URL** | https://login.salesforce.com |
| **Username** | _Provide through the Partner Security Portal_ |
| **Password** | _Provide through the Partner Security Portal; never store here_ |
| **Org type** | Developer / Partner scratch org with DocEngine managed package installed |
| **Experience** | Lightning Experience enabled |

Rotate any credential previously stored in this file before granting reviewer access.

---

## Pre-configured state (via `DocEnginePostInstall`)

On managed package install, the following are created automatically:

- `DocEngine_Settings__c.Use_External_PDF__c` = **false** (default)
- `DocEngine_Admin` permission set assigned to installer
- Starter template: **Getting Started (Account)**
- Button config: **Account_Generate_Document**

No external services are required for the default test path.

---

## Permission sets

| Assignment | Capabilities |
|---|---|
| **DocEngine Administrator** (group) | Template design + fill + org settings |
| **DocEngine End User** (group) | Fill documents only |
| **DocEngine_Admin** | Same as Administrator group (direct perm set) |
| **DocEngine_User** | Same as End User group (direct perm set) |

Optional add-on package **DocEngine_PDF**:

- **DocEngine_PDF_User** — required only when testing external PDF callout path

---

## Test scenarios

### 1. Template design

1. Open **DocEngine** app.
2. Go to **DocEngine Templates** tab.
3. Open **Getting Started (Account)**.
4. Edit content in the template builder (optional).
5. Click **Save**.
6. **Expected:** New template version created; no errors.

### 2. Document fill + in-org PDF (no external callout)

1. Open any **Account** record.
2. Click **Generate Document** Quick Action (or use `docEngineFiller` on record page if placed).
3. Complete any fill fields.
4. Click **Save**, then **Save + PDF**.
5. **Expected:**
   - `DocEngine_Document__c` record created
   - PDF file in Account **Files** related list
   - No outbound HTTP callout (default provider = Salesforce `Blob.toPdf`)

### 3. CRUD/FLS — standard user

1. Create or use a user with **DocEngine End User** only (no Admin).
2. Open Account → **Generate Document** → fill → save.
3. **Expected:** User can fill and save documents.
4. Attempt to create/edit templates in **DocEngine Templates**.
5. **Expected:** User cannot manage templates without Admin permission set.

### 4. Share (optional)

1. From document preview, open **Share**.
2. Send email or copy public link.
3. **Expected:** Email sends via org Email Deliverability; link uses Salesforce Content Distribution.
4. **Note:** Requires org email deliverability configured.

### 5. External PDF (optional — requires Named Credential + token)

Only if reviewers want to test the optional callout path:

1. Setup → **Named Credentials** → **DocEngine_Pdf**
   - URL: `https://docengine.pro` (no trailing slash)
   - Username: `api`
   - Password: valid DocEngine.pro API token (`de_…`)
2. Setup → **Custom Settings** → **DocEngine Settings** → **Use External PDF** = checked
3. Repeat scenario 2 (**Save + PDF**).
4. **Expected:** PDF still attaches to record; Apex callout to `/api/v1/render/pdf`.

---

## Components to place (if not already on pages)

| Component | Placement |
|---|---|
| `docEngineTemplateBuilder` | `DocEngine_Template__c` record page |
| `docEngineFiller` | Account (or other object) record page — optional |
| **Generate Document** | Account page layout → Mobile & Lightning Actions |

Post-install starter template and button config cover Quick Action testing on Account without extra setup.

---

## Apex test coverage

Run in org or CI:

```bash
sf apex run test --code-coverage --result-format human --wait 20
```

**Expected:** ≥ 75% coverage on all packaged Apex classes.

Test classes included:

- `DocEngineTemplateControllerTest`
- `DocEngineInstanceControllerTest`
- `DocEngineMergeControllerTest`
- `DocEngineListControllerTest`
- `DocEnginePdfControllerTest`
- `DocEnginePostInstallTest`
- `DocEngineAccessTest`
- `DocEngineButtonControllerTest` (if packaged)

Callouts are mocked via `HttpCalloutMock` in tests — no live PDF service required.

---

## Scanner artifacts (generate before upload)

See `integrations/salesforce/security-review/README.md` for commands to produce:

- Partner Security Portal Checkmarx report (PDF)
- Salesforce Code Analyzer output (`.txt`)

---

## Contact

| Field | Value |
|---|---|
| **Name** | Yurii Osypov |
| **Email** | yurii.osypov@gmail.com |
| **Support** | yurii.osypov@gmail.com |
