import { navigate } from '../app-router.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';

export let isDrawerOpen = false;
let drawerRemovalTimer: ReturnType<typeof setTimeout> | null = null;
let sidebarInstance: HTMLElement | null = null;
let sidebarInitPromise: Promise<HTMLElement> | null = null;

export function getIsSidebarOpen(): boolean {
  return isDrawerOpen;
}

export function updateSidebarActiveState(sidebar: HTMLElement, path = window.location.pathname): void {
  const isHome = path === '/' || path === '';
  const isSettings = path === '/settings' || path.startsWith('/settings');
  const isValidate = path === '/validate-payment' || path === '/validar-pago';

  const itemHome = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-home"]');
  const btnHome = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-home"]');
  const itemValidate = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-validate-payment"]');
  const btnValidate = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-validate-payment"]');
  const btnSettings = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-settings"]');

  itemHome?.classList.toggle('is-active', isHome);
  btnHome?.classList.toggle('is-active', isHome);
  itemValidate?.classList.toggle('is-active', isValidate);
  btnValidate?.classList.toggle('is-active', isValidate);
  btnSettings?.classList.toggle('is-active', isSettings);
}

function createDrawerElement(): HTMLElement {
  const drawer = document.createElement('div');
  drawer.className = 'layout-drawer';
  drawer.setAttribute('data-ref', 'layout-drawer');

  const drawerHeader = document.createElement('div');
  drawerHeader.className = 'layout-drawer__header';
  drawerHeader.setAttribute('data-ref', 'drawer-header');

  const drawerBody = document.createElement('div');
  drawerBody.className = 'layout-drawer__body';
  drawerBody.setAttribute('data-ref', 'drawer-body');

  const drawerFooter = document.createElement('div');
  drawerFooter.className = 'layout-drawer__footer';
  drawerFooter.setAttribute('data-ref', 'drawer-footer');

  drawer.appendChild(drawerHeader);
  drawer.appendChild(drawerBody);
  drawer.appendChild(drawerFooter);

  return drawer;
}

function openDynamicDrawer(sidebar: HTMLElement): void {
  let drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (!drawer) {
    drawer = createDrawerElement();
    sidebar.appendChild(drawer);
  }
  requestAnimationFrame(() => {
    drawer?.classList.add('is-open', 'is-expanded');
  });
}

function closeDynamicDrawer(): void {
  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"]');
  const drawer = sidebar?.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (drawer) {
    drawer.classList.remove('is-open', 'is-expanded');
    if (drawerRemovalTimer) {
      clearTimeout(drawerRemovalTimer);
    }
    drawerRemovalTimer = setTimeout(() => {
      drawer?.remove();
      drawerRemovalTimer = null;
    }, 280);
  }
}

export function toggleDrawer(forceState?: boolean): void {
  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"]');
  const btnToggle = sidebar?.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]') || document.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const nextOpen = forceState !== undefined ? forceState : !isDrawerOpen;

  isDrawerOpen = nextOpen;
  btnToggle?.classList.toggle('is-active', isDrawerOpen);

  if (isDrawerOpen) {
    if (drawerRemovalTimer) {
      clearTimeout(drawerRemovalTimer);
      drawerRemovalTimer = null;
    }
    if (sidebar) {
      openDynamicDrawer(sidebar);
    }
  } else {
    closeDynamicDrawer();
  }
}

function setupRailNavigation(sidebar: HTMLElement): void {
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const itemHome = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-home"]');
  const itemValidate = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-validate-payment"]');
  const itemSettings = sidebar.querySelector<HTMLElement>('[data-ref="settings-container"], [data-ref="btn-rail-settings"]');

  btnToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDrawer();
  });

  itemHome?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/');
  });

  itemValidate?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/validate-payment');
  });

  itemSettings?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/settings');
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
    '.view-scrollable, .home-scrollable, .layout-body--scrollable, .layout-scrollable, .component-table-wrapper'
  );
  if (!scrollableBody) {
    layoutContent.style.removeProperty('--layout-scroll-height');
    return;
  }

  const updateScrollHeight = () => {
    const scrollHeight = scrollableBody.scrollHeight;
    layoutContent.style.setProperty('--layout-scroll-height', `${scrollHeight}px`);
  };

  updateScrollHeight();

  activeResizeObserver = new ResizeObserver(() => {
    updateScrollHeight();
  });

  activeResizeObserver.observe(scrollableBody);
  const firstChild = scrollableBody.firstElementChild;
  if (firstChild) {
    activeResizeObserver.observe(firstChild);
  }
}

