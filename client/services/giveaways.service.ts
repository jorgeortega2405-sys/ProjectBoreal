import { Giveaway, WinnerGiveawayItem } from '../types/giveaway.types.js';

export async function fetchActiveGiveaways(): Promise<Giveaway[]> {
  try {
    const res = await fetch('/api/giveaways');
    if (!res.ok) {
      return [];
    }
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? json.data : [];
  } catch (_) {
    return [];
  }
}

export async function fetchWinnersGiveaways(): Promise<WinnerGiveawayItem[]> {
  try {
    const res = await fetch('/api/giveaways/winners');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data as WinnerGiveawayItem[];
      }
    }

    const fallbackRes = await fetch('/api/giveaways');
    if (fallbackRes.ok) {
      const json = await fallbackRes.json();
      if (json.success && Array.isArray(json.data)) {
        const completed: WinnerGiveawayItem[] = json.data
          .filter((g: Giveaway) => g.status === 'completed' && g.winner_ticket_number !== null && g.winner_ticket_number !== undefined)
          .map((g: Giveaway) => ({
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
        if (completed.length > 0) {
          return completed;
        }
      }
    }

    return [];
  } catch (_) {
    return [];
  }
}

export async function fetchGiveawayDetail(uuid: string): Promise<Giveaway | null> {
  try {
    const res = await fetch(`/api/giveaways/${encodeURIComponent(uuid)}`);
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return json.success && json.data ? (json.data as Giveaway) : null;
  } catch (_) {
    return null;
  }
}

export interface GiveawayTicketsData {
  paid: number[];
  reserved: number[];
  total: number;
}

export async function fetchGiveawayTickets(uuid: string): Promise<GiveawayTicketsData | null> {
  try {
    const res = await fetch(`/api/giveaways/${encodeURIComponent(uuid)}/tickets`);
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return json.success && json.data ? (json.data as GiveawayTicketsData) : null;
  } catch (_) {
    return null;
  }
}

