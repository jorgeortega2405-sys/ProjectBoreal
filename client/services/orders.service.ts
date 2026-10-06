import { BankAccount, Order, ReservationResult } from '../types/order.types.js';
import { getApi, postApi } from './api.service.js';

export async function reserveTicketsApi(payload: {
  customerName: string;
  customerPhone: string;
  customerState?: string;
  giveawayUuid: string;
  ticketNumbers: number[];
}): Promise<{
  data?: ReservationResult;
  error?: string;
  salesClosed?: boolean;
  success: boolean;
  unavailableTickets?: number[];
}> {
  const res = await postApi<ReservationResult>('/api/orders/reserve', payload);
  if (!res.success) {
    return {
      error: res.error || 'No fue posible apartar los boletos.',
      salesClosed: res.salesClosed,
      success: false,
      unavailableTickets: res.unavailableTickets,
    };
  }
  return { data: res.data, success: true };
}

export async function lookupOrdersApi(phone: string): Promise<Order[]> {
  const res = await postApi<Order[]>('/api/orders/lookup', { phone });
  return res.success && Array.isArray(res.data) ? res.data : [];
}

export async function uploadReceiptApi(payload: {
  bankReference?: string;
  imageBase64: string;
  orderUuid: string;
  trackingKey?: string;
}): Promise<{ error?: string; order?: Order; success: boolean }> {
  const res = await postApi<Order>('/api/orders/upload-receipt', payload);
  if (!res.success) {
    return { error: res.error || 'Fallo al subir el comprobante.', success: false };
  }
  return { order: res.data, success: true };
}

export async function fetchBankAccountsApi(giveawayUuid?: string): Promise<BankAccount[]> {
  const url = giveawayUuid
    ? `/api/orders/bank-accounts?giveaway=${encodeURIComponent(giveawayUuid)}`
    : '/api/orders/bank-accounts';
  const res = await getApi<BankAccount[]>(url);
  return res.success && Array.isArray(res.data) ? res.data : [];
}

export async function fetchOrderDetailApi(uuid: string): Promise<Order | null> {
  const res = await getApi<Order>(`/api/orders/${encodeURIComponent(uuid)}`);
  return res.success && res.data ? res.data : null;
}
