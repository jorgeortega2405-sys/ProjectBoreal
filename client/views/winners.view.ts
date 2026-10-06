import { navigate } from '../app-router.js';
import { fetchDailyWinners, fetchWinnersGiveaways } from '../services/giveaways.service.js';
import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { DailyGiveawayWinnerItem, WinnerGiveawayItem } from '../types/giveaway.types.js';
import { formatDate } from '../utils/date.util.js';
import { escapeHtml, removeEmptyState, renderEmptyState } from '../utils/dom.util.js';
import { formatCurrency, formatNumber } from '../utils/number.util.js';

export class WinnersView {
  private abortController = new AbortController();
  private activeTab: 'standard' | 'daily' = 'standard';
  private allDailyWinners: DailyGiveawayWinnerItem[] = [];
  private allStandardWinners: WinnerGiveawayItem[] = [];
  private filteredDailyWinners: DailyGiveawayWinnerItem[] = [];
  private filteredStandardWinners: WinnerGiveawayItem[] = [];
  private root: HTMLElement | null = null;
  private searchQuery = '';

  constructor(initialTab: string = 'standard') {
    this.activeTab = initialTab === 'daily' ? 'daily' : 'standard';
  }

  public async init(): Promise<HTMLElement> {
    const el = await loadTemplate('/views/winners/winners.html');
    this.root = el;

    translateElement(this.root);
    renderIcons(this.root);

    this.syncTabUi();
    this.bindEvents();
    void this.loadWinners();

    return this.root;
  }

  public destroy(): void {
    this.abortController.abort();
    this.root = null;
    this.allStandardWinners = [];
    this.filteredStandardWinners = [];
    this.allDailyWinners = [];
    this.filteredDailyWinners = [];
  }

  private syncTabUi(): void {
    if (!this.root) return;
    const tabStandard = this.root.querySelector<HTMLButtonElement>('[data-ref="tab-standard"]');
    const tabDaily = this.root.querySelector<HTMLButtonElement>('[data-ref="tab-daily"]');
    const standardGrid = this.root.querySelector<HTMLElement>('[data-ref="winners-grid"]');
    const dailyWrapper = this.root.querySelector<HTMLElement>('[data-ref="winners-daily-wrapper"]');

    if (tabStandard) tabStandard.classList.toggle('is-active', this.activeTab === 'standard');
    if (tabDaily) tabDaily.classList.toggle('is-active', this.activeTab === 'daily');

    if (standardGrid) {
      standardGrid.classList.toggle('is-hidden', this.activeTab !== 'standard');
      standardGrid.style.display = this.activeTab === 'standard' ? '' : 'none';
    }
    if (dailyWrapper) {
      dailyWrapper.classList.toggle('is-hidden', this.activeTab !== 'daily');
      dailyWrapper.style.display = this.activeTab === 'daily' ? 'block' : 'none';
    }
  }

  private switchTab(tab: 'standard' | 'daily'): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;

    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch (_) {}

    this.syncTabUi();
    this.renderCurrentView();
  }

  private bindEvents(): void {
    if (!this.root) return;
    const { signal } = this.abortController;

    const tabsContainer = this.root.querySelector<HTMLElement>('[data-ref="winners-tabs"]');
    tabsContainer?.addEventListener(
      'click',
      (e) => {
        const tabBtn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-tab], .winners-tab');
        if (!tabBtn) return;
        const tab = tabBtn.getAttribute('data-tab') as 'standard' | 'daily';
        if (tab && (tab === 'standard' || tab === 'daily')) {
          this.switchTab(tab);
        }
      },
      { signal }
    );

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
    try {
      const [standard, daily] = await Promise.all([
        fetchWinnersGiveaways(),
        fetchDailyWinners(50),
      ]);
      this.allStandardWinners = standard;
      this.filteredStandardWinners = standard;
      this.allDailyWinners = daily;
      this.filteredDailyWinners = daily;
    } catch (_) {}

    if (loadingEl) {
      loadingEl.classList.add('is-hidden');
      loadingEl.remove();
    }

    this.renderCurrentView();
  }

  private applyFilter(): void {
    const q = this.searchQuery;
    if (!q) {
      this.filteredStandardWinners = [...this.allStandardWinners];
      this.filteredDailyWinners = [...this.allDailyWinners];
    } else {
      this.filteredStandardWinners = this.allStandardWinners.filter((item) => {
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const winnerMatch = (item.winner_name || '').toLowerCase().includes(q);
        const ticketMatch = String(item.winner_ticket_number || '').includes(q);
        const stateMatch = (item.customer_state || '').toLowerCase().includes(q);
        return titleMatch || winnerMatch || ticketMatch || stateMatch;
      });

      this.filteredDailyWinners = this.allDailyWinners.filter((item) => {
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const winnerMatch = (item.winner_name || '').toLowerCase().includes(q);
        const ticketMatch = String(item.winner_ticket_number || '').includes(q);
        const stateMatch = (item.customer_state || '').toLowerCase().includes(q);
        const cityMatch = (item.customer_city || '').toLowerCase().includes(q);
        const phoneMatch = (item.customer_phone_masked || '').toLowerCase().includes(q);
        return titleMatch || winnerMatch || ticketMatch || stateMatch || cityMatch || phoneMatch;
      });
    }

    this.renderCurrentView();
  }

  private renderCurrentView(): void {
    if (this.activeTab === 'standard') {
      this.renderStandardCards();
    } else {
      this.renderDailyTable();
    }
  }

  private renderStandardCards(): void {
    if (!this.root) return;
    const grid = this.root.querySelector<HTMLElement>('[data-ref="winners-grid"]');
    if (!grid) return;

    if (this.filteredStandardWinners.length === 0) {
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
          graphicType: 'giveaway',
          title: t('winners.empty_title') || 'Aún no hay sorteos concluidos',
        });
      }
      return;
    }

    removeEmptyState(grid, 'winners-empty-state');

    let html = '';
    for (const item of this.filteredStandardWinners) {
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
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#verified"></use></svg>
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

  private renderDailyTable(): void {
    if (!this.root) return;
    const tbody = this.root.querySelector<HTMLElement>('[data-ref="tbody-daily-winners"]');
    const tableCard = this.root.querySelector<HTMLElement>('.winners-daily-table-card');
    if (!tbody || !tableCard) return;

    if (this.filteredDailyWinners.length === 0) {
      tableCard.style.display = 'none';
      const wrapper = this.root.querySelector<HTMLElement>('[data-ref="winners-daily-wrapper"]');
      if (wrapper) {
        removeEmptyState(wrapper, 'daily-winners-empty');
        renderEmptyState({
          container: wrapper,
          dataRef: 'daily-winners-empty',
          desc: this.searchQuery
            ? 'No se encontraron ganadores diarios que coincidan con la búsqueda ingresada.'
            : 'Los ganadores del sorteo diario aparecerán en esta tabla al concluir cada sorteo a las 23:59 hrs.',
          graphicType: this.searchQuery ? 'search' : 'giveaway',
          title: this.searchQuery ? 'Sin resultados en sorteos diarios' : 'Aún no hay ganadores diarios',
        });
      }
      return;
    }

    tableCard.style.display = 'block';
    const wrapper = this.root.querySelector<HTMLElement>('[data-ref="winners-daily-wrapper"]');
    if (wrapper) {
      removeEmptyState(wrapper, 'daily-winners-empty');
    }

    tbody.innerHTML = this.filteredDailyWinners
      .map((item) => {
        const name = escapeHtml(item.winner_name || 'Participante');
        const state = escapeHtml(item.customer_state || item.customer_city || 'México');
        const phone = escapeHtml(item.customer_phone_masked || '•• •• •• --');
        const ticketNum = item.winner_ticket_number != null ? `#${String(item.winner_ticket_number).padStart(5, '0')}` : 'N/A';
        const prize = formatCurrency(item.prize_amount || 0, 'MXN');
        const date = formatDate(item.draw_date || item.winner_announced_at);

        return `
          <tr class="winners-table__tr" data-ref="tr-daily-winner-${item.uuid}">
            <td class="winners-table__td winners-table__td--winner">
              <span class="component-badge component-badge--sm" data-ref="badge-name-${item.uuid}">${name}</span>
            </td>
            <td class="winners-table__td winners-table__td--location">
              <span class="component-badge component-badge--sm" data-ref="badge-location-${item.uuid}">🇲🇽 ${state}</span>
            </td>
            <td class="winners-table__td winners-table__td--phone">
              <span class="component-badge component-badge--sm" data-ref="badge-phone-${item.uuid}">${phone}</span>
            </td>
            <td class="winners-table__td winners-table__td--ticket">
              <span class="component-badge component-badge--sm" data-ref="badge-ticket-${item.uuid}">${ticketNum}</span>
            </td>
            <td class="winners-table__td winners-table__td--prize">
              <span class="component-badge component-badge--sm" data-ref="badge-prize-${item.uuid}">${prize}</span>
            </td>
            <td class="winners-table__td winners-table__td--date">
              <span class="component-badge component-badge--sm" data-ref="badge-date-${item.uuid}">${date}</span>
            </td>
          </tr>
        `;
      })
      .join('');
  }
}

export async function createWinnersView(initialTab = 'standard'): Promise<HTMLElement> {
  const view = new WinnersView(initialTab);
  return await view.init();
}

