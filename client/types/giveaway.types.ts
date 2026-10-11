export type GiveawayStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type GiveawayType = 'standard' | 'daily';

export interface Giveaway {
  available_tickets: number;
  countdown_hours: number;
  created_at: string;
  currency: string;
  current_pot?: number;
  description: string | null;
  draw_date: string | null;
  end_date: string;
  id: number;
  image_urls: string[] | null;
  min_threshold_pct: number;
  package_options?: number[] | null;
  pot_percentage?: number;
  primary_image_url: string;
  prize_amount?: number | null;
  slug: string;
  start_date: string;
  status: GiveawayStatus;
  threshold_reached_at: string | null;
  ticket_price: number;
  title: string;
  total_tickets: number;
  type?: GiveawayType;
  updated_at: string;
  uuid: string;
  winner_announced_at?: string | null;
  winner_name?: string | null;
  winner_order_id?: number | null;
  winner_ticket_number?: number | null;
}

export interface WinnerGiveawayItem {
  currency: string;
  customer_state?: string | null;
  delivered_at?: string | null;
  delivery_status?: 'pending_contact' | 'contacted' | 'claimed' | 'delivered' | null;
  draw_date: string | null;
  end_date: string;
  evidence_image_url?: string | null;
  image_urls: string[] | null;
  primary_image_url: string;
  prize_amount?: number | null;
  slug: string;
  testimonial?: string | null;
  ticket_price: number;
  title: string;
  total_tickets: number;
  uuid: string;
  winner_announced_at: string | null;
  winner_name: string | null;
  winner_ticket_number: number | null;
}

export interface DailyGiveawayWinnerItem {
  country?: string | null;
  customer_city?: string | null;
  customer_phone_masked?: string | null;
  customer_state?: string | null;
  draw_date: string | null;
  prize_amount: number;
  title: string;
  uuid: string;
  winner_announced_at: string | null;
  winner_name: string | null;
  winner_ticket_number: number | null;
}
