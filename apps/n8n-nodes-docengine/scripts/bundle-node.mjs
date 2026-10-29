import * as esbuild from 'esbuild';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '../..');
const fontsShim = join(root, 'scripts/n8n-fonts-shim.mjs');
const canvasStub = join(root, 'scripts/canvas-stub.cjs');

const engineSrc = join(repoRoot, 'packages/engine/src/index.ts');
const pdfRendererSrc = join(repoRoot, 'packages/pdf-renderer/src/index.ts');
const editorNodeSrc = join(repoRoot, 'packages/editor/src/node.ts');
const editorSrc = join(repoRoot, 'packages/editor/src/index.ts');

/**
 * Force the browser/VFS PDF path for the n8n community bundle.
 * Node PdfPrinter + dejavu-fonts-ttf + fontkit (data.trie) cannot ship
 * as a zero-dep, no-filesystem verified community node.
 *
 * Resolve DocEngine packages from source so GitHub Actions does not need
 * a full monorepo tsc build (circular editor ↔ pdf-renderer).
 */
const browserPdfPlugin = {
  name: 'n8n-browser-pdf',
  setup(build) {
    const rewrite = (fromFile, toFile) => {
      build.onResolve({ filter: new RegExp(`^\\./${fromFile.replace(/\./g, '\\.')}$`) }, (args) => {
        const importer = args.importer.replace(/\\/g, '/');
        if (!importer.includes('/pdf-renderer/')) return null;
        const dir = dirname(args.importer);
        const tsPath = join(dir, toFile.replace(/\.js$/, '.ts'));
        const jsPath = join(dir, toFile);
        return { path: existsSync(tsPath) ? tsPath : jsPath };
      });
    };

    rewrite('generate-pdf.js', 'generate-pdf-browser.js');
    rewrite('document-pdf-definition-node.js', 'document-pdf-definition-browser.js');
    rewrite('document-pdf-definition-preview-node.js', 'document-pdf-definition-preview-browser.js');
    // Disk fonts use createRequire(import.meta.url) + dejavu-fonts-ttf — invalid in CJS bundle.
    build.onResolve({ filter: /^\.\/fonts\.js$/ }, (args) => {
      const importer = args.importer.replace(/\\/g, '/');
      if (!importer.includes('/pdf-renderer/')) return null;
      return { path: fontsShim };
    });

    // linkedom optionally requires native `canvas`; stub it so the bundle has no npm deps.
    build.onResolve({ filter: /^canvas$/ }, () => ({ path: canvasStub }));
  },
};

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/nodes/DocEngine/DocEngine.node.ts'],
  outfile: 'dist/nodes/DocEngine/DocEngine.node.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  logLevel: 'info',
  plugins: [browserPdfPlugin],
  alias: {
    '@docengine/engine': engineSrc,
    '@docengine/pdf-renderer': pdfRendererSrc,
    '@docengine/editor/node': editorNodeSrc,
    '@docengine/editor': editorSrc,
  },
  // Verified community nodes: only n8n-workflow may stay external.
  external: ['n8n-workflow'],
  // Third-party console.* trips n8n's no-console scanner once bundled.
  drop: ['console'],
  define: {
    'import.meta.env.VITE_UPLOAD_BASE_URL': '""',
    'import.meta.env.VITE_IMAGE_UPLOAD_STUB': 'true',
  },
});

console.log('bundled DocEngine.node.cjs (browser/VFS PDF, zero runtime npm deps)');
