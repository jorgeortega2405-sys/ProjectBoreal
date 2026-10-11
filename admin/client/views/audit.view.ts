import { getApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';

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

function getActionBadge(action: string): string {
  let cls = 'audit-action-badge--neutral';
  if (action.includes('APPROVED')) cls = 'audit-action-badge--success';
  else if (action.includes('REJECTED') || action.includes('CANCELLED')) cls = 'audit-action-badge--danger';
  else if (action.includes('CREATED')) cls = 'audit-action-badge--info';
  else if (action.includes('GIVEAWAY') || action.includes('DRAWN')) cls = 'audit-action-badge--purple';
  else if (action.includes('LOGIN') || action.includes('ROLE')) cls = 'audit-action-badge--warning';

  return `<span class="audit-action-badge ${cls}">${escapeHtml(action)}</span>`;
}

export class AuditController implements ViewController {
  private abortController: AbortController | null = null;
  private actionFilter = 'all';
  private actorFilter = 'all';
  private availableMonths: string[] = [];
  private container: HTMLElement;
  private eventsList: AuditEventItem[] = [];
  private isCassandraConnected = true;
  private searchQuery = '';
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
    this.eventsList = [];
    this.availableMonths = [];
    this.selectedEvent = null;
  }

  private bindEvents(): void {
    const btnRefreshHeader = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-audit"]');
    btnRefreshHeader?.addEventListener('click', () => this.loadAuditData());

    const btnRefreshTimeline = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-timeline"]');
    btnRefreshTimeline?.addEventListener('click', () => this.loadAuditData());

    const monthSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-audit-month"]');
    monthSelect?.addEventListener('change', () => {
      this.selectedMonth = monthSelect.value;
      this.loadAuditData();
    });

    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-audit"]');
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderEventsTable();
    });

    const actionSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-action-filter"]');
    actionSelect?.addEventListener('change', () => {
      this.actionFilter = actionSelect.value;
      this.renderEventsTable();
    });

    const actorSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-actor-filter"]');
    actorSelect?.addEventListener('change', () => {
      this.actorFilter = actorSelect.value;
      this.renderEventsTable();
    });

    const btnCloseModalDetail = this.container.querySelector<HTMLElement>('[data-ref="btn-close-modal-detail"]');
    const btnCloseDetailView = this.container.querySelector<HTMLElement>('[data-ref="btn-close-detail-view"]');
    btnCloseModalDetail?.addEventListener('click', () => this.closeDetailModal());
    btnCloseDetailView?.addEventListener('click', () => this.closeDetailModal());

    const btnSearchOrderModal = this.container.querySelector<HTMLElement>('[data-ref="btn-search-order-modal"]');
    btnSearchOrderModal?.addEventListener('click', () => this.openSearchOrderModal());

    const btnCloseModalSearchOrder = this.container.querySelector<HTMLElement>('[data-ref="btn-close-modal-search-order"]');
    const btnCancelModalSearchOrder = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-modal-search-order"]');
    btnCloseModalSearchOrder?.addEventListener('click', () => this.closeSearchOrderModal());
    btnCancelModalSearchOrder?.addEventListener('click', () => this.closeSearchOrderModal());

    const formSearchOrder = this.container.querySelector<HTMLFormElement>('[data-ref="form-search-order"]');
    formSearchOrder?.addEventListener('submit', (e) => this.handleSearchOrder(e));
  }

  private async loadAuditData(): Promise<void> {
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
        this.updateKpis(res.data.kpis);
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
    const select = this.container.querySelector<HTMLSelectElement>('[data-ref="select-audit-month"]');
    if (!select) return;

    if (this.availableMonths.length > 0) {
      select.innerHTML = this.availableMonths
        .map(
          (m) =>
            `<option value="${escapeHtml(m)}" ${m === this.selectedMonth ? 'selected' : ''}>${escapeHtml(formatMonthLabel(m))}</option>`
        )
        .join('');
    }
  }

  private updateKpis(kpis?: AuditKpis): void {
    if (!kpis) return;
    const monthEl = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-month-events"]');
    const paymentEl = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-payment-events"]');
    const giveawayEl = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-giveaway-events"]');
    const actorsEl = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-unique-actors"]');

    if (monthEl) monthEl.textContent = String(kpis.totalEvents ?? this.eventsList.length);
    if (paymentEl) paymentEl.textContent = String(kpis.ordersAudited ?? 0);
    if (giveawayEl) giveawayEl.textContent = String(kpis.adminActionsCount ?? 0);
    if (actorsEl) actorsEl.textContent = String(kpis.customersInvolved ?? 0);
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
      footerCount.textContent = `Mostrando ${filtered.length} de ${this.eventsList.length} eventos en la partición ${this.selectedMonth}`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
            No se encontraron eventos registrados en Cassandra para los filtros especificados.
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = filtered
      .map((ev) => {
        const actorLabel = ev.customer_name || ev.actor_name || ev.actor_email || (ev.customer_phone ? `Tel: ${ev.customer_phone}` : ev.actor_type);
        const entityParts: string[] = [];
        if (ev.order_uuid) entityParts.push(`Orden: ${ev.order_uuid.substring(0, 8)}...`);
        else if (ev.order_id) entityParts.push(`Orden #${ev.order_id}`);
        if (ev.amount_formatted) entityParts.push(ev.amount_formatted);
        if (ev.customer_phone && !ev.customer_name) entityParts.push(`Tel: ${ev.customer_phone}`);

        const entityStr = entityParts.length > 0 ? entityParts.join(' • ') : '-';

        return `
          <tr data-event-uuid="${escapeHtml(ev.uuid)}">
            <td><span class="audit-timestamp">${formatDate(ev.created_at)}</span></td>
            <td>${getActionBadge(ev.action)}</td>
            <td>
              <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 600;">${escapeHtml(actorLabel)}</span>
                ${ev.customer_phone && ev.customer_name ? `<span style="font-size: 0.6875rem; color: var(--text-secondary);">${escapeHtml(ev.customer_phone)}</span>` : ''}
              </div>
            </td>
            <td><span class="admins-badge admins-badge--neutral">${escapeHtml((ev.actor_type || 'SYSTEM').toUpperCase())}</span></td>
            <td><code style="font-size: 0.75rem;">${escapeHtml(entityStr)}</code></td>
            <td><span class="audit-ip-tag">${escapeHtml(ev.ip_address || '127.0.0.1')}</span></td>
            <td style="text-align: right;">
              <button type="button" class="component-button component-button--h32 component-button--secondary" data-action="view-detail" data-uuid="${escapeHtml(ev.uuid)}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
                <span>Inspeccionar</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.innerHTML = rowsHtml;
    renderIcons(tbody);

    tbody.querySelectorAll<HTMLButtonElement>('button[data-action="view-detail"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uuid = btn.dataset.uuid;
        const ev = this.eventsList.find((item) => item.uuid === uuid);
        if (ev) {
          this.openDetailModal(ev);
        }
      });
    });
  }

  private openDetailModal(ev: AuditEventItem): void {
    this.selectedEvent = ev;
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-audit-detail"]');
    const textUuid = this.container.querySelector<HTMLElement>('[data-ref="text-detail-uuid"]');
    const valAction = this.container.querySelector<HTMLElement>('[data-ref="detail-val-action"]');
    const valTime = this.container.querySelector<HTMLElement>('[data-ref="detail-val-timestamp"]');
    const valActor = this.container.querySelector<HTMLElement>('[data-ref="detail-val-actor"]');
    const valIp = this.container.querySelector<HTMLElement>('[data-ref="detail-val-ip"]');
    const valUserAgent = this.container.querySelector<HTMLElement>('[data-ref="detail-val-useragent"]');
    const valPayload = this.container.querySelector<HTMLElement>('[data-ref="detail-val-payload"]');

    if (textUuid) textUuid.textContent = `UUID: ${ev.uuid} | Partición: ${this.selectedMonth}`;
    if (valAction) valAction.innerHTML = getActionBadge(ev.action);
    if (valTime) valTime.textContent = formatDate(ev.created_at);
    if (valActor) valActor.textContent = `${ev.customer_name || ev.actor_name || 'Desconocido'} (${ev.customer_phone || ev.actor_email || 'Sin contacto'}) [${ev.actor_type || 'SYSTEM'}]`;
    if (valIp) valIp.textContent = ev.ip_address || '127.0.0.1';
    if (valUserAgent) valUserAgent.textContent = ev.user_agent || 'Desconocido';

    if (valPayload) {
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
      valPayload.textContent = JSON.stringify(combined, null, 2);
    }

    modal?.classList.remove('is-hidden');
  }

  private closeDetailModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-audit-detail"]');
    modal?.classList.add('is-hidden');
    this.selectedEvent = null;
  }

  private openSearchOrderModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-search-order"]');
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-search-order-error"]');
    const results = this.container.querySelector<HTMLElement>('[data-ref="order-timeline-results"]');
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-search-order"]');

    banner?.classList.add('is-hidden');
    results?.classList.add('is-hidden');
    form?.reset();

    modal?.classList.remove('is-hidden');
  }

  private closeSearchOrderModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-search-order"]');
    modal?.classList.add('is-hidden');
  }

  private async handleSearchOrder(e: Event): Promise<void> {
    e.preventDefault();
    const input = this.container.querySelector<HTMLInputElement>('[data-ref="input-order-uuid"]');
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-search-order-error"]');
    const bannerText = this.container.querySelector<HTMLElement>('[data-ref="text-search-order-error"]');
    const resultsBox = this.container.querySelector<HTMLElement>('[data-ref="order-timeline-results"]');
    const eventsList = this.container.querySelector<HTMLElement>('[data-ref="order-events-list"]');

    banner?.classList.add('is-hidden');
    const orderUuid = input?.value.trim() || '';

    if (!orderUuid) {
      if (banner && bannerText) {
        bannerText.textContent = 'Ingresa el UUID o identificador de la orden.';
        banner.classList.remove('is-hidden');
      }
      return;
    }

    try {
      const res = await getApi<{ events: AuditEventItem[] }>(`/api/audit/order/${encodeURIComponent(orderUuid)}`);
      const events = res?.data?.events || [];

      if (events.length === 0) {
        if (banner && bannerText) {
          bannerText.textContent = `No se encontraron eventos forenses en Cassandra para la orden "${orderUuid}".`;
          banner.classList.remove('is-hidden');
        }
        resultsBox?.classList.add('is-hidden');
        return;
      }

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
              <button type="button" class="component-button component-button--h32 component-button--ghost" data-action="view-order-event-detail" data-uuid="${escapeHtml(ev.uuid)}">
                <span>Ver Payload</span>
              </button>
            </div>
          `
          )
          .join('');

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
    } catch (err: any) {
      if (banner && bannerText) {
        bannerText.textContent = err?.message || 'Error al consultar la orden en Apache Cassandra.';
        banner.classList.remove('is-hidden');
      }
    }
  }
}

export async function createAuditView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/audit/audit.html');
  const controller = new AuditController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
