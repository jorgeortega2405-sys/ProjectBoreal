import { navigate } from '../app-router.js';
import { openModal } from '../components/modal.component.js';
import { deleteApi, getApi, patchApi, postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, setupDropdown } from '../utils/dom.util.js';

interface AdminGiveawayItem {
  available_tickets: number;
  bank_accounts: Array<{
    account_holder: string;
    account_type: string;
    bank_name: string;
    id: number;
  }>;
  can_pause: boolean;
  countdown_hours: number;
  created_at: string;
  currency: string;
  daily_pause_next_scheduled: boolean;
  description: string | null;
  draw_date: string | null;
  end_date: string;
  id: number;
  image_urls: string[];
  min_threshold_pct: number;
  orders_count: number;
  package_options: number[];
  paid_tickets: number;
  pause_block_reason: string | null;
  primary_image_url: string;
  prize_amount: number | null;
  progress_pct: number;
  reserved_tickets: number;
  revenue_collected: number;
  slug: string;
  start_date: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  threshold_reached_at: string | null;
  ticket_price: number;
  title: string;
  total_tickets: number;
  type: 'standard' | 'daily';
  updated_at: string;
  uuid: string;
  winner_announced_at: string | null;
  winner_name: string | null;
  winner_order_id: number | null;
  winner_ticket_number: number | null;
}

interface BankAccountItem {
  account_holder: string;
  account_number: string | null;
  account_type: 'clabe' | 'card' | 'both';
  bank_name: string;
  card_number: string | null;
  clabe: string | null;
  currency: string;
  id: number;
  is_active: number;
  uuid: string;
}

function formatCurrency(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(amount) + ` ${currency}`;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-MX').format(num);
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Por definir';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Por definir';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class GiveawaysController implements ViewController {
  private abortController: AbortController | null = null;
  private availableBankAccounts: BankAccountItem[] = [];
  private btnActionCancel: HTMLButtonElement | null = null;
  private btnActionDelete: HTMLButtonElement | null = null;
  private btnActionDeselect: HTMLButtonElement | null = null;
  private btnActionDrawNow: HTMLButtonElement | null = null;
  private btnActionDuplicate: HTMLButtonElement | null = null;
  private btnActionEdit: HTMLButtonElement | null = null;
  private btnActionTogglePause: HTMLButtonElement | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private currentGiveaways: AdminGiveawayItem[] = [];
  private defaultActions: HTMLElement | null = null;
  private filterDropdownController: DropdownController | null = null;
  private inputSearch: HTMLInputElement | null = null;
  private isDailyPausedNext = false;
  private isSearchActive = false;
  private searchToolbar: HTMLElement | null = null;
  private searchQuery = '';
  private selectedActions: HTMLElement | null = null;
  private selectedGiveaway: AdminGiveawayItem | null = null;
  private statusFilter = 'all';
  private typeFilter = 'all';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();
    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-giveaways"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="giveaways-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="giveaways-selected-actions"]');
    this.btnActionDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    this.btnActionEdit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-edit"]');
    this.btnActionTogglePause = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-toggle-pause"]');
    this.btnActionDuplicate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-duplicate"]');
    this.btnActionDrawNow = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-draw-now"]');
    this.btnActionCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-cancel"]');
    this.btnActionDelete = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-delete"]');

    const filterDropdownWrapper = this.container.querySelector<HTMLElement>('[data-ref="filter-dropdown-wrapper"]');
    if (filterDropdownWrapper) {
      this.filterDropdownController = setupDropdown(filterDropdownWrapper, {
        isSelect: false,
        matchWidth: false,
        placement: 'bottom-end',
      });
    }

    this.bindEvents();
    renderIcons(this.container);
    requestAnimationFrame(() => {
      void this.loadData();
    });
  }

  bindEvents(): void {
    const signal = this.abortController?.signal;

    const btnRefresh = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-giveaways"]');
    btnRefresh?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        const icon = btnRefresh.querySelector('[data-ref="icon-refresh"]');
        icon?.classList.add('admin-refresh-spin');
        void this.loadData().finally(() => {
          setTimeout(() => {
            icon?.classList.remove('admin-refresh-spin');
          }, 600);
        });
      },
      { signal }
    );

    const btnCreate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-create-giveaway"]');
    btnCreate?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/giveaways/create');
      },
      { signal }
    );

    const btnDailyToggle = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-daily-cycle-toggle"]');
    btnDailyToggle?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.openDailyConfigModal();
      },
      { signal }
    );

    const btnBannerToggle = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-banner-toggle-daily"]');
    btnBannerToggle?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        void this.toggleDailyPause(false);
      },
      { signal }
    );

    this.btnToggleSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.toggleSearchToolbar();
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (this.isSearchActive) {
            this.toggleSearchToolbar(false);
          } else if (this.selectedGiveaway) {
            this.selectedGiveaway = null;
            this.updateSelectionUi();
          }
        }
      },
      { signal }
    );

    this.btnActionDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedGiveaway = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnActionEdit?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedGiveaway) {
          navigate(`/giveaways/${encodeURIComponent(this.selectedGiveaway.uuid)}/edit`);
        }
      },
      { signal }
    );

    this.btnActionTogglePause?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (!this.selectedGiveaway) return;
        const g = this.selectedGiveaway;
        if (g.status === 'active') {
          if (g.can_pause) {
            this.handleStatusChange(g.uuid, 'paused');
          } else {
            this.openDailyConfigModal();
          }
        } else if (g.status === 'paused' || g.status === 'draft') {
          this.handleStatusChange(g.uuid, 'active');
        }
      },
      { signal }
    );

    this.btnActionDuplicate?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedGiveaway) {
          this.handleDuplicate(this.selectedGiveaway);
        }
      },
      { signal }
    );

    this.btnActionDrawNow?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedGiveaway) {
          this.handleManualDraw(this.selectedGiveaway);
        }
      },
      { signal }
    );

    this.btnActionCancel?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedGiveaway) {
          this.handleCancel(this.selectedGiveaway);
        }
      },
      { signal }
    );

    this.btnActionDelete?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedGiveaway) {
          this.handleDelete(this.selectedGiveaway);
        }
      },
      { signal }
    );

    this.inputSearch?.addEventListener(
      'input',
      () => {
        const val = (this.inputSearch?.value || '').trim();
        if (this.btnClearSearch) {
          this.btnClearSearch.style.display = val.length > 0 ? 'inline-flex' : 'none';
        }
        this.searchQuery = val.toLowerCase();
        this.applyFiltersAndRender();
      },
      { signal }
    );

    this.btnClearSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.inputSearch) {
          this.inputSearch.value = '';
        }
        this.searchQuery = '';
        if (this.btnClearSearch) {
          this.btnClearSearch.style.display = 'none';
        }
        this.applyFiltersAndRender();
        this.inputSearch?.focus();
      },
      { signal }
    );

    const typeBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-type-filter]');
    typeBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const filter = btn.getAttribute('data-type-filter') || 'all';
          if (filter !== this.typeFilter) {
            this.typeFilter = filter;
            typeBtns.forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            this.filterDropdownController?.close();
            this.applyFiltersAndRender();
          } else {
            this.filterDropdownController?.close();
          }
        },
        { signal }
      );
    });

    const statusBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-status-filter]');
    statusBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const filter = btn.getAttribute('data-status-filter') || 'all';
          if (filter !== this.statusFilter) {
            this.statusFilter = filter;
            statusBtns.forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            this.filterDropdownController?.close();
            this.applyFiltersAndRender();
          } else {
            this.filterDropdownController?.close();
          }
        },
        { signal }
      );
    });

    const btnReset = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-filters"]');
    btnReset?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.typeFilter = 'all';
        this.statusFilter = 'all';
        this.searchQuery = '';
        if (this.inputSearch) this.inputSearch.value = '';
        if (this.btnClearSearch) this.btnClearSearch.style.display = 'none';

        typeBtns.forEach((b) => {
          b.classList.toggle('is-active', b.getAttribute('data-type-filter') === 'all');
        });

        statusBtns.forEach((b) => {
          b.classList.toggle('is-active', b.getAttribute('data-status-filter') === 'all');
        });

        if (this.isSearchActive) {
          this.toggleSearchToolbar(false);
        }

        this.selectedGiveaway = null;
        this.applyFiltersAndRender();
        this.updateSelectionUi();
      },
      { signal }
    );
  }

  private toggleSearchToolbar(forceState?: boolean): void {
    this.isSearchActive = forceState !== undefined ? forceState : !this.isSearchActive;
    if (this.searchToolbar) {
      this.searchToolbar.classList.toggle('is-active', this.isSearchActive);
      this.searchToolbar.classList.toggle('is-hidden', !this.isSearchActive);
    }
    if (this.btnToggleSearch) {
      this.btnToggleSearch.classList.toggle('is-active', this.isSearchActive);
    }
    if (this.isSearchActive && this.inputSearch) {
      setTimeout(() => this.inputSearch?.focus(), 50);
    }
  }

  private async loadData(): Promise<void> {
    try {
      const [giveawaysRes, dailyConfigRes, banksRes] = await Promise.all([
        getApi<AdminGiveawayItem[]>('/api/giveaways'),
        getApi<{ isPaused: boolean }>('/api/giveaways/config/daily'),
        getApi<BankAccountItem[]>('/api/giveaways/bank-accounts'),
      ]);

      if (giveawaysRes.success && Array.isArray(giveawaysRes.data)) {
        this.currentGiveaways = giveawaysRes.data;
      } else if (!giveawaysRes.success) {
        showToast(giveawaysRes.error || 'No se pudieron cargar los sorteos.', 'danger');
      }

      if (dailyConfigRes?.success && dailyConfigRes?.data) {
        this.isDailyPausedNext = Boolean(dailyConfigRes.data.isPaused);
      }

      if (banksRes?.success && Array.isArray(banksRes?.data)) {
        this.availableBankAccounts = banksRes.data;
      }

      if (this.selectedGiveaway) {
        const found = this.currentGiveaways.find((g) => g.uuid === this.selectedGiveaway?.uuid);
        this.selectedGiveaway = found || null;
      }

      this.updateKpis();
      this.updateDailyBanner();
      this.applyFiltersAndRender();
      this.updateSelectionUi();
    } catch (_) {
      showToast('Error de conexión al cargar la información de sorteos.', 'danger');
    }
  }

  private updateKpis(): void {
    const totalEl = this.container.querySelector('[data-ref="kpi-total-value"]');
    const activeEl = this.container.querySelector('[data-ref="kpi-active-value"]');
    const dailyPotEl = this.container.querySelector('[data-ref="kpi-daily-pot-value"]');
    const revenueEl = this.container.querySelector('[data-ref="kpi-revenue-value"]');

    const total = this.currentGiveaways.length;
    const active = this.currentGiveaways.filter((g) => g.status === 'active').length;

    const dailyActive = this.currentGiveaways.find((g) => g.type === 'daily' && g.status === 'active');
    const dailyPot = dailyActive ? Math.round(dailyActive.paid_tickets * (dailyActive.ticket_price * 0.50)) : 0;

    const totalRevenue = this.currentGiveaways
      .filter((g) => g.status === 'active' || g.status === 'completed')
      .reduce((acc, curr) => acc + (curr.revenue_collected || 0), 0);

    if (totalEl) totalEl.textContent = formatNumber(total);
    if (activeEl) activeEl.textContent = formatNumber(active);
    if (dailyPotEl) dailyPotEl.textContent = formatCurrency(dailyPot);
    if (revenueEl) revenueEl.textContent = formatCurrency(totalRevenue);
  }

  private updateDailyBanner(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-daily-cycle"]');
    if (!banner) return;

    if (this.isDailyPausedNext) {
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  private applyFiltersAndRender(): void {
    let filtered = [...this.currentGiveaways];

    if (this.typeFilter !== 'all') {
      filtered = filtered.filter((g) => g.type === this.typeFilter);
    }

    if (this.statusFilter !== 'all') {
      filtered = filtered.filter((g) => g.status === this.statusFilter);
    }

    if (this.searchQuery) {
      filtered = filtered.filter((g) =>
        g.title.toLowerCase().includes(this.searchQuery) ||
        g.slug.toLowerCase().includes(this.searchQuery) ||
        g.uuid.toLowerCase().includes(this.searchQuery)
      );
    }

    const grid = this.container.querySelector<HTMLElement>('[data-ref="giveaways-grid"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="giveaways-empty-state"]');

    if (!grid) return;

    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    this.renderCards(grid, filtered);
    this.updateSelectionUi();
  }

  private renderCards(grid: HTMLElement, items: AdminGiveawayItem[]): void {
    grid.innerHTML = items.map((g) => this.buildCardHtml(g)).join('');
    renderIcons(grid);
    this.attachCardEventListeners(grid);
  }

  private buildCardHtml(g: AdminGiveawayItem): string {
    const isDaily = g.type === 'daily';
    const isCompleted = g.status === 'completed';
    const isPaused = g.status === 'paused';
    const isDraft = g.status === 'draft';
    const isCancelled = g.status === 'cancelled';

    const typeBadgeText = isDaily ? 'Diario 50/50' : 'Estándar';
    let statusBadgeText = 'Activo';
    let statusBadgeBg = 'rgba(16, 185, 129, 0.85)';
    let statusBadgeColor = '#ffffff';

    if (isPaused) {
      statusBadgeText = 'Pausado';
      statusBadgeBg = 'rgba(245, 158, 11, 0.85)';
      statusBadgeColor = '#000000';
    } else if (isDraft) {
      statusBadgeText = 'Borrador';
      statusBadgeBg = 'rgba(107, 114, 128, 0.85)';
      statusBadgeColor = '#ffffff';
    } else if (isCompleted) {
      statusBadgeText = 'Concluido';
      statusBadgeBg = 'rgba(59, 130, 246, 0.85)';
      statusBadgeColor = '#ffffff';
    } else if (isCancelled) {
      statusBadgeText = 'Cancelado';
      statusBadgeBg = 'rgba(239, 68, 68, 0.85)';
      statusBadgeColor = '#ffffff';
    } else if (isDaily && this.isDailyPausedNext) {
      statusBadgeText = 'Pausa siguiente ciclo';
      statusBadgeBg = 'rgba(245, 158, 11, 0.85)';
      statusBadgeColor = '#000000';
    }

    const priceText = formatCurrency(g.ticket_price, g.currency || 'MXN');
    const isSelected = this.selectedGiveaway?.uuid === g.uuid;

    return `
      <div class="canvas-card ${isSelected ? 'is-selected' : ''}" data-ref="card-giveaway-${escapeHtml(g.uuid)}" data-uuid="${escapeHtml(g.uuid)}">
        <div class="canvas-card__thumbnail">
          <img class="canvas-card__image" data-ref="card-img-${escapeHtml(g.uuid)}" src="${escapeHtml(g.primary_image_url)}" alt="${escapeHtml(g.title)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background: var(--bg-surface); color: var(--text-tertiary);">
            <svg class="component-icon" style="width: 36px; height: 36px;"><use href="/icons.svg#confirmation_number"></use></svg>
          </div>

          <div class="giveaway-card__meta-badge" data-ref="card-meta-${escapeHtml(g.uuid)}">${escapeHtml(typeBadgeText)}</div>
          <span class="canvas-card__btn-sync">${escapeHtml(priceText)}</span>
          <div class="giveaway-card__timer-badge" data-ref="card-timer-${escapeHtml(g.uuid)}" style="background: ${statusBadgeBg}; color: ${statusBadgeColor};">
            ${escapeHtml(statusBadgeText)}
          </div>

          <div class="canvas-card__checkbox" data-ref="card-checkbox-${escapeHtml(g.uuid)}">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check"></use></svg>
          </div>
        </div>

        <div class="canvas-card__info">
          <h3 class="canvas-card__name" title="${escapeHtml(g.title)}">${escapeHtml(g.title)}</h3>
          <div class="canvas-card__meta">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
            <span>${formatNumber(g.paid_tickets)} / ${formatNumber(g.total_tickets)} boletos (${g.progress_pct}%)</span>
          </div>
        </div>
      </div>
    `;
  }

  private attachCardEventListeners(grid: HTMLElement): void {
    const cards = grid.querySelectorAll<HTMLElement>('.canvas-card');
    cards.forEach((card) => {
      const uuid = card.getAttribute('data-uuid');
      if (!uuid) return;
      const giveaway = this.currentGiveaways.find((g) => g.uuid === uuid);
      if (!giveaway) return;

      card.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleGiveawaySelection(giveaway);
      });

      card.addEventListener('dblclick', (e) => {
        e.preventDefault();
        navigate(`/giveaways/${encodeURIComponent(uuid)}/edit`);
      });
    });
  }

  private toggleGiveawaySelection(giveaway: AdminGiveawayItem): void {
    if (this.selectedGiveaway?.uuid === giveaway.uuid) {
      this.selectedGiveaway = null;
    } else {
      this.selectedGiveaway = giveaway;
    }
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedGiveaway !== null;

    if (!isSelected) {
      if (this.defaultActions) this.defaultActions.style.display = 'flex';
      if (this.selectedActions) this.selectedActions.style.display = 'none';
    } else {
      if (this.defaultActions) this.defaultActions.style.display = 'none';
      if (this.selectedActions) this.selectedActions.style.display = 'flex';

      const g = this.selectedGiveaway!;
      const isActive = g.status === 'active';
      const isPaused = g.status === 'paused';
      const isDraft = g.status === 'draft';
      const isCompleted = g.status === 'completed';
      const isCancelled = g.status === 'cancelled';

      if (this.btnActionTogglePause) {
        const iconEl = this.btnActionTogglePause.querySelector('[data-ref="icon-action-pause"]');
        if (isActive) {
          this.btnActionTogglePause.style.display = 'inline-flex';
          if (g.can_pause) {
            this.btnActionTogglePause.setAttribute('data-tooltip', 'Pausar venta');
            this.btnActionTogglePause.setAttribute('aria-label', 'Pausar venta');
            if (iconEl) iconEl.innerHTML = '<use href="/icons.svg#pause"></use>';
          } else {
            this.btnActionTogglePause.setAttribute('data-tooltip', 'Pausar siguiente ciclo');
            this.btnActionTogglePause.setAttribute('aria-label', 'Pausar siguiente ciclo');
            if (iconEl) iconEl.innerHTML = '<use href="/icons.svg#schedule"></use>';
          }
        } else if (isPaused) {
          this.btnActionTogglePause.style.display = 'inline-flex';
          this.btnActionTogglePause.setAttribute('data-tooltip', 'Reanudar venta');
          this.btnActionTogglePause.setAttribute('aria-label', 'Reanudar venta');
          if (iconEl) iconEl.innerHTML = '<use href="/icons.svg#play_arrow"></use>';
        } else if (isDraft) {
          this.btnActionTogglePause.style.display = 'inline-flex';
          this.btnActionTogglePause.setAttribute('data-tooltip', 'Publicar sorteo');
          this.btnActionTogglePause.setAttribute('aria-label', 'Publicar sorteo');
          if (iconEl) iconEl.innerHTML = '<use href="/icons.svg#play_arrow"></use>';
        } else {
          this.btnActionTogglePause.style.display = 'none';
        }
      }

      if (this.btnActionEdit) {
        const iconEl = this.btnActionEdit.querySelector('[data-ref="icon-action-edit"]');
        if (isCompleted) {
          this.btnActionEdit.setAttribute('data-tooltip', 'Ver detalles');
          this.btnActionEdit.setAttribute('aria-label', 'Ver detalles');
          if (iconEl) iconEl.innerHTML = '<use href="/icons.svg#visibility"></use>';
        } else {
          this.btnActionEdit.setAttribute('data-tooltip', 'Editar sorteo');
          this.btnActionEdit.setAttribute('aria-label', 'Editar sorteo');
          if (iconEl) iconEl.innerHTML = '<use href="/icons.svg#edit"></use>';
        }
      }

      if (this.btnActionDrawNow) {
        this.btnActionDrawNow.style.display = isActive && !isCompleted ? 'inline-flex' : 'none';
      }

      if (this.btnActionCancel) {
        this.btnActionCancel.style.display = isActive || isPaused ? 'inline-flex' : 'none';
      }

      if (this.btnActionDelete) {
        this.btnActionDelete.style.display = isDraft || (isCancelled && g.orders_count === 0) ? 'inline-flex' : 'none';
      }
    }

    const grid = this.container.querySelector<HTMLElement>('[data-ref="giveaways-grid"]');
    if (grid) {
      this.currentGiveaways.forEach((g) => {
        const card = grid.querySelector<HTMLElement>(`[data-ref="card-giveaway-${g.uuid}"]`);
        const isCardSelected = this.selectedGiveaway?.uuid === g.uuid;
        if (card) {
          card.classList.toggle('is-selected', isCardSelected);
        }
      });
    }
  }

  private openDailyConfigModal(): void {
    const isPaused = this.isDailyPausedNext;

    const bodyHtml = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="padding: 14px 16px; border-radius: 12px; border: 1px solid ${isPaused ? '#f59e0b' : '#10b981'}; background: ${isPaused ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)'};">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${isPaused ? '#f59e0b' : '#10b981'};"></span>
            <strong style="color: var(--text-primary); font-size: 14px;">
              ${isPaused ? 'Pausa del Siguiente Sorteo Activa' : 'Renovación Automática Activa'}
            </strong>
          </div>
          <p style="margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.45;">
            ${isPaused
              ? 'Cuando concluya el sorteo diario de hoy y se extraiga al ganador, el sistema NO creará un nuevo sorteo diario de forma automática hasta que se vuelva a activar.'
              : 'El sistema aprovisiona diariamente un nuevo ciclo 50/50 de lunes a viernes al momento de concluir el sorteo en curso.'}
          </p>
        </div>

        <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">
          ${isPaused
            ? '¿Deseas reactivar la continuidad automática para que mañana sí haya sorteo diario programado?'
            : 'Si activas la suspensión, el sorteo diario de hoy continuará con normalidad para sus compradores actuales, pero mañana el sorteo no se abrirá.'}
        </p>
      </div>
    `;

    openModal({
      bodyHtml,
      confirmClass: isPaused ? 'component-button--black' : 'component-button--danger',
      confirmText: isPaused ? 'Reactivar Continuidad Diaria' : 'Suspender Siguiente Sorteo',
      description: 'Gestión del ciclo continuo de sorteos diarios 50/50.',
      onConfirm: async () => {
        await this.toggleDailyPause(!isPaused);
        return true;
      },
      size: 'sm',
      title: 'Configuración del Sorteo Diario',
    });
  }

  private async toggleDailyPause(pause: boolean): Promise<void> {
    const res = await postApi<{ isPaused: boolean }>('/api/giveaways/config/daily/schedule-pause', { pause });
    if (!res.success) {
      showToast(res.error || 'No se pudo actualizar la configuración.', 'danger');
      return;
    }
    this.isDailyPausedNext = pause;
    showToast(res.message || 'Configuración actualizada.', 'success');
    this.updateDailyBanner();
    this.applyFiltersAndRender();
  }

  private async handleStatusChange(uuid: string, status: 'active' | 'paused'): Promise<void> {
    const res = await patchApi<AdminGiveawayItem>(`/api/giveaways/${uuid}/status`, { status });
    if (!res.success) {
      showToast(res.error || 'Error al cambiar estado del sorteo.', 'danger');
      return;
    }
    showToast(`Sorteo ${status === 'active' ? 'activado' : 'pausado'} exitosamente.`, 'success');
    void this.loadData();
  }

  private handleManualDraw(g: AdminGiveawayItem): void {
    openModal({
      bodyHtml: `
        <div style="font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
          ¿Estás seguro de ejecutar el sorteo de <strong>${escapeHtml(g.title)}</strong> en este momento?<br/><br/>
          Se seleccionará aleatoriamente un boleto pagado entre los <strong>${g.paid_tickets} boletos vendidos</strong>, se anunciará al ganador y el sorteo cambiará inmediatamente a estado <strong>Concluido</strong>.
        </div>
      `,
      confirmClass: 'component-button--black',
      confirmText: 'Realizar Sorteo Ahora',
      description: 'Esta acción es irreversible y otorgará el premio al participante ganador.',
      onConfirm: async () => {
        const res = await postApi<AdminGiveawayItem>(`/api/giveaways/${g.uuid}/draw`);
        if (!res.success) {
          showToast(res.error || 'Error al ejecutar el sorteo.', 'danger');
          return false;
        }
        showToast(res.message || 'Sorteo ejecutado con éxito.', 'success');
        void this.loadData();
        return true;
      },
      size: 'sm',
      title: 'Confirmar Sorteo Manual',
    });
  }

  private handleDuplicate(g: AdminGiveawayItem): void {
    const duplicateData = {
      countdown_hours: g.countdown_hours,
      description: g.description,
      min_threshold_pct: g.min_threshold_pct,
      package_options: g.package_options,
      primary_image_url: g.primary_image_url,
      slug: g.slug,
      ticket_price: g.ticket_price,
      title: `${g.title} (Copia)`,
      total_tickets: g.total_tickets,
      type: g.type,
    };
    try {
      sessionStorage.setItem('boreal_duplicate_giveaway', JSON.stringify(duplicateData));
    } catch (_) {}
    navigate('/giveaways/create');
  }

  private handleCancel(g: AdminGiveawayItem): void {
    const hasSales = g.paid_tickets > 0;
    openModal({
      bodyHtml: `
        <div style="font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
          ${hasSales
            ? `<strong>Advertencia crítica:</strong> Este sorteo cuenta con <strong>${g.paid_tickets} boletos vendidos</strong>. Al cancelarlo, se suspenderán las operaciones y deberás realizar la devolución correspondiente a los clientes.`
            : `El sorteo '${escapeHtml(g.title)}' no tiene ventas y pasará a estado Cancelado.`}
        </div>
      `,
      confirmClass: 'component-button--danger',
      confirmText: 'Confirmar Cancelación',
      description: 'El sorteo será retirado de la vista pública.',
      onConfirm: async () => {
        const res = await patchApi<AdminGiveawayItem>(`/api/giveaways/${g.uuid}/status`, {
          forceWithSales: true,
          status: 'cancelled',
        });
        if (!res.success) {
          showToast(res.error || 'Error al cancelar el sorteo.', 'danger');
          return false;
        }
        showToast('Sorteo cancelado.', 'success');
        void this.loadData();
        return true;
      },
      size: 'sm',
      title: 'Cancelar Sorteo',
    });
  }

  private handleDelete(g: AdminGiveawayItem): void {
    openModal({
      bodyHtml: `
        <div style="font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
          ¿Deseas eliminar permanentemente el sorteo <strong>${escapeHtml(g.title)}</strong>? Esta acción no se puede deshacer.
        </div>
      `,
      confirmClass: 'component-button--danger',
      confirmText: 'Eliminar Permanentemente',
      description: 'Eliminación física del registro de sorteo.',
      onConfirm: async () => {
        const res = await deleteApi<void>(`/api/giveaways/${g.uuid}`);
        if (!res.success) {
          showToast(res.error || 'Error al eliminar el sorteo.', 'danger');
          return false;
        }
        showToast('Sorteo eliminado exitosamente.', 'success');
        void this.loadData();
        return true;
      },
      size: 'sm',
      title: 'Eliminar Sorteo',
    });
  }

  destroy(): void {
    this.filterDropdownController?.destroy();
    this.filterDropdownController = null;
    this.selectedGiveaway = null;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createGiveawaysView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/giveaways/giveaways.html');
  const controller = new GiveawaysController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
