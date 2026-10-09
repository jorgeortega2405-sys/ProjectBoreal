import { ensureSidebarMounted, setupLayoutScrollSync, unmountSidebar, updateSidebarActiveState } from './components/layout.component.js';
import { closeAllModals } from './components/modal.component.js';
import { findRoute } from './config/routes.config.js';
import { createAdminSkeletonElement } from './config/skeleton-routes.js';
import { checkAuth, clearAuthState, getCurrentUser } from './services/auth.service.js';
import { translateElement } from './services/i18n.service.js';
import { hideTooltip } from './services/tooltip.service.js';
import { ViewController } from './types/common.types.js';

let activeViewElement: HTMLElement | null = null;
let currentNavigation = 0;
let previousPath = '';
let targetRedirectPath = '';

function normalizePath(rawPath: string): string {
  if (!rawPath || rawPath === '/' || rawPath === '') return '/';
  const clean = rawPath.replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

function parseRouteUrl(rawUrl: string): { fullUrl: string; pathname: string; query: URLSearchParams } {
  try {
    const urlObj = new URL(rawUrl, window.location.origin);
    const pathname = normalizePath(urlObj.pathname);
    return {
      fullUrl: `${pathname}${urlObj.search}${urlObj.hash}`,
      pathname,
      query: urlObj.searchParams,
    };
  } catch {
    const [pathAndQuery] = (rawUrl || '').split('#');
    const [pathPart, queryPart = ''] = pathAndQuery.split('?');
    const pathname = normalizePath(pathPart);
    return {
      fullUrl: rawUrl,
      pathname,
      query: new URLSearchParams(queryPart),
    };
  }
}

export function navigate(url: string, replace = false): void {
  const { fullUrl, pathname } = parseRouteUrl(url);

  const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentFull === fullUrl && !replace) {
    const scrollable = document.querySelector<HTMLElement>(
      '.view-scrollable, .dashboard-scrollable, .layout-scrollable, .layout-body--scrollable, .layout-content'
    );
    if (scrollable) {
      scrollable.scrollTo({ behavior: 'smooth', top: 0 });
    }
    return;
  }

  previousPath = window.location.pathname;

  if (replace) {
    window.history.replaceState({}, '', fullUrl);
  } else {
    window.history.pushState({}, '', fullUrl);
  }

  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"], .layout-nav');
  if (sidebar) {
    updateSidebarActiveState(sidebar, pathname);
  }

  void render(pathname);
}

export async function render(rawPath = window.location.pathname): Promise<void> {
  const { pathname: path } = parseRouteUrl(rawPath);
  closeAllModals();
  hideTooltip();

  const appRoot = document.querySelector<HTMLElement>('[data-ref="app"]');
  if (!appRoot) return;

  const user = await checkAuth();

  if (!user) {
    if (path !== '/login' && path !== '/iniciar-sesion') {
      targetRedirectPath = path !== '/' ? path : '';
      window.history.replaceState({}, '', '/login');
    }

    unmountSidebar();

    let layoutContent = appRoot.querySelector<HTMLElement>('.layout-content');
    if (!layoutContent) {
      layoutContent = document.createElement('div');
      layoutContent.className = 'layout-content layout-content--auth';
      layoutContent.setAttribute('data-ref', 'app-layout');
      appRoot.appendChild(layoutContent);
    } else {
      layoutContent.classList.add('layout-content--auth');
    }

    const navId = ++currentNavigation;

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

    const loginSkeleton = createAdminSkeletonElement('login');
    activeViewElement = loginSkeleton;
    layoutContent.appendChild(loginSkeleton);
    layoutContent.scrollTop = 0;

    const { createLoginView } = await import('./views/login.view.js');
    const loginViewElement = await createLoginView();

    if (navId !== currentNavigation || !loginViewElement) {
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

    activeViewElement = loginViewElement;
    translateElement(loginViewElement);
    layoutContent.appendChild(loginViewElement);
    previousPath = '/login';
    return;
  }

  if (path === '/login' || path === '/iniciar-sesion') {
    const destination = targetRedirectPath || '/';
    targetRedirectPath = '';
    navigate(destination, true);
    return;
  }

  let layoutContent = appRoot.querySelector<HTMLElement>('.layout-content');
  if (!layoutContent) {
    layoutContent = document.createElement('div');
    layoutContent.className = 'layout-content';
    layoutContent.setAttribute('data-ref', 'app-layout');
    appRoot.appendChild(layoutContent);
  } else {
    layoutContent.classList.remove('layout-content--auth');
  }

  const sidebar = await ensureSidebarMounted(layoutContent);
  updateSidebarActiveState(sidebar, path);

  const navId = ++currentNavigation;
  const matched = findRoute(path);
  const routeId = matched ? matched.route.id : 'not-found';

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

  const skeletonElement = createAdminSkeletonElement(routeId);
  activeViewElement = skeletonElement;
  layoutContent.appendChild(skeletonElement);
  layoutContent.scrollTop = 0;

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

  layoutContent.scrollTop = 0;
  const scrollable = nextViewElement.querySelector<HTMLElement>(
    '.view-scrollable, .dashboard-scrollable, .layout-scrollable, .layout-body--scrollable'
  );
  if (scrollable) {
    scrollable.scrollTop = 0;
  }
  setupLayoutScrollSync();
  previousPath = path;
}

export function initRouter(): void {
  window.addEventListener('popstate', () => {
    void render(window.location.pathname);
  });

  window.addEventListener('admin:auth-change', () => {
    void render(window.location.pathname);
  });

  window.addEventListener('admin:unauthorized', () => {
    clearAuthState();
    unmountSidebar();
    navigate('/login', true);
  });

  void render(window.location.pathname);
}
