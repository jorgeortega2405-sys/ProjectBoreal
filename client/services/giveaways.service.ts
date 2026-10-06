import { DailyGiveawayWinnerItem, Giveaway, WinnerGiveawayItem } from '../types/giveaway.types.js';
import { getApi } from './api.service.js';

export interface GiveawayTicketsData {
  paid: number[];
  reserved: number[];
  total: number;
}

export interface DailyGiveawayPayload {
  giveaway: Giveaway;
  recentWinners: DailyGiveawayWinnerItem[];
}

export async function fetchActiveGiveaways(): Promise<Giveaway[]> {
  const res = await getApi<Giveaway[]>('/api/giveaways');
  return res.success && Array.isArray(res.data) ? res.data : [];
}

export async function fetchWinnersGiveaways(): Promise<WinnerGiveawayItem[]> {
  const res = await getApi<WinnerGiveawayItem[]>('/api/giveaways/winners');
  if (res.success && Array.isArray(res.data)) {
    return res.data;
  }

  const fallbackRes = await getApi<Giveaway[]>('/api/giveaways');
  if (fallbackRes.success && Array.isArray(fallbackRes.data)) {
    return fallbackRes.data
      .filter((g) => g.status === 'completed' && g.winner_ticket_number !== null && g.winner_ticket_number !== undefined)
      .map((g) => ({
        currency: g.currency,
        customer_state: 'México',
        draw_date: g.draw_date,
        end_date: g.end_date,
        image_urls: g.image_urls,
        primary_image_url: g.primary_image_url,
        slug: g.slug,
        ticket_price: g.ticket_price,
        title: g.title,
        total_tickets: g.total_tickets,
        uuid: g.uuid,
        winner_announced_at: g.winner_announced_at || null,
        winner_name: g.winner_name || null,
        winner_ticket_number: g.winner_ticket_number || null,
      }));
  }

  return [];
}

export async function fetchGiveawayDetail(uuid: string): Promise<Giveaway | null> {
  const res = await getApi<Giveaway>(`/api/giveaways/${encodeURIComponent(uuid)}`);
  return res.success && res.data ? res.data : null;
}

export async function fetchGiveawayTickets(uuid: string): Promise<GiveawayTicketsData | null> {
  const res = await getApi<GiveawayTicketsData>(`/api/giveaways/${encodeURIComponent(uuid)}/tickets`);
  return res.success && res.data ? res.data : null;
}

export async function fetchDailyGiveaway(): Promise<DailyGiveawayPayload | null> {
  const res = await getApi<DailyGiveawayPayload>('/api/giveaways/daily');
  return res.success && res.data ? res.data : null;
}

export async function fetchDailyWinners(limit = 5): Promise<DailyGiveawayWinnerItem[]> {
  const res = await getApi<DailyGiveawayWinnerItem[]>(`/api/giveaways/daily/winners?limit=${limit}`);
  return res.success && Array.isArray(res.data) ? res.data : [];
}
