import { navigate } from '../app-router.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';

export class LegalController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindBackButton();
  }

  private bindBackButton(): void {
    const signal = this.abortController?.signal;
    const btn = this.container.querySelector<HTMLElement>('[data-ref="btn-back-help"]');
    btn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/help');
      },
      { signal }
    );
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createLegalView(templateName: string): Promise<HTMLElement> {
  const container = await loadTemplate(`/views/legal/${templateName}.html`);
  const controller = new LegalController(container);
  await controller.init();
  renderIcons(container);
  (container as any).__controller = controller;
  return container;
}
