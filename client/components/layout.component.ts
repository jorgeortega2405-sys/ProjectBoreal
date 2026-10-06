import { navigate } from '../app-router.js';
import { translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';

export let isDrawerOpen = false;
let drawerRemovalTimer: ReturnType<typeof setTimeout> | null = null;
let sidebarInstance: HTMLElement | null = null;
let sidebarInitPromise: Promise<HTMLElement> | null = null;

export function getIsSidebarOpen(): boolean {
  return isDrawerOpen;
}

export interface DrawerItemConfig {
  icon: string;
  i18nKey?: string;
  label: string;
  path: string;
  ref: string;
}

export interface DrawerSectionConfig {
  i18nKey?: string;
  items: DrawerItemConfig[];
  title: string;
}

export interface DrawerPageConfig {
  headerSubtitle: string;
  headerSubtitleI18n?: string;
  headerTitle: string;
  headerTitleI18n?: string;
  id: string;
  sections: DrawerSectionConfig[];
}

const DRAWER_CONFIGS: Record<string, DrawerPageConfig> = {
  help: {
    id: 'help',
    headerTitle: 'Políticas y Legal',
    headerSubtitle: 'Términos, políticas y soporte oficial',
    headerTitleI18n: 'nav.legal_policies',
    headerSubtitleI18n: 'legal.subtitle',
    sections: [
      {
        title: 'Políticas y Legal',
        i18nKey: 'nav.legal_policies',
        items: [
          {
            icon: 'description',
            i18nKey: 'nav.terms',
            label: 'Términos y Condiciones',
            path: '/terms',
            ref: 'btn-drawer-terms',
          },
          {
            icon: 'shield',
            i18nKey: 'nav.privacy',
            label: 'Política de Privacidad',
            path: '/privacy',
            ref: 'btn-drawer-privacy',
          },
          {
            icon: 'cookie',
            i18nKey: 'nav.cookies',
            label: 'Política de Cookies',
            path: '/cookies',
            ref: 'btn-drawer-cookies',
          },
          {
            icon: 'gavel',
            i18nKey: 'nav.rules',
            label: 'Reglas del Sorteo',
            path: '/rules',
            ref: 'btn-drawer-rules',
          },
          {
            icon: 'workspace_premium',
            i18nKey: 'nav.prizes',
            label: 'Entrega de Premios',
            path: '/prizes',
            ref: 'btn-drawer-prizes',
          },
          {
            icon: 'verified_user',
            i18nKey: 'nav.responsible_gaming',
            label: 'Juego Responsable',
            path: '/responsible-gaming',
            ref: 'btn-drawer-responsible-gaming',
          },
        ],
      },
    ],
  },
};

function getDrawerConfigForRoute(path: string): DrawerPageConfig | null {
  const legalRoutes = [
    '/help',
    '/faq',
    '/ayuda',
    '/terms',
    '/terminos',
    '/privacy',
    '/privacidad',
    '/cookies',
    '/rules',
    '/reglas',
    '/prizes',
    '/premios',
    '/responsible-gaming',
    '/juego-responsable',
  ];
  if (legalRoutes.some((r) => path === r || path.startsWith(r + '/'))) {
    return DRAWER_CONFIGS.help;
  }
  return null;
}

export function updateSidebarActiveState(sidebar: HTMLElement, path = window.location.pathname): void {
  const isHome =
    path === '/' ||
    path === '' ||
    path === '/sorteo-diario' ||
    path === '/diario' ||
    path === '/daily' ||
    path.startsWith('/s/') ||
    path.startsWith('/sorteo/') ||
    path.startsWith('/giveaway/');
  const isSettings =
    path === '/settings' ||
    path.startsWith('/settings') ||
    path === '/ajustes' ||
    path.startsWith('/ajustes') ||
    path === '/configuracion' ||
    path.startsWith('/configuracion');
  const isValidate =
    path === '/validate-payment' ||
    path === '/validar-pago' ||
    path.startsWith('/validate-payment/') ||
    path.startsWith('/validar-pago/');
  const isWinners = path === '/winners' || path === '/ganadores';
  const config = getDrawerConfigForRoute(path);
  const isHelpOrLegal = config !== null;

  const itemHome = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-home"]');
  const btnHome = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-home"]');
  const itemValidate = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-validate-payment"]');
  const btnValidate = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-validate-payment"]');
  const itemWinners = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-winners"]');
  const btnWinners = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-winners"]');
  const itemMore = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-more"]');
  const btnMore = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-more"]');
  const btnMenuSettings = sidebar.querySelector<HTMLElement>('[data-ref="btn-menu-settings"]');
  const btnMenuHelp = sidebar.querySelector<HTMLElement>('[data-ref="btn-menu-help"]');
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');

  itemHome?.classList.toggle('is-active', isHome);
  btnHome?.classList.toggle('is-active', isHome);
  itemValidate?.classList.toggle('is-active', isValidate);
  btnValidate?.classList.toggle('is-active', isValidate);
  itemWinners?.classList.toggle('is-active', isWinners);
  btnWinners?.classList.toggle('is-active', isWinners);
  const isMoreActive = isSettings || isHelpOrLegal;
  itemMore?.classList.toggle('is-active', isMoreActive);
  btnMore?.classList.toggle('is-active', isMoreActive);
  btnMenuSettings?.classList.toggle('is-active', isSettings);
  btnMenuHelp?.classList.toggle('is-active', isHelpOrLegal);

  if (!config) {
    isDrawerOpen = false;
    btnToggle?.classList.remove('is-active');
    closeDynamicDrawer();
  } else {
    let drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
    if (!drawer || drawer.dataset.currentConfig !== config.id) {
      if (drawer) {
        drawer.remove();
      }
      drawer = createDrawerElement(config);
      drawer.dataset.currentConfig = config.id;
      bindDynamicDrawerEvents(drawer);
      renderIcons(drawer);
      translateElement(drawer);
      sidebar.appendChild(drawer);
    }
    updateDrawerActiveItem(drawer, path);
    isDrawerOpen = true;
    btnToggle?.classList.add('is-active');
    requestAnimationFrame(() => {
      drawer?.classList.add('is-open', 'is-expanded');
    });
  }
}

function createDrawerElement(config: DrawerPageConfig): HTMLElement {
  const drawer = document.createElement('div');
  drawer.className = 'layout-drawer';
  drawer.setAttribute('data-ref', 'layout-drawer');

  const drawerHeader = document.createElement('div');
  drawerHeader.className = 'layout-drawer__header';
  drawerHeader.setAttribute('data-ref', 'drawer-header');
  drawerHeader.innerHTML = `
    <div class="drawer-header__info" data-ref="drawer-header-info">
      <span class="drawer-header__title" data-ref="drawer-header-title"${config.headerTitleI18n ? ` data-i18n="${config.headerTitleI18n}"` : ''}>${config.headerTitle}</span>
      <span class="drawer-header__subtitle" data-ref="drawer-header-subtitle"${config.headerSubtitleI18n ? ` data-i18n="${config.headerSubtitleI18n}"` : ''}>${config.headerSubtitle}</span>
    </div>
  `;

  const drawerBody = document.createElement('div');
  drawerBody.className = 'layout-drawer__body';
  drawerBody.setAttribute('data-ref', 'drawer-body');

  let sectionsHtml = '';
  for (const section of config.sections) {
    let itemsHtml = '';
    for (const item of section.items) {
      itemsHtml += `
        <button type="button" class="menu-item" data-ref="${item.ref}" data-path="${item.path}">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#${item.icon}"></use></svg>
          <span class="menu-item__text" data-ref="text-${item.ref}"${item.i18nKey ? ` data-i18n="${item.i18nKey}"` : ''}>${item.label}</span>
        </button>
      `;
    }
    sectionsHtml += `
      <div class="drawer-section" data-ref="drawer-section-${section.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}">
        <div class="drawer-section__header" data-ref="drawer-header-${section.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}">
          <span class="drawer-section__title"${section.i18nKey ? ` data-i18n="${section.i18nKey}"` : ''}>${section.title}</span>
        </div>
        <div class="drawer-items-list" data-ref="drawer-items-${section.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  drawerBody.innerHTML = sectionsHtml;
  drawer.appendChild(drawerHeader);
  drawer.appendChild(drawerBody);

  return drawer;
}

function bindDynamicDrawerEvents(drawer: HTMLElement): void {
  const buttons = drawer.querySelectorAll<HTMLButtonElement>('.menu-item[data-path]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const path = btn.getAttribute('data-path');
      if (path) {
        if (window.innerWidth <= 768) {
          toggleDrawer(false);
        }
        navigate(path);
      }
    });
  });
}

function updateDrawerActiveItem(drawer: HTMLElement, path: string): void {
  const buttons = drawer.querySelectorAll<HTMLButtonElement>('.menu-item[data-path]');
  buttons.forEach((btn) => {
    const itemPath = btn.getAttribute('data-path');
    const isActive = itemPath === path || (itemPath !== '/' && path.startsWith(itemPath + '/'));
    btn.classList.toggle('is-active', isActive);
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
  const config = getDrawerConfigForRoute(window.location.pathname);

  if (!config) {
    isDrawerOpen = false;
    btnToggle?.classList.remove('is-active');
    closeDynamicDrawer();
    return;
  }

  const nextOpen = forceState !== undefined ? forceState : !isDrawerOpen;
  isDrawerOpen = nextOpen;
  btnToggle?.classList.toggle('is-active', isDrawerOpen);

  const drawer = sidebar?.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (isDrawerOpen) {
    if (drawerRemovalTimer) {
      clearTimeout(drawerRemovalTimer);
      drawerRemovalTimer = null;
    }
    if (!drawer && sidebar) {
      const newDrawer = createDrawerElement(config);
      newDrawer.dataset.currentConfig = config.id;
      bindDynamicDrawerEvents(newDrawer);
      renderIcons(newDrawer);
      translateElement(newDrawer);
      sidebar.appendChild(newDrawer);
      updateDrawerActiveItem(newDrawer, window.location.pathname);
      requestAnimationFrame(() => {
        newDrawer.classList.add('is-open', 'is-expanded');
      });
    } else if (drawer) {
      drawer.classList.add('is-open', 'is-expanded');
    }
  } else {
    if (drawer) {
      drawer.classList.remove('is-open', 'is-expanded');
    }
  }
}

function setupRailNavigation(sidebar: HTMLElement): void {
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const itemHome = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-home"]');
  const itemValidate = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-validate-payment"]');
  const itemWinners = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-winners"]');
  const moreContainer = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-more"]');
  const btnMore = moreContainer?.querySelector<HTMLElement>('[data-ref="btn-rail-more"]');
  const moreMenu = moreContainer?.querySelector<HTMLElement>('[data-ref="more-menu"]');
  const btnMenuSettings = moreContainer?.querySelector<HTMLElement>('[data-ref="btn-menu-settings"]');
  const btnMenuHelp = moreContainer?.querySelector<HTMLElement>('[data-ref="btn-menu-help"]');

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

  itemWinners?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/winners');
  });

  if (moreContainer && btnMore && moreMenu) {
    let isMoreOpen = false;

    const positionMoreMenu = () => {
      if (window.innerWidth > 768) {
        const btnRect = btnMore.getBoundingClientRect();
        moreMenu.style.position = 'fixed';
        moreMenu.style.left = `${Math.round(btnRect.right + 10)}px`;
        const menuHeight = moreMenu.offsetHeight || 96;
        if (btnRect.top + menuHeight > window.innerHeight - 16) {
          moreMenu.style.top = 'auto';
          moreMenu.style.bottom = `${Math.max(16, window.innerHeight - btnRect.bottom)}px`;
        } else {
          moreMenu.style.top = `${Math.max(16, Math.round(btnRect.top - 6))}px`;
          moreMenu.style.bottom = 'auto';
        }
      } else {
        moreMenu.style.position = '';
        moreMenu.style.left = '';
        moreMenu.style.top = '';
        moreMenu.style.bottom = '';
      }
    };

    const openMoreMenu = () => {
      isMoreOpen = true;
      btnMore.classList.add('is-active');
      moreMenu.classList.add('is-open');
      positionMoreMenu();
    };

    const closeMoreMenu = () => {
      if (!isMoreOpen) return;
      isMoreOpen = false;
      const path = window.location.pathname;
      const isSettings = path === '/settings' || path.startsWith('/settings');
      const isHelpOrLegal = getDrawerConfigForRoute(path) !== null;
      btnMore.classList.toggle('is-active', isSettings || isHelpOrLegal);
      moreMenu.classList.remove('is-open');
    };

    const toggleMoreMenu = (e: Event) => {
      e.stopPropagation();
      if (isMoreOpen) {
        closeMoreMenu();
      } else {
        openMoreMenu();
      }
    };

    btnMore.addEventListener('click', toggleMoreMenu);

    btnMenuSettings?.addEventListener('click', (e) => {
      e.preventDefault();
      closeMoreMenu();
      navigate('/settings');
    });

    btnMenuHelp?.addEventListener('click', (e) => {
      e.preventDefault();
      closeMoreMenu();
      navigate('/terms');
    });

    document.addEventListener('click', (e) => {
      if (isMoreOpen && !moreContainer.contains(e.target as Node)) {
        closeMoreMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMoreOpen) {
        closeMoreMenu();
      }
    });
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
    const maxScroll = Math.max(0, scrollableBody.scrollHeight - scrollableBody.clientHeight);
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
  const firstChild = scrollableBody.firstElementChild;
  if (firstChild) {
    activeResizeObserver.observe(firstChild);
  }
}

