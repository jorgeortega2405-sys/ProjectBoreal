export interface AdminSafeUser {
  email: string;
  id: number;
  name: string;
  uuid: string;
}

let currentUser: AdminSafeUser | null = null;

export function getCurrentUser(): AdminSafeUser | null {
  return currentUser;
}

export function setCurrentUser(user: AdminSafeUser | null): void {
  currentUser = user;
}

export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
    });
    if (!res.ok) {
      currentUser = null;
      return false;
    }
    const data = await res.json();
    if (data.authenticated && data.user) {
      currentUser = data.user;
      return true;
    }
    currentUser = null;
    return false;
  } catch {
    currentUser = null;
    return false;
  }
}

export async function login(email: string, password: string): Promise<{ error?: string; success: boolean }> {
  try {
    const res = await fetch('/api/auth/login', {
      body: JSON.stringify({ email, password }),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        error: data.error || 'Credenciales inválidas.',
        success: false,
      };
    }

    if (data.authenticated && data.user) {
      currentUser = data.user;
      return { success: true };
    }

    return { error: 'Respuesta inesperada del servidor.', success: false };
  } catch {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      credentials: 'include',
      method: 'POST',
    });
  } catch {}
  currentUser = null;
}
