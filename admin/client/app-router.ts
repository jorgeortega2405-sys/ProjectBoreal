import { checkAuth, getCurrentUser } from './services/api.service.js';
import { destroySidebar, ensureSidebarMounted, setupLayoutScrollSync, updateSidebarActiveState } from './components/layout.component.js';
import { findRoute } from './config/routes.config.js';
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

  void render(cleanPath);
}

export async function render(rawPath = window.location.pathname): Promise<void> {
  let path = normalizePath(rawPath);
  const navId = ++currentNavigation;

  const appRoot = document.querySelector<HTMLElement>('[data-ref="app"]');
  if (!appRoot) return;

  const isAuth = getCurrentUser() !== null || (await checkAuth());

  if (!isAuth && path !== '/login') {
    path = '/login';
    window.history.replaceState({}, '', '/login');
  } else if (isAuth && path === '/login') {
    path = '/';
    window.history.replaceState({}, '', '/');
  }

  if (navId !== currentNavigation) return;

  if (path === '/login') {
    destroySidebar();
    const existingLayout = appRoot.querySelector<HTMLElement>('.layout-content');
    if (existingLayout) {
      existingLayout.remove();
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

    const { createLoginView } = await import('./views/login.view.js');
    const loginEl = await createLoginView();

    if (navId !== currentNavigation) return;

    activeViewElement = loginEl;
    appRoot.appendChild(loginEl);
    previousPath = '/login';
    return;
  }

  let layoutContent = appRoot.querySelector<HTMLElement>('.layout-content');
  if (!layoutContent) {
    appRoot.innerHTML = '';
    layoutContent = document.createElement('div');
    layoutContent.className = 'layout-content';
    layoutContent.setAttribute('data-ref', 'app-layout');
    appRoot.appendChild(layoutContent);
  }

  const sidebar = await ensureSidebarMounted(layoutContent);
  updateSidebarActiveState(sidebar, path);

  const matched = findRoute(path);
  let nextViewElement: HTMLElement | null = null;

  try {
    if (matched) {
      nextViewElement = await matched.route.handler({
        params: matched.params,
        path,
        previousPath,
        query: new URLSearchParams(window.location.search),
      });
    } else {
      const { createDashboardView } = await import('./views/dashboard.view.js');
      nextViewElement = await createDashboardView();
    }
  } catch {
    const { createDashboardView } = await import('./views/dashboard.view.js');
    nextViewElement = await createDashboardView();
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
