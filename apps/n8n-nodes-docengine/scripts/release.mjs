#!/usr/bin/env node
/**
 * Bump n8n-nodes-docengine, commit, tag, and push so .github/workflows/publish.yml
 * publishes to npm with provenance.
 *
 * Usage (from repo root or this package):
 *   node apps/n8n-nodes-docengine/scripts/release.mjs [patch|minor|major|x.y.z]
 *   npm run release -w n8n-nodes-docengine -- patch
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(pkgDir, 'package.json');
const bumpArg = process.argv[2] ?? 'patch';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function bumpSemver(version, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const parts = version.split('.').map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid version in package.json: ${version}`);
  }
  let [major, minor, patch] = parts;
  if (kind === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === 'minor') {
    minor += 1;
    patch = 0;
  } else if (kind === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Unknown bump "${kind}". Use patch|minor|major|x.y.z`);
  }
  return `${major}.${minor}.${patch}`;
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const next = bumpSemver(pkg.version, bumpArg);
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const tag = `n8n-nodes-docengine-v${next}`;
const relPkg = 'apps/n8n-nodes-docengine/package.json';

console.log(`Releasing n8n-nodes-docengine@${next} (tag ${tag})`);

run('git', ['add', relPkg], { cwd: join(pkgDir, '../..') });
run(
  'git',
  ['commit', '-m', `release(n8n-nodes-docengine): ${next}`],
  { cwd: join(pkgDir, '../..') },
);
run('git', ['tag', tag], { cwd: join(pkgDir, '../..') });
run('git', ['push'], { cwd: join(pkgDir, '../..') });
run('git', ['push', 'origin', tag], { cwd: join(pkgDir, '../..') });

console.log(`Pushed ${tag}. GitHub Actions will publish with provenance.`);
