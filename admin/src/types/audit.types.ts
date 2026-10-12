export type AuditActorType = 'customer' | 'system' | 'admin';

export interface AuditLogRecord {
  action: string;
  actor_type: AuditActorType;
  amount: number | null;
  created_at: string;
  currency: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  details: Record<string, unknown> | null;
  id: number;
  ip_address: string;
  new_status: string | null;
  order_id: number | null;
  order_uuid: string | null;
  previous_status: string | null;
  user_agent: string;
  uuid: string;
}

export interface AuditLogsResponse {
  logs: AuditLogRecord[];
  page: number;
  total: number;
  totalPages: number;
}
