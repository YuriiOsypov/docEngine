# Public Forms Mode (Google Forms–style)

Turn DocEngine into an external intake form without rewriting the editor, mapping UI, or PDF stack. Add one publish surface: **Public Form Link**.

**Status:** F1–F6 implemented (data model, writeback, public/admin Apex, public LWC, guest perm set, elevated PDF attach, Update prefill, admin link UI).

**Depends on:** Design Mode + `fieldMapping` + fill editor + `DocEngine_Document__c` + PDF attach ([ARCHITECTURE.md](./ARCHITECTURE.md)).

---

## Experience Cloud setup (F4)

1. Create / open an **Experience Cloud** site (or Salesforce Site) with guest access.
2. New page route **`docengine-form`** (URL: `/s/docengine-form`).
3. Drop **DocEngine Public Form** (`docEnginePublicForm`) on the page.
4. Guest User profile / permission set:
   - Assign **`DocEngine Public Form Guest`** (`DocEngine_Public_Form_Guest`) for package object / Apex access.
   - Enable **`DocEnginePublicFormController`** (and the public form LWC) on the Guest profile if the perm set alone is not enough.
   - Guest does **not** need Create/Edit on Account/Lead/etc. for Submit — writeback runs elevated (`applyElevated` + `SYSTEM_MODE`).
5. Make Static Resources public for the site: `DocEngineBundle`, `DocEngineCss`, `DocEnginePdfViewer` (Guest must load the editor).
6. On the template: check **Public Form Enabled** → open **Public Form** tab → **Mint link**.
7. Set the LWC property **Experience site base URL** (e.g. `https://myorg.my.site.com`) so **Copy URL** builds a full link.
8. Share `https://{site}/s/docengine-form?token={Token__c}`.

---

## 1. Product flow

1. **Admin (Design Mode)** — builds a questionnaire on `DocEngine_Template__c` (same builder). Field pills stay design-time tokens; fill mode already renders them as inputs/dropdowns.
2. **Publish** — admin mints a `DocEngine_Form_Link__c` and copies an Experience Cloud URL (`/s/docengine-form?token=…`).
3. **Guest** — opens the link, fills the form, Submit.
4. **Server** — validates token → writeback answers onto Lead/Account/Case/… → saves `DocEngine_Document__c` → generates PDF → attaches to the new/updated record.
5. **Admin** — open **DocEngine Documents** (list view **All**). On a document record: **Open HTML preview** (editor + Document preview / PDF) or **Open attached PDF / file**.

```
[docEngineTemplateBuilder]
        │  exportTemplate() + fieldMapping
        ▼
DocEngine_Template__c / Template_Version__c
        │  Publish public form
        ▼
DocEngine_Form_Link__c  (token, mode, expiry)
        │
        ▼
[docEnginePublicForm]  Experience Cloud guest page
        │  exportFields()
        ▼
DocEnginePublicFormController.submit
  → invert fieldMapping → SObject DML
  → save document (reuse InstanceController internals)
  → generateAndSavePdf (reuse PdfController)
```

---

## 2. What stays unchanged

| Keep | Why |
|---|---|
| `docEngineTemplateBuilder` | Forms are templates; no second designer |
| Fill-mode editor (`designMode: false`) | Already turns tokens into inputs |
| `fieldMapping.rules` (`section`/`field` ↔ `$payload.Field`) | Schema for writeback (invert on submit) |
| `exportFields()` → `Document_JSON__c` | Durable answers |
| Template version pin | Submitted forms keep layout/mapping |
| PDF + `ContentDocumentLink` | After parent `Record_Id__c` exists |

---

## 3. Data model

### 3.1 Template flags (on `DocEngine_Template__c`)

| Field | Type | Default | Notes |
|---|---|---|---|
| `Public_Form_Enabled__c` | Checkbox | `false` | Gate: only enabled templates can mint/resolve public links |
| `Public_Form_Mode__c` | Picklist | `Create` | `Create` \| `Update` — default behavior for new links |

Optional later: `Public_Thank_You_Message__c` (Long Text).

### 3.2 `DocEngine_Form_Link__c` — public link registry

Sharing: **Private** (admins only; guests never query by Id — only by token via elevated Apex).

| Field API name | Type | Req | Notes |
|---|---|---|---|
| `Name` | Text(80) | ✓ | Admin label, e.g. “Credit application – Q3” |
| `Token__c` | Text(64), External Id, Unique, Case-sensitive | ✓ | High-entropy (`Crypto.getRandomInteger` / UUID strip). **This is the ACL.** |
| `Template__c` | Lookup(`DocEngine_Template__c`) | ✓ | Parent template |
| `Template_Version__c` | Lookup(`DocEngine_Template_Version__c`) | ✓ | Pin at mint time (immutable layout for all submissions on this link) |
| `Object_API_Name__c` | Text(80) | ✓ | Denormalized from template at mint |
| `Mode__c` | Picklist | ✓ | `Create` \| `Update` |
| `Is_Active__c` | Checkbox |  | Default `true`; revoke = uncheck |
| `Expires_At__c` | DateTime |  | Blank = no expiry |
| `Max_Submissions__c` | Number(8,0) |  | Blank = unlimited |
| `Submission_Count__c` | Number(8,0) |  | Incremented on successful submit |
| `Site_Path__c` | Text(255) |  | Optional override path segment; default `/s/docengine-form` |
| `Owner_User__c` | Lookup(User) |  | Optional: records created as this user / for notification |
| `Record_Id__c` | Text(18) |  | **Update mode only** — target record for invite links (never put raw Id in the public URL; keep on link row or in signed token payload) |
| `Allow_Pdf_Attach__c` | Checkbox |  | Default `false` — public forms save Document JSON only; opt in to attach PDF/HTML |
| `Require_Captcha__c` | Checkbox |  | Default `true` for Create; org may stub until CAPTCHA wired |

**URL shape (guest-facing):**

```
https://{experience-domain}/s/docengine-form?token={Token__c}
```

Do **not** put `templateId` or `recordId` in the query string for Create links.

**Update / invite variant:** same URL; `Mode__c = Update` and `Record_Id__c` stored on the link (one-time or reusable invite). Prefill runs **server-side** only (see §5).

### 3.3 Document provenance (optional on `DocEngine_Document__c`)

| Field | Type | Notes |
|---|---|---|
| `Form_Link__c` | Lookup(`DocEngine_Form_Link__c`) | Traceability; blank for internal fills |
| `Source__c` | Picklist | `Internal` \| `PublicForm` |

---

## 4. Apex contract

Guest profile may call **only** `DocEnginePublicFormController` (and optionally a tiny captcha helper). Do **not** expose `DocEngineMergeController`, `DocEngineListController`, or full `DocEngineTemplateController` to Guest User.

### 4.1 `DocEnginePublicFormController`

```apex
public with sharing class DocEnginePublicFormController {

  /**
   * Load sanitized template structure for the guest editor.
   * - Resolves link by Token__c
   * - Asserts Is_Active, Expires_At, Public_Form_Enabled, Max_Submissions
   * - Returns template JSON WITHOUT sourceSample / admin-only metadata
   * - Prefill (Update mode): server-built map of safe field values only
   */
  @AuraEnabled(cacheable=true)
  public static String getPublicForm(String token) { /* JSON DTO */ }

  /**
   * Submit answers.
   * answersJson = exportFields() payload (kind: field)
   * html        = optional HTML for Salesforce Blob.toPdf path (same as modal Finish)
   * captchaToken= optional
   */
  @AuraEnabled
  public static String submitPublicForm(
    String token,
    String answersJson,
    String html,
    String captchaToken
  ) { /* JSON result */ }
}
```

Admin-only (existing session / Admin perm set), either on this class behind `DocEngineAccess` or a separate `DocEngineFormLinkController`:

```apex
@AuraEnabled
public static FormLinkDTO createFormLink(FormLinkCreateRequest req);

@AuraEnabled
public static void revokeFormLink(Id formLinkId);

@AuraEnabled(cacheable=true)
public static List<FormLinkDTO> listFormLinks(Id templateId);
```

### 4.2 DTOs (JSON in/out — same pattern as `saveInstanceJson`)

**`getPublicForm` response**

```json
{
  "linkId": "a0x…",
  "name": "Credit application",
  "objectApiName": "Lead",
  "mode": "Create",
  "templateId": "a0y…",
  "templateVersionId": "a0z…",
  "templateJson": "{ … exportTemplate without sourceSample … }",
  "hideEmpty": false,
  "outputFormat": "pdf",
  "prefill": null,
  "requireCaptcha": true
}
```

- `templateJson`: structure + field schemas + `fieldMapping.rules` (needed for nothing on client for Create; strip `sourceSample`). Prefer stripping full `fieldMapping` from the guest payload and keeping rules server-side only if the editor does not need them to render empty fields.
- `prefill`: Update mode only — values-shaped object safe to `applyFieldMapping` / `load`, **not** raw SOQL payload.

**`submitPublicForm` request** (LWC builds):

```json
{
  "token": "…",
  "answersJson": "{\"kind\":\"field\",\"version\":2,\"sections\":{…}}",
  "html": "<html>…</html>",
  "captchaToken": "…"
}
```

**`submitPublicForm` response**

```json
{
  "ok": true,
  "recordId": "00Q…",
  "documentId": "a0d…",
  "message": "Thank you. Your application was submitted."
}
```

Never return template admin fields, mapping sample JSON, or internal error stacks to the guest.

### 4.3 Submit orchestration (server)

```
1. resolveLink(token) → link + templateVersion
2. assertActive / expiry / max submissions / captcha
3. parse answersJson; assert size ≤ DOCUMENT_JSON_MAX (reuse 120k client / 131072 Apex)
4. writeback (optional):
     invert fieldMapping.rules → Map<fieldApiName, value>
     block Id, OwnerId, etc.; elevated path skips Guest CRUD checks
     Mode Create + mapped values → insert SObject(objectApiName)
     Mode Create + no mapped values → skip parent insert (Document-only submission)
     Mode Update → update link.Record_Id__c when mapped values exist
5. save DocEngine_Document__c
     Record_Id__c = parent Id (nullable when Create has no mapping)
     Template_Version__c = link.Template_Version__c
     Status = Completed
     Form_Link__c = link.Id
6. if Allow_Pdf_Attach → generateAndSavePdf / saveHtml (enqueue if guest CPU/heap tight)
7. Submission_Count__c++
8. return thank-you DTO
```

Elevation: a dedicated `DocEnginePublicFormService` (`without sharing` **or** system mode with hard allowlists) may read published template versions and insert the target record when Guest FLS is insufficient. Document every elevation for AppExchange review.

**Submit writeback:** `DocEngineWriteback.applyElevated` builds the SObject **without** requiring Guest object/field CRUD (`isCreateable` / `isUpdateable`). Field mapping is **optional** — Create with no invertible rules (or no answered mapped fields) still saves `DocEngine_Document__c` and may attach PDF/HTML to the document only. When mapped values exist, `DocEnginePublicFormService` inserts/updates the parent with `AccessLevel.SYSTEM_MODE`.

---

## 5. Writeback (invert `fieldMapping`)

Today rules are **SF → form**:

```json
{
  "section": "Applicant",
  "field": "Full Name",
  "sourcePath": "$payload.Name"
}
```

Writeback for **simple scalar** rules (v1 scope):

| Rule | Writeback |
|---|---|
| `sourcePath` = `$payload.Name` (no relationship) | `Lead.Name` ← answers `sections[Applicant][Full Name]` |
| `$payload.Account.BillingCity` | **Skip in v1** (or require explicit allowlist of createable fields on the bound object only) |
| Table / `sourceArrayPath` | **Skip in v1** — store in `Document_JSON__c` only |
| Format suffix `#dd/mm/yyyy` | Parse display → store native date on SObject |

**v1 rule:** only paths matching `$payload.{ApiName}` where `{ApiName}` is a createable field on `Object_API_Name__c`. Everything else remains document-only (still in PDF).

Implement as Apex `DocEngineWriteback.apply(mappingSpec, answersJson, objectApiName) → Result` (`record` + `appliedFields` / `skipped`). Unit-tested in `DocEngineWritebackTest` (no guest entry point yet).

---

## 6. LWC / Experience Cloud

| Piece | Notes |
|---|---|
| `docEnginePublicForm` | New LWC; targets `lightningCommunity__Page` (+ `lightningCommunity__Default`) |
| Page | Experience Builder: public page, Guest profile access |
| Boot | Read `token` from `CurrentPageReference` state / URL |
| Editor | `ensureDocEngineAssets` + `createDocEditor({ designMode: false })`; **no** `buildPayload` |
| Lists | Static choice items only; **disable** remote `resolveListItems` for guests |
| Images/signatures | Prefer defer Files upload until after record create, or upload via public controller with size caps |
| Finish UX | Single **Submit** (no Draft); thank-you state in-page |

Admin: “Copy public link” on template record (or builder chrome) → `createFormLink` → clipboard URL. Reuse patterns from `docEngineShareDialog` (clipboard only — not ContentDistribution).

---

## 7. Security checklist

1. Guest perm set: create on target objects you explicitly support; create on `DocEngine_Document__c`; ContentVersion insert; **Apex class access = PublicFormController only**.
2. Token = ACL (entropy + expiry + revoke + optional max submissions).
3. Strip `sourceSample` and any describe dumps from guest responses.
4. Allowlisted writeback; no arbitrary SOQL field list from the client.
5. No `DocEngineAccess` Public Groups for anonymous — use `Public_Form_Enabled__c` + token.
6. Rate limit / CAPTCHA on Submit; reuse document JSON size caps.
7. PDF callout only through existing façade; guest must not pass arbitrary HTML to an open PDF endpoint without token binding.
8. Security review: material change from “Lightning session only” ([security-review/01-…](./security-review/01-solution-architecture-and-usage.md)).

---

## 8. Implementation phases

| Phase | Deliverable |
|---|---|
| **F1** | Objects/fields: `Public_Form_Enabled__c`, `DocEngine_Form_Link__c`, document provenance ✅ |
| **F2** | `DocEngineWriteback` + tests (invert simple `$payload.Field` rules) ✅ |
| **F3** | `DocEnginePublicFormController` + service; admin `createFormLink` / revoke ✅ |
| **F4** | `docEnginePublicForm` LWC + Experience page instructions ✅ |
| **F5** | PDF attach on submit (elevated); guest perm set; captcha checkbox hook ✅ |
| **F6** | Update/invite mode + server prefill (`kind: field` values) ✅ |

---

## 9. Non-goals (v1)

- Replacing internal Quick Action / `docEngineRun` flows
- Guest remote object search / merge API
- Multi-object writeback or deep relationship creates
- Using ContentDistribution as the form URL
- E-signature / payment

---

## 10. Related paths

| Path | Role |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Core authenticated design → fill → PDF |
| `.../classes/DocEngineWriteback.cls` | Invert mapping + Update prefill |
| `.../classes/DocEnginePublicFormService.cls` | Token resolve, submit, elevated Files attach |
| `.../classes/DocEnginePublicFormController.cls` | Guest get/submit |
| `.../classes/DocEngineFormLinkController.cls` | Admin mint/revoke/list |
| `.../lwc/docEnginePublicForm` | Experience Cloud guest filler |
| `.../lwc/docEngineFormLinks` | Template record “Public Form” tab |
| `.../permissionsets/DocEngine_Public_Form_Guest*` | Guest least-privilege |
| `.../objects/DocEngine_Form_Link__c/` | Public link registry |
