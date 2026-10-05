import { navigate } from '../app-router.js';
import { fetchWinnersGiveaways } from '../services/giveaways.service.js';
import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { WinnerGiveawayItem } from '../types/giveaway.types.js';
import { removeEmptyState, renderEmptyState } from '../utils/dom.util.js';
import { formatNumber } from '../utils/number.util.js';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch (_) {
    return '';
  }
}

export class WinnersView {
  private abortController = new AbortController();
  private allWinners: WinnerGiveawayItem[] = [];
  private filteredWinners: WinnerGiveawayItem[] = [];
  private root: HTMLElement | null = null;
  private searchQuery = '';

  public async init(): Promise<HTMLElement> {
    const el = await loadTemplate('/views/winners/winners.html');
    this.root = el;

    translateElement(this.root);
    renderIcons(this.root);

    this.bindEvents();
    void this.loadWinners();

    return this.root;
  }

  public destroy(): void {
    this.abortController.abort();
    this.root = null;
    this.allWinners = [];
    this.filteredWinners = [];
  }

  private bindEvents(): void {
    if (!this.root) return;
    const { signal } = this.abortController;

    const searchInput = this.root.querySelector<HTMLInputElement>('[data-ref="winners-search-input"]');
    const clearBtn = this.root.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');

    searchInput?.addEventListener(
      'input',
      () => {
        this.searchQuery = (searchInput.value || '').trim().toLowerCase();
        if (clearBtn) {
          clearBtn.classList.toggle('is-hidden', this.searchQuery.length === 0);
        }
        this.applyFilter();
      },
      { signal }
    );

    clearBtn?.addEventListener(
      'click',
      () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        this.searchQuery = '';
        clearBtn.classList.add('is-hidden');
        this.applyFilter();
      },
      { signal }
    );

    const grid = this.root.querySelector<HTMLElement>('[data-ref="winners-grid"]');
    grid?.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement | null;
        const card = target?.closest<HTMLElement>('.canvas-card');
        if (card) {
          e.preventDefault();
          const uuid = card.dataset.uuid;
          if (uuid) {
            navigate(`/s/${uuid}`);
          }
        }
      },
      { signal }
    );
  }

  private async loadWinners(): Promise<void> {
    if (!this.root) return;

    const loadingEl = this.root.querySelector<HTMLElement>('[data-ref="winners-loading"]');
    const winners = await fetchWinnersGiveaways();
    this.allWinners = winners;
    this.filteredWinners = winners;

    if (loadingEl) {
      loadingEl.classList.add('is-hidden');
      loadingEl.remove();
    }

    this.renderCards();
  }

  private applyFilter(): void {
    if (!this.searchQuery) {
      this.filteredWinners = [...this.allWinners];
    } else {
      const q = this.searchQuery;
      this.filteredWinners = this.allWinners.filter((item) => {
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const winnerMatch = (item.winner_name || '').toLowerCase().includes(q);
        const ticketMatch = String(item.winner_ticket_number || '').includes(q);
        const stateMatch = (item.customer_state || '').toLowerCase().includes(q);
        return titleMatch || winnerMatch || ticketMatch || stateMatch;
      });
    }

    this.renderCards();
  }

  private renderCards(): void {
    if (!this.root) return;

    const grid = this.root.querySelector<HTMLElement>('[data-ref="winners-grid"]');
    if (!grid) return;

    if (this.filteredWinners.length === 0) {
      grid.innerHTML = '';
      if (this.searchQuery) {
        renderEmptyState({
          container: grid,
          dataRef: 'winners-empty-state',
          desc: t('winners.search_no_results_desc') || t('winners.no_results') || 'No se encontraron sorteos o ganadores que coincidan con tu búsqueda.',
          graphicType: 'search',
          title: t('winners.search_no_results_title') || 'Sin resultados',
        });
      } else {
        renderEmptyState({
          container: grid,
          dataRef: 'winners-empty-state',
          desc: t('winners.empty_desc') || 'Los ganadores de nuestros sorteos activos aparecerán aquí inmediatamente después de la selección oficial y la entrega.',
          graphicType: 'trophy',
          title: t('winners.empty_title') || 'Aún no hay sorteos concluidos',
        });
      }
      return;
    }

    removeEmptyState(grid, 'winners-empty-state');

    let html = '';
    for (const item of this.filteredWinners) {
      const imgUrl = item.primary_image_url || (item.image_urls && item.image_urls[0]) || '/images/card-fallback.jpg';
      const formattedDate = formatDate(item.winner_announced_at || item.draw_date || item.end_date);
      const winnerName = item.winner_name || t('winners.official_winner');
      const ticketNum = item.winner_ticket_number !== null ? `#${formatNumber(item.winner_ticket_number)}` : 'N/A';
      const location = item.customer_state ? escapeHtml(item.customer_state) : 'México';

      html += `
        <div class="canvas-card" data-ref="card-winner-${item.uuid}" data-uuid="${escapeHtml(item.uuid)}">
          <div class="canvas-card__thumbnail">
            <img class="canvas-card__image" data-ref="card-img-${item.uuid}" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />
            <div class="giveaway-card__meta-badge" data-ref="card-ticket-${item.uuid}">${escapeHtml(ticketNum)}</div>
            <span class="canvas-card__btn-sync" data-ref="card-btn-sync-${item.uuid}">${escapeHtml(t('winners.view_giveaway'))}</span>
            <div class="giveaway-card__timer-badge" data-ref="card-winner-badge-${item.uuid}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#emoji_events"></use></svg>
              <span>${escapeHtml(winnerName)}</span>
            </div>
          </div>
          <div class="canvas-card__info">
            <h3 class="canvas-card__name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
            <div class="canvas-card__meta">
              <span class="canvas-card__category-icon" title="${escapeHtml(location)}" aria-label="${escapeHtml(location)}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#location_on"></use></svg>
              </span>
              <span>${escapeHtml(location)}${formattedDate ? ` • ${escapeHtml(formattedDate)}` : ''}</span>
            </div>
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
    renderIcons(grid);
  }
}

export async function createWinnersView(): Promise<HTMLElement> {
  const view = new WinnersView();
  return await view.init();
}
