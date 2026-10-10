import { getCurrentUser } from '../services/auth.service.js';

export const MODULE_PERMISSIONS: Record<string, string[]> = {
  'bank-accounts': ['bank_accounts:read', 'bank_accounts:manage', 'bank_accounts:delete'],
  'customers': ['customers:read', 'customers:block'],
  'dashboard': ['dashboard:read'],
  'giveaway-create': ['giveaways:create'],
  'giveaway-edit': ['giveaways:read', 'giveaways:manage'],
  'giveaways': ['giveaways:read', 'giveaways:create', 'giveaways:manage', 'giveaways:draw'],
  'payments': ['orders:read', 'orders:approve', 'orders:reject', 'orders:manage'],
  'roles': ['roles:read', 'roles:manage'],
  'settings': [],
  'winners': ['winners:read', 'winners:manage'],
};

export function hasPermission(permission: string): boolean {
  const user = getCurrentUser();
  if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) {
    return false;
  }
  if (user.permissions.includes('*')) {
    return true;
  }
  return user.permissions.includes(permission);
}

export function hasAnyPermission(...neededPerms: string[]): boolean {
  return neededPerms.some((perm) => hasPermission(perm));
}

export function hasAllPermissions(...neededPerms: string[]): boolean {
  return neededPerms.every((perm) => hasPermission(perm));
}

export function canAccessModule(moduleId: string): boolean {
  const requiredPerms = MODULE_PERMISSIONS[moduleId];
  if (!requiredPerms) {
    return true;
  }
  if (requiredPerms.length === 0) {
    return true;
  }
  return hasAnyPermission(...requiredPerms);
}

export function resolveModuleFromPath(path: string): string | null {
  if (path === '/' || path === '' || path === '/dashboard' || path.startsWith('/dashboard')) {
    return 'dashboard';
  }
  if (path === '/giveaways/create' || path === '/giveaways/new' || path === '/sorteos/crear') {
    return 'giveaway-create';
  }
  if (/^\/(?:giveaways|sorteos)\/([a-zA-Z0-9_-]+)\/edit$/.test(path) || /^\/(?:giveaways|sorteos)\/edit\/([a-zA-Z0-9_-]+)$/.test(path)) {
    return 'giveaway-edit';
  }
  if (path === '/giveaways' || path.startsWith('/giveaways') || path === '/sorteos' || path.startsWith('/sorteos')) {
    return 'giveaways';
  }
  if (
    path === '/payments' ||
    path.startsWith('/payments') ||
    path === '/pagos' ||
    path.startsWith('/pagos') ||
    path === '/orders' ||
    path.startsWith('/orders') ||
    path === '/comprobantes' ||
    path.startsWith('/comprobantes')
  ) {
    return 'payments';
  }
  if (
    path === '/bank-accounts' ||
    path.startsWith('/bank-accounts') ||
    path === '/cuentas-bancarias' ||
    path.startsWith('/cuentas-bancarias') ||
    path === '/bancos' ||
    path.startsWith('/bancos')
  ) {
    return 'bank-accounts';
  }
  if (
    path === '/customers' ||
    path.startsWith('/customers') ||
    path === '/clientes' ||
    path.startsWith('/clientes') ||
    path === '/participantes' ||
    path.startsWith('/participantes')
  ) {
    return 'customers';
  }
  if (
    path === '/winners' ||
    path.startsWith('/winners') ||
    path === '/ganadores' ||
    path.startsWith('/ganadores') ||
    path === '/premios' ||
    path.startsWith('/premios')
  ) {
    return 'winners';
  }
  if (path === '/roles' || path.startsWith('/roles') || path === '/permisos' || path.startsWith('/permisos')) {
    return 'roles';
  }
  if (
    path === '/settings' ||
    path.startsWith('/settings') ||
    path === '/configuracion' ||
    path.startsWith('/configuracion') ||
    path === '/ajustes' ||
    path.startsWith('/ajustes')
  ) {
    return 'settings';
  }
  return null;
}

export function canAccessRoute(path: string): boolean {
  const moduleId = resolveModuleFromPath(path);
  if (!moduleId) {
    return true;
  }
  return canAccessModule(moduleId);
}

export function getDefaultLandingRoute(): string {
  const priorityOrder: Array<{ moduleId: string; path: string }> = [
    { moduleId: 'dashboard', path: '/' },
    { moduleId: 'giveaways', path: '/giveaways' },
    { moduleId: 'payments', path: '/payments' },
    { moduleId: 'bank-accounts', path: '/bank-accounts' },
    { moduleId: 'customers', path: '/customers' },
    { moduleId: 'winners', path: '/winners' },
    { moduleId: 'roles', path: '/roles' },
  ];

  for (const item of priorityOrder) {
    if (canAccessModule(item.moduleId)) {
      return item.path;
    }
  }

  return '/settings';
}
