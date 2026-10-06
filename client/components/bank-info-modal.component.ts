import { t } from '../services/i18n.service.js';
import { showToast } from '../services/toast.service.js';
import { BankAccount, Order } from '../types/order.types.js';
import { escapeHtml } from '../utils/dom.util.js';
import { formatCurrency } from '../utils/number.util.js';
import { openModal } from './modal.component.js';

export interface BankInfoModalOptions {
  bankAccounts: BankAccount[];
  onUploadReceipt?: () => void;
  order: Order;
}

export function openBankInfoModal(options: BankInfoModalOptions): void {
  const { bankAccounts, onUploadReceipt, order } = options;
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
    size: 'split',
  });

  const uploadBtn = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-modal-upload-receipt"]');
  const closeSplitBtn = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-modal-close-split"]');

  uploadBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (timerInterval) clearInterval(timerInterval);
    modal.close();
    if (typeof onUploadReceipt === 'function') {
      onUploadReceipt();
    }
  });

  closeSplitBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (timerInterval) clearInterval(timerInterval);
    modal.close();
  });

  const countdownEl = modalBody.querySelector<HTMLElement>('[data-ref="spei-timer-countdown"]');
  const expiresAt = new Date(order.expires_at).getTime();

  timerInterval = window.setInterval(() => {
    const now = new Date().getTime();
    const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
    if (diff > 0) {
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      if (countdownEl) {
        countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    } else {
      if (countdownEl) {
        countdownEl.textContent = '00:00';
      }
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  }, 1000);
}
