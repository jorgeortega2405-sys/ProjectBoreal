import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import { RowDataPacket } from 'mysql2';

export interface DashboardKpis {
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
}

export interface RevenueTimelineData {
  labels: string[];
  revenue: number[];
  tickets: number[];
}

export interface OrderStatusDistributionData {
  colors: string[];
  counts: number[];
  labels: string[];
}

export interface GiveawayPerformanceData {
  labels: string[];
  progressPcts: number[];
  soldTickets: number[];
  totalTickets: number[];
}

export interface PaymentMethodsData {
  amounts: number[];
  labels: string[];
}

export interface RecentOrderSummary {
  createdAt: string;
  currency: string;
  customerName: string;
  customerPhone: string;
  giveawayTitle: string;
  id: string;
  status: 'completed' | 'in_review' | 'pending_payment' | 'expired' | 'cancelled';
  ticketCount: number;
  totalAmount: number;
}

export interface GatewayStatusItem {
  latencyMs: number;
  name: string;
  status: 'operational' | 'degraded' | 'maintenance';
  successRatePct: number;
}

export interface DashboardStatsResponse {
  charts: {
    giveawayPerformance: GiveawayPerformanceData;
    orderStatusDistribution: OrderStatusDistributionData;
    paymentMethods: PaymentMethodsData;
    revenueTimeline: RevenueTimelineData;
  };
  gatewayStatus: GatewayStatusItem[];
  kpis: DashboardKpis;
  period: string;
  recentOrders: RecentOrderSummary[];
}

function formatCurrency(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(amount) + ` ${currency}`;
}

function maskPhone(phone: string): string {
  if (!phone) return '•••• ----';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 4) return '•••• ' + clean;
  return `•••• ${clean.slice(-4)}`;
}

function buildTimeline(period: string, rows: RowDataPacket[]): RevenueTimelineData {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : period === 'year' ? 365 : 30;
  const labels: string[] = [];
  const revenue: number[] = [];
  const tickets: number[] = [];

  const rowMap = new Map<string, { revenue: number; tickets: number }>();
  for (const r of rows) {
    const key = String(r.date_key || '');
    rowMap.set(key, {
      revenue: Number(r.revenue || 0),
      tickets: Number(r.tickets || 0),
    });
  }

  const step = period === 'year' ? 30 : period === '90d' ? 7 : 1;
  const totalPoints = Math.min(30, Math.ceil(days / step));
  const now = new Date();

  for (let i = totalPoints - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * step);
    const dateKey = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }));
    const match = rowMap.get(dateKey) || { revenue: 0, tickets: 0 };
    revenue.push(match.revenue);
    tickets.push(match.tickets);
  }

  return { labels, revenue, tickets };
}

export class DashboardService {
  async getDashboardStats(period = '30d'): Promise<DashboardStatsResponse> {
    let days = 30;
    if (period === '7d') days = 7;
    else if (period === '90d') days = 90;
    else if (period === 'year') days = 365;

    const [kpiRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        COALESCE(SUM(CASE WHEN \`status\` = 'completed' THEN \`total_amount\` ELSE 0 END), 0) AS totalRevenue,
        COALESCE(SUM(CASE WHEN \`status\` = 'completed' THEN \`ticket_count\` ELSE 0 END), 0) AS ticketsSold,
        COUNT(CASE WHEN \`status\` IN ('in_review', 'pending_payment') THEN 1 END) AS pendingOrdersCount,
        COUNT(CASE WHEN \`status\` = 'completed' THEN 1 END) AS completedOrdersCount,
        COUNT(*) AS totalOrdersCount,
        COALESCE(AVG(CASE WHEN \`status\` = 'completed' THEN \`total_amount\` END), 0) AS averageOrderValue
       FROM \`orders\`
       WHERE \`created_at\` >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    const [giveawaysRows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS activeGiveaways FROM \`giveaways\` WHERE \`status\` = 'active'"
    );

    const [timelineRows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(\`created_at\`) AS date_key,
              COALESCE(SUM(CASE WHEN \`status\` = 'completed' THEN \`total_amount\` ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN \`status\` = 'completed' THEN \`ticket_count\` ELSE 0 END), 0) AS tickets
       FROM \`orders\`
       WHERE \`created_at\` >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(\`created_at\`)
       ORDER BY date_key ASC`,
      [days]
    );

    const [statusRows] = await pool.query<RowDataPacket[]>(
      `SELECT \`status\`, COUNT(*) AS count
       FROM \`orders\`
       WHERE \`created_at\` >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY \`status\``,
      [days]
    );

    const [giveawayPerfRows] = await pool.query<RowDataPacket[]>(
      `SELECT g.\`title\`, g.\`total_tickets\`,
              (g.\`total_tickets\` - g.\`available_tickets\`) AS sold_tickets
       FROM \`giveaways\` g
       ORDER BY g.\`created_at\` DESC
       LIMIT 5`
    );

    const [recentRows] = await pool.query<RowDataPacket[]>(
      `SELECT o.\`uuid\`, o.\`customer_name\`, o.\`customer_phone\`, o.\`ticket_count\`,
              o.\`total_amount\`, o.\`currency\`, o.\`status\`, o.\`created_at\`,
              COALESCE(g.\`title\`, 'Sorteo') AS giveaway_title
       FROM \`orders\` o
       LEFT JOIN \`giveaways\` g ON o.\`giveaway_id\` = g.\`id\`
       ORDER BY o.\`created_at\` DESC
       LIMIT 8`
    );

    const [paymentRows] = await pool.query<RowDataPacket[]>(
      'SELECT `bank_name` AS method_name FROM `bank_accounts` WHERE `is_active` = 1 ORDER BY `id` ASC'
    );

    const kpi = kpiRows[0] || {};
    const totalRev = Number(kpi.totalRevenue || 0);
    const tickets = Number(kpi.ticketsSold || 0);
    const pending = Number(kpi.pendingOrdersCount || 0);
    const completed = Number(kpi.completedOrdersCount || 0);
    const totalOrders = Number(kpi.totalOrdersCount || 0);
    const aov = Number(kpi.averageOrderValue || 0);
    const activeGw = Number(giveawaysRows[0]?.activeGiveaways || 0);
    const conversion = totalOrders > 0 ? Math.round((completed / totalOrders) * 1000) / 10 : 0;

    const statusCounts: Record<string, number> = {
      cancelled: 0,
      completed: 0,
      expired: 0,
      in_review: 0,
      pending_payment: 0,
    };
    for (const r of statusRows) {
      statusCounts[r.status] = Number(r.count || 0);
    }

    const orderStatusDistribution: OrderStatusDistributionData = {
      colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
      counts: [
        statusCounts.completed || 0,
        statusCounts.in_review || 0,
        statusCounts.pending_payment || 0,
        (statusCounts.cancelled || 0) + (statusCounts.expired || 0),
      ],
      labels: ['Completadas', 'En Revisión', 'Pendientes', 'Canceladas / Expiradas'],
    };

    const giveawayPerformance: GiveawayPerformanceData = {
      labels: giveawayPerfRows.map((r) => r.title),
      progressPcts: giveawayPerfRows.map((r) => {
        const total = Number(r.total_tickets || 1);
        const sold = Number(r.sold_tickets || 0);
        return Math.min(100, Math.round((sold / total) * 100));
      }),
      soldTickets: giveawayPerfRows.map((r) => Number(r.sold_tickets || 0)),
      totalTickets: giveawayPerfRows.map((r) => Number(r.total_tickets || 0)),
    };

    const recentOrders: RecentOrderSummary[] = recentRows.map((r) => ({
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      currency: r.currency || 'MXN',
      customerName: r.customer_name || 'Cliente',
      customerPhone: maskPhone(r.customer_phone || ''),
      giveawayTitle: r.giveaway_title,
      id: `ORD-${String(r.uuid || '').slice(0, 8).toUpperCase()}`,
      status: r.status,
      ticketCount: Number(r.ticket_count || 1),
      totalAmount: Number(r.total_amount || 0),
    }));

    const paymentLabels = paymentRows.length > 0 ? paymentRows.map((r) => r.method_name) : ['Mercado Pago', 'BBVA', 'Santander'];
    const paymentAmounts = paymentLabels.map(() => 0);

    const gatewayStatus: GatewayStatusItem[] = [
      {
        latencyMs: 38,
        name: 'SPEI Banxico Gateway',
        status: 'operational',
        successRatePct: 100,
      },
      {
        latencyMs: 65,
        name: 'Receptor BBVA Webhook',
        status: 'operational',
        successRatePct: 100,
      },
      {
        latencyMs: 92,
        name: 'Mercado Pago Checkout',
        status: 'operational',
        successRatePct: 100,
      },
    ];

    return {
      charts: {
        giveawayPerformance,
        orderStatusDistribution,
        paymentMethods: {
          amounts: paymentAmounts,
          labels: paymentLabels,
        },
        revenueTimeline: buildTimeline(period, timelineRows),
      },
      gatewayStatus,
      kpis: {
        activeGiveaways: activeGw,
        averageOrderValue: aov,
        averageOrderValueFormatted: formatCurrency(aov),
        conversionChangePct: 0,
        conversionRatePct: conversion,
        pendingOrdersCount: pending,
        revenueChangePct: 0,
        ticketsSold: tickets,
        ticketsSoldChangePct: 0,
        totalRevenue: totalRev,
        totalRevenueFormatted: formatCurrency(totalRev),
      },
      period,
      recentOrders,
    };
  }
}

export const dashboardService = new DashboardService();
