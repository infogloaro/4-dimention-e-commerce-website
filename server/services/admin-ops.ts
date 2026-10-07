import { db, withTransaction, Prisma } from "../db/client";
import { AppError, notFound } from "../core/errors";
import { hashPassword } from "../core/crypto";
import { invalidate } from "../core/cache";
import { audit } from "./audit";
import { invalidateRoleCache, revokeAllSessions, type AuthUser } from "../auth/session";
import { PERMISSIONS, isPermission } from "../auth/permissions";
import { normalizeCode } from "./coupons";
import type { UserStatus, CouponType } from "../db/generated/client";

// ───────────────────────────── customers ─────────────────────────────

export async function listCustomers(q: { search?: string; status?: UserStatus; sort: "newest" | "spend" | "orders"; page: number; pageSize: number }) {
  const where: Prisma.UserWhereInput = {
    role: { isStaff: false },
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { OR: [{ email: { contains: q.search, mode: "insensitive" } }, { name: { contains: q.search, mode: "insensitive" } }, { phone: { contains: q.search } }] } : {}),
  };
  const orderBy: Prisma.UserOrderByWithRelationInput = q.sort === "spend" ? { lifetimeValue: "desc" } : q.sort === "orders" ? { ordersCount: "desc" } : { createdAt: "desc" };
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, name: true, email: true, phone: true, status: true, emailVerifiedAt: true, ordersCount: true, lifetimeValue: true, lastLoginAt: true, createdAt: true } }),
    db.user.count({ where }),
  ]);
  return { items: rows, total };
}

export async function getCustomer(id: string) {
  const u = await db.user.findFirst({
    where: { id, role: { isStaff: false } },
    select: { id: true, name: true, email: true, phone: true, status: true, avatarUrl: true, emailVerifiedAt: true, phoneVerifiedAt: true, marketingOptIn: true, ordersCount: true, lifetimeValue: true, lastLoginAt: true, lastLoginIp: true, createdAt: true, addresses: { where: { deletedAt: null }, orderBy: { isDefault: "desc" } }, _count: { select: { reviews: true, wishlist: true, returns: true, tickets: true } } },
  });
  if (!u) throw notFound("USER_NOT_FOUND", "Customer");
  const orders = await db.order.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, orderNumber: true, status: true, paymentStatus: true, grandTotal: true, createdAt: true } });
  const { _count, ...rest } = u;
  return { ...rest, counts: { reviews: _count.reviews, wishlist: _count.wishlist, returns: _count.returns, tickets: _count.tickets }, recentOrders: orders, averageOrderValue: u.ordersCount ? Math.round(u.lifetimeValue / u.ordersCount) : 0 };
}

export async function setCustomerStatus(actor: AuthUser, id: string, status: UserStatus, reason?: string) {
  const u = await db.user.findFirst({ where: { id, role: { isStaff: false } }, select: { id: true, status: true } });
  if (!u) throw notFound("USER_NOT_FOUND", "Customer");
  await db.user.update({ where: { id }, data: { status } });
  if (status !== "ACTIVE") await revokeAllSessions(id);
  await audit({ action: "customer.status_changed", resourceType: "user", resourceId: id, actor, metadata: { from: u.status, to: status, reason } });
}

// ───────────────────────────── coupons ─────────────────────────────

export interface CouponInput {
  code?: string;
  description?: string | null;
  type?: CouponType;
  value?: number;
  minSubtotal?: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
  firstOrderOnly?: boolean;
  isStackable?: boolean;
  isPublic?: boolean;
  restrictedToUserId?: string | null;
  productIds?: string[];
  categoryIds?: string[];
}

function assertCouponRules(i: CouponInput, current?: { type: CouponType; value: number }) {
  const type = i.type ?? current?.type;
  const value = i.value ?? current?.value;
  if (type === "PERCENTAGE" && (value == null || value < 1 || value > 100)) throw new AppError("VALIDATION_ERROR", "Percentage must be between 1 and 100");
  if (type === "FIXED_AMOUNT" && (value == null || value < 1)) throw new AppError("VALIDATION_ERROR", "Fixed amount must be positive");
  if (i.startsAt && i.endsAt && i.endsAt <= i.startsAt) throw new AppError("VALIDATION_ERROR", "endsAt must be after startsAt");
}

export async function listCoupons(q: { search?: string; active?: boolean; page: number; pageSize: number }) {
  const where: Prisma.CouponWhereInput = { ...(q.active != null ? { isActive: q.active } : {}), ...(q.search ? { OR: [{ code: { contains: q.search.toUpperCase() } }, { description: { contains: q.search, mode: "insensitive" } }] } : {}) };
  const [items, total] = await Promise.all([db.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { _count: { select: { products: true, categories: true } } } }), db.coupon.count({ where })]);
  return { items, total };
}

export async function createCoupon(actor: AuthUser, input: CouponInput & { code: string; type: CouponType; value: number }) {
  assertCouponRules(input);
  const { productIds, categoryIds, ...data } = input;
  const code = normalizeCode(input.code);
  if (await db.coupon.findUnique({ where: { code }, select: { id: true } })) throw new AppError("COUPON_CODE_TAKEN", "A coupon with this code already exists");
  const c = await db.coupon.create({
    data: { ...data, code, products: productIds?.length ? { create: productIds.map((productId) => ({ productId })) } : undefined, categories: categoryIds?.length ? { create: categoryIds.map((categoryId) => ({ categoryId })) } : undefined },
  });
  invalidate("offers:");
  await audit({ action: "coupon.created", resourceType: "coupon", resourceId: c.id, actor, metadata: { code, type: input.type, value: input.value } });
  return c;
}

export async function updateCoupon(actor: AuthUser, id: string, input: CouponInput) {
  const cur = await db.coupon.findUnique({ where: { id } });
  if (!cur) throw notFound("COUPON_NOT_FOUND", "Coupon");
  assertCouponRules(input, cur);
  const { productIds, categoryIds, code, ...data } = input;
  const newCode = code ? normalizeCode(code) : undefined;
  if (newCode && newCode !== cur.code && (await db.coupon.findUnique({ where: { code: newCode }, select: { id: true } }))) throw new AppError("COUPON_CODE_TAKEN", "A coupon with this code already exists");
  await withTransaction(async (tx) => {
    await tx.coupon.update({ where: { id }, data: { ...data, ...(newCode ? { code: newCode } : {}) } });
    if (productIds) {
      await tx.couponProduct.deleteMany({ where: { couponId: id } });
      if (productIds.length) await tx.couponProduct.createMany({ data: productIds.map((productId) => ({ couponId: id, productId })) });
    }
    if (categoryIds) {
      await tx.couponCategory.deleteMany({ where: { couponId: id } });
      if (categoryIds.length) await tx.couponCategory.createMany({ data: categoryIds.map((categoryId) => ({ couponId: id, categoryId })) });
    }
    await audit({ action: "coupon.updated", resourceType: "coupon", resourceId: id, actor, metadata: { fields: Object.keys(input) } }, tx);
  });
  invalidate("offers:");
  return db.coupon.findUniqueOrThrow({ where: { id }, include: { products: true, categories: true } });
}

export async function deleteCoupon(actor: AuthUser, id: string) {
  const c = await db.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
  if (!c) throw notFound("COUPON_NOT_FOUND", "Coupon");
  if (c._count.redemptions > 0) {
    await db.coupon.update({ where: { id }, data: { isActive: false } }); // keep history intact
    await audit({ action: "coupon.deactivated", resourceType: "coupon", resourceId: id, actor, metadata: { code: c.code, reason: "has redemptions" } });
    invalidate("offers:");
    return { deleted: false, deactivated: true };
  }
  await db.coupon.delete({ where: { id } });
  await audit({ action: "coupon.deleted", resourceType: "coupon", resourceId: id, actor, metadata: { code: c.code } });
  invalidate("offers:");
  return { deleted: true, deactivated: false };
}

export async function couponAnalytics(id: string) {
  const c = await db.coupon.findUnique({ where: { id }, include: { products: true, categories: true } });
  if (!c) throw notFound("COUPON_NOT_FOUND", "Coupon");
  const [agg] = await db.$queryRaw<Array<{ uses: number; discount: number; revenue: number; users: number }>>`
    SELECT count(*)::int AS uses, coalesce(sum(r."discountAmount"), 0)::int AS discount, coalesce(sum(o."grandTotal"), 0)::int AS revenue, count(DISTINCT r."userId")::int AS users
    FROM "CouponRedemption" r JOIN "Order" o ON o.id = r."orderId"
    WHERE r."couponId" = ${id} AND r."releasedAt" IS NULL AND o.status NOT IN ('CANCELLED', 'FAILED')`;
  const recent = await db.couponRedemption.findMany({ where: { couponId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, orderId: true, userId: true, discountAmount: true, releasedAt: true, createdAt: true } });
  return { coupon: c, stats: { uses: agg?.uses ?? 0, totalDiscount: agg?.discount ?? 0, revenueInfluenced: agg?.revenue ?? 0, uniqueUsers: agg?.users ?? 0, remaining: c.usageLimit == null ? null : Math.max(0, c.usageLimit - c.usedCount) }, recentRedemptions: recent };
}

// ───────────────────────────── staff & roles ─────────────────────────────

export async function listStaff() {
  return db.user.findMany({ where: { role: { isStaff: true } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true, role: { select: { key: true, name: true } } } });
}

export async function createStaff(actor: AuthUser, input: { name: string; email: string; password: string; roleKey: string }) {
  const role = await db.role.findUnique({ where: { key: input.roleKey } });
  if (!role || !role.isStaff) throw notFound("ROLE_NOT_FOUND", "Staff role");
  if (role.key === "super_admin" && !actor.permissions.has("role:manage")) throw new AppError("FORBIDDEN", "Only a super admin can create another super admin");
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw new AppError("EMAIL_TAKEN", "An account with this email already exists");
  const u = await db.user.create({ data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), roleId: role.id, emailVerifiedAt: new Date() } });
  await audit({ action: "user.staff_created", resourceType: "user", resourceId: u.id, actor, metadata: { role: role.key } });
  return { id: u.id, email: u.email, role: role.key };
}

export async function changeUserRole(actor: AuthUser, userId: string, roleKey: string) {
  if (userId === actor.id) throw new AppError("FORBIDDEN", "You cannot change your own role");
  const [role, user] = await Promise.all([db.role.findUnique({ where: { key: roleKey } }), db.user.findUnique({ where: { id: userId }, include: { role: true } })]);
  if (!role) throw notFound("ROLE_NOT_FOUND", "Role");
  if (!user) throw notFound("USER_NOT_FOUND", "User");
  const touchesSuper = role.key === "super_admin" || user.role.key === "super_admin";
  if (touchesSuper && !actor.permissions.has("role:manage")) throw new AppError("FORBIDDEN", "Only a super admin can grant or revoke super admin");
  await db.user.update({ where: { id: userId }, data: { roleId: role.id } });
  await revokeAllSessions(userId); // force re-login so the new permission set applies immediately
  await audit({ action: "user.role_changed", resourceType: "user", resourceId: userId, actor, metadata: { from: user.role.key, to: role.key } });
}

export async function listRoles() {
  const roles = await db.role.findMany({ orderBy: { createdAt: "asc" }, include: { permissions: { select: { permission: { select: { key: true } } } }, _count: { select: { users: true } } } });
  return roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, isStaff: r.isStaff, userCount: r._count.users, permissions: r.permissions.map((p) => p.permission.key).sort() }));
}

export const permissionCatalogue = () => [...PERMISSIONS];

export async function setRolePermissions(actor: AuthUser, roleId: string, permissionKeys: string[]) {
  const role = await db.role.findUnique({ where: { id: roleId }, include: { permissions: { select: { permission: { select: { key: true } } } } } });
  if (!role) throw notFound("ROLE_NOT_FOUND", "Role");
  if (role.key === "super_admin") throw new AppError("SYSTEM_ROLE_PROTECTED", "The super admin role always holds every permission");
  if (role.key === "customer") throw new AppError("SYSTEM_ROLE_PROTECTED", "Customers cannot be granted admin permissions");
  const keys = [...new Set(permissionKeys)];
  const bad = keys.filter((k) => !isPermission(k));
  if (bad.length) throw new AppError("VALIDATION_ERROR", "Unknown permissions", { unknown: bad });
  const before = role.permissions.map((p) => p.permission.key).sort();
  const perms = await db.permission.findMany({ where: { key: { in: keys } } });
  await withTransaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (perms.length) await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) });
    await audit({ action: "role.permissions_changed", resourceType: "role", resourceId: roleId, actor, metadata: { role: role.key, before, after: keys.sort() } }, tx);
  });
  invalidateRoleCache();
  return { id: roleId, permissions: keys.sort() };
}

// ───────────────────────────── settings ─────────────────────────────

export const listSettings = () => db.storeSetting.findMany({ orderBy: { key: "asc" } });
export const publicSettings = async () => Object.fromEntries((await db.storeSetting.findMany({ where: { isPublic: true } })).map((s) => [s.key, s.value]));

export async function putSetting(actor: AuthUser, key: string, value: Prisma.InputJsonValue, isPublic?: boolean) {
  const prev = await db.storeSetting.findUnique({ where: { key } });
  const s = await db.storeSetting.upsert({ where: { key }, create: { key, value, isPublic: isPublic ?? false }, update: { value, ...(isPublic != null ? { isPublic } : {}) } });
  await audit({ action: "settings.updated", resourceType: "setting", resourceId: key, actor, metadata: { before: prev?.value ?? null } });
  return s;
}

// ───────────────────────────── audit log ─────────────────────────────

export async function listAuditLogs(q: { actorId?: string; action?: string; resourceType?: string; resourceId?: string; from?: Date; to?: Date; page: number; pageSize: number }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.resourceType ? { resourceType: q.resourceType } : {}),
    ...(q.resourceId ? { resourceId: q.resourceId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { actor: { select: { name: true, email: true } } } }), db.auditLog.count({ where })]);
  return { items, total };
}
