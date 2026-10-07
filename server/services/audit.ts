import { db, type Db, Prisma } from "../db/client";
import { getContext } from "../core/context";
import { logger } from "../core/logger";
import type { AuthUser } from "../auth/session";

export interface AuditInput {
  action: string; // e.g. "product.created"
  resourceType: string;
  resourceId?: string | null;
  actor?: Pick<AuthUser, "id" | "roleKey"> | { id: string; roleKey?: string } | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit entry. Pass a transaction client as `client` to make the entry atomic with the change it describes
 * (errors then propagate). With the default client a logging failure never breaks the business operation.
 */
export async function audit(input: AuditInput, client?: Db): Promise<void> {
  const ctx = getContext();
  const data = {
    actorId: input.actor?.id ?? ctx?.actorId ?? null,
    actorRole: (input.actor && "roleKey" in input.actor ? input.actor.roleKey : undefined) ?? ctx?.actorRole ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    ip: ctx?.ip && ctx.ip !== "unknown" ? ctx.ip : null,
    userAgent: ctx?.userAgent?.slice(0, 300) ?? null,
    requestId: ctx?.requestId ?? null,
    metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };
  if (client) {
    await client.auditLog.create({ data });
    return;
  }
  try {
    await db.auditLog.create({ data });
  } catch (e) {
    logger.error("audit write failed", { action: input.action, error: e instanceof Error ? e.message : String(e) });
  }
}
