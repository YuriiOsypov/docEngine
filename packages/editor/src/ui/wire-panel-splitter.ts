const COOKIE_PREFIX = 'doc-editor.panel-split.';
const LOCAL_STORAGE_PREFIX = 'doc-editor.panel-split.';
const SIDE_PANEL_STORAGE_PREFIX = 'doc-editor.design-shell-panels.';

function clamp(value: any, min: any, max: any) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {number[]} sizes
 * @param {number} minSizePercent
 * @returns {number[] | null}
 */
function normalizeSizes(sizes: any, minSizePercent: any) {
  if (!Array.isArray(sizes) || sizes.length !== 3) return null;

  const parsed = sizes.map((value: any) => Number(value));
  if (parsed.some((value: any) => !Number.isFinite(value) || value <= 0)) return null;

  const total = parsed.reduce((sum: any, value: any) => sum + value, 0);
  if (total <= 0) return null;

  const normalized = parsed.map((value: any) => (value / total) * 100);
  if (normalized.some((value: any) => value < minSizePercent)) return null;

  return normalized;
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} cookieKey
 * @returns {number[] | null}
 */
export function readPanelSplitCookie(cookieKey: any) {
  if (!cookieKey || typeof document === 'undefined') return null;

  const cookieString = document.cookie ?? '';
  const raw = cookieString
    .split(';')
    .map((part: any) => part.trim())
    .find((part: any) => part.startsWith(`${COOKIE_PREFIX}${cookieKey}=`));

  if (!raw) return null;

  const value = decodeURIComponent(raw.slice(raw.indexOf('=') + 1));
  const parts = value.split('x').map((part: any) => Number(part));
  return normalizeSizes(parts, 10);
}

/**
 * @param {string} cookieKey
 * @param {number[]} sizes
 */
export function writePanelSplitCookie(cookieKey: any, sizes: any) {
  if (!cookieKey || typeof document === 'undefined') return;
  if (typeof document.cookie !== 'string') return;

  const normalized = normalizeSizes(sizes, 10);
  if (!normalized) return;

  const name = `${COOKIE_PREFIX}${cookieKey}`;
  const maxAge = 60 * 60 * 24 * 365;
  const payload = normalized.map((value: any) => Math.round(value * 10) / 10).join('x');
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(payload)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * @param {string} storageKey
 * @returns {number[] | null}
 */
export function readPanelSplitLocalStorage(storageKey: any) {
  if (!storageKey) return null;
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${LOCAL_STORAGE_PREFIX}${storageKey}`);
    if (!raw) return null;
    const parts = raw.split('x').map((part: any) => Number(part));
    return normalizeSizes(parts, 10);
  } catch {
    return null;
  }
}

/**
 * @param {string} storageKey
 * @param {number[]} sizes
 */
export function writePanelSplitLocalStorage(storageKey: any, sizes: any) {
  if (!storageKey) return;
  const storage = getLocalStorage();
  if (!storage) return;
  const normalized = normalizeSizes(sizes, 10);
  if (!normalized) return;
  try {
    const payload = normalized.map((value: any) => Math.round(value * 10) / 10).join('x');
    storage.setItem(`${LOCAL_STORAGE_PREFIX}${storageKey}`, payload);
  } catch {
    // quota / private mode
  }
}

/**
 * @param {string} storageKey
 * @returns {{ left: number, right: number } | null}
 */
export function readSidePanelWidths(storageKey: any) {
  if (!storageKey) return null;
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${SIDE_PANEL_STORAGE_PREFIX}${storageKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const left = Number(parsed?.left);
    const right = Number(parsed?.right);
    if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return null;
    return { left, right };
  } catch {
    return null;
  }
}

/**
 * @param {string} storageKey
 * @param {{ left: number, right: number }} widths
 */
export function writeSidePanelWidths(storageKey: any, widths: any) {
  if (!storageKey || !widths) return;
  const storage = getLocalStorage();
  if (!storage) return;
  const left = Math.round(Number(widths.left));
  const right = Math.round(Number(widths.right));
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return;
  try {
    storage.setItem(`${SIDE_PANEL_STORAGE_PREFIX}${storageKey}`, JSON.stringify({ left, right }));
  } catch {
    // quota / private mode
  }
}

/**
 * @param {HTMLElement} panel
 * @param {number} sizePercent
 */
function applyPanelSize(panel: any, sizePercent: any) {
  const rounded = Math.round(sizePercent * 10) / 10;
  panel.style.flex = `0 0 ${rounded}%`;
  panel.style.width = `${rounded}%`;
  panel.style.minWidth = '0';
}

/**
 * Wire draggable splitters between three panels and persist sizes.
 * @param {HTMLElement | null | undefined} container
 * @param {{
 *   cookieKey?: string,
 *   storageKey?: string,
 *   storage?: 'cookie' | 'localStorage',
 *   defaultSizes?: number[],
 *   minSizePercent?: number,
 *   panelSelector?: string,
 *   splitterSelector?: string,
 * }} options
 */
export function wirePanelSplitter(container: any, options: any = {}) {
  const {
    cookieKey,
    storageKey = cookieKey,
    storage = cookieKey ? 'cookie' : 'localStorage',
    defaultSizes = [25, 50, 25],
    minSizePercent = 15,
    panelSelector = '.field-mapping-panel',
    splitterSelector = '.field-mapping-splitter',
  } = options;

  if (!container || !storageKey) return;

  const panels = [...container.querySelectorAll(panelSelector)];
  const splitters = [...container.querySelectorAll(splitterSelector)];
  if (panels.length !== 3 || splitters.length !== 2) return;

  const defaults = normalizeSizes(defaultSizes, minSizePercent) ?? [25, 50, 25];
  /** @type {number[]} */
  let sizes =
    (storage === 'localStorage'
      ? readPanelSplitLocalStorage(storageKey)
      : readPanelSplitCookie(storageKey)) ?? [...defaults];

  function applySizes() {
    panels.forEach((panel: any, index: any) => {
      applyPanelSize(panel, sizes[index] ?? defaults[index]);
    });
  }

  function persistSizes() {
    if (storage === 'localStorage') writePanelSplitLocalStorage(storageKey, sizes);
    else writePanelSplitCookie(storageKey, sizes);
  }

  applySizes();

  splitters.forEach((splitter: any, index: any) => {
    splitter.addEventListener('pointerdown', (event: any) => {
      if (event.button != null && event.button !== 0) return;
      if (event.isPrimary === false) return;
      event.preventDefault();
      event.stopPropagation();

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startSizes = [...sizes];
      const totalWidth = container.clientWidth || 1;

      splitter.classList.add('field-mapping-splitter--active');
      document.body.classList.add('field-mapping-split-active');
      try {
        splitter.setPointerCapture(pointerId);
      } catch {
        // linkedom / browsers without capture
      }

      function onMove(moveEvent: any) {
        if (moveEvent.pointerId !== pointerId) return;
        const deltaPct = ((moveEvent.clientX - startX) / totalWidth) * 100;

        if (index === 0) {
          const maxLeft = startSizes[0] + startSizes[1] - minSizePercent;
          const nextLeft = clamp(startSizes[0] + deltaPct, minSizePercent, maxLeft);
          const applied = nextLeft - startSizes[0];
          sizes = [nextLeft, startSizes[1] - applied, startSizes[2]];
        } else {
          const maxCenter = startSizes[1] + startSizes[2] - minSizePercent;
          const nextCenter = clamp(startSizes[1] + deltaPct, minSizePercent, maxCenter);
          const applied = nextCenter - startSizes[1];
          sizes = [startSizes[0], nextCenter, startSizes[2] - applied];
        }

        applySizes();
      }

      function onUp(upEvent: any) {
        if (upEvent.pointerId !== pointerId) return;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        splitter.classList.remove('field-mapping-splitter--active');
        document.body.classList.remove('field-mapping-split-active');
        try {
          if (splitter.hasPointerCapture?.(pointerId)) splitter.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
        persistSizes();
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  });
}

/**
 * Wire left/right side-panel splitters (pixel widths) and persist in localStorage.
 * Center panel fills remaining space via CSS grid.
 * @param {HTMLElement | null | undefined} shell
 * @param {{
 *   storageKey: string,
 *   leftPanel: HTMLElement,
 *   rightPanel: HTMLElement,
 *   leftSplitter: HTMLElement,
 *   rightSplitter: HTMLElement,
 *   defaultLeft?: number,
 *   defaultRight?: number,
 *   minLeft?: number,
 *   maxLeft?: number,
 *   minRight?: number,
 *   maxRight?: number,
 * }} options
 */
export function wireSidePanelSplitters(shell: any, options: any = {}) {
  const {
    storageKey,
    leftPanel,
    rightPanel,
    leftSplitter,
    rightSplitter,
    defaultLeft = 220,
    defaultRight = 300,
    minLeft = 160,
    maxLeft = 480,
    minRight = 220,
    maxRight = 560,
  } = options;

  if (!shell || !storageKey || !leftPanel || !rightPanel || !leftSplitter || !rightSplitter) return;

  const saved = readSidePanelWidths(storageKey);
  let left = clamp(saved?.left ?? defaultLeft, minLeft, maxLeft);
  let right = clamp(saved?.right ?? defaultRight, minRight, maxRight);

  function applyWidths() {
    shell.style.setProperty('--me-design-shell-left', `${Math.round(left)}px`);
    shell.style.setProperty('--me-design-shell-right', `${Math.round(right)}px`);
  }

  function persist() {
    writeSidePanelWidths(storageKey, { left, right });
  }

  applyWidths();

  function bindSplitter(splitter: any, side: 'left' | 'right') {
    splitter.addEventListener('pointerdown', (event: any) => {
      if (event.button != null && event.button !== 0) return;
      if (event.isPrimary === false) return;
      event.preventDefault();
      event.stopPropagation();

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startLeft = left;
      const startRight = right;
      const shellWidth = shell.clientWidth || 1;
      const minCenter = 280;
      const maxForSide =
        side === 'left'
          ? Math.min(maxLeft, shellWidth - right - minCenter)
          : Math.min(maxRight, shellWidth - left - minCenter);

      splitter.classList.add('design-shell-splitter--active');
      document.body.classList.add('design-shell-split-active');
      try {
        splitter.setPointerCapture(pointerId);
      } catch {
        // linkedom / browsers without capture
      }

      function onMove(moveEvent: any) {
        if (moveEvent.pointerId !== pointerId) return;
        const delta = moveEvent.clientX - startX;
        if (side === 'left') {
          left = clamp(startLeft + delta, minLeft, Math.max(minLeft, maxForSide));
        } else {
          right = clamp(startRight - delta, minRight, Math.max(minRight, maxForSide));
        }
        applyWidths();
      }

      function onUp(upEvent: any) {
        if (upEvent.pointerId !== pointerId) return;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        splitter.classList.remove('design-shell-splitter--active');
        document.body.classList.remove('design-shell-split-active');
        try {
          if (splitter.hasPointerCapture?.(pointerId)) splitter.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
        persist();
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  bindSplitter(leftSplitter, 'left');
  bindSplitter(rightSplitter, 'right');
}
