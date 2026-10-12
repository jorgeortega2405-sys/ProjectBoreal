export type GiveawayStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface Giveaway {
  available_tickets: number;
  countdown_hours: number;
  created_at: string;
  currency: string;
  description: string | null;
  draw_date: string | null;
  end_date: string;
  id: number;
  image_urls: string[] | null;
  min_threshold_pct: number;
  primary_image_url: string;
  slug: string;
  start_date: string;
  status: GiveawayStatus;
  threshold_reached_at: string | null;
  ticket_price: number;
  title: string;
  total_tickets: number;
  updated_at: string;
  uuid: string;
  winner_announced_at?: string | null;
  winner_name?: string | null;
  winner_order_id?: number | null;
  winner_ticket_number?: number | null;
}
