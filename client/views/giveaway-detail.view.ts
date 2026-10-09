import { navigate } from '../app-router.js';
import { openBankInfoModal } from '../components/bank-info-modal.component.js';
import { openModal } from '../components/modal.component.js';
import { fetchGiveawayDetail, fetchGiveawayTickets } from '../services/giveaways.service.js';
import { getCurrentLanguage, t } from '../services/i18n.service.js';
import { reserveTicketsApi } from '../services/orders.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { onWebSocketEvent } from '../services/websocket.service.js';
import { Giveaway } from '../types/giveaway.types.js';
import { BankAccount, Order } from '../types/order.types.js';
import { formatShortDate } from '../utils/date.util.js';
import { escapeHtml, removeEmptyState, renderEmptyState } from '../utils/dom.util.js';
import { getCitiesForState, MEXICAN_STATES } from '../utils/mexican-locations.util.js';
import { formatCurrency, formatNumber } from '../utils/number.util.js';
import { formatMexicanPhone, normalizeMexicanPhone } from '../utils/phone.util.js';

const COUNTRY_LADAS = [
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+1', flag: '🇺🇸', name: 'EE.UU. / Canadá' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+51', flag: '🇵🇪', name: 'Perú' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+591', flag: '🇧🇴', name: 'Bolivia' },
  { code: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: '+34', flag: '🇪🇸', name: 'España' },
];

export class GiveawayDetailController {
  private abortController: AbortController | null = null;
  private activeImageUrl: string = '';
  private activePendingOrder: { bankAccounts: BankAccount[]; order: Order } | null = null;
  private allImages: string[] = [];
  private container: HTMLElement;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private currentPage: number = 1;
  private drawingPollTimer: ReturnType<typeof setInterval> | null = null;
  private giveaway: Giveaway | null = null;
  private isGalleryHovered: boolean = false;
  private pageSize: number = 100;
  private paidSet: Set<number> = new Set();
  private pendingOrderTimer: ReturnType<typeof setInterval> | null = null;
  private reservedSet: Set<number> = new Set();
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private selectedTickets: Set<number> = new Set();
  private slideshowInterval: ReturnType<typeof setInterval> | null = null;
  private ticketSearchQuery: string = '';
  private unsubscribeWs: (() => void)[] = [];
  private uuid: string;

  constructor(container: HTMLElement, uuid: string) {
    this.container = container;
    this.uuid = uuid;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindStaticEvents();
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    this.giveaway = await fetchGiveawayDetail(this.uuid);
    if (!this.giveaway) {
      this.renderNotFound();
      return;
    }

    this.setupImages();
    await this.setupTickets();
    this.renderInfo();
    this.renderGallery();
    this.renderTickets();
    this.renderPagination();
    this.updateSummary();
    this.updateCountdownDisplay();
    this.checkPendingOrderStorage();
    this.startCountdown();
    this.startGallerySlideshow();
    this.subscribeWebSocket();
    this.bindDynamicEvents();
  }

  private setupImages(): void {
    if (!this.giveaway) return;
    const list: string[] = [];
    if (this.giveaway.primary_image_url) {
      list.push(this.giveaway.primary_image_url);
    }
    if (this.giveaway.type !== 'daily' && Array.isArray(this.giveaway.image_urls)) {
      for (const url of this.giveaway.image_urls) {
        if (url && !list.includes(url)) {
          list.push(url);
        }
      }
    }
    this.allImages = list;
    this.activeImageUrl = list[0] || '';

    for (let i = 1; i < list.length; i++) {
      const preload = new Image();
      preload.src = list[i];
    }
  }

  private isSalesClosed(): boolean {
    if (!this.giveaway) return true;
    if (this.giveaway.status === 'completed' || this.giveaway.status === 'cancelled') {
      return true;
    }
    if (this.giveaway.min_threshold_pct > 0 && !this.giveaway.threshold_reached_at) {
      return false;
    }
    const endMs = new Date(this.giveaway.end_date).getTime();
    return Date.now() >= endMs - 60 * 60 * 1000;
  }

  private startCountdown(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      this.updateCountdownDisplay();
    }, 1000);
  }

  private subscribeWebSocket(): void {
    this.unsubscribeWs.push(
      onWebSocketEvent('GIVEAWAY_WINNER_DRAWN', (data) => {
        if (!this.giveaway || this.giveaway.uuid !== data.giveaway_uuid) return;
        this.stopDrawingPoll();
        this.clearPendingOrder();
        this.giveaway.status = 'completed';
        this.giveaway.winner_name = data.winner_name;
        this.giveaway.winner_ticket_number = data.winner_ticket_number;
        this.giveaway.winner_announced_at = data.winner_announced_at;
        this.renderInfo();
        this.updateCountdownDisplay();
        this.renderTickets();
        this.updateSummary();
        this.showWinnerModal(data.winner_name, data.winner_ticket_number);
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('TICKETS_RESERVED', (data) => {
        if (!this.giveaway || this.giveaway.uuid !== data.giveaway_uuid) return;
        const reservedNumbers = data.ticket_numbers || [];
        for (const num of reservedNumbers) {
          this.reservedSet.add(num);
          this.selectedTickets.delete(num);
        }
        if (typeof data.reserved_count === 'number' && this.giveaway.available_tickets !== undefined) {
          this.giveaway.available_tickets = Math.max(0, this.giveaway.available_tickets - data.reserved_count);
        }
        this.renderInfo();
        this.renderTickets();
        this.updateSummary();
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('TICKETS_RELEASED', (data) => {
        if (!this.giveaway) return;
        if (data.giveaway_uuid && this.giveaway.uuid !== data.giveaway_uuid) return;
        if (data.giveaway_id && this.giveaway.id !== data.giveaway_id) return;
        const releasedNumbers = data.ticket_numbers || [];
        for (const num of releasedNumbers) {
          this.reservedSet.delete(num);
        }
        if (typeof data.released_count === 'number' && this.giveaway.available_tickets !== undefined) {
          this.giveaway.available_tickets = Math.min(this.giveaway.total_tickets, this.giveaway.available_tickets + data.released_count);
        }
        this.renderInfo();
        this.renderTickets();
        this.updateSummary();
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('GIVEAWAY_THRESHOLD_REACHED', (data) => {
        if (!this.giveaway || this.giveaway.uuid !== data.giveaway_uuid) return;
        this.giveaway.threshold_reached_at = data.threshold_reached_at;
        this.giveaway.end_date = data.end_date;
        this.giveaway.countdown_hours = data.countdown_hours;
        this.renderInfo();
        this.updateCountdownDisplay();
        this.updateSummary();
        showToast(t('giveaway.toast_threshold_reached'), 'success');
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('TICKETS_PAID', (data) => {
        if (!this.giveaway || this.giveaway.uuid !== data.giveaway_uuid) return;
        const paidNumbers = data.ticket_numbers || [];
        for (const num of paidNumbers) {
          this.reservedSet.delete(num);
          this.paidSet.add(num);
          this.selectedTickets.delete(num);
        }
        if (this.activePendingOrder?.order?.ticket_numbers) {
          const myPendingNums: number[] = this.activePendingOrder.order.ticket_numbers;
          const allMyNumsPaid = myPendingNums.length > 0 && myPendingNums.every((n) => this.paidSet.has(n));
          if (allMyNumsPaid) {
            this.clearPendingOrder();
          }
        }
        if (typeof data.ticket_count === 'number' && this.giveaway.available_tickets !== undefined) {
          this.giveaway.available_tickets = Math.max(0, this.giveaway.available_tickets - data.ticket_count);
          if (this.giveaway.type === 'daily') {
            const addedPot = Number((data.ticket_count * (this.giveaway.ticket_price * 0.5)).toFixed(2));
            this.giveaway.current_pot = Number(((this.giveaway.current_pot || 0) + addedPot).toFixed(2));
          }
        }
        this.renderInfo();
        this.updateCountdownDisplay();
        this.renderTickets();
        this.updateSummary();
      })
    );
  }

  private updateCountdownDisplay(): void {
    if (!this.giveaway) return;
    const g = this.giveaway;
    const timerBadge = this.container.querySelector<HTMLElement>('[data-ref="giveaway-timer-badge"]');
    const timerText = this.container.querySelector<HTMLElement>('[data-ref="giveaway-timer-text"]');
    const closedBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-sales-closed"]');
    const winnerBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-giveaway-winner"]');
    const winnerNameEl = this.container.querySelector<HTMLElement>('[data-ref="winner-name-display"]');
    const winnerTicketEl = this.container.querySelector<HTMLElement>('[data-ref="winner-ticket-display"]');
    const buyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-buy-giveaway"]');

    const upcomingBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-upcoming"]');
    const upcomingBannerText = this.container.querySelector<HTMLElement>('[data-ref="banner-upcoming-text"]');

    if (g.status === 'completed') {
      this.clearPendingOrder();
      if (timerText) timerText.textContent = t('giveaway.status_completed');
      if (timerBadge) {
        timerBadge.classList.add('giveaway-badge--danger');
        timerBadge.classList.remove('giveaway-badge--warning');
      }
      if (closedBanner) {
        closedBanner.classList.add('is-hidden');
      }
      if (upcomingBanner) {
        upcomingBanner.classList.add('is-hidden');
      }
      if (winnerBanner) {
        winnerBanner.classList.remove('is-hidden');

        const hasWinner = Boolean(g.winner_ticket_number != null && g.winner_name && g.winner_name !== 'Sin participantes');
        const winnerTitleEl = this.container.querySelector<HTMLElement>('[data-ref="banner-winner-title"]');
        const winnerDetailsRow = this.container.querySelector<HTMLElement>('[data-ref="winner-details-row"]');
        const noWinnerDetailsRow = this.container.querySelector<HTMLElement>('[data-ref="no-winner-details-row"]');

        if (hasWinner) {
          winnerBanner.classList.add('banner--winner');
          winnerBanner.classList.remove('banner--no-winner');
          if (winnerTitleEl) winnerTitleEl.textContent = t('giveaway.winner_congrats_title');
          if (winnerDetailsRow) winnerDetailsRow.classList.remove('is-hidden');
          if (noWinnerDetailsRow) noWinnerDetailsRow.classList.add('is-hidden');
          if (winnerNameEl) winnerNameEl.textContent = g.winner_name || '';
          if (winnerTicketEl) winnerTicketEl.textContent = `#${g.winner_ticket_number}`;
        } else {
          winnerBanner.classList.remove('banner--winner');
          winnerBanner.classList.add('banner--no-winner');
          if (winnerTitleEl) winnerTitleEl.textContent = t('giveaway.no_winner_banner_title');
          if (winnerDetailsRow) winnerDetailsRow.classList.add('is-hidden');
          if (noWinnerDetailsRow) {
            noWinnerDetailsRow.classList.remove('is-hidden');
            noWinnerDetailsRow.textContent = t('giveaway.no_winner_banner_desc');
          }
        }
      }
      if (buyBtn) {
        buyBtn.disabled = true;
        buyBtn.classList.add('is-disabled');
        const text = buyBtn.querySelector('span');
        if (text) text.textContent = t('giveaway.sales_closed_btn');
      }
      this.disablePurchaseControls(true);
      return;
    }

    const now = Date.now();
    const startClean = g.start_date ? (g.start_date.includes('T') ? g.start_date : g.start_date.replace(' ', 'T')) : '';
    const startMs = startClean ? new Date(startClean).getTime() : 0;
    const isUpcoming = !isNaN(startMs) && startMs > now;

    if (isUpcoming) {
      const dateText = formatShortDate(g.start_date, getCurrentLanguage());
      if (timerText) {
        timerText.textContent = t('giveaway.upcoming_badge', { date: dateText });
      }
      if (timerBadge) {
        timerBadge.classList.remove('giveaway-badge--warning', 'giveaway-badge--danger');
      }
      if (closedBanner) {
        closedBanner.classList.add('is-hidden');
      }
      if (upcomingBanner) {
        upcomingBanner.classList.remove('is-hidden');
        if (upcomingBannerText) {
          upcomingBannerText.textContent = t('giveaway.upcoming_banner', { date: dateText });
        }
      }
      if (winnerBanner) {
        winnerBanner.classList.add('is-hidden');
      }
      if (buyBtn) {
        buyBtn.disabled = true;
        buyBtn.classList.add('is-disabled');
        const text = buyBtn.querySelector('span');
        if (text) text.textContent = t('giveaway.upcoming_btn', { date: dateText });
      }
      this.disablePurchaseControls(true);
      return;
    }

    if (upcomingBanner) {
      upcomingBanner.classList.add('is-hidden');
    }

    if (g.min_threshold_pct > 0 && !g.threshold_reached_at) {
      const total = g.total_tickets || 100;
      const sold = total - (g.available_tickets ?? total);
      const currentPct = Math.min(100, Math.round((sold / total) * 100));
      if (timerText) {
        timerText.textContent = t('giveaway.threshold_pending_badge', { current: currentPct, target: g.min_threshold_pct });
      }
      if (timerBadge) {
        timerBadge.classList.remove('giveaway-badge--warning', 'giveaway-badge--danger');
      }
      if (closedBanner) {
        closedBanner.classList.add('is-hidden');
      }
      if (winnerBanner) {
        winnerBanner.classList.add('is-hidden');
      }
      this.disablePurchaseControls(false);
      if (buyBtn) {
        buyBtn.disabled = this.selectedTickets.size === 0;
        buyBtn.classList.toggle('is-disabled', this.selectedTickets.size === 0);
        const text = buyBtn.querySelector('span');
        if (text) text.textContent = t('giveaway.buy_now');
      }
      return;
    }

    const endMs = new Date(g.end_date).getTime();
    const diff = endMs - Date.now();

    if (diff <= 0) {
      if (timerText) timerText.textContent = `00:00:00 • ${t('home.drawing_now')}`;
      if (timerBadge) {
        timerBadge.classList.add('giveaway-badge--danger');
        timerBadge.classList.remove('giveaway-badge--warning');
      }
      if (closedBanner) {
        closedBanner.classList.add('is-hidden');
      }
      if (buyBtn) {
        buyBtn.disabled = true;
        buyBtn.classList.add('is-disabled');
        const text = buyBtn.querySelector('span');
        if (text) text.textContent = t('home.drawing_now');
      }
      this.disablePurchaseControls(true);
      this.startDrawingPoll();
      return;
    }

    const totalSec = Math.floor(diff / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const formattedTime = d > 0
      ? `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
      : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (timerText) timerText.textContent = formattedTime;

    const isUnder1Hour = diff <= 3600 * 1000;
    if (isUnder1Hour) {
      if (timerBadge) timerBadge.classList.add('giveaway-badge--warning');
      if (closedBanner) {
        closedBanner.classList.remove('is-hidden');
      }
      if (buyBtn) {
        buyBtn.disabled = true;
        buyBtn.classList.add('is-disabled');
        const text = buyBtn.querySelector('span');
        if (text) text.textContent = t('giveaway.sales_closed_btn');
      }
      this.disablePurchaseControls(true);
    } else {
      if (timerBadge) timerBadge.classList.remove('giveaway-badge--warning');
      if (closedBanner) {
        closedBanner.classList.add('is-hidden');
      }
      this.disablePurchaseControls(false);
      if (buyBtn) {
        buyBtn.disabled = this.selectedTickets.size === 0;
        buyBtn.classList.toggle('is-disabled', this.selectedTickets.size === 0);
        const text = buyBtn.querySelector('span');
        if (text) text.textContent = t('giveaway.buy_now');
      }
    }
  }

  private disablePurchaseControls(disabled: boolean): void {
    const luckyHeaderBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-lucky-pick-header"]');
    if (luckyHeaderBtn) {
      luckyHeaderBtn.disabled = disabled;
      luckyHeaderBtn.classList.toggle('is-disabled', disabled);
    }
    const luckyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-lucky-pick"]');
    if (luckyBtn) {
      luckyBtn.disabled = disabled;
      luckyBtn.classList.toggle('is-disabled', disabled);
    }
    const clearBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-selection"]');
    if (clearBtn && disabled) {
      clearBtn.disabled = true;
      clearBtn.classList.add('is-disabled');
    }
    const ticketsGrid = this.container.querySelector<HTMLElement>('[data-ref="tickets-grid"]');
    if (ticketsGrid) {
      ticketsGrid.classList.toggle('is-disabled', disabled);
      const ticketButtons = ticketsGrid.querySelectorAll<HTMLButtonElement>('.giveaway-ticket');
      ticketButtons.forEach((btn) => {
        if (disabled) {
          btn.disabled = true;
          btn.classList.add('is-disabled');
        } else {
          const numStr = btn.getAttribute('data-number');
          const num = numStr ? parseInt(numStr, 10) : 0;
          const isTaken = this.paidSet.has(num) || this.reservedSet.has(num);
          btn.disabled = isTaken;
          btn.classList.remove('is-disabled');
        }
      });
    }
    if (disabled && this.selectedTickets.size > 0) {
      this.selectedTickets.clear();
      this.renderTickets();
      this.updateSummary();
    }
  }

  private startDrawingPoll(): void {
    if (this.drawingPollTimer) return;
    this.drawingPollTimer = setInterval(async () => {
      try {
        const fresh = await fetchGiveawayDetail(this.uuid);
        if (fresh && fresh.status === 'completed') {
          this.stopDrawingPoll();
          this.giveaway = fresh;
          this.renderInfo();
          this.updateCountdownDisplay();
          this.renderTickets();
          this.updateSummary();
          this.showWinnerModal(fresh.winner_name || 'Sin participantes', fresh.winner_ticket_number ?? null);
        }
      } catch (_) {}
    }, 2000);
  }

  private stopDrawingPoll(): void {
    if (this.drawingPollTimer) {
      clearInterval(this.drawingPollTimer);
      this.drawingPollTimer = null;
    }
  }

  private showWinnerModal(winnerName: string, ticketNum: number | null): void {
    const hasWinner = Boolean(ticketNum != null && winnerName && winnerName !== 'Sin participantes');
    const modalContent = hasWinner
      ? `
      <div class="winner-modal-box">
        <div class="winner-trophy">🏆</div>
        <h2 class="winner-title">${escapeHtml(t('giveaway.winner_congrats_title'))}</h2>
        <p class="winner-sub">
          ${escapeHtml(t('giveaway.winner_congrats_desc', { ticket: ticketNum! }))}
        </p>
        <div class="winner-card">
          <div class="winner-card-label">${escapeHtml(t('giveaway.winner_label'))}</div>
          <div class="winner-card-name">${escapeHtml(winnerName)}</div>
          <div class="winner-card-ticket">
            ${escapeHtml(t('giveaway.winner_ticket_label'))} <strong class="winner-card-ticket-number">#${ticketNum}</strong>
          </div>
        </div>
        <button type="button" class="component-button component-button--black component-button--h50 component-button--w-full" data-ref="btn-close-winner-modal">
          ${escapeHtml(t('giveaway.winner_close_modal'))}
        </button>
      </div>
    `
      : `
      <div class="winner-modal-box">
        <div class="winner-trophy">🎟️</div>
        <h2 class="winner-title winner-title--neutral">${escapeHtml(t('giveaway.no_winner_modal_title'))}</h2>
        <p class="winner-sub winner-sub--sm">
          ${escapeHtml(t('giveaway.no_winner_modal_desc'))}
        </p>
        <div class="winner-card">
          <div class="winner-card-label">${escapeHtml(t('giveaway.no_winner_status_label'))}</div>
          <div class="winner-card-name winner-card-name--sm">${escapeHtml(t('giveaway.no_winner_status_badge'))}</div>
          <div class="winner-card-ticket winner-card-ticket--sm">
            ${escapeHtml(t('giveaway.no_winner_status_detail'))}
          </div>
        </div>
        <button type="button" class="component-button component-button--black component-button--h50 component-button--w-full" data-ref="btn-close-winner-modal">
          ${escapeHtml(t('giveaway.winner_close_modal'))}
        </button>
      </div>
    `;

    const modal = openModal({
      bodyHtml: modalContent,
      showCancel: false,
      showConfirm: false,
      size: 'sm',
      title: '',
    });

    setTimeout(() => {
      const closeBtn = document.querySelector<HTMLButtonElement>('[data-ref="btn-close-winner-modal"]');
      closeBtn?.addEventListener('click', () => {
        modal.close();
      });
    }, 50);
  }

  private async setupTickets(): Promise<void> {
    if (!this.giveaway) return;
    const ticketData = await fetchGiveawayTickets(this.uuid);
    this.paidSet = new Set<number>(ticketData?.paid || []);
    this.reservedSet = new Set<number>(ticketData?.reserved || []);
  }

  private renderInfo(): void {
    if (!this.giveaway) return;
    const g = this.giveaway;

    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-title"]');
    if (titleEl) titleEl.textContent = g.title;

    const descEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-description"]');
    if (descEl) descEl.textContent = g.description || '';

    const priceEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-price-value"]');
    if (priceEl) priceEl.textContent = formatCurrency(g.ticket_price, g.currency || 'MXN');

    const statusBadgeEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-status-badge"]');
    const now = Date.now();
    const startClean = g.start_date ? (g.start_date.includes('T') ? g.start_date : g.start_date.replace(' ', 'T')) : '';
    const startMs = startClean ? new Date(startClean).getTime() : 0;
    const isUpcoming = !isNaN(startMs) && startMs > now;

    if (statusBadgeEl) {
      if (g.status === 'completed') {
        statusBadgeEl.innerHTML = `<span>${escapeHtml(t('home.completed_badge'))}</span>`;
      } else if (isUpcoming) {
        statusBadgeEl.innerHTML = `<span>${escapeHtml(t('home.upcoming_status'))}</span>`;
      } else if (g.type === 'daily') {
        statusBadgeEl.innerHTML = `<span>Sorteo Diario</span>`;
      } else {
        statusBadgeEl.innerHTML = `<span>${escapeHtml(t('home.active_badge'))}</span>`;
      }
    }

    const drawBadgeEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-draw-date-badge"]');
    const dateTextEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-draw-date-text"]');
    if (drawBadgeEl && dateTextEl) {
      if (isUpcoming) {
        drawBadgeEl.classList.remove('is-hidden');
        const dateText = formatShortDate(g.start_date, getCurrentLanguage());
        dateTextEl.textContent = t('giveaway.upcoming_badge', { date: dateText });
      } else if (g.type === 'daily') {
        drawBadgeEl.classList.remove('is-hidden');
        dateTextEl.textContent = 'Hoy 23:59 hrs';
      } else if (g.min_threshold_pct > 0 && !g.threshold_reached_at) {
        drawBadgeEl.classList.remove('is-hidden');
        dateTextEl.textContent = t('home.threshold_target', { target: g.min_threshold_pct });
      } else if (g.draw_date) {
        drawBadgeEl.classList.remove('is-hidden');
        const formattedDate = new Date(g.draw_date).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        dateTextEl.textContent = t('giveaway.draw_date', { date: formattedDate });
      } else {
        drawBadgeEl.classList.add('is-hidden');
      }
    }

    const total = g.total_tickets || 100;
    const available = g.available_tickets ?? total;
    const pct = Math.round(((total - available) / total) * 100);

    const progressTextEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-progress-text"]');
    if (progressTextEl) {
      const formattedAvailable = formatNumber(available);
      const formattedTotal = formatNumber(total);
      if (g.min_threshold_pct > 0 && !g.threshold_reached_at) {
        progressTextEl.textContent = `${t('giveaway.tickets_progress', { available: formattedAvailable, total: formattedTotal })} • ${t('home.threshold_target', { target: g.min_threshold_pct })}`;
      } else {
        progressTextEl.textContent = t('giveaway.tickets_progress', { available: formattedAvailable, total: formattedTotal });
      }
    }

    const progressPctEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-progress-pct"]');
    if (progressPctEl) {
      progressPctEl.textContent = `${pct}%`;
    }

    const progressBarEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-progress-bar"]');
    if (progressBarEl) {
      progressBarEl.style.width = `${pct}%`;
    }

    const thresholdHintEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-threshold-hint"]');
    if (thresholdHintEl) {
      const showHint = g.min_threshold_pct > 0 && !g.threshold_reached_at;
      thresholdHintEl.classList.toggle('is-hidden', !showHint);
      if (showHint) {
        thresholdHintEl.textContent = t('giveaway.threshold_waiting_desc', {
          hours: g.countdown_hours || 72,
          target: g.min_threshold_pct,
        });
      }
    }

    const dailyPotBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-daily-pot"]');
    if (dailyPotBanner) {
      const isDaily = g.type === 'daily';
      dailyPotBanner.classList.toggle('is-hidden', !isDaily);
      if (isDaily) {
        const potAmountEl = dailyPotBanner.querySelector<HTMLElement>('[data-ref="daily-banner-pot-amount"]');
        if (potAmountEl) {
          potAmountEl.textContent = formatCurrency(g.current_pot || 0, g.currency || 'MXN', { decimals: 0 });
        }
      }
    }
  }

  private renderGallery(): void {
    const mainImg = this.container.querySelector<HTMLImageElement>('[data-ref="gallery-main-image"]');
    if (mainImg) {
      mainImg.src = this.activeImageUrl;
      mainImg.alt = this.giveaway?.title || '';
    }

    const disclaimerEl = this.container.querySelector<HTMLElement>('[data-ref="gallery-disclaimer"]');
    if (disclaimerEl) {
      disclaimerEl.textContent = t('giveaway.disclaimer_illustrative');
    }

    const isSingleOrDaily = this.giveaway?.type === 'daily' || this.allImages.length <= 1;

    const dotsContainer = this.container.querySelector<HTMLElement>('[data-ref="gallery-dots"]');
    if (dotsContainer) {
      dotsContainer.classList.toggle('is-hidden', isSingleOrDaily);
      if (!isSingleOrDaily) {
        dotsContainer.innerHTML = this.allImages
          .map((url, idx) => {
            const isActive = url === this.activeImageUrl;
            return `
              <button type="button" class="giveaway-gallery__dot ${isActive ? 'is-active' : ''}" data-ref="dot-${idx}" data-url="${url}" aria-label="Foto ${idx + 1}"></button>
            `;
          })
          .join('');
      }
    }

    const thumbsContainer = this.container.querySelector<HTMLElement>('[data-ref="gallery-thumbs"]');
    if (!thumbsContainer) return;

    thumbsContainer.classList.toggle('is-hidden', isSingleOrDaily);
    if (!isSingleOrDaily) {
      thumbsContainer.innerHTML = this.allImages
        .map((url, idx) => {
          const isActive = url === this.activeImageUrl;
          return `
            <button type="button" class="giveaway-gallery__thumb ${isActive ? 'is-active' : ''}" data-ref="thumb-${idx}" data-url="${url}">
              <img class="giveaway-gallery__thumb-img" src="${url}" alt="Thumbnail ${idx + 1}" loading="lazy" />
            </button>
          `;
        })
        .join('');
    }
  }

  private startGallerySlideshow(): void {
    this.stopGallerySlideshow();
    if (this.giveaway?.type === 'daily' || this.allImages.length <= 1) return;

    this.slideshowInterval = setInterval(() => {
      if (this.isGalleryHovered) return;
      this.advanceGalleryImage();
    }, 2500);
  }

  private stopGallerySlideshow(): void {
    if (this.slideshowInterval) {
      clearInterval(this.slideshowInterval);
      this.slideshowInterval = null;
    }
  }

  private advanceGalleryImage(): void {
    if (this.allImages.length <= 1) return;
    const currentIndex = this.allImages.indexOf(this.activeImageUrl);
    const nextIndex = (currentIndex + 1) % this.allImages.length;
    this.setActiveGalleryImage(this.allImages[nextIndex]);
  }

  private setActiveGalleryImage(url: string): void {
    if (!url || url === this.activeImageUrl) return;
    this.activeImageUrl = url;

    const mainImg = this.container.querySelector<HTMLImageElement>('[data-ref="gallery-main-image"]');
    if (mainImg) {
      mainImg.style.opacity = '0.4';
      setTimeout(() => {
        mainImg.src = url;
        mainImg.style.opacity = '1';
      }, 120);
    }

    const dotsContainer = this.container.querySelector<HTMLElement>('[data-ref="gallery-dots"]');
    if (dotsContainer) {
      dotsContainer.querySelectorAll<HTMLButtonElement>('.giveaway-gallery__dot').forEach((el) => {
        el.classList.toggle('is-active', el.getAttribute('data-url') === url);
      });
    }

    const thumbsContainer = this.container.querySelector<HTMLElement>('[data-ref="gallery-thumbs"]');
    if (thumbsContainer) {
      thumbsContainer.querySelectorAll<HTMLButtonElement>('.giveaway-gallery__thumb').forEach((el) => {
        el.classList.toggle('is-active', el.getAttribute('data-url') === url);
      });
    }
  }

  private checkPendingOrderStorage(): void {
    try {
      if (this.giveaway?.status === 'completed' || this.giveaway?.status === 'cancelled') {
        this.clearPendingOrder();
        return;
      }

      const stored = localStorage.getItem('boreal_pending_order_' + this.uuid);
      if (!stored) return;
      const data = JSON.parse(stored);
      if (data?.order?.expires_at && new Date(data.order.expires_at).getTime() > Date.now()) {
        const ticketNums: number[] = data.order.ticket_numbers || [];
        const allPaid = ticketNums.length > 0 && ticketNums.every((num) => this.paidSet.has(num));
        if (allPaid) {
          this.clearPendingOrder();
          return;
        }

        this.activePendingOrder = data;
        for (const num of ticketNums) {
          if (!this.paidSet.has(num)) {
            this.reservedSet.add(num);
          }
        }
        this.renderPendingOrderBanner();
      } else {
        this.clearPendingOrder();
      }
    } catch (_) {
      this.clearPendingOrder();
    }
  }

  private renderPendingOrderBanner(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-pending-order"]');
    const summaryEl = this.container.querySelector<HTMLElement>('[data-ref="pending-order-summary"]');
    const timerEl = this.container.querySelector<HTMLElement>('[data-ref="pending-order-timer"]');

    if (!this.activePendingOrder || !banner) {
      if (banner) banner.classList.add('is-hidden');
      this.stopPendingOrderTimer();
      return;
    }

    const { order } = this.activePendingOrder;
    const expiresAtMs = new Date(order.expires_at).getTime();

    if (Date.now() >= expiresAtMs) {
      this.clearPendingOrder();
      return;
    }

    banner.classList.remove('is-hidden');
    if (summaryEl) {
      summaryEl.textContent = `${formatNumber(order.ticket_count)} boletos apartados (${formatCurrency(order.total_amount, order.currency)})`;
    }

    this.stopPendingOrderTimer();
    const updateCountdown = () => {
      const diff = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      if (diff <= 0) {
        this.clearPendingOrder();
        return;
      }
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      if (timerEl) {
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')} restantes`;
      }
    };

    updateCountdown();
    this.pendingOrderTimer = setInterval(updateCountdown, 1000);
  }

  private clearPendingOrder(): void {
    this.stopPendingOrderTimer();
    this.activePendingOrder = null;
    localStorage.removeItem('boreal_pending_order_' + this.uuid);
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-pending-order"]');
    if (banner) banner.classList.add('is-hidden');
  }

  private stopPendingOrderTimer(): void {
    if (this.pendingOrderTimer) {
      clearInterval(this.pendingOrderTimer);
      this.pendingOrderTimer = null;
    }
  }

  private getVisibleTicketNumbers(): number[] {
    if (!this.giveaway) return [];
    const total = this.giveaway.total_tickets || 100;
    const query = this.ticketSearchQuery.trim();

    if (query) {
      const matchNum = parseInt(query, 10);
      if (!isNaN(matchNum) && matchNum >= 1 && matchNum <= total && query === matchNum.toString()) {
        const targetPage = Math.ceil(matchNum / this.pageSize);
        if (targetPage !== this.currentPage) {
          this.currentPage = targetPage;
        }
      }
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, total);
    const numbers: number[] = [];
    for (let i = start; i <= end; i++) {
      if (!query || i.toString().includes(query)) {
        numbers.push(i);
      }
    }
    return numbers;
  }

  private renderTickets(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="tickets-grid"]');
    if (!grid) return;

    const visibleNumbers = this.getVisibleTicketNumbers();
    if (visibleNumbers.length === 0) {
      grid.innerHTML = '';
      renderEmptyState({
        container: grid,
        dataRef: 'tickets-empty-state',
        desc: t('giveaway.ticket_not_found_desc') || 'No se encontraron boletos que coincidan con la numeración ingresada.',
        graphicType: 'search',
        title: t('giveaway.ticket_not_found_title') || 'Boleto no encontrado',
      });
      return;
    }

    removeEmptyState(grid, 'tickets-empty-state');
    const isClosed = this.isSalesClosed();

    grid.innerHTML = visibleNumbers
      .map((num) => {
        const isSelected = this.selectedTickets.has(num);
        const isPaid = this.paidSet.has(num);
        const isReserved = this.reservedSet.has(num);
        const isTaken = isPaid || isReserved;
        const stateClass = isSelected
          ? 'is-selected'
          : isTaken
            ? 'is-taken'
            : 'is-available';
        const totalT = this.giveaway?.total_tickets || 100;
        const padLen = totalT > 9999 ? 5 : totalT >= 1000 ? 4 : 3;
        const formattedNumber = num.toString().padStart(padLen, '0');
        const isDisabled = isClosed || isTaken ? 'disabled' : '';
        const disabledClass = isClosed ? 'is-disabled' : '';
        return `
          <button type="button" class="giveaway-ticket ${stateClass} ${disabledClass}" ${isDisabled} data-ref="ticket-${num}" data-number="${num}">
            <span>#${formattedNumber}</span>
          </button>
        `;
      })
      .join('');
  }

  private renderPagination(): void {
    if (!this.giveaway) return;
    const total = this.giveaway.total_tickets || 100;
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));

    const prevBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-page-prev"]');
    const nextBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-page-next"]');
    const listEl = this.container.querySelector<HTMLElement>('[data-ref="pagination-pages-list"]');
    const paginationEl = this.container.querySelector<HTMLElement>('[data-ref="tickets-pagination"]');

    if (paginationEl) {
      paginationEl.classList.toggle('is-hidden', totalPages <= 1);
    }

    if (prevBtn) {
      prevBtn.disabled = this.currentPage <= 1;
    }
    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= totalPages;
    }

    if (!listEl) return;

    const pages: (number | 'ellipsis')[] = [];
    const current = this.currentPage;

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) {
        pages.push('ellipsis');
      }

      const start = Math.max(2, current - 1);
      const end = Math.min(totalPages - 1, current + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (current < totalPages - 2) {
        pages.push('ellipsis');
      }
      pages.push(totalPages);
    }

    listEl.innerHTML = pages
      .map((p) => {
        if (p === 'ellipsis') {
          return `<span class="giveaway-pagination__ellipsis">…</span>`;
        }
        const isActive = p === current;
        return `
          <button type="button" class="giveaway-pagination__btn ${isActive ? 'is-active' : ''}" data-ref="btn-page-${p}" data-page="${p}">
            ${p}
          </button>
        `;
      })
      .join('');
  }

  private goToPage(page: number): void {
    if (!this.giveaway) return;
    const total = this.giveaway.total_tickets || 100;
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
    const targetPage = Math.max(1, Math.min(page, totalPages));
    if (targetPage === this.currentPage) return;
    this.currentPage = targetPage;
    this.renderTickets();
    this.renderPagination();
  }

  private updateSummary(): void {
    if (!this.giveaway) return;
    const count = this.selectedTickets.size;
    const totalAmount = count * this.giveaway.ticket_price;
    const total = formatNumber(totalAmount, { decimals: 2 });
    const currency = this.giveaway.currency || 'MXN';

    const countEl = this.container.querySelector<HTMLElement>('[data-ref="summary-selected-count"]');
    if (countEl) {
      countEl.textContent = t('giveaway.selected_summary', { count: formatNumber(count) });
    }

    const priceEl = this.container.querySelector<HTMLElement>('[data-ref="summary-subtotal-price"]');
    if (priceEl) {
      priceEl.textContent = t('giveaway.total_price', { currency, total });
    }

    const buyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-buy-giveaway"]');
    if (buyBtn) {
      if (this.isSalesClosed()) {
        buyBtn.disabled = true;
        const textSpan = buyBtn.querySelector('span');
        if (textSpan) {
          textSpan.textContent = this.giveaway?.status === 'completed'
            ? t('giveaway.status_completed')
            : t('giveaway.sales_closed_btn');
        }
      } else {
        buyBtn.disabled = count === 0;
      }
    }

    this.renderSelectedTickets();
  }

  private renderSelectedTickets(): void {
    if (!this.giveaway) return;
    const count = this.selectedTickets.size;
    const totalT = this.giveaway.total_tickets || 100;
    const padLen = totalT > 9999 ? 5 : totalT >= 1000 ? 4 : 3;

    const summaryChips = this.container.querySelector<HTMLElement>('[data-ref="summary-selected-chips"]');
    if (summaryChips) {
      if (count === 0) {
        summaryChips.classList.add('is-hidden');
        summaryChips.innerHTML = '';
      } else {
        summaryChips.classList.remove('is-hidden');
        const sortedTickets = Array.from(this.selectedTickets).sort((a, b) => a - b);
        summaryChips.innerHTML = sortedTickets
          .map((num) => {
            const formatted = num.toString().padStart(padLen, '0');
            return `
              <button type="button" class="giveaway-info__summary-chip" data-ref="summary-chip-${num}" data-ticket="${num}">
                <span>#${formatted}</span>
              </button>
            `;
          })
          .join('');
      }
    }
  }

  private jumpToTicket(num: number): void {
    if (!num || !this.giveaway) return;
    this.currentPage = Math.ceil(num / this.pageSize);
    this.renderTickets();
    this.renderPagination();
    const ticketBtn = this.container.querySelector<HTMLButtonElement>(`[data-ref="ticket-${num}"]`);
    if (ticketBtn) {
      ticketBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ticketBtn.classList.add('is-highlighted');
      setTimeout(() => ticketBtn.classList.remove('is-highlighted'), 1200);
    }
  }

  private getMaxAllowedTickets(): number {
    if (!this.giveaway) return 20;
    const total = this.giveaway.total_tickets || 100;
    const available = this.giveaway.available_tickets ?? total;

    const maxByTotal = Math.max(10, Math.floor(total * 0.20));
    const maxByAvailable = available > 10 ? Math.floor(available * 0.50) : available;
    const safeCap = Math.min(available, maxByTotal, maxByAvailable);
    return Math.max(1, safeCap);
  }

  private openRandomPickModal(): void {
    if (!this.giveaway) return;
    if (this.isSalesClosed()) {
      showToast(t('giveaway.toast_sales_closed'), 'warning');
      return;
    }

    const availableCount = this.giveaway.available_tickets ?? this.giveaway.total_tickets ?? 0;
    if (availableCount <= 0) {
      showToast(t('giveaway.toast_all_taken'), 'warning');
      return;
    }

    const maxAllowedSafe = this.getMaxAllowedTickets();
    const rawOptions = this.giveaway.package_options;
    const baseOptions = Array.isArray(rawOptions) && rawOptions.length > 0 ? rawOptions : [1, 3, 5, 10, 20];
    const allOptions = Array.from(new Set([1, ...baseOptions])).sort((a, b) => a - b);
    const validOptions = allOptions.filter((qty) => qty <= maxAllowedSafe);
    const options = validOptions.length > 0 ? validOptions : [1];

    let isCustomMode = false;
    let selectedQty = options[0] || 1;
    if (this.selectedTickets.size > 0 && this.selectedTickets.size <= maxAllowedSafe) {
      selectedQty = this.selectedTickets.size;
      if (!options.includes(selectedQty)) {
        isCustomMode = true;
      }
    }

    const currency = this.giveaway.currency || 'MXN';
    const price = this.giveaway.ticket_price || 0;

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div class="random-pick-modal" data-ref="random-pick-modal">
        <div class="random-pick-modal__group" data-ref="group-dropdown">
          <span class="random-pick-modal__label" data-ref="label-select-package">${t('giveaway.random_modal_select_package')}</span>
          <div class="settings-dropdown-wrapper giveaway-info__dropdown-wrapper" data-ref="dropdown-wrapper-quantity">
            <button type="button" class="dropdown-trigger" data-ref="btn-trigger-quantity" aria-haspopup="listbox" aria-expanded="false">
              <div class="dropdown-trigger__left">
                <svg class="component-icon dropdown-trigger__icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
                <span class="dropdown-trigger__text" data-ref="quantity-selected-text">${isCustomMode ? t('giveaway.random_modal_custom_option') : (selectedQty === 1 ? '1 boleto' : `${formatNumber(selectedQty)} boletos`)}</span>
              </div>
              <div class="dropdown-trigger__right">
                <span class="dropdown-trigger__price" data-ref="quantity-selected-price">${formatCurrency(selectedQty * price, currency)}</span>
                <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
              </div>
            </button>
            <div class="dropdown-backdrop" data-ref="dropdown-backdrop-quantity">
              <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="dropdown-menu-quantity" role="listbox">
                <div class="menu-panel__list" data-ref="list-quantities">
                  ${options.map((qty) => `
                    <button type="button" class="menu-item${!isCustomMode && qty === selectedQty ? ' is-active' : ''}" data-ref="option-qty-${qty}" data-qty="${qty}">
                      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
                      <span class="menu-item__text">${qty === 1 ? '1 boleto' : `${formatNumber(qty)} boletos`}</span>
                      <span class="menu-item__subtext">${formatCurrency(qty * price, currency)}</span>
                    </button>
                  `).join('')}
                  <button type="button" class="menu-item${isCustomMode ? ' is-active' : ''}" data-ref="option-qty-custom" data-qty="custom">
                    <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
                    <span class="menu-item__text">${t('giveaway.random_modal_custom_option')}</span>
                    <span class="menu-item__subtext">${t('giveaway.random_modal_custom_subtext')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="random-pick-custom-box${isCustomMode ? '' : ' is-hidden'}" data-ref="random-pick-custom-box">
          <label class="field" data-ref="field-custom-quantity">
            <input class="field__input field__input--has-action" data-ref="input-custom-quantity" type="number" min="1" max="${maxAllowedSafe}" placeholder=" " value="${selectedQty}" />
            <span class="field__label" data-ref="label-custom-quantity">${t('giveaway.random_modal_custom_field')}</span>
            <span class="field__action" data-ref="action-custom-quantity">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
            </span>
          </label>
          <div class="random-pick-custom-hint" data-ref="random-pick-custom-hint">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#shield"></use></svg>
            <span>${t('giveaway.random_modal_custom_hint', { max: maxAllowedSafe })}</span>
          </div>
        </div>

        <div class="random-pick-modal__summary" data-ref="random-pick-summary">
          <div class="random-pick-modal__summary-item">
            <span class="random-pick-modal__summary-label">${t('giveaway.random_modal_tickets_label')}</span>
            <span class="random-pick-modal__summary-value" data-ref="random-summary-count">${selectedQty === 1 ? '1 boleto' : `${formatNumber(selectedQty)} boletos`}</span>
          </div>
          <div class="random-pick-modal__summary-item">
            <span class="random-pick-modal__summary-label">${t('giveaway.random_modal_total_label')}</span>
            <span class="random-pick-modal__summary-value random-pick-modal__summary-value--accent" data-ref="random-summary-total">${formatCurrency(selectedQty * price, currency)}</span>
          </div>
        </div>
      </div>
    `;

    const wrapper = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-quantity"]');
    const trigger = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-quantity"]');
    const backdrop = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-backdrop-quantity"]');
    const menu = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-menu-quantity"]');
    const triggerText = modalBody.querySelector<HTMLElement>('[data-ref="quantity-selected-text"]');
    const triggerPrice = modalBody.querySelector<HTMLElement>('[data-ref="quantity-selected-price"]');
    const summaryCount = modalBody.querySelector<HTMLElement>('[data-ref="random-summary-count"]');
    const summaryTotal = modalBody.querySelector<HTMLElement>('[data-ref="random-summary-total"]');
    const customBox = modalBody.querySelector<HTMLElement>('[data-ref="random-pick-custom-box"]');
    const customInput = modalBody.querySelector<HTMLInputElement>('[data-ref="input-custom-quantity"]');
    const menuItems = modalBody.querySelectorAll<HTMLButtonElement>('.menu-item');

    const updateModalDisplay = () => {
      const totalAmount = selectedQty * price;
      const label = selectedQty === 1 ? '1 boleto' : `${formatNumber(selectedQty)} boletos`;
      const priceText = formatCurrency(totalAmount, currency);

      if (summaryCount) summaryCount.textContent = label;
      if (summaryTotal) summaryTotal.textContent = priceText;
      if (triggerPrice) triggerPrice.textContent = priceText;

      if (isCustomMode) {
        if (triggerText) triggerText.textContent = `${label} (${t('giveaway.random_modal_custom_subtext')})`;
      } else {
        if (triggerText) triggerText.textContent = label;
      }

      menuItems.forEach((m) => {
        const mQty = m.getAttribute('data-qty');
        if (mQty === 'custom') {
          m.classList.toggle('is-active', isCustomMode);
        } else {
          m.classList.toggle('is-active', !isCustomMode && parseInt(mQty || '0', 10) === selectedQty);
        }
      });

      if (modal?.btnConfirm) {
        modal.btnConfirm.textContent = `${t('giveaway.random_modal_confirm')} (${selectedQty})`;
      }
    };

    const setCustomMode = (active: boolean) => {
      isCustomMode = active;
      if (active) {
        customBox?.classList.remove('is-hidden');
        if (customInput) {
          customInput.value = String(selectedQty);
          setTimeout(() => customInput.focus(), 50);
        }
      } else {
        customBox?.classList.add('is-hidden');
      }
      updateModalDisplay();
    };

    const closeDropdown = () => {
      wrapper?.classList.remove('is-open');
      trigger?.classList.remove('is-open');
      backdrop?.classList.remove('is-open');
      menu?.classList.remove('is-open');
      trigger?.setAttribute('aria-expanded', 'false');
    };

    const openDropdown = () => {
      wrapper?.classList.add('is-open');
      trigger?.classList.add('is-open');
      backdrop?.classList.add('is-open');
      menu?.classList.add('is-open');
      trigger?.setAttribute('aria-expanded', 'true');
    };

    trigger?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (wrapper?.classList.contains('is-open')) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) closeDropdown();
    });

    menuItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const qtyAttr = item.getAttribute('data-qty');
        if (qtyAttr === 'custom') {
          setCustomMode(true);
        } else {
          const q = parseInt(qtyAttr || '0', 10);
          if (q > 0) {
            selectedQty = q;
            setCustomMode(false);
          }
        }
        closeDropdown();
      });
    });

    customInput?.addEventListener('input', () => {
      let val = parseInt(customInput.value, 10);
      if (isNaN(val)) return;
      if (val > maxAllowedSafe) {
        val = maxAllowedSafe;
        customInput.value = String(maxAllowedSafe);
        showToast(`Máximo permitido: ${maxAllowedSafe} boletos por orden`, 'warning');
      } else if (val < 1) {
        val = 1;
      }
      selectedQty = val;
      updateModalDisplay();
    });

    customInput?.addEventListener('blur', () => {
      let val = parseInt(customInput.value, 10);
      if (isNaN(val) || val < 1) {
        val = 1;
        customInput.value = '1';
      } else if (val > maxAllowedSafe) {
        val = maxAllowedSafe;
        customInput.value = String(maxAllowedSafe);
      }
      selectedQty = val;
      updateModalDisplay();
    });

    const modal = openModal({
      bodyHtml: modalBody,
      cancelText: 'Cancelar',
      confirmClass: 'component-button--black',
      confirmText: `${t('giveaway.random_modal_confirm')} (${selectedQty})`,
      description: t('giveaway.random_modal_desc'),
      onConfirm: () => {
        this.selectRandomTickets(selectedQty);
        modal.close();
        const summaryBox = this.container.querySelector<HTMLElement>('[data-ref="tickets-summary"]');
        summaryBox?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
      },
      size: 'sm',
      title: t('giveaway.random_modal_title'),
    });
  }

  private renderNotFound(): void {
    const container = this.container.querySelector<HTMLElement>('[data-ref="giveaway-container"]');
    if (!container) return;

    container.innerHTML = `
      <div class="giveaway-not-found">
        <h2 class="giveaway-not-found__title">${t('giveaway.not_found_title')}</h2>
        <p class="giveaway-not-found__desc">${t('giveaway.not_found_desc')}</p>
        <button type="button" class="component-button component-button--black component-button--h44" data-ref="btn-back-not-found">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#arrow_back"></use></svg>
          <span>${t('giveaway.back_to_home')}</span>
        </button>
      </div>
    `;

    const backBtn = container.querySelector<HTMLButtonElement>('[data-ref="btn-back-not-found"]');
    backBtn?.addEventListener('click', () => navigate('/'), { signal: this.abortController?.signal });
  }

  private selectRandomTickets(count: number): void {
    if (!this.giveaway) return;
    const total = this.giveaway.total_tickets || 100;
    const availableCount = this.giveaway.available_tickets ?? total;
    if (availableCount <= 0) {
      showToast(t('giveaway.toast_all_taken'), 'warning');
      return;
    }

    this.selectedTickets.clear();
    const maxAllowed = this.getMaxAllowedTickets();
    const targetCount = Math.min(count, availableCount, maxAllowed);
    let attempts = 0;
    const maxAttempts = targetCount * 500;

    while (this.selectedTickets.size < targetCount && attempts < maxAttempts) {
      attempts++;
      const randomNum = Math.floor(Math.random() * total) + 1;
      if (!this.paidSet.has(randomNum) && !this.reservedSet.has(randomNum)) {
        this.selectedTickets.add(randomNum);
      }
    }

    const firstSelected = Array.from(this.selectedTickets)[0];
    if (firstSelected) {
      this.currentPage = Math.ceil(firstSelected / this.pageSize);
    }

    this.renderTickets();
    this.renderPagination();
    this.updateSummary();
    showToast(t('giveaway.toast_lucky_picked', { count: this.selectedTickets.size }), 'info');
  }

  private bindStaticEvents(): void {
    const signal = this.abortController?.signal;

    window.addEventListener(
      'languagechange',
      () => {
        this.renderInfo();
        this.updateSummary();
      },
      { signal }
    );
  }

  private bindDynamicEvents(): void {
    const signal = this.abortController?.signal;

    const galleryContainer = this.container.querySelector<HTMLElement>('[data-ref="giveaway-gallery"]');
    galleryContainer?.addEventListener(
      'mouseenter',
      () => {
        this.isGalleryHovered = true;
      },
      { signal }
    );

    galleryContainer?.addEventListener(
      'mouseleave',
      () => {
        this.isGalleryHovered = false;
      },
      { signal }
    );

    const dotsContainer = this.container.querySelector<HTMLElement>('[data-ref="gallery-dots"]');
    dotsContainer?.addEventListener(
      'click',
      (e) => {
        const dot = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.giveaway-gallery__dot');
        if (!dot) return;
        const url = dot.getAttribute('data-url');
        if (url && url !== this.activeImageUrl) {
          this.setActiveGalleryImage(url);
          this.startGallerySlideshow();
        }
      },
      { signal }
    );

    const reopenBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reopen-bank-modal"]');
    reopenBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.activePendingOrder) {
          this.openBankInfoModal(this.activePendingOrder.order, this.activePendingOrder.bankAccounts);
        }
      },
      { signal }
    );

    const gotoValidateBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-goto-validate-payment"]');
    gotoValidateBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.activePendingOrder?.order?.uuid) {
          navigate(`/validate-payment/o/${encodeURIComponent(this.activePendingOrder.order.uuid)}`);
        } else {
          navigate('/validate-payment');
        }
      },
      { signal }
    );

    const gotoDailyWinnersLink = this.container.querySelector<HTMLAnchorElement>('[data-ref="link-goto-daily-winners"]');
    gotoDailyWinnersLink?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/winners');
      },
      { signal }
    );

    const thumbsContainer = this.container.querySelector<HTMLElement>('[data-ref="gallery-thumbs"]');
    thumbsContainer?.addEventListener(
      'click',
      (e) => {
        const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.giveaway-gallery__thumb');
        if (!btn) return;
        const url = btn.getAttribute('data-url');
        if (url && url !== this.activeImageUrl) {
          this.setActiveGalleryImage(url);
          this.startGallerySlideshow();
        }
      },
      { signal }
    );

    const grid = this.container.querySelector<HTMLElement>('[data-ref="tickets-grid"]');
    grid?.addEventListener(
      'click',
      (e) => {
        if (this.isSalesClosed()) {
          showToast(t('giveaway.toast_sales_closed'), 'warning');
          return;
        }

        const ticketBtn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.giveaway-ticket');
        if (!ticketBtn) return;
        const numStr = ticketBtn.getAttribute('data-number');
        if (!numStr) return;
        const num = parseInt(numStr, 10);
        if (this.paidSet.has(num) || this.reservedSet.has(num)) {
          showToast(t('giveaway.toast_already_taken'), 'danger');
          return;
        }

        if (this.selectedTickets.has(num)) {
          this.selectedTickets.delete(num);
          ticketBtn.classList.remove('is-selected');
        } else {
          const maxAllowed = this.getMaxAllowedTickets();
          if (this.selectedTickets.size >= maxAllowed) {
            showToast(`No puedes seleccionar más de ${maxAllowed} boletos por orden.`, 'warning');
            return;
          }
          this.selectedTickets.add(num);
          ticketBtn.classList.add('is-selected');
        }
        this.updateSummary();
      },
      { signal }
    );

    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-ticket-search"]');
    searchInput?.addEventListener(
      'input',
      () => {
        if (this.searchDebounceTimer) {
          clearTimeout(this.searchDebounceTimer);
        }
        this.searchDebounceTimer = setTimeout(() => {
          this.ticketSearchQuery = searchInput.value;
          this.renderTickets();
          this.renderPagination();
        }, 150);
      },
      { signal }
    );

    const luckyHeaderBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-lucky-pick-header"]');
    luckyHeaderBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.openRandomPickModal();
      },
      { signal }
    );

    const luckyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-lucky-pick"]');
    luckyBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.openRandomPickModal();
      },
      { signal }
    );

    const clearBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-selection"]');
    clearBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedTickets.size > 0) {
          this.selectedTickets.clear();
          this.renderTickets();
          this.renderPagination();
          this.updateSummary();
          showToast(t('giveaway.toast_selection_cleared'), 'info');
        }
      },
      { signal }
    );

    const summaryChips = this.container.querySelector<HTMLElement>('[data-ref="summary-selected-chips"]');
    summaryChips?.addEventListener(
      'click',
      (e) => {
        const chip = (e.target as HTMLElement | null)?.closest<HTMLElement>('.giveaway-info__summary-chip');
        if (chip) {
          e.preventDefault();
          const num = parseInt(chip.getAttribute('data-ticket') || '0', 10);
          if (num > 0) {
            this.jumpToTicket(num);
          }
        }
      },
      { signal }
    );

    const buyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-buy-giveaway"]');
    buyBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.isSalesClosed()) {
          showToast(t('giveaway.toast_sales_closed'), 'warning');
          return;
        }
        this.openReservationModal();
      },
      { signal }
    );

    const prevBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-page-prev"]');
    prevBtn?.addEventListener('click', () => this.goToPage(this.currentPage - 1), { signal });

    const nextBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-page-next"]');
    nextBtn?.addEventListener('click', () => this.goToPage(this.currentPage + 1), { signal });

    const pagesList = this.container.querySelector<HTMLElement>('[data-ref="pagination-pages-list"]');
    pagesList?.addEventListener(
      'click',
      (e) => {
        const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.giveaway-pagination__btn');
        if (!btn) return;
        const p = btn.getAttribute('data-page');
        if (p) {
          this.goToPage(parseInt(p, 10));
        }
      },
      { signal }
    );
  }

  private openReservationModal(): void {
    if (!this.giveaway) return;
    if (this.isSalesClosed()) {
      showToast(t('giveaway.toast_sales_closed'), 'warning');
      return;
    }
    if (this.selectedTickets.size === 0) {
      this.selectRandomTickets(1);
    }

    const count = this.selectedTickets.size;
    const totalAmount = count * this.giveaway.ticket_price;
    const currency = this.giveaway.currency || 'MXN';
    const ticketList = Array.from(this.selectedTickets)
      .map((n) => `<span class="giveaway-ticket giveaway-ticket--chip is-selected" data-ref="chip-ticket-${n}">#${n.toString().padStart(3, '0')}</span>`)
      .join('');

    let selectedLada = COUNTRY_LADAS[0];
    let selectedState = '';

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div class="modal-reservation-box" data-ref="modal-reservation-box">
        <label class="field" data-ref="field-buyer-name">
          <input class="field__input" data-ref="input-buyer-name" type="text" maxlength="100" placeholder=" " value="" autocomplete="name" />
          <span class="field__label" data-ref="label-buyer-name">${t('orders.full_name_label')}</span>
        </label>

        <div class="phone-lada-row" data-ref="phone-lada-row">
          <div class="settings-dropdown-wrapper lada-dropdown-wrapper" data-ref="dropdown-wrapper-lada">
            <button type="button" class="lada-dropdown-trigger" data-ref="btn-trigger-lada" aria-haspopup="listbox" aria-expanded="false">
              <div class="lada-trigger__content" data-ref="lada-trigger-content">
                <span class="lada-trigger__flag" data-ref="lada-trigger-flag">${selectedLada.flag}</span>
                <span class="lada-trigger__code" data-ref="lada-trigger-code">${selectedLada.code}</span>
              </div>
              <svg class="component-icon dropdown-trigger__chevron" data-ref="icon-lada-chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
            </button>
            <div class="menu-panel menu-panel--dropdown lada-menu-panel" data-ref="dropdown-menu-lada" role="listbox">
              <div class="menu-panel__list" data-ref="list-ladas">
                ${COUNTRY_LADAS.map((lada) => `
                  <button type="button" class="menu-item${lada.code === selectedLada.code ? ' is-active' : ''}" data-ref="item-lada-${lada.code}" data-lada-code="${lada.code}" role="option">
                    <span class="menu-item__text" data-ref="text-lada-item">${lada.flag} ${lada.name} (${lada.code})</span>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>

          <label class="field phone-input-field" data-ref="field-buyer-phone">
            <input class="field__input field__input--has-action" data-ref="input-buyer-phone" type="tel" maxlength="14" placeholder=" " value="" autocomplete="tel" />
            <span class="field__label" data-ref="label-buyer-phone">${t('orders.phone_label')}</span>
            <span class="field__action" data-ref="action-buyer-phone">
              <svg class="component-icon" data-ref="icon-phone-call" aria-hidden="true"><use href="/icons.svg#call"></use></svg>
            </span>
          </label>
        </div>

        <div class="settings-dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-buyer-state">
          <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-buyer-state" aria-haspopup="listbox" aria-expanded="false">
            <div class="dropdown-trigger__left" data-ref="trigger-state-left">
              <svg class="component-icon dropdown-trigger__icon" data-ref="icon-state-trigger" aria-hidden="true"><use href="/icons.svg#location_on"></use></svg>
              <span class="dropdown-trigger__text" data-ref="text-buyer-state-selected">${t('orders.select_state_placeholder')}</span>
            </div>
            <svg class="component-icon dropdown-trigger__chevron" data-ref="icon-state-chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
          </button>
          <div class="menu-panel menu-panel--dropdown menu-panel--w-full" data-ref="dropdown-menu-buyer-state" role="listbox">
            <div class="menu-panel__list" data-ref="list-buyer-states">
              ${MEXICAN_STATES.map((state) => `
                <button type="button" class="menu-item" data-ref="item-state-${escapeHtml(state)}" data-state-value="${escapeHtml(state)}" role="option">
                  <span class="menu-item__text" data-ref="text-state-item">${escapeHtml(state)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="settings-dropdown-wrapper dropdown-wrapper--full is-disabled" data-ref="dropdown-wrapper-buyer-city">
          <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-buyer-city" aria-haspopup="listbox" aria-expanded="false" disabled>
            <div class="dropdown-trigger__left" data-ref="trigger-city-left">
              <svg class="component-icon dropdown-trigger__icon" data-ref="icon-city-trigger" aria-hidden="true"><use href="/icons.svg#domain"></use></svg>
              <span class="dropdown-trigger__text" data-ref="text-buyer-city-selected">Selecciona tu ciudad / municipio</span>
            </div>
            <svg class="component-icon dropdown-trigger__chevron" data-ref="icon-city-chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
          </button>
          <div class="menu-panel menu-panel--dropdown menu-panel--w-full" data-ref="dropdown-menu-buyer-city" role="listbox">
            <div class="menu-panel__list" data-ref="list-buyer-cities"></div>
          </div>
        </div>

        <div class="modal-reservation-summary" data-ref="reservation-summary">
          <div class="modal-reservation-summary__row" data-ref="summary-row">
            <span class="modal-reservation-summary__label" data-ref="summary-label">${count === 1 ? '1 boleto seleccionado' : `${formatNumber(count)} boletos seleccionados`}:</span>
            <span class="modal-reservation-summary__total" data-ref="summary-total">${formatCurrency(totalAmount, currency)}</span>
          </div>
          <div class="modal-reservation-summary__tickets" data-ref="summary-tickets">
            ${ticketList}
          </div>
        </div>
      </div>
    `;

    const nameInput = modalBody.querySelector<HTMLInputElement>('[data-ref="input-buyer-name"]');
    const phoneInput = modalBody.querySelector<HTMLInputElement>('[data-ref="input-buyer-phone"]');
    const ladaWrapper = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-lada"]');
    const ladaTrigger = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-lada"]');
    const ladaMenu = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-menu-lada"]');
    const ladaFlag = modalBody.querySelector<HTMLElement>('[data-ref="lada-trigger-flag"]');
    const ladaCode = modalBody.querySelector<HTMLElement>('[data-ref="lada-trigger-code"]');
    const ladaItems = modalBody.querySelectorAll<HTMLButtonElement>('[data-lada-code]');

    const stateWrapper = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-buyer-state"]');
    const stateTrigger = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-buyer-state"]');
    const stateMenu = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-menu-buyer-state"]');
    const stateSelectedText = modalBody.querySelector<HTMLElement>('[data-ref="text-buyer-state-selected"]');
    const stateItems = modalBody.querySelectorAll<HTMLButtonElement>('[data-state-value]');

    const cityWrapper = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-buyer-city"]');
    const cityTrigger = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-buyer-city"]');
    const cityMenu = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-menu-buyer-city"]');
    const citySelectedText = modalBody.querySelector<HTMLElement>('[data-ref="text-buyer-city-selected"]');
    const cityList = modalBody.querySelector<HTMLElement>('[data-ref="list-buyer-cities"]');

    let selectedCity = '';

    phoneInput?.addEventListener('input', () => {
      if (selectedLada.code === '+52') {
        phoneInput.value = formatMexicanPhone(phoneInput.value);
      }
    });

    const closeLadaDropdown = () => {
      ladaWrapper?.classList.remove('is-open');
      ladaTrigger?.classList.remove('is-open');
      ladaMenu?.classList.remove('is-open');
      ladaTrigger?.setAttribute('aria-expanded', 'false');
    };

    const openLadaDropdown = () => {
      ladaWrapper?.classList.add('is-open');
      ladaTrigger?.classList.add('is-open');
      ladaMenu?.classList.add('is-open');
      ladaTrigger?.setAttribute('aria-expanded', 'true');
    };

    const closeStateDropdown = () => {
      stateWrapper?.classList.remove('is-open');
      stateTrigger?.classList.remove('is-open');
      stateMenu?.classList.remove('is-open');
      stateTrigger?.setAttribute('aria-expanded', 'false');
    };

    const openStateDropdown = () => {
      stateWrapper?.classList.add('is-open');
      stateTrigger?.classList.add('is-open');
      stateMenu?.classList.add('is-open');
      stateTrigger?.setAttribute('aria-expanded', 'true');
    };

    const closeCityDropdown = () => {
      cityWrapper?.classList.remove('is-open');
      cityTrigger?.classList.remove('is-open');
      cityMenu?.classList.remove('is-open');
      cityTrigger?.setAttribute('aria-expanded', 'false');
    };

    const openCityDropdown = () => {
      if (cityTrigger?.disabled) return;
      cityWrapper?.classList.add('is-open');
      cityTrigger?.classList.add('is-open');
      cityMenu?.classList.add('is-open');
      cityTrigger?.setAttribute('aria-expanded', 'true');
    };

    ladaTrigger?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeStateDropdown();
      closeCityDropdown();
      if (ladaWrapper?.classList.contains('is-open')) {
        closeLadaDropdown();
      } else {
        openLadaDropdown();
      }
    });

    ladaItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const code = item.getAttribute('data-lada-code');
        const found = COUNTRY_LADAS.find((l) => l.code === code);
        if (found) {
          selectedLada = found;
          if (ladaFlag) ladaFlag.textContent = found.flag;
          if (ladaCode) ladaCode.textContent = found.code;
          ladaItems.forEach((btn) => btn.classList.remove('is-active'));
          item.classList.add('is-active');
          if (phoneInput) {
            phoneInput.value = selectedLada.code === '+52' ? formatMexicanPhone(phoneInput.value) : phoneInput.value.replace(/\D/g, '');
          }
        }
        closeLadaDropdown();
      });
    });

    stateTrigger?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeLadaDropdown();
      closeCityDropdown();
      if (stateWrapper?.classList.contains('is-open')) {
        closeStateDropdown();
      } else {
        openStateDropdown();
      }
    });

    cityTrigger?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeLadaDropdown();
      closeStateDropdown();
      if (cityWrapper?.classList.contains('is-open')) {
        closeCityDropdown();
      } else {
        openCityDropdown();
      }
    });

    const populateCities = (stateName: string) => {
      if (!cityList) return;
      const cities = getCitiesForState(stateName);
      cityList.innerHTML = cities
        .map(
          (city) => `
            <button type="button" class="menu-item" data-ref="item-city-${escapeHtml(city)}" data-city-value="${escapeHtml(city)}" role="option">
              <span class="menu-item__text" data-ref="text-city-item">${escapeHtml(city)}</span>
            </button>
          `
        )
        .join('');

      cityWrapper?.classList.remove('is-disabled');
      if (cityTrigger) {
        cityTrigger.disabled = false;
      }
      if (citySelectedText) {
        citySelectedText.textContent = 'Selecciona tu ciudad / municipio';
      }
      selectedCity = '';

      const cityItems = cityList.querySelectorAll<HTMLButtonElement>('[data-city-value]');
      cityItems.forEach((cItem) => {
        cItem.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          selectedCity = cItem.getAttribute('data-city-value') || '';
          if (citySelectedText) {
            citySelectedText.textContent = selectedCity;
          }
          cityItems.forEach((btn) => btn.classList.remove('is-active'));
          cItem.classList.add('is-active');
          closeCityDropdown();
        });
      });
    };

    stateItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedState = item.getAttribute('data-state-value') || '';
        if (stateSelectedText) {
          stateSelectedText.textContent = selectedState;
        }
        stateItems.forEach((btn) => btn.classList.remove('is-active'));
        item.classList.add('is-active');
        closeStateDropdown();
        populateCities(selectedState);
      });
    });

    modalBody.addEventListener('click', (e) => {
      if (!stateWrapper?.contains(e.target as Node)) {
        closeStateDropdown();
      }
      if (!ladaWrapper?.contains(e.target as Node)) {
        closeLadaDropdown();
      }
      if (!cityWrapper?.contains(e.target as Node)) {
        closeCityDropdown();
      }
    });

    const modal = openModal({
      bodyHtml: modalBody,
      cancelText: t('common.cancel'),
      confirmClass: 'component-button--black',
      confirmText: t('orders.continue_btn'),
      description: t('orders.modal_reserving_desc'),
      onConfirm: async () => {
        const name = nameInput?.value.trim() || '';
        const rawPhone = phoneInput?.value || '';
        const cleanDigits = rawPhone.replace(/\D/g, '');
        const state = selectedState.trim();

        if (name.length < 2) {
          modal.setError('Ingresa tu nombre completo para continuar.');
          return false;
        }

        if (selectedLada.code === '+52') {
          const mexPhone = normalizeMexicanPhone(rawPhone);
          if (mexPhone.length !== 10) {
            modal.setError('Ingresa un número celular válido de 10 dígitos.');
            return false;
          }
        } else {
          if (cleanDigits.length < 7 || cleanDigits.length > 15) {
            modal.setError('Ingresa un número telefónico válido (entre 7 y 15 dígitos).');
            return false;
          }
        }

        if (!state) {
          modal.setError('Selecciona tu estado de la República.');
          return false;
        }

        if (!selectedCity) {
          modal.setError('Selecciona tu ciudad o municipio.');
          return false;
        }

        modal.setError('');

        const finalPhone = selectedLada.code === '+52' ? normalizeMexicanPhone(rawPhone) : `${selectedLada.code}${cleanDigits}`;
        const finalState = `${state}, ${selectedCity}`;

        const res = await reserveTicketsApi({
          customerName: name,
          customerPhone: finalPhone,
          customerState: finalState,
          giveawayUuid: this.giveaway!.uuid,
          ticketNumbers: Array.from(this.selectedTickets),
        });

        if (!res.success || !res.data) {
          modal.setError(res.error || 'No fue posible apartar los boletos.');
          return false;
        }

        try {
          localStorage.setItem('boreal_phone', finalPhone);
          localStorage.setItem('boreal_name', name);
        } catch (_) {}

        for (const num of this.selectedTickets) {
          this.reservedSet.add(num);
        }
        this.selectedTickets.clear();
        this.renderTickets();
        this.renderPagination();
        this.updateSummary();

        modal.close();
        this.openBankInfoModal(res.data.order, res.data.bankAccounts);
        return true;
      },
      size: 'md',
      title: t('orders.modal_data_title'),
    });
  }

  private openBankInfoModal(order: Order, bankAccounts: BankAccount[]): void {
    this.activePendingOrder = { bankAccounts, order };
    try {
      localStorage.setItem('boreal_pending_order_' + this.uuid, JSON.stringify(this.activePendingOrder));
    } catch (_) {}
    this.renderPendingOrderBanner();

    openBankInfoModal({
      bankAccounts,
      onUploadReceipt: () => navigate(`/validate-payment/o/${encodeURIComponent(order.uuid)}`),
      order,
    });
  }

  destroy(): void {
    this.stopDrawingPoll();
    this.stopPendingOrderTimer();
    this.stopGallerySlideshow();
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    for (const unsub of this.unsubscribeWs) {
      unsub();
    }
    this.unsubscribeWs = [];
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createGiveawayDetailView(uuid: string): Promise<HTMLElement> {
  const container = await loadTemplate('/views/giveaway/giveaway-detail.html');
  const controller = new GiveawayDetailController(container, uuid);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
