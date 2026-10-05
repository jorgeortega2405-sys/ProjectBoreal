import { openModal } from '../components/modal.component.js';
import { t } from '../services/i18n.service.js';
import { fetchBankAccountsApi, fetchOrderDetailApi, lookupOrdersApi, uploadReceiptApi } from '../services/orders.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { BankAccount, Order } from '../types/order.types.js';
import { removeEmptyState, renderEmptyState } from '../utils/dom.util.js';
import { formatCurrency, formatNumber } from '../utils/number.util.js';
import { formatMexicanPhone, normalizeMexicanPhone } from '../utils/phone.util.js';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class ValidatePaymentController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private countdownTimer: number | null = null;
  private orders: Order[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();

    try {
      localStorage.removeItem('boreal_phone');
      localStorage.removeItem('boreal_name');
    } catch {}

    const urlParams = new URLSearchParams(window.location.search);
    const orderUuid = urlParams.get('order');
    const phoneParam = urlParams.get('phone');
    if (phoneParam) {
      const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-phone-search"]');
      if (input) {
        input.value = formatMexicanPhone(phoneParam);
        void this.searchOrders(phoneParam);
      }
    } else if (orderUuid) {
      void this.loadOrderByUuid(orderUuid);
    }
  }

  private async loadOrderByUuid(uuid: string): Promise<void> {
    const order = await fetchOrderDetailApi(uuid);
    if (order && order.customer_phone) {
      const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-phone-search"]');
      if (input) {
        input.value = formatMexicanPhone(order.customer_phone);
      }
      void this.searchOrders(order.customer_phone);
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
      showToast('Ingresa un número celular válido para buscar tus boletos.', 'warning');
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
                <span class="validate-order-card__folio">Participante: ${escapeHtml(order.customer_name)}${order.customer_state ? ` (${escapeHtml(order.customer_state)})` : ''}</span>
                <h3 class="validate-order-card__title">${escapeHtml(order.giveaway_title || 'Sorteo')}</h3>
              </div>
              <div class="validate-order-card__actions">
                ${badgeHtml}
                ${actionBtnHtml}
              </div>
            </div>
            ${reviewNoteHtml}
            <div class="validate-order-card__tickets-box">
              <span class="validate-order-card__tickets-label">Boletos apartados (${formatNumber(order.ticket_count)}):</span>
              <div class="validate-order-card__tickets-chips">
                ${ticketChips}
              </div>
            </div>

            <div class="validate-order-card__footer">
              <span class="validate-order-card__total-label">Total:</span>
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

        <!-- Dropzone -->
        <label class="field receipt-dropzone" data-ref="field-receipt-drop">
          <svg class="component-icon receipt-dropzone__icon" data-ref="icon-drop-receipt" aria-hidden="true"><use href="/icons.svg#add_photo_alternate"></use></svg>
          <span class="receipt-dropzone__text" data-ref="text-drop-receipt">${t('validate_payment.drop_receipt_text')}</span>
          <input class="field__input receipt-dropzone__file-input" data-ref="file-input-receipt" type="file" accept="image/*,.pdf" />
        </label>

        <!-- Preview miniatura -->
        <div class="receipt-preview-box is-hidden" data-ref="receipt-preview-box">
          <img class="receipt-preview-img" data-ref="receipt-preview-img" src="" alt="Comprobante" />
        </div>

        <!-- Clave de rastreo opcional -->
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

        if (trackingInput && !trackingInput.value) {
          const autoKey = `SPEI-${Date.now().toString().slice(-8)}`;
          trackingInput.value = autoKey;
        }
      };
      reader.readAsDataURL(file);
    });

    const modal = openModal({
      bodyHtml: modalBody,
      cancelText: t('common.cancel'),
      confirmClass: 'component-button--black',
      confirmText: t('validate_payment.submit_receipt_btn'),
      description: `Participante: ${order.customer_name} • Monto: ${formatCurrency(order.total_amount, order.currency)}`,
      onConfirm: async () => {
        if (!selectedBase64) {
          modal.setError('Por favor selecciona una imagen del comprobante bancario.');
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
          modal.setError(res.error || 'Error al enviar comprobante.');
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
    let timerInterval: number | null = null;

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
              <span>${t('validate_payment.upload_receipt_btn')}</span>
            </button>
            <button type="button" class="component-button component-button--ghost component-button--h38 component-button--w-full" data-ref="btn-modal-close-split">
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        <div class="payment-split__right" data-ref="payment-split-right">
          <div class="payment-split__section-header" data-ref="section-header-accounts">
            <h3 class="payment-split__section-title" data-ref="section-title-accounts">Cuentas bancarias autorizadas</h3>
            <p class="payment-split__section-desc" data-ref="section-desc-accounts">Transfiere el monto exacto a cualquiera de las siguientes cuentas:</p>
          </div>

          <div class="modal-bank-warning" data-ref="modal-bank-warning">
            <svg class="component-icon modal-bank-warning__icon" data-ref="icon-bank-warning" aria-hidden="true"><use href="/icons.svg#info"></use></svg>
            <div class="modal-bank-warning__content" data-ref="content-bank-warning">
              <strong class="modal-bank-warning__title" data-ref="title-bank-warning">${t('orders.bank_warning_title')}</strong>
              <p class="modal-bank-warning__text" data-ref="text-bank-warning">${t('orders.bank_warning_desc')}</p>
            </div>
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
        showToast(t('orders.copied') || '¡Copiado al portapapeles!', 'info');
      });
    });

    const modal = openModal({
      bodyHtml: modalBody,
      onClose: () => {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      },
      showCancel: false,
      showConfirm: false,
      size: 'split',
    });

    const uploadBtn = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-modal-upload-receipt"]');
    const closeSplitBtn = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-modal-close-split"]');

    uploadBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (timerInterval) clearInterval(timerInterval);
      modal.close();
      this.openUploadReceiptModal(order.uuid);
    });

    closeSplitBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (timerInterval) clearInterval(timerInterval);
      modal.close();
    });

    const countdownEl = modalBody.querySelector<HTMLElement>('[data-ref="spei-timer-countdown"]');
    const splitErrorEl = modalBody.querySelector<HTMLElement>('[data-ref="split-modal-error"]');
    const expiresAt = new Date(order.expires_at).getTime();

    const updateTimer = () => {
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
    };
    updateTimer();
    timerInterval = window.setInterval(updateTimer, 1000);
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

export async function createValidatePaymentView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/payment/validate-payment.html');
  const controller = new ValidatePaymentController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
