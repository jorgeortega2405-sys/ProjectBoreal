export function normalizeMexicanPhone(phone: string | null | undefined): string {
  if (!phone || String(phone).includes('*')) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('521') && digits.length === 13) {
    return digits.slice(3);
  }
  if (digits.startsWith('52') && digits.length === 12) {
    return digits.slice(2);
  }
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function formatMexicanPhone(phone: string | null | undefined): string {
  if (!phone || String(phone).includes('*')) return '';
  const digits = normalizeMexicanPhone(phone);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
}
