export function formatShortDate(dateStr: string | null | undefined, lang = 'es-MX'): string {
  if (!dateStr) return '';
  const clean = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
  const d = new Date(clean);
  if (isNaN(d.getTime())) return dateStr;
  const locale = lang.startsWith('en') ? 'en-US' : 'es-MX';
  const day = d.getDate();
  const monthName = d.toLocaleDateString(locale, { month: 'short' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');
  return `${day} ${capitalizedMonth}`;
}

export function formatDate(dateStr: string | null | undefined, locale = 'es-MX'): string {
  if (!dateStr) return '';
  try {
    const clean = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
    const d = new Date(clean);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch (_) {
    return '';
  }
}

export function formatWinnerDate(dateStr: string | null | undefined, lang = 'es-MX'): string {
  return formatShortDate(dateStr, lang);
}

