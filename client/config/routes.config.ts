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
      const { createHomeView } = await import('../views/home.view.js');
      return await createHomeView();
    },
    id: 'home',
    match: (path) => path === '/' || path === '',
  },
  {
    handler: async () => {
      const { createValidatePaymentView } = await import('../views/validate-payment.view.js');
      return await createValidatePaymentView();
    },
    id: 'validate-payment',
    match: (path) => path === '/validate-payment' || path === '/validar-pago',
  },
  {
    handler: async (ctx) => {
      const { createGiveawayDetailView } = await import('../views/giveaway-detail.view.js');
      return await createGiveawayDetailView(ctx.params.uuid);
    },
    id: 'giveaway-detail',
    match: (path) => {
      const match = path.match(/^\/s\/([a-zA-Z0-9-]+)$/);
      if (!match) return false;
      return { uuid: match[1] };
    },
  },
  {
    handler: async () => {
      const { createSettingsView } = await import('../views/settings.view.js');
      return await createSettingsView();
    },
    id: 'settings',
    match: (path) => path === '/settings' || path.startsWith('/settings'),
  },
  {
    handler: async () => {
      const { createDrawingView } = await import('../views/drawing.view.js');
      return await createDrawingView();
    },
    id: 'drawing',
    match: (path) => path === '/drawing' || path === '/canvas' || path === '/draw',
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
