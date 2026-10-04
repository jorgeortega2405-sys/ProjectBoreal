import { AuditLogsResponse } from '../types/audit.types.js';

export async function fetchAuditLogs(options: {
  action?: string;
  actorType?: string;
  limit?: number;
  page?: number;
  search?: string;
} = {}): Promise<AuditLogsResponse> {
  try {
    const params = new URLSearchParams();
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));
    if (options.actorType && options.actorType !== 'all') params.set('actorType', options.actorType);
    if (options.action && options.action.trim()) params.set('action', options.action.trim());
    if (options.search && options.search.trim()) params.set('search', options.search.trim());

    const url = `/api/audit?${params.toString()}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      return { logs: [], page: 1, success: false, total: 0, totalPages: 1 };
    }
    const data = await res.json();
    return {
      logs: Array.isArray(data.logs) ? data.logs : [],
      page: Number(data.page) || 1,
      success: true,
      total: Number(data.total) || 0,
      totalPages: Number(data.totalPages) || 1,
    };
  } catch {
    return { logs: [], page: 1, success: false, total: 0, totalPages: 1 };
  }
}
