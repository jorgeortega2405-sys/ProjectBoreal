import { AdminUser, LoginResponseData, MeResponseData } from '../types/auth.types.js';
import { ApiResponse, getApi, postApi } from './api.service.js';

let currentUser: AdminUser | null = null;
let isAuthChecked = false;
let checkAuthPromise: Promise<AdminUser | null> | null = null;

export async function checkAuth(force = false): Promise<AdminUser | null> {
  if (isAuthChecked && !force) {
    return currentUser;
  }

  if (checkAuthPromise && !force) {
    return checkAuthPromise;
  }

  checkAuthPromise = (async () => {
    try {
      const res = await getApi<MeResponseData>('/api/auth/me');
      if (res.success && res.data?.user) {
        currentUser = res.data.user;
      } else {
        currentUser = null;
      }
    } catch {
      currentUser = null;
    } finally {
      isAuthChecked = true;
      checkAuthPromise = null;
    }
    return currentUser;
  })();

  return checkAuthPromise;
}

export async function login(email: string, password: string): Promise<ApiResponse<LoginResponseData>> {
  const res = await postApi<LoginResponseData>('/api/auth/login', {
    email: email.trim(),
    password,
  });

  if (res.success && res.data?.user) {
    currentUser = res.data.user;
    isAuthChecked = true;
    window.dispatchEvent(new CustomEvent('admin:auth-change', { detail: { user: currentUser } }));
  }

  return res;
}

export async function logout(): Promise<void> {
  try {
    await postApi('/api/auth/logout');
  } catch {}

  currentUser = null;
  isAuthChecked = true;
  window.dispatchEvent(new CustomEvent('admin:auth-change', { detail: { user: null } }));
}

export function getCurrentUser(): AdminUser | null {
  return currentUser;
}

export function isAuthenticated(): boolean {
  return Boolean(currentUser);
}

export function clearAuthState(): void {
  currentUser = null;
  isAuthChecked = true;
  window.dispatchEvent(new CustomEvent('admin:auth-change', { detail: { user: null } }));
}
