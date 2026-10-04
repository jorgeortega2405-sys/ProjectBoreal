import { loadTemplate } from '../services/template.service.js';

export class DrawingController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
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
