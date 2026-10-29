/**
 * Stand-in for @docengine/pdf-renderer fonts.js in the n8n bundle.
 * Avoids createRequire(import.meta.url) + dejavu-fonts-ttf filesystem paths.
 * Reads VFS from package source so CI does not need a prior tsc build.
 */
export {
  buildFontRegistry,
  BROWSER_FONT_PRESETS as FONT_PRESETS,
  BROWSER_FONT_PRESETS,
} from '../../../packages/pdf-renderer/src/fonts-browser-registry.ts';
