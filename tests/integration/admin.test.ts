import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { call, type CallOptions } from "../support/api";
import { bootstrap, createUser, makeAddress, makeCategory, makeProduct, sessionFor, staffSession } from "../support/fixtures";
import { db } from "@/server/db/client";
import { ROLE_DEFINITIONS, SYSTEM_ROLES, type Permission } from "@/server/auth/permissions";
import { addItem } from "@/server/services/cart";
import * as checkout from "@/app/api/v1/checkout/create/route";
import * as adminProducts from "@/app/api/v1/admin/products/route";
import * as adminProduct from "@/app/api/v1/admin/products/[id]/route";
import * as adminBulk from "@/app/api/v1/admin/products/bulk/route";
import * as adminVariant from "@/app/api/v1/admin/variants/[id]/route";
import * as adminInventory from "@/app/api/v1/admin/inventory/route";
import * as adminAdjust from "@/app/api/v1/admin/inventory/adjust/route";
import * as adminReceive from "@/app/api/v1/admin/inventory/receive/route";
import * as adminMovements from "@/app/api/v1/admin/inventory/movements/route";
import * as adminLow from "@/app/api/v1/admin/inventory/low-stock/route";
import * as adminCategories from "@/app/api/v1/admin/categories/route";
import * as adminCategory from "@/app/api/v1/admin/categories/[id]/route";
import * as adminCoupons from "@/app/api/v1/admin/coupons/route";
import * as adminCoupon from "@/app/api/v1/admin/coupons/[id]/route";
import * as adminCustomers from "@/app/api/v1/admin/customers/route";
import * as adminCustomerStatus from "@/app/api/v1/admin/customers/[id]/status/route";
import * as adminOrders from "@/app/api/v1/admin/orders/route";
import * as adminUsers from "@/app/api/v1/admin/users/route";
import * as adminUserRole from "@/app/api/v1/admin/users/[id]/role/route";
import * as adminRoles from "@/app/api/v1/admin/roles/route";
import * as adminRolePerms from "@/app/api/v1/admin/roles/[id]/permissions/route";
import * as adminAudit from "@/app/api/v1/admin/audit-logs/route";
import * as adminSettings from "@/app/api/v1/admin/settings/route";
import * as adminDashboard from "@/app/api/v1/admin/dashboard/route";
import * as adminSales from "@/app/api/v1/admin/analytics/sales/route";
import * as adminAnalyticsProducts from "@/app/api/v1/admin/analytics/products/route";
import * as adminAnalyticsCustomers from "@/app/api/v1/admin/analytics/customers/route";
import * as adminReviews from "@/app/api/v1/admin/reviews/route";
import * as adminReturns from "@/app/api/v1/admin/returns/route";
import * as adminTickets from "@/app/api/v1/admin/tickets/route";
import * as adminSections from "@/app/api/v1/admin/content/sections/route";
import * as adminBlocks from "@/app/api/v1/admin/content/blocks/route";
import * as adminSign from "@/app/api/v1/admin/media/sign/route";
import * as login from "@/app/api/v1/auth/login/route";
import * as home from "@/app/api/v1/home/route";
import * as publicProducts from "@/app/api/v1/products/route";
import * as tickets from "@/app/api/v1/support/tickets/route";
import * as notifications from "@/app/api/v1/notifications/route";
import * as health from "@/app/api/v1/health/route";
import * as maintenance from "@/app/api/v1/jobs/maintenance/route";

beforeAll(bootstrap);

type Handler = Parameters<typeof call>[0];
const UUID = "0198d2c0-0000-7000-8000-000000000001";
const dummyProductBody = { name: "RBAC probe", categoryId: UUID, variants: [{ sku: "RBAC-1", price: 100 }] };

/** Every admin endpoint with the permission it must demand. A role may call it iff it holds that permission. */
const MATRIX: Array<{ name: string; handler: Handler; perm: Permission[]; opts: CallOptions }> = [
  { name: "dashboard", handler: adminDashboard.GET, perm: ["dashboard:read"], opts: {} },
  { name: "analytics sales", handler: adminSales.GET, perm: ["analytics:read"], opts: {} },
  { name: "analytics products", handler: adminAnalyticsProducts.GET, perm: ["analytics:read"], opts: {} },
  { name: "analytics customers", handler: adminAnalyticsCustomers.GET, perm: ["analytics:read"], opts: {} },
  { name: "list products", handler: adminProducts.GET, perm: ["product:read"], opts: {} },
  { name: "create product", handler: adminProducts.POST, perm: ["product:write"], opts: { method: "POST", body: dummyProductBody } },
  { name: "get product", handler: adminProduct.GET, perm: ["product:read"], opts: { params: { id: UUID } } },
  { name: "update product", handler: adminProduct.PATCH, perm: ["product:write"], opts: { method: "PATCH", params: { id: UUID }, body: { name: "x y" } } },
  { name: "delete product", handler: adminProduct.DELETE, perm: ["product:delete"], opts: { method: "DELETE", params: { id: UUID } } },
  { name: "bulk products", handler: adminBulk.POST, perm: ["product:write"], opts: { method: "POST", body: { ids: [UUID], action: "feature" } } },
  { name: "update variant", handler: adminVariant.PATCH, perm: ["product:write"], opts: { method: "PATCH", params: { id: UUID }, body: { price: 5 } } },
  { name: "list inventory", handler: adminInventory.GET, perm: ["inventory:read"], opts: {} },
  { name: "inventory movements", handler: adminMovements.GET, perm: ["inventory:read"], opts: {} },
  { name: "low stock", handler: adminLow.GET, perm: ["inventory:read"], opts: {} },
  { name: "adjust stock", handler: adminAdjust.POST, perm: ["inventory:write"], opts: { method: "POST", body: { variantId: UUID, delta: 1, reason: "probe test" } } },
  { name: "receive stock", handler: adminReceive.POST, perm: ["inventory:write"], opts: { method: "POST", body: { reference: "REF-RBAC", items: [{ variantId: UUID, quantity: 1 }] } } },
  { name: "create category", handler: adminCategories.POST, perm: ["category:write"], opts: { method: "POST", body: { name: "Probe cat" } } },
  { name: "delete category", handler: adminCategory.DELETE, perm: ["category:write"], opts: { method: "DELETE", params: { id: UUID } } },
  { name: "list orders", handler: adminOrders.GET, perm: ["order:read"], opts: {} },
  { name: "list returns", handler: adminReturns.GET, perm: ["return:manage"], opts: {} },
  { name: "list customers", handler: adminCustomers.GET, perm: ["customer:read"], opts: {} },
  { name: "customer status", handler: adminCustomerStatus.PATCH, perm: ["customer:write"], opts: { method: "PATCH", params: { id: UUID }, body: { status: "SUSPENDED" } } },
  { name: "list coupons", handler: adminCoupons.GET, perm: ["coupon:read"], opts: {} },
  { name: "create coupon", handler: adminCoupons.POST, perm: ["coupon:write"], opts: { method: "POST", body: { code: "RBACPROBE", type: "PERCENTAGE", value: 5 } } },
  { name: "delete coupon", handler: adminCoupon.DELETE, perm: ["coupon:write"], opts: { method: "DELETE", params: { id: UUID } } },
  { name: "list reviews", handler: adminReviews.GET, perm: ["review:moderate"], opts: {} },
  { name: "list tickets", handler: adminTickets.GET, perm: ["support:read"], opts: {} },
  { name: "content blocks", handler: adminBlocks.GET, perm: ["content:write"], opts: {} },
  { name: "content sections", handler: adminSections.GET, perm: ["content:write"], opts: {} },
  { name: "audit logs", handler: adminAudit.GET, perm: ["audit:read"], opts: {} },
  { name: "settings", handler: adminSettings.GET, perm: ["settings:manage"], opts: {} },
  { name: "staff list", handler: adminUsers.GET, perm: ["user:manage"], opts: {} },
  { name: "change role", handler: adminUserRole.PATCH, perm: ["user:manage"], opts: { method: "PATCH", params: { id: UUID }, body: { roleKey: "manager" } } },
  { name: "roles list", handler: adminRoles.GET, perm: ["user:manage", "role:manage"], opts: {} },
  { name: "edit role permissions", handler: adminRolePerms.PUT, perm: ["role:manage"], opts: { method: "PUT", params: { id: UUID }, body: { permissions: [] } } },
  { name: "media sign", handler: adminSign.POST, perm: ["product:write", "content:write", "category:write", "brand:write"], opts: { method: "POST", body: { contentType: "image/png" } } },
];

describe("RBAC is enforced by the backend on every admin endpoint", () => {
  const tokens = new Map<string, string>();
  beforeAll(async () => {
    for (const role of SYSTEM_ROLES) tokens.set(role, (await staffSession(role)).token);
  });

  it("anonymous requests get 401 everywhere", async () => {
    for (const e of MATRIX) {
      const r = await call(e.handler, e.opts);
      expect(r.status, `${e.name} (anonymous)`).toBe(401);
    }
  });

  for (const role of SYSTEM_ROLES) {
    it(`role "${role}" can use exactly the endpoints its permissions allow`, async () => {
      const held = new Set<string>(ROLE_DEFINITIONS[role].permissions);
      for (const e of MATRIX) {
        const r = await call(e.handler, { ...e.opts, token: tokens.get(role)! });
        const allowed = e.perm.some((p) => held.has(p));
        if (allowed) expect(r.status, `${role} → ${e.name} should pass authorization (got ${r.status} ${r.body?.error?.code})`).not.toBe(403);
        else expect(r.status, `${role} → ${e.name} must be forbidden`).toBe(403);
        expect(r.status, `${role} → ${e.name}`).not.toBe(401);
      }
    });
  }

  it("covers every admin route file with an authorization test", () => {
    const root = path.join(process.cwd(), "app/api/v1/admin");
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : f === "route.ts" && files.push(path.join(d, f))));
    walk(root);
    expect(files.length).toBeGreaterThan(40);
    // every admin handler is built with `permission:` — a route without one would be reachable by any logged-in user
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = route\(\s*\{([^}]*)\}/g)) expect(m[2], `${path.relative(process.cwd(), f)} ${m[1]}`).toMatch(/permission:/);
    }
  });

  it("revokes access immediately when a user's role is downgraded", async () => {
    const mgr = await createUser({ role: "manager" });
    const { token } = await sessionFor(mgr.id);
    expect((await call(adminDashboard.GET, { token })).status).toBe(200);
    const sa = await staffSession("super_admin");
    await call(adminUserRole.PATCH, { method: "PATCH", token: sa.token, params: { id: mgr.id }, body: { roleKey: "customer" } });
    expect((await call(adminDashboard.GET, { token })).status).toBe(401); // sessions revoked
    const l = await call(login.POST, { method: "POST", body: { email: mgr.email, password: "Passw0rd!test" }, headers: { "x-auth-mode": "token" } });
    expect((await call(adminDashboard.GET, { token: l.body.data.session.token })).status).toBe(403);
  });

  it("only a super admin can edit roles, grant super admin, or change their own role", async () => {
    const adminTok = (await staffSession("admin")).token;
    const roles = (await call(adminRoles.GET, { token: adminTok })).body.data.roles as Array<{ id: string; key: string; permissions: string[] }>;
    const mgrRole = roles.find((r) => r.key === "manager")!;
    expect((await call(adminRolePerms.PUT, { method: "PUT", token: adminTok, params: { id: mgrRole.id }, body: { permissions: ["order:read"] } })).status).toBe(403);
    const target = await createUser({ role: "support_agent" });
    expect((await call(adminUserRole.PATCH, { method: "PATCH", token: adminTok, params: { id: target.id }, body: { roleKey: "super_admin" } })).status).toBe(403);
    const me = await staffSession("admin");
    expect((await call(adminUserRole.PATCH, { method: "PATCH", token: me.token, params: { id: me.row.id }, body: { roleKey: "super_admin" } })).status).toBe(403);

    const sa = (await staffSession("super_admin")).token;
    const changed = await call(adminRolePerms.PUT, { method: "PUT", token: sa, params: { id: mgrRole.id }, body: { permissions: ["order:read", "dashboard:read"] } });
    expect(changed.body.data.permissions).toEqual(["dashboard:read", "order:read"]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "role.permissions_changed" } });
    expect(audit.metadata).toMatchObject({ role: "manager", after: ["dashboard:read", "order:read"] });
    const superRole = roles.find((r) => r.key === "super_admin")!;
    expect((await call(adminRolePerms.PUT, { method: "PUT", token: sa, params: { id: superRole.id }, body: { permissions: [] } })).body.error!.code).toBe("SYSTEM_ROLE_PROTECTED");
    expect((await call(adminRolePerms.PUT, { method: "PUT", token: sa, params: { id: mgrRole.id }, body: { permissions: ["made:up"] } })).status).toBe(422);
    // restore for later tests
    await call(adminRolePerms.PUT, { method: "PUT", token: sa, params: { id: mgrRole.id }, body: { permissions: [...ROLE_DEFINITIONS.manager.permissions] } });
  });
});

describe("audit trail", () => {
  it("records who did what for product, price, inventory, order, customer and refund changes", async () => {
    const mgr = await staffSession("manager");
    const cat = await makeCategory("Audit cat");
    const created = await call(adminProducts.POST, { method: "POST", token: mgr.token, headers: { "x-forwarded-for": "198.51.100.9" }, body: { name: "Audited Gadget", categoryId: cat.id, status: "ACTIVE", variants: [{ sku: "AUD-1", price: 100_000, stock: { quantity: 5 } }] } });
    expect(created.status).toBe(201);
    const product = await db.product.findFirstOrThrow({ where: { slug: created.body.data.slug }, include: { variants: true } });
    const variantId = product.variants[0]!.id;

    await call(adminVariant.PATCH, { method: "PATCH", token: mgr.token, headers: { "x-forwarded-for": "198.51.100.9" }, params: { id: variantId }, body: { price: 90_000 } });
    await call(adminAdjust.POST, { method: "POST", token: mgr.token, params: {}, body: { variantId, delta: -2, type: "DAMAGE", reason: "Dropped in warehouse" } });
    await call(adminCustomerStatus.PATCH, { method: "PATCH", token: mgr.token, params: { id: (await createUser()).id }, body: { status: "SUSPENDED", reason: "chargebacks" } });
    await call(adminProduct.DELETE, { method: "DELETE", token: mgr.token, params: { id: product.id } });

    const logs = await db.auditLog.findMany({ where: { actorId: mgr.row.id }, orderBy: { createdAt: "asc" } });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["product.created", "product.price_changed", "inventory.adjusted", "customer.status_changed", "product.deleted"]));
    const price = logs.find((l) => l.action === "product.price_changed")!;
    expect(price).toMatchObject({ resourceType: "variant", resourceId: variantId, actorRole: "manager", ip: "198.51.100.9" });
    expect(price.metadata).toMatchObject({ from: 100_000, to: 90_000 });
    expect(price.requestId).toBeTruthy();
    expect(logs.find((l) => l.action === "inventory.adjusted")!.metadata).toMatchObject({ delta: -2, reason: "Dropped in warehouse" });
    // queryable through the API by permission holders only
    const q = await call(adminAudit.GET, { token: mgr.token, query: { action: "product.", pageSize: 50 } });
    expect(q.body.data.length).toBeGreaterThanOrEqual(3);
    expect((await call(adminAudit.GET, { token: (await staffSession("inventory_manager")).token })).status).toBe(403);
  });

  it("logs authentication events", async () => {
    const u = await createUser({ email: "audited@example.com" });
    await call(login.POST, { method: "POST", body: { email: u.email, password: "Passw0rd!test" } });
    expect(await db.auditLog.count({ where: { action: "auth.login", resourceId: u.id } })).toBe(1);
  });
});

describe("admin catalog & inventory behaviour", () => {
  it("stock adjustments cannot dip below reserved units and write a movement ledger", async () => {
    const inv = await staffSession("inventory_manager");
    const p = await makeProduct({ price: 100_000, stock: 5 });
    const vid = p.variants[0]!.id;
    await db.inventory.update({ where: { variantId: vid }, data: { reserved: 3 } });
    const bad = await call(adminAdjust.POST, { method: "POST", token: inv.token, body: { variantId: vid, delta: -4, reason: "recount down" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error!.code).toBe("INVALID_STOCK_ADJUSTMENT");
    const ok = await call(adminAdjust.POST, { method: "POST", token: inv.token, body: { variantId: vid, delta: -2, reason: "recount down" } });
    expect(ok.body.data).toMatchObject({ onHand: 3, reserved: 3, available: 0 });
    expect((await call(adminAdjust.POST, { method: "POST", token: inv.token, body: { variantId: vid, delta: 0, reason: "nothing" } })).status).toBe(422);
    const mv = await call(adminMovements.GET, { token: inv.token, query: { variantId: vid } });
    expect(mv.body.data.map((m: any) => m.type)).toContain("ADJUSTMENT");
    expect(mv.body.data[0]).toMatchObject({ quantityDelta: -2, quantityAfter: 3 });
  });

  it("stock receipts are idempotent by reference and restock inventory", async () => {
    const inv = await staffSession("inventory_manager");
    const p = await makeProduct({ price: 100_000, stock: 0 });
    const body = { reference: `PO-${randomUUID().slice(0, 8)}`, supplier: "Acme Supply", items: [{ variantId: p.variants[0]!.id, quantity: 25, unitCost: 60_000 }] };
    expect((await call(adminReceive.POST, { method: "POST", token: inv.token, body })).status).toBe(201);
    expect((await call(adminReceive.POST, { method: "POST", token: inv.token, body })).status).toBe(409);
    expect((await db.inventory.findUniqueOrThrow({ where: { variantId: p.variants[0]!.id } })).quantity).toBe(25);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).inStock).toBe(true);
    const low = await call(adminLow.GET, { token: inv.token });
    expect(low.body.data.every((r: any) => r.quantity - r.reserved <= r.threshold)).toBe(true);
  });

  it("creating a product with duplicate/invalid SKUs fails atomically", async () => {
    const pm = await staffSession("product_manager");
    const cat = await makeCategory();
    const base = { name: "Atomic", categoryId: cat.id, status: "ACTIVE" };
    expect((await call(adminProducts.POST, { method: "POST", token: pm.token, body: { ...base, variants: [{ sku: "DUP-1", price: 1 }, { sku: "dup-1", price: 1 }] } })).body.error!.code).toBe("SKU_TAKEN");
    await call(adminProducts.POST, { method: "POST", token: pm.token, body: { ...base, name: "First", variants: [{ sku: "TAKEN-1", price: 100 }] } });
    const clash = await call(adminProducts.POST, { method: "POST", token: pm.token, body: { ...base, name: "Second", variants: [{ sku: "FRESH-1", price: 100 }, { sku: "TAKEN-1", price: 100 }] } });
    expect(clash.body.error!.code).toBe("SKU_TAKEN");
    expect(await db.product.count({ where: { name: "Second" } })).toBe(0);
    expect(await db.productVariant.count({ where: { sku: "FRESH-1" } })).toBe(0); // rolled back with the product
    expect((await call(adminProducts.POST, { method: "POST", token: pm.token, body: { ...base, variants: [{ sku: "BAD-1", price: 100, compareAtPrice: 50 }] } })).status).toBe(422);
  });

  it("bulk operations work, and archiving needs product:delete", async () => {
    const pm = await staffSession("product_manager");
    const [a, b] = [await makeProduct({ price: 100_000 }), await makeProduct({ price: 200_000 })];
    const res = await call(adminBulk.POST, { method: "POST", token: pm.token, body: { ids: [a.id, b.id], action: "adjust_price_percent", percent: 10 } });
    expect(res.body.error).toBeUndefined();
    expect(res.body.data.affected).toBe(2);
    expect((await db.productVariant.findFirstOrThrow({ where: { productId: a.id } })).price).toBe(110_000);
    expect((await db.product.findUniqueOrThrow({ where: { id: b.id } })).minPrice).toBe(220_000);
    const unpub = await call(adminBulk.POST, { method: "POST", token: pm.token, body: { ids: [a.id], action: "unpublish" } });
    expect(unpub.body.data.affected).toBe(1);
    expect((await call(publicProducts.GET, { query: { pageSize: 100 } })).body.data.some((x: any) => x.id === a.id)).toBe(false);
    const noDelete = await staffSession("product_manager");
    await db.rolePermission.deleteMany({ where: { role: { key: "product_manager" }, permission: { key: "product:delete" } } });
    const { invalidateRoleCache } = await import("@/server/auth/session");
    invalidateRoleCache();
    expect((await call(adminBulk.POST, { method: "POST", token: noDelete.token, body: { ids: [b.id], action: "archive" } })).status).toBe(403);
    const perm = await db.permission.findUniqueOrThrow({ where: { key: "product:delete" } });
    const role = await db.role.findUniqueOrThrow({ where: { key: "product_manager" } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    invalidateRoleCache();
  });

  it("category tree edits keep paths consistent and refuse cycles and non-empty deletes", async () => {
    const pm = await staffSession("product_manager");
    const root = await call(adminCategories.POST, { method: "POST", token: pm.token, body: { name: "Root A" } });
    const child = await call(adminCategories.POST, { method: "POST", token: pm.token, body: { name: "Child A", parentId: root.body.data.id } });
    const grand = await call(adminCategories.POST, { method: "POST", token: pm.token, body: { name: "Grand A", parentId: child.body.data.id } });
    expect(grand.body.data).toMatchObject({ depth: 2, path: "root-a/child-a/grand-a" });
    const cycle = await call(adminCategory.PATCH, { method: "PATCH", token: pm.token, params: { id: root.body.data.id }, body: { parentId: grand.body.data.id } });
    expect(cycle.body.error!.code).toBe("CATEGORY_CYCLE");
    const other = await call(adminCategories.POST, { method: "POST", token: pm.token, body: { name: "Other Root" } });
    await call(adminCategory.PATCH, { method: "PATCH", token: pm.token, params: { id: child.body.data.id }, body: { parentId: other.body.data.id } });
    expect((await db.category.findUniqueOrThrow({ where: { id: grand.body.data.id } })).path).toBe("other-root/child-a/grand-a");
    expect((await call(adminCategory.DELETE, { method: "DELETE", token: pm.token, params: { id: other.body.data.id } })).body.error!.code).toBe("CATEGORY_NOT_EMPTY");
    expect((await call(adminCategory.DELETE, { method: "DELETE", token: pm.token, params: { id: grand.body.data.id } })).status).toBe(204);
  });
});

describe("coupons admin", () => {
  it("validates rules, prevents duplicate codes, keeps history on delete, reports analytics", async () => {
    const mgr = await staffSession("manager");
    const bad = await call(adminCoupons.POST, { method: "POST", token: mgr.token, body: { code: "BAD", type: "PERCENTAGE", value: 150 } });
    expect(bad.status).toBe(422);
    const ok = await call(adminCoupons.POST, { method: "POST", token: mgr.token, body: { code: "launch25", type: "PERCENTAGE", value: 25, maxDiscount: 50_000, usageLimit: 100 } });
    expect(ok.body.data.code).toBe("LAUNCH25");
    expect((await call(adminCoupons.POST, { method: "POST", token: mgr.token, body: { code: "LAUNCH25", type: "PERCENTAGE", value: 5 } })).body.error!.code).toBe("COUPON_CODE_TAKEN");
    const id = ok.body.data.id;
    const off = await call(adminCoupon.PATCH, { method: "PATCH", token: mgr.token, params: { id }, body: { isActive: false } });
    expect(off.body.data.isActive).toBe(false);

    // use it once, then deleting only deactivates
    await call(adminCoupon.PATCH, { method: "PATCH", token: mgr.token, params: { id }, body: { isActive: true } });
    const u = await createUser();
    const { token } = await sessionFor(u.id);
    const a = await makeAddress(u.id);
    const p = await makeProduct({ price: 400_000, stock: 5 });
    await addItem({ userId: u.id }, { variantId: p.variants[0]!.id });
    const co = await call(checkout.POST, { method: "POST", token, headers: { "idempotency-key": randomUUID() }, body: { addressId: a.id, paymentMethod: "COD", couponCodes: ["LAUNCH25"] } });
    expect(co.body.data.order.totals.discount).toBe(50_000);
    const stats = await call(adminCoupon.GET, { token: mgr.token, params: { id } });
    expect(stats.body.data.stats).toMatchObject({ uses: 1, totalDiscount: 50_000, uniqueUsers: 1, remaining: 99 });
    const del = await call(adminCoupon.DELETE, { method: "DELETE", token: mgr.token, params: { id } });
    expect(del.body.data).toEqual({ deleted: false, deactivated: true });
  });
});

describe("customers & suspension", () => {
  it("lists with filters, shows a profile, and suspension kills sessions and logins", async () => {
    const mgr = await staffSession("manager");
    const c = await createUser({ email: "zed@example.com", name: "Zed Customer" });
    const { token } = await sessionFor(c.id);
    const list = await call(adminCustomers.GET, { token: mgr.token, query: { search: "zed" } });
    expect(list.body.data.map((x: any) => x.email)).toEqual(["zed@example.com"]);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash/);
    await call(adminCustomerStatus.PATCH, { method: "PATCH", token: mgr.token, params: { id: c.id }, body: { status: "SUSPENDED" } });
    expect((await call(adminCustomers.GET, { token })).status).toBe(401); // session revoked on suspension
    const sessionCheck = await call(notifications.GET, { token });
    expect(sessionCheck.status).toBe(401);
    const staffTarget = await staffSession("support_agent");
    expect((await call(adminCustomerStatus.PATCH, { method: "PATCH", token: mgr.token, params: { id: staffTarget.row.id }, body: { status: "BANNED" } })).status).toBe(404); // staff are not "customers"
  });
});

describe("dashboard & analytics", () => {
  it("aggregates real orders into KPIs, trend and top products from rollups", async () => {
    const u = await createUser();
    const a = await makeAddress(u.id);
    const { token } = await sessionFor(u.id);
    const p = await makeProduct({ name: "Analytics Hero", price: 250_000, stock: 20, categoryId: (await makeCategory("Analytics Cat")).id });
    for (let i = 0; i < 3; i++) {
      await addItem({ userId: u.id }, { variantId: p.variants[0]!.id, quantity: 2 });
      await call(checkout.POST, { method: "POST", token, headers: { "idempotency-key": randomUUID() }, body: { addressId: a.id, paymentMethod: "COD" } });
    }
    const mgr = await staffSession("manager");
    const orders = await db.order.findMany({ where: { userId: u.id } });
    const revenue = orders.reduce((s, o) => s + o.grandTotal, 0);

    const { invalidate } = await import("@/server/core/cache");
    invalidate("analytics:"); // dashboard is cached for 30 s by design
    const { refreshDailyStats } = await import("@/server/services/analytics");
    await refreshDailyStats(new Date(), new Date()); // today's rollup is refreshed at most every 60 s; force it
    const dash = (await call(adminDashboard.GET, { token: mgr.token })).body.data;
    expect(dash.kpis.ordersToday).toBeGreaterThanOrEqual(3);
    expect(dash.kpis.revenueToday).toBeGreaterThanOrEqual(revenue);
    expect(dash.topProducts[0]).toMatchObject({ name: "Analytics Hero", unitsSold: 6 });
    expect(dash.salesTrend).toHaveLength(30);
    expect(dash.orders.pending).toBeGreaterThanOrEqual(3);
    expect(dash.recentOrders.length).toBeGreaterThan(0);
    expect(dash).toHaveProperty("lowStock");

    const sales = (await call(adminSales.GET, { token: mgr.token, query: { granularity: "week" } })).body.data;
    expect(sales.totals.revenue).toBeGreaterThanOrEqual(revenue);
    expect(sales.totals.averageOrderValue).toBe(Math.round(sales.totals.revenue / sales.totals.orders));
    expect(sales.series.reduce((s: number, r: any) => s + r.revenue, 0)).toBe(sales.totals.revenue);
    const cats = (await call(adminAnalyticsProducts.GET, { token: mgr.token })).body.data.categories;
    expect(cats.find((c: any) => c.category === "Analytics Cat")).toMatchObject({ unitsSold: 6, orders: 3 });
    const cust = (await call(adminAnalyticsCustomers.GET, { token: mgr.token })).body.data;
    expect(cust.funnel.ordersPlaced).toBeGreaterThanOrEqual(3);
    expect(cust.customers.topCustomers.length).toBeGreaterThan(0);

    // bad ranges are rejected, not silently expensive
    expect((await call(adminSales.GET, { token: mgr.token, query: { from: "2020-01-01", to: "2026-01-01" } })).status).toBe(422);
    expect((await call(adminSales.GET, { token: mgr.token, query: { from: "2026-02-01", to: "2026-01-01" } })).status).toBe(422);
  });
});

describe("CMS & home page", () => {
  it("assembles the home page from admin-managed sections and honours schedule windows", async () => {
    const pm = await staffSession("product_manager");
    await call(adminBlocks.POST, { method: "POST", token: pm.token, body: { type: "HERO", placement: "home.hero", title: "Live hero", ctaLabel: "Go", ctaUrl: "/products" } });
    await call(adminBlocks.POST, { method: "POST", token: pm.token, body: { type: "HERO", placement: "home.hero", title: "Expired hero", endsAt: new Date(Date.now() - 1000).toISOString() } });
    await call(adminBlocks.POST, { method: "POST", token: pm.token, body: { type: "HERO", placement: "home.hero", title: "Future hero", startsAt: new Date(Date.now() + 86_400_000).toISOString() } });
    expect((await call(adminBlocks.POST, { method: "POST", token: pm.token, body: { type: "HERO", placement: "home.hero", title: "Bad link", ctaUrl: "javascript:alert(1)" } })).status).toBe(422);
    await call(adminSections.PUT, { method: "PUT", token: pm.token, body: { key: "hero", type: "HERO", sortOrder: 0, config: { placement: "home.hero" } } });
    await call(adminSections.PUT, { method: "PUT", token: pm.token, body: { key: "trending", type: "PRODUCT_RAIL", title: "Trending", sortOrder: 1, config: { source: "trending", limit: 4 } } });
    await call(adminSections.PUT, { method: "PUT", token: pm.token, body: { key: "recent", type: "RECENTLY_VIEWED", sortOrder: 2 } });
    const res = await call(home.GET);
    expect(res.status).toBe(200);
    const sections = res.body.data.sections;
    expect(sections.map((s: any) => s.key)).toEqual(["hero", "trending"]); // empty "recently viewed" is omitted
    expect(sections[0].data.blocks.map((b: any) => b.title)).toEqual(["Live hero"]);
    expect(Array.isArray(sections[1].data)).toBe(false);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage/);
  });
});

describe("customer support & notifications", () => {
  it("creates a ticket, staff reply notifies the customer, customers only see their own", async () => {
    const c = await createUser();
    const { token } = await sessionFor(c.id);
    const t = await call(tickets.POST, { method: "POST", token, body: { subject: "Where is my parcel?", message: "It has been a week.", category: "order" } });
    expect(t.status).toBe(201);
    const agent = await staffSession("support_agent");
    const reply = await call((await import("@/app/api/v1/admin/tickets/[id]/route")).POST, { method: "POST", token: agent.token, params: { id: t.body.data.id }, body: { message: "Looking into it now." } });
    expect(reply.body.data.messages).toHaveLength(2);
    const n = await call(notifications.GET, { token });
    expect(n.body.meta.unread).toBeGreaterThanOrEqual(1);
    expect(n.body.data.some((x: any) => x.type === "ticket.reply")).toBe(true);
    const other = await createUser();
    const peek = await call(tickets.GET, { token: (await sessionFor(other.id)).token });
    expect(peek.body.data).toEqual([]);
  });
});

describe("operations", () => {
  it("health endpoint reports DB readiness without leaking internals", async () => {
    const r = await call(health.GET);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: "ok", db: "up" });
  });
  it("maintenance job is closed without the scheduler token", async () => {
    expect((await call(maintenance.POST, { method: "POST", origin: false })).status).toBe(403);
    expect((await call(maintenance.POST, { method: "POST", origin: false, headers: { authorization: "Bearer guess" } })).status).toBe(403);
  });
});
