import { navigate } from '../app-router.js';
import { t } from '../services/i18n.service.js';
import { loadTemplate } from '../services/template.service.js';
import { renderEmptyState } from '../utils/dom.util.js';

export class DrawingController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="drawing-workspace"]');
    if (workspace) {
      const emptyState = renderEmptyState({
        container: workspace,
        dataRef: 'drawing-empty-state',
        desc: t('drawing.workspace_placeholder') || 'Actualmente no hay ninguna extracción o sorteo en vivo.',
        graphicType: 'drawing',
        title: t('drawing.no_active_drawing_title') || 'Espacio de Sorteo',
      });

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'component-button component-button--black component-button--h44';
      actionBtn.setAttribute('data-ref', 'btn-drawing-explore');
      actionBtn.textContent = t('nav.home') || 'Explorar Sorteos Activos';
      actionBtn.addEventListener(
        'click',
        () => {
          navigate('/');
        },
        { signal: this.abortController.signal }
      );
      emptyState.appendChild(actionBtn);
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createDrawingView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/drawing/drawing.html');
  const controller = new DrawingController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
