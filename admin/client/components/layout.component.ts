import { navigate } from '../app-router.js';
import { logout } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';

export let isDrawerOpen = false;
let drawerRemovalTimer: ReturnType<typeof setTimeout> | null = null;
let sidebarInstance: HTMLElement | null = null;
let sidebarInitPromise: Promise<HTMLElement> | null = null;
let activeResizeObserver: ResizeObserver | null = null;

export function getIsSidebarOpen(): boolean {
  return isDrawerOpen;
}

export function updateSidebarActiveState(sidebar: HTMLElement, path = window.location.pathname): void {
  const isDashboard = path === '/' || path === '' || path === '/dashboard';
  const isOrders = path === '/ordenes' || path === '/pagos' || path === '/orders';
  const isGiveaways = path === '/sorteos' || path === '/giveaways' || path.startsWith('/sorteo') || path.startsWith('/giveaway');
  const isBankAccounts = path === '/cuentas-bancarias' || path === '/bancos' || path === '/cuentas';
  const isAudit = path === '/auditoria' || path === '/logs' || path === '/audit';

  const itemDashboard = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-dashboard"]');
  const btnDashboard = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-dashboard"]');
  const itemOrders = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-orders"]');
  const btnOrders = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-orders"]');
  const itemGiveaways = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-giveaways"]');
  const btnGiveaways = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-giveaways"]');
  const itemBankAccounts = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-bank-accounts"]');
  const btnBankAccounts = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-bank-accounts"]');
  const itemAudit = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-audit"]');
  const btnAudit = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-audit"]');

  itemDashboard?.classList.toggle('is-active', isDashboard);
  btnDashboard?.classList.toggle('is-active', isDashboard);
  itemOrders?.classList.toggle('is-active', isOrders);
  btnOrders?.classList.toggle('is-active', isOrders);
  itemGiveaways?.classList.toggle('is-active', isGiveaways);
  btnGiveaways?.classList.toggle('is-active', isGiveaways);
  itemBankAccounts?.classList.toggle('is-active', isBankAccounts);
  btnBankAccounts?.classList.toggle('is-active', isBankAccounts);
  itemAudit?.classList.toggle('is-active', isAudit);
  btnAudit?.classList.toggle('is-active', isAudit);

  const btnDrawerDashboard = sidebar.querySelector<HTMLElement>('[data-ref="btn-drawer-dashboard"]');
  const btnDrawerOrders = sidebar.querySelector<HTMLElement>('[data-ref="btn-drawer-orders"]');
  const btnDrawerGiveaways = sidebar.querySelector<HTMLElement>('[data-ref="btn-drawer-giveaways"]');
  const btnDrawerBankAccounts = sidebar.querySelector<HTMLElement>('[data-ref="btn-drawer-bank-accounts"]');
  const btnDrawerAudit = sidebar.querySelector<HTMLElement>('[data-ref="btn-drawer-audit"]');
  btnDrawerDashboard?.classList.toggle('is-active', isDashboard);
  btnDrawerOrders?.classList.toggle('is-active', isOrders);
  btnDrawerGiveaways?.classList.toggle('is-active', isGiveaways);
  btnDrawerBankAccounts?.classList.toggle('is-active', isBankAccounts);
  btnDrawerAudit?.classList.toggle('is-active', isAudit);
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

  drawerBody.innerHTML = `
    <button type="button" class="menu-item" data-ref="btn-drawer-dashboard">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#dashboard"></use></svg>
      <span class="menu-item__text" data-ref="text-drawer-dashboard">Dashboard</span>
    </button>
    <button type="button" class="menu-item" data-ref="btn-drawer-orders">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#receipt_long"></use></svg>
      <span class="menu-item__text" data-ref="text-drawer-orders">Órdenes y Pagos</span>
    </button>
    <button type="button" class="menu-item" data-ref="btn-drawer-giveaways">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#inventory_2"></use></svg>
      <span class="menu-item__text" data-ref="text-drawer-giveaways">Gestionar Sorteos</span>
    </button>
    <button type="button" class="menu-item" data-ref="btn-drawer-bank-accounts">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
      <span class="menu-item__text" data-ref="text-drawer-bank-accounts">Cuentas Bancarias</span>
    </button>
    <button type="button" class="menu-item" data-ref="btn-drawer-audit">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#history"></use></svg>
      <span class="menu-item__text" data-ref="text-drawer-audit">Auditoría</span>
    </button>
  `;

  drawerFooter.innerHTML = `
    <button type="button" class="menu-item menu-item--danger" data-ref="btn-drawer-logout">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#logout"></use></svg>
      <span class="menu-item__text" data-ref="text-drawer-logout">Cerrar sesión</span>
    </button>
  `;

  drawer.appendChild(drawerHeader);
  drawer.appendChild(drawerBody);
  drawer.appendChild(drawerFooter);

  return drawer;
}

function bindDrawerEvents(drawer: HTMLElement): void {
  const btnDashboard = drawer.querySelector<HTMLElement>('[data-ref="btn-drawer-dashboard"]');
  const btnOrders = drawer.querySelector<HTMLElement>('[data-ref="btn-drawer-orders"]');
  const btnGiveaways = drawer.querySelector<HTMLElement>('[data-ref="btn-drawer-giveaways"]');
  const btnBankAccounts = drawer.querySelector<HTMLElement>('[data-ref="btn-drawer-bank-accounts"]');
  const btnAudit = drawer.querySelector<HTMLElement>('[data-ref="btn-drawer-audit"]');
  const btnLogout = drawer.querySelector<HTMLElement>('[data-ref="btn-drawer-logout"]');

  btnDashboard?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.innerWidth <= 768) {
      toggleDrawer(false);
    }
    navigate('/');
  });

  btnOrders?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.innerWidth <= 768) {
      toggleDrawer(false);
    }
    navigate('/ordenes');
  });

  btnGiveaways?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.innerWidth <= 768) {
      toggleDrawer(false);
    }
    navigate('/sorteos');
  });

  btnBankAccounts?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.innerWidth <= 768) {
      toggleDrawer(false);
    }
    navigate('/cuentas-bancarias');
  });

  btnAudit?.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.innerWidth <= 768) {
      toggleDrawer(false);
    }
    navigate('/auditoria');
  });

  btnLogout?.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
    destroySidebar();
    navigate('/login');
  });
}

function openDynamicDrawer(sidebar: HTMLElement): void {
  let drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (!drawer) {
    drawer = createDrawerElement();
    bindDrawerEvents(drawer);
    renderIcons(drawer);
    sidebar.appendChild(drawer);
  }
  updateSidebarActiveState(sidebar, window.location.pathname);
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
  const itemDashboard = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-dashboard"]');
  const itemOrders = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-orders"]');
  const itemGiveaways = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-giveaways"]');
  const itemBankAccounts = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-bank-accounts"]');
  const itemAudit = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-audit"]');
  const btnLogout = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-logout"], [data-ref="logout-container"]');

  btnToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDrawer();
  });

  itemDashboard?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/');
  });

  itemOrders?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/ordenes');
  });

  itemGiveaways?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/sorteos');
  });

  itemBankAccounts?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/cuentas-bancarias');
  });

  itemAudit?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/auditoria');
  });

  btnLogout?.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
    destroySidebar();
    navigate('/login');
  });
}

export function destroySidebar(): void {
  if (drawerRemovalTimer) {
    clearTimeout(drawerRemovalTimer);
    drawerRemovalTimer = null;
  }
  isDrawerOpen = false;
  if (sidebarInstance) {
    sidebarInstance.remove();
    sidebarInstance = null;
    sidebarInitPromise = null;
  }
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

export function setupLayoutScrollSync(): void {
  const layoutContent = document.querySelector<HTMLElement>('.layout-content:has(.layout-nav)');
  if (activeResizeObserver) {
    activeResizeObserver.disconnect();
    activeResizeObserver = null;
  }
  if (!layoutContent) return;

  const scrollableBody = layoutContent.querySelector<HTMLElement>(
    '.view-scrollable, .home-scrollable, .layout-body--scrollable, .layout-scrollable'
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
