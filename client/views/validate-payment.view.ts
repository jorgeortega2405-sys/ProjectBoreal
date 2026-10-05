import { openModal } from '../components/modal.component.js';
import { t } from '../services/i18n.service.js';
import { lookupOrdersApi, uploadReceiptApi } from '../services/orders.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { Order } from '../types/order.types.js';

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
  }

  private async searchOrders(phone: string): Promise<void> {
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 6) return;

    this.orders = await lookupOrdersApi(cleanPhone);
    this.renderOrders();
    this.startCountdown();
  }

  private renderOrders(): void {
    const listContainer = this.container.querySelector<HTMLElement>('[data-ref="orders-list-container"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="orders-empty-state"]');
    if (!listContainer || !emptyState) return;

    if (this.orders.length === 0) {
      listContainer.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    listContainer.innerHTML = this.orders
      .map((order) => {
        const isWinner = order.is_winner === 1;
        const winnerBannerHtml = isWinner
          ? `
            <div class="winner-congrats-card" style="margin-bottom: 4px; padding: 14px 18px; border-radius: 12px; background: linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(16, 185, 129, 0.18)); border: 1px solid rgba(245, 158, 11, 0.5); display: flex; flex-direction: column; gap: 4px;">
              <div style="font-size: 15px; font-weight: 800; color: #f59e0b; display: flex; align-items: center; gap: 8px;">
                <span>🏆</span>
                <span>${t('validate_payment.winner_banner_title')}</span>
              </div>
                ${escapeHtml(t('validate_payment.winner_banner_desc', { ticket: String(order.winner_ticket_number || ''), title: order.giveaway_title || '' }))}
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                ${t('validate_payment.winner_contact_info')}
              </div>
            </div>
          `
          : '';

        const ticketChips = order.ticket_numbers
          .map((n) => {
            const isThisWinningTicket = isWinner && order.winner_ticket_number === n;
            if (isThisWinningTicket) {
              return `<span class="giveaway-ticket is-winner" style="height: 34px; width: 66px; font-size: 12px; cursor: default; background: #f59e0b; color: #000000; font-weight: 800; border: 2px solid #fbbf24; box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);">★ #${n.toString().padStart(3, '0')}</span>`;
            }
            return `<span class="giveaway-ticket is-selected" style="height: 32px; width: 54px; font-size: 11.5px; cursor: default;">#${n.toString().padStart(3, '0')}</span>`;
          })
          .join('');

        let badgeHtml = '';
        let actionBtnHtml = '';
        const now = new Date().getTime();
        const expiresAt = new Date(order.expires_at).getTime();
        const diffSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

        if (isWinner) {
          badgeHtml = `
            <span class="giveaway-badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border-color: rgba(245, 158, 11, 0.5); font-size: 12px; font-weight: 700; padding: 6px 12px;">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#stars"></use></svg>
              <span>${t('validate_payment.winner_badge')}</span>
            </span>
          `;
        } else if (order.giveaway_status === 'completed') {
          badgeHtml = `
            <span class="giveaway-badge" style="background: rgba(107, 114, 128, 0.12); color: var(--text-secondary); border-color: var(--border-subtle); font-size: 12px; padding: 6px 12px;">
              <span>${t('validate_payment.status_not_winner')}</span>
            </span>
          `;
        } else if (order.status === 'completed') {
          badgeHtml = `
            <span class="giveaway-badge giveaway-badge--active" style="font-size: 12px; padding: 6px 12px;">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>
              <span>${t('validate_payment.status_completed')} • ${t('validate_payment.status_awaiting_draw')}</span>
            </span>
          `;
        } else if (order.status === 'in_review') {
          badgeHtml = `
            <span class="giveaway-badge" style="background: rgba(59, 130, 246, 0.12); color: #3b82f6; border-color: rgba(59, 130, 246, 0.3); font-size: 12px; padding: 6px 12px;">
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
              <span class="giveaway-badge" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); font-size: 12px; padding: 6px 12px;" data-ref="badge-timer-${order.uuid}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
                <span data-ref="timer-text-${order.uuid}">${t('validate_payment.time_left', { time: timeStr })}</span>
              </span>
            `;
            actionBtnHtml = `
              <button type="button" class="component-button component-button--black component-button--h36" data-ref="btn-upload-${order.uuid}" data-uuid="${order.uuid}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#add_photo_alternate"></use></svg>
                <span>${t('validate_payment.upload_receipt_btn')}</span>
              </button>
            `;
          } else {
            badgeHtml = `
              <span class="giveaway-badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.25); font-size: 12px; padding: 6px 12px;">
                <span>${t('validate_payment.status_expired')}</span>
              </span>
            `;
          }
        } else {
          badgeHtml = `
            <span class="giveaway-badge" style="font-size: 12px; padding: 6px 12px;">
              <span>${t('validate_payment.status_cancelled')}</span>
            </span>
          `;
        }

        return `
          <div class="card" data-ref="order-card-${order.uuid}" style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
            ${winnerBannerHtml}
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
              <div>
                <span style="font-size: 11.5px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px;">Folio: ${escapeHtml(order.concept_reference)} • ${escapeHtml(order.customer_name)}</span>
                <h3 style="font-size: 18px; font-weight: 700; margin: 4px 0 0 0; color: var(--text-primary);">${escapeHtml(order.giveaway_title || 'Sorteo')}</h3>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${badgeHtml}
                ${actionBtnHtml}
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <span style="font-size: 12.5px; color: var(--text-secondary); font-weight: 600;">Boletos apartados (${order.ticket_count}):</span>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${ticketChips}
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: baseline; padding-top: 10px; border-top: 1px solid var(--border-color); font-size: 13.5px;">
              <span style="color: var(--text-secondary);">Total:</span>
              <span style="font-size: 18px; font-weight: 800; color: var(--text-primary);">$${order.total_amount.toFixed(2)} ${escapeHtml(order.currency)}</span>
            </div>
          </div>
        `;
      })
      .join('');

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
  }

  private openUploadReceiptModal(orderUuid: string): void {
    const order = this.orders.find((o) => o.uuid === orderUuid);
    if (!order) return;

    let selectedBase64 = '';

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <p style="font-size: 13.5px; color: var(--text-secondary); margin: 0;">${t('validate_payment.modal_upload_desc')}</p>

        <!-- Dropzone -->
        <label class="field" data-ref="field-receipt-drop" style="border: 2px dashed var(--border-color); border-radius: 14px; padding: 24px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: var(--bg-surface-elevated); transition: border-color var(--sl-transition-fast);">
          <svg class="component-icon" aria-hidden="true" style="width: 32px; height: 32px; color: var(--text-tertiary);"><use href="/icons.svg#add_photo_alternate"></use></svg>
          <span style="font-size: 13px; font-weight: 500; color: var(--text-secondary);">${t('validate_payment.drop_receipt_text')}</span>
          <input class="field__input" data-ref="file-input-receipt" type="file" accept="image/*,.pdf" style="display: none;" />
        </label>

        <!-- Preview miniatura -->
        <div data-ref="receipt-preview-box" style="display: none; width: 100%; max-height: 180px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); position: relative;">
          <img data-ref="receipt-preview-img" src="" alt="Comprobante" style="width: 100%; height: 180px; object-fit: contain; background: #000000;" />
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
          previewBox.style.display = 'block';
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
      description: `Orden ${order.concept_reference} • Monto: $${order.total_amount.toFixed(2)} ${order.currency}`,
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
