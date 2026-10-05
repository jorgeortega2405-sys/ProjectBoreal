import { navigate } from '../app-router.js';
import { loadTemplate } from '../services/template.service.js';

export class NotFoundController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    const btn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-404-home"]');
    btn?.addEventListener('click', () => navigate('/'), { signal: this.abortController.signal });
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createNotFoundView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/error/404.html');
  const controller = new NotFoundController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
