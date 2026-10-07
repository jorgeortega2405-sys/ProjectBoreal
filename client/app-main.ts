import { initRouter, navigate } from './app-router.js';
import { initI18n, translateElement } from './services/i18n.service.js';
import { initTheme } from './services/theme.service.js';
import { initTooltips } from './services/tooltip.service.js';
import { initWebSocket } from './services/websocket.service.js';

let scrollTicking = false;

function handleScrollEvent(e: Event): void {
  const target = e.target as HTMLElement | null;
  if (!target || target.nodeType !== 1) return;

  if (target.classList.contains('layout-content')) {
    const isScrolled = target.scrollTop > 0;
    const componentWrapper = target.querySelector<HTMLElement>('.component-wrapper');
    const componentTop = componentWrapper
      ? componentWrapper.querySelector<HTMLElement>('.component-top, .view-header, .home-floating-top')
      : target.querySelector<HTMLElement>('.component-top, .view-header, .home-floating-top');

    if (componentTop) {
      componentTop.classList.toggle('shadow', isScrolled);
      componentTop.classList.toggle('component-top--shadow', isScrolled);

      const header = document.querySelector<HTMLElement>('.layout-header, .general-content-top');
      if (header) {
        header.classList.remove('shadow', 'layout-header--shadow');
      }
    } else {
      const header = document.querySelector<HTMLElement>('.layout-header, .general-content-top');
      if (header) {
        header.classList.toggle('shadow', isScrolled);
        header.classList.toggle('layout-header--shadow', isScrolled);
      }
    }
  }
}

function initScrollShadow(): void {
  document.addEventListener(
    'scroll',
    (e: Event) => {
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(() => {
          handleScrollEvent(e);
          scrollTicking = false;
        });
      }
    },
    { capture: true, passive: true }
  );
}

function setupGlobalLinks(): void {
  document.addEventListener('click', (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const targetEl = e.target as HTMLElement | null;
    const declarativeNav = targetEl?.closest<HTMLElement>('[data-navigate]');
    if (declarativeNav) {
      const dest = declarativeNav.getAttribute('data-navigate');
      if (dest) {
        e.preventDefault();
        navigate(dest);
        return;
      }
    }

    const anchor = targetEl?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) {
      return;
    }

    if (anchor.origin === window.location.origin) {
      e.preventDefault();
      navigate(href);
    }
  });
}

async function initApp(): Promise<void> {
  await initI18n();
  initTheme();
  initTooltips();
  initWebSocket();
  setupGlobalLinks();
  initScrollShadow();
  translateElement(document.body);
  initRouter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initApp();
  });
} else {
  void initApp();
}
