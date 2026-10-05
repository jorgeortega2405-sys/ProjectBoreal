import { initRouter, navigate } from './app-router.js';
import { setupLayoutScrollSync } from './components/layout.component.js';
import { initTheme } from './services/theme.service.js';

let isSyncingScroll = false;
let scrollTicking = false;

function handleScrollEvent(e: Event): void {
  const target = e.target as HTMLElement | null;
  if (!target || target.nodeType !== 1) return;

  if (target.classList.contains('layout-content')) {
    if (!isSyncingScroll) {
      const scrollableBody = target.querySelector<HTMLElement>(
        '.view-scrollable, .home-scrollable, .layout-body--scrollable, .layout-scrollable'
      );
      if (scrollableBody && Math.abs(scrollableBody.scrollTop - target.scrollTop) > 0.5) {
        isSyncingScroll = true;
        scrollableBody.scrollTop = target.scrollTop;
        requestAnimationFrame(() => {
          isSyncingScroll = false;
        });
      }
    }
  } else if (
    target.classList.contains('view-scrollable') ||
    target.classList.contains('home-scrollable') ||
    target.classList.contains('layout-scrollable') ||
    target.classList.contains('layout-body--scrollable')
  ) {
    if (!isSyncingScroll) {
      const layoutContent = target.closest<HTMLElement>('.layout-content:has(.layout-nav)');
      if (layoutContent && Math.abs(layoutContent.scrollTop - target.scrollTop) > 0.5) {
        isSyncingScroll = true;
        layoutContent.scrollTop = target.scrollTop;
        requestAnimationFrame(() => {
          isSyncingScroll = false;
        });
      }
    }
  }
}

function initScrollShadow(): void {
  setupLayoutScrollSync();

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

function initApp(): void {
  initTheme();
  setupGlobalLinks();
  initScrollShadow();
  initRouter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initApp();
  });
} else {
  initApp();
}
