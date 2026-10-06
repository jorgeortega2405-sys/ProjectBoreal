import { navigate } from '../app-router.js';
import { fetchActiveGiveaways } from '../services/giveaways.service.js';
import { getCurrentLanguage, t } from '../services/i18n.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { onWebSocketEvent } from '../services/websocket.service.js';
import { Giveaway } from '../types/giveaway.types.js';
import { formatShortDate } from '../utils/date.util.js';
import { escapeHtml, removeEmptyState, renderEmptyState } from '../utils/dom.util.js';
import { formatCurrency, formatNumber } from '../utils/number.util.js';

function sortGiveaways(list: Giveaway[]): Giveaway[] {
  const now = Date.now();
  const parseMs = (d: string | null | undefined): number => {
    if (!d) return 0;
    const clean = d.includes('T') ? d : d.replace(' ', 'T');
    const t = new Date(clean).getTime();
    return isNaN(t) ? 0 : t;
  };

  return [...list].sort((a, b) => {
    const aDaily = a.type === 'daily' && a.status === 'active';
    const bDaily = b.type === 'daily' && b.status === 'active';
    if (aDaily !== bDaily) return aDaily ? -1 : 1;

    const aCompleted = a.status === 'completed';
    const bCompleted = b.status === 'completed';
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

    const aStart = parseMs(a.start_date);
    const bStart = parseMs(b.start_date);
    const aIsUpcoming = aStart > now;
    const bIsUpcoming = bStart > now;

    if (aIsUpcoming !== bIsUpcoming) {
      return aIsUpcoming ? 1 : -1;
    }

    if (!aIsUpcoming && !bIsUpcoming) {
      const aCountdown = Boolean(a.threshold_reached_at);
      const bCountdown = Boolean(b.threshold_reached_at);
      if (aCountdown !== bCountdown) return aCountdown ? -1 : 1;

      const aEnd = parseMs(a.end_date);
      const bEnd = parseMs(b.end_date);
      if (aEnd !== bEnd) return aEnd - bEnd;
    }

    if (aIsUpcoming && bIsUpcoming) {
      if (aStart !== bStart) return aStart - bStart;
    }

    const aEnd = parseMs(a.end_date);
    const bEnd = parseMs(b.end_date);
    return aEnd - bEnd;
  });
}

function computeThresholdBadge(item: Giveaway): string | null {
  if (item.type === 'daily' && item.status === 'active') {
    return '⚡ Sorteo Diario';
  }
  if (item.min_threshold_pct > 0 && !item.threshold_reached_at && item.status !== 'completed') {
    const total = item.total_tickets || 100;
    const sold = total - (item.available_tickets ?? total);
    const currentPct = Math.min(100, Math.round((sold / total) * 100));
    return t('home.threshold_badge', { current: currentPct, target: item.min_threshold_pct });
  }
  return null;
}

function computeTimerInfo(item: Giveaway): { isEnded: boolean; text: string } {
  if (item.status === 'completed') {
    const winnerText = item.winner_name && item.winner_name !== 'Sin participantes'
      ? t('home.winner_announced', { name: item.winner_name, ticket: item.winner_ticket_number ?? 'N/A' })
      : t('home.completed_badge');
    return {
      isEnded: true,
      text: winnerText,
    };
  }

  const now = Date.now();
  if (item.start_date) {
    const startClean = item.start_date.includes('T') ? item.start_date : item.start_date.replace(' ', 'T');
    const startMs = new Date(startClean).getTime();
    if (!isNaN(startMs) && startMs > now) {
      const dateText = formatShortDate(item.start_date, getCurrentLanguage());
      return {
        isEnded: false,
        text: t('home.upcoming_badge', { date: dateText }),
      };
    }
  }

  if (item.min_threshold_pct > 0 && !item.threshold_reached_at) {
    return {
      isEnded: false,
      text: t('home.threshold_timer_pending', { target: item.min_threshold_pct }),
    };
  }

  const endClean = item.end_date.includes('T') ? item.end_date : item.end_date.replace(' ', 'T');
  const endMs = new Date(endClean).getTime();
  const diff = endMs - now;

  if (diff <= 0) {
    return {
      isEnded: true,
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
      text: t('home.time_left_soon', { minutes: padMin, seconds: padSec }),
    };
  }

  if (days > 0) {
    return {
      isEnded: false,
      text: t('home.time_left_days', { days, hours, minutes, seconds }),
    };
  }

  return {
    isEnded: false,
    text: t('home.time_left_hours', { hours, minutes, seconds }),
  };
}

export class HomeController {
  private abortController: AbortController | null = null;
  private cardHoverImages: string[] = [];
  private cardHoverIndex = 0;
  private cardHoverInterval: ReturnType<typeof setInterval> | null = null;
  private cardHoverTargetImg: HTMLImageElement | null = null;
  private cardImagesMap: Map<string, string[]> = new Map();
  private container: HTMLElement;
  private filteredGiveaways: Giveaway[] = [];
  private giveaways: Giveaway[] = [];
  private isCheckingEndingGiveaways = false;
  private searchQuery = '';
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

  private filterGiveaways(): void {
    const query = this.searchQuery.trim().toLowerCase();
    const filtered = this.giveaways.filter((g) => {
      return !query ||
        g.title.toLowerCase().includes(query) ||
        Boolean(g.description && g.description.toLowerCase().includes(query));
    });
    this.filteredGiveaways = sortGiveaways(filtered);
    this.renderGiveaways(this.filteredGiveaways);
  }

  private async loadData(): Promise<void> {
    this.giveaways = await fetchActiveGiveaways();
    this.populateCardImagesMap();
    this.filterGiveaways();
  }

  private populateCardImagesMap(): void {
    this.cardImagesMap.clear();
    for (const item of this.giveaways) {
      const list: string[] = [];
      if (item.primary_image_url) {
        list.push(item.primary_image_url);
      }
      if (Array.isArray(item.image_urls)) {
        for (const url of item.image_urls) {
          if (url && !list.includes(url)) {
            list.push(url);
          }
        }
      }
      this.cardImagesMap.set(item.uuid, list);
    }
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
          this.filterGiveaways();
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
          this.filterGiveaways();
          showToast(t('giveaway.toast_threshold_reached'), 'success');
        }
      })
    );

    this.unsubscribeWs.push(
      onWebSocketEvent('TICKETS_PAID', (data) => {
        const match = this.giveaways.find((g) => g.id === data.giveaway_id || g.uuid === data.giveaway_uuid);
        if (match && typeof data.ticket_count === 'number') {
          match.available_tickets = Math.max(0, match.available_tickets - data.ticket_count);
          this.filterGiveaways();
        }
      })
    );
  }

  private updateTimers(): void {
    let hasEndingGiveaways = false;
    const now = Date.now();
    for (const item of this.filteredGiveaways) {
      const badge = this.container.querySelector<HTMLElement>(`[data-ref="card-timer-${item.uuid}"]`);
      if (!badge) continue;
      const info = computeTimerInfo(item);
      badge.textContent = info.text;

      const isUpcoming = Boolean(
        item.start_date &&
        new Date(item.start_date.includes('T') ? item.start_date : item.start_date.replace(' ', 'T')).getTime() > now
      );
      const isThresholdPending = item.min_threshold_pct > 0 && !item.threshold_reached_at;

      if (!isUpcoming && !isThresholdPending && item.status === 'active' && new Date(item.end_date).getTime() <= now) {
        hasEndingGiveaways = true;
      }
    }
    if (hasEndingGiveaways) {
      this.checkEndingGiveaways();
    }
  }

  private async checkEndingGiveaways(): Promise<void> {
    if (this.isCheckingEndingGiveaways) return;
    this.isCheckingEndingGiveaways = true;
    try {
      const fresh = await fetchActiveGiveaways();
      const hasStatusChange = fresh.some((f) => {
        const local = this.giveaways.find((g) => g.uuid === f.uuid);
        return local && local.status !== f.status;
      });
      if (hasStatusChange) {
        this.giveaways = fresh;
        this.populateCardImagesMap();
        this.filterGiveaways();
      }
    } catch (_) {
    } finally {
      this.isCheckingEndingGiveaways = false;
    }
  }

  private renderGiveaways(list: Giveaway[]): void {
    this.stopCardHover();
    const grid = this.container.querySelector<HTMLElement>('[data-ref="giveaways-grid"]');
    if (!grid) return;

    if (list.length === 0) {
      grid.innerHTML = '';
      const isFiltered = Boolean(this.searchQuery.trim());
      if (isFiltered) {
        renderEmptyState({
          container: grid,
          dataRef: 'empty-giveaways-search',
          desc: t('home.search_no_results_desc') || 'No se encontraron sorteos que coincidan con tu búsqueda.',
          graphicType: 'search',
          title: t('home.search_no_results') || 'Sin resultados',
        });
      } else {
        renderEmptyState({
          container: grid,
          dataRef: 'empty-giveaways',
          desc: t('home.empty_giveaways_desc') || t('home.empty_giveaways') || 'Actualmente no hay sorteos activos. ¡Vuelve pronto para nuevas oportunidades!',
          graphicType: 'giveaway',
          title: t('home.empty_giveaways_title') || 'No hay sorteos disponibles',
        });
      }
      return;
    }

    removeEmptyState(grid);

    grid.innerHTML = list
      .map((item) => {
        const ticketsLeft = item.status === 'completed'
          ? t('home.completed_badge')
          : t('home.tickets_left', { count: formatNumber(item.available_tickets) });
        const timerInfo = computeTimerInfo(item);
        const thresholdText = computeThresholdBadge(item);
        const currency = item.currency || 'MXN';
        const isSalesClosed = item.status === 'completed' || (new Date(item.end_date).getTime() - Date.now() <= 3600 * 1000 && (item.min_threshold_pct === 0 || !!item.threshold_reached_at));
        const actionLabel = item.status === 'completed'
          ? t('home.view_winner_btn')
          : isSalesClosed
            ? t('giveaway.sales_closed_btn')
            : formatCurrency(item.ticket_price, currency);

        const thresholdBadgeHtml = thresholdText
          ? `<div class="giveaway-card__meta-badge" data-ref="card-meta-${item.uuid}">${escapeHtml(thresholdText)}</div>`
          : '';

        return `
          <div class="canvas-card" data-ref="card-giveaway-${item.uuid}" data-uuid="${item.uuid}">
            <div class="canvas-card__thumbnail">
              <img class="canvas-card__image" data-ref="card-img-${item.uuid}" src="${escapeHtml(item.primary_image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />
              ${thresholdBadgeHtml}
              <span class="canvas-card__btn-sync">${escapeHtml(actionLabel)}</span>
              <div class="giveaway-card__timer-badge" data-ref="card-timer-${item.uuid}">
                ${escapeHtml(timerInfo.text)}
              </div>
            </div>
            <div class="canvas-card__info">
              <h3 class="canvas-card__name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
              <div class="canvas-card__meta">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
                <span>${escapeHtml(ticketsLeft)}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    this.bindCardHoverEvents();
  }

  private bindCardHoverEvents(): void {
    const cards = this.container.querySelectorAll<HTMLElement>('.canvas-card');
    cards.forEach((card) => {
      const uuid = card.getAttribute('data-uuid');
      if (!uuid) return;
      const images = this.cardImagesMap.get(uuid) || [];
      if (images.length <= 1) return;

      const img = card.querySelector<HTMLImageElement>('[data-ref^="card-img-"]');
      if (!img) return;

      card.addEventListener(
        'mouseenter',
        () => {
          this.startCardHover(img, images);
        },
        { signal: this.abortController?.signal }
      );

      card.addEventListener(
        'mouseleave',
        () => {
          this.stopCardHover(img, images);
        },
        { signal: this.abortController?.signal }
      );
    });
  }

  private startCardHover(img: HTMLImageElement, images: string[]): void {
    this.stopCardHover();
    for (let i = 1; i < images.length; i++) {
      const preload = new Image();
      preload.src = images[i];
    }
    this.cardHoverImages = images;
    this.cardHoverIndex = 0;
    this.cardHoverTargetImg = img;

    this.cardHoverInterval = setInterval(() => {
      if (!this.cardHoverTargetImg) return;
      this.cardHoverIndex = (this.cardHoverIndex + 1) % this.cardHoverImages.length;
      const nextUrl = this.cardHoverImages[this.cardHoverIndex];
      this.cardHoverTargetImg.style.opacity = '0.4';
      setTimeout(() => {
        if (this.cardHoverTargetImg && this.cardHoverImages.length > 0) {
          this.cardHoverTargetImg.src = nextUrl;
          this.cardHoverTargetImg.style.opacity = '1';
        }
      }, 100);
    }, 1000);
  }

  private stopCardHover(img?: HTMLImageElement, images?: string[]): void {
    if (this.cardHoverInterval) {
      clearInterval(this.cardHoverInterval);
      this.cardHoverInterval = null;
    }
    const targetImg = img || this.cardHoverTargetImg;
    const targetImages = images || this.cardHoverImages;
    if (targetImg && targetImages[0] && targetImg.src !== targetImages[0]) {
      targetImg.src = targetImages[0];
      targetImg.style.opacity = '1';
    }
    this.cardHoverImages = [];
    this.cardHoverIndex = 0;
    this.cardHoverTargetImg = null;
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
          this.searchQuery = searchInput.value;
          if (clearBtn) {
            clearBtn.style.display = this.searchQuery.trim().length > 0 ? 'inline-flex' : 'none';
          }
          this.filterGiveaways();
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
        this.searchQuery = '';
        clearBtn.style.display = 'none';
        this.filterGiveaways();
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
        this.filterGiveaways();
      },
      { signal }
    );
  }

  destroy(): void {
    this.stopCardHover();
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
