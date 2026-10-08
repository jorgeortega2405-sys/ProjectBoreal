import { openModal } from '../components/modal.component.js';
import { getApi, patchApi, postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, escapeHtml, setupDropdown } from '../utils/dom.util.js';

interface AdminOrderSummary {
  bank_reference: string | null;
  concept_reference: string;
  created_at: string;
  currency: string;
  customer_name: string;
  customer_phone: string;
  customer_state: string | null;
  expires_at: string;
  giveaway_id: number;
  giveaway_title: string;
  giveaway_uuid: string;
  id: number;
  is_winner: number;
  receipt_filename: string | null;
  receipt_url: string | null;
  spei_attempts: number;
  spei_last_checked_at: string | null;
  spei_status: 'pending' | 'verifying' | 'matched' | 'failed' | 'expired' | 'manual_review' | null;
  status: 'pending_payment' | 'in_review' | 'completed' | 'expired' | 'cancelled';
  ticket_count: number;
  ticket_numbers: number[];
  total_amount: number;
  tracking_key: string | null;
  updated_at: string;
  uuid: string;
}

interface AdminOrderDetail extends AdminOrderSummary {
  banxico_response: any;
  giveaway_price: number;
  giveaway_status: string;
  giveaway_total_tickets: number;
  raw_receipt_url?: string;
}

interface PaymentKpis {
  cancelledCount: number;
  completedAmount: number;
  completedCount: number;
  expiredCount: number;
  inReviewAmount: number;
  inReviewCount: number;
  manualReviewCount: number;
  pendingPaymentAmount: number;
  pendingPaymentCount: number;
  totalOrdersCount: number;
}

interface GiveawayOption {
  title: string;
  uuid: string;
}

function formatCurrency(amount: number, currency = 'MXN'): string {
  return (
    new Intl.NumberFormat('es-MX', {
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: 'currency',
    }).format(amount) + ` ${currency}`
  );
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

function formatPhone(phone: string): string {
  if (!phone) return '•••• ----';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return phone;
}

export class PaymentsController implements ViewController {
  private abortController: AbortController | null = null;
  private btnActionApprove: HTMLButtonElement | null = null;
  private btnActionCopySpei: HTMLButtonElement | null = null;
  private btnActionDeselect: HTMLButtonElement | null = null;
  private btnActionInspect: HTMLButtonElement | null = null;
  private btnActionReject: HTMLButtonElement | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnPageNext: HTMLButtonElement | null = null;
  private btnPagePrev: HTMLButtonElement | null = null;
  private btnRefresh: HTMLButtonElement | null = null;
  private btnResetFilters: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private currentPage = 1;
  private defaultActions: HTMLElement | null = null;
  private filterDropdownController: DropdownController | null = null;
  private giveawaysList: GiveawayOption[] = [];
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private orders: AdminOrderSummary[] = [];
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private selectedActions: HTMLElement | null = null;
  private selectedGiveawayUuid = 'all';
  private selectedOrder: AdminOrderSummary | null = null;
  private selectedStatus = 'all';
  private totalPages = 1;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-payments"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="payments-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="payments-selected-actions"]');
    this.btnActionDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    this.btnActionInspect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-inspect"]');
    this.btnActionApprove = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-approve"]');
    this.btnActionReject = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-reject"]');
    this.btnActionCopySpei = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-copy-spei"]');
    this.btnRefresh = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-payments"]');
    this.btnResetFilters = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-filters"]');
    this.btnPagePrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-page-prev"]');
    this.btnPageNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-page-next"]');

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
      void this.loadInitialData();
    });
  }

  bindEvents(): void {
    const signal = this.abortController?.signal;

    this.btnRefresh?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        const icon = this.btnRefresh?.querySelector('[data-ref="icon-refresh"]');
        icon?.classList.add('admin-refresh-spin');
        void this.loadOrders().finally(() => {
          setTimeout(() => {
            icon?.classList.remove('admin-refresh-spin');
          }, 600);
        });
        void this.loadKpis();
      },
      { signal }
    );

    this.btnToggleSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (!this.searchToolbar) return;
        this.isSearchActive = !this.isSearchActive;
        if (this.isSearchActive) {
          this.searchToolbar.classList.remove('is-hidden');
          this.inputSearch?.focus();
        } else {
          this.searchToolbar.classList.add('is-hidden');
          if (this.inputSearch) this.inputSearch.value = '';
          if (this.btnClearSearch) this.btnClearSearch.style.display = 'none';
          if (this.searchQuery) {
            this.searchQuery = '';
            this.currentPage = 1;
            void this.loadOrders();
          }
        }
      },
      { signal }
    );

    this.btnActionDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedOrder = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnActionInspect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedOrder) {
          void this.openInspectModal(this.selectedOrder.uuid);
        }
      },
      { signal }
    );

    this.btnActionApprove?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedOrder) {
          this.openConfirmApproveModal(this.selectedOrder.uuid);
        }
      },
      { signal }
    );

    this.btnActionReject?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedOrder) {
          this.openConfirmRejectModal(this.selectedOrder.uuid);
        }
      },
      { signal }
    );

    this.btnActionCopySpei?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedOrder?.tracking_key) {
          void navigator.clipboard.writeText(this.selectedOrder.tracking_key);
          showToast('Clave SPEI copiada al portapapeles.', 'success');
        } else if (this.selectedOrder?.concept_reference) {
          void navigator.clipboard.writeText(this.selectedOrder.concept_reference);
          showToast('Concepto de pago copiado al portapapeles.', 'success');
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
        if (this.searchDebounceTimer) {
          clearTimeout(this.searchDebounceTimer);
        }
        this.searchDebounceTimer = setTimeout(() => {
          this.searchQuery = val;
          this.currentPage = 1;
          void this.loadOrders();
        }, 300);
      },
      { signal }
    );

    this.btnClearSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.inputSearch) this.inputSearch.value = '';
        if (this.btnClearSearch) this.btnClearSearch.style.display = 'none';
        this.searchQuery = '';
        this.currentPage = 1;
        void this.loadOrders();
        this.inputSearch?.focus();
      },
      { signal }
    );

    const dropdownStatusBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-status-filter]');
    dropdownStatusBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const status = btn.getAttribute('data-status-filter') || 'all';
          this.setStatusFilter(status);
          this.filterDropdownController?.close();
        },
        { signal }
      );
    });

    this.btnResetFilters?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedStatus = 'all';
        this.selectedGiveawayUuid = 'all';
        this.searchQuery = '';
        this.selectedOrder = null;
        this.currentPage = 1;

        if (this.inputSearch) this.inputSearch.value = '';
        if (this.btnClearSearch) this.btnClearSearch.style.display = 'none';

        this.syncStatusUi();
        this.syncGiveawayDropdownUi();
        void this.loadOrders();
      },
      { signal }
    );

    this.btnPagePrev?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.currentPage > 1) {
          this.currentPage--;
          void this.loadOrders();
        }
      },
      { signal }
    );

    this.btnPageNext?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.currentPage < this.totalPages) {
          this.currentPage++;
          void this.loadOrders();
        }
      },
      { signal }
    );
  }

  private setStatusFilter(status: string): void {
    if (status !== this.selectedStatus) {
      this.selectedStatus = status;
      this.selectedOrder = null;
      this.currentPage = 1;
      this.syncStatusUi();
      void this.loadOrders();
    }
  }

  private syncStatusUi(): void {
    const dropdownStatusBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-status-filter]');
    dropdownStatusBtns.forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-status-filter') === this.selectedStatus);
    });
  }

  private syncGiveawayDropdownUi(): void {
    const dropdownGiveawayBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-giveaway-filter]');
    dropdownGiveawayBtns.forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-giveaway-filter') === this.selectedGiveawayUuid);
    });
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all([this.loadGiveawaysOptions(), this.loadKpis(), this.loadOrders()]);
  }

  private async loadGiveawaysOptions(): Promise<void> {
    try {
      const res = await getApi<Array<{ title: string; uuid: string }>>('/api/giveaways');
      if (res.success && Array.isArray(res.data)) {
        this.giveawaysList = res.data;
        const dropdownList = this.container.querySelector<HTMLElement>('[data-ref="filter-giveaways-dropdown-list"]');
        if (dropdownList) {
          dropdownList.innerHTML =
            `<button type="button" class="menu-item ${this.selectedGiveawayUuid === 'all' ? 'is-active' : ''}" data-giveaway-filter="all"><span class="menu-item__text">Todos los sorteos</span></button>` +
            this.giveawaysList
              .map(
                (g) =>
                  `<button type="button" class="menu-item ${this.selectedGiveawayUuid === g.uuid ? 'is-active' : ''}" data-giveaway-filter="${escapeHtml(g.uuid)}"><span class="menu-item__text">${escapeHtml(g.title)}</span></button>`
              )
              .join('');
          const dropdownGiveawayBtns = dropdownList.querySelectorAll<HTMLButtonElement>('[data-giveaway-filter]');
          dropdownGiveawayBtns.forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              const gUuid = btn.getAttribute('data-giveaway-filter') || 'all';
              if (gUuid !== this.selectedGiveawayUuid) {
                this.selectedGiveawayUuid = gUuid;
                dropdownGiveawayBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-giveaway-filter') === gUuid));
                this.selectedOrder = null;
                this.currentPage = 1;
                this.filterDropdownController?.close();
                void this.loadOrders();
              }
            });
          });
        }
      }
    } catch (_) {}
  }

  private async loadKpis(): Promise<void> {
    try {
      const res = await getApi<PaymentKpis>('/api/orders/kpis');
      if (res.success && res.data) {
        const kpi = res.data;

        const elRevCount = this.container.querySelector('[data-ref="kpi-review-count"]');
        const elRevAmount = this.container.querySelector('[data-ref="kpi-review-amount"]');
        const elPendCount = this.container.querySelector('[data-ref="kpi-pending-count"]');
        const elPendAmount = this.container.querySelector('[data-ref="kpi-pending-amount"]');
        const elCompCount = this.container.querySelector('[data-ref="kpi-completed-count"]');
        const elCompAmount = this.container.querySelector('[data-ref="kpi-completed-amount"]');
        const elCancCount = this.container.querySelector('[data-ref="kpi-cancelled-count"]');
        const elBadgeRev = this.container.querySelector<HTMLElement>('[data-ref="badge-count-review"]');

        if (elRevCount) elRevCount.textContent = formatNumber(kpi.inReviewCount);
        if (elRevAmount) elRevAmount.textContent = formatCurrency(kpi.inReviewAmount);
        if (elPendCount) elPendCount.textContent = formatNumber(kpi.pendingPaymentCount);
        if (elPendAmount) elPendAmount.textContent = formatCurrency(kpi.pendingPaymentAmount);
        if (elCompCount) elCompCount.textContent = formatNumber(kpi.completedCount);
        if (elCompAmount) elCompAmount.textContent = formatCurrency(kpi.completedAmount);
        if (elCancCount) elCancCount.textContent = formatNumber(kpi.cancelledCount + kpi.expiredCount);

        if (elBadgeRev) {
          if (kpi.inReviewCount > 0) {
            elBadgeRev.textContent = String(kpi.inReviewCount);
            elBadgeRev.classList.remove('is-hidden');
          } else {
            elBadgeRev.classList.add('is-hidden');
          }
        }
      }
    } catch (_) {}
  }

  private async loadOrders(): Promise<void> {
    try {
      const queryParams = new URLSearchParams({
        giveawayUuid: this.selectedGiveawayUuid,
        limit: '20',
        page: String(this.currentPage),
        search: this.searchQuery,
        status: this.selectedStatus,
      });

      const res = await getApi<AdminOrderSummary[]>(`/api/orders?${queryParams.toString()}`);
      if (res.success && Array.isArray(res.data)) {
        this.orders = res.data;
        if (res.pagination) {
          this.currentPage = res.pagination.currentPage;
          this.totalPages = res.pagination.totalPages;
          this.updatePaginationUi(res.pagination.totalCount);
        }
        this.renderOrders();
        this.updateSelectionUi();
      } else {
        showToast(res.error || 'No se pudieron cargar las órdenes.', 'danger');
      }
    } catch (_) {
      showToast('Error de conexión al cargar órdenes.', 'danger');
    }
  }

  private updatePaginationUi(totalCount: number): void {
    const elInfo = this.container.querySelector('[data-ref="pagination-info"]');
    const elPage = this.container.querySelector('[data-ref="text-current-page"]');

    if (elInfo) {
      elInfo.textContent = `Mostrando ${this.orders.length} de ${formatNumber(totalCount)} órdenes`;
    }
    if (elPage) {
      elPage.textContent = `${this.currentPage} / ${Math.max(1, this.totalPages)}`;
    }

    if (this.btnPagePrev) {
      this.btnPagePrev.disabled = this.currentPage <= 1;
    }
    if (this.btnPageNext) {
      this.btnPageNext.disabled = this.currentPage >= this.totalPages;
    }
  }

  private toggleOrderSelection(order: AdminOrderSummary): void {
    if (this.selectedOrder?.uuid === order.uuid) {
      this.selectedOrder = null;
    } else {
      this.selectedOrder = order;
    }
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedOrder !== null;
    if (this.defaultActions) this.defaultActions.style.display = isSelected ? 'none' : 'flex';
    if (this.selectedActions) this.selectedActions.style.display = isSelected ? 'flex' : 'none';

    const cards = this.container.querySelectorAll<HTMLElement>('.payment-card');
    cards.forEach((card) => {
      const isThisSelected = card.getAttribute('data-uuid') === this.selectedOrder?.uuid;
      card.classList.toggle('is-selected', isThisSelected);
    });
  }

  private renderOrders(): void {
    const listContainer = this.container.querySelector<HTMLElement>('[data-ref="payments-list-container"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="payments-empty-state"]');
    const paginationBar = this.container.querySelector<HTMLElement>('[data-ref="payments-pagination-bar"]');

    if (!listContainer) return;

    if (this.orders.length === 0) {
      listContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      if (paginationBar) paginationBar.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (paginationBar) paginationBar.style.display = 'flex';

    listContainer.innerHTML = this.orders.map((o) => this.buildOrderCardHtml(o)).join('');
    renderIcons(listContainer);
    this.attachOrderActions(listContainer);
  }

  private buildOrderCardHtml(order: AdminOrderSummary): string {
    const hasReceipt = Boolean(order.receipt_filename);
    const isCompleted = order.status === 'completed';
    const isInReview = order.status === 'in_review';
    const isPending = order.status === 'pending_payment';
    const isCancelled = order.status === 'cancelled';
    const isExpired = order.status === 'expired';
    const isSelected = this.selectedOrder?.uuid === order.uuid;

    let statusBadgeHtml = '';
    if (isInReview) {
      if (order.spei_status === 'manual_review') {
        statusBadgeHtml = `
          <span class="giveaway-badge" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.3);">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#tune"></use></svg>
            <span>Revisión Manual</span>
          </span>
        `;
      } else {
        statusBadgeHtml = `
          <span class="giveaway-badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3);">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
            <span>En Revisión</span>
          </span>
        `;
      }
    } else if (isCompleted) {
      statusBadgeHtml = `
        <span class="giveaway-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>
          <span>Liquidado</span>
        </span>
      `;
    } else if (isPending) {
      statusBadgeHtml = `
        <span class="giveaway-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
          <span>Pendiente de Pago</span>
        </span>
      `;
    } else if (isExpired) {
      statusBadgeHtml = `
        <span class="giveaway-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#cancel"></use></svg>
          <span>Expirada</span>
        </span>
      `;
    } else {
      statusBadgeHtml = `
        <span class="giveaway-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#cancel"></use></svg>
          <span>Cancelada</span>
        </span>
      `;
    }

    const receiptThumbHtml = hasReceipt
      ? `
        <div class="payment-card__thumb" data-ref="thumb-${order.uuid}" data-uuid="${order.uuid}">
          <img src="/api/orders/${order.uuid}/receipt" alt="Comprobante" loading="lazy" class="payment-card__thumb-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="payment-card__thumb-fallback" style="display: none;">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#receipt_long"></use></svg>
          </div>
          <div class="payment-card__thumb-overlay" data-ref="overlay-zoom">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#zoom_in"></use></svg>
          </div>
        </div>
      `
      : `
        <div class="payment-card__thumb payment-card__thumb--none">
          <svg class="component-icon payment-card__thumb-icon" aria-hidden="true"><use href="/icons.svg#hourglass_empty"></use></svg>
        </div>
      `;

    const ticketChipsHtml = order.ticket_numbers
      .slice(0, 10)
      .map((num) => `<span class="giveaway-ticket giveaway-ticket--chip">#${String(num).padStart(3, '0')}</span>`)
      .join('');

    const moreTicketsCount = Math.max(0, order.ticket_numbers.length - 10);
    const moreChipsBadge = moreTicketsCount > 0 ? `<span class="giveaway-ticket giveaway-ticket--chip">+${moreTicketsCount} más</span>` : '';

    const trackingKeyHtml = order.tracking_key
      ? `<div class="payment-card__tracking"><span class="payment-card__tracking-label">Clave SPEI:</span> <strong class="payment-card__tracking-val">${escapeHtml(order.tracking_key)}</strong></div>`
      : '';

    let actionsHtml = `
      <button type="button" class="component-button component-button--secondary component-button--h36" data-ref="btn-inspect-${order.uuid}" data-uuid="${order.uuid}">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
        <span>Inspeccionar</span>
      </button>
    `;

    if (isInReview || isPending) {
      actionsHtml += `
        <button type="button" class="component-button component-button--black component-button--h36" data-ref="btn-approve-${order.uuid}" data-uuid="${order.uuid}">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check"></use></svg>
          <span>Aprobar</span>
        </button>
        <button type="button" class="component-button component-button--danger component-button--h36" data-ref="btn-reject-${order.uuid}" data-uuid="${order.uuid}">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
          <span>Rechazar</span>
        </button>
      `;
    }

    return `
      <div class="payment-card ${isSelected ? 'is-selected' : ''}" data-ref="card-order-${order.uuid}" data-uuid="${order.uuid}">
        ${receiptThumbHtml}

        <div class="payment-card__main">
          <div class="payment-card__header">
            <div class="payment-card__title-box">
              <span class="payment-card__folio">Folio ORD-${order.uuid.slice(0, 8).toUpperCase()}</span>
              <h3 class="payment-card__customer">${escapeHtml(order.customer_name)}</h3>
              <div class="payment-card__customer-meta">
                <span class="payment-card__phone">${formatPhone(order.customer_phone)}</span>
                ${order.customer_state ? `<span class="payment-card__state">• ${escapeHtml(order.customer_state)}</span>` : ''}
              </div>
            </div>
            <div class="payment-card__badges">
              ${statusBadgeHtml}
            </div>
          </div>

          <div class="payment-card__body">
            <div class="payment-card__giveaway-name">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
              <span>${escapeHtml(order.giveaway_title)}</span>
            </div>

            <div class="payment-card__tickets-row">
              <span class="payment-card__tickets-label">${formatNumber(order.ticket_count)} boletos:</span>
              <div class="payment-card__chips">${ticketChipsHtml}${moreChipsBadge}</div>
            </div>

            ${trackingKeyHtml}
          </div>

          <div class="payment-card__footer">
            <div class="payment-card__amount-box">
              <span class="payment-card__amount-label">Monto Total:</span>
              <span class="payment-card__amount-val">${formatCurrency(order.total_amount, order.currency)}</span>
              <span class="payment-card__date">${formatDate(order.created_at)}</span>
            </div>
            <div class="payment-card__actions">
              ${actionsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private attachOrderActions(container: HTMLElement): void {
    const cards = container.querySelectorAll<HTMLElement>('.payment-card');
    cards.forEach((card) => {
      const uuid = card.getAttribute('data-uuid');
      if (!uuid) return;
      const order = this.orders.find((o) => o.uuid === uuid);
      if (!order) return;

      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('a') || target.closest('.payment-card__thumb-overlay')) return;
        this.toggleOrderSelection(order);
      });

      card.addEventListener('dblclick', (e) => {
        e.preventDefault();
        void this.openInspectModal(uuid);
      });
    });

    const inspectBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-inspect-"]');
    inspectBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        if (uuid) void this.openInspectModal(uuid);
      });
    });

    const thumbs = container.querySelectorAll<HTMLElement>('.payment-card__thumb[data-uuid]');
    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = thumb.getAttribute('data-uuid');
        if (uuid) void this.openInspectModal(uuid);
      });
    });

    const approveBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-approve-"]');
    approveBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        if (uuid) this.openConfirmApproveModal(uuid);
      });
    });

    const rejectBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-reject-"]');
    rejectBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        if (uuid) this.openConfirmRejectModal(uuid);
      });
    });
  }

  private async openInspectModal(orderUuid: string): Promise<void> {
    const res = await getApi<AdminOrderDetail>(`/api/orders/${orderUuid}`);
    if (!res.success || !res.data) {
      showToast(res.error || 'No se pudo cargar el detalle de la orden.', 'danger');
      return;
    }

    const order = res.data;
    let zoomLevel = 1;
    let rotation = 0;

    const modalBody = document.createElement('div');
    modalBody.className = 'inspect-payment-modal';

    const hasReceipt = Boolean(order.receipt_filename);
    const receiptViewHtml = hasReceipt
      ? `
        <div class="inspect-receipt-pane" data-ref="inspect-receipt-pane">
          <div class="inspect-receipt-viewer" data-ref="receipt-viewer-viewport">
            <img src="/api/orders/${order.uuid}/receipt" alt="Comprobante Original" class="inspect-receipt-img" data-ref="inspect-receipt-img" />
          </div>
          <div class="inspect-receipt-controls" data-ref="receipt-controls">
            <button type="button" class="component-button component-button--secondary component-button--h32 component-button--icon-only" data-ref="btn-zoom-in" data-tooltip="Acercar" aria-label="Acercar">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#zoom_in"></use></svg>
            </button>
            <button type="button" class="component-button component-button--secondary component-button--h32 component-button--icon-only" data-ref="btn-zoom-out" data-tooltip="Alejar" aria-label="Alejar">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#zoom_out"></use></svg>
            </button>
            <button type="button" class="component-button component-button--secondary component-button--h32 component-button--icon-only" data-ref="btn-rotate" data-tooltip="Rotar" aria-label="Rotar">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#refresh"></use></svg>
            </button>
            <a href="/api/orders/${order.uuid}/receipt" target="_blank" download="${order.receipt_filename || 'comprobante'}" class="component-button component-button--secondary component-button--h32 component-button--icon-only" data-tooltip="Descargar original" aria-label="Descargar original">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#download"></use></svg>
            </a>
          </div>
        </div>
      `
      : `
        <div class="inspect-receipt-pane inspect-receipt-pane--empty">
          <svg class="component-icon" style="width: 56px; height: 56px; color: var(--text-tertiary);"><use href="/icons.svg#hourglass_empty"></use></svg>
          <p>El cliente aún no ha adjuntado un comprobante digital.</p>
        </div>
      `;

    let ocrDiagnosticHtml = '';
    if (order.banxico_response) {
      const resp = order.banxico_response;
      const parsedOcr = resp.ocr_parsed || {};
      const validation = resp.validation || {};
      const banxico = resp.banxico || {};

      ocrDiagnosticHtml = `
        <div class="inspect-diagnostics-box" data-ref="diagnostics-box">
          <h4 class="inspect-diagnostics-title">Diagnóstico OCR y Certificación SPEI</h4>
          <div class="inspect-diagnostics-grid">
            <div class="inspect-diagnostics-item">
              <span class="inspect-diagnostics-label">Monto OCR:</span>
              <strong>${parsedOcr.amount !== undefined ? formatCurrency(Number(parsedOcr.amount)) : 'No detectado'}</strong>
            </div>
            <div class="inspect-diagnostics-item">
              <span class="inspect-diagnostics-label">Fecha OCR:</span>
              <strong>${escapeHtml(parsedOcr.date || 'No detectada')}</strong>
            </div>
            <div class="inspect-diagnostics-item">
              <span class="inspect-diagnostics-label">Banco Emisor:</span>
              <strong>${escapeHtml(parsedOcr.sender_bank || 'No detectado')}</strong>
            </div>
            <div class="inspect-diagnostics-item">
              <span class="inspect-diagnostics-label">Estado Banxico CEP:</span>
              <strong style="color: ${banxico.verified ? '#10b981' : '#f59e0b'};">${escapeHtml(banxico.message || resp.notice || resp.notes || 'En espera de certificación')}</strong>
            </div>
          </div>
          ${resp.errors && resp.errors.length ? `<div class="inspect-errors-list"><span style="color: #ef4444; font-weight: 600;">Inconsistencias detectadas:</span><ul>${resp.errors.map((e: string) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
        </div>
      `;
    }

    const allTicketsChips = order.ticket_numbers
      .map((n) => `<span class="giveaway-ticket giveaway-ticket--chip">#${String(n).padStart(3, '0')}</span>`)
      .join('');

    modalBody.innerHTML = `
      <div class="inspect-modal-layout">
        ${receiptViewHtml}

        <div class="inspect-details-pane">
          <div class="inspect-section">
            <h4 class="inspect-section__title">Detalle del Participante</h4>
            <div class="inspect-info-row">
              <span class="inspect-info-label">Nombre:</span>
              <span class="inspect-info-val">${escapeHtml(order.customer_name)}</span>
            </div>
            <div class="inspect-info-row">
              <span class="inspect-info-label">Teléfono:</span>
              <span class="inspect-info-val">${formatPhone(order.customer_phone)}</span>
            </div>
            ${order.customer_state ? `<div class="inspect-info-row"><span class="inspect-info-label">Estado:</span><span class="inspect-info-val">${escapeHtml(order.customer_state)}</span></div>` : ''}
          </div>

          <div class="inspect-section">
            <h4 class="inspect-section__title">Sorteo y Boletos</h4>
            <div class="inspect-info-row">
              <span class="inspect-info-label">Sorteo:</span>
              <span class="inspect-info-val">${escapeHtml(order.giveaway_title)}</span>
            </div>
            <div class="inspect-info-row">
              <span class="inspect-info-label">Total Boletos:</span>
              <span class="inspect-info-val">${formatNumber(order.ticket_count)} boletos</span>
            </div>
            <div class="inspect-info-row">
              <span class="inspect-info-label">Monto a Liquidar:</span>
              <span class="inspect-info-val" style="font-weight: 700; color: var(--text-primary); font-size: 16px;">${formatCurrency(order.total_amount, order.currency)}</span>
            </div>
            <div class="inspect-tickets-box">
              ${allTicketsChips}
            </div>
          </div>

          <div class="inspect-section">
            <h4 class="inspect-section__title">Clave de Rastreo y Referencias</h4>
            <div class="inspect-info-row">
              <span class="inspect-info-label">Concepto:</span>
              <span class="inspect-info-val">${escapeHtml(order.concept_reference)}</span>
            </div>
            <div class="inspect-info-row">
              <span class="inspect-info-label">Clave de Rastreo SPEI:</span>
              <span class="inspect-info-val"><strong>${escapeHtml(order.tracking_key || 'Sin registrar')}</strong></span>
            </div>
            <div class="inspect-tracking-edit-row">
              <label class="field" style="flex: 1;" data-ref="field-edit-tracking">
                <input class="field__input" data-ref="input-edit-tracking" type="text" placeholder=" " value="${escapeHtml(order.tracking_key || '')}" />
                <span class="field__label">Corregir Clave SPEI</span>
              </label>
              <button type="button" class="component-button component-button--secondary component-button--h44" data-ref="btn-save-tracking">
                <span>Actualizar Clave</span>
              </button>
            </div>
          </div>

          ${ocrDiagnosticHtml}
        </div>
      </div>
    `;

    const imgEl = modalBody.querySelector<HTMLImageElement>('[data-ref="inspect-receipt-img"]');
    const btnZoomIn = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in"]');
    const btnZoomOut = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out"]');
    const btnRotate = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-rotate"]');
    const btnSaveTracking = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-save-tracking"]');
    const inputTracking = modalBody.querySelector<HTMLInputElement>('[data-ref="input-edit-tracking"]');

    const updateTransform = () => {
      if (imgEl) {
        imgEl.style.transform = `scale(${zoomLevel}) rotate(${rotation}deg)`;
      }
    };

    btnZoomIn?.addEventListener('click', () => {
      zoomLevel = Math.min(3.5, zoomLevel + 0.25);
      updateTransform();
    });

    btnZoomOut?.addEventListener('click', () => {
      zoomLevel = Math.max(0.5, zoomLevel - 0.25);
      updateTransform();
    });

    btnRotate?.addEventListener('click', () => {
      rotation = (rotation + 90) % 360;
      updateTransform();
    });

    btnSaveTracking?.addEventListener('click', async () => {
      const newKey = (inputTracking?.value || '').trim();
      if (!newKey || newKey.length < 5) {
        showToast('Introduce una clave de rastreo SPEI válida (mínimo 5 caracteres).', 'warning');
        return;
      }
      const updateRes = await patchApi<AdminOrderDetail>(`/api/orders/${order.uuid}/tracking-key`, {
        trackingKey: newKey,
      });
      if (updateRes.success) {
        showToast('Clave de rastreo actualizada y validación reprogramada.', 'success');
        void this.loadOrders();
      } else {
        showToast(updateRes.error || 'Error al actualizar clave de rastreo.', 'danger');
      }
    });

    const isActionable = order.status === 'in_review' || order.status === 'pending_payment';

    const modal = openModal({
      bodyHtml: modalBody,
      cancelText: 'Cerrar',
      confirmClass: 'component-button--black',
      confirmText: isActionable ? 'Aprobar Pago' : '',
      description: `Participante: ${order.customer_name} • ${formatCurrency(order.total_amount, order.currency)}`,
      onConfirm: isActionable
        ? async () => {
            modal.close();
            this.openConfirmApproveModal(order.uuid);
            return true;
          }
        : undefined,
      size: 'lg',
      title: `Inspección de Pago ORD-${order.uuid.slice(0, 8).toUpperCase()}`,
    });
    renderIcons(modalBody);
  }

  private openConfirmApproveModal(orderUuid: string): void {
    const order = this.orders.find((o) => o.uuid === orderUuid);

    const bodyHtml = `
      <div style="font-size: 13.5px; color: var(--text-secondary); line-height: 1.55;">
        ¿Deseas confirmar la aprobación manual de esta orden?<br/><br/>
        • <strong>Cliente:</strong> ${escapeHtml(order?.customer_name || '')}<br/>
        • <strong>Sorteo:</strong> ${escapeHtml(order?.giveaway_title || '')}<br/>
        • <strong>Boletos:</strong> ${formatNumber(order?.ticket_count || 1)} boletos<br/>
        • <strong>Total:</strong> ${order ? formatCurrency(order.total_amount, order.currency) : '$0.00'}<br/><br/>
        Al confirmar, los boletos se marcarán inmediatamente como <strong>Pagados</strong> y la orden pasará a estado <strong>Completada</strong>.
      </div>
    `;

    openModal({
      bodyHtml,
      confirmClass: 'component-button--black',
      confirmText: 'Aprobar y Liquidar Pago',
      description: 'Aprobación manual de orden de compra.',
      onConfirm: async () => {
        const res = await postApi<{ order: AdminOrderDetail }>(`/api/orders/${orderUuid}/approve`, {
          notes: 'Aprobación manual realizada desde el panel administrativo.',
        });
        if (res.success) {
          showToast('Pago aprobado y boletos liquidados con éxito.', 'success');
          void this.loadOrders();
          void this.loadKpis();
          return true;
        } else {
          showToast(res.error || 'Error al aprobar el pago.', 'danger');
          return false;
        }
      },
      size: 'sm',
      title: 'Aprobar Comprobante de Pago',
    });
  }

  private openConfirmRejectModal(orderUuid: string): void {
    const order = this.orders.find((o) => o.uuid === orderUuid);

    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
        <p style="margin: 0;">
          ¿Estás seguro de rechazar el comprobante de <strong>${escapeHtml(order?.customer_name || 'este cliente')}</strong>?
        </p>
        <p style="margin: 0; font-size: 12.5px; color: var(--text-tertiary);">
          Los <strong>${formatNumber(order?.ticket_count || 1)} boletos</strong> apartados serán liberados inmediatamente y quedarán disponibles para otros compradores.
        </p>
        <label class="field" data-ref="field-rejection-reason">
          <input class="field__input" data-ref="input-rejection-reason" type="text" placeholder=" " value="Comprobante ilegible o monto no coincide con la orden" />
          <span class="field__label">Motivo de rechazo</span>
        </label>
      </div>
    `;

    const inputReason = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-rejection-reason"]');

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--danger',
      confirmText: 'Rechazar y Liberar Boletos',
      description: 'Cancelación de orden por comprobante inválido.',
      onConfirm: async () => {
        const reason = (inputReason?.value || '').trim() || 'Comprobante rechazado por el administrador.';
        const res = await postApi<{ order: AdminOrderDetail }>(`/api/orders/${orderUuid}/reject`, {
          reason,
        });
        if (res.success) {
          showToast('Comprobante rechazado y boletos liberados exitosamente.', 'info');
          void this.loadOrders();
          void this.loadKpis();
          return true;
        } else {
          showToast(res.error || 'Error al rechazar el comprobante.', 'danger');
          return false;
        }
      },
      size: 'sm',
      title: 'Rechazar Comprobante de Pago',
    });
  }

  destroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createPaymentsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/payments/payments.html');
  const controller = new PaymentsController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
