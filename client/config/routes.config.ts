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
    handler: async (ctx) => {
      const { createValidatePaymentView } = await import('../views/validate-payment.view.js');
      const orderUuid = ctx.params?.orderUuid || ctx.query?.get('order') || undefined;
      return await createValidatePaymentView(orderUuid);
    },
    id: 'validate-payment',
    match: (path) => {
      if (path === '/validate-payment' || path === '/validar-pago') {
        return true;
      }
      const match = path.match(/^\/(?:validate-payment|validar-pago)\/o\/([a-zA-Z0-9-]+)$/);
      if (!match) return false;
      return { orderUuid: match[1] };
    },
  },
  {
    handler: async () => {
      const { createWinnersView } = await import('../views/winners.view.js');
      return await createWinnersView();
    },
    id: 'winners',
    match: (path) => path === '/winners' || path === '/ganadores',
  },
  {
    handler: async () => {
      const { createDailyGiveawayView } = await import('../views/daily-giveaway.view.js');
      return await createDailyGiveawayView();
    },
    id: 'daily-giveaway',
    match: (path) => path === '/sorteo-diario' || path === '/diario' || path === '/daily',
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
  {
    handler: async () => {
      const { createLegalView } = await import('../views/legal.view.js');
      return await createLegalView('terms');
    },
    id: 'legal-terms',
    match: (path) => path === '/terms' || path === '/terminos' || path === '/help' || path === '/faq' || path === '/ayuda',
  },
  {
    handler: async () => {
      const { createLegalView } = await import('../views/legal.view.js');
      return await createLegalView('privacy');
    },
    id: 'legal-privacy',
    match: (path) => path === '/privacy' || path === '/privacidad',
  },
  {
    handler: async () => {
      const { createLegalView } = await import('../views/legal.view.js');
      return await createLegalView('cookies');
    },
    id: 'legal-cookies',
    match: (path) => path === '/cookies',
  },
  {
    handler: async () => {
      const { createLegalView } = await import('../views/legal.view.js');
      return await createLegalView('rules');
    },
    id: 'legal-rules',
    match: (path) => path === '/rules' || path === '/reglas',
  },
  {
    handler: async () => {
      const { createLegalView } = await import('../views/legal.view.js');
      return await createLegalView('prizes');
    },
    id: 'legal-prizes',
    match: (path) => path === '/prizes' || path === '/premios',
  },
  {
    handler: async () => {
      const { createLegalView } = await import('../views/legal.view.js');
      return await createLegalView('responsible-gaming');
    },
    id: 'legal-responsible-gaming',
    match: (path) => path === '/responsible-gaming' || path === '/juego-responsable',
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
