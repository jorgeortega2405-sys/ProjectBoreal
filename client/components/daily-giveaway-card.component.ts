import { navigate } from '../app-router.js';
import { fetchDailyGiveaway } from '../services/giveaways.service.js';
import { getCurrentLanguage, t } from '../services/i18n.service.js';
import { onWebSocketEvent } from '../services/websocket.service.js';
import { DailyGiveawayWinnerItem, Giveaway } from '../types/giveaway.types.js';
import { formatWinnerDate } from '../utils/date.util.js';
import { escapeHtml } from '../utils/dom.util.js';
import { formatNumber } from '../utils/number.util.js';

export class DailyGiveawayCardComponent {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private giveaway: Giveaway | null = null;
  private isRefreshing = false;
  private recentWinners: DailyGiveawayWinnerItem[] = [];
  private unsubscribeWs: (() => void)[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    await this.loadData();
    this.subscribeWebSocketEvents();
    this.startCountdownLoop();
  }

  destroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    for (const unsub of this.unsubscribeWs) {
      unsub();
    }
    this.unsubscribeWs = [];
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.container.innerHTML = '';
  }

  private async loadData(): Promise<void> {
    const payload = await fetchDailyGiveaway();
    if (payload?.giveaway) {
      this.giveaway = payload.giveaway;
      this.recentWinners = Array.isArray(payload.recentWinners) ? payload.recentWinners : [];
      this.render();
      this.bindEvents();
    } else {
      this.container.innerHTML = '';
    }
  }

  private startCountdownLoop(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    this.countdownInterval = setInterval(() => {
      this.updateCountdownDisplay();
    }, 1000);
  }

  private updateCountdownDisplay(): void {
    if (!this.giveaway) return;
    const endMs = new Date(this.giveaway.end_date.includes('T') ? this.giveaway.end_date : this.giveaway.end_date.replace(' ', 'T')).getTime();
    const diff = endMs - Date.now();

    const hoursEl = this.container.querySelector<HTMLElement>('[data-ref="daily-digit-hours"]');
    const minutesEl = this.container.querySelector<HTMLElement>('[data-ref="daily-digit-minutes"]');
    const secondsEl = this.container.querySelector<HTMLElement>('[data-ref="daily-digit-seconds"]');
    const labelEl = this.container.querySelector<HTMLElement>('[data-ref="daily-timer-note"]');

    if (diff <= 0) {
      if (hoursEl) hoursEl.textContent = '00';
      if (minutesEl) minutesEl.textContent = '00';
      if (secondsEl) secondsEl.textContent = '00';
      if (labelEl) labelEl.textContent = t('daily.drawing_in_progress');

      if (!this.isRefreshing) {
        this.isRefreshing = true;
        setTimeout(() => {
          void this.loadData().finally(() => {
            this.isRefreshing = false;
          });
        }, 3000);
      }
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const totalHours = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (hoursEl) hoursEl.textContent = String(totalHours).padStart(2, '0');
    if (minutesEl) minutesEl.textContent = String(m).padStart(2, '0');
    if (secondsEl) secondsEl.textContent = String(s).padStart(2, '0');

    const isSalesClosed = diff <= 3600 * 1000;
    const playBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-play-daily"]');
    if (playBtn) {
      if (isSalesClosed) {
        playBtn.disabled = true;
        playBtn.classList.add('is-disabled');
        const textSpan = playBtn.querySelector('span');
        if (textSpan) textSpan.textContent = t('giveaway.sales_closed_btn') || 'Venta Cerrada';
      } else {
        playBtn.disabled = false;
        playBtn.classList.remove('is-disabled');
        const textSpan = playBtn.querySelector('span');
        if (textSpan) textSpan.textContent = t('daily.buy_btn');
      }
    }
  }

  private subscribeWebSocketEvents(): void {
    this.unsubscribeWs.push(
      onWebSocketEvent('DAILY_GIVEAWAY_CYCLE_UPDATED', () => {
        void this.loadData();
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('GIVEAWAY_WINNER_DRAWN', (data) => {
        if (this.giveaway && data.giveaway_uuid === this.giveaway.uuid) {
          void this.loadData();
        }
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('TICKETS_PAID', (data) => {
        if (!this.giveaway) return;
        if (data.giveaway_id === this.giveaway.id || data.giveaway_uuid === this.giveaway.uuid) {
          if (typeof data.ticket_count === 'number') {
            this.giveaway.available_tickets = Math.max(0, this.giveaway.available_tickets - data.ticket_count);
            const potGain = Math.round(data.ticket_count * (Number(this.giveaway.ticket_price || 2) * 0.50));
            this.giveaway.current_pot = (this.giveaway.current_pot || 0) + potGain;
            this.updateProgressDisplay();
            this.updatePotDisplay();
          }
        }
      })
    );
  }

  private updatePotDisplay(): void {
    if (!this.giveaway) return;
    const potEl = this.container.querySelector<HTMLElement>('[data-ref="daily-pot-amount"]');
    if (potEl) {
      potEl.textContent = `$${formatNumber(this.giveaway.current_pot || 0)} MXN`;
      potEl.classList.remove('daily-hero-pot-pulse');
      void potEl.offsetWidth;
      potEl.classList.add('daily-hero-pot-pulse');
    }
  }

  private updateProgressDisplay(): void {
    if (!this.giveaway) return;
    const total = this.giveaway.total_tickets || 20000;
    const available = this.giveaway.available_tickets ?? total;
    const sold = total - available;
    const pct = Math.min(100, Math.round((sold / total) * 100));

    const barEl = this.container.querySelector<HTMLElement>('[data-ref="daily-progress-bar"]');
    const textEl = this.container.querySelector<HTMLElement>('[data-ref="daily-progress-text"]');

    if (barEl) {
      barEl.style.width = `${pct}%`;
    }
    if (textEl) {
      textEl.textContent = t('daily.tickets_progress', {
        available: formatNumber(available),
        total: formatNumber(total),
      });
    }
  }

  private render(): void {
    if (!this.giveaway) {
      this.container.innerHTML = '';
      return;
    }

    const g = this.giveaway;
    const total = g.total_tickets || 20000;
    const available = g.available_tickets ?? total;
    const sold = total - available;
    const pct = Math.min(100, Math.round((sold / total) * 100));
    const lang = getCurrentLanguage();

    const endDate = new Date(g.end_date.includes('T') ? g.end_date : g.end_date.replace(' ', 'T'));
    const isFridayDraw = endDate.getDay() === 1;
    const closingNote = isFridayDraw ? t('daily.closing_monday') : t('daily.closing_today');

    const winnersHtml = this.renderWinnersHtml(lang);

    this.container.innerHTML = `
      <div class="daily-hero-card" data-ref="daily-card-root">
        <div class="daily-hero-card__glow"></div>
        <div class="daily-hero-body">
          <div class="daily-hero-info">
            <div class="daily-hero-badge-row">
              <span class="daily-hero-pill" data-ref="daily-pill-status">
                <span class="daily-hero-pill__pulse"></span>
                <span>${escapeHtml(t('daily.badge_title'))}</span>
              </span>
              <span class="daily-hero-pill daily-hero-pill--secondary">
                <span>${escapeHtml(t('daily.badge_frequency'))}</span>
              </span>
              <span class="daily-hero-pill daily-hero-pill--live">
                <span>⚡ ${escapeHtml(t('daily.live_pot_badge'))}</span>
              </span>
            </div>

            <div class="daily-hero-pot-header">
              <span class="daily-hero-pot-label">${escapeHtml(t('daily.pot_label'))}</span>
            </div>

            <h2 class="daily-hero-title">
              <span class="daily-hero-title-accent" data-ref="daily-pot-amount">$${formatNumber(g.current_pot || 0)} MXN</span>
            </h2>

            <p class="daily-hero-desc">
              ${escapeHtml(t('daily.prize_subtitle'))}
            </p>

            <div class="daily-hero-progress">
              <div class="daily-hero-progress__header">
                <span data-ref="daily-progress-text">
                  ${escapeHtml(t('daily.tickets_progress', { available: formatNumber(available), total: formatNumber(total) }))}
                </span>
                <span class="daily-hero-progress__strong">${pct}%</span>
              </div>
              <div class="daily-hero-progress__track">
                <div class="daily-hero-progress__bar" data-ref="daily-progress-bar" style="width: ${pct}%;"></div>
              </div>
            </div>

            <div class="daily-hero-actions">
              <button type="button" class="component-button component-button--black component-button--h50 daily-hero-btn-play" data-ref="btn-play-daily">
                <span>${escapeHtml(t('daily.buy_btn'))}</span>
              </button>
            </div>
          </div>

          <div class="daily-hero-timer-box" data-ref="daily-timer-box">
            <span class="daily-hero-timer-label">${escapeHtml(t('daily.countdown_label'))}</span>
            <div class="daily-hero-timer-units">
              <div class="daily-timer-unit">
                <span class="daily-timer-digit" data-ref="daily-digit-hours">00</span>
                <span class="daily-timer-sub">${escapeHtml(t('daily.hours_label'))}</span>
              </div>
              <span class="daily-timer-sep">:</span>
              <div class="daily-timer-unit">
                <span class="daily-timer-digit" data-ref="daily-digit-minutes">00</span>
                <span class="daily-timer-sub">${escapeHtml(t('daily.minutes_label'))}</span>
              </div>
              <span class="daily-timer-sep">:</span>
              <div class="daily-timer-unit">
                <span class="daily-timer-digit" data-ref="daily-digit-seconds">00</span>
                <span class="daily-timer-sub">${escapeHtml(t('daily.seconds_label'))}</span>
              </div>
            </div>
            <p class="daily-hero-timer-note" data-ref="daily-timer-note">${escapeHtml(closingNote)}</p>
          </div>
        </div>

        <div class="daily-hero-winners-panel">
          <div class="daily-hero-winners__top">
            <h3 class="daily-hero-winners__title">
              <span class="daily-hero-winners__trophy" aria-hidden="true">🏆</span>
              <span>${escapeHtml(t('daily.recent_winners_title'))}</span>
            </h3>
            <a class="daily-hero-winners__link" data-ref="link-view-all-winners" href="/winners">
              <span>${escapeHtml(t('daily.view_all_winners'))}</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>
          ${winnersHtml}
        </div>
      </div>
    `;

    this.updateCountdownDisplay();
  }

  private renderWinnersHtml(lang: string): string {
    if (!this.recentWinners || this.recentWinners.length === 0) {
      return `
        <div class="daily-hero-winners__empty" data-ref="daily-winners-empty">
          <span aria-hidden="true">✨</span>
          <span>${escapeHtml(t('daily.empty_winners'))}</span>
        </div>
      `;
    }

    const itemsHtml = this.recentWinners
      .map((w) => {
        const dateText = formatWinnerDate(w.winner_announced_at || w.draw_date, lang);
        const ticketPad = typeof w.winner_ticket_number === 'number' && w.winner_ticket_number > 9999 ? 5 : 4;
        const ticketNum = typeof w.winner_ticket_number === 'number'
          ? `#${String(w.winner_ticket_number).padStart(ticketPad, '0')}`
          : '#----';
        const winnerName = w.winner_name || 'Participante';
        const stateText = w.customer_state ? `(${escapeHtml(w.customer_state)})` : '';
        const prizeText = `$${formatNumber(w.prize_amount || 10000)} MXN`;

        return `
          <div class="daily-winner-card" data-ref="daily-winner-card-${escapeHtml(w.uuid)}">
            <div class="daily-winner-card__header">
              <span class="daily-winner-card__date">${escapeHtml(dateText)}</span>
              <span class="daily-winner-card__prize">${escapeHtml(prizeText)}</span>
            </div>
            <span class="daily-winner-card__ticket">${escapeHtml(ticketNum)}</span>
            <div class="daily-winner-card__name" title="${escapeHtml(winnerName)}">
              ${escapeHtml(winnerName)}
            </div>
            <div class="daily-winner-card__state">${stateText}</div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="daily-hero-winners__grid" data-ref="daily-winners-grid">
        ${itemsHtml}
      </div>
    `;
  }

  private bindEvents(): void {
    const playBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-play-daily"]');
    if (playBtn && this.giveaway) {
      const uuid = this.giveaway.uuid;
      playBtn.addEventListener('click', () => {
        navigate(`/s/${uuid}`);
      });
    }

    const winnersLink = this.container.querySelector<HTMLAnchorElement>('[data-ref="link-view-all-winners"]');
    if (winnersLink) {
      winnersLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigate('/winners');
      });
    }
  }
}
