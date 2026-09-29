import { getFieldTypes } from '../fields/handlers/index.js';
import { getPaletteIcon } from '../ui/palette-icons.js';

let paletteDragActive = false;

export function isPaletteDragSessionActive() {
  return paletteDragActive;
}

export const PALETTE_DRAG_MIME = 'application/x-doc-editor-palette';
export const PALETTE_BLOCK_MIME = 'application/x-doc-editor-palette-block';

export const STRUCTURE_ITEMS = [
  { kind: 'block', type: 'documentSection', label: 'Section', hint: 'Drop between blocks' },
  { kind: 'layout', type: 'columns', label: 'Columns', hint: 'Drop inside a section' },
];

/** Live list of registered field plugins (prefer calling getFieldTypes()). */
export { getFieldTypes };

/** @deprecated Prefer getFieldTypes() so host-registered field plugins are included. */
export const FIELD_TYPES = getFieldTypes();

export function getPaletteItems() {
  return [...STRUCTURE_ITEMS, ...getFieldTypes()];
}

/** @deprecated Prefer getPaletteItems() */
export const PALETTE_ITEMS = getPaletteItems();

export function serializePaletteDrag(item: any) {
  return JSON.stringify({ kind: item.kind, type: item.type });
}

export function parsePaletteDrag(dataTransfer: any) {
  const raw = dataTransfer.getData(PALETTE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.kind || !parsed?.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {(item: { kind: string, type: string, label: string }) => void} onAddItem
 * @param {{ layout?: 'horizontal' | 'vertical' }} [options]
 */
export function createFieldPalette(onAddItem: any,options: any = {}) {
  const layout = options.layout ?? 'horizontal';
  const excludeTypes = new Set(options.excludeTypes ?? []);
  const fieldItems = getFieldTypes().filter((item: any) => !excludeTypes.has(item.type));
  const bar = document.createElement('div');
  bar.className = layout === 'vertical' ? 'field-palette field-palette--vertical' : 'field-palette';

  if (layout === 'vertical') {
    const header = document.createElement('div');
    header.className = 'field-palette__header';
    const headerTitle = document.createElement('span');
    headerTitle.className = 'field-palette__title';
    headerTitle.textContent = 'Source';
    header.appendChild(headerTitle);
    bar.appendChild(header);

    const body = document.createElement('div');
    body.className = 'field-palette__body';

    const structureGroup = document.createElement('div');
    structureGroup.className = 'field-palette__group';
    const structureTitle = document.createElement('div');
    structureTitle.className = 'field-palette__group-title';
    structureTitle.textContent = 'Structure';
    structureGroup.appendChild(structureTitle);

    for (const item of STRUCTURE_ITEMS) {
      structureGroup.appendChild(createPaletteItem(item, onAddItem, { draggable: true }));
    }
    body.appendChild(structureGroup);

    const fieldsGroup = document.createElement('div');
    fieldsGroup.className = 'field-palette__group';
    const fieldsTitle = document.createElement('div');
    fieldsTitle.className = 'field-palette__group-title';
    fieldsTitle.textContent = 'Fields';
    fieldsGroup.appendChild(fieldsTitle);

    for (const item of fieldItems) {
      fieldsGroup.appendChild(createPaletteItem(item, onAddItem, { draggable: true }));
    }
    body.appendChild(fieldsGroup);
    bar.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'field-palette__footer';
    const hint = document.createElement('p');
    hint.className = 'field-palette__hint';
    hint.textContent = 'Drag into the editor or click to insert at caret.';
    footer.appendChild(hint);
    bar.appendChild(footer);
  } else {
    const title = document.createElement('span');
    title.className = 'field-palette__title';
    title.textContent = 'Add block:';
    bar.appendChild(title);

    for (const item of fieldItems) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-palette';
      btn.textContent = item.label;
      btn.dataset.fieldType = item.type;
      btn.addEventListener('click', () => onAddItem(item));
      bar.appendChild(btn);
    }

    const hint = document.createElement('span');
    hint.className = 'field-palette__hint';
    hint.textContent =
      'Click to select · Ctrl+click multi-select · Double-click to edit · Ctrl+C/X/V';
    bar.appendChild(hint);
  }

  return { element: bar };
}

function createPaletteItem(item: any,onAddItem: any,{ draggable = false }: any = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'field-palette__item';
  btn.dataset.paletteKind = item.kind;
  btn.dataset.paletteType = item.type;

  const iconHtml = getPaletteIcon(item.type);
  if (iconHtml) {
    const icon = document.createElement('span');
    icon.className = 'field-palette__item-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconHtml;
    btn.appendChild(icon);
  }

  const label = document.createElement('span');
  label.className = 'field-palette__item-label';
  label.textContent = item.label;
  btn.appendChild(label);

  if (item.hint) {
    btn.title = item.hint;
  }

  btn.addEventListener('click', () => onAddItem(item));

  if (draggable) {
    btn.draggable = true;
    btn.addEventListener('dragstart', (e: any) => {
      paletteDragActive = true;
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData(PALETTE_DRAG_MIME, serializePaletteDrag(item));
      e.dataTransfer.setData('text/plain', '');
      if (item.kind === 'block') {
        e.dataTransfer.setData(PALETTE_BLOCK_MIME, item.type);
      }
      btn.classList.add('field-palette__item--dragging');
    });
    btn.addEventListener('dragend', () => {
      paletteDragActive = false;
      btn.classList.remove('field-palette__item--dragging');
    });
  }

  return btn;
}
