import { navigate } from '../app-router.js';
import { openModal } from '../components/modal.component.js';
import { fetchGiveawayDetail, fetchGiveawayTickets } from '../services/giveaways.service.js';
import { t } from '../services/i18n.service.js';
import { reserveTicketsApi } from '../services/orders.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { onWebSocketEvent } from '../services/websocket.service.js';
import { Giveaway } from '../types/giveaway.types.js';
import { BankAccount, Order } from '../types/order.types.js';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class GiveawayDetailController {
  private abortController: AbortController | null = null;
  private activeImageUrl: string = '';
  private allImages: string[] = [];
  private container: HTMLElement;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private currentPage: number = 1;
  private giveaway: Giveaway | null = null;
  private pageSize: number = 100;
  private paidSet: Set<number> = new Set();
  private reservedSet: Set<number> = new Set();
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private selectedTickets: Set<number> = new Set();
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
    this.startCountdown();
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
        this.giveaway.status = 'completed';
        this.giveaway.winner_name = data.winner_name;
        this.giveaway.winner_ticket_number = data.winner_ticket_number;
        this.giveaway.winner_announced_at = data.winner_announced_at;
        this.updateCountdownDisplay();
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
        if (!this.giveaway || this.giveaway.uuid !== data.giveaway_uuid) return;
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

    if (g.status === 'completed') {
      if (timerText) timerText.textContent = t('giveaway.status_completed');
      if (timerBadge) {
        timerBadge.classList.add('giveaway-badge--danger');
        timerBadge.classList.remove('giveaway-badge--warning');
      }
      if (closedBanner) closedBanner.style.display = 'none';
      if (winnerBanner) {
        winnerBanner.style.display = 'block';
        if (winnerNameEl) winnerNameEl.textContent = g.winner_name || 'Sin participantes';
        if (winnerTicketEl) winnerTicketEl.textContent = g.winner_ticket_number ? `#${g.winner_ticket_number}` : 'N/A';
      }
      if (buyBtn) {
        buyBtn.disabled = true;
        const text = buyBtn.querySelector('span');
        if (text) text.textContent = t('giveaway.sales_closed_btn');
      }
      return;
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
      if (closedBanner) closedBanner.style.display = 'none';
      if (winnerBanner) winnerBanner.style.display = 'none';
      return;
    }

    const endMs = new Date(g.end_date).getTime();
    const diff = endMs - Date.now();

    if (diff <= 0) {
      if (timerText) timerText.textContent = '00:00:00';
      if (closedBanner) closedBanner.style.display = 'none';
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

    if (diff <= 3600 * 1000) {
      if (timerBadge) timerBadge.classList.add('giveaway-badge--warning');
      if (closedBanner) closedBanner.style.display = 'block';
      if (buyBtn) {
        buyBtn.disabled = true;
        const text = buyBtn.querySelector('span');
        if (text) text.textContent = t('giveaway.sales_closed_btn');
      }
    } else {
      if (timerBadge) timerBadge.classList.remove('giveaway-badge--warning');
      if (closedBanner) closedBanner.style.display = 'none';
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
    if (priceEl) priceEl.textContent = `$${g.ticket_price.toFixed(2)} ${g.currency || 'MXN'}`;

    const dateTextEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-draw-date-text"]');
    if (dateTextEl && g.draw_date) {
      if (g.min_threshold_pct > 0 && !g.threshold_reached_at) {
        dateTextEl.textContent = t('home.threshold_target', { target: g.min_threshold_pct });
      } else {
        const formattedDate = new Date(g.draw_date).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        dateTextEl.textContent = t('giveaway.draw_date', { date: formattedDate });
      }
    }

    const total = g.total_tickets || 100;
    const available = g.available_tickets ?? total;
    const pct = Math.round(((total - available) / total) * 100);

    const progressTextEl = this.container.querySelector<HTMLElement>('[data-ref="giveaway-progress-text"]');
    if (progressTextEl) {
      if (g.min_threshold_pct > 0 && !g.threshold_reached_at) {
        progressTextEl.textContent = `${t('giveaway.tickets_progress', { available, total })} • ${t('home.threshold_target', { target: g.min_threshold_pct })}`;
      } else {
        progressTextEl.textContent = t('giveaway.tickets_progress', { available, total });
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

    grid.innerHTML = visibleNumbers
      .map((num) => {
        const isSelected = this.selectedTickets.has(num);
        const isPaid = this.paidSet.has(num);
        const isReserved = this.reservedSet.has(num);
        const stateClass = isSelected
          ? 'is-selected'
          : isPaid || isReserved
            ? 'is-taken'
            : 'is-available';
        const formattedNumber = num.toString().padStart(3, '0');
        return `
          <button type="button" class="giveaway-ticket ${stateClass}" data-ref="ticket-${num}" data-number="${num}">
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
    const total = (count * this.giveaway.ticket_price).toFixed(2);
    const currency = this.giveaway.currency || 'MXN';

    const countEl = this.container.querySelector<HTMLElement>('[data-ref="summary-selected-count"]');
    if (countEl) {
      countEl.textContent = t('giveaway.selected_summary', { count });
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
    const targetCount = Math.min(count, availableCount, 20);
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

    const thumbsContainer = this.container.querySelector<HTMLElement>('[data-ref="gallery-thumbs"]');
    thumbsContainer?.addEventListener(
      'click',
      (e) => {
        const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.giveaway-gallery__thumb');
        if (!btn) return;
        const url = btn.getAttribute('data-url');
        if (url && url !== this.activeImageUrl) {
          this.activeImageUrl = url;
          const mainImg = this.container.querySelector<HTMLImageElement>('[data-ref="gallery-main-image"]');
          if (mainImg) {
            mainImg.style.opacity = '0.4';
            setTimeout(() => {
              mainImg.src = url;
              mainImg.style.opacity = '1';
            }, 120);
          }
          thumbsContainer.querySelectorAll('.giveaway-gallery__thumb').forEach((el) => {
            el.classList.toggle('is-active', el === btn);
          });
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
          if (this.selectedTickets.size >= 20) {
            showToast('No puedes seleccionar más de 20 boletos por orden.', 'warning');
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

    const quickBtns = this.container.querySelectorAll<HTMLButtonElement>('.giveaway-qty-btn');
    quickBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          if (this.isSalesClosed()) {
            showToast(t('giveaway.toast_sales_closed'), 'warning');
            return;
          }
          const qty = parseInt(btn.getAttribute('data-qty') || '1', 10);
          this.selectRandomTickets(qty);
        },
        { signal }
      );
    });

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
    const total = (count * this.giveaway.ticket_price).toFixed(2);
    const currency = this.giveaway.currency || 'MXN';
    const ticketList = Array.from(this.selectedTickets)
      .map((n) => `<span class="giveaway-ticket is-selected" style="height: 30px; width: 50px; font-size: 11px; cursor: default;">#${n.toString().padStart(3, '0')}</span>`)
      .join('');

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color);">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
            <span style="color: var(--text-secondary);">${count} boletos seleccionados:</span>
            <span style="font-weight: 800; font-size: 15px; color: var(--text-primary);">$${total} ${currency}</span>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
            ${ticketList}
          </div>
        </div>

        <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">${t('orders.modal_data_desc')}</p>

        <label class="field" data-ref="field-buyer-name">
          <input class="field__input" data-ref="input-buyer-name" type="text" maxlength="100" placeholder=" " value="" autocomplete="name" />
          <span class="field__label" data-ref="label-buyer-name">${t('orders.full_name_label')}</span>
        </label>

        <label class="field" data-ref="field-buyer-phone">
          <input class="field__input" data-ref="input-buyer-phone" type="tel" maxlength="20" placeholder=" " value="" autocomplete="tel" />
          <span class="field__label" data-ref="label-buyer-phone">${t('orders.phone_label')}</span>
        </label>
      </div>
    `;

    const nameInput = modalBody.querySelector<HTMLInputElement>('[data-ref="input-buyer-name"]');
    const phoneInput = modalBody.querySelector<HTMLInputElement>('[data-ref="input-buyer-phone"]');

    const modal = openModal({
      bodyHtml: modalBody,
      cancelText: t('common.cancel'),
      confirmClass: 'component-button--black',
      confirmText: t('orders.continue_btn'),
      description: t('orders.modal_reserving_desc'),
      onConfirm: async () => {
        const name = nameInput?.value.trim() || '';
        const phone = phoneInput?.value.trim() || '';

        if (name.length < 2) {
          modal.setError('Ingresa tu nombre completo para continuar.');
          return false;
        }

        if (phone.length < 8) {
          modal.setError('Ingresa un número de teléfono válido.');
          return false;
        }

        modal.setError('');

        const res = await reserveTicketsApi({
          customerName: name,
          customerPhone: phone,
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

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Reloj Regresivo 30 min -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); color: #d97706; font-size: 13px; font-weight: 600;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg class="component-icon" aria-hidden="true" style="width: 16px; height: 16px;"><use href="/icons.svg#schedule"></use></svg>
            <span>${t('orders.timer_label')}</span>
          </div>
          <span data-ref="spei-timer-countdown" style="font-size: 16px; font-weight: 800;">29:59</span>
        </div>

        <!-- Cuentas Bancarias Disponibles -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${bankAccounts
            .map(
              (acc) => `
            <div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${escapeHtml(acc.bank_name)}</span>
                <span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-secondary);">${escapeHtml(acc.currency)}</span>
              </div>
              <div style="font-size: 12.5px; color: var(--text-secondary);">
                <span>${t('orders.beneficiary_label')}: </span>
                <strong style="color: var(--text-primary);">${escapeHtml(acc.account_holder)}</strong>
              </div>
              ${acc.clabe ? `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border-color);">
                <div>
                  <span style="font-size: 11px; color: var(--text-tertiary); display: block;">${t('orders.clabe_label')}</span>
                  <span style="font-size: 14px; font-weight: 800; letter-spacing: 0.5px; color: var(--text-primary);">${escapeHtml(acc.clabe)}</span>
                </div>
                <button type="button" class="component-button component-button--ghost component-button--h32" data-ref="btn-copy-clabe-${acc.id}" data-copy-val="${escapeHtml(acc.clabe)}">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#share"></use></svg>
                  <span>${t('orders.copy_clabe')}</span>
                </button>
              </div>` : ''}
              ${acc.card_number ? `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border-color);">
                <div>
                  <span style="font-size: 11px; color: var(--text-tertiary); display: block;">${t('orders.card_number_label')}</span>
                  <span style="font-size: 14px; font-weight: 800; letter-spacing: 1px; color: var(--text-primary);">${escapeHtml(acc.card_number)}</span>
                </div>
                <button type="button" class="component-button component-button--ghost component-button--h32" data-ref="btn-copy-card-${acc.id}" data-copy-val="${escapeHtml(acc.card_number)}">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#credit_card"></use></svg>
                  <span>${t('orders.copy_card')}</span>
                </button>
              </div>` : ''}
            </div>
          `
            )
            .join('')}
        </div>

        <!-- Monto exacto y Concepto obligatorio -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div style="padding: 12px 14px; border-radius: 12px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); display: block;">${t('orders.amount_to_pay')}</span>
              <span style="font-size: 20px; font-weight: 800; color: var(--text-primary);">$${order.total_amount.toFixed(2)} ${order.currency}</span>
            </div>
            <button type="button" class="component-button component-button--ghost component-button--h28" data-ref="btn-copy-amount" data-copy-val="${order.total_amount.toFixed(2)}" style="margin-top: 8px; align-self: flex-start;">
              <span>${t('orders.copy_amount')}</span>
            </button>
          </div>

          <div style="padding: 12px 14px; border-radius: 12px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); display: block;">${t('orders.concept_label')}</span>
              <span style="font-size: 15px; font-weight: 800; color: var(--text-primary);">${order.concept_reference}</span>
            </div>
            <button type="button" class="component-button component-button--ghost component-button--h28" data-ref="btn-copy-concept" data-copy-val="${order.concept_reference}" style="margin-top: 8px; align-self: flex-start;">
              <span>Copiar</span>
            </button>
          </div>
        </div>

        <div style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--bg-surface-elevated); border-left: 3px solid #3b82f6;">
          ${t('orders.receipt_instruction')}
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
      cancelText: t('common.close'),
      confirmClass: 'component-button--black',
      confirmText: t('orders.go_to_validate_btn'),
      description: t('orders.payment_info_desc'),
      onClose: () => {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      },
      onConfirm: () => {
        if (timerInterval) clearInterval(timerInterval);
        modal.close();
        navigate('/validate-payment');
        return true;
      },
      size: 'md',
      title: t('orders.payment_info_title'),
    });

    const countdownEl = modalBody.querySelector<HTMLElement>('[data-ref="spei-timer-countdown"]');
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
        modal.setError(t('orders.expired_notice'));
      }
    }, 1000);
  }

  destroy(): void {
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
