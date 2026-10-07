import { env } from "../../core/env";
import { AppError } from "../../core/errors";
import type { PaymentProviderKey } from "../../db/generated/client";
import { mockProvider } from "./mock";
import { razorpayProvider } from "./razorpay";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export * from "./types";

const providers: Partial<Record<PaymentProviderKey, PaymentProvider>> = {
  MOCK: mockProvider,
  RAZORPAY: razorpayProvider,
  STRIPE: stripeProvider,
};

/** Register/replace a provider (tests, or additional gateways). */
export function registerPaymentProvider(p: PaymentProvider) {
  providers[p.key] = p;
}

export function getPaymentProvider(key: PaymentProviderKey): PaymentProvider {
  const p = providers[key];
  if (!p) throw new AppError("PAYMENT_PROVIDER_UNAVAILABLE", `Payment provider ${key} is not available`);
  return p;
}

/** The provider used for new ONLINE payments, chosen by PAYMENT_PROVIDER. */
export function activeOnlineProvider(): PaymentProvider {
  return getPaymentProvider(env.PAYMENT_PROVIDER.toUpperCase() as PaymentProviderKey);
}

export const WEBHOOK_PROVIDERS = ["mock", "razorpay", "stripe"] as const;
export const providerKeyFromSlug = (slug: string): PaymentProviderKey | null => {
  const k = slug.toUpperCase();
  return k === "MOCK" || k === "RAZORPAY" || k === "STRIPE" ? k : null;
};
