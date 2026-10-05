import { navigate } from '../app-router.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';

export class HelpController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentCategory = 'all';
  private searchQuery = '';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindAccordion();
    this.bindCategoryFilters();
    this.bindSearch();
    this.bindLegalCards();
  }

  private bindAccordion(): void {
    const signal = this.abortController?.signal;
    const triggers = this.container.querySelectorAll<HTMLElement>('[data-ref="faq-trigger"]');

    triggers.forEach((trigger) => {
      trigger.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const item = trigger.closest<HTMLElement>('[data-ref="faq-item"]');
          if (!item) return;

          const isOpen = item.classList.contains('is-open');
          const allItems = this.container.querySelectorAll<HTMLElement>('[data-ref="faq-item"]');
          allItems.forEach((other) => {
            if (other !== item) other.classList.remove('is-open');
          });

          item.classList.toggle('is-open', !isOpen);
        },
        { signal }
      );
    });
  }

  private bindCategoryFilters(): void {
    const signal = this.abortController?.signal;
    const pills = this.container.querySelectorAll<HTMLButtonElement>('[data-category]');

    pills.forEach((pill) => {
      pill.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const category = pill.getAttribute('data-category') || 'all';
          this.currentCategory = category;

          pills.forEach((p) => p.classList.toggle('is-active', p === pill));
          this.filterItems();
        },
        { signal }
      );
    });
  }

  private bindSearch(): void {
    const signal = this.abortController?.signal;
    const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-help-search"]');
    if (!input) return;

    input.addEventListener(
      'input',
      () => {
        this.searchQuery = input.value.trim().toLowerCase();
        this.filterItems();
      },
      { signal }
    );
  }

  private bindLegalCards(): void {
    const signal = this.abortController?.signal;
    const cards = this.container.querySelectorAll<HTMLElement>('[data-path]');

    cards.forEach((card) => {
      card.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const path = card.getAttribute('data-path');
          if (path) navigate(path);
        },
        { signal }
      );
    });
  }

  private filterItems(): void {
    const items = this.container.querySelectorAll<HTMLElement>('[data-ref="faq-item"]');

    items.forEach((item) => {
      const itemCategory = item.getAttribute('data-category') || '';
      const text = item.textContent?.toLowerCase() || '';

      const matchesCategory = this.currentCategory === 'all' || itemCategory === this.currentCategory;
      const matchesSearch = !this.searchQuery || text.includes(this.searchQuery);

      if (matchesCategory && matchesSearch) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
        item.classList.remove('is-open');
      }
    });
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createHelpView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/help/help.html');
  const controller = new HelpController(container);
  await controller.init();
  renderIcons(container);
  (container as any).__controller = controller;
  return container;
}
