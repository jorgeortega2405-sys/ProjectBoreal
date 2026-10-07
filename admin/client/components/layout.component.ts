import { navigate } from '../app-router.js';
import { translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';

export let isDrawerOpen = false;
let sidebarInstance: HTMLElement | null = null;
let sidebarInitPromise: Promise<HTMLElement> | null = null;

export function getIsSidebarOpen(): boolean {
  return isDrawerOpen;
}

export function updateSidebarActiveState(sidebar: HTMLElement, path = window.location.pathname): void {
  const isDashboard = path === '/' || path === '' || path === '/dashboard' || path.startsWith('/dashboard');

  const itemDashboard = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-dashboard"]');
  const btnDashboard = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-dashboard"]');
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');

  itemDashboard?.classList.toggle('is-active', isDashboard);
  btnDashboard?.classList.toggle('is-active', isDashboard);
  btnToggle?.classList.toggle('is-active', isDrawerOpen);
}

export function toggleDrawer(forceState?: boolean): void {
  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"]');
  const btnToggle = sidebar?.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]') || document.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');

  const nextOpen = forceState !== undefined ? forceState : !isDrawerOpen;
  isDrawerOpen = nextOpen;
  btnToggle?.classList.toggle('is-active', isDrawerOpen);
  sidebar?.classList.toggle('is-expanded', isDrawerOpen);
}

function setupRailNavigation(sidebar: HTMLElement): void {
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const itemDashboard = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-dashboard"]');

  btnToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDrawer();
  });

  itemDashboard?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/');
  });
}

export async function createSidebar(): Promise<HTMLElement> {
  if (sidebarInstance) {
    updateSidebarActiveState(sidebarInstance, window.location.pathname);
    return sidebarInstance;
  }
  if (sidebarInitPromise) {
    return sidebarInitPromise;
  }

  sidebarInitPromise = (async () => {
    const sidebar = await loadTemplate('/views/components/sidebar.html');
    setupRailNavigation(sidebar);
    updateSidebarActiveState(sidebar, window.location.pathname);
    renderIcons(sidebar);
    sidebarInstance = sidebar;
    return sidebar;
  })();

  return sidebarInitPromise;
}

export async function ensureSidebarMounted(layoutContent: HTMLElement): Promise<HTMLElement> {
  const sidebar = await createSidebar();
  if (sidebar.parentElement !== layoutContent) {
    layoutContent.prepend(sidebar);
  }
  return sidebar;
}

let activeResizeObserver: ResizeObserver | null = null;

export function setupLayoutScrollSync(): void {
  const layoutContent = document.querySelector<HTMLElement>('.layout-content:has(.layout-nav)');
  if (activeResizeObserver) {
    activeResizeObserver.disconnect();
    activeResizeObserver = null;
  }
  if (!layoutContent) return;

  const scrollableBody = layoutContent.querySelector<HTMLElement>(
    '.view-scrollable, .dashboard-scrollable, .layout-body--scrollable, .layout-scrollable'
  );
  if (!scrollableBody) {
    layoutContent.style.removeProperty('--layout-scroll-height');
    return;
  }

  const updateScrollHeight = () => {
    const maxScroll = Math.max(0, Math.ceil(scrollableBody.scrollHeight - scrollableBody.clientHeight));
    if (maxScroll === 0) {
      layoutContent.style.removeProperty('--layout-scroll-height');
      return;
    }
    const neededHeight = layoutContent.clientHeight + maxScroll;
    layoutContent.style.setProperty('--layout-scroll-height', `${neededHeight}px`);
  };

  updateScrollHeight();

  activeResizeObserver = new ResizeObserver(() => {
    updateScrollHeight();
  });

  activeResizeObserver.observe(scrollableBody);
  activeResizeObserver.observe(layoutContent);
  for (const child of scrollableBody.children) {
    activeResizeObserver.observe(child);
  }
}
