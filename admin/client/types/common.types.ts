export interface ViewController {
  destroy(): void;
  init(): Promise<void> | void;
}

export interface RouteHandlerContext {
  params: Record<string, string>;
  path: string;
  previousPath: string;
  query: URLSearchParams;
}

export type RouteHandler = (context: RouteHandlerContext) => Promise<HTMLElement>;

export interface RouteDefinition {
  handler: RouteHandler;
  path: string;
}
