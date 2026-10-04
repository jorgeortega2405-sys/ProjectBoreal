export interface RouteContext {
  params: Record<string, string>;
  path: string;
  previousPath: string;
  query: URLSearchParams;
}

export type RouteHandler = (ctx: RouteContext) => Promise<HTMLElement | null>;

export interface RouteDefinition {
  handler: RouteHandler;
  id: string;
  match: (path: string) => boolean | Record<string, string>;
}

export const APP_ROUTES: RouteDefinition[] = [
  {
    handler: async () => {
      const { createLoginView } = await import('../views/login.view.js');
      return await createLoginView();
    },
    id: 'login',
    match: (path) => path === '/login',
  },
  {
    handler: async () => {
      const { createDashboardView } = await import('../views/dashboard.view.js');
      return await createDashboardView();
    },
    id: 'dashboard',
    match: (path) => path === '/' || path === '' || path === '/dashboard',
  },
  {
    handler: async () => {
      const { createGiveawaysView } = await import('../views/giveaways.view.js');
      return await createGiveawaysView();
    },
    id: 'giveaways',
    match: (path) => path === '/sorteos' || path === '/giveaways',
  },
  {
    handler: async () => {
      const { createGiveawayFormView } = await import('../views/giveaway-form.view.js');
      return await createGiveawayFormView();
    },
    id: 'giveaway-create',
    match: (path) => path === '/sorteo/create' || path === '/sorteos/create',
  },
  {
    handler: async (ctx) => {
      const { createGiveawayFormView } = await import('../views/giveaway-form.view.js');
      return await createGiveawayFormView(ctx.params.uuid);
    },
    id: 'giveaway-edit',
    match: (path) => {
      const match = path.match(/^\/sorteos?\/([a-zA-Z0-9-]+)\/edit$/);
      if (!match) return false;
      return { uuid: match[1] };
    },
  },
  {

    handler: async () => {
      const { createOrdersView } = await import('../views/orders.view.js');
      return await createOrdersView();
    },
    id: 'orders',
    match: (path) => path === '/ordenes' || path === '/pagos' || path === '/orders',
  },
  {
    handler: async () => {
      const { createBankAccountsView } = await import('../views/bank-accounts.view.js');
      return await createBankAccountsView();
    },
    id: 'bank-accounts',
    match: (path) => path === '/cuentas-bancarias' || path === '/bancos' || path === '/cuentas',
  },
  {
    handler: async () => {
      const { createAuditView } = await import('../views/audit.view.js');
      return await createAuditView();
    },
    id: 'audit',
    match: (path) => path === '/auditoria' || path === '/logs' || path === '/audit',
  },
];



export function findRoute(path: string): { params: Record<string, string>; route: RouteDefinition } | null {
  for (const route of APP_ROUTES) {
    const matchResult = route.match(path);
    if (matchResult) {
      const params = typeof matchResult === 'object' ? matchResult : {};
      return { params, route };
    }
  }
  return null;
}
