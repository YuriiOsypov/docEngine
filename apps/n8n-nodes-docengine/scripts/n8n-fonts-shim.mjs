/**
 * Stand-in for @docengine/pdf-renderer fonts.js in the n8n bundle.
 * Avoids createRequire(import.meta.url) + dejavu-fonts-ttf filesystem paths.
 */
export {
  buildFontRegistry,
  BROWSER_FONT_PRESETS as FONT_PRESETS,
  BROWSER_FONT_PRESETS,
} from '../../../packages/pdf-renderer/dist/fonts-browser-registry.js';
