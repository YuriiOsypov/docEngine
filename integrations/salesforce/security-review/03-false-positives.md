# DocEngine — Scanner False Positives

Security Review Package Documentation  
Version: 1.0

Use this document when Checkmarx or Salesforce Code Analyzer reports findings that are not actual security risks. If all findings are remediated or the scan is clean, check **“There are no false positives”** on the upload form instead of uploading this file.

---

## Finding: SOQL injection in dynamic merge/list queries

| Field | Value |
|---|---|
| **Scanner rule** | SOQL Injection / Apex SOQL Injection |
| **Affected classes** | `DocEngineMergeController`, `DocEngineListController` |
| **Classification** | False positive |
| **Explanation** | Dynamic object and field names are validated against `Schema.getGlobalDescribe()` and field maps before query construction. User-supplied values (Ids, search terms) use bind variables. Object API names from templates are checked against describe results, not concatenated from raw user input alone. |

---

## Finding: XSS in Lightning Web Components

| Field | Value |
|---|---|
| **Scanner rule** | DOM XSS / Client-side XSS |
| **Affected components** | LWC shell components; `DocEngineBundle` Static Resource |
| **Classification** | False positive (LWC layer) / Accepted mitigation (editor bundle) |
| **Explanation** | LWC templates do not bind user content via `lwc:inner-html`. The editor runs in an `lwc:dom="manual"` mount; JSON is passed to the editor API, not rendered through LWC template binding. The bundled editor sanitizes HTML on paste/export (`DOMParser` + allowlisted tags). Host pages use `ui.designLayout: 'chrome'` to limit global DOM side effects under LWS. |

---

## Finding: Hardcoded secret in Named Credential metadata

| Field | Value |
|---|---|
| **Scanner rule** | Hardcoded credentials / Sensitive data in source |
| **Affected metadata** | Named Credential `DocEngine_Pdf` |
| **Classification** | False positive |
| **Explanation** | Named Credential is shipped without a production password/token. Subscriber admin configures URL and API token post-install. Apex uses `callout:DocEngine_Pdf/...`; no secrets in Static Resources, LWC, or Apex source. |

---

## Finding: Global DOM access in Static Resource bundle

| Field | Value |
|---|---|
| **Scanner rule** | Client-side global scope / LWS violation |
| **Affected asset** | `DocEngineBundle` Static Resource |
| **Classification** | Accepted mitigation (documented) |
| **Explanation** | Editor sets `document.body.classList` in design mode and mounts modals on `document.body`. Mitigated by `ui.designLayout: 'chrome'` on all host LWCs so design-mode CSS does not restyle the Lightning page shell. Editor calls `destroy()` in LWC `disconnectedCallback`. Validated per `integrations/salesforce/LWS.md`. |

---

## Finding: `without sharing` in post-install / version helper

| Field | Value |
|---|---|
| **Scanner rule** | Sharing violation / Escalation of privilege |
| **Affected classes** | `DocEnginePostInstall`, `DocEngineTemplateVersionService` (if applicable) |
| **Classification** | False positive / By design |
| **Explanation** | `DocEnginePostInstall` runs as InstallHandler to seed org defaults and assign permission set to installer — standard managed-package pattern. Version snapshot helpers run only for operations that require reading template JSON when fill users lack template edit access; document and merge paths remain `with sharing` with explicit access checks via `DocEngineAccess`. |

---

## Known follow-ups (disclosed, not false positives)

| Item | Status |
|---|---|
| Client-side PDF intentionally omitted (Static Resource 5 MB limit) | By design — server-side Apex PDF only |
| `Record_Id__c` is text (polymorphic); no cascade delete from source record | Documented in ARCHITECTURE.md |
| Share email uses free-form To addresses (not Contact/Lead Ids) | By design; `setSaveAsActivity(false)` |
