import { AdminOrder, DashboardAlert, DashboardStatsResponse, OrderStatus } from '../types/order.types.js';
import { fetchDashboardStats } from '../services/dashboard.service.js';
import { loadTemplate } from '../services/template.service.js';
import { navigate } from '../app-router.js';
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

function getStatusBadge(status: OrderStatus): { bg: string; color: string; label: string } {
  switch (status) {
    case 'in_review':
      return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: 'En revisión' };
    case 'completed':
      return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', label: 'Completado' };
    case 'pending_payment':
      return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Pendiente' };
    case 'cancelled':
      return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Cancelado' };
    case 'expired':
    default:
      return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', label: 'Expirado' };
  }
}

class DashboardViewController implements ViewController {
  private abortController: AbortController | null = null;
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    renderIcons(this.element);
    await this.loadStats();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const btnRefresh = this.element.querySelector<HTMLElement>('[data-ref="btn-refresh-dashboard"]');
    btnRefresh?.addEventListener(
      'click',
      () => {
        this.loadStats();
      },
      { signal }
    );

    const btnViewAll = this.element.querySelector<HTMLElement>('[data-ref="btn-view-all-orders"]');
    btnViewAll?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/ordenes');
      },
      { signal }
    );

    const kpiReviews = this.element.querySelector<HTMLElement>('[data-ref="kpi-reviews"]');
    kpiReviews?.addEventListener(
      'click',
      () => {
        navigate('/ordenes');
      },
      { signal }
    );

    const kpiGiveaways = this.element.querySelector<HTMLElement>('[data-ref="kpi-giveaways"]');
    kpiGiveaways?.addEventListener(
      'click',
      () => {
        navigate('/sorteos');
      },
      { signal }
    );

    const recentBody = this.element.querySelector<HTMLElement>('[data-ref="dashboard-recent-body"]');
    recentBody?.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        const btnReview = target.closest<HTMLElement>('.btn-recent-review');
        if (btnReview) {
          navigate('/ordenes');
        }
      },
      { signal }
    );

    const alertsList = this.element.querySelector<HTMLElement>('[data-ref="dashboard-alerts-list"]');
    alertsList?.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest<HTMLElement>('.dashboard-alert-item');
        const uuid = item?.getAttribute('data-giveaway-uuid');
        if (uuid) {
          navigate(`/sorteo/${uuid}/edit`);
        }
      },
      { signal }
    );
  }

  private async loadStats(): Promise<void> {
    const skeleton = this.element.querySelector<HTMLElement>('[data-ref="dashboard-skeleton"]');
    const tableWrapper = this.element.querySelector<HTMLElement>('[data-ref="dashboard-recent-table-wrapper"]');
    const emptyState = this.element.querySelector<HTMLElement>('[data-ref="dashboard-recent-empty"]');

    if (skeleton) skeleton.style.display = 'flex';
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';

    try {
      const stats = await fetchDashboardStats();
      if (!stats) return;

      this.renderKPIs(stats);
      this.renderAlerts(stats.alerts);
      this.renderRecentOrders(stats.recent_orders);
    } catch {
      if (skeleton) skeleton.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
    }
  }

  private renderKPIs(stats: DashboardStatsResponse): void {
    const valRev = this.element.querySelector<HTMLElement>('[data-ref="kpi-val-revenue"]');
    const subRev = this.element.querySelector<HTMLElement>('[data-ref="kpi-sub-revenue"]');
    const valTickets = this.element.querySelector<HTMLElement>('[data-ref="kpi-val-tickets"]');
    const valGiveaways = this.element.querySelector<HTMLElement>('[data-ref="kpi-val-giveaways"]');
    const valReviews = this.element.querySelector<HTMLElement>('[data-ref="kpi-val-reviews"]');

    if (valRev) valRev.textContent = `$${stats.metrics.total_revenue_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
    if (subRev) subRev.textContent = `$${stats.metrics.total_revenue_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    if (valTickets) valTickets.textContent = stats.metrics.total_tickets_sold.toLocaleString();
    if (valGiveaways) valGiveaways.textContent = String(stats.metrics.active_giveaways_count);
    if (valReviews) {
      valReviews.textContent = String(stats.metrics.in_review_orders_count);
      const card = this.element.querySelector<HTMLElement>('[data-ref="kpi-reviews"]');
      if (card) {
        card.classList.toggle('has-pending-reviews', stats.metrics.in_review_orders_count > 0);
      }
    }
  }

  private renderAlerts(alerts: DashboardAlert[]): void {
    const alertsSection = this.element.querySelector<HTMLElement>('[data-ref="dashboard-alerts-section"]');
    const alertsList = this.element.querySelector<HTMLElement>('[data-ref="dashboard-alerts-list"]');

    if (!alertsSection || !alertsList) return;

    if (alerts.length === 0) {
      alertsSection.style.display = 'none';
      return;
    }

    alertsSection.style.display = 'block';
    alertsList.innerHTML = alerts
      .map((alert) => {
        const severityClass = `dashboard-alert-item--${alert.severity}`;
        const iconName = alert.severity === 'critical' ? 'timer' : 'notifications';
        const isClickable = Boolean(alert.giveaway_uuid);

        return `
          <div class="dashboard-alert-item ${severityClass} ${isClickable ? 'is-clickable' : ''}" data-ref="alert-${alert.id}" ${alert.giveaway_uuid ? `data-giveaway-uuid="${alert.giveaway_uuid}"` : ''}>
            <div class="dashboard-alert-item__icon-box">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${iconName}"></use></svg>
            </div>
            <div class="dashboard-alert-item__content">
              <span class="dashboard-alert-item__message">${escapeHtml(alert.message)}</span>
              ${alert.end_date ? `<span class="dashboard-alert-item__sub">Cierre límite: ${new Date(alert.end_date).toLocaleString()}</span>` : ''}
            </div>
            ${isClickable ? `
              <button type="button" class="component-button component-button--h32 component-button--secondary dashboard-alert-item__action" data-ref="btn-alert-edit">
                <span>Editar</span>
                <svg class="component-icon component-button__icon" aria-hidden="true"><use href="/icons.svg#arrow_forward"></use></svg>
              </button>
            ` : ''}
          </div>
        `;
      })
      .join('');

    renderIcons(alertsList);
  }

  private renderRecentOrders(recentOrders: AdminOrder[]): void {
    const skeleton = this.element.querySelector<HTMLElement>('[data-ref="dashboard-skeleton"]');
    const tableWrapper = this.element.querySelector<HTMLElement>('[data-ref="dashboard-recent-table-wrapper"]');
    const emptyState = this.element.querySelector<HTMLElement>('[data-ref="dashboard-recent-empty"]');
    const tbody = this.element.querySelector<HTMLElement>('[data-ref="dashboard-recent-body"]');

    if (skeleton) skeleton.style.display = 'none';

    if (recentOrders.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (tbody) {
      tbody.innerHTML = recentOrders
        .map((order) => {
          const badge = getStatusBadge(order.status);
          return `
            <tr class="order-row" data-ref="recent-row-${order.uuid}">
              <td class="order-cell-ref">
                <span class="order-ref-main">${escapeHtml(order.concept_reference)}</span>
              </td>
              <td class="order-cell-customer">
                <span class="order-customer-name">${escapeHtml(order.customer_name)}</span>
              </td>
              <td class="order-cell-giveaway">
                <span class="order-giveaway-title" title="${escapeHtml(order.giveaway_title)}">${escapeHtml(order.giveaway_title)}</span>
              </td>
              <td class="order-cell-tickets">
                <span class="order-tickets-count">${order.ticket_count} boletos</span>
              </td>
              <td class="order-cell-amount">
                <span class="order-amount-text">$${order.total_amount.toFixed(2)} ${escapeHtml(order.currency)}</span>
              </td>
              <td class="order-cell-status">
                <span class="order-badge" style="background-color: ${badge.bg}; color: ${badge.color};">
                  ${badge.label}
                </span>
              </td>
              <td class="order-cell-date">
                <span class="order-cell-sub">${new Date(order.created_at).toLocaleDateString()}</span>
              </td>
              <td class="order-cell-actions">
                <button type="button" class="component-button component-button--h32 component-button--secondary btn-recent-review" data-ref="btn-recent-review-${order.uuid}" data-uuid="${order.uuid}">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
                  <span>Revisar</span>
                </button>
              </td>
            </tr>
          `;
        })
        .join('');

      renderIcons(tbody);
    }

    if (tableWrapper) tableWrapper.style.display = 'block';
  }
}

export async function createDashboardView(): Promise<HTMLElement> {
  const element = await loadTemplate('/views/dashboard/dashboard.html');
  const controller = new DashboardViewController(element);
  await controller.init();
  (element as any).__controller = controller;
  return element;
}
