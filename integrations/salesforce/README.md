# Salesforce integration notes

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full field-level design, including [App details (evaluator FAQ)](./ARCHITECTURE.md#12-app-details-evaluator-faq) (PDF consistency, version lifecycle, security, SDK docs, extensions).

| Doc | Topic |
|---|---|
| [TEMPLATE_UX.md](./TEMPLATE_UX.md) | Template list + create modal |
| [PACKAGING.md](./PACKAGING.md) | 2GP managed package, namespace, version create |
| [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) | AppExchange Security Review checklist |
| [PDF.md](./PDF.md) | pdf-service + Named Credential |
| [LWS.md](./LWS.md) | Lightning Web Security |

## Quick build & deploy (unmanaged / scratch)

```bash
npm run build:sf
sf project deploy start --source-dir apps/salesforce/force-app
sf project deploy start --source-dir unpackaged/post-install
sf org assign permset --name DocEngine_Admin
```

## Managed package (P5)

1. Register a **namespace** and set `"namespace"` in `sfdx-project.json`
2. Follow [PACKAGING.md](./PACKAGING.md)
3. Complete [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) before listing

## What's in `apps/salesforce/force-app/` (P1–P5)

| Layer | Artifacts |
|---|---|
| Static Resources | `DocEngineBundle`, `DocEngineCss` |
| Objects | `DocEngine_Template__c`, `DocEngine_Document__c` |
| Apex + tests | Controllers, `DocEnginePostInstall`, `*Test` classes |
| LWCs | `docEngineTemplateNew` (create modal), `docEngineTemplateBuilder`, `docEngineFiller`, `docEngineLib` |
| App | `DocEngine` |
| Permission sets | `DocEngine_Admin`, `DocEngine_User` |

Callout config: `unpackaged/post-install/` (not in the managed package).

**Next (P6):** Agentforce invocable action.
