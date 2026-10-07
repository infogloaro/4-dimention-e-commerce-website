import { db, type Db } from "../db/client";
import { AppError } from "../core/errors";
import { env } from "../core/env";

export interface ShippingAddressLike {
  postalCode: string;
  state?: string | null;
  country?: string | null;
}

export interface ShippingOption {
  code: string;
  name: string;
  carrier: string | null;
  description: string | null;
  fee: number;
  freeAboveSubtotal: number | null;
  minDays: number;
  maxDays: number;
  estimatedDelivery: { earliest: string; latest: string };
  zone: string;
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Most specific zone wins: postal-prefix > state > country > default zone. */
export async function matchZone(addr: ShippingAddressLike | null, client: Db = db) {
  const zones = await client.shippingZone.findMany({ where: { isActive: true } });
  if (addr) {
    const pc = addr.postalCode.replace(/\s/g, "").toUpperCase();
    const country = (addr.country ?? env.STORE_DEFAULT_COUNTRY).toUpperCase();
    let best: { zone: (typeof zones)[number]; score: number } | null = null;
    for (const z of zones) {
      let score = 0;
      const prefix = z.postalPrefixes.filter((p) => pc.startsWith(p.toUpperCase())).sort((a, b) => b.length - a.length)[0];
      if (prefix) score = 300 + prefix.length;
      else if (addr.state && z.states.some((s) => s.toLowerCase() === addr.state!.toLowerCase())) score = 200;
      else if (z.countries.includes(country)) score = 100;
      if (score > 0 && (!best || score > best.score)) best = { zone: z, score };
    }
    if (best) return best.zone;
  }
  return zones.find((z) => z.isDefault) ?? null;
}

/** Shipping options & fees for a destination. Pass `addr = null` for a cart-page estimate using the default zone. */
export async function quoteShipping(input: { addr: ShippingAddressLike | null; subtotal: number; weightGrams: number }, client: Db = db): Promise<ShippingOption[]> {
  const zone = await matchZone(input.addr, client);
  if (!zone) return [];
  const rates = await client.shippingRate.findMany({ where: { zoneId: zone.id, method: { isActive: true } }, include: { method: true }, orderBy: { method: { sortOrder: "asc" } } });
  const now = new Date();
  const extraKg = Math.max(0, Math.ceil(input.weightGrams / 1000) - 1);
  return rates
    .filter((r) => input.subtotal >= r.minSubtotal)
    .map((r) => ({
      code: r.method.code,
      name: r.method.name,
      carrier: r.method.carrier,
      description: r.method.description,
      fee: r.baseFee + r.perKgFee * extraKg,
      freeAboveSubtotal: r.freeAboveSubtotal,
      minDays: r.method.minDays,
      maxDays: r.method.maxDays,
      estimatedDelivery: { earliest: addDays(now, r.method.minDays).toISOString(), latest: addDays(now, r.method.maxDays).toISOString() },
      zone: zone.name,
    }));
}

/** Pick a specific method or the cheapest default; throws SHIPPING_UNAVAILABLE if the address can't be served. */
export async function selectShipping(input: { addr: ShippingAddressLike | null; subtotal: number; weightGrams: number; methodCode?: string }, client: Db = db): Promise<ShippingOption> {
  const options = await quoteShipping(input, client);
  if (options.length === 0) throw new AppError("SHIPPING_UNAVAILABLE", "We don't deliver to this address yet");
  if (input.methodCode) {
    const m = options.find((o) => o.code === input.methodCode);
    if (!m) throw new AppError("SHIPPING_METHOD_NOT_FOUND", "That delivery option isn't available for this address", { available: options.map((o) => o.code) });
    return m;
  }
  return options.find((o) => o.code === "standard") ?? options[0]!;
}
