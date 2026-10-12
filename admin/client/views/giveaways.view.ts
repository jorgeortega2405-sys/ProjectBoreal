import { navigate } from '../app-router.js';
import { fetchGiveaways } from '../services/giveaways.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { ViewController } from '../types/common.types.js';
import { Giveaway } from '../types/giveaway.types.js';

function getStatusBadge(item: Giveaway): { bg: string; color: string; label: string } {
  switch (item.status) {
    case 'active':
      return {
        bg: 'rgba(16, 185, 129, 0.15)',
        color: '#10b981',
        label: 'Activo',
      };
    case 'completed':
      return {
        bg: 'rgba(99, 102, 241, 0.15)',
        color: '#818cf8',
        label: 'Finalizado',
      };
    case 'paused':
      return {
        bg: 'rgba(245, 158, 11, 0.15)',
        color: '#f59e0b',
        label: 'Pausado',
      };
    case 'cancelled':
      return {
        bg: 'rgba(239, 68, 68, 0.15)',
        color: '#ef4444',
        label: 'Cancelado',
      };
    case 'draft':
    default:
      return {
        bg: 'rgba(148, 163, 184, 0.15)',
        color: '#94a3b8',
        label: 'Borrador',
      };
  }
}

class GiveawaysViewController implements ViewController {
  private abortController: AbortController | null = null;
  private element: HTMLElement;
  private filteredGiveaways: Giveaway[] = [];
  private giveaways: Giveaway[] = [];
  private selectedGiveawayUuid: string | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    await this.loadData();
    renderIcons(this.element);
  }

  private sortGiveaways(list: Giveaway[]): Giveaway[] {
    return [...list].sort((a, b) => {
      const aActive = a.status === 'active' ? 0 : 1;
      const bActive = b.status === 'active' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  private async loadData(): Promise<void> {
    const rawGiveaways = await fetchGiveaways();
    this.giveaways = this.sortGiveaways(rawGiveaways);
    this.filteredGiveaways = [...this.giveaways];
    this.renderGiveaways(this.filteredGiveaways);
  }

  private renderGiveaways(list: Giveaway[]): void {
    const grid = this.element.querySelector<HTMLElement>('[data-ref="giveaways-grid"]');
    if (!grid) return;

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" data-ref="empty-giveaways" style="grid-column: 1 / -1; text-align: center; padding: 48px 16px;">
          <p class="empty-state__text" style="color: var(--text-secondary); font-size: 15px;">No se encontraron sorteos disponibles.</p>
        </div>
      `;
      this.updateSelectionState();
      return;
    }

    grid.innerHTML = list
      .map((item) => {
        const isSelected = item.uuid === this.selectedGiveawayUuid ? ' is-selected' : '';
        const badge = getStatusBadge(item);
        const winnerSnippet = item.status === 'completed' && item.winner_name
          ? `<span>• 🏆 ${item.winner_name}</span>`
          : '';

        return `
          <div class="canvas-card${isSelected}" data-ref="card-giveaway-${item.uuid}" data-uuid="${item.uuid}">
            <div class="canvas-card__thumbnail">
              <img class="canvas-card__image" src="${item.primary_image_url}" alt="${item.title}" loading="lazy" />
              <span class="canvas-card__btn-sync" style="background: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.color}40;">
                ${badge.label}
              </span>
            </div>
            <div class="canvas-card__info">
              <h3 class="canvas-card__name" title="${item.title}">${item.title}</h3>
              <div class="canvas-card__meta">
                <span class="canvas-card__types-more">${item.available_tickets}/${item.total_tickets} boletos</span>
                <span>• $${item.ticket_price.toFixed(2)} ${item.currency}</span>
                ${winnerSnippet}
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    renderIcons(grid);
    this.updateSelectionState();
  }

  private updateSelectionState(): void {
    const btnEdit = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-edit-selected"]');
    if (btnEdit) {
      btnEdit.style.display = this.selectedGiveawayUuid ? 'inline-flex' : 'none';
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;
    const searchInput = this.element.querySelector<HTMLInputElement>('[data-ref="giveaways-search-input"]');
    const clearBtn = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    const btnCreate = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-create-giveaway"]');
    const btnEditSelected = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-edit-selected"]');
    const grid = this.element.querySelector<HTMLElement>('[data-ref="giveaways-grid"]');

    if (btnCreate) {
      btnCreate.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          navigate('/sorteo/create');
        },
        { signal }
      );
    }

    if (btnEditSelected) {
      btnEditSelected.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          if (this.selectedGiveawayUuid) {
            navigate(`/sorteo/${this.selectedGiveawayUuid}/edit`);
          }
        },
        { signal }
      );
    }

    if (searchInput) {
      searchInput.addEventListener(
        'input',
        () => {
          const query = searchInput.value.trim().toLowerCase();
          if (clearBtn) {
            clearBtn.style.display = query.length > 0 ? 'inline-flex' : 'none';
          }
          this.filteredGiveaways = query.length === 0
            ? [...this.giveaways]
            : this.giveaways.filter(
                (g) =>
                  g.title.toLowerCase().includes(query) ||
                  (g.description && g.description.toLowerCase().includes(query))
              );
          this.renderGiveaways(this.filteredGiveaways);
        },
        { signal }
      );
    }

    if (clearBtn) {
      clearBtn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
          }
          clearBtn.style.display = 'none';
          this.filteredGiveaways = [...this.giveaways];
          this.renderGiveaways(this.filteredGiveaways);
        },
        { signal }
      );
    }

    if (grid) {
      grid.addEventListener(
        'click',
        (e) => {
          const card = (e.target as HTMLElement).closest<HTMLElement>('.canvas-card');
          if (!card) return;

          const uuid = card.getAttribute('data-uuid');
          if (!uuid) return;

          if (this.selectedGiveawayUuid === uuid) {
            this.selectedGiveawayUuid = null;
            card.classList.remove('is-selected');
          } else {
            this.element.querySelectorAll('.canvas-card.is-selected').forEach((c) => {
              c.classList.remove('is-selected');
            });
            this.selectedGiveawayUuid = uuid;
            card.classList.add('is-selected');
          }

          this.updateSelectionState();
        },
        { signal }
      );
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createGiveawaysView(): Promise<HTMLElement> {
  const element = await loadTemplate('/views/giveaways/giveaways.html');
  const controller = new GiveawaysViewController(element);
  await controller.init();
  (element as any).__controller = controller;
  return element;
}
