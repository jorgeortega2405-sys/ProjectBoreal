import { loadTemplate } from '../services/template.service.js';

export class DashboardController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents(this.container);
  }

  private bindEvents(_view: HTMLElement): void {
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createDashboardView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/dashboard/dashboard.html');
  const controller = new DashboardController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
