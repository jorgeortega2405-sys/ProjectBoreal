import { AdminOrder, OrderStatus, SpeiQueueItem } from '../types/order.types.js';
import { approveAdminOrder, cancelAdminOrder, fetchAdminOrders, fetchSpeiQueue, triggerSpeiBatch } from '../services/orders.service.js';
import { loadTemplate } from '../services/template.service.js';
import { renderIcons } from '../services/icon.service.js';
import { ViewController } from '../types/common.types.js';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStatusBadge(status: OrderStatus): { bg: string; color: string; label: string } {
  switch (status) {
    case 'in_review':
      return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: 'En revisión' };
    case 'completed':
      return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', label: 'Completado' };
    case 'pending_payment':
      return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Pendiente' };
    case 'cancelled':
      return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Cancelado' };
    case 'expired':
    default:
      return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', label: 'Expirado' };
  }
}

class OrdersViewController implements ViewController {
  private abortController: AbortController | null = null;
  private currentPage = 1;
  private currentStatus = 'in_review';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private element: HTMLElement;
  private orders: AdminOrder[] = [];
  private searchTerm = '';
  private selectedOrder: AdminOrder | null = null;
  private totalPages = 1;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    renderIcons(this.element);
    await Promise.all([this.loadOrders(), this.loadSpeiQueue()]);
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const tabs = this.element.querySelectorAll<HTMLElement>('.orders-tab');
    tabs.forEach((tab) => {
      tab.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          tabs.forEach((t) => t.classList.remove('is-active'));
          tab.classList.add('is-active');
          const status = tab.getAttribute('data-status') || 'all';
          this.currentStatus = status;
          this.currentPage = 1;
          this.loadOrders();
        },
        { signal }
      );
    });

    const searchInput = this.element.querySelector<HTMLInputElement>('[data-ref="orders-search-input"]');
    searchInput?.addEventListener(
      'input',
      () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.searchTerm = searchInput.value.trim();
          this.currentPage = 1;
          this.loadOrders();
        }, 300);
      },
      { signal }
    );

    const btnRefresh = this.element.querySelector<HTMLElement>('[data-ref="btn-refresh-orders"]');
    btnRefresh?.addEventListener(
      'click',
      () => {
        this.loadOrders();
        this.loadSpeiQueue();
      },
      { signal }
    );

    const btnTriggerSpei = this.element.querySelector<HTMLElement>('[data-ref="btn-trigger-spei"]');
    btnTriggerSpei?.addEventListener(
      'click',
      async () => {
        btnTriggerSpei.classList.add('is-loading');
        btnTriggerSpei.setAttribute('disabled', 'true');
        try {
          const res = await triggerSpeiBatch();
          if (res.success) {
            await Promise.all([this.loadOrders(), this.loadSpeiQueue()]);
          }
        } finally {
          btnTriggerSpei.classList.remove('is-loading');
          btnTriggerSpei.removeAttribute('disabled');
        }
      },
      { signal }
    );

    const btnPrev = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-prev-page"]');
    btnPrev?.addEventListener(
      'click',
      () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.loadOrders();
        }
      },
      { signal }
    );

    const btnNext = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-next-page"]');
    btnNext?.addEventListener(
      'click',
      () => {
        if (this.currentPage < this.totalPages) {
          this.currentPage++;
          this.loadOrders();
        }
      },
      { signal }
    );

    const tableBody = this.element.querySelector<HTMLElement>('[data-ref="orders-table-body"]');
    tableBody?.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        const btnView = target.closest<HTMLElement>('.btn-view-receipt');
        if (btnView) {
          const uuid = btnView.getAttribute('data-uuid');
          const order = this.orders.find((o) => o.uuid === uuid);
          if (order) {
            this.openReceiptModal(order);
          }
          return;
        }

        const btnApprove = target.closest<HTMLButtonElement>('.btn-action-approve');
        if (btnApprove) {
          const uuid = btnApprove.getAttribute('data-uuid');
          if (uuid) {
            this.handleDirectApprove(uuid, btnApprove);
          }
          return;
        }

        const btnCancel = target.closest<HTMLButtonElement>('.btn-action-cancel');
        if (btnCancel) {
          const uuid = btnCancel.getAttribute('data-uuid');
          if (uuid) {
            this.handleDirectCancel(uuid, btnCancel);
          }
          return;
        }
      },
      { signal }
    );

    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-receipt"]');
    const btnCloseModal = this.element.querySelector<HTMLElement>('[data-ref="btn-close-receipt-modal"]');
    btnCloseModal?.addEventListener(
      'click',
      () => {
        this.closeReceiptModal();
      },
      { signal }
    );

    modal?.addEventListener(
      'click',
      (e) => {
        if (e.target === modal) {
          this.closeReceiptModal();
        }
      },
      { signal }
    );

    const btnModalApprove = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-modal-approve-order"]');
    btnModalApprove?.addEventListener(
      'click',
      async () => {
        if (!this.selectedOrder) return;
        await this.handleModalApprove(this.selectedOrder.uuid, btnModalApprove);
      },
      { signal }
    );

    const btnModalCancel = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-modal-cancel-order"]');
    btnModalCancel?.addEventListener(
      'click',
      async () => {
        if (!this.selectedOrder) return;
        await this.handleModalCancel(this.selectedOrder.uuid, btnModalCancel);
      },
      { signal }
    );
  }

  private async loadOrders(): Promise<void> {
    const skeleton = this.element.querySelector<HTMLElement>('[data-ref="orders-skeleton"]');
    const tableWrapper = this.element.querySelector<HTMLElement>('[data-ref="orders-table-wrapper"]');
    const emptyState = this.element.querySelector<HTMLElement>('[data-ref="orders-empty"]');
    const pagination = this.element.querySelector<HTMLElement>('[data-ref="orders-pagination"]');
    const tableBody = this.element.querySelector<HTMLElement>('[data-ref="orders-table-body"]');

    if (skeleton) skeleton.style.display = 'flex';
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (pagination) pagination.style.display = 'none';

    try {
      const result = await fetchAdminOrders({
        limit: 20,
        page: this.currentPage,
        search: this.searchTerm,
        status: this.currentStatus,
      });

      this.orders = result.orders;
      this.totalPages = result.totalPages;

      if (skeleton) skeleton.style.display = 'none';

      if (this.orders.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
      }

      if (tableBody) {
        tableBody.innerHTML = this.orders.map((o) => this.renderTableRow(o)).join('');
        renderIcons(tableBody);
      }

      if (tableWrapper) tableWrapper.style.display = 'block';
      if (pagination && this.totalPages > 1) {
        pagination.style.display = 'flex';
        const paginationInfo = this.element.querySelector<HTMLElement>('[data-ref="orders-pagination-info"]');
        const btnPrev = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-prev-page"]');
        const btnNext = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-next-page"]');
        if (paginationInfo) paginationInfo.textContent = `Página ${result.page} de ${result.totalPages} (${result.total} órdenes)`;
        if (btnPrev) btnPrev.disabled = result.page <= 1;
        if (btnNext) btnNext.disabled = result.page >= result.totalPages;
      }
    } catch {
      if (skeleton) skeleton.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
    }
  }

  private async loadSpeiQueue(): Promise<void> {
    try {
      const queue = await fetchSpeiQueue();
      const countEl = this.element.querySelector<HTMLElement>('[data-ref="spei-queue-count"]');
      const badgeInReview = this.element.querySelector<HTMLElement>('[data-ref="tab-badge-in-review"]');
      const queueList = this.element.querySelector<HTMLElement>('[data-ref="spei-queue-list"]');

      const pendingCount = queue.filter((i) => i.status === 'pending' || i.status === 'verifying').length;

      if (countEl) {
        countEl.textContent = `${pendingCount} en cola`;
      }

      const inReviewCount = queue.filter((i) => i.order_status === 'in_review').length;
      if (badgeInReview && inReviewCount > 0) {
        badgeInReview.textContent = String(inReviewCount);
      }

      if (queueList) {
        if (queue.length > 0) {
          queueList.style.display = 'flex';
          queueList.innerHTML = queue
            .slice(0, 6)
            .map((item) => this.renderSpeiItem(item))
            .join('');
          renderIcons(queueList);
        } else {
          queueList.style.display = 'none';
        }
      }
    } catch {}
  }

  private renderSpeiItem(item: SpeiQueueItem): string {
    const statusClass = item.status === 'matched' ? 'spei-item--matched' : item.status === 'failed' ? 'spei-item--failed' : 'spei-item--pending';
    return `
      <div class="spei-item ${statusClass}" data-ref="spei-item-${item.id}">
        <div class="spei-item__info">
          <span class="spei-item__tracking">${escapeHtml(item.tracking_key)}</span>
          <span class="spei-item__meta">${escapeHtml(item.customer_name)} &bull; $${item.expected_amount.toFixed(2)} &bull; Intentos: ${item.attempts}/${item.max_attempts}</span>
        </div>
        <span class="spei-item__status spei-item__status--${item.status}">${item.status.toUpperCase()}</span>
      </div>
    `;
  }

  private renderTableRow(order: AdminOrder): string {
    const badge = getStatusBadge(order.status);
    const hasReceipt = Boolean(order.receipt_url);
    const hasTracking = Boolean(order.tracking_key);
    const isActionable = order.status === 'in_review' || order.status === 'pending_payment';

    const numbersPreview = order.ticket_numbers.slice(0, 4).join(', ');
    const moreTickets = order.ticket_numbers.length > 4 ? ` +${order.ticket_numbers.length - 4}` : '';

    return `
      <tr class="order-row" data-ref="order-row-${order.uuid}">
        <td class="order-cell-ref">
          <span class="order-ref-main">${escapeHtml(order.concept_reference)}</span>
          <span class="order-cell-sub">${order.uuid.substring(0, 8)}...</span>
        </td>
        <td class="order-cell-customer">
          <span class="order-customer-name">${escapeHtml(order.customer_name)}</span>
          <span class="order-cell-sub">${escapeHtml(order.customer_phone)}</span>
        </td>
        <td class="order-cell-giveaway">
          <span class="order-giveaway-title" title="${escapeHtml(order.giveaway_title)}">${escapeHtml(order.giveaway_title)}</span>
        </td>
        <td class="order-cell-tickets">
          <span class="order-tickets-count">${order.ticket_count} boletos</span>
          <span class="order-cell-sub">${escapeHtml(numbersPreview)}${moreTickets}</span>
        </td>
        <td class="order-cell-amount">
          <span class="order-amount-text">$${order.total_amount.toFixed(2)}</span>
          <span class="order-cell-sub">${escapeHtml(order.currency)}</span>
        </td>
        <td class="order-cell-status">
          <span class="order-badge" style="background-color: ${badge.bg}; color: ${badge.color};">
            ${badge.label}
          </span>
        </td>
        <td class="order-cell-receipt">
          ${hasReceipt ? `
            <button type="button" class="component-button component-button--h32 component-button--secondary btn-view-receipt" data-ref="btn-view-receipt-${order.uuid}" data-uuid="${order.uuid}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
              <span>Ver</span>
            </button>
          ` : hasTracking ? `
            <span class="order-cell-sub" title="${escapeHtml(order.tracking_key)}">${escapeHtml(order.tracking_key)}</span>
          ` : `
            <span class="order-cell-sub">Sin comprobante</span>
          `}
        </td>
        <td class="order-cell-actions">
          ${isActionable ? `
            <button type="button" class="component-button component-button--h32 component-button--green btn-action-approve" data-ref="btn-approve-${order.uuid}" data-uuid="${order.uuid}" data-tooltip="Aprobar pago" aria-label="Aprobar pago">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check"></use></svg>
            </button>
            <button type="button" class="component-button component-button--h32 component-button--danger btn-action-cancel" data-ref="btn-cancel-${order.uuid}" data-uuid="${order.uuid}" data-tooltip="Rechazar y liberar boletos" aria-label="Rechazar y liberar boletos">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
            </button>
          ` : `
            <span class="order-cell-sub">-</span>
          `}
        </td>
      </tr>
    `;
  }

  private openReceiptModal(order: AdminOrder): void {
    this.selectedOrder = order;
    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-receipt"]');
    const titleRef = this.element.querySelector<HTMLElement>('[data-ref="receipt-modal-ref"]');
    const badge = this.element.querySelector<HTMLElement>('[data-ref="receipt-modal-status-badge"]');
    const img = this.element.querySelector<HTMLImageElement>('[data-ref="receipt-modal-img"]');
    const btnFull = this.element.querySelector<HTMLAnchorElement>('[data-ref="btn-receipt-open-full"]');
    const customerEl = this.element.querySelector<HTMLElement>('[data-ref="receipt-detail-customer"]');
    const phoneEl = this.element.querySelector<HTMLElement>('[data-ref="receipt-detail-phone"]');
    const giveawayEl = this.element.querySelector<HTMLElement>('[data-ref="receipt-detail-giveaway"]');
    const ticketsEl = this.element.querySelector<HTMLElement>('[data-ref="receipt-detail-tickets"]');
    const amountEl = this.element.querySelector<HTMLElement>('[data-ref="receipt-detail-amount"]');
    const trackingEl = this.element.querySelector<HTMLElement>('[data-ref="receipt-detail-tracking"]');
    const bankRefEl = this.element.querySelector<HTMLElement>('[data-ref="receipt-detail-bank-ref"]');
    const dateEl = this.element.querySelector<HTMLElement>('[data-ref="receipt-detail-date"]');
    const errorBanner = this.element.querySelector<HTMLElement>('[data-ref="modal-receipt-error"]');

    if (errorBanner) {
      errorBanner.style.display = 'none';
      errorBanner.textContent = '';
    }

    if (titleRef) titleRef.textContent = order.concept_reference;
    if (badge) {
      const b = getStatusBadge(order.status);
      badge.textContent = b.label;
      badge.style.backgroundColor = b.bg;
      badge.style.color = b.color;
    }

    if (img) {
      img.src = order.receipt_url || '';
    }
    if (btnFull) {
      btnFull.href = order.receipt_url || '#';
      btnFull.style.display = order.receipt_url ? 'inline-flex' : 'none';
    }

    if (customerEl) customerEl.textContent = order.customer_name;
    if (phoneEl) phoneEl.textContent = order.customer_phone;
    if (giveawayEl) giveawayEl.textContent = order.giveaway_title;
    if (ticketsEl) ticketsEl.textContent = `${order.ticket_count} boletos (${order.ticket_numbers.join(', ')})`;
    if (amountEl) amountEl.textContent = `$${order.total_amount.toFixed(2)} ${order.currency}`;
    if (trackingEl) trackingEl.textContent = order.tracking_key || 'No especificada';
    if (bankRefEl) bankRefEl.textContent = order.bank_reference || 'No especificada';
    if (dateEl) dateEl.textContent = new Date(order.created_at).toLocaleString();

    const isActionable = order.status === 'in_review' || order.status === 'pending_payment';
    const actionsBox = this.element.querySelector<HTMLElement>('[data-ref="receipt-modal-actions"]');
    if (actionsBox) {
      actionsBox.style.display = isActionable ? 'flex' : 'none';
    }

    if (modal) {
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('is-visible'));
    }
  }

  private closeReceiptModal(): void {
    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-receipt"]');
    if (modal) {
      modal.classList.remove('is-visible');
      setTimeout(() => {
        modal.style.display = 'none';
        this.selectedOrder = null;
      }, 200);
    }
  }

  private async handleDirectApprove(uuid: string, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    try {
      const res = await approveAdminOrder(uuid);
      if (res.success) {
        await Promise.all([this.loadOrders(), this.loadSpeiQueue()]);
      } else {
        alert(res.error || 'Error al aprobar la orden.');
      }
    } finally {
      btn.disabled = false;
    }
  }

  private async handleDirectCancel(uuid: string, btn: HTMLButtonElement): Promise<void> {
    const confirmed = window.confirm('¿Estás seguro de cancelar esta orden y liberar los boletos al stock disponible?');
    if (!confirmed) return;

    btn.disabled = true;
    try {
      const res = await cancelAdminOrder(uuid);
      if (res.success) {
        await Promise.all([this.loadOrders(), this.loadSpeiQueue()]);
      } else {
        alert(res.error || 'Error al cancelar la orden.');
      }
    } finally {
      btn.disabled = false;
    }
  }

  private async handleModalApprove(uuid: string, btn: HTMLButtonElement): Promise<void> {
    const errorBanner = this.element.querySelector<HTMLElement>('[data-ref="modal-receipt-error"]');
    if (errorBanner) {
      errorBanner.style.display = 'none';
      errorBanner.textContent = '';
    }

    btn.disabled = true;
    btn.classList.add('is-loading');

    try {
      const res = await approveAdminOrder(uuid);
      if (res.success) {
        this.closeReceiptModal();
        await Promise.all([this.loadOrders(), this.loadSpeiQueue()]);
      } else if (errorBanner) {
        errorBanner.textContent = res.error || 'Error al aprobar la orden.';
        errorBanner.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }

  private async handleModalCancel(uuid: string, btn: HTMLButtonElement): Promise<void> {
    const confirmed = window.confirm('¿Estás seguro de cancelar esta orden y liberar los boletos al stock disponible?');
    if (!confirmed) return;

    const errorBanner = this.element.querySelector<HTMLElement>('[data-ref="modal-receipt-error"]');
    if (errorBanner) {
      errorBanner.style.display = 'none';
      errorBanner.textContent = '';
    }

    btn.disabled = true;
    btn.classList.add('is-loading');

    try {
      const res = await cancelAdminOrder(uuid);
      if (res.success) {
        this.closeReceiptModal();
        await Promise.all([this.loadOrders(), this.loadSpeiQueue()]);
      } else if (errorBanner) {
        errorBanner.textContent = res.error || 'Error al cancelar la orden.';
        errorBanner.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }
}

export async function createOrdersView(): Promise<HTMLElement> {
  const element = await loadTemplate('/views/orders/orders.html');
  const controller = new OrdersViewController(element);
  await controller.init();
  (element as any).__controller = controller;
  return element;
}
