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
    refresh: 'Actualizar',
    save: 'Guardar',
  },
  hr: {
    description: 'Directorio de colaboradores, altas y contrataciones, nómina, vacaciones, permisos y kárdex laboral',
    title: 'Recursos Humanos y Capital Humano',
  },
  languages: {
    es_MX: 'Español (México)',
  },
  nav: {
    dashboard: 'Dashboard',
    giveaways: 'Sorteos',
    hr: 'Recursos Humanos',
    logout: 'Cerrar sesión',
    more: 'Más',
    profile: 'Perfil',
    settings: 'Configuración',
    theme: 'Tema',
    toggle_drawer: 'Expandir navegación',
    toggle_theme: 'Cambiar tema',
  },
  settings: {
    accessibility_group: 'Accesibilidad y Rendimiento',
    extended_toasts_desc: 'Mantén las notificaciones flotantes durante más tiempo en pantalla antes de descartarse.',
    extended_toasts_title: 'Duración de notificaciones',
    general_group: 'Preferencias generales',
    high_contrast_desc: 'Mejora la legibilidad aumentando el contraste entre bordes, fondos y textos.',
    high_contrast_title: 'Modo de alto contraste',
    language_desc: 'Elige el idioma predeterminado para los textos y opciones de la plataforma.',
    language_title: 'Idioma de la interfaz',
    language_trigger_aria: 'Seleccionar idioma',
    reduce_motion_desc: 'Minimiza el movimiento y efectos visuales de transición en toda la plataforma.',
    reduce_motion_title: 'Reducir animaciones',
    subtitle: 'Gestiona las preferencias generales, idioma, apariencia e interacción del panel de administración.',
    theme_dark: 'Modo oscuro',
    theme_desc: 'Personaliza la interfaz visual seleccionando un tema claro, oscuro o sincronizado con el sistema.',
    theme_light: 'Modo claro',
    theme_system: 'Sincronizar con el sistema',
    theme_title: 'Tema de la aplicación',
    theme_trigger_aria: 'Seleccionar tema',
    title: 'Configuración',
  },
  toasts: {
    extended_toasts_disabled: 'Duración estándar restaurada',
    extended_toasts_enabled: 'Notificaciones persistentes activadas',
    high_contrast_disabled: 'Alto contraste desactivado',
    high_contrast_enabled: 'Modo de alto contraste activado',
    language_updated: 'Idioma preferido actualizado',
    reduce_motion_disabled: 'Animaciones normales restauradas',
    reduce_motion_enabled: 'Animaciones reducidas activadas',
    theme_updated: 'Tema visual actualizado',
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
    let res = await fetch(`/translations/${lang}.json`);
    if (!res.ok && lang === 'es-MX') {
      res = await fetch('/translations/es.json');
    }
    if (res.ok) {
      translations = await res.json();
    } else {
      translations = FALLBACK_TRANSLATIONS;
    }
  } catch {
    translations = FALLBACK_TRANSLATIONS;
  }
  try {
    localStorage.setItem('boreal_admin_lang', lang);
    localStorage.setItem('boreal_language', lang);
    localStorage.setItem('boreal_lang', lang);
  } catch {}
  translateElement(document.body);
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang, language: lang } }));
}

export async function initI18n(): Promise<void> {
  const saved = localStorage.getItem('boreal_admin_lang') || localStorage.getItem('boreal_language') || localStorage.getItem('boreal_lang') || 'es-MX';
  await setLanguage(saved);
}
