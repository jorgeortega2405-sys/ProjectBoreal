export type OrderStatus =
  | 'pending_payment'
  | 'in_review'
  | 'completed'
  | 'expired'
  | 'cancelled';

export type TicketStatus = 'available' | 'reserved' | 'paid';

export interface Order {
  id?: number;
  uuid: string;
  giveaway_id: number;
  giveaway_title?: string;
  giveaway_uuid?: string;
  customer_name: string;
  customer_phone: string;
  ticket_count: number;
  ticket_numbers: number[];
  total_amount: number;
  currency: string;
  concept_reference: string;
  status: OrderStatus;
  expires_at: string;
  receipt_url: string | null;
  receipt_filename?: string | null;
  has_receipt?: boolean;
  tracking_key: string | null;
  bank_reference: string | null;
  created_at: string;
  giveaway_status?: string;
  is_winner?: number;
  updated_at: string;
  winner_name?: string | null;
  winner_ticket_number?: number | null;
}

export interface BankAccount {
  id: number;
  uuid: string;
  bank_name: string;
  account_holder: string;
  account_type: 'clabe' | 'card' | 'both';
  clabe: string | null;
  account_number: string | null;
  card_number: string | null;
  currency: string;
  is_active: number;
  created_at: string;
  updated_at?: string;
}

export interface ReservationResult {
  order: Order;
  bankAccounts: BankAccount[];
}
