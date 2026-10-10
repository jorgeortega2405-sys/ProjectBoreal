import { openBankInfoModal } from '../components/bank-info-modal.component.js';
import { openModal } from '../components/modal.component.js';
import { t } from '../services/i18n.service.js';
import { fetchBankAccountsApi, fetchOrderDetailApi, lookupOrdersApi, uploadReceiptApi } from '../services/orders.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { Order } from '../types/order.types.js';
import { escapeHtml, removeEmptyState, renderEmptyState } from '../utils/dom.util.js';
import { formatCurrency, formatNumber } from '../utils/number.util.js';
import { formatMexicanPhone, normalizeMexicanPhone } from '../utils/phone.util.js';

export class ValidatePaymentController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private countdownTimer: number | null = null;
  private initialOrderUuid: string | null = null;
  private orders: Order[] = [];

  constructor(container: HTMLElement, initialOrderUuid?: string) {
    this.container = container;
    this.initialOrderUuid = initialOrderUuid || null;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();

    const urlParams = new URLSearchParams(window.location.search);
    const orderUuid = this.initialOrderUuid || urlParams.get('order');
    const phoneParam = urlParams.get('phone');
    if (phoneParam) {
      const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-phone-search"]');
      if (input) {
        input.value = formatMexicanPhone(phoneParam);
        void this.searchOrders(phoneParam);
      }
    } else if (orderUuid) {
      void this.loadOrderByUuid(orderUuid);
    } else {
      try {
        const savedPhone = localStorage.getItem('boreal_phone');
        if (savedPhone) {
          const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-phone-search"]');
          if (input) {
            input.value = formatMexicanPhone(savedPhone);
            void this.searchOrders(savedPhone);
          }
        }
      } catch (_) {}
    }
  }

  private async loadOrderByUuid(uuid: string): Promise<void> {
    const order = await fetchOrderDetailApi(uuid);
    if (!order) {
      showToast(t('validate_payment.err_order_not_found'), 'warning');
      return;
    }

    let phone = order.customer_phone || '';
    if (phone.includes('*')) {
      try {
        const local = localStorage.getItem('boreal_phone') || '';
        if (local && !local.includes('*')) {
          phone = local;
        }
      } catch (_) {}
    }

    if (phone && !phone.includes('*')) {
      const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-phone-search"]');
      if (input) {
        input.value = formatMexicanPhone(phone);
      }
      try {
        localStorage.setItem('boreal_phone', phone);
      } catch (_) {}
      await this.searchOrders(phone);
    }

    if (!this.orders.some((o) => o.uuid === order.uuid)) {
      this.orders.unshift(order);
      this.renderOrders();
    }

    if (order.status === 'pending_payment') {
      const now = new Date().getTime();
      const expiresAt = new Date(order.expires_at).getTime();
      if (expiresAt > now) {
        this.openUploadReceiptModal(order.uuid);
      }
    }
  }

  private async searchOrders(phone: string): Promise<void> {
    let cleanPhone = normalizeMexicanPhone(phone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      const rawDigits = phone.replace(/\D/g, '');
      if (rawDigits.length >= 10 && rawDigits.length <= 15) {
        cleanPhone = rawDigits;
      }
    }
    if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 15) {
      showToast(t('validate_payment.err_phone_invalid'), 'warning');
      return;
    }

    this.orders = await lookupOrdersApi(cleanPhone);
    for (const order of this.orders) {
      if (order.status === 'completed' && order.giveaway_uuid) {
        try {
          localStorage.removeItem('boreal_pending_order_' + order.giveaway_uuid);
        } catch {}
      }
    }
    this.renderOrders();
    this.startCountdown();
  }

  private renderOrders(): void {
    const listContainer = this.container.querySelector<HTMLElement>('[data-ref="orders-list-container"]');
    if (!listContainer) return;

    if (this.orders.length === 0) {
      listContainer.innerHTML = '';
      renderEmptyState({
        container: listContainer,
        dataRef: 'orders-empty-state',
        desc: t('validate_payment.no_orders_found') || 'No se encontraron apartados ni compras con este número de teléfono.',
        graphicType: 'receipt',
        title: t('validate_payment.no_orders_title') || 'Sin boletos registrados',
      });
      return;
    }

    removeEmptyState(listContainer, 'orders-empty-state');
    const sortedOrders = [...this.orders].sort((a, b) => {
      const aWinner = a.is_winner === 1 ? 1 : 0;
      const bWinner = b.is_winner === 1 ? 1 : 0;
      if (aWinner !== bWinner) {
        return bWinner - aWinner;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const noticeBannerHtml = `
      <div class="validate-orders__notice" data-ref="validate-notice-time">
        <svg class="component-icon validate-orders__notice-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
        <span class="validate-orders__notice-text" data-ref="text-estimate-notice">${t('validate_payment.estimated_validation_time')}</span>
      </div>
    `;

    const ordersCardsHtml = sortedOrders
      .map((order) => {
        const isWinner = order.is_winner === 1;
        const winnerBannerHtml = isWinner
          ? `
            <div class="winner-congrats-card" data-ref="winner-banner-${order.uuid}">
              <div class="winner-congrats-card__title" data-ref="winner-title-${order.uuid}">
                <span>🏆</span>
                <span>${t('validate_payment.winner_banner_title')}</span>
              </div>
              ${escapeHtml(t('validate_payment.winner_banner_desc', { ticket: String(order.winner_ticket_number || ''), title: order.giveaway_title || '' }))}
              <div class="winner-congrats-card__info" data-ref="winner-info-${order.uuid}">
                ${t('validate_payment.winner_contact_info')}
              </div>
            </div>
          `
          : '';

        const ticketChips = order.ticket_numbers
          .map((n) => {
            const isThisWinningTicket = isWinner && order.winner_ticket_number === n;
            if (isThisWinningTicket) {
              return `<span class="giveaway-ticket giveaway-ticket--winner is-winner" data-ref="chip-winner-${n}">★ #${n.toString().padStart(3, '0')}</span>`;
            }
            return `<span class="giveaway-ticket giveaway-ticket--chip is-selected" data-ref="chip-ticket-${n}">#${n.toString().padStart(3, '0')}</span>`;
          })
          .join('');

        let badgeHtml = '';
        let actionBtnHtml = '';
        const now = new Date().getTime();
        const expiresAt = new Date(order.expires_at).getTime();
        const diffSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

        if (isWinner) {
          badgeHtml = `
            <span class="giveaway-badge giveaway-badge--winner" data-ref="badge-winner-${order.uuid}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#stars"></use></svg>
              <span>${t('validate_payment.winner_badge')}</span>
            </span>
          `;
        } else if (order.giveaway_status === 'completed') {
          badgeHtml = `
            <span class="giveaway-badge giveaway-badge--muted" data-ref="badge-not-winner-${order.uuid}">
              <span>${t('validate_payment.status_not_winner')}</span>
            </span>
          `;
        } else if (order.status === 'completed') {
          badgeHtml = `
            <span class="giveaway-badge giveaway-badge--active" data-ref="badge-completed-${order.uuid}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>
              <span>${t('validate_payment.status_completed')} • ${t('validate_payment.status_awaiting_draw')}</span>
            </span>
          `;
        } else if (order.status === 'in_review') {
          badgeHtml = `
            <span class="giveaway-badge giveaway-badge--info" data-ref="badge-review-${order.uuid}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
              <span>${t('validate_payment.status_in_review')}</span>
            </span>
          `;
        } else if (order.status === 'pending_payment') {
          if (diffSeconds > 0) {
            const mins = Math.floor(diffSeconds / 60);
            const secs = diffSeconds % 60;
            const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
            badgeHtml = `
              <span class="giveaway-badge giveaway-badge--warning" data-ref="badge-timer-${order.uuid}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
                <span data-ref="timer-text-${order.uuid}">${t('validate_payment.time_left', { time: timeStr })}</span>
              </span>
            `;
            actionBtnHtml = `
              <button type="button" class="component-button component-button--secondary component-button--h36" data-ref="btn-accounts-${order.uuid}" data-uuid="${order.uuid}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
                <span>${t('validate_payment.view_accounts_btn')}</span>
              </button>
              <button type="button" class="component-button component-button--black component-button--h36" data-ref="btn-upload-${order.uuid}" data-uuid="${order.uuid}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#add_photo_alternate"></use></svg>
                <span>${t('validate_payment.upload_receipt_btn')}</span>
              </button>
            `;
          } else {
            badgeHtml = `
              <span class="giveaway-badge giveaway-badge--danger" data-ref="badge-expired-${order.uuid}">
                <span>${t('validate_payment.status_expired')}</span>
              </span>
            `;
          }
        } else {
          badgeHtml = `
            <span class="giveaway-badge" data-ref="badge-cancelled-${order.uuid}">
              <span>${t('validate_payment.status_cancelled')}</span>
            </span>
          `;
        }

        const reviewNoteHtml = order.status === 'in_review'
          ? `
            <div class="validate-order-card__review-note" data-ref="review-note-${order.uuid}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
              <span>${t('validate_payment.review_note')}</span>
            </div>
          `
          : '';

        return `
          <div class="validate-order-card${isWinner ? ' validate-order-card--winner' : ''}" data-ref="order-card-${order.uuid}">
            ${winnerBannerHtml}
            <div class="validate-order-card__header">
              <div class="validate-order-card__meta">
                <span class="validate-order-card__folio">${t('validate_payment.participant_label', { name: escapeHtml(order.customer_name) })}${order.customer_state ? ` (${escapeHtml(order.customer_state)})` : ''}</span>
                <h3 class="validate-order-card__title">${escapeHtml(order.giveaway_title || t('validate_payment.order_card_giveaway'))}</h3>
              </div>
              <div class="validate-order-card__actions">
                ${badgeHtml}
                ${actionBtnHtml}
              </div>
            </div>
            ${reviewNoteHtml}
            <div class="validate-order-card__tickets-box">
              <span class="validate-order-card__tickets-label">${t('validate_payment.reserved_tickets_label', { count: formatNumber(order.ticket_count) })}</span>
              <div class="validate-order-card__tickets-chips">
                ${ticketChips}
              </div>
            </div>

            <div class="validate-order-card__footer">
              <span class="validate-order-card__total-label">${t('validate_payment.total_label')}</span>
              <span class="validate-order-card__total-val">${formatCurrency(order.total_amount, order.currency)}</span>
            </div>
          </div>
        `;
      })
      .join('');

    listContainer.innerHTML = noticeBannerHtml + ordersCardsHtml;

    this.bindOrderActions();
  }

  private startCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    const hasPending = this.orders.some((o) => o.status === 'pending_payment');
    if (!hasPending) return;

    this.countdownTimer = window.setInterval(() => {
      const now = new Date().getTime();
      let pendingCount = 0;

      for (const order of this.orders) {
        if (order.status !== 'pending_payment') continue;
        const expiresAt = new Date(order.expires_at).getTime();
        const diffSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
        const timerTextEl = this.container.querySelector<HTMLElement>(`[data-ref="timer-text-${order.uuid}"]`);

        if (diffSeconds > 0) {
          pendingCount++;
          if (timerTextEl) {
            const mins = Math.floor(diffSeconds / 60);
            const secs = diffSeconds % 60;
            timerTextEl.textContent = t('validate_payment.time_left', {
              time: `${mins}:${secs.toString().padStart(2, '0')}`,
            });
          }
        } else {
          order.status = 'expired';
          this.renderOrders();
        }
      }

      if (pendingCount === 0 && this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    }, 1000);
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;
    const searchBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-search-orders"]');
    const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-phone-search"]');

    searchBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (input) void this.searchOrders(input.value);
      },
      { signal }
    );

    input?.addEventListener(
      'input',
      () => {
        input.value = formatMexicanPhone(input.value);
      },
      { signal }
    );

    input?.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void this.searchOrders(input.value);
        }
      },
      { signal }
    );
  }

  private bindOrderActions(): void {
    const uploadBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-upload-"]');
    uploadBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        if (uuid) this.openUploadReceiptModal(uuid);
      });
    });

    const accountsBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-accounts-"]');
    accountsBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        if (uuid) {
          const order = this.orders.find((o) => o.uuid === uuid);
          if (order) void this.openBankInfoModal(order);
        }
      });
    });
  }

  private openUploadReceiptModal(orderUuid: string): void {
    const order = this.orders.find((o) => o.uuid === orderUuid);
    if (!order) return;

    let selectedBase64 = '';

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div class="upload-receipt-box" data-ref="modal-upload-box">
        <p class="upload-receipt-box__desc" data-ref="modal-upload-desc">${t('validate_payment.modal_upload_desc')}</p>

        <label class="field receipt-dropzone" data-ref="field-receipt-drop">
          <svg class="component-icon receipt-dropzone__icon" data-ref="icon-drop-receipt" aria-hidden="true"><use href="/icons.svg#add_photo_alternate"></use></svg>
          <span class="receipt-dropzone__text" data-ref="text-drop-receipt">${t('validate_payment.drop_receipt_text')}</span>
          <input class="field__input receipt-dropzone__file-input" data-ref="file-input-receipt" type="file" accept="image/*,.pdf" />
        </label>

        <div class="receipt-preview-box is-hidden" data-ref="receipt-preview-box">
          <img class="receipt-preview-img" data-ref="receipt-preview-img" src="" alt="${t('validate_payment.receipt_alt')}" />
        </div>

        <label class="field" data-ref="field-tracking-key">
          <input class="field__input" data-ref="input-tracking-key" type="text" maxlength="40" placeholder=" " />
          <span class="field__label" data-ref="label-tracking-key">${t('validate_payment.tracking_key_label')}</span>
        </label>
      </div>
    `;

    const fileInput = modalBody.querySelector<HTMLInputElement>('[data-ref="file-input-receipt"]');
    const previewBox = modalBody.querySelector<HTMLElement>('[data-ref="receipt-preview-box"]');
    const previewImg = modalBody.querySelector<HTMLImageElement>('[data-ref="receipt-preview-img"]');
    const trackingInput = modalBody.querySelector<HTMLInputElement>('[data-ref="input-tracking-key"]');

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        selectedBase64 = ev.target?.result as string;
        if (previewBox && previewImg) {
          previewImg.src = selectedBase64;
          previewBox.classList.remove('is-hidden');
        }
      };
      reader.readAsDataURL(file);
    });

    const modal = openModal({
      bodyHtml: modalBody,
      cancelText: t('common.cancel'),
      confirmClass: 'component-button--black',
      confirmText: t('validate_payment.submit_receipt_btn'),
      description: t('validate_payment.modal_upload_summary', { amount: formatCurrency(order.total_amount, order.currency), name: order.customer_name }),
      onConfirm: async () => {
        if (!selectedBase64) {
          modal.setError(t('validate_payment.err_select_receipt'));
          return false;
        }

        modal.setError('');
        const trackingKey = trackingInput?.value.trim() || undefined;

        const res = await uploadReceiptApi({
          imageBase64: selectedBase64,
          orderUuid: order.uuid,
          trackingKey,
        });

        if (!res.success) {
          modal.setError(res.error || t('validate_payment.err_upload_failed'));
          return false;
        }

        showToast(t('validate_payment.receipt_success'), 'info');
        modal.close();

        const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-phone-search"]');
        if (input) void this.searchOrders(input.value);
        return true;
      },
      size: 'md',
      title: t('validate_payment.modal_upload_title'),
    });
  }

  private async openBankInfoModal(order: Order): Promise<void> {
    const bankAccounts = await fetchBankAccountsApi(order.giveaway_uuid);
    openBankInfoModal({
      bankAccounts,
      onUploadReceipt: () => this.openUploadReceiptModal(order.uuid),
      order,
    });
  }

  destroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createValidatePaymentView(initialOrderUuid?: string): Promise<HTMLElement> {
  const container = await loadTemplate('/views/payment/validate-payment.html');
  const controller = new ValidatePaymentController(container, initialOrderUuid);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
