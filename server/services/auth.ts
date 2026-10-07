import { db } from "../db/client";
import { AppError } from "../core/errors";
import { fakePasswordCheck, hashPassword, hashToken, randomDigits, randomToken, verifyPassword } from "../core/crypto";
import { createSession, revokeAllSessions, revokeSession, rotateSession, type AuthUser } from "../auth/session";
import { audit } from "./audit";
import { notify } from "./notifications";
import { mergeGuestCart } from "./cart";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 3_600_000;
const OTP_TTL_MS = 10 * 60_000;

interface Meta {
  ip?: string;
  userAgent?: string | null;
}

export function toPublicUser(u: AuthUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    status: u.status,
    role: u.roleKey,
    isStaff: u.isStaff,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    permissions: u.isStaff ? [...u.permissions].sort() : [],
  };
}

async function customerRoleId(): Promise<string> {
  const role = await db.role.findUnique({ where: { key: "customer" }, select: { id: true } });
  if (!role) throw new AppError("INTERNAL_ERROR", "Roles are not seeded. Run `npm run db:seed`.");
  return role.id;
}

async function issueToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "PHONE_OTP", ttlMs: number, token = randomToken(32)) {
  // one live token per (user,type): invalidate previous ones
  await db.verificationToken.deleteMany({ where: { userId, type, usedAt: null } });
  await db.verificationToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

async function consumeToken(token: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "PHONE_OTP", userId?: string) {
  // atomic single-use: only one concurrent caller can flip usedAt
  const rec = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || rec.type !== type || rec.usedAt || rec.expiresAt <= new Date() || (userId && rec.userId !== userId)) {
    throw new AppError("INVALID_TOKEN", "This link or code is invalid or has expired");
  }
  const res = await db.verificationToken.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: new Date() } });
  if (res.count !== 1) throw new AppError("INVALID_TOKEN", "This link or code is invalid or has expired");
  return rec.userId;
}

export async function register(input: { name: string; email: string; password: string; phone?: string }, meta: Meta, guestToken?: string | null) {
  const [emailTaken, phoneTaken] = await Promise.all([
    db.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    input.phone ? db.user.findUnique({ where: { phone: input.phone }, select: { id: true } }) : null,
  ]);
  if (emailTaken) throw new AppError("EMAIL_TAKEN", "An account with this email already exists");
  if (phoneTaken) throw new AppError("PHONE_TAKEN", "An account with this phone number already exists");

  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: { name: input.name, email: input.email, phone: input.phone, passwordHash, roleId: await customerRoleId() },
  });

  const verifyToken = await issueToken(user.id, "EMAIL_VERIFICATION", VERIFY_TTL_MS);
  await Promise.all([
    notify("account.created", { userId: user.id, email: user.email }, { name: user.name }),
    notify("email.verification", { userId: user.id, email: user.email }, { token: verifyToken }),
    audit({ action: "auth.registered", resourceType: "user", resourceId: user.id, actor: { id: user.id, roleKey: "customer" } }),
  ]);

  const { token } = await createSession(user.id, meta);
  if (guestToken) await mergeGuestCart(user.id, guestToken).catch(() => undefined);
  return { userId: user.id, sessionToken: token };
}

export async function login(input: { email: string; password: string }, meta: Meta, guestToken?: string | null) {
  const user = await db.user.findUnique({ where: { email: input.email }, include: { role: true } });
  if (!user) {
    await fakePasswordCheck(input.password);
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError("ACCOUNT_LOCKED", `Too many failed attempts. Try again in ${mins} minute(s).`, { retryAfterMinutes: mins });
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const updated = await db.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
    if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
      await db.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginCount: 0 } });
      await audit({ action: "auth.account_locked", resourceType: "user", resourceId: user.id });
    }
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password");
  }
  if (user.status === "BANNED" || user.status === "SUSPENDED" || user.status === "DELETED") {
    throw new AppError("ACCOUNT_DISABLED", "This account has been disabled. Please contact support.");
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: meta.ip } });
  const { token } = await createSession(user.id, meta);
  if (guestToken) await mergeGuestCart(user.id, guestToken).catch(() => undefined);
  await audit({ action: "auth.login", resourceType: "user", resourceId: user.id, actor: { id: user.id, roleKey: user.role.key } });
  return { userId: user.id, sessionToken: token };
}

export async function logout(user: AuthUser) {
  await revokeSession(user.sessionId);
  await audit({ action: "auth.logout", resourceType: "user", resourceId: user.id, actor: user });
}

export async function refresh(user: AuthUser, meta: Meta) {
  const { token } = await rotateSession(user, meta);
  return { sessionToken: token };
}

export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
  // Always behave identically to avoid account enumeration.
  if (!user || user.status === "DELETED" || user.status === "BANNED") return;
  const token = await issueToken(user.id, "PASSWORD_RESET", RESET_TTL_MS);
  await notify("password.reset", { userId: user.id, email: user.email }, { token });
  await audit({ action: "auth.password_reset_requested", resourceType: "user", resourceId: user.id, actor: { id: user.id } });
}

export async function resetPassword(token: string, newPassword: string) {
  const userId = await consumeToken(token, "PASSWORD_RESET");
  const passwordHash = await hashPassword(newPassword);
  const user = await db.user.update({
    where: { id: userId },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    select: { id: true, email: true },
  });
  await revokeAllSessions(userId);
  await notify("password.changed", { userId, email: user.email });
  await audit({ action: "auth.password_reset", resourceType: "user", resourceId: userId, actor: { id: userId } });
}

export async function changePassword(user: AuthUser, current: string, next: string) {
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(current, row.passwordHash))) {
    throw new AppError("INVALID_CREDENTIALS", "Current password is incorrect");
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await revokeAllSessions(user.id, user.sessionId);
  await notify("password.changed", { userId: user.id, email: user.email });
  await audit({ action: "auth.password_changed", resourceType: "user", resourceId: user.id, actor: user });
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, "EMAIL_VERIFICATION");
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return { verified: true };
}

export async function resendVerification(user: AuthUser) {
  if (user.emailVerified) return;
  const token = await issueToken(user.id, "EMAIL_VERIFICATION", VERIFY_TTL_MS);
  await notify("email.verification", { userId: user.id, email: user.email }, { token });
}

export async function requestPhoneOtp(user: AuthUser, phone: string) {
  const taken = await db.user.findFirst({ where: { phone, NOT: { id: user.id } }, select: { id: true } });
  if (taken) throw new AppError("PHONE_TAKEN", "This phone number is already in use");
  await db.user.update({ where: { id: user.id }, data: { phone, phoneVerifiedAt: null } });
  const code = randomDigits(6);
  // bind the code to the user: token hash includes user id so a 6-digit code can't be replayed across accounts
  await db.verificationToken.deleteMany({ where: { userId: user.id, type: "PHONE_OTP" } });
  await db.verificationToken.create({
    data: { userId: user.id, type: "PHONE_OTP", tokenHash: hashToken(`${user.id}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  await notify("phone.otp", { userId: user.id, phone }, { code });
}

export async function verifyPhoneOtp(user: AuthUser, code: string) {
  await consumeToken(`${user.id}:${code}`, "PHONE_OTP", user.id);
  await db.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
  return { verified: true };
}

export async function updateProfile(user: AuthUser, input: { name?: string; avatarUrl?: string | null; marketingOptIn?: boolean; preferences?: Record<string, unknown>; phone?: string | null }) {
  if (input.phone) {
    const taken = await db.user.findFirst({ where: { phone: input.phone, NOT: { id: user.id } }, select: { id: true } });
    if (taken) throw new AppError("PHONE_TAKEN", "This phone number is already in use");
  }
  const phoneChanged = input.phone !== undefined && input.phone !== user.phone;
  await db.user.update({
    where: { id: user.id },
    data: {
      name: input.name,
      avatarUrl: input.avatarUrl,
      marketingOptIn: input.marketingOptIn,
      preferences: input.preferences as object | undefined,
      phone: input.phone,
      ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
    },
  });
}

export async function listSessions(user: AuthUser) {
  const rows = await db.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastUsedAt: true },
  });
  return rows.map((r) => ({ ...r, current: r.id === user.sessionId }));
}

export async function revokeUserSession(user: AuthUser, sessionId: string) {
  const res = await db.session.updateMany({ where: { id: sessionId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw new AppError("NOT_FOUND", "Session not found");
}
