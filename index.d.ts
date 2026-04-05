/**
 * @torquedev/server - TypeScript declarations
 */
import type { Application } from 'express';

export interface CreateServerOptions {
  frontendDir?: string;
  hookBus?: object;
  authResolver?: (req: object, registry: object) => unknown | null;
  silent?: boolean;
}

export interface RouteContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  currentUser: unknown;
}

export declare function createServer(
  registry: object,
  eventBus: object,
  opts?: CreateServerOptions
): Application;
