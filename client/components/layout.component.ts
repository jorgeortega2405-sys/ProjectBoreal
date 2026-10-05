import { navigate } from '../app-router.js';
import { renderIcons } from '../services/icon.service.js';
import { translateElement } from '../services/i18n.service.js';
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
  const isHelp = path === '/help' || path === '/faq' || path === '/ayuda' || path.startsWith('/help');
  const isTerms = path === '/terms' || path === '/terminos';
  const isPrivacy = path === '/privacy' || path === '/privacidad';
  const isCookies = path === '/cookies';
  const isRules = path === '/rules' || path === '/reglas';
  const isPrizes = path === '/prizes' || path === '/premios';
  const isResponsibleGaming = path === '/responsible-gaming' || path === '/juego-responsable';
  const isAnyHelpOrLegal = isHelp || isTerms || isPrivacy || isCookies || isRules || isPrizes || isResponsibleGaming;

  const itemHome = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-home"]');
  const btnHome = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-home"]');
  const itemValidate = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-validate-payment"]');
  const btnValidate = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-validate-payment"]');
  const itemHelp = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-help"]');
  const btnHelp = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-help"]');
  const btnSettings = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-settings"]');

  itemHome?.classList.toggle('is-active', isHome);
  btnHome?.classList.toggle('is-active', isHome);
  itemValidate?.classList.toggle('is-active', isValidate);
  btnValidate?.classList.toggle('is-active', isValidate);
  itemHelp?.classList.toggle('is-active', isAnyHelpOrLegal);
  btnHelp?.classList.toggle('is-active', isAnyHelpOrLegal);
  btnSettings?.classList.toggle('is-active', isSettings);

  const drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (drawer) {
    drawer.querySelector('[data-ref="btn-drawer-home"]')?.classList.toggle('is-active', isHome);
    drawer.querySelector('[data-ref="btn-drawer-validate-payment"]')?.classList.toggle('is-active', isValidate);
    drawer.querySelector('[data-ref="btn-drawer-help"]')?.classList.toggle('is-active', isHelp);
    drawer.querySelector('[data-ref="btn-drawer-terms"]')?.classList.toggle('is-active', isTerms);
    drawer.querySelector('[data-ref="btn-drawer-privacy"]')?.classList.toggle('is-active', isPrivacy);
    drawer.querySelector('[data-ref="btn-drawer-cookies"]')?.classList.toggle('is-active', isCookies);
    drawer.querySelector('[data-ref="btn-drawer-rules"]')?.classList.toggle('is-active', isRules);
    drawer.querySelector('[data-ref="btn-drawer-prizes"]')?.classList.toggle('is-active', isPrizes);
    drawer.querySelector('[data-ref="btn-drawer-responsible-gaming"]')?.classList.toggle('is-active', isResponsibleGaming);
    drawer.querySelector('[data-ref="btn-drawer-settings"]')?.classList.toggle('is-active', isSettings);
  }
}

function createDrawerElement(): HTMLElement {
  const drawer = document.createElement('div');
  drawer.className = 'layout-drawer';
  drawer.setAttribute('data-ref', 'layout-drawer');

  const drawerHeader = document.createElement('div');
  drawerHeader.className = 'layout-drawer__header';
  drawerHeader.setAttribute('data-ref', 'drawer-header');
  drawerHeader.innerHTML = `
    <div class="drawer-header__info" data-ref="drawer-header-info">
      <span class="drawer-header__title" data-ref="drawer-header-title" data-i18n="app.name">ProjectBoreal</span>
      <span class="drawer-header__subtitle" data-ref="drawer-header-subtitle" data-i18n="app.tagline">Plataforma de sorteos interactivos</span>
    </div>
  `;

  const drawerBody = document.createElement('div');
  drawerBody.className = 'layout-drawer__body';
  drawerBody.setAttribute('data-ref', 'drawer-body');
  drawerBody.innerHTML = `
    <div class="drawer-section" data-ref="drawer-section-nav">
      <div class="drawer-section__header" data-ref="drawer-header-nav">
        <span class="drawer-section__title" data-ref="title-drawer-nav" data-i18n="nav.navigation">Navegación</span>
      </div>
      <div class="drawer-items-list" data-ref="drawer-items-nav">
        <button type="button" class="menu-item" data-ref="btn-drawer-home">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#home"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-home" data-i18n="nav.home">Inicio</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-drawer-validate-payment">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#credit_card"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-validate-payment" data-i18n="nav.validate_payment">Validar Pago</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-drawer-help">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#help"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-help" data-i18n="nav.help">Preguntas Frecuentes</span>
        </button>
      </div>
    </div>

    <div class="drawer-section" data-ref="drawer-section-legal">
      <div class="drawer-section__header" data-ref="drawer-header-legal">
        <span class="drawer-section__title" data-ref="title-drawer-legal" data-i18n="nav.legal_policies">Políticas y Legal</span>
      </div>
      <div class="drawer-items-list" data-ref="drawer-items-legal">
        <button type="button" class="menu-item" data-ref="btn-drawer-terms">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#description"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-terms" data-i18n="nav.terms">Términos y Condiciones</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-drawer-privacy">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#shield"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-privacy" data-i18n="nav.privacy">Política de Privacidad</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-drawer-cookies">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#cookie"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-cookies" data-i18n="nav.cookies">Política de Cookies</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-drawer-rules">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#gavel"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-rules" data-i18n="nav.rules">Reglas del Sorteo</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-drawer-prizes">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#workspace_premium"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-prizes" data-i18n="nav.prizes">Entrega de Premios</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-drawer-responsible-gaming">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#verified_user"></use></svg>
          <span class="menu-item__text" data-ref="text-drawer-responsible-gaming" data-i18n="nav.responsible_gaming">Juego Responsable</span>
        </button>
      </div>
    </div>
  `;

  const drawerFooter = document.createElement('div');
  drawerFooter.className = 'layout-drawer__footer';
  drawerFooter.setAttribute('data-ref', 'drawer-footer');
  drawerFooter.innerHTML = `
    <button type="button" class="menu-item" data-ref="btn-drawer-settings">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#settings"></use></svg>
      <span class="menu-item__text" data-ref="text-drawer-settings" data-i18n="nav.settings">Configuración</span>
    </button>
  `;

  drawer.appendChild(drawerHeader);
  drawer.appendChild(drawerBody);
  drawer.appendChild(drawerFooter);

  return drawer;
}

function bindDrawerEvents(drawer: HTMLElement): void {
  const routesMap: [string, string][] = [
    ['btn-drawer-home', '/'],
    ['btn-drawer-validate-payment', '/validate-payment'],
    ['btn-drawer-help', '/help'],
    ['btn-drawer-terms', '/terms'],
    ['btn-drawer-privacy', '/privacy'],
    ['btn-drawer-cookies', '/cookies'],
    ['btn-drawer-rules', '/rules'],
    ['btn-drawer-prizes', '/prizes'],
    ['btn-drawer-responsible-gaming', '/responsible-gaming'],
    ['btn-drawer-settings', '/settings'],
  ];

  for (const [ref, path] of routesMap) {
    const btn = drawer.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.innerWidth <= 768) {
        toggleDrawer(false);
      }
      navigate(path);
    });
  }
}

function openDynamicDrawer(sidebar: HTMLElement): void {
  let drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (!drawer) {
    drawer = createDrawerElement();
    bindDrawerEvents(drawer);
    renderIcons(drawer);
    translateElement(drawer);
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
  const itemHome = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-home"]');
  const itemValidate = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-validate-payment"]');
  const itemHelp = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-help"], [data-ref="btn-rail-help"]');
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

  itemHelp?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/help');
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

