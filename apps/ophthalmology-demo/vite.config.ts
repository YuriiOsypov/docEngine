import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: [
      {
        find: '@docengine/field-date',
        replacement: path.resolve(__dirname, '../../packages/field-date/src/index.ts'),
      },
      {
        find: '@docengine/editor/styles.css',
        replacement: path.resolve(__dirname, '../../packages/editor/src/styles/editor.css'),
      },
      {
        find: '@docengine/editor/themes/bridge.css',
        replacement: path.resolve(__dirname, '../../packages/editor/src/themes/bridge.css'),
      },
      {
        find: '@docengine/pdf-renderer/browser',
        replacement: path.resolve(__dirname, '../../packages/pdf-renderer/src/browser.ts'),
      },
      {
        find: '@docengine/pdf-renderer',
        replacement: path.resolve(__dirname, '../../packages/pdf-renderer/src/index.ts'),
      },
      {
        find: '@docengine/editor/node',
        replacement: path.resolve(__dirname, '../../packages/editor/src/node.ts'),
      },
      {
        find: /^@docengine\/editor\/(.*)/,
        replacement: `${path.resolve(__dirname, '../../packages/editor/src')}/$1`,
      },
      {
        find: '@docengine/editor',
        replacement: path.resolve(__dirname, '../../packages/editor/src/index.ts'),
      },
      // Prefer engine source so mapping/preview fixes hot-reload without a dist rebuild.
      {
        find: /^@docengine\/engine\/(.*)/,
        replacement: `${path.resolve(__dirname, '../../packages/engine/src')}/$1`,
      },
      {
        find: '@docengine/engine',
        replacement: path.resolve(__dirname, '../../packages/engine/src/index.ts'),
      },
    ],
  },
});
