import { BankAccount, CreateBankAccountInput, GiveawayOption, UpdateBankAccountInput } from '../types/bank-accounts.types.js';
import { createBankAccount, deleteBankAccount, fetchBankAccounts, fetchGiveawaysForAssignment, toggleBankAccount, updateBankAccount } from '../services/bank-accounts.service.js';
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

class BankAccountsViewController implements ViewController {
  private abortController: AbortController | null = null;
  private accounts: BankAccount[] = [];
  private availableGiveaways: GiveawayOption[] = [];
  private editingAccountUuid: string | null = null;
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    renderIcons(this.element);
    await Promise.all([this.loadAccounts(), this.loadGiveaways()]);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const btnCreate = this.element.querySelector<HTMLElement>('[data-ref="btn-create-account"]');
    btnCreate?.addEventListener(
      'click',
      () => {
        this.openModal();
      },
      { signal }
    );

    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-bank-account"]');
    const btnClose = this.element.querySelector<HTMLElement>('[data-ref="btn-close-account-modal"]');
    const btnCancel = this.element.querySelector<HTMLElement>('[data-ref="btn-cancel-account-modal"]');

    btnClose?.addEventListener(
      'click',
      () => {
        this.closeModal();
      },
      { signal }
    );

    btnCancel?.addEventListener(
      'click',
      () => {
        this.closeModal();
      },
      { signal }
    );

    modal?.addEventListener(
      'click',
      (e) => {
        if (e.target === modal) {
          this.closeModal();
        }
      },
      { signal }
    );

    const btnSave = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-save-account"]');
    btnSave?.addEventListener(
      'click',
      async () => {
        await this.handleSave(btnSave);
      },
      { signal }
    );

    const grid = this.element.querySelector<HTMLElement>('[data-ref="accounts-grid"]');
    grid?.addEventListener(
      'click',
      async (e) => {
        const target = e.target as HTMLElement;

        const btnEdit = target.closest<HTMLElement>('.btn-edit-account');
        if (btnEdit) {
          const uuid = btnEdit.getAttribute('data-uuid');
          const account = this.accounts.find((a) => a.uuid === uuid);
          if (account) {
            this.openModal(account);
          }
          return;
        }

        const btnToggle = target.closest<HTMLButtonElement>('.btn-toggle-account');
        if (btnToggle) {
          const uuid = btnToggle.getAttribute('data-uuid');
          const currentActive = btnToggle.getAttribute('data-active') === '1';
          if (uuid) {
            btnToggle.disabled = true;
            try {
              const res = await toggleBankAccount(uuid, !currentActive);
              if (res.success) {
                await this.loadAccounts();
              } else {
                alert(res.error || 'No se pudo cambiar el estado de la cuenta.');
              }
            } finally {
              btnToggle.disabled = false;
            }
          }
          return;
        }

        const btnDelete = target.closest<HTMLButtonElement>('.btn-delete-account');
        if (btnDelete) {
          const uuid = btnDelete.getAttribute('data-uuid');
          if (uuid) {
            const confirmed = window.confirm('¿Estás seguro de eliminar esta cuenta bancaria?');
            if (!confirmed) return;
            btnDelete.disabled = true;
            try {
              const res = await deleteBankAccount(uuid);
              if (res.success) {
                await this.loadAccounts();
              } else {
                alert(res.error || 'No se pudo eliminar la cuenta bancaria.');
              }
            } finally {
              btnDelete.disabled = false;
            }
          }
          return;
        }
      },
      { signal }
    );
  }

  private async loadAccounts(): Promise<void> {
    const skeleton = this.element.querySelector<HTMLElement>('[data-ref="accounts-skeleton"]');
    const emptyState = this.element.querySelector<HTMLElement>('[data-ref="accounts-empty"]');
    const grid = this.element.querySelector<HTMLElement>('[data-ref="accounts-grid"]');

    if (skeleton) skeleton.style.display = 'flex';
    if (grid) grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';

    try {
      this.accounts = await fetchBankAccounts();

      if (skeleton) skeleton.style.display = 'none';

      if (this.accounts.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
      }

      if (grid) {
        grid.innerHTML = this.accounts.map((a) => this.renderAccountCard(a)).join('');
        renderIcons(grid);
        grid.style.display = 'grid';
      }
    } catch {
      if (skeleton) skeleton.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
    }
  }

  private async loadGiveaways(): Promise<void> {
    try {
      this.availableGiveaways = await fetchGiveawaysForAssignment();
    } catch {
      this.availableGiveaways = [];
    }
  }

  private renderAccountCard(account: BankAccount): string {
    const isActive = Boolean(account.is_active);
    const assignedGiveaways = account.giveaways || [];

    return `
      <div class="bank-account-card ${isActive ? 'is-active' : 'is-inactive'}" data-ref="account-card-${account.uuid}">
        <div class="bank-account-card__top">
          <div class="bank-account-card__bank-info">
            <div class="bank-account-card__icon-box">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
            </div>
            <div class="bank-account-card__names">
              <h3 class="bank-account-card__bank-name">${escapeHtml(account.bank_name)}</h3>
              <span class="bank-account-card__type-tag">${account.account_type.toUpperCase()} &bull; ${escapeHtml(account.currency)}</span>
            </div>
          </div>
          <span class="bank-account-card__status-badge ${isActive ? 'badge--active' : 'badge--inactive'}">
            ${isActive ? 'Activa' : 'Inactiva'}
          </span>
        </div>

        <div class="bank-account-card__body">
          <div class="account-data-row">
            <span class="account-data-label">Titular:</span>
            <span class="account-data-value">${escapeHtml(account.account_holder)}</span>
          </div>

          ${account.clabe ? `
            <div class="account-data-row">
              <span class="account-data-label">CLABE (SPEI):</span>
              <span class="account-data-value account-data-value--mono">${escapeHtml(account.clabe)}</span>
            </div>
          ` : ''}

          ${account.card_number ? `
            <div class="account-data-row">
              <span class="account-data-label">Tarjeta:</span>
              <span class="account-data-value account-data-value--mono">${escapeHtml(account.card_number)}</span>
            </div>
          ` : ''}

          ${account.account_number ? `
            <div class="account-data-row">
              <span class="account-data-label">No. Cuenta:</span>
              <span class="account-data-value">${escapeHtml(account.account_number)}</span>
            </div>
          ` : ''}
        </div>

        <div class="bank-account-card__giveaways">
          <span class="account-giveaways-title">Sorteos Asignados:</span>
          ${assignedGiveaways.length > 0 ? `
            <div class="account-giveaways-tags">
              ${assignedGiveaways.map((g) => `<span class="giveaway-pill-tag">${escapeHtml(g.title)}</span>`).join('')}
            </div>
          ` : `
            <span class="account-giveaways-empty">Aplica como cuenta general para todos los sorteos</span>
          `}
        </div>

        <div class="bank-account-card__actions">
          <button type="button" class="component-button component-button--h36 component-button--secondary btn-edit-account" data-ref="btn-edit-${account.uuid}" data-uuid="${account.uuid}">
            <svg class="component-icon component-button__icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
            <span>Editar</span>
          </button>
          <button type="button" class="component-button component-button--h36 component-button--secondary btn-toggle-account" data-ref="btn-toggle-${account.uuid}" data-uuid="${account.uuid}" data-active="${account.is_active}">
            <svg class="component-icon component-button__icon" aria-hidden="true"><use href="/icons.svg#sync"></use></svg>
            <span>${isActive ? 'Desactivar' : 'Activar'}</span>
          </button>
          <button type="button" class="component-button component-button--h36 component-button--danger btn-delete-account" data-ref="btn-delete-${account.uuid}" data-uuid="${account.uuid}" data-tooltip="Eliminar cuenta" aria-label="Eliminar cuenta">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>
          </button>
        </div>
      </div>
    `;
  }

  private openModal(account?: BankAccount): void {
    this.editingAccountUuid = account?.uuid || null;

    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-bank-account"]');
    const title = this.element.querySelector<HTMLElement>('[data-ref="modal-account-title"]');
    const subtitle = this.element.querySelector<HTMLElement>('[data-ref="modal-account-subtitle"]');
    const errorBanner = this.element.querySelector<HTMLElement>('[data-ref="modal-account-error"]');

    const inputBank = this.element.querySelector<HTMLInputElement>('[data-ref="input-bank-name"]');
    const inputHolder = this.element.querySelector<HTMLInputElement>('[data-ref="input-account-holder"]');
    const selectType = this.element.querySelector<HTMLSelectElement>('[data-ref="select-account-type"]');
    const selectCurrency = this.element.querySelector<HTMLSelectElement>('[data-ref="select-currency"]');
    const inputClabe = this.element.querySelector<HTMLInputElement>('[data-ref="input-clabe"]');
    const inputCard = this.element.querySelector<HTMLInputElement>('[data-ref="input-card-number"]');
    const inputAccNum = this.element.querySelector<HTMLInputElement>('[data-ref="input-account-number"]');
    const checkActive = this.element.querySelector<HTMLInputElement>('[data-ref="check-is-active"]');
    const checklistBox = this.element.querySelector<HTMLElement>('[data-ref="checklist-giveaways"]');

    if (errorBanner) {
      errorBanner.style.display = 'none';
      errorBanner.textContent = '';
    }

    if (account) {
      if (title) title.textContent = 'Editar Cuenta Bancaria';
      if (subtitle) subtitle.textContent = 'Modifica los datos bancarios y asignación de sorteos.';
      if (inputBank) inputBank.value = account.bank_name;
      if (inputHolder) inputHolder.value = account.account_holder;
      if (selectType) selectType.value = account.account_type;
      if (selectCurrency) selectCurrency.value = account.currency;
      if (inputClabe) inputClabe.value = account.clabe || '';
      if (inputCard) inputCard.value = account.card_number || '';
      if (inputAccNum) inputAccNum.value = account.account_number || '';
      if (checkActive) checkActive.checked = Boolean(account.is_active);
    } else {
      if (title) title.textContent = 'Registrar Cuenta Bancaria';
      if (subtitle) subtitle.textContent = 'Ingresa los datos bancarios y asigna a qué sorteos estará disponible.';
      if (inputBank) inputBank.value = '';
      if (inputHolder) inputHolder.value = '';
      if (selectType) selectType.value = 'clabe';
      if (selectCurrency) selectCurrency.value = 'MXN';
      if (inputClabe) inputClabe.value = '';
      if (inputCard) inputCard.value = '';
      if (inputAccNum) inputAccNum.value = '';
      if (checkActive) checkActive.checked = true;
    }

    const assignedIds = new Set((account?.giveaways || []).map((g) => g.id));

    if (checklistBox) {
      if (this.availableGiveaways.length === 0) {
        checklistBox.innerHTML = '<span class="checklist-empty">No hay sorteos disponibles.</span>';
      } else {
        checklistBox.innerHTML = this.availableGiveaways
          .map(
            (g) => `
              <label class="giveaway-checkbox-item">
                <input type="checkbox" value="${g.id}" ${assignedIds.has(g.id) ? 'checked' : ''} />
                <span class="giveaway-checkbox-title">${escapeHtml(g.title)}</span>
                <span class="giveaway-checkbox-status">${g.status}</span>
              </label>
            `
          )
          .join('');
      }
    }

    if (modal) {
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('is-visible'));
    }
  }

  private closeModal(): void {
    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-bank-account"]');
    if (modal) {
      modal.classList.remove('is-visible');
      setTimeout(() => {
        modal.style.display = 'none';
        this.editingAccountUuid = null;
      }, 200);
    }
  }

  private async handleSave(btn: HTMLButtonElement): Promise<void> {
    const errorBanner = this.element.querySelector<HTMLElement>('[data-ref="modal-account-error"]');
    if (errorBanner) {
      errorBanner.style.display = 'none';
      errorBanner.textContent = '';
    }

    const inputBank = this.element.querySelector<HTMLInputElement>('[data-ref="input-bank-name"]');
    const inputHolder = this.element.querySelector<HTMLInputElement>('[data-ref="input-account-holder"]');
    const selectType = this.element.querySelector<HTMLSelectElement>('[data-ref="select-account-type"]');
    const selectCurrency = this.element.querySelector<HTMLSelectElement>('[data-ref="select-currency"]');
    const inputClabe = this.element.querySelector<HTMLInputElement>('[data-ref="input-clabe"]');
    const inputCard = this.element.querySelector<HTMLInputElement>('[data-ref="input-card-number"]');
    const inputAccNum = this.element.querySelector<HTMLInputElement>('[data-ref="input-account-number"]');
    const checkActive = this.element.querySelector<HTMLInputElement>('[data-ref="check-is-active"]');
    const checklistBox = this.element.querySelector<HTMLElement>('[data-ref="checklist-giveaways"]');

    const bankName = inputBank?.value.trim() || '';
    const accountHolder = inputHolder?.value.trim() || '';
    const accountType = (selectType?.value || 'clabe') as 'clabe' | 'card' | 'both';
    const currency = selectCurrency?.value || 'MXN';
    const clabe = inputClabe?.value.trim() || null;
    const cardNumber = inputCard?.value.trim() || null;
    const accountNumber = inputAccNum?.value.trim() || null;
    const isActive = Boolean(checkActive?.checked);

    if (!bankName) {
      this.showError('El nombre del banco es obligatorio.');
      return;
    }
    if (!accountHolder) {
      this.showError('El titular de la cuenta es obligatorio.');
      return;
    }
    if (accountType === 'clabe' && (!clabe || clabe.length !== 18)) {
      this.showError('La CLABE interbancaria debe contener exactamente 18 dígitos numéricos.');
      return;
    }
    if (accountType === 'card' && (!cardNumber || cardNumber.length < 15)) {
      this.showError('El número de tarjeta debe tener entre 15 y 16 dígitos.');
      return;
    }

    const selectedGiveawayIds: number[] = [];
    if (checklistBox) {
      const checkedInputs = checklistBox.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
      checkedInputs.forEach((chk) => selectedGiveawayIds.push(Number(chk.value)));
    }

    btn.disabled = true;
    btn.classList.add('is-loading');

    try {
      if (this.editingAccountUuid) {
        const updateData: UpdateBankAccountInput = {
          account_holder: accountHolder,
          account_number: accountNumber,
          account_type: accountType,
          bank_name: bankName,
          card_number: cardNumber,
          clabe,
          currency,
          giveaway_ids: selectedGiveawayIds,
          is_active: isActive,
        };
        const res = await updateBankAccount(this.editingAccountUuid, updateData);
        if (res.success) {
          this.closeModal();
          await this.loadAccounts();
        } else {
          this.showError(res.error || 'Error al actualizar la cuenta.');
        }
      } else {
        const createData: CreateBankAccountInput = {
          account_holder: accountHolder,
          account_number: accountNumber,
          account_type: accountType,
          bank_name: bankName,
          card_number: cardNumber,
          clabe,
          currency,
          giveaway_ids: selectedGiveawayIds,
          is_active: isActive,
        };
        const res = await createBankAccount(createData);
        if (res.success) {
          this.closeModal();
          await this.loadAccounts();
        } else {
          this.showError(res.error || 'Error al registrar la cuenta.');
        }
      }
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }

  private showError(msg: string): void {
    const errorBanner = this.element.querySelector<HTMLElement>('[data-ref="modal-account-error"]');
    if (errorBanner) {
      errorBanner.textContent = msg;
      errorBanner.style.display = 'block';
    }
  }
}

export async function createBankAccountsView(): Promise<HTMLElement> {
  const element = await loadTemplate('/views/bank-accounts/bank-accounts.html');
  const controller = new BankAccountsViewController(element);
  await controller.init();
  (element as any).__controller = controller;
  return element;
}
