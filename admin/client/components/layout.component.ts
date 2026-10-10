import { navigate } from '../app-router.js';
import { getCurrentUser, logout } from '../services/auth.service.js';
import { translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { getEffectiveTheme, getTheme, toggleTheme } from '../services/theme.service.js';
import { generateAvatarDataUri, getAvatarUrl } from '../utils/avatar.util.js';
import { canAccessModule } from '../utils/permission.util.js';

export let isDrawerOpen = false;
let sidebarInstance: HTMLElement | null = null;
let sidebarInitPromise: Promise<HTMLElement> | null = null;
let themeChangeHandler: (() => void) | null = null;

export function getIsSidebarOpen(): boolean {
  return isDrawerOpen;
}

export function updateSidebarUserInfo(sidebar: HTMLElement): void {
  const user = getCurrentUser();
  const userName = user?.name || 'Administrador';
  const userEmail = user?.email || 'admin@projectboreal.com';
  const userRoles = user?.roles && user.roles.length > 0 ? user.roles.join(' • ') : 'SIN ROL';
  const avatarSrc = generateAvatarDataUri(userName);

  const railAvatarImg = sidebar.querySelector<HTMLImageElement>('[data-ref="rail-avatar-img"]');
  if (railAvatarImg) {
    railAvatarImg.src = avatarSrc;
    railAvatarImg.alt = userName;
    railAvatarImg.classList.add('image-loaded');
  }

  const activeAccountAvatar = sidebar.querySelector<HTMLImageElement>('[data-ref="active-account-avatar"]');
  if (activeAccountAvatar) {
    activeAccountAvatar.src = avatarSrc;
    activeAccountAvatar.alt = userName;
    activeAccountAvatar.classList.add('image-loaded');
  }

  const activeAccountName = sidebar.querySelector<HTMLElement>('[data-ref="active-account-name"]');
  if (activeAccountName) {
    activeAccountName.textContent = userName;
  }

  const activeAccountEmail = sidebar.querySelector<HTMLElement>('[data-ref="active-account-email"]');
  if (activeAccountEmail) {
    activeAccountEmail.textContent = userEmail;
  }

  const activeAccountRole = sidebar.querySelector<HTMLElement>('[data-ref="active-account-role"]');
  if (activeAccountRole) {
    activeAccountRole.textContent = userRoles;
  }

  const moduleRailMap: Array<{ moduleId: string; ref: string }> = [
    { moduleId: 'dashboard', ref: 'rail-item-dashboard' },
    { moduleId: 'giveaways', ref: 'rail-item-giveaways' },
    { moduleId: 'payments', ref: 'rail-item-payments' },
    { moduleId: 'bank-accounts', ref: 'rail-item-bank-accounts' },
    { moduleId: 'customers', ref: 'rail-item-customers' },
    { moduleId: 'winners', ref: 'rail-item-winners' },
    { moduleId: 'roles', ref: 'rail-item-roles' },
  ];

  for (const item of moduleRailMap) {
    const el = sidebar.querySelector<HTMLElement>(`[data-ref="${item.ref}"]`);
    if (el) {
      el.classList.toggle('is-hidden', !canAccessModule(item.moduleId));
    }
  }
}

export function updateSidebarActiveState(sidebar: HTMLElement, path = window.location.pathname): void {
  const isGiveaways = path === '/giveaways' || path.startsWith('/giveaways') || path === '/sorteos' || path.startsWith('/sorteos');
  const isPayments =
    path === '/payments' ||
    path.startsWith('/payments') ||
    path === '/pagos' ||
    path.startsWith('/pagos') ||
    path === '/orders' ||
    path.startsWith('/orders') ||
    path === '/comprobantes' ||
    path.startsWith('/comprobantes');
  const isBankAccounts =
    path === '/bank-accounts' ||
    path.startsWith('/bank-accounts') ||
    path === '/cuentas-bancarias' ||
    path.startsWith('/cuentas-bancarias');
  const isCustomers =
    path === '/customers' ||
    path.startsWith('/customers') ||
    path === '/clientes' ||
    path.startsWith('/clientes') ||
    path === '/participantes' ||
    path.startsWith('/participantes');
  const isWinners =
    path === '/winners' ||
    path.startsWith('/winners') ||
    path === '/ganadores' ||
    path.startsWith('/ganadores') ||
    path === '/premios' ||
    path.startsWith('/premios');
  const isRoles =
    path === '/roles' ||
    path.startsWith('/roles') ||
    path === '/permisos' ||
    path.startsWith('/permisos');
  const isSettings =
    path === '/settings' ||
    path.startsWith('/settings') ||
    path === '/configuracion' ||
    path.startsWith('/configuracion') ||
    path === '/ajustes' ||
    path.startsWith('/ajustes');
  const isDashboard =
    !isGiveaways &&
    !isPayments &&
    !isBankAccounts &&
    !isCustomers &&
    !isWinners &&
    !isRoles &&
    !isSettings &&
    (path === '/' || path === '' || path === '/dashboard' || path.startsWith('/dashboard'));

  const itemDashboard = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-dashboard"]');
  const btnDashboard = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-dashboard"]');
  const itemGiveaways = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-giveaways"]');
  const btnGiveaways = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-giveaways"]');
  const itemPayments = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-payments"]');
  const btnPayments = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-payments"]');
  const itemBankAccounts = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-bank-accounts"]');
  const btnBankAccounts = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-bank-accounts"]');
  const itemCustomers = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-customers"]');
  const btnCustomers = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-customers"]');
  const itemWinners = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-winners"]');
  const btnWinners = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-winners"]');
  const itemRoles = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-roles"]');
  const btnRoles = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-roles"]');
  const itemAvatar = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-avatar"]');
  const btnAvatar = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-avatar"]');
  const btnMenuSettings = sidebar.querySelector<HTMLElement>('[data-ref="btn-menu-settings"]');
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');

  itemDashboard?.classList.toggle('is-active', isDashboard);
  btnDashboard?.classList.toggle('is-active', isDashboard);
  itemGiveaways?.classList.toggle('is-active', isGiveaways);
  btnGiveaways?.classList.toggle('is-active', isGiveaways);
  itemPayments?.classList.toggle('is-active', isPayments);
  btnPayments?.classList.toggle('is-active', isPayments);
  itemBankAccounts?.classList.toggle('is-active', isBankAccounts);
  btnBankAccounts?.classList.toggle('is-active', isBankAccounts);
  itemCustomers?.classList.toggle('is-active', isCustomers);
  btnCustomers?.classList.toggle('is-active', isCustomers);
  itemWinners?.classList.toggle('is-active', isWinners);
  btnWinners?.classList.toggle('is-active', isWinners);
  itemRoles?.classList.toggle('is-active', isRoles);
  btnRoles?.classList.toggle('is-active', isRoles);
  itemAvatar?.classList.toggle('is-active', isSettings);
  btnAvatar?.classList.toggle('is-active', isSettings);
  btnMenuSettings?.classList.toggle('is-active', isSettings);
  btnToggle?.classList.toggle('is-active', isDrawerOpen);
  updateSidebarUserInfo(sidebar);
}

export function updateThemeButtonState(sidebar: HTMLElement): void {
  const btnTheme = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-theme"]');
  const iconUse = btnTheme?.querySelector<SVGUseElement>('[data-ref="icon-theme"] use, use');
  const effective = getEffectiveTheme(getTheme());
  const isDark = effective === 'dark';
  if (iconUse) {
    iconUse.setAttribute('href', isDark ? '/icons.svg#light_mode' : '/icons.svg#dark_mode');
  }
  const label = isDark ? 'Modo claro' : 'Modo oscuro';
  btnTheme?.setAttribute('data-tooltip', label);
  btnTheme?.setAttribute('aria-label', label);
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
  const itemGiveaways = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-giveaways"]');
  const itemPayments = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-payments"]');
  const itemBankAccounts = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-bank-accounts"]');
  const itemCustomers = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-customers"]');
  const itemWinners = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-winners"]');
  const itemRoles = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-roles"]');
  const avatarContainer = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-avatar"]');
  const btnAvatar = avatarContainer?.querySelector<HTMLElement>('[data-ref="btn-rail-avatar"]');
  const avatarMenu = avatarContainer?.querySelector<HTMLElement>('[data-ref="avatar-menu"]');
  const btnMenuSettings = avatarContainer?.querySelector<HTMLElement>('[data-ref="btn-menu-settings"]');
  const btnMenuLogout = avatarContainer?.querySelector<HTMLElement>('[data-ref="btn-menu-logout"]');

  btnToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDrawer();
  });

  itemDashboard?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/');
  });

  itemGiveaways?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/giveaways');
  });

  itemPayments?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/payments');
  });

  itemBankAccounts?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/bank-accounts');
  });

  itemCustomers?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/customers');
  });

  itemWinners?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/winners');
  });

  itemRoles?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/roles');
  });

  if (avatarContainer && btnAvatar && avatarMenu) {
    let isMenuOpen = false;

    const positionAvatarMenu = () => {
      if (window.innerWidth > 768) {
        const btnRect = btnAvatar.getBoundingClientRect();
        avatarMenu.style.position = 'fixed';
        avatarMenu.style.left = `${Math.round(btnRect.right + 10)}px`;
        const menuHeight = avatarMenu.offsetHeight || 160;
        if (btnRect.top + menuHeight > window.innerHeight - 16) {
          avatarMenu.style.top = 'auto';
          avatarMenu.style.bottom = `${Math.max(16, window.innerHeight - btnRect.bottom)}px`;
        } else {
          avatarMenu.style.top = `${Math.max(16, Math.round(btnRect.top - 6))}px`;
          avatarMenu.style.bottom = 'auto';
        }
      } else {
        avatarMenu.style.position = '';
        avatarMenu.style.left = '';
        avatarMenu.style.top = '';
        avatarMenu.style.bottom = '';
      }
    };

    const openAvatarMenu = () => {
      isMenuOpen = true;
      btnAvatar.classList.add('is-active');
      avatarMenu.classList.add('is-open');
      positionAvatarMenu();
    };

    const closeAvatarMenu = () => {
      if (!isMenuOpen) return;
      isMenuOpen = false;
      const path = window.location.pathname;
      const isSettings = path === '/settings' || path.startsWith('/settings') || path === '/configuracion' || path === '/ajustes';
      btnAvatar.classList.toggle('is-active', isSettings);
      avatarMenu.classList.remove('is-open');
    };

    const toggleAvatarMenu = (e: Event) => {
      e.stopPropagation();
      if (isMenuOpen) {
        closeAvatarMenu();
      } else {
        openAvatarMenu();
      }
    };

    btnAvatar.addEventListener('click', toggleAvatarMenu);

    btnMenuSettings?.addEventListener('click', (e) => {
      e.preventDefault();
      closeAvatarMenu();
      navigate('/settings');
    });

    btnMenuLogout?.addEventListener('click', async (e) => {
      e.preventDefault();
      closeAvatarMenu();
      await logout();
      unmountSidebar();
      navigate('/login');
    });

    document.addEventListener('click', (e) => {
      if (isMenuOpen && !avatarContainer.contains(e.target as Node)) {
        closeAvatarMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMenuOpen) {
        closeAvatarMenu();
      }
    });
  }
}

export function unmountSidebar(): void {
  if (themeChangeHandler) {
    window.removeEventListener('themechange', themeChangeHandler);
    themeChangeHandler = null;
  }
  if (sidebarInstance) {
    sidebarInstance.remove();
    sidebarInstance = null;
  }
  sidebarInitPromise = null;
}

export async function createSidebar(): Promise<HTMLElement> {
  if (sidebarInstance) {
    updateSidebarUserInfo(sidebarInstance);
    updateSidebarActiveState(sidebarInstance, window.location.pathname);
    updateThemeButtonState(sidebarInstance);
    return sidebarInstance;
  }
  if (sidebarInitPromise) {
    return sidebarInitPromise;
  }

  sidebarInitPromise = (async () => {
    const sidebar = await loadTemplate('/views/components/sidebar.html');
    setupRailNavigation(sidebar);
    updateSidebarUserInfo(sidebar);
    updateSidebarActiveState(sidebar, window.location.pathname);
    updateThemeButtonState(sidebar);
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
