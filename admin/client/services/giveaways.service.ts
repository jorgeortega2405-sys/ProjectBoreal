import { Giveaway } from '../types/giveaway.types.js';

export async function fetchGiveaways(): Promise<Giveaway[]> {
  try {
    const res = await fetch('/api/giveaways', {
      credentials: 'include',
    });
    if (!res.ok) {
      return [];
    }
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? (json.data as Giveaway[]) : [];
  } catch (_) {
    return [];
  }
}

export async function fetchGiveawayDetail(uuid: string): Promise<Giveaway | null> {
  try {
    const res = await fetch(`/api/giveaways/${encodeURIComponent(uuid)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return json.success && json.data ? (json.data as Giveaway) : null;
  } catch (_) {
    return null;
  }
}

export async function createGiveaway(data: Partial<Giveaway>): Promise<{ error?: string; success: boolean; uuid?: string }> {
  try {
    const res = await fetch('/api/giveaways', {
      body: JSON.stringify(data),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        error: json.error || 'No se pudo crear el sorteo.',
        success: false,
      };
    }
    return {
      success: true,
      uuid: json.data?.uuid,
    };
  } catch (_) {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}

export async function updateGiveaway(uuid: string, data: Partial<Giveaway>): Promise<{ error?: string; success: boolean }> {
  try {
    const res = await fetch(`/api/giveaways/${encodeURIComponent(uuid)}`, {
      body: JSON.stringify(data),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        error: json.error || 'No se pudo actualizar el sorteo.',
        success: false,
      };
    }
    return { success: true };
  } catch (_) {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}
