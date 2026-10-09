import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PRODUCTS } from "@/prisma/seed-data";
import { slugify } from "@/server/core/text";
import { ART_KIND_BY_SLUG, ART_KINDS, CATEGORY_KIND, normaliseHex, placeholderUrl, productArtUrl, productMediaFor } from "@/prisma/product-art";
import { heroSvg, placeholderSvg, specsPanel } from "@/server/art/devices";
import { ORDER_STATUS, PAYMENT_STATUS, orderHeadline, statusLabel } from "@/lib/order-status";
import { TRACKING_COPY } from "@/server/domain/order-state";

const root = process.cwd();

describe("product ↔ image association", () => {
  it("every catalogue product has an explicit slug → device mapping (no index/order based assignment)", () => {
    for (const p of PRODUCTS) expect(ART_KIND_BY_SLUG[slugify(p.name)], p.name).toBeTruthy();
  });

  it("maps products to the right kind of device", () => {
    const expected: Record<string, string> = { "voltix-aero-14-ultrabook": "laptop", "quantum-strike-mechanical-gaming-keyboard": "keyboard", "quantum-swift-wireless-gaming-mouse": "mouse", "aurora-studio-anc-headphones": "headphones", "nimbus-nova-5-pro": "phone", "kora-pulse-smartwatch": "smartwatch" };
    for (const [slug, kind] of Object.entries(expected)) expect(ART_KIND_BY_SLUG[slug]).toBe(kind);
  });

  it("image URLs are derived from the product's own slug and never point elsewhere", () => {
    for (const p of PRODUCTS) {
      const slug = slugify(p.name);
      const media = productMediaFor(slug, p.name);
      expect(media.filter((m) => m.isPrimary)).toHaveLength(1);
      for (const m of media) { expect(m.url.startsWith(`/media/art/${slug}/`)).toBe(true); expect(m.alt).toContain(p.name); }
    }
    expect(productArtUrl("x", "colour-c9ccd1")).toBe("/media/art/x/colour-c9ccd1.svg");
  });

  it("refuses to invent artwork for an unmapped product", () => {
    expect(() => productMediaFor("mystery-gadget", "Mystery Gadget")).toThrow(/No artwork mapping/);
  });

  it("variant colours come from validated hex swatches only", () => {
    expect(normaliseHex("#C9CCD1")).toBe("c9ccd1");
    expect(normaliseHex("red")).toBeNull();
    expect(normaliseHex("../../etc")).toBeNull();
    expect(normaliseHex(null)).toBeNull();
  });

  it("renders valid, self-describing SVG for the product and its colour variant", () => {
    const hero = heroSvg("laptop", "c9ccd1", "Voltix Aero 14 Ultrabook", "Silver");
    expect(hero.startsWith("<svg")).toBe(true);
    expect(hero).toContain("Voltix Aero 14 Ultrabook");
    expect(hero).toContain("#c9ccd1".toLowerCase());
    const specs = specsPanel("laptop", "#c9ccd1", "A <b>&\"name\"", "Brand", ["x < y"]);
    expect(specs).not.toMatch(/<b>/); // user text is escaped
  });

  it("ships static category tiles and neutral placeholders (never another product's picture)", () => {
    for (const slug of Object.keys(CATEGORY_KIND)) expect(existsSync(join(root, "public/catalog/categories", `${slug}.svg`)), `category ${slug}`).toBe(true);
    for (const name of [...ART_KINDS, ...Object.keys(CATEGORY_KIND), "product"]) expect(existsSync(join(root, "public/catalog/placeholders", `${name}.svg`)), `placeholder ${name}`).toBe(true);
    expect(placeholderUrl("smartphones")).toBe("/catalog/placeholders/smartphones.svg");
    expect(placeholderUrl("../../secret")).toBe("/catalog/placeholders/product.svg");
    expect(placeholderSvg("laptop")).toContain("IMAGE COMING SOON");
    expect(readdirSync(join(root, "public/catalog/placeholders")).length).toBeGreaterThan(20);
  });

  it("seed and curation scripts no longer use random picsum photos", () => {
    for (const f of ["prisma/seed.ts", "scripts/curate-electronics-catalog.ts", "prisma/seed-data.ts"]) expect(readFileSync(join(root, f), "utf8"), f).not.toMatch(/picsum\.photos\/seed/);
  });
});

describe("single status vocabulary (customer ⇄ admin)", () => {
  it("server tracking copy uses exactly the shared labels", () => {
    for (const [status, copy] of Object.entries(TRACKING_COPY)) expect(copy.title, status).toBe(statusLabel(status, "order"));
  });
  it("covers every order status", () => {
    for (const s of Object.keys(TRACKING_COPY)) expect(ORDER_STATUS[s], s).toBeTruthy();
    expect(Object.keys(PAYMENT_STATUS).sort()).toEqual(["FAILED", "PAID", "PARTIALLY_REFUNDED", "PENDING", "REFUNDED", "UNPAID"]);
  });
  it("keeps machines apart: PENDING means different things for payment and refund", () => {
    expect(statusLabel("PENDING", "payment")).toBe("Payment pending");
    expect(statusLabel("PENDING", "refund")).toBe("Refund pending");
  });
  it("headline never claims success for unpaid, failed or cancelled orders", () => {
    expect(orderHeadline({ status: "PENDING_PAYMENT", paymentStatus: "PENDING" }).title).toBe("Payment pending");
    expect(orderHeadline({ status: "PENDING_PAYMENT", paymentStatus: "FAILED" }).title).toBe("Payment failed");
    expect(orderHeadline({ status: "FAILED", paymentStatus: "FAILED" }).tone).toBe("danger");
    expect(orderHeadline({ status: "CANCELLED", paymentStatus: "REFUNDED" }).detail).toMatch(/refunded/);
    expect(orderHeadline({ status: "SHIPPED", paymentStatus: "PAID", shipments: [{ status: "FAILED_DELIVERY" }] }).title).toBe("Delivery problem");
    expect(orderHeadline({ status: "PLACED", paymentStatus: "PAID" }).title).toBe("Order placed");
  });
});
