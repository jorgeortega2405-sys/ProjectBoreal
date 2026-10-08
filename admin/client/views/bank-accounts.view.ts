import { openModal } from '../components/modal.component.js';
import { deleteApi, getApi, patchApi, postApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';

interface BankAccountDetail {
  account_holder: string;
  account_number: string | null;
  account_type: 'clabe' | 'card' | 'both';
  active_giveaways_count: number;
  bank_name: string;
  card_number: string | null;
  clabe: string | null;
  created_at: string;
  currency: string;
  id: number;
  is_active: number;
  total_giveaways_count: number;
  updated_at: string;
  uuid: string;
}

interface BankAccountGiveawayAssignment {
  giveaway_id: number;
  giveaway_status: string;
  giveaway_title: string;
  giveaway_type: string;
  giveaway_uuid: string;
  is_active: boolean;
  is_assigned: boolean;
}

interface BankAccountsKpis {
  activeAccounts: number;
  giveawaysWithCoverageCount: number;
  inactiveAccounts: number;
  totalAccounts: number;
  uniqueBanksCount: number;
}

function formatCardNumber(card: string | null): string {
  if (!card) return '•••• ----';
  const clean = card.replace(/\D/g, '');
  if (clean.length >= 15) {
    return `${clean.slice(0, 4)} •••• •••• ${clean.slice(-4)}`;
  }
  return card;
}

export class BankAccountsController implements ViewController {
  private abortController: AbortController | null = null;
  private accounts: BankAccountDetail[] = [];
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnCreateAccount: HTMLButtonElement | null = null;
  private btnRefresh: HTMLButtonElement | null = null;
  private btnResetSearch: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-accounts"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    this.btnRefresh = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-accounts"]');
    this.btnCreateAccount = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-create-account"]');
    this.btnResetSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-search"]');

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
        void this.loadAccounts().finally(() => {
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
            void this.loadAccounts();
          }
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
          void this.loadAccounts();
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
        void this.loadAccounts();
        this.inputSearch?.focus();
      },
      { signal }
    );

    this.btnResetSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.inputSearch) this.inputSearch.value = '';
        if (this.btnClearSearch) this.btnClearSearch.style.display = 'none';
        this.searchQuery = '';
        void this.loadAccounts();
      },
      { signal }
    );

    this.btnCreateAccount?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.openCreateAccountModal();
      },
      { signal }
    );
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all([this.loadKpis(), this.loadAccounts()]);
  }

  private async loadKpis(): Promise<void> {
    try {
      const res = await getApi<BankAccountsKpis>('/api/bank-accounts/kpis');
      if (res.success && res.data) {
        const kpi = res.data;
        const elActive = this.container.querySelector('[data-ref="kpi-active-count"]');
        const elInactive = this.container.querySelector('[data-ref="kpi-inactive-count"]');
        const elBanks = this.container.querySelector('[data-ref="kpi-banks-count"]');
        const elCoverage = this.container.querySelector('[data-ref="kpi-coverage-count"]');

        if (elActive) elActive.textContent = String(kpi.activeAccounts);
        if (elInactive) elInactive.textContent = String(kpi.inactiveAccounts);
        if (elBanks) elBanks.textContent = String(kpi.uniqueBanksCount);
        if (elCoverage) elCoverage.textContent = String(kpi.giveawaysWithCoverageCount);
      }
    } catch (_) {}
  }

  private async loadAccounts(): Promise<void> {
    try {
      const queryParams = new URLSearchParams();
      if (this.searchQuery) {
        queryParams.set('search', this.searchQuery);
      }
      const res = await getApi<BankAccountDetail[]>(`/api/bank-accounts?${queryParams.toString()}`);
      if (res.success && Array.isArray(res.data)) {
        this.accounts = res.data;
        this.renderAccounts();
      } else {
        showToast(res.error || 'No se pudieron cargar las cuentas bancarias.', 'danger');
      }
    } catch (_) {
      showToast('Error de conexión al cargar cuentas bancarias.', 'danger');
    }
  }

  private renderAccounts(): void {
    const gridContainer = this.container.querySelector<HTMLElement>('[data-ref="bank-accounts-grid-container"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="bank-accounts-empty-state"]');

    if (!gridContainer) return;

    if (this.accounts.length === 0) {
      gridContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    gridContainer.innerHTML = this.accounts.map((acc) => this.buildAccountCardHtml(acc)).join('');
    renderIcons(gridContainer);
    this.attachCardEvents(gridContainer);
  }

  private buildAccountCardHtml(acc: BankAccountDetail): string {
    const isActive = Boolean(acc.is_active);
    const hasClabe = Boolean(acc.clabe);
    const hasCard = Boolean(acc.card_number);

    let typeLabel = 'CLABE';
    if (acc.account_type === 'card') typeLabel = 'Tarjeta Débito';
    else if (acc.account_type === 'both') typeLabel = 'CLABE + Tarjeta';

    const clabeHtml = hasClabe
      ? `
        <div class="bank-account-card__code-row">
          <div class="bank-account-card__code-info">
            <span class="bank-account-card__label">CLABE Interbancaria (18 dígitos):</span>
            <span class="bank-account-card__code-val" data-ref="clabe-val-${acc.uuid}">${escapeHtml(acc.clabe || '')}</span>
          </div>
          <button type="button" class="component-button component-button--secondary component-button--h32 component-button--icon-only" data-ref="btn-copy-clabe-${acc.uuid}" data-uuid="${acc.uuid}" data-clabe="${escapeHtml(acc.clabe || '')}" data-tooltip="Copiar CLABE" aria-label="Copiar CLABE">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
          </button>
        </div>
      `
      : '';

    const cardHtml = hasCard
      ? `
        <div class="bank-account-card__code-row">
          <div class="bank-account-card__code-info">
            <span class="bank-account-card__label">Número de Tarjeta:</span>
            <span class="bank-account-card__code-val" data-ref="card-val-${acc.uuid}">${escapeHtml(acc.card_number || '')}</span>
          </div>
          <button type="button" class="component-button component-button--secondary component-button--h32 component-button--icon-only" data-ref="btn-copy-card-${acc.uuid}" data-uuid="${acc.uuid}" data-card="${escapeHtml(acc.card_number || '')}" data-tooltip="Copiar Tarjeta" aria-label="Copiar Tarjeta">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
          </button>
        </div>
      `
      : '';

    return `
      <div class="bank-account-card ${!isActive ? 'bank-account-card--inactive' : ''}" data-ref="card-bank-${acc.uuid}" data-uuid="${acc.uuid}">
        <div class="bank-account-card__header">
          <div class="bank-account-card__brand">
            <div class="bank-account-card__icon-box">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#credit_card"></use></svg>
            </div>
            <div class="bank-account-card__title-box">
              <h3 class="bank-account-card__bank-name">${escapeHtml(acc.bank_name)}</h3>
              <span class="bank-account-card__type-pill">${typeLabel}</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="bank-account-card__status-dot ${isActive ? 'bank-account-card__status-dot--active' : 'bank-account-card__status-dot--inactive'}"></span>
            <span style="font-size: 12px; font-weight: 600; color: ${isActive ? '#10b981' : 'var(--text-secondary)'};">${isActive ? 'Activa' : 'Pausada'}</span>
          </div>
        </div>

        <div class="bank-account-card__body">
          <div class="bank-account-card__holder-box">
            <span class="bank-account-card__label">Titular de la cuenta:</span>
            <span class="bank-account-card__holder-name">${escapeHtml(acc.account_holder)}</span>
          </div>

          ${clabeHtml}
          ${cardHtml}

          <div class="bank-account-card__coverage-row">
            <span class="bank-account-card__coverage-badge">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
              <span>${acc.active_giveaways_count} sorteos con cuenta habilitada</span>
            </span>
            <button type="button" class="component-button component-button--secondary component-button--h28" data-ref="btn-manage-giveaways-${acc.uuid}" data-uuid="${acc.uuid}" style="font-size: 11.5px; padding: 0 10px;">
              <span>Gestionar Sorteos</span>
            </button>
          </div>
        </div>

        <div class="bank-account-card__footer">
          <div style="display: flex; align-items: center; gap: 8px;">
            <label class="switch-control" data-tooltip="${isActive ? 'Pausar cuenta' : 'Activar cuenta'}" aria-label="${isActive ? 'Pausar cuenta' : 'Activar cuenta'}">
              <input type="checkbox" ${isActive ? 'checked' : ''} data-ref="toggle-status-${acc.uuid}" data-uuid="${acc.uuid}" />
              <span class="switch-control__slider"></span>
            </label>
            <span style="font-size: 12px; color: var(--text-secondary);">${isActive ? 'En servicio' : 'Desactivada'}</span>
          </div>

          <div class="bank-account-card__actions">
            <button type="button" class="component-button component-button--secondary component-button--h34 component-button--icon-only" data-ref="btn-edit-account-${acc.uuid}" data-uuid="${acc.uuid}" data-tooltip="Editar cuenta" aria-label="Editar cuenta">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
            </button>
            <button type="button" class="component-button component-button--secondary component-button--h34 component-button--icon-only" data-ref="btn-delete-account-${acc.uuid}" data-uuid="${acc.uuid}" data-tooltip="Eliminar cuenta" aria-label="Eliminar cuenta" style="color: #ef4444;">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private attachCardEvents(container: HTMLElement): void {
    const copyClabeBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-copy-clabe-"]');
    copyClabeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const clabe = btn.getAttribute('data-clabe') || '';
        if (clabe) {
          void navigator.clipboard.writeText(clabe);
          showToast('CLABE interbancaria copiada al portapapeles.', 'success');
        }
      });
    });

    const copyCardBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-copy-card-"]');
    copyCardBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const card = btn.getAttribute('data-card') || '';
        if (card) {
          void navigator.clipboard.writeText(card);
          showToast('Número de tarjeta copiado al portapapeles.', 'success');
        }
      });
    });

    const toggleInputs = container.querySelectorAll<HTMLInputElement>('[data-ref^="toggle-status-"]');
    toggleInputs.forEach((input) => {
      input.addEventListener('change', async () => {
        const uuid = input.getAttribute('data-uuid');
        if (!uuid) return;
        const isActive = input.checked;
        const res = await patchApi<BankAccountDetail>(`/api/bank-accounts/${uuid}/status`, { isActive });
        if (res.success) {
          showToast(res.message || 'Estado de cuenta actualizado.', 'success');
          void this.loadAccounts();
          void this.loadKpis();
        } else {
          input.checked = !isActive;
          showToast(res.error || 'Error al cambiar estado de la cuenta.', 'danger');
        }
      });
    });

    const manageGiveawaysBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-manage-giveaways-"]');
    manageGiveawaysBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        if (uuid) void this.openManageGiveawaysModal(uuid);
      });
    });

    const editBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-edit-account-"]');
    editBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        const account = this.accounts.find((a) => a.uuid === uuid);
        if (account) this.openEditAccountModal(account);
      });
    });

    const deleteBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-delete-account-"]');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        const account = this.accounts.find((a) => a.uuid === uuid);
        if (account) this.openConfirmDeleteModal(account);
      });
    });
  }

  private openCreateAccountModal(): void {
    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px; width: 100%; box-sizing: border-box;">
        <label class="field" data-ref="field-bank-name">
          <input class="field__input" data-ref="input-bank-name" type="text" placeholder=" " maxlength="100" />
          <span class="field__label">Nombre del Banco o Institución (ej. BBVA, Mercado Pago, Santander)</span>
        </label>

        <label class="field" data-ref="field-account-holder">
          <input class="field__input" data-ref="input-account-holder" type="text" placeholder=" " maxlength="150" />
          <span class="field__label">Nombre del Titular o Razón Social</span>
        </label>

        <label class="field" data-ref="field-account-type">
          <select class="field__input" data-ref="select-account-type">
            <option value="clabe" selected>CLABE Interbancaria (SPEI)</option>
            <option value="card">Tarjeta de Débito / Depósito</option>
            <option value="both">Ambas (CLABE + Tarjeta)</option>
          </select>
          <span class="field__label">Modalidad de Recepción</span>
        </label>

        <label class="field" data-ref="field-clabe">
          <input class="field__input" data-ref="input-clabe" type="text" placeholder=" " maxlength="18" />
          <span class="field__label">CLABE Interbancaria (18 dígitos)</span>
        </label>

        <label class="field" data-ref="field-card-number">
          <input class="field__input" data-ref="input-card-number" type="text" placeholder=" " maxlength="16" />
          <span class="field__label">Número de Tarjeta (16 dígitos, opcional)</span>
        </label>

        <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-secondary); cursor: pointer; margin-top: 4px;">
          <input type="checkbox" data-ref="check-apply-all-giveaways" checked style="width: 16px; height: 16px;" />
          <span>Habilitar inmediatamente en todos los sorteos activos y vigentes</span>
        </label>
      </div>
    `;

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Guardar Cuenta',
      description: 'Registra una nueva cuenta bancaria para recibir transferencias SPEI.',
      onConfirm: async () => {
        const inputBank = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-bank-name"]');
        const inputHolder = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-account-holder"]');
        const selectType = bodyContainer.querySelector<HTMLSelectElement>('[data-ref="select-account-type"]');
        const inputClabe = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-clabe"]');
        const inputCard = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-card-number"]');
        const checkApplyAll = bodyContainer.querySelector<HTMLInputElement>('[data-ref="check-apply-all-giveaways"]');

        const bankName = (inputBank?.value || '').trim();
        const accountHolder = (inputHolder?.value || '').trim();
        const accountType = (selectType?.value || 'clabe') as 'clabe' | 'card' | 'both';
        const clabe = (inputClabe?.value || '').trim();
        const cardNumber = (inputCard?.value || '').trim();
        const applyToAll = Boolean(checkApplyAll?.checked);

        if (!bankName) {
          showToast('Ingresa el nombre del banco.', 'warning');
          return false;
        }
        if (!accountHolder) {
          showToast('Ingresa el nombre del titular.', 'warning');
          return false;
        }
        if ((accountType === 'clabe' || accountType === 'both') && (!clabe || clabe.length !== 18)) {
          showToast('La CLABE interbancaria debe contener 18 dígitos.', 'warning');
          return false;
        }

        const res = await postApi<{ account: BankAccountDetail }>('/api/bank-accounts', {
          account_holder: accountHolder,
          account_type: accountType,
          apply_to_all_active_giveaways: applyToAll,
          bank_name: bankName,
          card_number: cardNumber || null,
          clabe: clabe || null,
        });

        if (res.success) {
          showToast('Cuenta bancaria creada exitosamente.', 'success');
          void this.loadAccounts();
          void this.loadKpis();
          return true;
        } else {
          showToast(res.error || 'Error al crear la cuenta bancaria.', 'danger');
          return false;
        }
      },
      size: 'md',
      title: 'Registrar Nueva Cuenta Bancaria',
    });
  }

  private openEditAccountModal(account: BankAccountDetail): void {
    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px; width: 100%; box-sizing: border-box;">
        <label class="field" data-ref="field-bank-name">
          <input class="field__input" data-ref="input-bank-name" type="text" placeholder=" " value="${escapeHtml(account.bank_name)}" maxlength="100" />
          <span class="field__label">Nombre del Banco o Institución</span>
        </label>

        <label class="field" data-ref="field-account-holder">
          <input class="field__input" data-ref="input-account-holder" type="text" placeholder=" " value="${escapeHtml(account.account_holder)}" maxlength="150" />
          <span class="field__label">Nombre del Titular</span>
        </label>

        <label class="field" data-ref="field-account-type">
          <select class="field__input" data-ref="select-account-type">
            <option value="clabe" ${account.account_type === 'clabe' ? 'selected' : ''}>CLABE Interbancaria (SPEI)</option>
            <option value="card" ${account.account_type === 'card' ? 'selected' : ''}>Tarjeta de Débito / Depósito</option>
            <option value="both" ${account.account_type === 'both' ? 'selected' : ''}>Ambas (CLABE + Tarjeta)</option>
          </select>
          <span class="field__label">Modalidad de Recepción</span>
        </label>

        <label class="field" data-ref="field-clabe">
          <input class="field__input" data-ref="input-clabe" type="text" placeholder=" " value="${escapeHtml(account.clabe || '')}" maxlength="18" />
          <span class="field__label">CLABE Interbancaria (18 dígitos)</span>
        </label>

        <label class="field" data-ref="field-card-number">
          <input class="field__input" data-ref="input-card-number" type="text" placeholder=" " value="${escapeHtml(account.card_number || '')}" maxlength="16" />
          <span class="field__label">Número de Tarjeta (16 dígitos, opcional)</span>
        </label>
      </div>
    `;

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Actualizar Datos',
      description: `Editando cuenta: ${account.bank_name} • ${account.account_holder}`,
      onConfirm: async () => {
        const inputBank = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-bank-name"]');
        const inputHolder = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-account-holder"]');
        const selectType = bodyContainer.querySelector<HTMLSelectElement>('[data-ref="select-account-type"]');
        const inputClabe = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-clabe"]');
        const inputCard = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-card-number"]');

        const bankName = (inputBank?.value || '').trim();
        const accountHolder = (inputHolder?.value || '').trim();
        const accountType = (selectType?.value || 'clabe') as 'clabe' | 'card' | 'both';
        const clabe = (inputClabe?.value || '').trim();
        const cardNumber = (inputCard?.value || '').trim();

        if (!bankName) {
          showToast('Ingresa el nombre del banco.', 'warning');
          return false;
        }
        if (!accountHolder) {
          showToast('Ingresa el nombre del titular.', 'warning');
          return false;
        }
        if ((accountType === 'clabe' || accountType === 'both') && (!clabe || clabe.length !== 18)) {
          showToast('La CLABE interbancaria debe contener 18 dígitos.', 'warning');
          return false;
        }

        const res = await putApi<BankAccountDetail>(`/api/bank-accounts/${account.uuid}`, {
          account_holder: accountHolder,
          account_type: accountType,
          bank_name: bankName,
          card_number: cardNumber || null,
          clabe: clabe || null,
        });

        if (res.success) {
          showToast('Cuenta bancaria actualizada exitosamente.', 'success');
          void this.loadAccounts();
          void this.loadKpis();
          return true;
        } else {
          showToast(res.error || 'Error al actualizar la cuenta.', 'danger');
          return false;
        }
      },
      size: 'md',
      title: 'Editar Cuenta Bancaria',
    });
  }

  private async openManageGiveawaysModal(uuid: string): Promise<void> {
    const res = await getApi<{ account: BankAccountDetail; giveaways: BankAccountGiveawayAssignment[] }>(
      `/api/bank-accounts/${uuid}`
    );

    if (!res.success || !res.data) {
      showToast(res.error || 'No se pudo cargar la cobertura de sorteos.', 'danger');
      return;
    }

    const { account, giveaways } = res.data;
    const bodyContainer = document.createElement('div');

    if (giveaways.length === 0) {
      bodyContainer.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-secondary);">
          <p>No hay sorteos registrados en el sistema actualmente.</p>
        </div>
      `;
    } else {
      const itemsHtml = giveaways
        .map((g) => {
          const isEnabled = g.is_assigned && g.is_active;
          return `
            <div class="giveaways-assignment-item" data-giveaway-id="${g.giveaway_id}">
              <div class="giveaways-assignment-info">
                <span class="giveaways-assignment-title">${escapeHtml(g.giveaway_title)}</span>
                <div class="giveaways-assignment-meta">
                  <span>Estado: <strong>${escapeHtml(g.giveaway_status)}</strong></span>
                  <span>•</span>
                  <span>Tipo: ${g.giveaway_type === 'daily' ? 'Diario' : 'Estándar'}</span>
                </div>
              </div>
              <label class="switch-control" data-tooltip="${isEnabled ? 'Deshabilitar en este sorteo' : 'Habilitar en este sorteo'}">
                <input type="checkbox" ${isEnabled ? 'checked' : ''} data-ref="check-giveaway-${g.giveaway_id}" data-giveaway-id="${g.giveaway_id}" />
                <span class="switch-control__slider"></span>
              </label>
            </div>
          `;
        })
        .join('');

      bodyContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">
            Selecciona los sorteos en los que los compradores podrán ver y transferir a <strong>${escapeHtml(account.bank_name)} (${escapeHtml(account.account_holder)})</strong>:
          </p>
          <div class="giveaways-assignment-list" data-ref="giveaways-assignment-list">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Guardar Asignaciones',
      description: `Cuenta: ${account.bank_name} • ${account.clabe || account.card_number || ''}`,
      onConfirm: async () => {
        if (giveaways.length === 0) return true;

        const checkboxes = bodyContainer.querySelectorAll<HTMLInputElement>('[data-giveaway-id]');
        const assignments: Array<{ giveawayId: number; isActive: boolean }> = [];

        checkboxes.forEach((cb) => {
          const gId = Number(cb.getAttribute('data-giveaway-id'));
          if (!isNaN(gId) && gId > 0) {
            assignments.push({
              giveawayId: gId,
              isActive: cb.checked,
            });
          }
        });

        const updateRes = await putApi<BankAccountGiveawayAssignment[]>(`/api/bank-accounts/${uuid}/giveaways`, {
          assignments,
        });

        if (updateRes.success) {
          showToast('Cobertura de sorteos actualizada exitosamente.', 'success');
          void this.loadAccounts();
          void this.loadKpis();
          return true;
        } else {
          showToast(updateRes.error || 'Error al guardar cobertura de sorteos.', 'danger');
          return false;
        }
      },
      size: 'lg',
      title: 'Gestionar Cobertura por Sorteo',
    });
  }

  private openConfirmDeleteModal(account: BankAccountDetail): void {
    const bodyHtml = `
      <div style="font-size: 13.5px; color: var(--text-secondary); line-height: 1.55;">
        ¿Estás seguro de eliminar la cuenta de <strong>${escapeHtml(account.bank_name)}</strong>?<br/><br/>
        • <strong>Titular:</strong> ${escapeHtml(account.account_holder)}<br/>
        • <strong>CLABE:</strong> ${escapeHtml(account.clabe || 'Sin CLABE')}<br/><br/>
        La cuenta dejará de estar disponible inmediatamente para todos los sorteos del sistema.
      </div>
    `;

    openModal({
      bodyHtml,
      confirmClass: 'component-button--danger',
      confirmText: 'Eliminar Cuenta',
      description: 'Eliminación definitiva de cuenta bancaria.',
      onConfirm: async () => {
        const res = await deleteApi(`/api/bank-accounts/${account.uuid}`);
        if (res.success) {
          showToast('Cuenta bancaria eliminada con éxito.', 'success');
          void this.loadAccounts();
          void this.loadKpis();
          return true;
        } else {
          showToast(res.error || 'Error al eliminar la cuenta bancaria.', 'danger');
          return false;
        }
      },
      size: 'sm',
      title: 'Eliminar Cuenta Bancaria',
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

export async function createBankAccountsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/bank-accounts/bank-accounts.html');
  const controller = new BankAccountsController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
