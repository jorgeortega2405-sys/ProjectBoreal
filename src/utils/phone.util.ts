export function normalizeMexicanPhone(phone: string | null | undefined): string {
  if (!phone) return '';
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

export function validateAndCleanPhone(phone: unknown): string | null {
  if (!phone || typeof phone !== 'string') return null;
  let clean = normalizeMexicanPhone(phone);
  if (!clean || clean.length !== 10) {
    const rawDigits = phone.replace(/\D/g, '');
    if (rawDigits.length >= 10 && rawDigits.length <= 15) {
      clean = rawDigits;
    }
  }
  if (!clean || clean.length < 10 || clean.length > 15) {
    return null;
  }
  return clean;
}
