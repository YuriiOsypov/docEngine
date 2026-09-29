# DocEngine — Scanner False Positives

Security Review Package Documentation  
Version: 1.1

Use this document when Checkmarx (Partner Source Scanner) or Salesforce Code Analyzer
reports findings that are not actual security risks. Upload this file with the
security review materials.

**Partner Source Scanner reference (remediated ZIP):**

| Field | Value |
|---|---|
| Scan Id | `a0OKX000001JRzk2AG` |
| Job type | `ZIP_UPLOAD` |
| Preset | `PortalAll` |
| Security issues | **74** (down from 269 on pre-remediation scan `a0OKX000001JRyD2AW`) |

**Clean on this scan (no findings):** Sharing, ContentDistribution CRUD, SOQL/SOSL
Injection, FLS Create/Update summary buckets that report clean, Disallowed Password
APIs, XSS categories listed as No Issues Found.

Prefer rescanning managed package version `04tgK000000MFRpQAO`
(`DocEngine 1.17` Released) so the review artifact matches the version under review.

---

## Finding: Apex CSRF In Aura / LWC (8)

| Field | Value |
|---|---|
| **Scanner rule** | Apex CSRF In Aura LWC |
| **Severity** | Medium |
| **Affected sinks** | `DocEngineFormLinkController` create/revoke/site upsert (`Database.insert` / `update` / `upsert` with `AccessLevel.USER_MODE`); `DocEngineInstanceController.deleteInstance`; `DocEngineInstanceController.prepareShare` (`ContentDistribution` insert with `USER_MODE`) |
| **Classification** | False positive |
| **Explanation** | Lightning Web Components invoke these `@AuraEnabled` methods through the Salesforce Lightning framework, which supplies request authenticity for the session. Checkmarx flags any state-changing Aura/LWC Apex entry point as CSRF. The sinks already enforce authorization (`DocEngineAccess.assertManageAccess` / document access), CRUD/FLS (`stripInaccessible` + `AccessLevel.USER_MODE`), and do not accept cross-origin browser form posts outside Lightning. |
| **Verification** | Negative tests cover unauthorized callers; share creation requires document access and ContentDistribution create rights. |

---

## Finding: Apex SOQL/SOSL User Mode Missing (29)

| Field | Value |
|---|---|
| **Scanner rule** | Apex SOQL SOSL User Mode Missing |
| **Severity** | Medium |
| **Primary classes** | `DocEnginePublicFormService`, `DocEnginePublicFormController`, `DocEngineWriteback`, `DocEnginePostInstall` |
| **Classification** | False positive / required 1GP + Guest boundary |
| **Explanation** | Remaining queries use `Database.queryWithBinds(..., AccessLevel.SYSTEM_MODE)` only where the running user is a Guest or install context that cannot hold subscriber CRUD/FLS on package or mapped objects. Authenticated controllers use `WITH USER_MODE` / `AccessLevel.USER_MODE`. Public form paths lock the link (`FOR UPDATE`), recheck expiry/max submissions, bind version→template, and constrain writeback to the pinned mapping. Post-install queries are InstallHandler bootstrap only. |
| **Verification** | Public form tests cover CAPTCHA disabled, limit enforcement, version substitution denial, and mapping allowlists. |

---

## Finding: Apex CRUD Create / Update (23 + 10)

| Field | Value |
|---|---|
| **Scanner rule** | Apex CRUD Create Violation / Apex CRUD Update Violation (detail paths also appear under the scanner’s FLS Create/Update query sections) |
| **Severity** | Serious |
| **Primary sinks** | `DocEngineTemplateSaveService` `Database.upsert(..., SYSTEM_MODE)`; `DocEngineTemplateVersionService` version insert; `DocEnginePublicFormService` guest writeback, document insert, form-link counter update, Files attach |
| **Classification** | False positive / required 1GP package-field exception |
| **Explanation** | Managed 1GP cannot ship subscriber FLS on all required package fields. These writes are fixed allowlists after independent authorization: admin/`Manage_DocEngine` for template save; validated public-form token + pinned mapping for guest submit. Standard objects and authenticated Files/Task/Content paths use user mode and `stripInaccessible`. |
| **Verification** | Statement-scoped analyzer suppressions document each SYSTEM_MODE DML; security-negative tests cover setup authorization and mapping allowlists. |

---

## Finding: Apex CRUD Violation (4) — polymorphic / share rows

| Field | Value |
|---|---|
| **Scanner rule** | Apex CRUD Violation |
| **Severity** | High |
| **Affected sinks** | `DocEngineInstanceController` Task insert with `WhatId` (share-email activity); `DocEngineTemplateSharingService` insert of `DocEngine_Template__Share` |
| **Classification** | False positive |
| **Explanation** | **Task:** create access is asserted (`assertTaskCreateAccess`), fields are stripped with `stripInaccessible`, and DML uses `AccessLevel.USER_MODE`. The scanner still flags polymorphic `WhatId`/`WhoId` patterns even when object createability is checked. **Template share:** Private OWD sharing rows are maintained only after an authorized admin template save; share DML is an allowlisted package-system operation with suppressions and tests. |
| **Verification** | Share-email and template-save tests; Admin View All / Modify All preserved on templates. |

---

## Finding: HTML serialization in PDF preparation (Code Analyzer)

| Field | Value |
|---|---|
| **Scanner rule** | `@lwc/lwc/no-inner-html` / Client-side XSS |
| **Affected component** | `docEngineLib.js`, PDF HTML serialization |
| **Classification** | False positive |
| **Explanation** | The flagged expression reads `doc.documentElement.outerHTML` from a detached `DOMParser` document after tree-based normalization. It does not assign to `innerHTML` / `outerHTML` / `insertAdjacentHTML` in the live Lightning DOM. The serialized value is sent to authenticated Apex for `Blob.toPdf`. |
| **Verification** | No `lwc:inner-html` in host LWCs. |

---

## Finding: global managed-package install handler (Code Analyzer)

| Field | Value |
|---|---|
| **Scanner rule** | PMD `AvoidGlobalInstallUninstallHandlers` |
| **Affected class** | `DocEnginePostInstall` |
| **Classification** | Required platform exception |
| **Explanation** | Salesforce requires a managed-package `InstallHandler` and `onInstall` to be `global`. Bootstrap writes are fixed allowlists; the separately callable setup method requires Modify All Data. |

---

## Intentional 1GP system boundaries (disclose)

`DocEngineTemplateSaveService`, `DocEngineTemplateVersionService`,
`DocEngineTemplateSharingService`, `DocEnginePostInstall`, and
`DocEnginePublicFormService` retain statement-scoped `AccessLevel.SYSTEM_MODE`
only for:

1. Package-owned required fields that cannot receive subscriber FLS in 1GP.
2. Guest Experience Cloud submit (writeback + document + optional file attach).
3. Install/upgrade bootstrap.

Each boundary validates identity/authorization first. Authenticated standard-object
and Files operations use user mode. Automatic public `ContentDistribution` for
preview/images was removed; public links exist only via explicit Share
(`prepareShare`), with original download disabled and expiry set when supported.
