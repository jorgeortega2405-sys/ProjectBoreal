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
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnRefresh: HTMLButtonElement | null = null;
  private btnResetSearch: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private customers: CustomerSummary[] = [];
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
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-customers"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    this.btnRefresh = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-customers"]');
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
        void this.loadCustomers();
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
        this.renderCustomers();
      } else {
        showToast(res.error || 'No se pudieron cargar los participantes.', 'danger');
      }
    } catch (_) {
      showToast('Error de conexión al cargar clientes.', 'danger');
    }
  }

  private renderCustomers(): void {
    const gridContainer = this.container.querySelector<HTMLElement>('[data-ref="customers-grid-container"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="customers-empty-state"]');

    if (!gridContainer) return;

    if (this.customers.length === 0) {
      gridContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    gridContainer.innerHTML = this.customers.map((c) => this.buildCustomerCardHtml(c)).join('');
    renderIcons(gridContainer);
    this.attachCardEvents(gridContainer);
  }

  private buildCustomerCardHtml(c: CustomerSummary): string {
    const isBlocked = c.is_blocked;
    const initial = (c.customer_name || 'P').charAt(0).toUpperCase();

    const blockBadge = isBlocked
      ? '<span class="giveaway-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">Bloqueado</span>'
      : '<span class="giveaway-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">Activo</span>';

    return `
      <div class="customer-card ${isBlocked ? 'customer-card--blocked' : ''}" data-ref="card-customer-${c.customer_phone}" data-phone="${escapeHtml(c.customer_phone)}">
        <div class="customer-card__header">
          <div class="customer-card__profile">
            <div class="customer-card__avatar">${initial}</div>
            <div class="customer-card__info">
              <h3 class="customer-card__name">${escapeHtml(c.customer_name)}</h3>
              <span class="customer-card__phone">${formatPhone(c.customer_phone)}</span>
              ${c.customer_state ? `<span class="customer-card__state-badge">${escapeHtml(c.customer_state)}</span>` : ''}
            </div>
          </div>
          ${blockBadge}
        </div>

        <div class="customer-card__stats-grid">
          <div class="customer-card__stat-item">
            <span class="customer-card__stat-label">Total Gastado</span>
            <span class="customer-card__stat-val" style="color: #10b981;">${formatCurrency(c.total_spent)}</span>
          </div>
          <div class="customer-card__stat-item">
            <span class="customer-card__stat-label">Pagadas</span>
            <span class="customer-card__stat-val">${c.completed_orders_count}</span>
          </div>
          <div class="customer-card__stat-item">
            <span class="customer-card__stat-label">Boletos</span>
            <span class="customer-card__stat-val">${c.total_tickets}</span>
          </div>
        </div>

        <div class="customer-card__footer">
          <button type="button" class="component-button component-button--black component-button--h34" data-ref="btn-dossier-${c.customer_phone}" data-phone="${escapeHtml(c.customer_phone)}">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
            <span>Ver Expediente</span>
          </button>

          ${
            isBlocked
              ? `
                <button type="button" class="component-button component-button--secondary component-button--h34" data-ref="btn-unblock-${c.customer_phone}" data-phone="${escapeHtml(c.customer_phone)}">
                  <span>Desbloquear</span>
                </button>
              `
              : `
                <button type="button" class="component-button component-button--danger component-button--h34 component-button--icon-only" data-ref="btn-block-${c.customer_phone}" data-phone="${escapeHtml(c.customer_phone)}" data-name="${escapeHtml(c.customer_name)}" data-tooltip="Bloquear / Lista Negra" aria-label="Bloquear / Lista Negra">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#block"></use></svg>
                </button>
              `
          }
        </div>
      </div>
    `;
  }

  private attachCardEvents(container: HTMLElement): void {
    const dossierBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-dossier-"]');
    dossierBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const phone = btn.getAttribute('data-phone');
        if (phone) void this.openCustomerDossierModal(phone);
      });
    });

    const blockBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-block-"]');
    blockBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const phone = btn.getAttribute('data-phone');
        const name = btn.getAttribute('data-name') || '';
        if (phone) this.openBlockCustomerModal(phone, name);
      });
    });

    const unblockBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-unblock-"]');
    unblockBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const phone = btn.getAttribute('data-phone');
        if (!phone) return;
        const res = await deleteApi(`/api/customers/${phone}/block`);
        if (res.success) {
          showToast('Cliente retirado de la lista negra.', 'success');
          void this.loadCustomers();
          void this.loadKpis();
        } else {
          showToast(res.error || 'Error al desbloquear cliente.', 'danger');
        }
      });
    });
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

    const ordersHtml = orders.length > 0
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
                  <span class="giveaway-badge" style="background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}40;">${statusText}</span>
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
