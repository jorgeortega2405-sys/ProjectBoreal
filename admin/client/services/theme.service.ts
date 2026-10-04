const STORAGE_KEY = 'boreal_theme';
let currentThemeSetting = 'system';

export function getEffectiveTheme(setting = currentThemeSetting): 'dark' | 'light' {
  if (setting === 'dark') return 'dark';
  if (setting === 'light') return 'light';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function getTheme(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ['system', 'light', 'dark'].includes(saved)) {
      return saved;
    }
  } catch {}
  return currentThemeSetting || 'system';
}

function applyThemeToDom(themeSetting: string): void {
  if (typeof document === 'undefined') return;
  const effective = getEffectiveTheme(themeSetting);
  document.documentElement.setAttribute('data-theme', effective);
  document.documentElement.classList.toggle('dark-theme', effective === 'dark');
  document.documentElement.classList.toggle('light-theme', effective === 'light');

  window.dispatchEvent(
    new CustomEvent('themechange', {
      detail: { effective, setting: themeSetting },
    })
  );
}

export function setTheme(newTheme: string): void {
  if (!['system', 'light', 'dark'].includes(newTheme)) {
    newTheme = 'system';
  }

  currentThemeSetting = newTheme;

  try {
    localStorage.setItem(STORAGE_KEY, newTheme);
  } catch {}

  applyThemeToDom(newTheme);
}

export function toggleTheme(): void {
  const current = getTheme();
  const effective = getEffectiveTheme(current);
  const next = effective === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

export function initTheme(): void {
  const initial = getTheme();
  currentThemeSetting = initial;
  applyThemeToDom(initial);

  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentThemeSetting === 'system') {
        applyThemeToDom('system');
      }
    });
  }
}
