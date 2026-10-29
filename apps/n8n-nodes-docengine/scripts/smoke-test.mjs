/**
 * Provenance-CI smoke test: load the published CJS bundle (catches missing
 * fonts / broken pdfmake wiring). Full unit tests need built workspace dists
 * and run locally via `npm run test:unit`.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { DocEngine } = require(join(root, 'dist/nodes/DocEngine/DocEngine.node.cjs'));

assert.equal(typeof DocEngine, 'function');
const node = new DocEngine();
assert.equal(node.description.name, 'docEngine');
assert.equal(node.description.displayName, 'DocEngine');
assert.equal(typeof node.execute, 'function');

console.log('smoke-test OK: DocEngine.node.cjs loads');
