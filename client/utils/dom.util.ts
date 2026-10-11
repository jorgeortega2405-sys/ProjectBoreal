import { EmptyIllustrationKey, getEmptyIllustration } from '../graphics/empty-illustrations.graphics.js';

export interface RenderEmptyStateOptions {
  actionDataRef?: string;
  actionLabel?: string;
  container: HTMLElement;
  dataRef?: string;
  desc: string;
  graphicType: string | EmptyIllustrationKey;
  isTable?: boolean;
  onAction?: (e: MouseEvent) => void;
  title: string;
}

export function getEmptyGraphicSvg(type: string | EmptyIllustrationKey): string {
  return getEmptyIllustration(type);
}

export function renderEmptyState(options: RenderEmptyStateOptions): HTMLElement {
  removeEmptyState(options.container, options.dataRef);

  const emptyEl = document.createElement('div');
  emptyEl.className = `component-empty-state${options.isTable ? ' component-empty-state--table' : ''}`;
  if (options.dataRef) {
    emptyEl.setAttribute('data-ref', options.dataRef);
  }

  const graphicEl = document.createElement('div');
  graphicEl.className = 'component-empty-state-graphic';
  graphicEl.innerHTML = getEmptyGraphicSvg(options.graphicType);

  const titleEl = document.createElement('h2');
  titleEl.className = 'component-empty-state-title';
  titleEl.textContent = options.title;

  const descEl = document.createElement('p');
  descEl.className = 'component-empty-state-desc';
  descEl.textContent = options.desc;

  emptyEl.appendChild(graphicEl);
  emptyEl.appendChild(titleEl);
  emptyEl.appendChild(descEl);

  if (options.actionLabel) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'component-button component-button--h40 component-button--secondary';
    if (options.actionDataRef) {
      actionBtn.setAttribute('data-ref', options.actionDataRef);
    }
    const spanEl = document.createElement('span');
    if (options.actionDataRef) {
      spanEl.setAttribute('data-ref', `${options.actionDataRef}-label`);
    }
    spanEl.textContent = options.actionLabel;
    actionBtn.appendChild(spanEl);
    if (options.onAction) {
      actionBtn.addEventListener('click', options.onAction);
    }
    emptyEl.appendChild(actionBtn);
  }

  options.container.appendChild(emptyEl);
  return emptyEl;
}

export function removeEmptyState(container: HTMLElement, dataRef?: string): void {
  const selector = dataRef ? `[data-ref="${dataRef}"]` : '.component-empty-state';
  const existing = container.querySelector(selector);
  if (existing) {
    existing.remove();
  }
}

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export { getEmptyIllustration };
