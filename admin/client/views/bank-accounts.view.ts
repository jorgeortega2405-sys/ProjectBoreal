import { openModal } from '../components/modal.component.js';
import { deleteApi, getApi, patchApi, postApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, escapeHtml, removeEmptyState, renderEmptyState, setupDropdown } from '../utils/dom.util.js';
import { hasPermission } from '../utils/permission.util.js';

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

interface AccountTypeOption {
  icon: string;
  label: string;
  value: 'clabe' | 'card' | 'both';
}

interface BankCatalogOption {
  id: string;
  name: string;
}

const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
  { icon: 'sync_alt', label: 'CLABE Interbancaria (SPEI)', value: 'clabe' },
  { icon: 'credit_card', label: 'Tarjeta de Débito / Depósito', value: 'card' },
  { icon: 'payments', label: 'Ambas (CLABE + Tarjeta)', value: 'both' },
];

const BANK_OPTIONS: BankCatalogOption[] = [
  { id: 'bbva', name: 'BBVA México' },
  { id: 'santander', name: 'Santander' },
  { id: 'citibanamex', name: 'Citibanamex' },
  { id: 'banorte', name: 'Banorte' },
  { id: 'mercadopago', name: 'Mercado Pago' },
  { id: 'nu', name: 'Nu México' },
  { id: 'azteca', name: 'Banco Azteca' },
  { id: 'spin', name: 'Spin by OXXO' },
  { id: 'heybanco', name: 'Hey Banco' },
  { id: 'banregio', name: 'Banregio' },
  { id: 'hsbc', name: 'HSBC México' },
  { id: 'scotiabank', name: 'Scotiabank' },
  { id: 'inbursa', name: 'Inbursa' },
  { id: 'bancoppel', name: 'BanCoppel' },
  { id: 'stp', name: 'STP (Sistema de Transferencias y Pagos)' },
  { id: 'afirme', name: 'Afirme' },
  { id: 'banbajio', name: 'BanBajío' },
  { id: 'bienestar', name: 'Banco del Bienestar' },
  { id: 'klar', name: 'Klar' },
  { id: 'uala', name: 'Ualá' },
  { id: 'albo', name: 'Albo' },
  { id: 'dolarapp', name: 'DolarApp' },
  { id: 'intercam', name: 'Intercam Banco' },
  { id: 'compartamos', name: 'Compartamos Banco' },
  { id: 'mifel', name: 'Mifel' },
  { id: 'actinver', name: 'Actinver' },
  { id: 'multiva', name: 'Banco Multiva' },
  { id: 'cacao', name: 'Cacao Paycard' },
];

function getBankSkinClass(bankName: string, clabe: string | null): string {
  const normName = (bankName || '').toLowerCase();
  const clabePrefix = (clabe || '').slice(0, 3);

  if (normName.includes('bbva') || clabePrefix === '012') {
    return 'bank-skin--bbva';
  }
  if (normName.includes('santander') || clabePrefix === '014') {
    return 'bank-skin--santander';
  }
  if (normName.includes('banamex') || normName.includes('citibanamex') || clabePrefix === '002') {
    return 'bank-skin--citibanamex';
  }
  if (normName.includes('banorte') || clabePrefix === '072') {
    return 'bank-skin--banorte';
  }
  if (normName.includes('mercado') || normName.includes('mercadopago')) {
    return 'bank-skin--mercadopago';
  }
  if (normName.includes('nu') || clabePrefix === '698') {
    return 'bank-skin--nu';
  }
  if (normName.includes('azteca') || clabePrefix === '127') {
    return 'bank-skin--azteca';
  }
  if (normName.includes('hey') || normName.includes('banregio') || clabePrefix === '058') {
    return 'bank-skin--heybanco';
  }
  if (normName.includes('spin') || normName.includes('oxxo') || clabePrefix === '721') {
    return 'bank-skin--spin';
  }
  if (normName.includes('stp') || normName.includes('transferencias')) {
    return 'bank-skin--stp';
  }
  return 'bank-skin--generic';
}

function getMaskedCardDisplay(card: string | null, clabe: string | null): string {
  if (card) {
    const clean = card.replace(/\D/g, '');
    if (clean.length >= 15) {
      return `${clean.slice(0, 4)} •••• •••• ${clean.slice(-4)}`;
    }
    return card;
  }
  if (clabe && clabe.length >= 10) {
    return `•••• •••• •••• ${clabe.slice(-4)}`;
  }
  return '•••• •••• •••• ----';
}

export class BankAccountsController implements ViewController {
  private abortController: AbortController | null = null;
  private accounts: BankAccountDetail[] = [];
  private btnActionCopyCard: HTMLButtonElement | null = null;
  private btnActionCopyClabe: HTMLButtonElement | null = null;
  private btnActionDelete: HTMLButtonElement | null = null;
  private btnActionDeselect: HTMLButtonElement | null = null;
  private btnActionEdit: HTMLButtonElement | null = null;
  private btnActionManageGiveaways: HTMLButtonElement | null = null;
  private btnActionToggleStatus: HTMLButtonElement | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnCreateAccount: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private defaultActions: HTMLElement | null = null;
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private selectedAccount: BankAccountDetail | null = null;
  private selectedActions: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-accounts"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    this.btnCreateAccount = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-create-account"]');

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="bank-accounts-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="bank-accounts-selected-actions"]');
    this.btnActionDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    this.btnActionEdit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-edit"]');
    this.btnActionToggleStatus = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-toggle-status"]');
    this.btnActionManageGiveaways = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-manage-giveaways"]');
    this.btnActionCopyClabe = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-copy-clabe"]');
    this.btnActionCopyCard = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-copy-card"]');
    this.btnActionDelete = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-delete"]');

    this.bindEvents();
    renderIcons(this.container);

    await this.loadInitialData();
  }

  bindEvents(): void {
    const signal = this.abortController?.signal;

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
          } else if (this.selectedAccount) {
            this.selectedAccount = null;
            this.updateSelectionUi();
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
          this.btnClearSearch.classList.toggle('is-hidden', val.length === 0);
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
        if (this.btnClearSearch) this.btnClearSearch.classList.add('is-hidden');
        this.searchQuery = '';
        void this.loadAccounts();
        this.inputSearch?.focus();
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

    this.btnActionDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedAccount = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnActionEdit?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedAccount) {
          this.openEditAccountModal(this.selectedAccount);
        }
      },
      { signal }
    );

    this.btnActionToggleStatus?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedAccount) {
          void this.handleToggleStatus(this.selectedAccount);
        }
      },
      { signal }
    );

    this.btnActionManageGiveaways?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedAccount) {
          void this.openManageGiveawaysModal(this.selectedAccount.uuid);
        }
      },
      { signal }
    );

    this.btnActionCopyClabe?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedAccount?.clabe) {
          void navigator.clipboard.writeText(this.selectedAccount.clabe);
          showToast('CLABE interbancaria copiada al portapapeles.', 'success');
        }
      },
      { signal }
    );

    this.btnActionCopyCard?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedAccount?.card_number) {
          void navigator.clipboard.writeText(this.selectedAccount.card_number);
          showToast('Número de tarjeta copiado al portapapeles.', 'success');
        }
      },
      { signal }
    );

    this.btnActionDelete?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedAccount) {
          this.openConfirmDeleteModal(this.selectedAccount);
        }
      },
      { signal }
    );
  }

  private resetSearch(): void {
    if (this.inputSearch) this.inputSearch.value = '';
    if (this.btnClearSearch) this.btnClearSearch.classList.add('is-hidden');
    this.searchQuery = '';
    if (this.isSearchActive) {
      this.toggleSearchToolbar(false);
    }
    this.selectedAccount = null;
    void this.loadAccounts();
  }

  private toggleSearchToolbar(forceState?: boolean): void {
    if (!this.searchToolbar) return;
    this.isSearchActive = forceState !== undefined ? forceState : !this.isSearchActive;
    if (this.isSearchActive) {
      this.searchToolbar.classList.remove('is-hidden');
      this.btnToggleSearch?.classList.add('is-active');
      this.inputSearch?.focus();
    } else {
      this.searchToolbar.classList.add('is-hidden');
      this.btnToggleSearch?.classList.remove('is-active');
      if (this.inputSearch) this.inputSearch.value = '';
      if (this.btnClearSearch) this.btnClearSearch.classList.add('is-hidden');
      if (this.searchQuery) {
        this.searchQuery = '';
        void this.loadAccounts();
      }
    }
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
        if (this.selectedAccount) {
          const found = this.accounts.find((a) => a.uuid === this.selectedAccount?.uuid);
          this.selectedAccount = found || null;
        }
      } else {
        showToast(res.error || 'No se pudieron cargar las cuentas bancarias.', 'danger');
      }
    } catch (_) {
      showToast('Error de conexión al cargar cuentas bancarias.', 'danger');
    }
    this.renderAccounts();
    this.updateSelectionUi();
  }

  private renderAccounts(): void {
    const gridContainer = this.container.querySelector<HTMLElement>('[data-ref="bank-accounts-grid-container"]');
    const contentArea = this.container.querySelector<HTMLElement>('[data-ref="bank-accounts-content-area"]');

    if (!gridContainer) return;

    if (this.accounts.length === 0) {
      const isFiltered = Boolean(this.searchQuery);
      gridContainer.innerHTML = '';
      gridContainer.classList.add('is-hidden');
      if (contentArea) {
        renderEmptyState({
          actionDataRef: isFiltered ? 'btn-reset-search' : undefined,
          actionLabel: isFiltered ? 'Restablecer Búsqueda' : undefined,
          container: contentArea,
          dataRef: 'bank-accounts-empty-state',
          desc: isFiltered
            ? 'No se encontraron cuentas bancarias con el término de búsqueda proporcionado.'
            : 'Aún no hay cuentas bancarias registradas en la plataforma.',
          graphicType: isFiltered ? 'search' : 'bank',
          onAction: isFiltered
            ? (e) => {
                e.preventDefault();
                this.resetSearch();
              }
            : undefined,
          title: 'Sin cuentas registradas',
        });
      }
      return;
    }

    gridContainer.classList.remove('is-hidden');
    if (contentArea) {
      removeEmptyState(contentArea, 'bank-accounts-empty-state');
    }
    gridContainer.innerHTML = this.accounts.map((acc) => this.buildAccountCardHtml(acc)).join('');
    renderIcons(gridContainer);
    this.attachCardEvents(gridContainer);
  }

  private buildAccountCardHtml(acc: BankAccountDetail): string {
    const isActive = Boolean(acc.is_active);
    const skinClass = getBankSkinClass(acc.bank_name, acc.clabe);
    const maskedNumber = getMaskedCardDisplay(acc.card_number, acc.clabe);
    const isSelected = this.selectedAccount?.uuid === acc.uuid;

    let typeBadgeLabel = 'CLABE';
    if (acc.account_type === 'card') typeBadgeLabel = 'TARJETA DÉBITO';
    else if (acc.account_type === 'both') typeBadgeLabel = 'CLABE + TARJETA';

    const networkBadge = acc.account_type === 'card' ? 'DÉBITO' : 'SPEI 24/7';

    return `
      <div class="bank-card-item canvas-card ${!isActive ? 'bank-card-item--inactive' : ''} ${isSelected ? 'is-selected' : ''}" data-ref="card-bank-${acc.uuid}" data-uuid="${acc.uuid}">
        <div class="canvas-card__thumbnail">
          <div class="bank-debit-card ${skinClass}">
            <div class="bank-debit-card__sheen"></div>

            <div class="bank-debit-card__top">
              <div class="bank-debit-card__brand">
                <svg class="component-icon bank-debit-card__bank-icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
                <span class="bank-debit-card__bank-title">${escapeHtml(acc.bank_name)}</span>
              </div>

              <div class="bank-debit-card__top-right">
                <svg class="component-icon bank-debit-card__nfc-icon" aria-hidden="true"><use href="/icons.svg#credit_card"></use></svg>
              </div>
            </div>

            <div class="bank-debit-card__middle">
              <div class="bank-card-chip"></div>
              <span class="bank-debit-card__network-badge">${networkBadge}</span>
            </div>

            <div class="bank-debit-card__number-row">
              <span class="bank-debit-card__number">${escapeHtml(maskedNumber)}</span>
            </div>

            <div class="bank-debit-card__bottom">
              <div class="bank-debit-card__holder-box">
                <span class="bank-debit-card__holder-label">TITULAR AUTORIZADO</span>
                <span class="bank-debit-card__holder-name">${escapeHtml(acc.account_holder)}</span>
              </div>

              <span class="bank-debit-card__status-tag ${isActive ? 'bank-debit-card__status-tag--active' : 'bank-debit-card__status-tag--inactive'}">
                ${isActive ? 'Activa' : 'Pausada'}
              </span>
            </div>
          </div>

          <div class="canvas-card__checkbox" data-ref="card-checkbox-${acc.uuid}">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check"></use></svg>
          </div>
        </div>

        <div class="canvas-card__info">
          <h3 class="canvas-card__name" title="${escapeHtml(acc.bank_name)} • ${escapeHtml(acc.account_holder)}">
            ${escapeHtml(acc.bank_name)} • ${escapeHtml(acc.account_holder)}
          </h3>

          <div class="bank-card-badges-row">
            <span class="bank-badge ${isActive ? 'bank-badge--active' : 'bank-badge--inactive'}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${isActive ? 'check_circle' : 'pause'}"></use></svg>
              <span>${isActive ? 'En servicio' : 'Pausada'}</span>
            </span>

            <span class="bank-badge">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#credit_card"></use></svg>
              <span>${typeBadgeLabel}</span>
            </span>

            ${acc.clabe ? `
              <span class="bank-badge bank-badge--clabe" data-ref="btn-badge-copy-clabe-${acc.uuid}" data-clabe="${escapeHtml(acc.clabe)}" data-tooltip="Clic para copiar CLABE">
                <span>CLABE: ${escapeHtml(acc.clabe.slice(0, 4))}...${escapeHtml(acc.clabe.slice(-4))}</span>
                <svg class="component-icon bank-badge__icon-copy" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
              </span>
            ` : ''}

            <span class="bank-badge bank-badge--coverage">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
              <span>${acc.active_giveaways_count} sorteos</span>
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private attachCardEvents(container: HTMLElement): void {
    const cards = container.querySelectorAll<HTMLElement>('.bank-card-item');
    cards.forEach((card) => {
      const uuid = card.getAttribute('data-uuid');
      if (!uuid) return;
      const account = this.accounts.find((a) => a.uuid === uuid);
      if (!account) return;

      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-ref^="btn-badge-copy-clabe-"]')) {
          return;
        }
        e.preventDefault();
        this.toggleAccountSelection(account);
      });

      card.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.openEditAccountModal(account);
      });
    });

    const clabeBadges = container.querySelectorAll<HTMLElement>('[data-ref^="btn-badge-copy-clabe-"]');
    clabeBadges.forEach((badge) => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const clabe = badge.getAttribute('data-clabe') || '';
        if (clabe) {
          void navigator.clipboard.writeText(clabe);
          showToast('CLABE interbancaria copiada al portapapeles.', 'success');
        }
      });
    });
  }

  private toggleAccountSelection(account: BankAccountDetail): void {
    if (this.selectedAccount?.uuid === account.uuid) {
      this.selectedAccount = null;
    } else {
      this.selectedAccount = account;
    }
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedAccount !== null;
    const canManage = hasPermission('bank_accounts:manage');
    const canDelete = hasPermission('bank_accounts:delete');

    this.btnCreateAccount?.classList.toggle('is-hidden', !canManage);

    if (!isSelected) {
      if (this.defaultActions) this.defaultActions.classList.remove('is-hidden');
      if (this.selectedActions) this.selectedActions.classList.add('is-hidden');
    } else {
      if (this.defaultActions) this.defaultActions.classList.add('is-hidden');
      if (this.selectedActions) this.selectedActions.classList.remove('is-hidden');

      const acc = this.selectedAccount!;
      const isActive = Boolean(acc.is_active);

      this.btnActionEdit?.classList.toggle('is-hidden', !canManage);
      this.btnActionToggleStatus?.classList.toggle('is-hidden', !canManage);
      this.btnActionManageGiveaways?.classList.toggle('is-hidden', !canManage);
      this.btnActionDelete?.classList.toggle('is-hidden', !canDelete);

      if (this.btnActionToggleStatus && canManage) {
        const iconEl = this.btnActionToggleStatus.querySelector('[data-ref="icon-action-toggle-status"]');
        if (isActive) {
          this.btnActionToggleStatus.setAttribute('data-tooltip', 'Pausar cuenta');
          this.btnActionToggleStatus.setAttribute('aria-label', 'Pausar cuenta');
          if (iconEl) iconEl.innerHTML = '<use href="/icons.svg#pause"></use>';
        } else {
          this.btnActionToggleStatus.setAttribute('data-tooltip', 'Activar cuenta');
          this.btnActionToggleStatus.setAttribute('aria-label', 'Activar cuenta');
          if (iconEl) iconEl.innerHTML = '<use href="/icons.svg#play_arrow"></use>';
        }
      }

      if (this.btnActionCopyClabe) {
        this.btnActionCopyClabe.classList.toggle('is-hidden', !acc.clabe);
      }

      if (this.btnActionCopyCard) {
        this.btnActionCopyCard.classList.toggle('is-hidden', !acc.card_number);
      }
    }

    const grid = this.container.querySelector<HTMLElement>('[data-ref="bank-accounts-grid-container"]');
    if (grid) {
      this.accounts.forEach((acc) => {
        const card = grid.querySelector<HTMLElement>(`[data-ref="card-bank-${acc.uuid}"]`);
        const isCardSelected = this.selectedAccount?.uuid === acc.uuid;
        if (card) {
          card.classList.toggle('is-selected', isCardSelected);
        }
      });
    }
  }

  private async handleToggleStatus(account: BankAccountDetail): Promise<void> {
    const nextState = !Boolean(account.is_active);
    const res = await patchApi<BankAccountDetail>(`/api/bank-accounts/${account.uuid}/status`, { isActive: nextState });
    if (res.success) {
      showToast(res.message || `Cuenta ${nextState ? 'activada' : 'pausada'} con éxito.`, 'success');
      account.is_active = nextState ? 1 : 0;
      void this.loadAccounts();
      void this.loadKpis();
    } else {
      showToast(res.error || 'Error al actualizar el estado de la cuenta.', 'danger');
    }
  }

  private openCreateAccountModal(): void {
    let selectedBank = '';
    let selectedAccountType: 'clabe' | 'card' | 'both' = 'clabe';

    const defaultTypeOption = ACCOUNT_TYPE_OPTIONS[0];

    const bankOptionsHtml = BANK_OPTIONS.map(
      (b) => `
        <button type="button" class="menu-item" data-ref="option-bank-${b.id}" data-bank-value="${escapeHtml(b.name)}">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
          <span class="menu-item__text">${escapeHtml(b.name)}</span>
        </button>
      `
    ).join('');

    const accountTypeOptionsHtml = ACCOUNT_TYPE_OPTIONS.map(
      (opt) => `
        <button type="button" class="menu-item ${opt.value === selectedAccountType ? 'is-active' : ''}" data-ref="option-account-type-${opt.value}" data-account-type-value="${opt.value}">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#${opt.icon}"></use></svg>
          <span class="menu-item__text">${escapeHtml(opt.label)}</span>
        </button>
      `
    ).join('');

    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div class="bank-modal-form" data-ref="create-bank-modal-form">
        <div class="field field--dropdown" data-ref="field-bank-name">
          <span class="field__label">Nombre del Banco o Institución</span>
          <div class="settings-dropdown-wrapper dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-bank-name">
            <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-bank-name" aria-label="Nombre del Banco o Institución">
              <div class="dropdown-trigger__left">
                <svg class="component-icon dropdown-trigger__icon" data-ref="bank-selected-icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
                <span class="dropdown-trigger__text dropdown-trigger__text--placeholder" data-ref="bank-selected-text">Selecciona un banco o institución</span>
              </div>
              <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
            </button>

            <div class="dropdown-backdrop" data-ref="dropdown-backdrop-bank-name">
              <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="dropdown-menu-bank-name">
                <div class="menu-panel__drag-zone" data-ref="drag-zone-bank-name" aria-hidden="true">
                  <div class="menu-panel__drag-handle"></div>
                </div>
                <div class="menu-panel__search" data-ref="bank-search-box">
                  <svg class="component-icon menu-panel__search-icon" aria-hidden="true"><use href="/icons.svg#search"></use></svg>
                  <input class="menu-panel__search-input" data-ref="input-search-bank" type="text" placeholder="Buscar banco o institución..." autocomplete="off" />
                </div>
                <div class="menu-panel__list menu-panel__list--scrollable" data-ref="list-bank-options">
                  ${bankOptionsHtml}
                </div>
                <div class="menu-panel__empty is-hidden" data-ref="bank-empty-message">No se encontraron instituciones</div>
              </div>
            </div>
          </div>
        </div>

        <label class="field" data-ref="field-account-holder">
          <input class="field__input" data-ref="input-account-holder" type="text" placeholder=" " maxlength="150" />
          <span class="field__label">Nombre del Titular o Razón Social</span>
        </label>

        <div class="field field--dropdown" data-ref="field-account-type">
          <span class="field__label">Modalidad de Recepción</span>
          <div class="settings-dropdown-wrapper dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-account-type">
            <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-account-type" aria-label="Modalidad de Recepción">
              <div class="dropdown-trigger__left">
                <svg class="component-icon dropdown-trigger__icon" data-ref="account-type-selected-icon" aria-hidden="true"><use href="/icons.svg#${defaultTypeOption.icon}"></use></svg>
                <span class="dropdown-trigger__text" data-ref="account-type-selected-text">${escapeHtml(defaultTypeOption.label)}</span>
              </div>
              <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
            </button>

            <div class="dropdown-backdrop" data-ref="dropdown-backdrop-account-type">
              <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="dropdown-menu-account-type">
                <div class="menu-panel__drag-zone" data-ref="drag-zone-account-type" aria-hidden="true">
                  <div class="menu-panel__drag-handle"></div>
                </div>
                <div class="menu-panel__list" data-ref="list-account-type-options">
                  ${accountTypeOptionsHtml}
                </div>
              </div>
            </div>
          </div>
        </div>

        <label class="field" data-ref="field-clabe">
          <input class="field__input" data-ref="input-clabe" type="text" placeholder=" " maxlength="18" />
          <span class="field__label">CLABE Interbancaria (18 dígitos)</span>
        </label>

        <label class="field" data-ref="field-card-number">
          <input class="field__input" data-ref="input-card-number" type="text" placeholder=" " maxlength="16" />
          <span class="field__label">Número de Tarjeta (16 dígitos, opcional)</span>
        </label>

        <label class="bank-checkbox-label" data-ref="label-apply-all-giveaways">
          <input class="bank-checkbox-input" data-ref="check-apply-all-giveaways" type="checkbox" checked />
          <span>Habilitar inmediatamente en todos los sorteos activos y vigentes</span>
        </label>
      </div>
    `;

    renderIcons(bodyContainer);

    const bankWrapper = bodyContainer.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-bank-name"]');
    const bankTriggerText = bodyContainer.querySelector<HTMLElement>('[data-ref="bank-selected-text"]');
    const bankSearchInput = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-search-bank"]');
    const bankEmptyMessage = bodyContainer.querySelector<HTMLElement>('[data-ref="bank-empty-message"]');
    const bankOptionBtns = bodyContainer.querySelectorAll<HTMLButtonElement>('[data-bank-value]');

    let bankDropdownController: DropdownController | null = null;
    if (bankWrapper) {
      bankDropdownController = setupDropdown(bankWrapper, {
        isSelect: true,
        matchWidth: true,
        placement: 'bottom-start',
      });
    }

    bankOptionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        selectedBank = btn.getAttribute('data-bank-value') || '';
        if (bankTriggerText) {
          bankTriggerText.textContent = selectedBank;
          bankTriggerText.classList.remove('dropdown-trigger__text--placeholder');
        }
        bankOptionBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        bankDropdownController?.close();
      });
    });

    bankSearchInput?.addEventListener('input', () => {
      const q = (bankSearchInput.value || '').trim().toLowerCase();
      let matchesCount = 0;
      bankOptionBtns.forEach((btn) => {
        const val = (btn.getAttribute('data-bank-value') || '').toLowerCase();
        const matches = val.includes(q);
        btn.classList.toggle('is-hidden', !matches);
        if (matches) matchesCount++;
      });
      if (bankEmptyMessage) {
        bankEmptyMessage.classList.toggle('is-hidden', matchesCount > 0);
      }
      bankDropdownController?.update();
    });

    const typeWrapper = bodyContainer.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-account-type"]');
    const typeTriggerText = bodyContainer.querySelector<HTMLElement>('[data-ref="account-type-selected-text"]');
    const typeIconUse = bodyContainer.querySelector<SVGUseElement>('[data-ref="account-type-selected-icon"] use');
    const typeOptionBtns = bodyContainer.querySelectorAll<HTMLButtonElement>('[data-account-type-value]');

    let typeDropdownController: DropdownController | null = null;
    if (typeWrapper) {
      typeDropdownController = setupDropdown(typeWrapper, {
        isSelect: true,
        matchWidth: true,
        placement: 'bottom-start',
      });
    }

    typeOptionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        selectedAccountType = (btn.getAttribute('data-account-type-value') || 'clabe') as 'clabe' | 'card' | 'both';
        const found = ACCOUNT_TYPE_OPTIONS.find((opt) => opt.value === selectedAccountType);
        if (found) {
          if (typeTriggerText) typeTriggerText.textContent = found.label;
          if (typeIconUse) typeIconUse.setAttribute('href', `/icons.svg#${found.icon}`);
        }
        typeOptionBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        typeDropdownController?.close();
      });
    });

    const inputHolder = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-account-holder"]');
    const inputClabe = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-clabe"]');
    const inputCard = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-card-number"]');
    const checkApplyAll = bodyContainer.querySelector<HTMLInputElement>('[data-ref="check-apply-all-giveaways"]');

    inputClabe?.addEventListener('input', () => {
      if (inputClabe) {
        inputClabe.value = inputClabe.value.replace(/\D/g, '').slice(0, 18);
      }
    });

    inputCard?.addEventListener('input', () => {
      if (inputCard) {
        inputCard.value = inputCard.value.replace(/\D/g, '').slice(0, 16);
      }
    });

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Guardar Cuenta',
      description: 'Registra una nueva cuenta bancaria para recibir transferencias SPEI.',
      onClose: () => {
        bankDropdownController?.destroy();
        typeDropdownController?.destroy();
      },
      onConfirm: async () => {
        const bankName = selectedBank.trim();
        const accountHolder = (inputHolder?.value || '').trim();
        const accountType = selectedAccountType;
        const clabe = (inputClabe?.value || '').trim();
        const cardNumber = (inputCard?.value || '').trim();
        const applyToAll = Boolean(checkApplyAll?.checked);

        if (!bankName) {
          showToast('Selecciona el nombre del banco o institución.', 'warning');
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

        const res = await postApi<BankAccountDetail>('/api/bank-accounts', {
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
    let selectedBank = account.bank_name || '';
    let selectedAccountType: 'clabe' | 'card' | 'both' = account.account_type || 'clabe';

    const currentTypeOption = ACCOUNT_TYPE_OPTIONS.find((opt) => opt.value === selectedAccountType) || ACCOUNT_TYPE_OPTIONS[0];

    const bankListOptions = [...BANK_OPTIONS];
    const isCustomBank = selectedBank && !bankListOptions.some((b) => b.name.toLowerCase() === selectedBank.toLowerCase());
    if (isCustomBank) {
      bankListOptions.unshift({ id: 'custom', name: selectedBank });
    }

    const bankOptionsHtml = bankListOptions.map(
      (b) => {
        const isActive = b.name.toLowerCase() === selectedBank.toLowerCase();
        return `
          <button type="button" class="menu-item ${isActive ? 'is-active' : ''}" data-ref="option-bank-${b.id}" data-bank-value="${escapeHtml(b.name)}">
            <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
            <span class="menu-item__text">${escapeHtml(b.name)}</span>
          </button>
        `;
      }
    ).join('');

    const accountTypeOptionsHtml = ACCOUNT_TYPE_OPTIONS.map(
      (opt) => `
        <button type="button" class="menu-item ${opt.value === selectedAccountType ? 'is-active' : ''}" data-ref="option-account-type-${opt.value}" data-account-type-value="${opt.value}">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#${opt.icon}"></use></svg>
          <span class="menu-item__text">${escapeHtml(opt.label)}</span>
        </button>
      `
    ).join('');

    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div class="bank-modal-form" data-ref="edit-bank-modal-form">
        <div class="field field--dropdown" data-ref="field-bank-name">
          <span class="field__label">Nombre del Banco o Institución</span>
          <div class="settings-dropdown-wrapper dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-bank-name">
            <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-bank-name" aria-label="Nombre del Banco o Institución">
              <div class="dropdown-trigger__left">
                <svg class="component-icon dropdown-trigger__icon" data-ref="bank-selected-icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
                <span class="dropdown-trigger__text ${selectedBank ? '' : 'dropdown-trigger__text--placeholder'}" data-ref="bank-selected-text">${selectedBank ? escapeHtml(selectedBank) : 'Selecciona un banco o institución'}</span>
              </div>
              <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
            </button>

            <div class="dropdown-backdrop" data-ref="dropdown-backdrop-bank-name">
              <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="dropdown-menu-bank-name">
                <div class="menu-panel__drag-zone" data-ref="drag-zone-bank-name" aria-hidden="true">
                  <div class="menu-panel__drag-handle"></div>
                </div>
                <div class="menu-panel__search" data-ref="bank-search-box">
                  <svg class="component-icon menu-panel__search-icon" aria-hidden="true"><use href="/icons.svg#search"></use></svg>
                  <input class="menu-panel__search-input" data-ref="input-search-bank" type="text" placeholder="Buscar banco o institución..." autocomplete="off" />
                </div>
                <div class="menu-panel__list menu-panel__list--scrollable" data-ref="list-bank-options">
                  ${bankOptionsHtml}
                </div>
                <div class="menu-panel__empty is-hidden" data-ref="bank-empty-message">No se encontraron instituciones</div>
              </div>
            </div>
          </div>
        </div>

        <label class="field" data-ref="field-account-holder">
          <input class="field__input" data-ref="input-account-holder" type="text" placeholder=" " value="${escapeHtml(account.account_holder)}" maxlength="150" />
          <span class="field__label">Nombre del Titular</span>
        </label>

        <div class="field field--dropdown" data-ref="field-account-type">
          <span class="field__label">Modalidad de Recepción</span>
          <div class="settings-dropdown-wrapper dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-account-type">
            <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-account-type" aria-label="Modalidad de Recepción">
              <div class="dropdown-trigger__left">
                <svg class="component-icon dropdown-trigger__icon" data-ref="account-type-selected-icon" aria-hidden="true"><use href="/icons.svg#${currentTypeOption.icon}"></use></svg>
                <span class="dropdown-trigger__text" data-ref="account-type-selected-text">${escapeHtml(currentTypeOption.label)}</span>
              </div>
              <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
            </button>

            <div class="dropdown-backdrop" data-ref="dropdown-backdrop-account-type">
              <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="dropdown-menu-account-type">
                <div class="menu-panel__drag-zone" data-ref="drag-zone-account-type" aria-hidden="true">
                  <div class="menu-panel__drag-handle"></div>
                </div>
                <div class="menu-panel__list" data-ref="list-account-type-options">
                  ${accountTypeOptionsHtml}
                </div>
              </div>
            </div>
          </div>
        </div>

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

    renderIcons(bodyContainer);

    const bankWrapper = bodyContainer.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-bank-name"]');
    const bankTriggerText = bodyContainer.querySelector<HTMLElement>('[data-ref="bank-selected-text"]');
    const bankSearchInput = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-search-bank"]');
    const bankEmptyMessage = bodyContainer.querySelector<HTMLElement>('[data-ref="bank-empty-message"]');
    const bankOptionBtns = bodyContainer.querySelectorAll<HTMLButtonElement>('[data-bank-value]');

    let bankDropdownController: DropdownController | null = null;
    if (bankWrapper) {
      bankDropdownController = setupDropdown(bankWrapper, {
        isSelect: true,
        matchWidth: true,
        placement: 'bottom-start',
      });
    }

    bankOptionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        selectedBank = btn.getAttribute('data-bank-value') || '';
        if (bankTriggerText) {
          bankTriggerText.textContent = selectedBank;
          bankTriggerText.classList.remove('dropdown-trigger__text--placeholder');
        }
        bankOptionBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        bankDropdownController?.close();
      });
    });

    bankSearchInput?.addEventListener('input', () => {
      const q = (bankSearchInput.value || '').trim().toLowerCase();
      let matchesCount = 0;
      bankOptionBtns.forEach((btn) => {
        const val = (btn.getAttribute('data-bank-value') || '').toLowerCase();
        const matches = val.includes(q);
        btn.classList.toggle('is-hidden', !matches);
        if (matches) matchesCount++;
      });
      if (bankEmptyMessage) {
        bankEmptyMessage.classList.toggle('is-hidden', matchesCount > 0);
      }
      bankDropdownController?.update();
    });

    const typeWrapper = bodyContainer.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-account-type"]');
    const typeTriggerText = bodyContainer.querySelector<HTMLElement>('[data-ref="account-type-selected-text"]');
    const typeIconUse = bodyContainer.querySelector<SVGUseElement>('[data-ref="account-type-selected-icon"] use');
    const typeOptionBtns = bodyContainer.querySelectorAll<HTMLButtonElement>('[data-account-type-value]');

    let typeDropdownController: DropdownController | null = null;
    if (typeWrapper) {
      typeDropdownController = setupDropdown(typeWrapper, {
        isSelect: true,
        matchWidth: true,
        placement: 'bottom-start',
      });
    }

    typeOptionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        selectedAccountType = (btn.getAttribute('data-account-type-value') || 'clabe') as 'clabe' | 'card' | 'both';
        const found = ACCOUNT_TYPE_OPTIONS.find((opt) => opt.value === selectedAccountType);
        if (found) {
          if (typeTriggerText) typeTriggerText.textContent = found.label;
          if (typeIconUse) typeIconUse.setAttribute('href', `/icons.svg#${found.icon}`);
        }
        typeOptionBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        typeDropdownController?.close();
      });
    });

    const inputHolder = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-account-holder"]');
    const inputClabe = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-clabe"]');
    const inputCard = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-card-number"]');

    inputClabe?.addEventListener('input', () => {
      if (inputClabe) {
        inputClabe.value = inputClabe.value.replace(/\D/g, '').slice(0, 18);
      }
    });

    inputCard?.addEventListener('input', () => {
      if (inputCard) {
        inputCard.value = inputCard.value.replace(/\D/g, '').slice(0, 16);
      }
    });

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Actualizar Datos',
      description: `Editando cuenta: ${account.bank_name} • ${account.account_holder}`,
      onClose: () => {
        bankDropdownController?.destroy();
        typeDropdownController?.destroy();
      },
      onConfirm: async () => {
        const bankName = selectedBank.trim();
        const accountHolder = (inputHolder?.value || '').trim();
        const accountType = selectedAccountType;
        const clabe = (inputClabe?.value || '').trim();
        const cardNumber = (inputCard?.value || '').trim();

        if (!bankName) {
          showToast('Selecciona el nombre del banco o institución.', 'warning');
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
        <div class="bank-empty-state-modal">
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
                <input class="switch-control__input" data-ref="check-giveaway-${g.giveaway_id}" data-giveaway-id="${g.giveaway_id}" type="checkbox" ${isEnabled ? 'checked' : ''} />
                <span class="switch-control__slider"></span>
              </label>
            </div>
          `;
        })
        .join('');

      bodyContainer.innerHTML = `
        <div class="bank-modal-form">
          <p class="bank-assignment-desc">
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
      <div class="bank-delete-dialog-text">
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
          this.selectedAccount = null;
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
  await controller.init();
  (container as any).__controller = controller;
  return container;
}

