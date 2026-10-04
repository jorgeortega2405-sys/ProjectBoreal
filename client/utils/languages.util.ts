export interface LanguageOption {
  code: string;
  name: string;
}

export const AVAILABLE_LANGUAGES: LanguageOption[] = [
  { code: 'es-419', name: 'Español (Latinoamérica)' },
  { code: 'en-US', name: 'English (United States)' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'fr-FR', name: 'Français (France)' },
];

export function getLanguageName(code: string | null | undefined): string {
  if (!code) return 'Español (Latinoamérica)';
  const normalized = code.toLowerCase().replace('_', '-');
  const match = AVAILABLE_LANGUAGES.find((l) => l.code.toLowerCase() === normalized);
  if (match) return match.name;
  if (normalized.startsWith('es')) return 'Español (Latinoamérica)';
  if (normalized.startsWith('en')) return 'English (United States)';
  if (normalized.startsWith('pt')) return 'Português (Brasil)';
  if (normalized.startsWith('fr')) return 'Français (France)';
  return 'English (United States)';
}

export function detectBrowserLanguage(): string {
  const browserLangs = navigator.languages || [navigator.language || ''];
  for (const bl of browserLangs) {
    if (!bl) continue;
    const clean = bl.replace('_', '-').toLowerCase();
    if (clean.startsWith('es')) return 'es-419';
    if (clean.startsWith('en')) return 'en-US';
    if (clean.startsWith('pt')) return 'pt-BR';
    if (clean.startsWith('fr')) return 'fr-FR';
  }
  return 'es-419';
}
