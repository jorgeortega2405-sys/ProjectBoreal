export interface PaginationMeta {
  currentPage: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  pagination?: PaginationMeta;
  success: boolean;
}

export async function getApi<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      const errorJson = await res.json().catch(() => null);
      return {
        data: errorJson?.data,
        error: errorJson?.error || 'Error al obtener los datos del servidor.',
        success: false,
      };
    }
    const json = await res.json();
    if (!json.success) {
      return {
        data: json.data,
        error: json.error || 'Error al obtener los datos.',
        success: false,
      };
    }
    return { data: json.data, pagination: json.pagination, success: true };
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
        success: false,
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

export async function putApi<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return {
        data: json.data,
        error: json.error || 'Error al procesar la solicitud.',
        success: false,
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

export async function patchApi<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return {
        data: json.data,
        error: json.error || 'Error al procesar la solicitud.',
        success: false,
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

export async function deleteApi<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return {
        data: json.data,
        error: json.error || 'Error al procesar la solicitud.',
        success: false,
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
