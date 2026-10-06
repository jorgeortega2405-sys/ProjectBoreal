export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  salesClosed?: boolean;
  success: boolean;
  unavailableTickets?: number[];
}

export async function getApi<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint);
    const json = await res.json();
    if (!res.ok || !json.success) {
      return {
        data: json.data,
        error: json.error || 'Error al obtener los datos.',
        success: false,
      };
    }
    return { data: json.data, success: true };
  } catch (_) {
    return { error: 'Error de red o conexión al servidor.', success: false };
  }
}

export async function postApi<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return {
        data: json.data,
        error: json.error || 'Error al procesar la solicitud.',
        salesClosed: json.salesClosed,
        success: false,
        unavailableTickets: json.data?.unavailableTickets || json.unavailableTickets,
      };
    }
    return {
      data: json.data,
      message: json.message,
      success: true,
    };
  } catch (_) {
    return { error: 'Error de conexión al enviar la solicitud.', success: false };
  }
}
