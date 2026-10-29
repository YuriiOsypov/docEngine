import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = join(root, 'dist/nodes/DocEngine/DocEngine.node.cjs');
const source = readFileSync(bundlePath, 'utf8');
const sizeMb = (statSync(bundlePath).size / (1024 * 1024)).toFixed(2);

const bannedNpm = [
  'pdfmake',
  'linkedom',
  'dejavu-fonts-ttf',
  '@docengine/engine',
  '@docengine/pdf-renderer',
];

const requireRe = /require\((["'])([^"']+)\1\)/g;
const found = new Map();
for (const match of source.matchAll(requireRe)) {
  const mod = match[2];
  found.set(mod, (found.get(mod) ?? 0) + 1);
}

const npmHits = [...found.keys()].filter((mod) => {
  if (mod.startsWith('node:') || mod.startsWith('./') || mod.startsWith('../')) return false;
  // Node builtins often appear without node: prefix inside pdfkit/pdfmake.
  const builtins = new Set([
    'fs',
    'path',
    'url',
    'util',
    'stream',
    'zlib',
    'buffer',
    'events',
    'http',
    'https',
    'crypto',
    'os',
    'string_decoder',
    'punycode',
    'querystring',
    'assert',
    'tty',
    'net',
    'tls',
    'child_process',
    'module',
    'vm',
    'constants',
  ]);
  if (builtins.has(mod)) return false;
  if (mod === 'n8n-workflow') return false;
  return true;
});

const bannedHits = bannedNpm.filter((name) =>
  [...found.keys()].some((mod) => mod === name || mod.startsWith(`${name}/`)),
);

console.log(`bundle: ${bundlePath}`);
console.log(`size: ${sizeMb} MiB`);
console.log(`require() modules (${found.size}):`);
for (const [mod, count] of [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${count}x ${mod}`);
}

if (bannedHits.length) {
  console.error(`\nFAIL: still requires npm packages that must be bundled: ${bannedHits.join(', ')}`);
  process.exit(1);
}

if (npmHits.length) {
  console.error(`\nFAIL: unexpected non-builtin require() targets: ${npmHits.join(', ')}`);
  process.exit(1);
}

if (source.includes('dejavu-fonts-ttf')) {
  console.error('\nFAIL: bundle still references dejavu-fonts-ttf');
  process.exit(1);
}

console.log('\nOK: no banned npm requires; only n8n-workflow + Node builtins remain external.');
