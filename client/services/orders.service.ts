import { BankAccount, Order, ReservationResult } from '../types/order.types.js';

export async function reserveTicketsApi(payload: {
  customerName: string;
  customerPhone: string;
  customerState?: string;
  giveawayUuid: string;
  ticketNumbers: number[];
}): Promise<{
  data?: ReservationResult;
  error?: string;
  success: boolean;
  unavailableTickets?: number[];
}> {
  try {
    const res = await fetch('/api/orders/reserve', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return {
        error: json.error || 'No fue posible apartar los boletos.',
        success: false,
        unavailableTickets: json.data?.unavailableTickets,
      };
    }
    return { data: json.data, success: true };
  } catch (_) {
    return { error: 'Error de conexión al procesar el apartado.', success: false };
  }
}

export async function lookupOrdersApi(phone: string): Promise<Order[]> {
  try {
    const res = await fetch('/api/orders/lookup', {
      body: JSON.stringify({ phone }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? json.data : [];
  } catch (_) {
    return [];
  }
}

export async function uploadReceiptApi(payload: {
  bankReference?: string;
  imageBase64: string;
  orderUuid: string;
  trackingKey?: string;
}): Promise<{ error?: string; order?: Order; success: boolean }> {
  try {
    const res = await fetch('/api/orders/upload-receipt', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { error: json.error || 'Fallo al subir el comprobante.', success: false };
    }
    return { order: json.data, success: true };
  } catch (_) {
    return { error: 'Error de red al enviar el comprobante.', success: false };
  }
}

export async function fetchBankAccountsApi(): Promise<BankAccount[]> {
  try {
    const res = await fetch('/api/orders/bank-accounts');
    if (!res.ok) return [];
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? json.data : [];
  } catch (_) {
    return [];
  }
}
