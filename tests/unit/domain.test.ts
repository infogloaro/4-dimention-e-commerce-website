import { describe, expect, it } from "vitest";
import { canTransition, canTransitionReturn, ORDER_TRANSITIONS, TERMINAL_STATUSES, CUSTOMER_CANCELLABLE, HAPPY_PATH } from "@/server/domain/order-state";
import { hashPassword, verifyPassword, hashToken } from "@/server/core/crypto";
import { MemoryRateLimiter } from "@/server/core/rate-limit";
import { redact } from "@/server/core/logger";
import { slugify, escapeLike } from "@/server/core/text";
import { paginationSchema, buildPageMeta } from "@/server/core/pagination";
import { registerBody } from "@/server/validation/auth";
import { createProductBody, updateProductBody } from "@/server/validation/catalog";
import { ROLE_DEFINITIONS, PERMISSIONS } from "@/server/auth/permissions";
import { normalizeQuery } from "@/server/services/catalog/search";
import { assertElectronicsProduct, containsProhibitedCategoryTerm } from "@/server/domain/electronics-policy";
import type { OrderStatus } from "@/server/db/generated/client";

describe("order state machine", () => {
  it("follows the happy path in order", () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i++) {
      const from = HAPPY_PATH[i]!;
      const to = HAPPY_PATH[i + 1]!;
      // SHIPPED may skip OUT_FOR_DELIVERY, every other step is strictly sequential
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true);
    }
  });
  it("forbids skipping stages and moving backwards", () => {
    expect(canTransition("PLACED", "SHIPPED")).toBe(false);
    expect(canTransition("CONFIRMED", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "PROCESSING")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false); // too late once handed to the carrier
  });
  it("makes terminal states truly terminal", () => {
    for (const s of TERMINAL_STATUSES) expect(ORDER_TRANSITIONS[s]).toEqual([]);
  });
  it("allows cancellation only before shipment", () => {
    const cancellable = (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter((s) => canTransition(s, "CANCELLED"));
    expect(new Set(cancellable)).toEqual(new Set(["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PROCESSING", "PACKED"]));
    for (const s of CUSTOMER_CANCELLABLE) expect(canTransition(s, "CANCELLED")).toBe(true);
  });
  it("models returns as DELIVERED → RETURN_REQUESTED → RETURNED | DELIVERED", () => {
    expect(canTransition("DELIVERED", "RETURN_REQUESTED")).toBe(true);
    expect(canTransition("RETURN_REQUESTED", "RETURNED")).toBe(true);
    expect(canTransition("RETURN_REQUESTED", "DELIVERED")).toBe(true);
    expect(canTransition("SHIPPED", "RETURN_REQUESTED")).toBe(false);
  });
  it("return workflow transitions", () => {
    expect(canTransitionReturn("REQUESTED", "APPROVED")).toBe(true);
    expect(canTransitionReturn("REQUESTED", "RECEIVED")).toBe(false);
    expect(canTransitionReturn("COMPLETED", "REQUESTED")).toBe(false);
  });
});

describe("crypto", () => {
  it("hashes and verifies passwords, rejecting wrong ones", async () => {
    const h = await hashPassword("Correct-Horse-9");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("Correct-Horse-9");
    expect(await verifyPassword("Correct-Horse-9", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });
  it("token hashes are deterministic but not reversible to the token", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toContain("abc");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit then blocks, per key", () => {
    const rl = new MemoryRateLimiter();
    for (let i = 0; i < 3; i++) expect(rl.hit("k", 3, 1000).allowed).toBe(true);
    expect(rl.hit("k", 3, 1000).allowed).toBe(false);
    expect(rl.hit("other", 3, 1000).allowed).toBe(true);
  });
});

describe("logger redaction", () => {
  it("masks credentials at any depth", () => {
    const out = redact({ user: "a", password: "p", nested: { authorization: "Bearer x", token: "t", ok: 1 }, list: [{ apiKey: "k" }] }) as Record<string, any>;
    expect(out.password).toBe("[REDACTED]");
    expect(out.nested.authorization).toBe("[REDACTED]");
    expect(out.nested.token).toBe("[REDACTED]");
    expect(out.list[0].apiKey).toBe("[REDACTED]");
    expect(out.nested.ok).toBe(1);
  });
});

describe("text + pagination helpers", () => {
  it("slugifies", () => expect(slugify("Nimbus Nova 5 Pro — 256GB!")).toBe("nimbus-nova-5-pro-256gb"));
  it("escapes LIKE wildcards", () => expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\"));
  it("caps page size", () => {
    expect(paginationSchema.safeParse({ pageSize: "1000" }).success).toBe(false);
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 24 });
  });
  it("builds page meta", () => expect(buildPageMeta({ page: 2, pageSize: 10 }, 25)).toMatchObject({ totalPages: 3, hasNextPage: true, hasPreviousPage: true }));
  it("normalises search queries and caps tokens", () => {
    expect(normalizeQuery("  iPhone   15  Pro!!  ").tokens).toEqual(["iphone", "15", "pro"]);
    expect(normalizeQuery("a b c d e f g h i").tokens.length).toBe(6);
  });
});

describe("validation", () => {
  it("rejects weak passwords and bad emails, normalises email", () => {
    expect(registerBody.safeParse({ name: "Al", email: "x", password: "short" }).success).toBe(false);
    expect(registerBody.safeParse({ name: "Alice", email: "a@b.co", password: "allletters" }).success).toBe(false);
    const ok = registerBody.parse({ name: "Alice", email: " Alice@Example.COM ", password: "Passw0rdOK" });
    expect(ok.email).toBe("alice@example.com");
  });
  it("strips markup from names", () => {
    expect(registerBody.parse({ name: "<b>Alice</b>", email: "a@b.co", password: "Passw0rdOK" }).name).toBe("Alice");
  });
  it("requires at least one variant and valid SKUs when creating a product", () => {
    const base = { name: "Thing", categoryId: "0198d2c0-0000-7000-8000-000000000001" };
    expect(createProductBody.safeParse({ ...base, variants: [] }).success).toBe(false);
    expect(createProductBody.safeParse({ ...base, variants: [{ sku: "bad sku!", price: 100 }] }).success).toBe(false);
    expect(createProductBody.safeParse({ ...base, variants: [{ sku: "OK-1", price: 100 }] }).success).toBe(true);
  });
  it("does not inject defaults into partial product updates", () => {
    expect(updateProductBody.parse({ name: "New name" })).toEqual({ name: "New name" });
  });
});

describe("electronics policy", () => {
  it("allows fitness-tracking electronics while blocking actual non-electronics", () => {
    expect(containsProhibitedCategoryTerm("Fitness Tracker")).toBeNull();
    expect(() => assertElectronicsProduct("Smart Fitness Tracker", undefined, ["fitness", "wearables", "gps"])).not.toThrow();
    expect(() => assertElectronicsProduct("Leather Gym Bag", undefined, ["fitness", "travel"])).toThrow();
  });
});

describe("RBAC matrix", () => {
  it("only super_admin can manage roles", () => {
    for (const [role, def] of Object.entries(ROLE_DEFINITIONS)) expect(def.permissions.includes("role:manage")).toBe(role === "super_admin");
  });
  it("customers hold no admin permissions", () => expect(ROLE_DEFINITIONS.customer.permissions).toEqual([]));
  it("every role permission exists in the catalogue", () => {
    for (const def of Object.values(ROLE_DEFINITIONS)) for (const p of def.permissions) expect(PERMISSIONS).toContain(p);
  });
  it("inventory managers cannot touch orders or pricing", () => {
    const p = ROLE_DEFINITIONS.inventory_manager.permissions;
    expect(p).not.toContain("order:refund");
    expect(p).not.toContain("product:write");
  });
});
