export interface FormatNumberOptions {
  decimals?: number;
  fallback?: string;
  locale?: string;
}

export interface FormatCurrencyOptions {
  decimals?: number;
  fallback?: string;
  locale?: string;
  showCurrency?: boolean;
}

export function formatNumber(
  value: number | string | null | undefined,
  options?: FormatNumberOptions
): string {
  if (value === null || value === undefined || value === '') {
    return options?.fallback ?? '0';
  }

  const rawNum = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  if (isNaN(rawNum)) {
    return options?.fallback ?? String(value);
  }

  const locale = options?.locale ?? 'es-MX';
  const decimals = options?.decimals;

  if (typeof decimals === 'number') {
    return rawNum.toLocaleString(locale, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });
  }

  return rawNum.toLocaleString(locale);
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'MXN',
  options?: FormatCurrencyOptions
): string {
  const decimals = options?.decimals ?? 2;
  const formatted = formatNumber(value, {
    decimals,
    fallback: options?.fallback ?? '0.00',
    locale: options?.locale,
  });

  if (options?.showCurrency === false) {
    return `$${formatted}`;
  }

  return `$${formatted} ${currency}`;
}
