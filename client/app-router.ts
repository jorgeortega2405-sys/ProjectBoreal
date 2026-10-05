import { ensureSidebarMounted, setupLayoutScrollSync, updateSidebarActiveState } from './components/layout.component.js';
import { closeAllModals } from './components/modal.component.js';
import { findRoute } from './config/routes.config.js';
import { translateElement } from './services/i18n.service.js';
import { hideTooltip } from './services/tooltip.service.js';
import { ViewController } from './types/common.types.js';

let activeViewElement: HTMLElement | null = null;
let currentNavigation = 0;
let previousPath = '';

function normalizePath(rawPath: string): string {
  if (!rawPath || rawPath === '/' || rawPath === '') return '/';
  return rawPath.replace(/\/+$/, '');
}

export function navigate(url: string, replace = false): void {
  const cleanPath = normalizePath(url);

  if (window.location.pathname === cleanPath && !replace) {
    const scrollable = document.querySelector<HTMLElement>(
      '.view-scrollable, .home-scrollable, .layout-scrollable, .layout-body--scrollable, .layout-content'
    );
    if (scrollable) {
      scrollable.scrollTo({ behavior: 'smooth', top: 0 });
    }
    return;
  }

  previousPath = window.location.pathname;

  if (replace) {
    window.history.replaceState({}, '', cleanPath);
  } else {
    window.history.pushState({}, '', cleanPath);
  }

  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"], .layout-nav');
  if (sidebar) {
    updateSidebarActiveState(sidebar, cleanPath);
  }

  void render(cleanPath);
}

export async function render(rawPath = window.location.pathname): Promise<void> {
  const path = normalizePath(rawPath);
  closeAllModals();
  hideTooltip();

  const appRoot = document.querySelector<HTMLElement>('[data-ref="app"]');
  if (!appRoot) return;

  let layoutContent = appRoot.querySelector<HTMLElement>('.layout-content');
  if (!layoutContent) {
    layoutContent = document.createElement('div');
    layoutContent.className = 'layout-content';
    layoutContent.setAttribute('data-ref', 'app-layout');
    appRoot.appendChild(layoutContent);
  }

  const sidebar = await ensureSidebarMounted(layoutContent);
  updateSidebarActiveState(sidebar, path);

  const navId = ++currentNavigation;

  let nextViewElement: HTMLElement | null = null;
  const matched = findRoute(path);

  try {
    if (matched) {
      nextViewElement = await matched.route.handler({
        params: matched.params,
        path,
        previousPath,
        query: new URLSearchParams(window.location.search),
      });
    } else {
      const { createNotFoundView } = await import('./views/not-found.view.js');
      nextViewElement = await createNotFoundView();
    }
  } catch {
    const { createNotFoundView } = await import('./views/not-found.view.js');
    nextViewElement = await createNotFoundView();
  }

  if (navId !== currentNavigation || !nextViewElement) {
    return;
  }

  if (activeViewElement) {
    const controller = (activeViewElement as any)?.__controller as ViewController | undefined;
    if (controller && typeof controller.destroy === 'function') {
      try {
        controller.destroy();
      } catch {}
    }
    activeViewElement.remove();
    activeViewElement = null;
  }

  activeViewElement = nextViewElement;
  translateElement(nextViewElement);
  layoutContent.appendChild(nextViewElement);

  const scrollable = nextViewElement.querySelector<HTMLElement>(
    '.view-scrollable, .home-scrollable, .layout-scrollable, .layout-body--scrollable'
  ) || layoutContent;
  scrollable.scrollTop = 0;

  setupLayoutScrollSync();
  previousPath = path;
}

export function initRouter(): void {
  window.addEventListener('popstate', () => {
    void render(window.location.pathname);
  });

  void render(window.location.pathname);
}
