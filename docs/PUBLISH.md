# Publishing `@docengine/*` to npmjs

CoreEngine (and other hosts) consume these packages from the registry:

| Package | Role |
|---------|------|
| `@docengine/engine` | Headless core |
| `@docengine/editor` | Embeddable template editor |
| `@docengine/pdf-renderer` | PDF/HTML export |
| `@docengine/field-date` | Date field plugin |

Unscoped [`docengine`](https://www.npmjs.com/package/docengine) on npmjs is an **unrelated** Markdown docs tool — do not publish under that name.

## Prerequisites

1. npm account with rights to the **`@docengine`** scope (create org at https://www.npmjs.com/org/create if needed).
2. Logged in: `npm login` then `npm whoami`.
3. Clean build from this monorepo root.

## Version

Keep package versions in sync (currently `0.0.107` on npmjs across workspaces). Bump all four together before publish.

## Build

```bash
cd /path/to/docEngine
npm install
npm run build -w @docengine/engine
npm run build -w @docengine/field-date
npm run build -w @docengine/pdf-renderer
npm run build -w @docengine/editor
npm test
```

## Publish order

Publish dependencies first:

```bash
npm publish -w @docengine/engine --access public
npm publish -w @docengine/field-date --access public
npm publish -w @docengine/pdf-renderer --access public
npm publish -w @docengine/editor --access public
```

Confirm:

```bash
npm view @docengine/editor version
npm view @docengine/engine version
npm view @docengine/pdf-renderer version
npm view @docengine/field-date version
```

## After publish

In CoreEngine (default is already npm `0.0.107`):

```bash
npm run docengine:use-npm
npm install
npm --prefix ./crm-bff install
```

Maintainers iterating on DocEngine next to CoreEngine:

```bash
npm run docengine:use-local
npm install
npm --prefix ./crm-bff install
# … work …
npm run docengine:use-npm   # before committing CoreEngine package.json
```

## Notes

- Root `doc-engine` package is `"private": true` — only publish workspace packages under `packages/`.
- `prepare` scripts build on install from git; registry consumers get `files`/`dist`/`lib` from the tarball.
- Tag the DocEngine repo (`v0.0.107`) when you publish so hosts can pin source history.
