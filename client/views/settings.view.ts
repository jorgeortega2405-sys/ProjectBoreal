import { getCurrentLanguage, setLanguage, t } from '../services/i18n.service.js';
import { loadTemplate } from '../services/template.service.js';
import { getTheme, setTheme } from '../services/theme.service.js';
import { showToast } from '../services/toast.service.js';
import { getLanguageName } from '../utils/languages.util.js';

export class SettingsController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindThemeDropdown();
    this.bindLanguageDropdown();
    this.bindPreferencesToggles();
    this.bindDocumentDismiss();
    this.bindLanguageChangeEvent();
  }

  private bindDocumentDismiss(): void {
    const signal = this.abortController?.signal;
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as Node;
        const themeWrapper = this.container.querySelector('[data-ref="dropdown-wrapper-settings-theme"]');
        const langWrapper = this.container.querySelector('[data-ref="dropdown-wrapper-settings-language"]');
        if (!themeWrapper?.contains(target) && !langWrapper?.contains(target)) {
          this.closeAllDropdowns();
        }
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          this.closeAllDropdowns();
        }
      },
      { signal }
    );
  }

  private closeAllDropdowns(): void {
    const selectors = [
      '[data-ref="dropdown-wrapper-settings-theme"]',
      '[data-ref="dropdown-backdrop-settings-theme"]',
      '[data-ref="dropdown-menu-settings-theme"]',
      '[data-ref="btn-trigger-settings-theme"]',
      '[data-ref="dropdown-wrapper-settings-language"]',
      '[data-ref="dropdown-backdrop-settings-language"]',
      '[data-ref="dropdown-menu-settings-language"]',
      '[data-ref="btn-trigger-settings-language"]',
    ];
    this.container.querySelectorAll(selectors.join(',')).forEach((el) => {
      el.classList.remove('is-open');
    });
  }

  private bindLanguageChangeEvent(): void {
    const signal = this.abortController?.signal;
    window.addEventListener(
      'languagechange',
      () => {
        const themeSelectedText = this.container.querySelector<HTMLElement>('[data-ref="settings-theme-selected-text"]');
        const themeSelectedIcon = this.container.querySelector<SVGUseElement>('[data-ref="settings-theme-selected-icon"] use');
        const themeOptions = this.container.querySelectorAll<HTMLButtonElement>('[data-ref="list-settings-themes"] [data-theme-value]');
        this.updateThemeUi(getTheme(), themeSelectedText, themeSelectedIcon, themeOptions);

        const langSelectedText = this.container.querySelector<HTMLElement>('[data-ref="settings-language-selected-text"]');
        const langOptions = this.container.querySelectorAll<HTMLButtonElement>('[data-ref="list-settings-languages"] [data-lang-value]');
        this.updateLanguageUi(getCurrentLanguage(), langSelectedText, langOptions);
      },
      { signal }
    );
  }

  private bindThemeDropdown(): void {
    const signal = this.abortController?.signal;
    const wrapper = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-settings-theme"]');
    const trigger = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-settings-theme"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="dropdown-backdrop-settings-theme"]');
    const menu = this.container.querySelector<HTMLElement>('[data-ref="dropdown-menu-settings-theme"]');
    const selectedText = this.container.querySelector<HTMLElement>('[data-ref="settings-theme-selected-text"]');
    const selectedIcon = this.container.querySelector<SVGUseElement>('[data-ref="settings-theme-selected-icon"] use');
    const options = this.container.querySelectorAll<HTMLButtonElement>('[data-ref="list-settings-themes"] [data-theme-value]');

    const currentTheme = getTheme();
    this.updateThemeUi(currentTheme, selectedText, selectedIcon, options);

    const close = () => {
      wrapper?.classList.remove('is-open');
      backdrop?.classList.remove('is-open');
      menu?.classList.remove('is-open');
      trigger?.classList.remove('is-open');
    };

    const open = () => {
      this.closeAllDropdowns();
      wrapper?.classList.add('is-open');
      backdrop?.classList.add('is-open');
      menu?.classList.add('is-open');
      trigger?.classList.add('is-open');
    };

    const toggle = () => {
      if (menu?.classList.contains('is-open')) {
        close();
      } else {
        open();
      }
    };

    trigger?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      },
      { signal }
    );

    backdrop?.addEventListener(
      'click',
      (e) => {
        if (!menu?.contains(e.target as Node)) {
          close();
        }
      },
      { signal }
    );

    options.forEach((opt) => {
      opt.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const val = opt.getAttribute('data-theme-value') || 'system';
          setTheme(val);
          this.updateThemeUi(val, selectedText, selectedIcon, options);
          close();
          showToast(t('toasts.theme_updated'), 'success');
        },
        { signal }
      );
    });
  }

  private updateThemeUi(
    themeVal: string,
    textEl: HTMLElement | null,
    iconUseEl: SVGUseElement | null,
    options: NodeListOf<HTMLButtonElement>
  ): void {
    options.forEach((opt) => {
      const match = opt.getAttribute('data-theme-value') === themeVal;
      opt.classList.toggle('is-active', match);
    });

    if (textEl) {
      if (themeVal === 'dark') textEl.textContent = t('settings.theme_dark');
      else if (themeVal === 'light') textEl.textContent = t('settings.theme_light');
      else textEl.textContent = t('settings.theme_system');
    }

    if (iconUseEl) {
      if (themeVal === 'dark') iconUseEl.setAttribute('href', '/icons.svg#dark_mode');
      else if (themeVal === 'light') iconUseEl.setAttribute('href', '/icons.svg#light_mode');
      else iconUseEl.setAttribute('href', '/icons.svg#brightness_auto');
    }
  }

  private bindLanguageDropdown(): void {
    const signal = this.abortController?.signal;
    const wrapper = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-settings-language"]');
    const trigger = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-settings-language"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="dropdown-backdrop-settings-language"]');
    const menu = this.container.querySelector<HTMLElement>('[data-ref="dropdown-menu-settings-language"]');
    const selectedText = this.container.querySelector<HTMLElement>('[data-ref="settings-language-selected-text"]');
    const options = this.container.querySelectorAll<HTMLButtonElement>('[data-ref="list-settings-languages"] [data-lang-value]');

    const currentLang = getCurrentLanguage();
    this.updateLanguageUi(currentLang, selectedText, options);

    const close = () => {
      wrapper?.classList.remove('is-open');
      backdrop?.classList.remove('is-open');
      menu?.classList.remove('is-open');
      trigger?.classList.remove('is-open');
    };

    const open = () => {
      this.closeAllDropdowns();
      wrapper?.classList.add('is-open');
      backdrop?.classList.add('is-open');
      menu?.classList.add('is-open');
      trigger?.classList.add('is-open');
    };

    const toggle = () => {
      if (menu?.classList.contains('is-open')) {
        close();
      } else {
        open();
      }
    };

    trigger?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      },
      { signal }
    );

    backdrop?.addEventListener(
      'click',
      (e) => {
        if (!menu?.contains(e.target as Node)) {
          close();
        }
      },
      { signal }
    );

    options.forEach((opt) => {
      opt.addEventListener(
        'click',
        async (e) => {
          e.preventDefault();
          const val = opt.getAttribute('data-lang-value') || 'es-419';
          await setLanguage(val);
          this.updateLanguageUi(val, selectedText, options);
          close();
          showToast(t('toasts.language_updated'), 'success');
        },
        { signal }
      );
    });
  }

  private updateLanguageUi(
    langVal: string,
    textEl: HTMLElement | null,
    options: NodeListOf<HTMLButtonElement>
  ): void {
    options.forEach((opt) => {
      const optVal = opt.getAttribute('data-lang-value');
      const match = optVal === langVal || (langVal === 'es' && optVal === 'es-419') || (langVal === 'en' && optVal === 'en-US');
      opt.classList.toggle('is-active', match);
    });

    if (textEl) {
      textEl.textContent = getLanguageName(langVal);
    }
  }

  private bindPreferencesToggles(): void {
    const signal = this.abortController?.signal;

    const toggleMotion = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-settings-reduce-motion"]');
    if (toggleMotion) {
      const isReduced = localStorage.getItem('boreal_reduce_motion') === 'true';
      toggleMotion.checked = isReduced;
      toggleMotion.addEventListener(
        'change',
        () => {
          localStorage.setItem('boreal_reduce_motion', String(toggleMotion.checked));
          document.documentElement.classList.toggle('reduce-motion', toggleMotion.checked);
          showToast(toggleMotion.checked ? t('toasts.reduce_motion_enabled') : t('toasts.reduce_motion_disabled'), 'info');
        },
        { signal }
      );
    }

    const toggleToasts = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-settings-extended-toasts"]');
    if (toggleToasts) {
      const isExtended = localStorage.getItem('boreal_extended_toasts') === 'true';
      toggleToasts.checked = isExtended;
      toggleToasts.addEventListener(
        'change',
        () => {
          localStorage.setItem('boreal_extended_toasts', String(toggleToasts.checked));
          showToast(toggleToasts.checked ? t('toasts.extended_toasts_enabled') : t('toasts.extended_toasts_disabled'), 'info');
        },
        { signal }
      );
    }

    const toggleContrast = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-settings-high-contrast"]');
    if (toggleContrast) {
      const isHighContrast = localStorage.getItem('boreal_high_contrast') === 'true';
      toggleContrast.checked = isHighContrast;
      toggleContrast.addEventListener(
        'change',
        () => {
          localStorage.setItem('boreal_high_contrast', String(toggleContrast.checked));
          document.documentElement.classList.toggle('high-contrast', toggleContrast.checked);
          showToast(toggleContrast.checked ? t('toasts.high_contrast_enabled') : t('toasts.high_contrast_disabled'), 'info');
        },
        { signal }
      );
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createSettingsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/settings.html');
  const controller = new SettingsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
