import { getApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, setupDropdown } from '../utils/dom.util.js';
import Chart from 'chart.js/auto';

interface DashboardStatsData {
  charts: {
    giveawayPerformance: {
      labels: string[];
      progressPcts: number[];
      soldTickets: number[];
      totalTickets: number[];
    };
    orderStatusDistribution: {
      colors: string[];
      counts: number[];
      labels: string[];
    };
    paymentMethods: {
      amounts: number[];
      labels: string[];
    };
    revenueTimeline: {
      labels: string[];
      revenue: number[];
      tickets: number[];
    };
  };
  gatewayStatus: Array<{
    latencyMs: number;
    name: string;
    status: 'operational' | 'degraded' | 'maintenance';
    successRatePct: number;
  }>;
  kpis: {
    activeGiveaways: number;
    averageOrderValue: number;
    averageOrderValueFormatted: string;
    conversionChangePct: number;
    conversionRatePct: number;
    pendingOrdersCount: number;
    revenueChangePct: number;
    ticketsSold: number;
    ticketsSoldChangePct: number;
    totalRevenue: number;
    totalRevenueFormatted: string;
  };
  period: string;
  recentOrders: Array<{
    createdAt: string;
    currency: string;
    customerName: string;
    customerPhone: string;
    giveawayTitle: string;
    id: string;
    status: 'completed' | 'in_review' | 'pending_payment' | 'expired' | 'cancelled';
    ticketCount: number;
    totalAmount: number;
  }>;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-MX').format(num);
}

export class DashboardController implements ViewController {
  private abortController: AbortController | null = null;
  private activePeriod = '30d';
  private chartGiveaways: Chart | null = null;
  private chartTiers: Chart | null = null;
  private chartTrends: Chart | null = null;
  private container: HTMLElement;
  private currentData: DashboardStatsData | null = null;
  private periodDropdownController: DropdownController | null = null;
  private themeObserver: MutationObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();
    const periodWrapper = this.container.querySelector<HTMLElement>('[data-ref="period-dropdown-wrapper"]');
    if (periodWrapper) {
      this.periodDropdownController = setupDropdown(periodWrapper, {
        isSelect: false,
        matchWidth: false,
        placement: 'bottom-end',
      });
    }
    this.bindEvents();
    renderIcons(this.container);
    this.setupThemeObserver();
    requestAnimationFrame(() => {
      void this.loadStats(this.activePeriod);
    });
  }

  bindEvents(): void {
    const signal = this.abortController?.signal;

    const periodBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-period]');
    periodBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const target = e.currentTarget as HTMLButtonElement;
          const period = target.getAttribute('data-period');
          if (period && period !== this.activePeriod) {
            this.activePeriod = period;
            periodBtns.forEach((b) => {
              b.classList.remove('is-active');
            });
            target.classList.add('is-active');
            this.periodDropdownController?.close();
            void this.loadStats(this.activePeriod);
          }
        },
        { signal }
      );
    });

    const refreshBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-dashboard"]');
    refreshBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        const icon = refreshBtn.querySelector('[data-ref="icon-refresh"]');
        icon?.classList.add('admin-refresh-spin');
        void this.loadStats(this.activePeriod).finally(() => {
          setTimeout(() => {
            icon?.classList.remove('admin-refresh-spin');
          }, 600);
        });
      },
      { signal }
    );
  }

  private setupThemeObserver(): void {
    this.themeObserver = new MutationObserver(() => {
      if (this.currentData) {
        this.renderCharts(this.currentData.charts);
      }
    });

    this.themeObserver.observe(document.documentElement, {
      attributeFilter: ['data-theme', 'class'],
      attributes: true,
    });
  }

  private async loadStats(period: string): Promise<void> {
    const res = await getApi<DashboardStatsData>(`/api/dashboard/stats?period=${encodeURIComponent(period)}`);
    if (!res.success || !res.data) {
      showToast(res.error || 'No se pudieron cargar las métricas.', 'danger');
      return;
    }

    this.currentData = res.data;
    this.populateCards(res.data.kpis);
    this.renderCharts(res.data.charts);
    this.renderRecentOrders(res.data.recentOrders);
    this.renderGatewayStatus(res.data.gatewayStatus);
  }

  private populateCards(kpis: DashboardStatsData['kpis']): void {
    const elRevenue = this.container.querySelector<HTMLElement>('[data-ref="stat-revenue-value"]');
    const elRevenueTrend = this.container.querySelector<HTMLElement>('[data-ref="stat-revenue-trend"]');

    if (elRevenue) elRevenue.textContent = kpis.totalRevenueFormatted;
    if (elRevenueTrend) {
      const sign = kpis.revenueChangePct >= 0 ? '+' : '';
      elRevenueTrend.textContent = `${sign}${kpis.revenueChangePct}% vs mes`;
      elRevenueTrend.style.color = 'var(--text-secondary)';
      elRevenueTrend.style.background = 'var(--bg-card-subtle, var(--bg-surface-elevated))';
    }

    const elTickets = this.container.querySelector<HTMLElement>('[data-ref="stat-tickets-value"]');
    const elTicketsTrend = this.container.querySelector<HTMLElement>('[data-ref="stat-tickets-trend"]');

    if (elTickets) elTickets.textContent = formatNumber(kpis.ticketsSold);
    if (elTicketsTrend) {
      const sign = kpis.ticketsSoldChangePct >= 0 ? '+' : '';
      elTicketsTrend.textContent = `${sign}${kpis.ticketsSoldChangePct}% vs ayer`;
      elTicketsTrend.style.color = 'var(--text-secondary)';
      elTicketsTrend.style.background = 'var(--bg-card-subtle, var(--bg-surface-elevated))';
    }

    const elGiveaways = this.container.querySelector<HTMLElement>('[data-ref="stat-giveaways-value"]');
    if (elGiveaways) elGiveaways.textContent = formatNumber(kpis.activeGiveaways);

    const elPending = this.container.querySelector<HTMLElement>('[data-ref="stat-pending-value"]');
    if (elPending) elPending.textContent = formatNumber(kpis.pendingOrdersCount);
  }

  private renderCharts(charts: DashboardStatsData['charts']): void {
    this.destroyCharts();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
    const tooltipBg = isDark ? '#1e293b' : '#ffffff';
    const tooltipText = isDark ? '#f8fafc' : '#0f172a';
    const tooltipBorder = isDark ? '#334155' : '#e2e8f0';

    const canvasTrends = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-trends"]');
    if (canvasTrends) {
      this.chartTrends = new Chart(canvasTrends, {
        data: {
          datasets: [
            {
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              borderColor: '#3b82f6',
              borderWidth: 2.5,
              data: charts.revenueTimeline.revenue,
              fill: true,
              label: 'Ingresos ($ MXN)',
              pointBackgroundColor: '#3b82f6',
              pointHoverRadius: 6,
              pointRadius: 3,
              tension: 0.35,
              yAxisID: 'y',
            },
            {
              backgroundColor: 'rgba(234, 88, 12, 0.08)',
              borderColor: '#ea580c',
              borderWidth: 2.5,
              data: charts.revenueTimeline.tickets,
              fill: true,
              label: 'Boletos Vendidos',
              pointBackgroundColor: '#ea580c',
              pointHoverRadius: 6,
              pointRadius: 3,
              tension: 0.35,
              yAxisID: 'y1',
            },
          ],
          labels: charts.revenueTimeline.labels,
        },
        options: {
          animation: { duration: 600 },
          interaction: { intersect: false, mode: 'index' },
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderWidth: 1,
              bodyColor: tooltipText,
              cornerRadius: 10,
              padding: 10,
              titleColor: tooltipText,
              callbacks: {
                label: (ctx) => {
                  const val = Number(ctx.raw || 0);
                  if (ctx.datasetIndex === 0) {
                    return ` Ingresos: ${new Intl.NumberFormat('es-MX', { currency: 'MXN', style: 'currency' }).format(val)}`;
                  }
                  return ` Boletos: ${formatNumber(val)}`;
                },
              },
            },
          },
          responsive: true,
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { color: textColor, font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              position: 'left',
              ticks: {
                callback: (val) => {
                  const n = Number(val);
                  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
                },
                color: textColor,
                font: { size: 11 },
                precision: 0,
              },
            },
            y1: {
              beginAtZero: true,
              grid: { display: false },
              position: 'right',
              ticks: {
                callback: (val) => {
                  const n = Number(val);
                  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
                },
                color: textColor,
                font: { size: 11 },
                precision: 0,
              },
            },
          },
        },
        type: 'line',
      });
    }

    const canvasTiers = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-tiers"]');
    if (canvasTiers) {
      const { orderStatusDistribution } = charts;
      const totalOrders = orderStatusDistribution.counts.reduce((a, b) => a + b, 0);
      const doughnutData = totalOrders > 0 ? orderStatusDistribution.counts : [1];
      const doughnutColors = totalOrders > 0
        ? orderStatusDistribution.colors
        : [isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'];
      const doughnutLabels = totalOrders > 0 ? orderStatusDistribution.labels : ['Sin órdenes'];

      this.chartTiers = new Chart(canvasTiers, {
        data: {
          datasets: [
            {
              backgroundColor: doughnutColors,
              borderColor: isDark ? '#18181b' : '#ffffff',
              borderWidth: 2,
              data: doughnutData,
              hoverOffset: totalOrders > 0 ? 6 : 0,
            },
          ],
          labels: doughnutLabels,
        },
        options: {
          animation: { duration: 600 },
          cutout: '72%',
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderWidth: 1,
              bodyColor: tooltipText,
              cornerRadius: 10,
              padding: 10,
              titleColor: tooltipText,
              callbacks: {
                label: (ctx) => {
                  if (totalOrders === 0) return ' Sin órdenes registradas';
                  const val = Number(ctx.raw || 0);
                  const pct = ((val / totalOrders) * 100).toFixed(1);
                  return ` ${ctx.label}: ${formatNumber(val)} (${pct}%)`;
                },
              },
            },
          },
          responsive: true,
        },
        type: 'doughnut',
      });

      const completedEl = this.container.querySelector<HTMLElement>('[data-ref="status-count-completed"]');
      const inReviewEl = this.container.querySelector<HTMLElement>('[data-ref="status-count-in-review"]');
      const pendingEl = this.container.querySelector<HTMLElement>('[data-ref="status-count-pending"]');
      const cancelledEl = this.container.querySelector<HTMLElement>('[data-ref="status-count-cancelled"]');

      if (completedEl) completedEl.textContent = formatNumber(orderStatusDistribution.counts[0] ?? 0);
      if (inReviewEl) inReviewEl.textContent = formatNumber(orderStatusDistribution.counts[1] ?? 0);
      if (pendingEl) pendingEl.textContent = formatNumber(orderStatusDistribution.counts[2] ?? 0);
      if (cancelledEl) cancelledEl.textContent = formatNumber(orderStatusDistribution.counts[3] ?? 0);
    }

    const canvasGiveaways = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-giveaways"]');
    if (canvasGiveaways) {
      const { giveawayPerformance } = charts;
      const shortLabels = giveawayPerformance.labels.map((l) => (l.length > 20 ? l.slice(0, 18) + '...' : l));

      this.chartGiveaways = new Chart(canvasGiveaways, {
        data: {
          datasets: [
            {
              backgroundColor: '#ea580c',
              borderRadius: 6,
              data: giveawayPerformance.soldTickets,
              label: 'Boletos Pagados',
            },
            {
              backgroundColor: isDark ? '#27272a' : '#e4e4e7',
              borderRadius: 6,
              data: giveawayPerformance.totalTickets,
              label: 'Cupo Total',
            },
          ],
          labels: shortLabels,
        },
        options: {
          animation: { duration: 600 },
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                boxHeight: 10,
                boxWidth: 10,
                color: textColor,
                font: { size: 11 },
                padding: 12,
              },
              position: 'top',
            },
            tooltip: {
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderWidth: 1,
              bodyColor: tooltipText,
              cornerRadius: 10,
              padding: 10,
              titleColor: tooltipText,
              callbacks: {
                label: (ctx) => {
                  const val = Number(ctx.raw || 0);
                  return ` ${ctx.dataset.label}: ${formatNumber(val)} boletos`;
                },
              },
            },
          },
          responsive: true,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                callback: (value) => {
                  const num = Number(value);
                  return num >= 1000 ? `${Math.round(num / 1000)}k` : `${num}`;
                },
                color: textColor,
                font: { size: 11 },
                precision: 0,
              },
            },
          },
        },
        type: 'bar',
      });
    }
  }

  private renderRecentOrders(orders: DashboardStatsData['recentOrders']): void {
    const tbody = this.container.querySelector<HTMLTableSectionElement>('[data-ref="table-body-recent-orders"]');
    if (!tbody) return;

    if (orders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: var(--text-tertiary);">
            No hay órdenes registradas en este periodo.
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = orders
      .map((ord) => {
        let badgeClass = 'giveaway-badge';
        if (ord.status === 'completed') badgeClass += ' giveaway-badge--active';
        else if (ord.status === 'in_review') badgeClass += ' giveaway-badge--warning';
        else if (ord.status === 'cancelled' || ord.status === 'expired') badgeClass += ' giveaway-badge--danger';

        const statusLabels: Record<string, string> = {
          cancelled: 'Cancelada',
          completed: 'Pagada',
          expired: 'Expirada',
          in_review: 'En Revisión',
          pending_payment: 'Pendiente',
        };
        const statusLabel = statusLabels[ord.status] || ord.status;

        const dateStr = new Date(ord.createdAt).toLocaleDateString('es-MX', {
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          month: 'short',
        });

        const amountFormatted = new Intl.NumberFormat('es-MX', {
          currency: ord.currency,
          style: 'currency',
        }).format(ord.totalAmount);

        return `
          <tr>
            <td><span class="admin-order-id">${ord.id}</span></td>
            <td>
              <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 600; color: var(--text-primary);">${ord.customerName}</span>
                <span style="font-size: 11px; color: var(--text-tertiary);">${ord.customerPhone}</span>
              </div>
            </td>
            <td><span style="color: var(--text-secondary);">${ord.giveawayTitle}</span></td>
            <td><span style="font-weight: 600;">${formatNumber(ord.ticketCount)} boletos</span></td>
            <td><span style="font-weight: 700; color: var(--text-primary);">${amountFormatted}</span></td>
            <td>
              <span class="${badgeClass}">
                <span>${statusLabel}</span>
              </span>
            </td>
            <td><span style="font-size: 12px; color: var(--text-secondary);">${dateStr}</span></td>
          </tr>
        `;
      })
      .join('');

    tbody.innerHTML = rowsHtml;
  }

  private renderGatewayStatus(gateways: DashboardStatsData['gatewayStatus']): void {
    const list = this.container.querySelector<HTMLElement>('[data-ref="gateway-status-list"]');
    if (!list) return;

    const html = gateways
      .map((gw) => {
        const badgeClass = gw.status === 'operational'
          ? 'giveaway-badge giveaway-badge--active'
          : 'giveaway-badge giveaway-badge--warning';
        const statusText = gw.status === 'operational' ? 'Operativo' : 'Degradado';
        return `
          <div class="admin-gateway-item">
            <div class="admin-gateway-item__info">
              <span class="admin-gateway-item__name">
                <svg class="component-icon" style="width: 14px; height: 14px; color: #10b981;" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>
                ${gw.name}
              </span>
              <div class="admin-gateway-item__metrics">
                <span>Latencia: <strong>${gw.latencyMs}ms</strong></span>
                <span>•</span>
                <span>Efectividad: <strong>${gw.successRatePct}%</strong></span>
              </div>
            </div>
            <span class="${badgeClass}">
              ${statusText}
            </span>
          </div>
        `;
      })
      .join('');

    list.innerHTML = html;
  }

  private destroyCharts(): void {
    if (this.chartTrends) {
      this.chartTrends.destroy();
      this.chartTrends = null;
    }
    if (this.chartTiers) {
      this.chartTiers.destroy();
      this.chartTiers = null;
    }
    if (this.chartGiveaways) {
      this.chartGiveaways.destroy();
      this.chartGiveaways = null;
    }
  }

  destroy(): void {
    if (this.periodDropdownController) {
      this.periodDropdownController.destroy();
      this.periodDropdownController = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    this.destroyCharts();
  }
}

export async function createDashboardView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/dashboard/dashboard.html');
  const controller = new DashboardController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}

export const createHomeView = createDashboardView;
