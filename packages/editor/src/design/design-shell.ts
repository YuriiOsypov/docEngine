import { wireSidePanelSplitters } from '../ui/wire-panel-splitter.js';

/**
 * Mount a 3-column design-mode shell around the editor holder.
 * @param {HTMLElement} holder
 */
export function createDesignShell(holder: any) {
  const shell = document.createElement('div');
  shell.className = 'design-shell';

  const left = document.createElement('aside');
  left.className = 'design-panel design-panel--left';
  left.setAttribute('aria-label', 'Source');

  const leftSplitter = document.createElement('div');
  leftSplitter.className = 'design-shell-splitter';
  leftSplitter.setAttribute('role', 'separator');
  leftSplitter.setAttribute('aria-orientation', 'vertical');
  leftSplitter.setAttribute('aria-label', 'Resize Source panel');
  leftSplitter.tabIndex = 0;

  const center = document.createElement('div');
  center.className = 'design-panel design-panel--center';

  const rightSplitter = document.createElement('div');
  rightSplitter.className = 'design-shell-splitter';
  rightSplitter.setAttribute('role', 'separator');
  rightSplitter.setAttribute('aria-orientation', 'vertical');
  rightSplitter.setAttribute('aria-label', 'Resize Properties panel');
  rightSplitter.tabIndex = 0;

  const right = document.createElement('aside');
  right.className = 'design-panel design-panel--right';
  right.setAttribute('aria-label', 'Properties');

  const parent = holder.parentElement;
  if (!parent) throw new Error('createDesignShell: holder has no parent');

  parent.insertBefore(shell, holder);
  shell.append(left, leftSplitter, center, rightSplitter, right);
  center.appendChild(holder);

  wireSidePanelSplitters(shell, {
    storageKey: 'design-mode',
    leftPanel: left,
    rightPanel: right,
    leftSplitter,
    rightSplitter,
    defaultLeft: 220,
    defaultRight: 300,
  });

  return {
    element: shell,
    leftPanel: left,
    centerPanel: center,
    rightPanel: right,
    leftSplitter,
    rightSplitter,
    show() {
      shell.classList.add('design-shell--active');
      document.body.classList.add('design-mode--panels');
    },
    hide() {
      shell.classList.remove('design-shell--active');
      document.body.classList.remove('design-mode--panels');
    },
    destroy() {
      this.hide();
      if (holder.parentElement === center) {
        parent.insertBefore(holder, shell);
      }
      shell.remove();
    },
  };
}
