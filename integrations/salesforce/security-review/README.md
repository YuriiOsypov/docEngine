# Security Review — Upload Documentation

Files in this folder map to the AppExchange Security Review **Upload Documentation** step (Step 3).

Export each `.md` file to PDF before upload (Word, Google Docs, or VS Code Markdown PDF extension). Accepted formats: `.pdf`, `.txt`, `.doc`, `.zip` (max 20 MB).

## File → form mapping

| Form section | Title (use in portal) | Source file | Notes |
|---|---|---|---|
| Solution Architecture and Usage | `DocEngine Solution Architecture and Usage` | [01-solution-architecture-and-usage.md](./01-solution-architecture-and-usage.md) | Export to PDF |
| Sample API Callouts | `DocEngine Sample API Callouts` | [02-sample-api-callouts.md](./02-sample-api-callouts.md) | Export to PDF or `.txt` |
| Security scanner reports | `DocEngine Partner Security Portal Report` | _Generate externally_ | See below |
| False positives documentation | `DocEngine Scanner False Positives` | [03-false-positives.md](./03-false-positives.md) | Or check “no false positives” if scan is clean |
| Salesforce Code Analyzer | `DocEngine Salesforce Code Analyzer Report` | _Generate via CLI_ | See below |
| Agentforce Questionnaire | — | — | **Skip** — no Agentforce in v1 |
| Other Documents | `DocEngine Security Review Test Instructions` | [04-test-instructions.md](./04-test-instructions.md) | Fill in test org credentials before export |

## Generate scanner reports

### Partner Security Portal (Checkmarx)

1. Open [Salesforce Partner Security Portal](https://security.secure.force.com/security/tools/forcecom/scanner).
2. Scan the exact 1GP package version (`04t`) built from
   `apps/salesforce/force-app`. Current released version:
   `04tgK000000MFRpQAO` (`DocEngine 1.17`). Use a source zip only for
   pre-release diagnostics.
3. Include `apps/salesforce/force-app-pdf` if submitting the PDF add-on.
4. Download report as PDF → upload as **Security scanner reports**.

### Salesforce Code Analyzer

```bash
# Install plugin (once)
sf plugins install @salesforce/sfdx-scanner

# Main package
sf scanner run --target apps/salesforce/force-app --format table --outfile integrations/salesforce/security-review/code-analyzer-force-app.txt

# PDF add-on (if included)
sf scanner run --target apps/salesforce/force-app-pdf --format table --outfile integrations/salesforce/security-review/code-analyzer-force-app-pdf.txt
```

Upload the `.txt` output as **Salesforce Code Analyzer** report.

## Pre-submission checklist

- [ ] Provide test org credentials through the Partner Security Portal (never commit them)
- [ ] Export `01`–`04` to PDF
- [ ] Run Checkmarx → upload PDF
- [ ] Run Code Analyzer → upload `.txt`
- [ ] False positives: upload `03` **or** check “no false positives”
- [ ] Skip Agentforce questionnaire

## Related

- [SECURITY_REVIEW.md](../SECURITY_REVIEW.md) — internal checklist
- [ARCHITECTURE.md](../ARCHITECTURE.md) — full architecture reference
- [PDF.md](../PDF.md) — optional external PDF setup (upload separately if needed)
