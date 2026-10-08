import { openModal } from '../components/modal.component.js';
import { deleteApi, getApi, postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';

interface CustomerSummary {
  block_reason: string | null;
  blocked_at: string | null;
  cancelled_orders_count: number;
  completed_orders_count: number;
  customer_name: string;
  customer_phone: string;
  customer_state: string | null;
  first_order_at: string;
  is_blocked: boolean;
  last_order_at: string;
  pending_orders_count: number;
  total_orders_count: number;
  total_spent: number;
  total_tickets: number;
}

interface CustomerOrderSummary {
  concept_reference: string;
  created_at: string;
  currency: string;
  giveaway_id: number;
  giveaway_title: string;
  giveaway_uuid: string;
  id: number;
  is_winner: number;
  receipt_filename: string | null;
  status: 'pending_payment' | 'in_review' | 'completed' | 'expired' | 'cancelled';
  ticket_count: number;
  ticket_numbers: number[];
  total_amount: number;
  tracking_key: string | null;
  uuid: string;
}

interface CustomerDetail {
  customer: CustomerSummary;
  orders: CustomerOrderSummary[];
}

interface CustomersKpis {
  activeBuyersCount: number;
  blockedCustomersCount: number;
  totalCustomers: number;
  totalTicketsSold: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(amount) + ' MXN';
}

function formatPhone(phone: string): string {
  if (!phone) return '•••• ----';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return phone;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export class CustomersController implements ViewController {
  private abortController: AbortController | null = null;
  private btnActionCopyPhone: HTMLButtonElement | null = null;
  private btnActionDeselect: HTMLButtonElement | null = null;
  private btnActionDossier: HTMLButtonElement | null = null;
  private btnActionToggleBlock: HTMLButtonElement | null = null;
  private btnActionWhatsapp: HTMLButtonElement | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnPaginationNext: HTMLButtonElement | null = null;
  private btnPaginationPrev: HTMLButtonElement | null = null;
  private btnRefresh: HTMLButtonElement | null = null;
  private btnResetSearch: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private currentPage = 1;
  private customers: CustomerSummary[] = [];
  private defaultActions: HTMLElement | null = null;
  private inputPaginationPage: HTMLInputElement | null = null;
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private pageSize = 10;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private selectedActions: HTMLElement | null = null;
  private selectedCustomer: CustomerSummary | null = null;
  private totalPages = 1;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-customers"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    this.btnRefresh = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-customers"]');
    this.btnResetSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-search"]');
    this.btnPaginationPrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-prev"]');
    this.btnPaginationNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-next"]');
    this.inputPaginationPage = this.container.querySelector<HTMLInputElement>('[data-ref="input-pagination-page"]');

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="customers-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="customers-selected-actions"]');
    this.btnActionDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    this.btnActionDossier = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-dossier"]');
    this.btnActionToggleBlock = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-toggle-block"]');
    this.btnActionWhatsapp = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-whatsapp"]');
    this.btnActionCopyPhone = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-copy-phone"]');

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
        void this.loadCustomers().finally(() => {
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
            void this.loadCustomers();
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
          this.currentPage = 1;
          void this.loadCustomers();
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
        void this.loadCustomers();
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
        this.selectedCustomer = null;
        this.currentPage = 1;
        this.updateSelectionUi();
        void this.loadCustomers();
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
          this.renderCustomers();
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
          this.renderCustomers();
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
          this.renderCustomers();
        }
      },
      { signal }
    );

    this.btnActionDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedCustomer = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnActionDossier?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedCustomer) {
          void this.openCustomerDossierModal(this.selectedCustomer.customer_phone);
        }
      },
      { signal }
    );

    this.btnActionToggleBlock?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (!this.selectedCustomer) return;
        if (this.selectedCustomer.is_blocked) {
          void this.unblockCustomer(this.selectedCustomer.customer_phone);
        } else {
          this.openBlockCustomerModal(this.selectedCustomer.customer_phone, this.selectedCustomer.customer_name);
        }
      },
      { signal }
    );

    this.btnActionWhatsapp?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedCustomer?.customer_phone) {
          const rawPhone = this.selectedCustomer.customer_phone.replace(/\D/g, '');
          window.open(`https://wa.me/52${rawPhone}`, '_blank', 'noopener,noreferrer');
        }
      },
      { signal }
    );

    this.btnActionCopyPhone?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedCustomer?.customer_phone) {
          void navigator.clipboard.writeText(this.selectedCustomer.customer_phone);
          showToast('Teléfono copiado al portapapeles.', 'success');
        }
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.selectedCustomer) {
          this.selectedCustomer = null;
          this.updateSelectionUi();
        }
      },
      { signal }
    );
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all([this.loadKpis(), this.loadCustomers()]);
  }

  private async loadKpis(): Promise<void> {
    try {
      const res = await getApi<CustomersKpis>('/api/customers/kpis');
      if (res.success && res.data) {
        const kpi = res.data;
        const elTotal = this.container.querySelector('[data-ref="kpi-total-customers"]');
        const elActive = this.container.querySelector('[data-ref="kpi-active-buyers"]');
        const elTickets = this.container.querySelector('[data-ref="kpi-total-tickets"]');
        const elBlocked = this.container.querySelector('[data-ref="kpi-blocked-count"]');

        if (elTotal) elTotal.textContent = String(kpi.totalCustomers);
        if (elActive) elActive.textContent = String(kpi.activeBuyersCount);
        if (elTickets) elTickets.textContent = String(kpi.totalTicketsSold);
        if (elBlocked) elBlocked.textContent = String(kpi.blockedCustomersCount);
      }
    } catch (_) {}
  }

  private async loadCustomers(): Promise<void> {
    try {
      const queryParams = new URLSearchParams();
      if (this.searchQuery) {
        queryParams.set('search', this.searchQuery);
      }
      const res = await getApi<CustomerSummary[]>(`/api/customers?${queryParams.toString()}`);
      if (res.success && Array.isArray(res.data)) {
        this.customers = res.data;
        if (this.selectedCustomer) {
          const fresh = this.customers.find((c) => c.customer_phone === this.selectedCustomer?.customer_phone);
          this.selectedCustomer = fresh || null;
        }
        this.renderCustomers();
        this.updateSelectionUi();
      } else {
        showToast(res.error || 'No se pudieron cargar los participantes.', 'danger');
      }
    } catch (_) {
      showToast('Error de conexión al cargar clientes.', 'danger');
    }
  }

  private toggleCustomerSelection(customer: CustomerSummary): void {
    if (this.selectedCustomer?.customer_phone === customer.customer_phone) {
      this.selectedCustomer = null;
    } else {
      this.selectedCustomer = customer;
    }
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedCustomer !== null;
    if (this.defaultActions) this.defaultActions.style.display = isSelected ? 'none' : 'flex';
    if (this.selectedActions) this.selectedActions.style.display = isSelected ? 'flex' : 'none';

    if (isSelected && this.selectedCustomer && this.btnActionToggleBlock) {
      const isBlocked = this.selectedCustomer.is_blocked;
      this.btnActionToggleBlock.setAttribute('data-tooltip', isBlocked ? 'Desbloquear Participante' : 'Bloquear / Lista Negra');
      this.btnActionToggleBlock.setAttribute('aria-label', isBlocked ? 'Desbloquear Participante' : 'Bloquear / Lista Negra');
      this.btnActionToggleBlock.style.color = isBlocked ? '#10b981' : '#ef4444';
      const iconUse = this.btnActionToggleBlock.querySelector('use');
      if (iconUse) {
        iconUse.setAttribute('href', isBlocked ? '/icons.svg#check_circle' : '/icons.svg#block');
      }
    }

    const rows = this.container.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const isThisSelected = row.getAttribute('data-phone') === this.selectedCustomer?.customer_phone;
      row.classList.toggle('is-selected', isThisSelected);
    });
  }

  private updatePaginationUi(): void {
    const totalCount = this.customers.length;
    this.totalPages = Math.max(1, Math.ceil(totalCount / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

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

  private renderCustomers(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tbody-customers"]');
    const tableCard = this.container.querySelector<HTMLElement>('[data-ref="customers-table-card"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="customers-empty-state"]');

    if (!tbody) return;

    if (this.customers.length === 0) {
      tbody.innerHTML = '';
      if (tableCard) tableCard.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      this.updatePaginationUi();
      return;
    }

    if (tableCard) tableCard.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    this.updatePaginationUi();
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageItems = this.customers.slice(startIndex, startIndex + this.pageSize);

    tbody.innerHTML = pageItems.map((c) => this.buildCustomerRowHtml(c)).join('');
    renderIcons(tbody);
    this.attachRowEvents(tbody);
  }

  private buildCustomerRowHtml(c: CustomerSummary): string {
    const isBlocked = c.is_blocked;
    const isSelected = this.selectedCustomer?.customer_phone === c.customer_phone;
    const initial = (c.customer_name || 'P').charAt(0).toUpperCase();

    const blockBadge = isBlocked
      ? '<span class="component-badge component-badge--sm" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">Bloqueado</span>'
      : '<span class="component-badge component-badge--sm" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">Activo</span>';

    return `
      <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-ref="tr-customer-${c.customer_phone}" data-phone="${escapeHtml(c.customer_phone)}">
        <td class="winners-table__td">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-surface-elevated, var(--bg-surface)); display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); font-weight: 700; font-size: 12px; color: var(--text-primary); flex-shrink: 0;">
              ${initial}
            </div>
            <span style="font-weight: 600; color: var(--text-primary);">${escapeHtml(c.customer_name)}</span>
          </div>
        </td>
        <td class="winners-table__td">
          <span style="font-family: var(--sl-font-mono, monospace); font-size: 12.5px; color: var(--text-secondary);">${formatPhone(c.customer_phone)}</span>
        </td>
        <td class="winners-table__td">
          ${c.customer_state ? `<span style="font-size: 12.5px; color: var(--text-secondary);">${escapeHtml(c.customer_state)}</span>` : '<span style="color: var(--text-tertiary); font-size: 12px;">—</span>'}
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm" style="font-family: var(--sl-font-mono, monospace); font-weight: 700;">
            ${c.total_tickets} bol.
          </span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">
            ${c.completed_orders_count} de ${c.total_orders_count}
          </span>
        </td>
        <td class="winners-table__td">
          <span style="font-weight: 700; color: #10b981; font-size: 13px;">${formatCurrency(c.total_spent)}</span>
        </td>
        <td class="winners-table__td">
          ${blockBadge}
        </td>
        <td class="winners-table__td">
          <span style="font-size: 12px; color: var(--text-secondary);">${formatDate(c.last_order_at || c.first_order_at)}</span>
        </td>
      </tr>
    `;
  }

  private attachRowEvents(tbody: HTMLElement): void {
    const rows = tbody.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const phone = row.getAttribute('data-phone');
      if (!phone) return;
      const customer = this.customers.find((c) => c.customer_phone === phone);
      if (!customer) return;

      row.addEventListener('click', () => {
        this.toggleCustomerSelection(customer);
      });

      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        void this.openCustomerDossierModal(phone);
      });
    });
  }

  private async unblockCustomer(phone: string): Promise<void> {
    const res = await deleteApi(`/api/customers/${phone}/block`);
    if (res.success) {
      showToast('Cliente retirado de la lista negra.', 'success');
      void this.loadCustomers();
      void this.loadKpis();
    } else {
      showToast(res.error || 'Error al desbloquear cliente.', 'danger');
    }
  }

  private async openCustomerDossierModal(phone: string): Promise<void> {
    const res = await getApi<CustomerDetail>(`/api/customers/${phone}`);
    if (!res.success || !res.data) {
      showToast(res.error || 'No se pudo cargar el expediente del participante.', 'danger');
      return;
    }

    const { customer, orders } = res.data;
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'customer-dossier-layout';

    const whatsappDigits = customer.customer_phone.replace(/\D/g, '');
    const whatsappLink = `https://wa.me/52${whatsappDigits}`;

    const ordersHtml =
      orders.length > 0
        ? orders
            .map((ord) => {
              const isPaid = ord.status === 'completed';
              const isRev = ord.status === 'in_review';
              const isPend = ord.status === 'pending_payment';
              const statusColor = isPaid ? '#10b981' : isRev ? '#3b82f6' : isPend ? '#f59e0b' : '#ef4444';
              const statusText = isPaid ? 'Liquidada' : isRev ? 'En Revisión' : isPend ? 'Pendiente' : 'Cancelada';

              return `
                <div class="customer-order-item">
                  <div class="customer-order-item__info">
                    <span class="customer-order-item__title">Folio ORD-${ord.uuid.slice(0, 8).toUpperCase()} • ${escapeHtml(ord.giveaway_title)}</span>
                    <div class="customer-order-item__meta">
                      <span>${formatDate(ord.created_at)}</span>
                      <span>•</span>
                      <span>${ord.ticket_count} boletos</span>
                      <span>•</span>
                      <strong style="color: var(--text-primary);">${formatCurrency(ord.total_amount)}</strong>
                    </div>
                  </div>
                  <div>
                    <span class="component-badge component-badge--sm" style="background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}40;">${statusText}</span>
                  </div>
                </div>
              `;
            })
            .join('')
        : '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">Sin órdenes registradas.</p>';

    bodyContainer.innerHTML = `
      <div class="customer-dossier-stats">
        <div class="customer-dossier-stat-box">
          <span style="font-size: 11px; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase;">Total Invertido</span>
          <strong style="font-size: 16px; color: #10b981;">${formatCurrency(customer.total_spent)}</strong>
        </div>
        <div class="customer-dossier-stat-box">
          <span style="font-size: 11px; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase;">Órdenes Pagadas</span>
          <strong style="font-size: 16px; color: var(--text-primary);">${customer.completed_orders_count} de ${customer.total_orders_count}</strong>
        </div>
        <div class="customer-dossier-stat-box">
          <span style="font-size: 11px; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase;">Boletos Totales</span>
          <strong style="font-size: 16px; color: var(--text-primary);">${customer.total_tickets}</strong>
        </div>
        <div class="customer-dossier-stat-box">
          <span style="font-size: 11px; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase;">Teléfono</span>
          <strong style="font-size: 14px; color: var(--text-primary);">${formatPhone(customer.customer_phone)}</strong>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--text-primary);">Historial de Compras y Apartados</h4>
        <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer" class="component-button component-button--secondary component-button--h32" style="color: #22c55e;">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#call"></use></svg>
          <span>WhatsApp Directo</span>
        </a>
      </div>

      <div class="customer-orders-list">
        ${ordersHtml}
      </div>
    `;

    openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cerrar',
      description: `Participante: ${customer.customer_name} • ${customer.customer_state || 'México'}`,
      size: 'lg',
      title: `Expediente de ${customer.customer_name}`,
    });
    renderIcons(bodyContainer);
  }

  private openBlockCustomerModal(phone: string, name: string): void {
    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
        <p style="margin: 0;">
          ¿Deseas bloquear al cliente <strong>${escapeHtml(name || phone)}</strong> (${formatPhone(phone)})?
        </p>
        <p style="margin: 0; font-size: 12.5px; color: var(--text-tertiary);">
          Al estar en la lista negra, este número telefónico tendrá bloqueada la creación de nuevos apartados en la tienda.
        </p>
        <label class="field" data-ref="field-block-reason">
          <input class="field__input" data-ref="input-block-reason" type="text" placeholder=" " value="Envío recurrente de comprobantes falsos o alterados" />
          <span class="field__label">Motivo de bloqueo</span>
        </label>
      </div>
    `;

    const inputReason = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-block-reason"]');

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--danger',
      confirmText: 'Bloquear y Añadir a Lista Negra',
      description: 'Restricción de comprador.',
      onConfirm: async () => {
        const reason = (inputReason?.value || '').trim() || 'Bloqueado por el administrador.';
        const res = await postApi(`/api/customers/${phone}/block`, {
          customerName: name,
          reason,
        });
        if (res.success) {
          showToast('Cliente añadido a la lista negra.', 'warning');
          void this.loadCustomers();
          void this.loadKpis();
          return true;
        } else {
          showToast(res.error || 'Error al bloquear cliente.', 'danger');
          return false;
        }
      },
      size: 'sm',
      title: 'Bloquear Cliente',
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

export async function createCustomersView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/customers/customers.html');
  const controller = new CustomersController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}

