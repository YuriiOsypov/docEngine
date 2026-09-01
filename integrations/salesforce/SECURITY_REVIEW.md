# AppExchange Security Review checklist — DocEngine

Use this before submitting to [Salesforce Security Review](https://security.secure.force.com/security/tools/forcecom/scanner).

## Code coverage & tests

- [ ] All packaged Apex ≥ **75%** coverage (prefer ≥ 85%)
- [ ] Run: `sf apex run test --code-coverage --result-format human --wait 20`
- [ ] Tests included: `DocEngineTemplateControllerTest`, `DocEngineInstanceControllerTest`, `DocEngineMergeControllerTest`, `DocEngineListControllerTest`, `DocEnginePdfControllerTest`, `DocEnginePostInstallTest`
- [ ] Callouts mocked via `HttpCalloutMock` (no live PDF service in tests)

## CRUD / FLS

- [x] Controllers use `with sharing`
- [x] Queries use `WITH SECURITY_ENFORCED` where applicable
- [x] DML uses `Security.stripInaccessible` on upsert paths
- [ ] Retest as a **standard user** with only `DocEngine_User` (no Modify All)

## Injection & SOQL

- [x] Dynamic SOQL object/field names validated against `Schema.getGlobalDescribe()` / field maps
- [x] Bind variables used for Id / LIKE values (`DocEngineMergeController`, `DocEngineListController`)
- [ ] No `String.escapeSingleQuotes` relied on alone for object API names without describe checks

## Secrets & callouts

- [x] PDF callout via **Named Credential** (`callout:DocEngine_Pdf/...`) — not hardcoded credentials
- [x] Named Credential **not** shipped with a production secret (unpackaged post-install)
- [ ] Subscriber guide documents configuring the Named Credential URL (HTTPS only)
- [ ] No API keys in Static Resources / LWC

## Lightning / LWS

- [ ] Scratch org LWS checklist completed ([LWS.md](./LWS.md))
- [x] LWCs use `designLayout: 'chrome'` (no page-wide panels mode)
- [x] Assets loaded via `loadScript` / `loadStyle` from Static Resources
- [ ] Modals / design mode verified on a record page under LWS

## Package hygiene

- [ ] Namespace registered and set in `sfdx-project.json`
- [ ] `npm run build:sf` before every package version create
- [ ] Static Resource `DocEngineBundle` &lt; 5 MB
- [ ] No debug `System.debug` with PII in packaged code
- [ ] Post-install script is no-op / safe (`DocEnginePostInstall`)
- [ ] Permission sets documented for admin vs end user

## False positives / scanner

Run Checkmarx / Salesforce Code Analyzer:

```bash
sf scanner run --target apps/salesforce/force-app --format table
```

- [ ] Triage findings; document false positives for the review questionnaire
- [ ] Confirm no XSS sinks in LWC (we pass JSON to editor; do not use `innerHTML` in LWC templates)

## Review materials to prepare

Upload-ready drafts live in [security-review/](./security-review/README.md):

1. [01-solution-architecture-and-usage.md](./security-review/01-solution-architecture-and-usage.md)
2. [02-sample-api-callouts.md](./security-review/02-sample-api-callouts.md)
3. [03-false-positives.md](./security-review/03-false-positives.md)
4. [04-test-instructions.md](./security-review/04-test-instructions.md) — fill in test org credentials before export

Also: [ARCHITECTURE.md](./ARCHITECTURE.md), Partner Security Portal Checkmarx PDF, Code Analyzer `.txt` (see security-review README).

## Known follow-ups (disclose if needed)

- `document.body.classList` for design mode (mitigated by chrome layout) — see LWS.md
- Client-side PDF intentionally omitted (size limit); PDF is server-side only
- `Record_Id__c` is text (polymorphic); no cascade delete from source record yet
