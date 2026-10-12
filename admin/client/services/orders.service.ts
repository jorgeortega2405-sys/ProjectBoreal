import { OrdersListResponse, SpeiQueueItem } from '../types/order.types.js';

export async function fetchAdminOrders(options: {
  limit?: number;
  page?: number;
  search?: string;
  status?: string;
} = {}): Promise<OrdersListResponse> {
  try {
    const params = new URLSearchParams();
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));
    if (options.status && options.status !== 'all') params.set('status', options.status);
    if (options.search && options.search.trim()) params.set('search', options.search.trim());

    const url = `/api/orders?${params.toString()}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      return { orders: [], page: 1, total: 0, totalPages: 1 };
    }
    const data = await res.json();
    return {
      orders: Array.isArray(data.orders) ? data.orders : [],
      page: Number(data.page) || 1,
      total: Number(data.total) || 0,
      totalPages: Number(data.totalPages) || 1,
    };
  } catch {
    return { orders: [], page: 1, total: 0, totalPages: 1 };
  }
}

export async function approveAdminOrder(
  uuid: string
): Promise<{ error?: string; message?: string; success: boolean }> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(uuid)}/approve`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        error: data.error || 'No se pudo aprobar la orden.',
        success: false,
      };
    }
    return {
      message: data.message || 'Pago aprobado exitosamente.',
      success: true,
    };
  } catch {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}

export async function cancelAdminOrder(
  uuid: string,
  reason?: string
): Promise<{ error?: string; message?: string; success: boolean }> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(uuid)}/cancel`, {
      body: JSON.stringify({ reason }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        error: data.error || 'No se pudo cancelar la orden.',
        success: false,
      };
    }
    return {
      message: data.message || 'Orden cancelada y boletos liberados exitosamente.',
      success: true,
    };
  } catch {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}

export async function fetchSpeiQueue(): Promise<SpeiQueueItem[]> {
  try {
    const res = await fetch('/api/orders/spei-queue', { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.queue) ? (data.queue as SpeiQueueItem[]) : [];
  } catch {
    return [];
  }
}

export async function triggerSpeiBatch(): Promise<{ message?: string; processed?: number; success: boolean }> {
  try {
    const res = await fetch('/api/orders/spei-queue/trigger', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false };
    }
    return {
      message: data.message,
      processed: data.processed,
      success: true,
    };
  } catch {
    return { success: false };
  }
}
