export interface LanguageOption {
  code: string;
  name: string;
}

export const AVAILABLE_LANGUAGES: LanguageOption[] = [
  { code: 'es-MX', name: 'Español (México)' },
];

export function getLanguageName(_code?: string | null): string {
  return 'Español (México)';
}

export function detectBrowserLanguage(): string {
  return 'es-MX';
}

