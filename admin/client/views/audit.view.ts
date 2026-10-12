import { openModal } from '../components/modal.component.js';
import { getApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, setupDropdown } from '../utils/dom.util.js';

interface AuditEventItem {
  action: string;
  actor_email?: string;
  actor_name?: string;
  actor_type: string;
  amount?: number | null;
  amount_formatted?: string | null;
  created_at: string;
  currency?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  details?: any;
  id?: string;
  ip_address?: string;
  new_status?: string | null;
  order_id?: number | null;
  order_uuid?: string | null;
  previous_status?: string | null;
  user_agent?: string;
  uuid: string;
}

interface AuditKpis {
  adminActionsCount: number;
  customersInvolved: number;
  ordersAudited: number;
  totalEvents: number;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
    year: 'numeric',
  });
}

function formatMonthLabel(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [year, month] = monthStr.split('-');
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  const monthName = d.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} (${monthStr})`;
}

export class AuditController implements ViewController {
  private abortController: AbortController | null = null;
  private actionFilter = 'all';
  private actorFilter = 'all';
  private availableMonths: string[] = [];
  private container: HTMLElement;
  private defaultActions: HTMLElement | null = null;
  private eventsList: AuditEventItem[] = [];
  private filterDropdownController: DropdownController | null = null;
  private isCassandraConnected = true;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private selectedActions: HTMLElement | null = null;
  private selectedEvent: AuditEventItem | null = null;
  private selectedMonth = '';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    await this.loadAuditData();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.filterDropdownController?.destroy();
    this.filterDropdownController = null;
    this.eventsList = [];
    this.availableMonths = [];
    this.selectedEvent = null;
    this.defaultActions = null;
    this.selectedActions = null;
  }

  private bindEvents(): void {
    const btnRefreshHeader = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-audit"]');
    btnRefreshHeader?.addEventListener('click', () => {
      this.deselectAll();
      void this.loadAuditData();
    });

    const filterWrapper = this.container.querySelector<HTMLElement>('[data-ref="filter-dropdown-wrapper"]');
    if (filterWrapper) {
      this.filterDropdownController = setupDropdown(filterWrapper, {
        isSelect: false,
        matchWidth: false,
        placement: 'bottom-end',
      });
    }

    const btnToggleSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-audit"]');
    const btnClearSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-clear-search"]');

    btnToggleSearch?.addEventListener('click', () => {
      const isHidden = searchToolbar?.classList.toggle('is-hidden');
      if (!isHidden) {
        searchInput?.focus();
      } else if (this.searchQuery) {
        this.searchQuery = '';
        if (searchInput) searchInput.value = '';
        btnClearSearch?.classList.add('is-hidden');
        this.renderEventsTable();
      }
    });

    searchInput?.addEventListener('input', () => {
      const val = searchInput.value;
      btnClearSearch?.classList.toggle('is-hidden', !val);

      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.searchQuery = val.trim().toLowerCase();
        this.renderEventsTable();
      }, 250);
    });

    btnClearSearch?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      btnClearSearch.classList.add('is-hidden');
      this.searchQuery = '';
      this.renderEventsTable();
      searchInput?.focus();
    });

    const actorButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-actor-filter]');
    actorButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.actorFilter = btn.getAttribute('data-actor-filter') || 'all';
        actorButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
        this.filterDropdownController?.close();
        this.renderEventsTable();
      });
    });

    const actionButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-action-filter]');
    actionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.actionFilter = btn.getAttribute('data-action-filter') || 'all';
        actionButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
        this.filterDropdownController?.close();
        this.renderEventsTable();
      });
    });

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="audit-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="audit-selected-actions"]');

    const btnDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    btnDeselect?.addEventListener('click', (e) => {
      e.preventDefault();
      this.deselectAll();
    });

    const btnInspect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-inspect"]');
    btnInspect?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedEvent) this.openDetailModal(this.selectedEvent);
    });

    const btnCopyUuid = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-copy-uuid"]');
    btnCopyUuid?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedEvent) {
        void navigator.clipboard.writeText(this.selectedEvent.uuid);
        showToast('UUID copiado al portapapeles', 'info');
      }
    });

    const btnSearchOrderModal = this.container.querySelector<HTMLElement>('[data-ref="btn-search-order-modal"]');
    btnSearchOrderModal?.addEventListener('click', () => this.openSearchOrderModal());
  }

  private deselectAll(): void {
    this.selectedEvent = null;
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedEvent !== null;
    this.defaultActions?.classList.toggle('is-hidden', isSelected);
    this.selectedActions?.classList.toggle('is-hidden', !isSelected);

    const rows = this.container.querySelectorAll<HTMLElement>('.winners-table__tr[data-event-uuid]');
    rows.forEach((row) => {
      const uuid = row.getAttribute('data-event-uuid');
      row.classList.toggle('is-selected', this.selectedEvent?.uuid === uuid);
    });
  }

  private async loadAuditData(): Promise<void> {
    this.deselectAll();
    try {
      let url = '/api/audit?limit=100';
      if (this.selectedMonth) url += `&month=${encodeURIComponent(this.selectedMonth)}`;

      const res = await getApi<{
        availableMonths: string[];
        events: AuditEventItem[];
        isConnected: boolean;
        kpis: AuditKpis;
        month: string;
      }>(url);

      if (res?.data) {
        this.eventsList = res.data.events || [];
        this.availableMonths = res.data.availableMonths || [];
        this.selectedMonth = res.data.month || this.selectedMonth;
        this.isCassandraConnected = res.data.isConnected;

        this.updateCassandraBadge();
        this.updateMonthSelector();
        this.renderEventsTable();
      }
    } catch (_e) {
      showToast('Error al conectar con la bitácora de auditoría en Cassandra', 'danger');
    }
  }

  private updateCassandraBadge(): void {
    const badge = this.container.querySelector<HTMLElement>('[data-ref="badge-cassandra-status"]');
    const text = this.container.querySelector<HTMLElement>('[data-ref="text-cassandra-status"]');
    if (badge && text) {
      if (this.isCassandraConnected) {
        badge.classList.remove('is-offline');
        text.textContent = 'Cassandra En Línea';
      } else {
        badge.classList.add('is-offline');
        text.textContent = 'Cassandra Desconectado';
      }
    }
  }

  private updateMonthSelector(): void {
    const list = this.container.querySelector<HTMLElement>('[data-ref="filter-months-list"]');
    if (!list) return;

    if (this.availableMonths.length > 0) {
      list.innerHTML = this.availableMonths
        .map(
          (m) =>
            `<button type="button" class="menu-item ${m === this.selectedMonth ? 'is-active' : ''}" data-month-filter="${escapeHtml(m)}">
              <span class="menu-item__text">${escapeHtml(formatMonthLabel(m))}</span>
            </button>`
        )
        .join('');

      list.querySelectorAll<HTMLButtonElement>('[data-month-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = btn.getAttribute('data-month-filter') || '';
          if (m && m !== this.selectedMonth) {
            this.selectedMonth = m;
            list.querySelectorAll('[data-month-filter]').forEach((b) => b.classList.toggle('is-active', b === btn));
            this.filterDropdownController?.close();
            this.loadAuditData();
          }
        });
      });
    }
  }

  private renderEventsTable(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="audit-table-body"]');
    const footerCount = this.container.querySelector<HTMLElement>('[data-ref="text-events-count"]');
    if (!tbody) return;

    let filtered = this.eventsList;

    if (this.searchQuery) {
      filtered = filtered.filter((ev) => {
        const actor = (ev.actor_name || ev.actor_email || ev.customer_name || '').toLowerCase();
        const entity = (ev.order_uuid || String(ev.order_id || '') || '').toLowerCase();
        const phone = (ev.customer_phone || '').toLowerCase();
        const ip = (ev.ip_address || '').toLowerCase();
        const action = (ev.action || '').toLowerCase();
        const detailsStr = JSON.stringify(ev.details || {}).toLowerCase();

        return (
          actor.includes(this.searchQuery) ||
          entity.includes(this.searchQuery) ||
          phone.includes(this.searchQuery) ||
          ip.includes(this.searchQuery) ||
          action.includes(this.searchQuery) ||
          detailsStr.includes(this.searchQuery)
        );
      });
    }

    if (this.actionFilter !== 'all') {
      filtered = filtered.filter((ev) => ev.action === this.actionFilter);
    }

    if (this.actorFilter !== 'all') {
      filtered = filtered.filter((ev) => ev.actor_type?.toUpperCase() === this.actorFilter);
    }

    if (footerCount) {
      footerCount.textContent = `Mostrando ${filtered.length} de ${this.eventsList.length} eventos en partición ${this.selectedMonth}`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr class="winners-table__tr winners-tr--empty">
          <td class="winners-table__td winners-td--empty" colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
            No se encontraron eventos registrados en Cassandra para los filtros especificados.
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = filtered
      .map((ev) => {
        const isSelected = this.selectedEvent?.uuid === ev.uuid;
        const actorLabel = ev.customer_name || ev.actor_name || ev.actor_email || (ev.customer_phone ? `Tel: ${ev.customer_phone}` : ev.actor_type);
        const entityParts: string[] = [];
        if (ev.order_uuid) entityParts.push(`Orden: ${ev.order_uuid.substring(0, 8)}...`);
        else if (ev.order_id) entityParts.push(`Orden #${ev.order_id}`);
        if (ev.amount_formatted) entityParts.push(ev.amount_formatted);
        if (ev.customer_phone && !ev.customer_name) entityParts.push(`Tel: ${ev.customer_phone}`);

        const entityStr = entityParts.length > 0 ? entityParts.join(' • ') : '-';

        return `
          <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-event-uuid="${escapeHtml(ev.uuid)}">
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${formatDate(ev.created_at)}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${escapeHtml(ev.action)}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${escapeHtml(actorLabel)}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${escapeHtml((ev.actor_type || 'SYSTEM').toUpperCase())}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${escapeHtml(entityStr)}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${escapeHtml(ev.ip_address || '127.0.0.1')}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.innerHTML = rowsHtml;
    renderIcons(tbody);

    const rows = tbody.querySelectorAll<HTMLElement>('.winners-table__tr[data-event-uuid]');
    rows.forEach((row) => {
      const uuid = row.getAttribute('data-event-uuid');
      const ev = this.eventsList.find((item) => item.uuid === uuid);
      if (!ev) return;

      row.addEventListener('click', () => {
        if (this.selectedEvent?.uuid === ev.uuid) {
          this.deselectAll();
        } else {
          this.selectedEvent = ev;
          this.updateSelectionUi();
        }
      });

      row.addEventListener('dblclick', () => {
        this.selectedEvent = ev;
        this.updateSelectionUi();
        this.openDetailModal(ev);
      });
    });
  }

  private openDetailModal(ev: AuditEventItem): void {
    this.selectedEvent = ev;
    this.updateSelectionUi();

    const combined = {
      action: ev.action,
      actor_type: ev.actor_type,
      amount: ev.amount,
      amount_formatted: ev.amount_formatted,
      created_at: ev.created_at,
      currency: ev.currency,
      customer_name: ev.customer_name,
      customer_phone: ev.customer_phone,
      details: ev.details,
      ip_address: ev.ip_address,
      new_status: ev.new_status,
      order_id: ev.order_id,
      order_uuid: ev.order_uuid,
      previous_status: ev.previous_status,
      user_agent: ev.user_agent,
    };

    const actorDisplay = `${ev.customer_name || ev.actor_name || 'Desconocido'}${ev.customer_phone || ev.actor_email ? ` (${ev.customer_phone || ev.actor_email})` : ''} [${ev.actor_type || 'SYSTEM'}]`;

    const bodyHtml = `
      <div class="audit-detail-grid">
        <div class="audit-detail-card">
          <span class="audit-detail-card__label">Acción Ejecutada</span>
          <span class="audit-detail-card__val"><span class="component-badge component-badge--sm">${escapeHtml(ev.action)}</span></span>
        </div>
        <div class="audit-detail-card">
          <span class="audit-detail-card__label">Estampa de Tiempo</span>
          <span class="audit-detail-card__val"><span class="component-badge component-badge--sm component-badge--mono-bold">${formatDate(ev.created_at)}</span></span>
        </div>
        <div class="audit-detail-card">
          <span class="audit-detail-card__label">Operador / Actor</span>
          <span class="audit-detail-card__val"><span class="component-badge component-badge--sm">${escapeHtml(actorDisplay)}</span></span>
        </div>
        <div class="audit-detail-card">
          <span class="audit-detail-card__label">Dirección IP de Origen</span>
          <span class="audit-detail-card__val"><span class="component-badge component-badge--sm component-badge--mono-bold">${escapeHtml(ev.ip_address || '127.0.0.1')}</span></span>
        </div>
      </div>

      ${ev.user_agent ? `
      <div class="audit-detail-section" style="margin-top: 14px;">
        <label class="audit-detail-section__title">Navegador y Entorno (User-Agent)</label>
        <div class="audit-detail-raw">${escapeHtml(ev.user_agent)}</div>
      </div>` : ''}

      <div class="audit-detail-section" style="margin-top: 14px;">
        <label class="audit-detail-section__title">Payload Forense y Parámetros Contextuales (JSON)</label>
        <pre class="audit-detail-json">${escapeHtml(JSON.stringify(combined, null, 2))}</pre>
      </div>
    `;

    openModal({
      bodyHtml,
      cancelText: 'Cerrar',
      description: `Partición: ${this.selectedMonth} • UUID: ${ev.uuid}`,
      showConfirm: false,
      size: 'lg',
      title: 'Inspección Forense de Evento',
    });
  }

  private openSearchOrderModal(): void {
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'audit-search-order-container';
    bodyContainer.innerHTML = `
      <p style="margin: 0 0 16px; font-size: 0.875rem; color: var(--text-secondary);">
        Ingresa el UUID o folio de la orden para consultar la pista forense completa en Cassandra (<code>audit_logs_by_order</code>).
      </p>

      <label class="field" data-ref="field-order-uuid">
        <input class="field__input" data-ref="input-order-uuid" type="text" placeholder=" " autocomplete="off" />
        <span class="field__label">Folio / UUID de Orden *</span>
      </label>

      <div class="audit-order-timeline is-hidden" data-ref="order-timeline-results" style="margin-top: 20px;">
        <h3 style="font-size: 0.875rem; font-weight: 700; margin-bottom: 12px; color: var(--text-primary);">
          Resultados de la Orden
        </h3>
        <div class="audit-order-events-list" data-ref="order-events-list"></div>
      </div>
    `;

    const input = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-order-uuid"]');
    const resultsBox = bodyContainer.querySelector<HTMLElement>('[data-ref="order-timeline-results"]');
    const eventsList = bodyContainer.querySelector<HTMLElement>('[data-ref="order-events-list"]');

    const modal = openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cerrar',
      confirmClass: 'component-button--black',
      confirmText: 'Buscar Trazabilidad',
      description: 'Consulta en tiempo real sobre la partición forense de órdenes.',
      onConfirm: async () => {
        const orderUuid = input?.value.trim() || '';
        if (!orderUuid) {
          modal.setError('Ingresa el UUID o identificador de la orden.');
          return false;
        }

        try {
          const res = await getApi<{ events: AuditEventItem[] }>(`/api/audit/order/${encodeURIComponent(orderUuid)}`);
          const events = res?.data?.events || [];

          if (events.length === 0) {
            modal.setError(`No se encontraron eventos forenses en Cassandra para la orden "${orderUuid}".`);
            resultsBox?.classList.add('is-hidden');
            return false;
          }

          modal.setError('');
          resultsBox?.classList.remove('is-hidden');
          if (eventsList) {
            eventsList.innerHTML = events
              .map(
                (ev) => `
                <div class="audit-order-event-card">
                  <div>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">${formatDate(ev.created_at)}</span>
                    <span style="font-weight: 600; font-size: 0.8125rem;">${escapeHtml(ev.action)}</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">Actor: ${escapeHtml(ev.customer_name || ev.actor_name || ev.actor_type)} (${escapeHtml(ev.ip_address || '127.0.0.1')})</span>
                  </div>
                  <button type="button" class="component-button component-button--icon-only component-button--ghost" data-action="view-order-event-detail" data-uuid="${escapeHtml(ev.uuid)}" data-tooltip="Ver detalle" aria-label="Ver detalle">
                    <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
                  </button>
                </div>
              `
              )
              .join('');

            renderIcons(eventsList);

            eventsList.querySelectorAll<HTMLButtonElement>('button[data-action="view-order-event-detail"]').forEach((btn) => {
              btn.addEventListener('click', () => {
                const uuid = btn.dataset.uuid;
                const ev = events.find((item) => item.uuid === uuid);
                if (ev) {
                  this.openDetailModal(ev);
                }
              });
            });
          }
          return false;
        } catch (err: any) {
          modal.setError(err?.message || 'Error al consultar la orden en Apache Cassandra.');
          return false;
        }
      },
      size: 'md',
      title: 'Rastrear Historial de Orden',
    });
  }
}

export async function createAuditView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/audit/audit.html');
  const controller = new AuditController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
