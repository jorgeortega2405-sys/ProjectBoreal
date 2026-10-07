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
