let currentLanguage = 'es';
let translations: Record<string, any> = {};

const FALLBACK_TRANSLATIONS: Record<string, any> = {
  admin: {
    dashboard: 'Dashboard',
    description: 'Panel de administración y gestión para ProjectBoreal',
    empty_desc: 'El panel de administración está listo. Próximamente se integrará la gestión de sorteos.',
    empty_title: 'Dashboard Vacío',
    loading: 'Cargando...',
    title: 'Panel de Control',
  },
  common: {
    back: 'Volver',
    cancel: 'Cancelar',
    close: 'Cerrar',
    continue: 'Continuar',
    save: 'Guardar',
  },
  nav: {
    dashboard: 'Dashboard',
    toggle_drawer: 'Expandir navegación',
  },
};

export function getCurrentLanguage(): string {
  return currentLanguage;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const parts = key.split('.');
  let current: any = translations;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      current = undefined;
      break;
    }
  }

  if (typeof current !== 'string') {
    let fallback: any = FALLBACK_TRANSLATIONS;
    for (const part of parts) {
      if (fallback && typeof fallback === 'object' && part in fallback) {
        fallback = fallback[part];
      } else {
        fallback = undefined;
        break;
      }
    }
    current = typeof fallback === 'string' ? fallback : key;
  }

  if (params && typeof current === 'string') {
    return current.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
  }

  return current;
}

export function translateElement(element: HTMLElement): HTMLElement {
  const i18nElements = element.querySelectorAll<HTMLElement>('[data-i18n]');
  i18nElements.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key);
    }
  });

  const placeholderElements = element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]');
  placeholderElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.placeholder = t(key);
    }
  });

  const ariaElements = element.querySelectorAll<HTMLElement>('[data-i18n-aria]');
  ariaElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) {
      el.setAttribute('aria-label', t(key));
    }
  });

  const tooltipElements = element.querySelectorAll<HTMLElement>('[data-i18n-tooltip]');
  tooltipElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-tooltip');
    if (key) {
      el.setAttribute('data-tooltip', t(key));
    }
  });

  if (element.hasAttribute('data-i18n')) {
    const key = element.getAttribute('data-i18n');
    if (key) {
      element.textContent = t(key);
    }
  }

  return element;
}

export async function setLanguage(lang: string): Promise<void> {
  currentLanguage = lang;
  try {
    const res = await fetch(`/translations/${lang}.json`);
    if (res.ok) {
      translations = await res.json();
    } else {
      translations = FALLBACK_TRANSLATIONS;
    }
  } catch {
    translations = FALLBACK_TRANSLATIONS;
  }
  translateElement(document.body);
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
}

export async function initI18n(): Promise<void> {
  const saved = localStorage.getItem('boreal_admin_lang') || localStorage.getItem('boreal_lang') || 'es';
  await setLanguage(saved);
}
