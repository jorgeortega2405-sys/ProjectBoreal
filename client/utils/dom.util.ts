import { EmptyIllustrationKey, getEmptyIllustration } from '../graphics/empty-illustrations.graphics.js';

export interface RenderEmptyStateOptions {
  container: HTMLElement;
  dataRef?: string;
  desc: string;
  graphicType: string | EmptyIllustrationKey;
  isTable?: boolean;
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

export { getEmptyIllustration };
