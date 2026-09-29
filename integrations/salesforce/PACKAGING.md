# Packaging (1GP) — DocEngine

DocEngine currently ships only as a first-generation managed package (1GP).
The canonical source is `apps/salesforce/force-app`; the release org owns the
`logicomapp` namespace.

## Release identifiers

- Release org alias: `OrgFarmDocEngine`
- Metadata package ID: `033gK000000IZ8zQAG`
- Namespace: `logicomapp`
- Current released version: `DocEngine 1.17` (`04tgK000000MFRpQAO`)
- Prior security beta: `DocEngine 1.17 Security Beta` (`04tgK000000JRirQAG`)
- Install/upgrade requires Experience Cloud once (`NetworksEnabledOnce` /
  `Communities` feature) because Public Form site URL helpers query `Network` /
  `Domain`

```bash
npm run build:sf

# Deploy and test the exact source that will be uploaded.
sf project deploy start \
  --source-dir apps/salesforce/force-app \
  --target-org OrgFarmDocEngine

sf apex run test \
  --target-org OrgFarmDocEngine \
  --code-coverage \
  --result-format human \
  --wait 30

# Create a beta first; omit --managed-released.
sf package1 version create \
  --package-id 033gK000000IZ8zQAG \
  --name "DocEngine X.Y Beta" \
  --version X.Y \
  --target-org OrgFarmDocEngine \
  --wait 30

# After beta install/upgrade verification, upload the immutable release.
sf package1 version create \
  --package-id 033gK000000IZ8zQAG \
  --name "DocEngine X.Y" \
  --version X.Y \
  --managed-released \
  --target-org OrgFarmDocEngine \
  --wait 30
```

Run the Partner Source Scanner against the exact released `04t` package version.
Do not create a 2GP `Package2` or use `sf package version create`.

## Post-install / PDF connector

PDF callouts live in the optional **DocEngine_PDF** package (`apps/salesforce/force-app-pdf/`), not in core `apps/salesforce/force-app`.

```bash
sf project deploy start --source-dir apps/salesforce/force-app-pdf
sf org assign permset --name DocEngine_PDF_User
```

Configure Named Credential `DocEngine_Pdf` to `https://docengine.pro` and store a `de_…` API token as the credential password.

See [PDF_PACKAGE.md](./PDF_PACKAGE.md) and [PDF.md](./PDF.md).

## What is packaged vs not

| In `apps/salesforce/force-app` (DocEngine) | In `apps/salesforce/force-app-pdf` (DocEngine_PDF) |
|---|---|
| Objects, Apex, LWCs, Static Resources | `DocEnginePdfCallout` (Callable) |
| `DocEnginePdfController` facade + `isAvailable` | Named Credential `DocEngine_Pdf` |
| Permission sets, tabs, DocEngine app | Remote Site Setting |
| Post-install Apex class | `DocEngine_PDF_User` perm set |

## Scratch org for development

```bash
# Package install/upgrade validation needs Communities enabled.
sf org create scratch \
  --definition-file config/project-scratch-def-communities.json \
  --alias DocEngineScratch \
  --duration-days 7 \
  --no-namespace \
  --set-default
sf project deploy start --source-dir apps/salesforce/force-app
sf project deploy start --source-dir unpackaged/post-install
sf org assign permset --name DocEngine_Admin
```
