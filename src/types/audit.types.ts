export type AuditAction =
  | 'ORDER_RESERVED'
  | 'RECEIPT_ATTACHED'
  | 'SPEI_KEY_SUBMITTED'
  | 'PAYMENT_LIQUIDATED'
  | 'PAYMENT_REJECTED'
  | 'ORDER_EXPIRED'
  | 'ORDER_LOOKUP'
  | 'ORDER_DETAILS_ACCESSED'
  | 'GIVEAWAY_WINNER_DRAWN';

export type AuditActorType = 'customer' | 'system' | 'admin';

export interface CreateAuditLogInput {
  order_id?: number | null;
  order_uuid?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  action: AuditAction;
  actor_type?: AuditActorType;
  ip_address?: string;
  user_agent?: string;
  previous_status?: string | null;
  new_status?: string | null;
  amount?: number | null;
  currency?: string | null;
  details?: Record<string, unknown> | null;
}

export interface AuditLogRecord {
  id: number;
  uuid: string;
  order_id: number | null;
  order_uuid: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  action: AuditAction;
  actor_type: AuditActorType;
  ip_address: string;
  user_agent: string;
  previous_status: string | null;
  new_status: string | null;
  amount: number | null;
  currency: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}
