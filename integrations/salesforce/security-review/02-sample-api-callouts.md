# DocEngine — Sample API Callouts

Security Review Package Documentation  
Version: 1.0

---

## Important note

**Default configuration (`Use External PDF` = false) makes no outbound HTTP callouts.**

The samples below apply only when the subscriber admin enables **Use External PDF** and configures Named Credential `DocEngine_Pdf`. Include this document for completeness; reviewers testing the default install path do not need external connectivity.

---

## Callout 1: External PDF render (optional)

| Property | Value |
|---|---|
| Initiator | Apex class `DocEnginePdfCallout` (DocEngine_PDF add-on package) |
| Trigger | User clicks **Save + PDF** or **View as PDF** with Use External PDF enabled |
| Endpoint | `callout:DocEngine_Pdf/api/v1/render/pdf` |
| Resolved URL | Subscriber-configured base URL, e.g. `https://docengine.pro/api/v1/render/pdf` |

### Request

```
Method: POST
Headers:
  Content-Type: application/json
  Authorization: (handled by Named Credential — Bearer / Basic / X-Api-Key per host)
```

**Body (example):**

```json
{
  "template": {
    "kind": "template",
    "version": 2,
    "fieldSchemas": {
      "accountName": { "type": "text", "label": "Account Name" }
    },
    "blocks": [
      {
        "type": "paragraph",
        "data": { "text": "Account: {{accountName}}" }
      }
    ],
    "pageSetup": { "format": "A4", "margin": "20mm" }
  },
  "document": {
    "kind": "field",
    "sections": {
      "main": { "accountName": "Acme Corp" }
    }
  }
}
```

### Success response

```
HTTP 200 OK
Content-Type: application/pdf
Body: (binary PDF bytes)
```

### Error responses (examples)

```
HTTP 401 Unauthorized
Content-Type: application/json
Body:
{
  "error": "Invalid or missing API token"
}
```

```
HTTP 400 Bad Request
Content-Type: application/json
Body:
{
  "error": "PDF render requires a template plus field values."
}
```

### Post-callout handling

Apex receives PDF blob → `DocEngineInstanceController.savePdfFromBlob()` → `ContentVersion` inserted → `ContentDocumentLink` to `DocEngine_Document__c` and source record (`Record_Id__c`).

---

## No other outbound web services

- LWC does not call external URLs (editor image upload uses in-browser data URLs in the SF package).
- Share email uses Salesforce Messaging API (platform-native, not third-party SMTP).
- Public links use Salesforce Content Distribution (platform-native).
- No REST API exposed by DocEngine to external consumers (not an API-only app).

---

## In-platform Apex → LWC (for reference — not external)

**Example:** `DocEngineMergeController.buildPayload(recordId, templateId)`

Returns JSON field values from Salesforce record via SOQL (with sharing/FLS). No HTTP; standard `@AuraEnabled` server round-trip within subscriber org.
