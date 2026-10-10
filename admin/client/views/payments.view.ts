import { openModal } from '../components/modal.component.js';
import { getApi, patchApi, postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, escapeHtml, getEmptyIllustration, setupDropdown } from '../utils/dom.util.js';
import { hasPermission } from '../utils/permission.util.js';

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
  private btnPaginationNext: HTMLButtonElement | null = null;
  private btnPaginationPrev: HTMLButtonElement | null = null;
  private btnResetFilters: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private currentPage = 1;
  private defaultActions: HTMLElement | null = null;
  private filterDropdownController: DropdownController | null = null;
  private giveawaysList: GiveawayOption[] = [];
  private inputPaginationPage: HTMLInputElement | null = null;
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
    this.btnResetFilters = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-filters"]');
    this.btnPaginationPrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-prev"]');
    this.btnPaginationNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-next"]');
    this.inputPaginationPage = this.container.querySelector<HTMLInputElement>('[data-ref="input-pagination-page"]');

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
          this.btnClearSearch?.classList.add('is-hidden');
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
        this.btnClearSearch?.classList.toggle('is-hidden', val.length === 0);
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
        this.btnClearSearch?.classList.add('is-hidden');
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
        this.resetFilters();
      },
      { signal }
    );

    this.inputPaginationPage?.addEventListener(
      'change',
      () => {
        let page = parseInt(this.inputPaginationPage?.value || '1', 10);
        if (isNaN(page) || page < 1) page = 1;
        if (page > this.totalPages) page = this.totalPages;
        if (page !== this.currentPage) {
          this.currentPage = page;
          void this.loadOrders();
        } else if (this.inputPaginationPage) {
          this.inputPaginationPage.value = String(this.currentPage);
        }
      },
      { signal }
    );

    this.inputPaginationPage?.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.inputPaginationPage?.blur();
        }
      },
      { signal }
    );

    this.btnPaginationPrev?.addEventListener(
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

    this.btnPaginationNext?.addEventListener(
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
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.selectedOrder) {
          this.selectedOrder = null;
          this.updateSelectionUi();
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
    await Promise.all([this.loadGiveawaysOptions(), this.loadOrders()]);
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
          this.updatePaginationUi();
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

  private updatePaginationUi(): void {
    if (this.inputPaginationPage) {
      this.inputPaginationPage.value = String(this.currentPage);
      this.inputPaginationPage.min = '1';
      this.inputPaginationPage.max = String(Math.max(1, this.totalPages));
      this.inputPaginationPage.disabled = this.totalPages <= 1;
    }

    if (this.btnPaginationPrev) {
      this.btnPaginationPrev.disabled = this.currentPage <= 1;
    }
    if (this.btnPaginationNext) {
      this.btnPaginationNext.disabled = this.currentPage >= this.totalPages;
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
    this.defaultActions?.classList.toggle('is-hidden', isSelected);
    this.selectedActions?.classList.toggle('is-hidden', !isSelected);

    if (isSelected) {
      this.btnActionApprove?.classList.toggle('is-hidden', !hasPermission('orders:approve'));
      this.btnActionReject?.classList.toggle('is-hidden', !hasPermission('orders:reject'));
    }

    const rows = this.container.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const isThisSelected = row.getAttribute('data-uuid') === this.selectedOrder?.uuid;
      row.classList.toggle('is-selected', isThisSelected);
    });
  }

  private resetFilters(): void {
    this.selectedStatus = 'all';
    this.selectedGiveawayUuid = 'all';
    this.searchQuery = '';
    this.selectedOrder = null;
    this.currentPage = 1;

    if (this.inputSearch) this.inputSearch.value = '';
    this.btnClearSearch?.classList.add('is-hidden');

    this.syncStatusUi();
    this.syncGiveawayDropdownUi();
    void this.loadOrders();
  }

  private renderOrders(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tbody-payments"]');
    if (!tbody) return;

    if (this.orders.length === 0) {
      const isFiltered = this.selectedStatus !== 'all' || this.selectedGiveawayUuid !== 'all' || Boolean(this.searchQuery);
      tbody.innerHTML = `
        <tr class="winners-table__tr-empty">
          <td class="winners-table__td-empty" colspan="8">
            <div class="component-empty-state component-empty-state--table" data-ref="payments-empty-state">
              <div class="component-empty-state-graphic">
                ${getEmptyIllustration(isFiltered ? 'search' : 'payments')}
              </div>
              <h2 class="component-empty-state-title">Sin órdenes ni comprobantes</h2>
              <p class="component-empty-state-desc">${
                isFiltered
                  ? 'No se encontraron órdenes registradas con los filtros seleccionados.'
                  : 'Aún no se han registrado órdenes ni comprobantes de pago en la plataforma.'
              }</p>
              ${
                isFiltered
                  ? `<div class="component-empty-state-actions">
                      <button type="button" class="component-button component-button--h36 component-button--secondary component-button--pill" data-ref="btn-empty-reset-filters">Restablecer Filtros</button>
                    </div>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);

      const btnReset = tbody.querySelector<HTMLButtonElement>('[data-ref="btn-empty-reset-filters"]');
      btnReset?.addEventListener('click', (e) => {
        e.preventDefault();
        this.resetFilters();
      });
      return;
    }

    tbody.innerHTML = this.orders.map((o) => this.buildOrderRowHtml(o)).join('');
    renderIcons(tbody);
    this.attachOrderActions(tbody);
  }

  private buildOrderRowHtml(order: AdminOrderSummary): string {
    const isInReview = order.status === 'in_review';
    const isCompleted = order.status === 'completed';
    const isPending = order.status === 'pending_payment';
    const isExpired = order.status === 'expired';
    const isSelected = this.selectedOrder?.uuid === order.uuid;

    let statusText = 'Cancelada';
    if (isInReview) {
      statusText = order.spei_status === 'manual_review' ? 'Revisión Manual' : 'En Revisión';
    } else if (isCompleted) {
      statusText = 'Liquidado';
    } else if (isPending) {
      statusText = 'Pendiente';
    } else if (isExpired) {
      statusText = 'Expirada';
    }

    const speiText = order.tracking_key ? `${escapeHtml(order.tracking_key.slice(0, 14))}...` : '—';
    const contactText = `${formatPhone(order.customer_phone)}${order.customer_state ? ` • ${escapeHtml(order.customer_state)}` : ''}`;

    return `
      <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-ref="tr-order-${order.uuid}" data-uuid="${order.uuid}">
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">ORD-${order.uuid.slice(0, 8).toUpperCase()} • ${escapeHtml(order.giveaway_title)}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${escapeHtml(order.customer_name)}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${contactText}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm component-badge--mono-bold">${formatNumber(order.ticket_count)} bol.</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${formatCurrency(order.total_amount, order.currency)}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm component-badge--mono-bold">${speiText}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${statusText}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${formatDate(order.created_at)}</span>
        </td>
      </tr>
    `;
  }

  private attachOrderActions(tbody: HTMLElement): void {
    const rows = tbody.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const uuid = row.getAttribute('data-uuid');
      if (!uuid) return;
      const order = this.orders.find((o) => o.uuid === uuid);
      if (!order) return;

      row.addEventListener('click', () => {
        this.toggleOrderSelection(order);
      });

      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        void this.openInspectModal(uuid);
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
            <a class="component-button component-button--secondary component-button--h32 component-button--icon-only" href="/api/orders/${order.uuid}/receipt" target="_blank" download="${order.receipt_filename || 'comprobante'}" data-tooltip="Descargar original" aria-label="Descargar original">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#download"></use></svg>
            </a>
          </div>
        </div>
      `
      : `
        <div class="inspect-receipt-pane inspect-receipt-pane--empty">
          <svg class="component-icon inspect-receipt-empty-icon"><use href="/icons.svg#schedule"></use></svg>
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
              <strong class="${banxico.verified ? 'inspect-cep-verified' : 'inspect-cep-unverified'}">${escapeHtml(banxico.message || resp.notice || resp.notes || 'En espera de certificación')}</strong>
            </div>
          </div>
          ${resp.errors && resp.errors.length ? `<div class="inspect-errors-list"><span class="inspect-errors-title">Inconsistencias detectadas:</span><ul>${resp.errors.map((e: string) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
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
              <span class="inspect-info-val inspect-amount-highlight">${formatCurrency(order.total_amount, order.currency)}</span>
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
              <label class="field inspect-tracking-field" data-ref="field-edit-tracking">
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
      <div class="payment-dialog-text">
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
        const res = await postApi<AdminOrderDetail>(`/api/orders/${orderUuid}/approve`, {
          notes: 'Aprobación manual realizada desde el panel administrativo.',
        });
        if (res.success) {
          showToast('Pago aprobado y boletos liquidados con éxito.', 'success');
          void this.loadOrders();
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
      <div class="payment-reject-modal-content">
        <p class="payment-reject-text">
          ¿Estás seguro de rechazar el comprobante de <strong>${escapeHtml(order?.customer_name || 'este cliente')}</strong>?
        </p>
        <p class="payment-reject-subtext">
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
        const res = await postApi<AdminOrderDetail>(`/api/orders/${orderUuid}/reject`, {
          reason,
        });
        if (res.success) {
          showToast('Comprobante rechazado y boletos liberados exitosamente.', 'info');
          void this.loadOrders();
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
