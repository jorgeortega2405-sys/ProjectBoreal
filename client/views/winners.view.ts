import { fetchDailyWinners, fetchWinnersGiveaways } from '../services/giveaways.service.js';
import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { DailyGiveawayWinnerItem, WinnerGiveawayItem } from '../types/giveaway.types.js';
import { formatDate } from '../utils/date.util.js';
import { escapeHtml, removeEmptyState, renderEmptyState } from '../utils/dom.util.js';
import { formatCurrency, formatNumber } from '../utils/number.util.js';

interface UnifiedWinnerItem {
  date: string;
  giveawayTitle: string;
  location: string;
  phone: string;
  prize: string;
  sortTimestamp: number;
  ticketNumber: string;
  uuid: string;
  winnerName: string;
}

export class WinnersView {
  private abortController = new AbortController();
  private allWinners: UnifiedWinnerItem[] = [];
  private filteredWinners: UnifiedWinnerItem[] = [];
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
  }

  private async loadWinners(): Promise<void> {
    if (!this.root) return;

    const loadingEl = this.root.querySelector<HTMLElement>('[data-ref="winners-loading"]');
    try {
      const [standard, daily] = await Promise.all([
        fetchWinnersGiveaways(),
        fetchDailyWinners(100),
      ]);

      const winnersMap = new Map<string, UnifiedWinnerItem>();

      for (const item of daily) {
        if (!item.winner_ticket_number || item.winner_name === 'Sin participantes') continue;
        const ticketNum = `#${String(item.winner_ticket_number).padStart(5, '0')}`;
        const dateStr = item.draw_date || item.winner_announced_at || '';
        winnersMap.set(item.uuid, {
          date: formatDate(dateStr),
          giveawayTitle: item.title || 'Sorteo Diario',
          location: item.customer_state || item.customer_city || 'México',
          phone: item.customer_phone_masked || '•• •• •• --',
          prize: formatCurrency(item.prize_amount || 0, 'MXN'),
          sortTimestamp: dateStr ? new Date(dateStr).getTime() : 0,
          ticketNumber: ticketNum,
          uuid: item.uuid,
          winnerName: item.winner_name || 'Participante',
        });
      }

      for (const item of standard) {
        if (!item.winner_ticket_number || item.winner_name === 'Sin participantes') continue;
        if (!winnersMap.has(item.uuid)) {
          const ticketNum = `#${formatNumber(item.winner_ticket_number)}`;
          const dateStr = item.winner_announced_at || item.draw_date || item.end_date || '';
          winnersMap.set(item.uuid, {
            date: formatDate(dateStr),
            giveawayTitle: item.title,
            location: item.customer_state || 'México',
            phone: '•• •• •• --',
            prize: item.title,
            sortTimestamp: dateStr ? new Date(dateStr).getTime() : 0,
            ticketNumber: ticketNum,
            uuid: item.uuid,
            winnerName: item.winner_name || 'Participante',
          });
        }
      }

      this.allWinners = Array.from(winnersMap.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);
      this.filteredWinners = [...this.allWinners];
    } catch (_) {}

    if (loadingEl) {
      loadingEl.classList.add('is-hidden');
      loadingEl.remove();
    }

    this.renderTable();
  }

  private applyFilter(): void {
    const q = this.searchQuery;
    if (!q) {
      this.filteredWinners = [...this.allWinners];
    } else {
      this.filteredWinners = this.allWinners.filter((item) => {
        const titleMatch = item.giveawayTitle.toLowerCase().includes(q);
        const winnerMatch = item.winnerName.toLowerCase().includes(q);
        const ticketMatch = item.ticketNumber.toLowerCase().includes(q);
        const locationMatch = item.location.toLowerCase().includes(q);
        const phoneMatch = item.phone.toLowerCase().includes(q);
        const prizeMatch = item.prize.toLowerCase().includes(q);
        return titleMatch || winnerMatch || ticketMatch || locationMatch || phoneMatch || prizeMatch;
      });
    }

    this.renderTable();
  }

  private renderTable(): void {
    if (!this.root) return;
    const tbody = this.root.querySelector<HTMLElement>('[data-ref="tbody-winners"]');
    const tableCard = this.root.querySelector<HTMLElement>('[data-ref="winners-table-card"]');
    const wrapper = this.root.querySelector<HTMLElement>('[data-ref="winners-table-wrapper"]');
    if (!tbody || !tableCard || !wrapper) return;

    if (this.filteredWinners.length === 0) {
      tableCard.classList.add('is-hidden');
      removeEmptyState(wrapper, 'winners-empty');
      renderEmptyState({
        container: wrapper,
        dataRef: 'winners-empty',
        desc: this.searchQuery
          ? t('winners.search_no_results_desc') || 'No se encontraron ganadores que coincidan con la búsqueda ingresada.'
          : t('winners.empty_desc') || 'Los ganadores oficiales aparecerán en esta tabla al concluir cada sorteo.',
        graphicType: this.searchQuery ? 'search' : 'giveaway',
        title: this.searchQuery ? (t('winners.search_no_results_title') || 'Sin resultados') : (t('winners.empty_title') || 'Aún no hay ganadores registrados'),
      });
      return;
    }

    tableCard.classList.remove('is-hidden');
    removeEmptyState(wrapper, 'winners-empty');

    tbody.innerHTML = this.filteredWinners
      .map((item) => {
        const giveawayTitle = escapeHtml(item.giveawayTitle);
        const name = escapeHtml(item.winnerName);
        const location = escapeHtml(item.location);
        const phone = escapeHtml(item.phone);
        const ticketNum = escapeHtml(item.ticketNumber);
        const prize = escapeHtml(item.prize);
        const date = escapeHtml(item.date);

        return `
          <tr class="winners-table__tr" data-ref="tr-winner-${item.uuid}">
            <td class="winners-table__td winners-table__td--giveaway">
              <span class="component-badge component-badge--sm" data-ref="badge-giveaway-${item.uuid}">${giveawayTitle}</span>
            </td>
            <td class="winners-table__td winners-table__td--winner">
              <span class="component-badge component-badge--sm" data-ref="badge-name-${item.uuid}">${name}</span>
            </td>
            <td class="winners-table__td winners-table__td--location">
              <span class="component-badge component-badge--sm" data-ref="badge-location-${item.uuid}">🇲🇽 ${location}</span>
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

export async function createWinnersView(_initialTab?: string): Promise<HTMLElement> {
  const view = new WinnersView();
  return await view.init();
}
