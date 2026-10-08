import { db } from "../server/db/client";
import { PERMISSIONS, ROLE_DEFINITIONS, SYSTEM_ROLES } from "../server/auth/permissions";
import { STORE_ADDRESS, STORE_NAME } from "../lib/store-brand";

const rupees = (n: number) => Math.round(n * 100);
const log = (m: string) => process.stdout.write(`[seed] ${m}
`);

export async function seedRbac() {
  for (const key of PERMISSIONS) await db.permission.upsert({ where: { key }, create: { key }, update: {} });
  const perms = new Map((await db.permission.findMany()).map((p) => [p.key, p.id]));
  for (const key of SYSTEM_ROLES) {
    const def = ROLE_DEFINITIONS[key];
    const role = await db.role.upsert({ where: { key }, create: { key, name: def.name, description: def.description, isSystem: true, isStaff: def.isStaff }, update: { name: def.name, description: def.description, isStaff: def.isStaff } });
    // only seed the matrix for brand-new roles; never clobber permissions an admin edited
    const existing = await db.rolePermission.count({ where: { roleId: role.id } });
    if (existing === 0 && def.permissions.length) await db.rolePermission.createMany({ data: def.permissions.map((p) => ({ roleId: role.id, permissionId: perms.get(p)! })), skipDuplicates: true });
  }
  log(`roles & permissions ready (${SYSTEM_ROLES.length} roles, ${PERMISSIONS.length} permissions)`);
}

export async function seedShipping() {
  if (await db.shippingMethod.count()) return;
  const standard = await db.shippingMethod.create({ data: { code: "standard", name: "Standard Delivery", carrier: "4D Logistics", description: "Reliable doorstep delivery", minDays: 3, maxDays: 7, sortOrder: 1 } });
  const express = await db.shippingMethod.create({ data: { code: "express", name: "Express Delivery", carrier: "4D Express", description: "Priority handling & faster transit", minDays: 1, maxDays: 3, sortOrder: 2 } });
  const rest = await db.shippingZone.create({ data: { name: "India — Rest of country", countries: ["IN"], isDefault: true } });
  const metro = await db.shippingZone.create({ data: { name: "India — Metro cities", countries: ["IN"], postalPrefixes: ["110", "400", "560", "600", "700", "500", "411", "380"] } });
  const remote = await db.shippingZone.create({ data: { name: "India — Remote regions", countries: ["IN"], states: ["Jammu and Kashmir", "Ladakh", "Arunachal Pradesh", "Andaman and Nicobar Islands", "Lakshadweep"] } });
  await db.shippingRate.createMany({
    data: [
      { zoneId: rest.id, methodId: standard.id, baseFee: rupees(49), perKgFee: rupees(20), freeAboveSubtotal: rupees(999) },
      { zoneId: rest.id, methodId: express.id, baseFee: rupees(149), perKgFee: rupees(30), freeAboveSubtotal: rupees(4999) },
      { zoneId: metro.id, methodId: standard.id, baseFee: rupees(29), perKgFee: rupees(15), freeAboveSubtotal: rupees(499) },
      { zoneId: metro.id, methodId: express.id, baseFee: rupees(99), perKgFee: rupees(25), freeAboveSubtotal: rupees(2999) },
      { zoneId: remote.id, methodId: standard.id, baseFee: rupees(149), perKgFee: rupees(40), freeAboveSubtotal: rupees(4999) },
    ],
  });
  log("shipping zones, methods and rates created");
}

export async function seedSettings() {
  const settings: Array<[string, unknown, boolean]> = [
    ["store.profile", { name: STORE_NAME, legalName: STORE_NAME, gstin: "27AAAAA0000A1Z5", address: STORE_ADDRESS, supportEmail: "support@4dcommerce.local", supportPhone: "+91 80000 00000" }, true],
    ["store.policies", { returnWindowDays: 10, freeShippingFrom: 99900, codMaxOrderValue: 5000000 }, true],
  ];
  for (const [key, value, isPublic] of settings) {
    if (key === "store.profile") {
      const existing = await db.storeSetting.findUnique({ where: { key } });
      const currentProfile = existing?.value;
      const profile = typeof currentProfile === "object" && currentProfile !== null && !Array.isArray(currentProfile)
        ? currentProfile
        : {};
      await db.storeSetting.upsert({
        where: { key },
        create: { key, value: value as object, isPublic },
        update: { value: { ...profile, name: STORE_NAME, legalName: STORE_NAME, address: STORE_ADDRESS } },
      });
      continue;
    }
    await db.storeSetting.upsert({ where: { key }, create: { key, value: value as object, isPublic }, update: {} });
  }
}
