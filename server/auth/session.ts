import { db } from "../db/client";
import { env } from "../core/env";
import { AppError } from "../core/errors";
import { hashToken, randomToken } from "../core/crypto";
import { PERMISSIONS, type Permission } from "./permissions";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  roleKey: string;
  isStaff: boolean;
  permissions: ReadonlySet<Permission>;
  sessionId: string;
}

// ── role → permissions cache (short TTL; invalidated on role edits) ──
const ROLE_TTL_MS = 30_000;
const roleCache = new Map<string, { perms: Set<Permission>; expires: number }>();
export const invalidateRoleCache = () => roleCache.clear();

async function permissionsForRole(roleId: string): Promise<Set<Permission>> {
  const hit = roleCache.get(roleId);
  if (hit && hit.expires > Date.now()) return hit.perms;
  const rows = await db.rolePermission.findMany({ where: { roleId }, select: { permission: { select: { key: true } } } });
  const known = new Set<string>(PERMISSIONS);
  const perms = new Set(rows.map((r) => r.permission.key).filter((k): k is Permission => known.has(k)));
  roleCache.set(roleId, { perms, expires: Date.now() + ROLE_TTL_MS });
  return perms;
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string | null }) {
  const token = randomToken(32);
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
      expiresAt: sessionExpiry(),
    },
  });
  return { token, session };
}

const TOUCH_INTERVAL_MS = 5 * 60_000;

/** Resolve a raw session token to an authenticated user, or null. Never throws for bad tokens. */
export async function authenticateToken(token: string | null | undefined): Promise<AuthUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  const u = session.user;
  if (u.status === "BANNED" || u.status === "SUSPENDED" || u.status === "DELETED") return null;

  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    // fire-and-forget; sliding expiry
    void db.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date(), expiresAt: sessionExpiry() } })
      .catch(() => undefined);
  }

  return buildAuthUser(u, session.id);
}

type UserWithRole = Awaited<ReturnType<typeof db.user.findUniqueOrThrow<{ where: { id: string }; include: { role: true } }>>>;

async function buildAuthUser(u: UserWithRole, sessionId: string): Promise<AuthUser> {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    status: u.status,
    emailVerified: !!u.emailVerifiedAt,
    phoneVerified: !!u.phoneVerifiedAt,
    roleKey: u.role.key,
    isStaff: u.role.isStaff,
    permissions: await permissionsForRole(u.roleId),
    sessionId,
  };
}

/** Re-read a user (e.g. after a profile edit) while keeping the caller's session id. */
export async function loadAuthUserById(userId: string, sessionId: string): Promise<AuthUser | null> {
  const u = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  return u ? buildAuthUser(u, sessionId) : null;
}

export async function revokeSession(sessionId: string) {
  await db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/** Rotate: revoke the presented session and mint a fresh one (used by /auth/refresh). */
export async function rotateSession(old: AuthUser, meta: { ip?: string; userAgent?: string | null }) {
  await revokeSession(old.sessionId);
  return createSession(old.id, meta);
}

export function assertPermissions(user: AuthUser, required: Permission[], mode: "all" | "any" = "all") {
  const ok = mode === "all" ? required.every((p) => user.permissions.has(p)) : required.some((p) => user.permissions.has(p));
  if (!ok) throw new AppError("FORBIDDEN", "You do not have permission to perform this action");
}

export const hasPermission = (user: AuthUser | null | undefined, p: Permission) => !!user?.permissions.has(p);
