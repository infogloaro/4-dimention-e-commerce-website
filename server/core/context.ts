import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  ip: string;
  userAgent: string | null;
  method?: string;
  path?: string;
  actorId?: string | null;
  actorRole?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => Promise<T>) => storage.run(ctx, fn);
export const getContext = (): RequestContext | undefined => storage.getStore();
