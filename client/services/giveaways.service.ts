import { Giveaway } from '../types/giveaway.types.js';

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

