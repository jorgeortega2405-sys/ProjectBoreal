import { BankAccount, CreateBankAccountInput, GiveawayOption, UpdateBankAccountInput } from '../types/bank-accounts.types.js';

export async function fetchBankAccounts(): Promise<BankAccount[]> {
  try {
    const res = await fetch('/api/bank-accounts', { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.accounts) ? (data.accounts as BankAccount[]) : [];
  } catch {
    return [];
  }
}

export async function fetchGiveawaysForAssignment(): Promise<GiveawayOption[]> {
  try {
    const res = await fetch('/api/bank-accounts/giveaways', { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.giveaways) ? (data.giveaways as GiveawayOption[]) : [];
  } catch {
    return [];
  }
}

export async function createBankAccount(
  data: CreateBankAccountInput
): Promise<{ account?: BankAccount; error?: string; success: boolean }> {
  try {
    const res = await fetch('/api/bank-accounts', {
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        error: json.error || 'No se pudo registrar la cuenta bancaria.',
        success: false,
      };
    }
    return {
      account: json.account,
      success: true,
    };
  } catch {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}

export async function updateBankAccount(
  uuid: string,
  data: UpdateBankAccountInput
): Promise<{ error?: string; success: boolean }> {
  try {
    const res = await fetch(`/api/bank-accounts/${encodeURIComponent(uuid)}`, {
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        error: json.error || 'No se pudo actualizar la cuenta bancaria.',
        success: false,
      };
    }
    return { success: true };
  } catch {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}

export async function toggleBankAccount(
  uuid: string,
  isActive: boolean
): Promise<{ error?: string; success: boolean }> {
  try {
    const res = await fetch(`/api/bank-accounts/${encodeURIComponent(uuid)}/toggle`, {
      body: JSON.stringify({ is_active: isActive }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        error: json.error || 'No se pudo cambiar el estado de la cuenta.',
        success: false,
      };
    }
    return { success: true };
  } catch {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}

export async function deleteBankAccount(
  uuid: string
): Promise<{ error?: string; success: boolean }> {
  try {
    const res = await fetch(`/api/bank-accounts/${encodeURIComponent(uuid)}`, {
      credentials: 'include',
      method: 'DELETE',
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        error: json.error || 'No se pudo eliminar la cuenta bancaria.',
        success: false,
      };
    }
    return { success: true };
  } catch {
    return {
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    };
  }
}
