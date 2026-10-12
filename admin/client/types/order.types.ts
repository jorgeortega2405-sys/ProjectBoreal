export type OrderStatus = 'pending_payment' | 'in_review' | 'completed' | 'expired' | 'cancelled';

export interface AdminOrder {
  bank_reference: string | null;
  concept_reference: string;
  created_at: string;
  currency: string;
  customer_name: string;
  customer_phone: string;
  expires_at: string;
  giveaway_id: number;
  giveaway_slug: string;
  giveaway_title: string;
  giveaway_uuid: string;
  id: number;
  is_winner: number;
  receipt_filename: string | null;
  receipt_url: string | null;
  status: OrderStatus;
  ticket_count: number;
  ticket_numbers: number[];
  total_amount: number;
  tracking_key: string | null;
  updated_at: string;
  uuid: string;
}

export interface OrdersListResponse {
  orders: AdminOrder[];
  page: number;
  total: number;
  totalPages: number;
}

export interface SpeiQueueItem {
  attempts: number;
  banxico_response: Record<string, unknown> | null;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  expected_amount: number;
  giveaway_title: string;
  id: number;
  last_checked_at: string | null;
  max_attempts: number;
  next_retry_at: string;
  order_id: number;
  order_status: OrderStatus;
  order_uuid: string;
  status: 'pending' | 'verifying' | 'matched' | 'failed' | 'expired';
  tracking_key: string;
}

export interface DashboardMetrics {
  active_giveaways_count: number;
  in_review_orders_count: number;
  total_revenue_mxn: number;
  total_revenue_usd: number;
  total_tickets_sold: number;
}

export interface DashboardAlert {
  countdown_hours?: number;
  end_date?: string;
  giveaway_title?: string;
  giveaway_uuid?: string;
  id: string;
  message: string;
  severity: 'warning' | 'info' | 'critical';
  threshold_pct?: number;
  type: 'threshold_countdown' | 'giveaway_closing' | 'pending_reviews';
}

export interface DashboardStatsResponse {
  alerts: DashboardAlert[];
  metrics: DashboardMetrics;
  recent_orders: AdminOrder[];
}
