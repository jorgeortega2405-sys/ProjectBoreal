import { DashboardStatsResponse } from '../types/order.types.js';

export async function fetchDashboardStats(): Promise<DashboardStatsResponse | null> {
  try {
    const res = await fetch('/api/dashboard/stats', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data as DashboardStatsResponse;
  } catch {
    return null;
  }
}
