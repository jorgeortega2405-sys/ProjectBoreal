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
      const { createDashboardView } = await import('../views/dashboard.view.js');
      return await createDashboardView();
    },
    id: 'dashboard',
    match: (path) => path === '/' || path === '' || path === '/dashboard',
  },
  {
    handler: async (ctx) => {
      const { createGiveawayCreateView } = await import('../views/giveaway-create.view.js');
      return await createGiveawayCreateView(ctx);
    },
    id: 'giveaway-create',
    match: (path) =>
      path === '/giveaways/create' ||
      path === '/giveaways/new' ||
      path === '/sorteos/crear',
  },
  {
    handler: async (ctx) => {
      const { createGiveawayEditView } = await import('../views/giveaway-edit.view.js');
      return await createGiveawayEditView(ctx);
    },
    id: 'giveaway-edit',
    match: (path) => {
      const editMatch = path.match(/^\/(?:giveaways|sorteos)\/([a-zA-Z0-9_-]+)\/edit$/);
      if (editMatch) {
        return { uuid: editMatch[1] };
      }
      const altMatch = path.match(/^\/(?:giveaways|sorteos)\/edit\/([a-zA-Z0-9_-]+)$/);
      if (altMatch) {
        return { uuid: altMatch[1] };
      }
      return false;
    },
  },
  {
    handler: async () => {
      const { createGiveawaysView } = await import('../views/giveaways.view.js');
      return await createGiveawaysView();
    },
    id: 'giveaways',
    match: (path) =>
      path === '/giveaways' ||
      path.startsWith('/giveaways') ||
      path === '/sorteos' ||
      path.startsWith('/sorteos'),
  },
  {
    handler: async () => {
      const { createPaymentsView } = await import('../views/payments.view.js');
      return await createPaymentsView();
    },
    id: 'payments',
    match: (path) =>
      path === '/payments' ||
      path.startsWith('/payments') ||
      path === '/pagos' ||
      path.startsWith('/pagos') ||
      path === '/orders' ||
      path.startsWith('/orders') ||
      path === '/comprobantes' ||
      path.startsWith('/comprobantes'),
  },
  {
    handler: async () => {
      const { createNotFoundView } = await import('../views/not-found.view.js');
      return await createNotFoundView();
    },
    id: 'not-found',
    match: (path) => path === '/404',
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
