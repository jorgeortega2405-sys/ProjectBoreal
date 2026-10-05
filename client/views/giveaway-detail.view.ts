import { navigate } from '../app-router.js';
import { openModal } from '../components/modal.component.js';
import { fetchGiveawayDetail, fetchGiveawayTickets } from '../services/giveaways.service.js';
import { getCurrentLanguage, t } from '../services/i18n.service.js';
import { reserveTicketsApi } from '../services/orders.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { onWebSocketEvent } from '../services/websocket.service.js';
import { Giveaway } from '../types/giveaway.types.js';
import { BankAccount, Order } from '../types/order.types.js';
import { formatCurrency, formatNumber } from '../utils/number.util.js';
import { formatMexicanPhone, normalizeMexicanPhone } from '../utils/phone.util.js';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatShortDate(dateStr: string, lang = 'es-419'): string {
  const clean = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
  const d = new Date(clean);
  if (isNaN(d.getTime())) return dateStr;
  const locale = lang.startsWith('en') ? 'en-US' : 'es-MX';
  const day = d.getDate();
  const monthName = d.toLocaleDateString(locale, { month: 'short' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');
  return `${day} ${capitalizedMonth}`;
}

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

const MEXICAN_STATES = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Ciudad de México',
  'Coahuila',
  'Colima',
  'Durango',
  'Estado de México',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas',
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
    this.renderQuantitiesDropdown();
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
    if (Array.isArray(this.giveaway.image_urls)) {
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
        if (typeof data.ticket_count === 'number' && this.giveaway.available_tickets !== undefined) {
          this.giveaway.available_tickets = Math.max(0, this.giveaway.available_tickets - data.ticket_count);
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
      if (timerText) timerText.textContent = t('giveaway.status_completed');
      if (timerBadge) {
        timerBadge.classList.add('giveaway-badge--danger');
        timerBadge.classList.remove('giveaway-badge--warning');
      }
      if (closedBanner) {
        closedBanner.classList.add('is-hidden');
        closedBanner.style.display = 'none';
      }
      if (upcomingBanner) {
        upcomingBanner.classList.add('is-hidden');
        upcomingBanner.style.display = 'none';
      }
      if (winnerBanner) {
        winnerBanner.classList.remove('is-hidden');
        winnerBanner.style.display = 'block';
        if (winnerNameEl) winnerNameEl.textContent = g.winner_name || 'Sin participantes';
        if (winnerTicketEl) winnerTicketEl.textContent = g.winner_ticket_number ? `#${g.winner_ticket_number}` : 'N/A';
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
        closedBanner.style.display = 'none';
      }
      if (upcomingBanner) {
        upcomingBanner.classList.remove('is-hidden');
        upcomingBanner.style.display = 'block';
        if (upcomingBannerText) {
          upcomingBannerText.textContent = t('giveaway.upcoming_banner', { date: dateText });
        }
      }
      if (winnerBanner) {
        winnerBanner.classList.add('is-hidden');
        winnerBanner.style.display = 'none';
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
      upcomingBanner.style.display = 'none';
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
        closedBanner.style.display = 'none';
      }
      if (winnerBanner) {
        winnerBanner.classList.add('is-hidden');
        winnerBanner.style.display = 'none';
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
        closedBanner.style.display = 'none';
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
        closedBanner.style.display = 'block';
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
        closedBanner.style.display = 'none';
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
    const triggerBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-quantity"]');
    if (triggerBtn) {
      triggerBtn.disabled = disabled;
      triggerBtn.classList.toggle('is-disabled', disabled);
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
    const modalContent = `
      <div class="winner-modal-box" style="text-align: center; padding: 24px 16px;">
        <div class="winner-trophy" style="font-size: 48px; margin-bottom: 12px;">🏆</div>
        <h2 class="winner-title" style="font-size: 22px; font-weight: 800; color: #f59e0b; margin-bottom: 8px;">${t('giveaway.winner_congrats_title')}</h2>
        <p class="winner-sub" style="font-size: 15px; color: var(--text-secondary); margin-bottom: 20px;">
          ${t('giveaway.winner_congrats_desc', { ticket: ticketNum ?? 'N/A' })}
        </p>
        <div class="winner-card" style="padding: 16px 20px; border-radius: 12px; background: var(--bg-hover); margin-bottom: 24px; border: 1px solid var(--border-subtle);">
          <div class="winner-card-label" style="font-size: 12px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">${t('giveaway.winner_label')}</div>
          <div class="winner-card-name" style="font-size: 20px; font-weight: 700; color: var(--text-primary); margin-top: 4px;">${winnerName}</div>
          <div class="winner-card-ticket" style="font-size: 13px; color: var(--text-secondary); margin-top: 8px;">
            ${t('giveaway.winner_ticket_label')} <strong style="color: #f59e0b;">#${ticketNum ?? 'N/A'}</strong>
          </div>
        </div>
        <button type="button" class="component-button component-button--black component-button--h50 component-button--w-full" data-ref="btn-close-winner-modal">
          ${t('giveaway.winner_close_modal')}
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
      } else {
        statusBadgeEl.innerHTML = `<span>${escapeHtml(t('home.active_badge'))}</span>`;
      }
    }

    const drawBadgeEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-draw-date-badge"]');
    const dateTextEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-draw-date-text"]');
    if (drawBadgeEl && dateTextEl) {
      if (isUpcoming) {
        drawBadgeEl.style.display = 'inline-flex';
        const dateText = formatShortDate(g.start_date, getCurrentLanguage());
        dateTextEl.textContent = t('giveaway.upcoming_badge', { date: dateText });
      } else if (g.min_threshold_pct > 0 && !g.threshold_reached_at) {
        drawBadgeEl.style.display = 'inline-flex';
        dateTextEl.textContent = t('home.threshold_target', { target: g.min_threshold_pct });
      } else if (g.draw_date) {
        drawBadgeEl.style.display = 'inline-flex';
        const formattedDate = new Date(g.draw_date).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        dateTextEl.textContent = t('giveaway.draw_date', { date: formattedDate });
      } else {
        drawBadgeEl.style.display = 'none';
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
      if (g.min_threshold_pct > 0 && !g.threshold_reached_at) {
        thresholdHintEl.style.display = 'block';
        thresholdHintEl.textContent = t('giveaway.threshold_waiting_desc', {
          hours: g.countdown_hours || 48,
          target: g.min_threshold_pct,
        });
      } else {
        thresholdHintEl.style.display = 'none';
      }
    }
  }

  private renderGallery(): void {
    const mainImg = this.container.querySelector<HTMLImageElement>('[data-ref="gallery-main-image"]');
    if (mainImg) {
      mainImg.src = this.activeImageUrl;
      mainImg.alt = this.giveaway?.title || '';
    }

    const dotsContainer = this.container.querySelector<HTMLElement>('[data-ref="gallery-dots"]');
    if (dotsContainer) {
      if (this.allImages.length <= 1) {
        dotsContainer.style.display = 'none';
      } else {
        dotsContainer.style.display = 'flex';
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

    if (this.allImages.length <= 1) {
      thumbsContainer.style.display = 'none';
      return;
    }

    thumbsContainer.style.display = 'flex';
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

  private startGallerySlideshow(): void {
    this.stopGallerySlideshow();
    if (this.allImages.length <= 1) return;

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
      const stored = localStorage.getItem('boreal_pending_order_' + this.uuid);
      if (!stored) return;
      const data = JSON.parse(stored);
      if (data?.order?.expires_at && new Date(data.order.expires_at).getTime() > Date.now()) {
        this.activePendingOrder = data;
        const ticketNums = data.order.ticket_numbers || [];
        for (const num of ticketNums) {
          this.reservedSet.add(num);
        }
        this.renderPendingOrderBanner();
      } else {
        localStorage.removeItem('boreal_pending_order_' + this.uuid);
      }
    } catch (_) {
      localStorage.removeItem('boreal_pending_order_' + this.uuid);
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
        const formattedNumber = num.toString().padStart(3, '0');
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
      paginationEl.style.display = totalPages > 1 ? 'flex' : 'none';
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

    const triggerText = this.container.querySelector<HTMLElement>('[data-ref="quantity-selected-text"]');
    const triggerPrice = this.container.querySelector<HTMLElement>('[data-ref="quantity-selected-price"]');
    if (triggerText) {
      triggerText.textContent = count === 1 ? '1 boleto' : `${formatNumber(count)} boletos`;
    }
    if (triggerPrice) {
      triggerPrice.textContent = formatCurrency(totalAmount, currency);
    }

    const options = this.container.querySelectorAll<HTMLButtonElement>('[data-ref="list-quantities"] .menu-item');
    options.forEach((opt) => {
      const qty = parseInt(opt.getAttribute('data-qty') || '0', 10);
      opt.classList.toggle('is-active', qty === count);
    });

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
  }

  private renderQuantitiesDropdown(): void {
    if (!this.giveaway) return;
    const listEl = this.container.querySelector<HTMLElement>('[data-ref="list-quantities"]');
    if (!listEl) return;

    const rawOptions = this.giveaway.package_options;
    const options = Array.isArray(rawOptions) && rawOptions.length > 0 ? rawOptions : [1, 3, 5, 10, 20];
    const currency = this.giveaway.currency || 'MXN';
    const price = this.giveaway.ticket_price || 0;

    const isClosed = this.isSalesClosed();

    listEl.innerHTML = options
      .map((qty) => {
        const subtotal = formatCurrency(qty * price, currency);
        const qtyLabel = qty === 1 ? '1 boleto' : `${formatNumber(qty)} boletos`;
        const disabledAttr = isClosed ? 'disabled' : '';
        const disabledClass = isClosed ? 'is-disabled' : '';
        return `
          <button type="button" class="menu-item ${disabledClass}" ${disabledAttr} data-ref="option-qty-${qty}" data-qty="${qty}">
            <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
            <span class="menu-item__text">${qtyLabel}</span>
            <span class="menu-item__subtext">${subtotal}</span>
          </button>
        `;
      })
      .join('');
  }

  private bindQuantityDropdown(): void {
    const signal = this.abortController?.signal;
    const wrapper = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-quantity"]');
    const trigger = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-quantity"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="dropdown-backdrop-quantity"]');
    const menu = this.container.querySelector<HTMLElement>('[data-ref="dropdown-menu-quantity"]');
    const listEl = this.container.querySelector<HTMLElement>('[data-ref="list-quantities"]');

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

    trigger?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.isSalesClosed()) {
          showToast(t('giveaway.toast_sales_closed'), 'warning');
          return;
        }
        if (wrapper?.classList.contains('is-open')) {
          closeDropdown();
        } else {
          openDropdown();
        }
      },
      { signal }
    );

    backdrop?.addEventListener(
      'click',
      (e) => {
        if (e.target === backdrop) {
          closeDropdown();
        }
      },
      { signal }
    );

    document.addEventListener(
      'click',
      (e) => {
        if (!wrapper?.contains(e.target as Node)) {
          closeDropdown();
        }
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          closeDropdown();
        }
      },
      { signal }
    );

    listEl?.addEventListener(
      'click',
      (e) => {
        const itemBtn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.menu-item');
        if (!itemBtn) return;
        const qtyStr = itemBtn.getAttribute('data-qty');
        if (!qtyStr) return;
        const qty = parseInt(qtyStr, 10);
        closeDropdown();
        if (this.isSalesClosed()) {
          showToast(t('giveaway.toast_sales_closed'), 'warning');
          return;
        }
        this.selectRandomTickets(qty);
      },
      { signal }
    );
  }

  private renderNotFound(): void {
    const container = this.container.querySelector<HTMLElement>('[data-ref="giveaway-container"]');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; padding: 80px 20px;">
        <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">${t('giveaway.not_found_title')}</h2>
        <p style="color: var(--text-secondary); margin-bottom: 24px;">${t('giveaway.not_found_desc')}</p>
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
    const rawOptions = this.giveaway.package_options;
    const maxPkg = Array.isArray(rawOptions) && rawOptions.length > 0 ? Math.max(...rawOptions) : 20;
    const maxAllowed = Math.max(20, maxPkg);
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
        navigate('/validate-payment');
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
          const rawOptions = this.giveaway?.package_options;
          const maxPkg = Array.isArray(rawOptions) && rawOptions.length > 0 ? Math.max(...rawOptions) : 20;
          const maxAllowed = Math.max(20, maxPkg);
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

    const luckyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-lucky-pick"]');
    luckyBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.isSalesClosed()) {
          showToast(t('giveaway.toast_sales_closed'), 'warning');
          return;
        }
        this.selectRandomTickets(3);
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

    this.bindQuantityDropdown();

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
        <div class="field-helper-text" data-ref="helper-phone-whatsapp">
          <svg class="component-icon field-helper-text__icon" data-ref="icon-phone-whatsapp" aria-hidden="true"><use href="/icons.svg#whatsapp"></use></svg>
          <span>Los ganadores serán contactados exclusivamente por WhatsApp.</span>
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

    ladaTrigger?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeStateDropdown();
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
      if (stateWrapper?.classList.contains('is-open')) {
        closeStateDropdown();
      } else {
        openStateDropdown();
      }
    });

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
      });
    });

    modalBody.addEventListener('click', (e) => {
      if (!stateWrapper?.contains(e.target as Node)) {
        closeStateDropdown();
      }
      if (!ladaWrapper?.contains(e.target as Node)) {
        closeLadaDropdown();
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

        modal.setError('');

        const finalPhone = selectedLada.code === '+52' ? normalizeMexicanPhone(rawPhone) : `${selectedLada.code}${cleanDigits}`;

        const res = await reserveTicketsApi({
          customerName: name,
          customerPhone: finalPhone,
          customerState: state,
          giveawayUuid: this.giveaway!.uuid,
          ticketNumbers: Array.from(this.selectedTickets),
        });

        if (!res.success || !res.data) {
          modal.setError(res.error || 'No fue posible apartar los boletos.');
          return false;
        }

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
    let timerInterval: number | null = null;
    this.activePendingOrder = { bankAccounts, order };
    try {
      localStorage.setItem('boreal_pending_order_' + this.uuid, JSON.stringify(this.activePendingOrder));
    } catch (_) {}
    this.renderPendingOrderBanner();

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div class="payment-split" data-ref="payment-split-box">
        <div class="payment-split__left" data-ref="payment-split-left">
          <div class="payment-split__header" data-ref="payment-header">
            <h2 class="payment-split__title" data-ref="payment-title">${t('orders.payment_info_title')}</h2>
            <p class="payment-split__desc" data-ref="payment-desc">${t('orders.payment_info_desc')}</p>
          </div>

          <div class="modal-timer-box" data-ref="timer-box">
            <div class="modal-timer-box__left" data-ref="timer-box-left">
              <svg class="component-icon modal-timer-box__icon" data-ref="timer-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
              <span class="modal-timer-box__label" data-ref="timer-label">${t('orders.timer_label')}</span>
            </div>
            <span class="modal-timer-digits" data-ref="spei-timer-countdown">29:59</span>
          </div>

          <div class="modal-info-stat-card" data-ref="card-amount-to-pay">
            <div class="modal-info-stat-card__text" data-ref="text-amount-to-pay">
              <span class="modal-info-stat-card__label" data-ref="label-amount-to-pay">${t('orders.amount_to_pay')}</span>
              <span class="modal-info-stat-card__val" data-ref="val-amount-to-pay">${formatCurrency(order.total_amount, order.currency)}</span>
            </div>
            <button type="button" class="component-button component-button--ghost component-button--h32 component-button--icon-only modal-copy-btn" data-ref="btn-copy-amount" data-tooltip="${t('orders.copy_amount')}" data-copy-val="${order.total_amount.toFixed(2)}">
              <svg class="component-icon" data-ref="copy-amount-icon" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
            </button>
          </div>

          <div class="modal-info-stat-card" data-ref="card-concept-reference">
            <div class="modal-info-stat-card__text" data-ref="text-concept-reference">
              <span class="modal-info-stat-card__label" data-ref="label-concept-reference">${t('orders.concept_label')}</span>
              <span class="modal-info-stat-card__val modal-info-stat-card__val--concept" data-ref="val-concept-reference">${escapeHtml(order.concept_reference)}</span>
            </div>
            <button type="button" class="component-button component-button--ghost component-button--h32 component-button--icon-only modal-copy-btn" data-ref="btn-copy-concept" data-tooltip="Copiar concepto" data-copy-val="${escapeHtml(order.concept_reference)}">
              <svg class="component-icon" data-ref="copy-concept-icon" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
            </button>
          </div>

          <div class="modal-receipt-note" data-ref="note-receipt">
            ${t('orders.receipt_instruction')}
          </div>

          <div class="banner banner--danger is-hidden" data-ref="split-modal-error"></div>

          <div class="payment-split__actions" data-ref="payment-actions">
            <button type="button" class="component-button component-button--black component-button--h45 component-button--w-full" data-ref="btn-modal-upload-receipt">
              <svg class="component-icon" data-ref="upload-receipt-icon" aria-hidden="true"><use href="/icons.svg#upload_file"></use></svg>
              <span>${t('orders.go_to_validate_btn')}</span>
            </button>
            <button type="button" class="component-button component-button--ghost component-button--h38 component-button--w-full" data-ref="btn-modal-close-split">
              <span>Entendido, pagar después</span>
            </button>
          </div>
        </div>

        <div class="payment-split__right" data-ref="payment-split-right">
          <div class="payment-split__section-header" data-ref="section-header-accounts">
            <h3 class="payment-split__section-title" data-ref="section-title-accounts">Cuentas bancarias autorizadas</h3>
            <p class="payment-split__section-desc" data-ref="section-desc-accounts">Transfiere el monto exacto a cualquiera de las siguientes cuentas:</p>
          </div>

          <div class="payment-split__accounts-list" data-ref="accounts-list">
            ${bankAccounts.length === 0 ? `
              <div class="empty-accounts-notice" data-ref="notice-empty-accounts">
                No hay cuentas bancarias activas registradas en este sorteo. Por favor contacta al organizador.
              </div>
            ` : bankAccounts.map((acc) => `
              <div class="modal-bank-card" data-ref="bank-card-${acc.id}">
                <div class="modal-bank-card__header" data-ref="bank-card-header-${acc.id}">
                  <span class="modal-bank-card__name" data-ref="bank-name-${acc.id}">${escapeHtml(acc.bank_name)}</span>
                  <span class="modal-bank-card__currency" data-ref="bank-currency-${acc.id}">${escapeHtml(acc.currency)}</span>
                </div>
                <div class="modal-bank-card__holder" data-ref="bank-holder-${acc.id}">
                  <span>${t('orders.beneficiary_label')}: </span>
                  <strong class="modal-bank-card__holder-name" data-ref="bank-holder-name-${acc.id}">${escapeHtml(acc.account_holder)}</strong>
                </div>
                ${acc.clabe ? `
                <div class="modal-bank-field" data-ref="field-clabe-${acc.id}">
                  <div class="modal-bank-field__content" data-ref="field-clabe-content-${acc.id}">
                    <span class="modal-bank-field__label" data-ref="label-clabe-${acc.id}">${t('orders.clabe_label')}</span>
                    <span class="modal-bank-field__value" data-ref="value-clabe-${acc.id}">${escapeHtml(acc.clabe)}</span>
                  </div>
                  <button type="button" class="component-button component-button--ghost component-button--h32 component-button--icon-only modal-copy-btn" data-ref="btn-copy-clabe-${acc.id}" data-tooltip="${t('orders.copy_clabe')}" data-copy-val="${escapeHtml(acc.clabe)}">
                    <svg class="component-icon" data-ref="icon-copy-clabe-${acc.id}" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
                  </button>
                </div>` : ''}
                ${acc.card_number ? `
                <div class="modal-bank-field" data-ref="field-card-${acc.id}">
                  <div class="modal-bank-field__content" data-ref="field-card-content-${acc.id}">
                    <span class="modal-bank-field__label" data-ref="label-card-${acc.id}">${t('orders.card_number_label')}</span>
                    <span class="modal-bank-field__value modal-bank-field__value--card" data-ref="value-card-${acc.id}">${escapeHtml(acc.card_number)}</span>
                  </div>
                  <button type="button" class="component-button component-button--ghost component-button--h32 component-button--icon-only modal-copy-btn" data-ref="btn-copy-card-${acc.id}" data-tooltip="${t('orders.copy_card')}" data-copy-val="${escapeHtml(acc.card_number)}">
                    <svg class="component-icon" data-ref="icon-copy-card-${acc.id}" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
                  </button>
                </div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    const copyBtns = modalBody.querySelectorAll<HTMLButtonElement>('[data-copy-val]');
    copyBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const val = btn.getAttribute('data-copy-val') || '';
        void navigator.clipboard.writeText(val);
        showToast(t('orders.copied'), 'info');
      });
    });

    const modal = openModal({
      bodyHtml: modalBody,
      showCancel: false,
      showConfirm: false,
      size: 'split',
      onClose: () => {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      },
    });

    const uploadBtn = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-modal-upload-receipt"]');
    const closeSplitBtn = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-modal-close-split"]');

    uploadBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (timerInterval) clearInterval(timerInterval);
      modal.close();
      navigate(`/validate-payment?order=${encodeURIComponent(order.uuid)}`);
    });

    closeSplitBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (timerInterval) clearInterval(timerInterval);
      modal.close();
    });

    const countdownEl = modalBody.querySelector<HTMLElement>('[data-ref="spei-timer-countdown"]');
    const splitErrorEl = modalBody.querySelector<HTMLElement>('[data-ref="split-modal-error"]');
    const expiresAt = new Date(order.expires_at).getTime();

    timerInterval = window.setInterval(() => {
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      if (diff > 0) {
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        if (countdownEl) {
          countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
      } else {
        if (countdownEl) countdownEl.textContent = '0:00';
        if (timerInterval) clearInterval(timerInterval);
        if (splitErrorEl) {
          splitErrorEl.textContent = t('orders.expired_notice');
          splitErrorEl.classList.remove('is-hidden');
        }
      }
    }, 1000);
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
