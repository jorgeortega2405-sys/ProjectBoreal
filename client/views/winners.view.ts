import { navigate } from '../app-router.js';
import { fetchWinnersGiveaways } from '../services/giveaways.service.js';
import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { WinnerGiveawayItem } from '../types/giveaway.types.js';

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
        const btn = target?.closest<HTMLButtonElement>('[data-giveaway-uuid]');
        if (btn) {
          e.preventDefault();
          const uuid = btn.dataset.giveawayUuid;
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
    const emptyEl = this.root.querySelector<HTMLElement>('[data-ref="winners-empty"]');
    const emptyTitleEl = this.root.querySelector<HTMLElement>('[data-ref="winners-empty-title"]');
    const emptyDescEl = this.root.querySelector<HTMLElement>('[data-ref="winners-empty-desc"]');

    if (!grid || !emptyEl) return;

    if (this.filteredWinners.length === 0) {
      grid.innerHTML = '';
      emptyEl.removeAttribute('hidden');
      emptyEl.classList.remove('is-hidden');

      if (this.searchQuery) {
        if (emptyTitleEl) emptyTitleEl.textContent = t('winners.no_results');
        if (emptyDescEl) emptyDescEl.textContent = '';
      } else {
        if (emptyTitleEl) emptyTitleEl.textContent = t('winners.empty_title');
        if (emptyDescEl) emptyDescEl.textContent = t('winners.empty_desc');
      }
      return;
    }

    emptyEl.setAttribute('hidden', '');
    emptyEl.classList.add('is-hidden');

    let html = '';
    for (const item of this.filteredWinners) {
      const imgUrl = item.primary_image_url || (item.image_urls && item.image_urls[0]) || '/images/card-fallback.jpg';
      const formattedDate = formatDate(item.winner_announced_at || item.draw_date || item.end_date);
      const winnerName = item.winner_name || t('winners.official_winner');
      const ticketNum = item.winner_ticket_number !== null ? `#${item.winner_ticket_number}` : 'N/A';
      const location = item.customer_state ? escapeHtml(item.customer_state) : 'México';

      html += `
        <article class="winner-delivery-card" data-ref="card-winner-${item.uuid}">
          <div class="winner-delivery-card__media">
            <img class="winner-delivery-card__img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />
            <span class="winner-delivery-card__verified-badge">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>
              <span>${escapeHtml(t('winners.verified_badge'))}</span>
            </span>
            ${formattedDate ? `<span class="winner-delivery-card__date-badge">${escapeHtml(formattedDate)}</span>` : ''}
          </div>

          <div class="winner-delivery-card__body">
            <h2 class="winner-delivery-card__title">${escapeHtml(item.title)}</h2>

            <div class="winner-delivery-card__winner-strip">
              <div class="winner-delivery-card__winner-info">
                <span class="winner-delivery-card__winner-label">${escapeHtml(t('winners.winner_label'))}</span>
                <span class="winner-delivery-card__winner-name" title="${escapeHtml(winnerName)}">${escapeHtml(winnerName)}</span>
              </div>
              <div class="winner-delivery-card__ticket-box">
                <span class="winner-delivery-card__ticket-label">${escapeHtml(t('winners.ticket_label'))}</span>
                <span class="winner-delivery-card__ticket-pill">${escapeHtml(ticketNum)}</span>
              </div>
            </div>

            <div class="winner-delivery-card__meta">
              <span class="winner-delivery-card__location">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#location_on"></use></svg>
                <span>${location}</span>
              </span>
              <span>${item.total_tickets.toLocaleString('es-MX')} boletos emitidos</span>
            </div>

            <div class="winner-delivery-card__actions">
              <button type="button" class="component-button component-button--black component-button--h36 component-button--w-full" data-ref="btn-view-giveaway-${item.uuid}" data-giveaway-uuid="${escapeHtml(item.uuid)}">
                <span>${escapeHtml(t('winners.view_giveaway'))}</span>
                <svg class="component-icon component-button__icon" aria-hidden="true"><use href="/icons.svg#arrow_forward"></use></svg>
              </button>
            </div>
          </div>
        </article>
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
