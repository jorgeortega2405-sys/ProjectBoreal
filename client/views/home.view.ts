import { navigate } from '../app-router.js';
import { fetchActiveGiveaways } from '../services/giveaways.service.js';
import { t } from '../services/i18n.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { onWebSocketEvent } from '../services/websocket.service.js';
import { Giveaway } from '../types/giveaway.types.js';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function computeTimerInfo(item: Giveaway): { isEnded: boolean; style: string; text: string } {
  if (item.status === 'completed') {
    const winnerText = item.winner_name && item.winner_name !== 'Sin participantes'
      ? t('home.winner_announced', { name: item.winner_name, ticket: item.winner_ticket_number ?? 'N/A' })
      : t('home.completed_badge');
    return {
      isEnded: true,
      style: 'background: rgba(16, 185, 129, 0.88); color: #ffffff;',
      text: `🏆 ${winnerText}`,
    };
  }

  if (item.min_threshold_pct > 0 && !item.threshold_reached_at) {
    const total = item.total_tickets || 100;
    const sold = total - (item.available_tickets ?? total);
    const currentPct = Math.min(100, Math.round((sold / total) * 100));
    return {
      isEnded: false,
      style: 'background: rgba(15, 23, 42, 0.88); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);',
      text: t('home.threshold_badge', { current: currentPct, target: item.min_threshold_pct }),
    };
  }

  const endMs = new Date(item.end_date).getTime();
  const diff = endMs - Date.now();

  if (diff <= 0) {
    return {
      isEnded: true,
      style: 'background: rgba(245, 158, 11, 0.9); color: #ffffff;',
      text: t('home.drawing_now'),
    };
  }

  const secondsTotal = Math.floor(diff / 1000);
  const days = Math.floor(secondsTotal / 86400);
  const hours = Math.floor((secondsTotal % 86400) / 3600);
  const minutes = Math.floor((secondsTotal % 3600) / 60);
  const seconds = secondsTotal % 60;

  if (diff <= 3600 * 1000) {
    const padMin = String(minutes).padStart(2, '0');
    const padSec = String(seconds).padStart(2, '0');
    return {
      isEnded: false,
      style: 'background: rgba(239, 68, 68, 0.92); color: #ffffff;',
      text: t('home.time_left_soon', { minutes: padMin, seconds: padSec }),
    };
  }

  if (days > 0) {
    return {
      isEnded: false,
      style: 'background: rgba(0, 0, 0, 0.75); color: #ffffff;',
      text: t('home.time_left_days', { days, hours, minutes, seconds }),
    };
  }

  return {
    isEnded: false,
    style: 'background: rgba(0, 0, 0, 0.75); color: #ffffff;',
    text: t('home.time_left_hours', { hours, minutes, seconds }),
  };
}

export class HomeController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private filteredGiveaways: Giveaway[] = [];
  private giveaways: Giveaway[] = [];
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribeWs: (() => void)[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents(this.container);
    await this.loadData();
    this.startCountdownLoop();
    this.subscribeWebSocketEvents();
  }

  private async loadData(): Promise<void> {
    this.giveaways = await fetchActiveGiveaways();
    this.filteredGiveaways = [...this.giveaways];
    this.renderGiveaways(this.filteredGiveaways);
  }

  private startCountdownLoop(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.updateTimers();
    }, 1000);
  }

  private subscribeWebSocketEvents(): void {
    this.unsubscribeWs.push(
      onWebSocketEvent('GIVEAWAY_WINNER_DRAWN', (data) => {
        const match = this.giveaways.find((g) => g.uuid === data.giveaway_uuid);
        if (match) {
          match.status = 'completed';
          match.winner_name = data.winner_name;
          match.winner_ticket_number = data.winner_ticket_number;
          match.winner_announced_at = data.winner_announced_at;
          this.renderGiveaways(this.filteredGiveaways);
        }
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('GIVEAWAY_THRESHOLD_REACHED', (data) => {
        const match = this.giveaways.find((g) => g.uuid === data.giveaway_uuid);
        if (match) {
          match.threshold_reached_at = data.threshold_reached_at;
          match.end_date = data.end_date;
          match.countdown_hours = data.countdown_hours;
          this.renderGiveaways(this.filteredGiveaways);
          showToast(t('giveaway.toast_threshold_reached'), 'success');
        }
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('TICKETS_PAID', (data) => {
        const match = this.giveaways.find((g) => g.id === data.giveaway_id || g.uuid === data.giveaway_uuid);
        if (match && typeof data.ticket_count === 'number') {
          match.available_tickets = Math.max(0, match.available_tickets - data.ticket_count);
          this.renderGiveaways(this.filteredGiveaways);
        }
      })
    );
  }

  private updateTimers(): void {
    for (const item of this.filteredGiveaways) {
      const badge = this.container.querySelector<HTMLElement>(`[data-ref="card-timer-${item.uuid}"]`);
      if (!badge) continue;
      const info = computeTimerInfo(item);
      badge.textContent = info.text;
      badge.setAttribute('style', `position: absolute; bottom: 8px; left: 8px; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px; backdrop-filter: blur(4px); z-index: 2; ${info.style}`);
    }
  }

  private renderGiveaways(list: Giveaway[]): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="giveaways-grid"]');
    if (!grid) return;

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" data-ref="empty-giveaways" style="grid-column: 1 / -1; text-align: center; padding: 48px 16px;">
          <p class="empty-state__text" style="color: var(--text-secondary); font-size: 15px;">${t('home.empty_giveaways')}</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = list
      .map((item) => {
        const ticketsLeft = item.status === 'completed'
          ? t('home.completed_badge')
          : t('home.tickets_left', { count: item.available_tickets });
        const timerInfo = computeTimerInfo(item);
        const actionLabel = item.status === 'completed' ? t('home.view_winner_btn') : `$${item.ticket_price.toFixed(2)} ${item.currency}`;

        return `
          <div class="canvas-card" data-ref="card-giveaway-${item.uuid}" data-uuid="${item.uuid}">
            <div class="canvas-card__thumbnail">
              <img class="canvas-card__image" src="${escapeHtml(item.primary_image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />
              <span class="canvas-card__btn-sync">${escapeHtml(actionLabel)}</span>
              <div class="giveaway-card__timer-badge" data-ref="card-timer-${item.uuid}" style="position: absolute; bottom: 8px; left: 8px; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px; backdrop-filter: blur(4px); z-index: 2; ${timerInfo.style}">
                ${escapeHtml(timerInfo.text)}
              </div>
            </div>
            <div class="canvas-card__info">
              <h3 class="canvas-card__name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
              <div class="canvas-card__meta">
                <span class="canvas-card__types-more">${item.available_tickets}/${item.total_tickets}</span>
                <span>• ${escapeHtml(ticketsLeft)}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  private bindEvents(view: HTMLElement): void {
    const signal = this.abortController?.signal;
    const searchInput = view.querySelector<HTMLInputElement>('[data-ref="hero-search-input"]');
    const clearBtn = view.querySelector<HTMLButtonElement>('[data-ref="btn-hero-clear-search"]');
    const grid = view.querySelector<HTMLElement>('[data-ref="giveaways-grid"]');

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

      searchInput.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (query) {
              showToast(t('home.searching', { query }), 'info');
            }
          }
        },
        { signal }
      );
    }

    clearBtn?.addEventListener(
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

    grid?.addEventListener(
      'click',
      (e) => {
        const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.canvas-card');
        if (!card) return;
        const uuid = card.getAttribute('data-uuid');
        if (uuid) {
          navigate(`/s/${uuid}`);
        }
      },
      { signal }
    );

    window.addEventListener(
      'languagechange',
      () => {
        this.renderGiveaways(this.filteredGiveaways);
      },
      { signal }
    );
  }

  destroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
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

export async function createHomeView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/home/home.html');
  const controller = new HomeController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
