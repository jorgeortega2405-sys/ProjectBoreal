import { openModal } from '../components/modal.component.js';
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
  deliveryStatus: 'pending_contact' | 'contacted' | 'claimed' | 'delivered' | null;
  evidenceImageUrl: string | null;
  giveawayTitle: string;
  location: string;
  phone: string;
  prize: string;
  sortTimestamp: number;
  testimonial: string | null;
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
    await this.loadWinners();

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
          deliveryStatus: null,
          evidenceImageUrl: null,
          giveawayTitle: item.title || t('giveaway.daily_badge'),
          location: item.customer_state || item.customer_city || t('winners.default_country'),
          phone: item.customer_phone_masked || '•• •• •• --',
          prize: formatCurrency(item.prize_amount || 0, 'MXN'),
          sortTimestamp: dateStr ? new Date(dateStr).getTime() : 0,
          testimonial: null,
          ticketNumber: ticketNum,
          uuid: item.uuid,
          winnerName: item.winner_name || t('winners.default_participant'),
        });
      }

      for (const item of standard) {
        if (!item.winner_ticket_number || item.winner_name === 'Sin participantes') continue;
        const existing = winnersMap.get(item.uuid);
        if (existing) {
          existing.deliveryStatus = item.delivery_status || existing.deliveryStatus;
          existing.evidenceImageUrl = item.evidence_image_url || existing.evidenceImageUrl;
          existing.testimonial = item.testimonial || existing.testimonial;
          if (item.prize_amount && item.prize_amount > 0) {
            existing.prize = formatCurrency(item.prize_amount, item.currency || 'MXN');
          }
        } else {
          const ticketNum = `#${formatNumber(item.winner_ticket_number)}`;
          const dateStr = item.winner_announced_at || item.draw_date || item.end_date || '';
          const formattedPrize =
            item.prize_amount !== null && item.prize_amount !== undefined && item.prize_amount > 0
              ? formatCurrency(item.prize_amount, item.currency || 'MXN')
              : item.title;
          winnersMap.set(item.uuid, {
            date: formatDate(dateStr),
            deliveryStatus: item.delivery_status || null,
            evidenceImageUrl: item.evidence_image_url || null,
            giveawayTitle: item.title,
            location: item.customer_state || t('winners.default_country'),
            phone: '•• •• •• --',
            prize: formattedPrize,
            sortTimestamp: dateStr ? new Date(dateStr).getTime() : 0,
            testimonial: item.testimonial || null,
            ticketNumber: ticketNum,
            uuid: item.uuid,
            winnerName: item.winner_name || t('winners.default_participant'),
          });
        }
      }

      this.allWinners = Array.from(winnersMap.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);
      this.filteredWinners = [...this.allWinners];
    } catch (_) {}

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
        const testimonialMatch = (item.testimonial || '').toLowerCase().includes(q);
        return titleMatch || winnerMatch || ticketMatch || locationMatch || phoneMatch || prizeMatch || testimonialMatch;
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
        const hasEvidence = Boolean(item.evidenceImageUrl || item.testimonial);

        return `
          <tr class="winners-table__tr" data-ref="tr-winner-${item.uuid}" data-uuid="${item.uuid}">
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
              ${hasEvidence ? `<button type="button" class="component-button component-button--h28 component-button--secondary" data-ref="btn-winner-evidence-${item.uuid}" data-uuid="${item.uuid}"><span>Ver Entrega</span></button>` : ''}
            </td>
            <td class="winners-table__td winners-table__td--date">
              <span class="component-badge component-badge--sm" data-ref="badge-date-${item.uuid}">${date}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    const evidenceButtons = tbody.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-winner-evidence-"]');
    evidenceButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uuid = btn.getAttribute('data-uuid');
        const winner = this.filteredWinners.find((w) => w.uuid === uuid);
        if (winner) {
          this.openWinnerEvidenceModal(winner);
        }
      });
    });
  }

  private openWinnerEvidenceModal(item: UnifiedWinnerItem): void {
    const body = document.createElement('div');
    body.className = 'winner-evidence-modal';

    const imageBlock = item.evidenceImageUrl
      ? item.evidenceImageUrl.toLowerCase().endsWith('.pdf')
        ? `<a class="component-button component-button--h36 component-button--secondary" data-ref="winner-evidence-pdf" href="${escapeHtml(item.evidenceImageUrl)}" target="_blank" rel="noopener noreferrer"><span>Ver Comprobante Oficial</span></a>`
        : `<div class="winner-evidence-preview" data-ref="winner-evidence-preview"><img class="winner-evidence-img" data-ref="winner-evidence-img" src="${escapeHtml(item.evidenceImageUrl)}" alt="${escapeHtml(item.giveawayTitle)}" /></div>`
      : '';

    const testimonialBlock = item.testimonial
      ? `<p class="winner-testimonial-quote" data-ref="winner-testimonial-quote">"${escapeHtml(item.testimonial)}"</p>`
      : '';

    body.innerHTML = `
      ${imageBlock}
      ${testimonialBlock}
    `;

    openModal({
      bodyHtml: body,
      cancelText: t('common.close') || 'Cerrar',
      description: `${item.winnerName} • ${item.ticketNumber} • ${item.prize}`,
      showCancel: true,
      showConfirm: false,
      size: 'md',
      title: item.giveawayTitle,
    });
  }
}

export async function createWinnersView(_initialTab?: string): Promise<HTMLElement> {
  const view = new WinnersView();
  const root = await view.init();
  (root as any).__controller = view;
  return root;
}
