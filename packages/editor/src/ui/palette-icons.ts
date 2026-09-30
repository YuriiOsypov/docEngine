/** Inline SVG icons for the Source palette (Lucide-style, sized via CSS). */

const lucideAttrs =
  'xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

function svg(paths: string) {
  return `<svg ${lucideAttrs}>${paths}</svg>`;
}

/** Icons keyed by palette type (structure + field types). */
export const PALETTE_ICONS: Record<string, string> = {
  documentSection: svg(
    '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
  ),
  columns: svg(
    '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>',
  ),
  text: svg(
    '<path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  ),
  integer: svg(
    '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
  ),
  date: svg(
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  ),
  computed: svg(
    '<path d="m9 10 3-3 3 3"/><path d="M12 7v9"/><path d="m5 16 2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  ),
  logical: svg(
    '<path d="M9 11H3v2h6v-2z"/><path d="M15 11h6v2h-6v-2z"/><circle cx="12" cy="12" r="3"/>',
  ),
  image: svg(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  ),
  signature: svg(
    '<path d="M3 17c3-1 5.5-4 7-7 1.5 4 4 6 7 7"/><path d="M3 21h18"/>',
  ),
  barcode: svg(
    '<path d="M3 5v14"/><path d="M6 5v14"/><path d="M8 5v14"/><path d="M11 5v14"/><path d="M14 5v14"/><path d="M16 5v14"/><path d="M19 5v14"/><path d="M21 5v14"/>',
  ),
  list: svg(
    '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  ),
  choice: svg(
    '<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
  ),
  tree: svg(
    '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v4"/><path d="M6 15v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>',
  ),
  table: svg(
    '<path d="M3 5h18v14H3z"/><path d="M3 10h18"/><path d="M3 15h18"/><path d="M9 5v14"/><path d="M15 5v14"/>',
  ),
  pivotTable: svg(
    '<path d="M3 5h18v14H3z"/><path d="M3 10h18"/><path d="M9 5v14"/><path d="M3 15h6"/><path d="m14 13 2 2 4-4"/>',
  ),
  child: svg(
    '<circle cx="12" cy="7" r="3"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><path d="M16 11h5"/><path d="M18.5 8.5v5"/>',
  ),
};

export function getPaletteIcon(type: string): string | null {
  return PALETTE_ICONS[type] ?? null;
}
