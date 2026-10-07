import { db } from "@/server/db/client";
import { hashPassword } from "@/server/core/crypto";
import { PERMISSIONS } from "@/server/auth/permissions";
import { authenticateToken, createSession, type AuthUser } from "@/server/auth/session";
import { createProduct } from "@/server/services/catalog/admin-products";
import { createAddress } from "@/server/services/customer";
import { invalidate } from "@/server/core/cache";
import { seedRbac, seedShipping, seedSettings } from "../../prisma/seed-base";
import { MemoryRateLimiter, setRateLimiter } from "@/server/core/rate-limit";
import { devOutbox } from "@/server/integrations/notifications/providers";

export const PASSWORD = "Passw0rd!test";
let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function resetDatabase() {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  invalidate();
  setRateLimiter(new MemoryRateLimiter());
  devOutbox.length = 0;
}

/** Clean DB + roles/permissions/shipping/settings (no demo catalogue). */
export async function bootstrap() {
  await resetDatabase();
  await seedRbac();
  await seedShipping();
  await seedSettings();
}

const hashed = hashPassword(PASSWORD); // hash once per run, reuse
export async function createUser(opts: { role?: string; email?: string; name?: string; phone?: string; verified?: boolean } = {}) {
  const role = await db.role.findUniqueOrThrow({ where: { key: opts.role ?? "customer" } });
  const email = opts.email ?? `user-${uniq()}@example.com`;
  const user = await db.user.create({ data: { email, name: opts.name ?? "Test User", phone: opts.phone, passwordHash: await hashed, roleId: role.id, emailVerifiedAt: opts.verified === false ? null : new Date() } });
  return { ...user, email, password: PASSWORD };
}

/** Real session token (use as `token:` in api calls) + the AuthUser the services expect. */
export async function sessionFor(userId: string) {
  const { token } = await createSession(userId, { ip: "127.0.0.1", userAgent: "vitest" });
  const user = (await authenticateToken(token))!;
  return { token, user };
}

export async function staffSession(role: string) {
  const u = await createUser({ role, name: `${role} user` });
  return { ...(await sessionFor(u.id)), row: u };
}

/** A real super_admin row (audit entries have an FK to users) wrapped as the AuthUser services expect. */
export async function systemActor(): Promise<AuthUser> {
  const existing = await db.user.findUnique({ where: { email: "system@test.local" } });
  const u = existing ?? (await createUser({ role: "super_admin", email: "system@test.local", name: "System" }));
  return { id: u.id, email: u.email, name: "System", phone: null, avatarUrl: null, status: "ACTIVE", emailVerified: true, phoneVerified: true, roleKey: "super_admin", isStaff: true, permissions: new Set(PERMISSIONS), sessionId: "test" };
}

export async function makeCategory(name = "Gadgets", parentId?: string) {
  const slug = `${name.toLowerCase().replace(/\W+/g, "-")}-${uniq()}`;
  const parent = parentId ? await db.category.findUniqueOrThrow({ where: { id: parentId } }) : null;
  return db.category.create({ data: { name, slug, parentId, path: parent ? `${parent.path}/${slug}` : slug, depth: parent ? parent.depth + 1 : 0 } });
}

export async function makeBrand(name = "Acme") {
  return db.brand.create({ data: { name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${uniq()}` } });
}

export interface ProductOpts {
  name?: string;
  price?: number; // minor units
  compareAtPrice?: number | null;
  stock?: number;
  taxPercent?: number;
  categoryId?: string;
  brandId?: string;
  status?: "ACTIVE" | "DRAFT";
  variants?: Array<{ sku?: string; price?: number; stock?: number; options?: Array<{ key: string; value: string }> }>;
  maxQuantityPerOrder?: number;
  weightGrams?: number;
  tags?: string[];
}

export async function makeProduct(o: ProductOpts = {}) {
  const categoryId = o.categoryId ?? (await makeCategory()).id;
  const name = o.name ?? `Widget ${uniq()}`;
  const variants = (o.variants ?? [{}]).map((v, i) => ({
    sku: v.sku ?? `SKU-${uniq()}`.toUpperCase(),
    price: v.price ?? o.price ?? 100_000,
    compareAtPrice: o.compareAtPrice === undefined ? null : o.compareAtPrice,
    weightGrams: o.weightGrams ?? 300,
    isActive: true,
    isDefault: i === 0,
    sortOrder: i,
    options: v.options ?? [],
    stock: { quantity: v.stock ?? o.stock ?? 10, lowStockThreshold: 2, allowBackorder: false },
  }));
  const res = await createProduct(await systemActor(), {
    name,
    categoryId,
    brandId: o.brandId,
    status: o.status ?? "ACTIVE",
    productType: "physical",
    taxRatePercent: o.taxPercent ?? 18,
    maxQuantityPerOrder: o.maxQuantityPerOrder ?? 10,
    isFeatured: false,
    isBestseller: false,
    isNewArrival: false,
    badges: [],
    highlights: [],
    tags: o.tags ?? [],
    attributes: [],
    variants,
    media: [{ type: "IMAGE", url: "https://picsum.photos/seed/t/800/800", alt: name, isPrimary: true, sortOrder: 0 }],
  });
  const product = await db.product.findUniqueOrThrow({ where: { id: res.id }, include: { variants: { orderBy: { sortOrder: "asc" } } } });
  invalidate();
  return product;
}

export async function makeAddress(userId: string, postalCode = "400001", state = "Maharashtra") {
  return createAddress(userId, { fullName: "Test Buyer", phone: "+919800000000", line1: "1 Test Street", city: "Mumbai", state, postalCode, country: "IN", type: "HOME", isDefault: true });
}

export async function makeCoupon(data: Partial<Parameters<typeof db.coupon.create>[0]["data"]> & { code: string }) {
  return db.coupon.create({ data: { type: "PERCENTAGE", value: 10, ...data } as never });
}

export const availableStock = async (variantId: string) => {
  const inv = await db.inventory.findUniqueOrThrow({ where: { variantId } });
  return { onHand: inv.quantity, reserved: inv.reserved, sold: inv.sold, available: inv.quantity - inv.reserved };
};

export const lastEmailTo = (to: string, template: string) => [...devOutbox].reverse().find((m) => m.to === to && m.template === template);
export const tokenFromMessage = (text: string) => /token=([\w-]+)/.exec(text)?.[1] ?? null;
