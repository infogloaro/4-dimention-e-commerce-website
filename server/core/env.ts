import { z } from "zod";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(def ? "true" : "false")
    .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:3000/api/v1"),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  TRUST_PROXY: bool(true),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  SESSION_COOKIE_NAME: z.string().default("fourd_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CART_COOKIE_NAME: z.string().default("fourd_cart"),

  STORE_CURRENCY: z.string().length(3).default("INR"),
  STORE_PRICES_INCLUDE_TAX: bool(true),
  STORE_DEFAULT_COUNTRY: z.string().length(2).default("IN"),
  STOCK_RESERVATION_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  PAYMENT_PROVIDER: z.enum(["mock", "razorpay", "stripe"]).default("mock"),
  PAYMENT_WEBHOOK_SECRET: z.string().default(""),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),

  STORAGE_PROVIDER: z.enum(["local", "s3", "cloudinary"]).default("local"),
  STORAGE_BUCKET: z.string().default(""),
  STORAGE_REGION: z.string().default(""),
  STORAGE_ENDPOINT: z.string().default(""),
  STORAGE_ACCESS_KEY: z.string().default(""),
  STORAGE_SECRET_KEY: z.string().default(""),
  STORAGE_PUBLIC_URL: z.string().default(""),

  EMAIL_PROVIDER: z.string().default("console"),
  EMAIL_FROM: z.string().default("4D Commerce <no-reply@4dcommerce.local>"),
  EMAIL_API_KEY: z.string().default(""),
  SMS_PROVIDER: z.string().default("console"),
  SMS_API_KEY: z.string().default(""),
  WHATSAPP_PROVIDER: z.string().default("console"),
  WHATSAPP_API_KEY: z.string().default(""),

  RATE_LIMIT_ENABLED: bool(true),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

export type Env = z.infer<typeof schema> & {
  isProd: boolean;
  isTest: boolean;
  corsOrigins: string[];
};

let cached: Env | null = null;

/** Validated, typed environment. Parsed lazily so `next build` can import route modules without secrets. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production") {
    if (/change-me|dev-only/i.test(e.AUTH_SECRET)) {
      throw new Error("AUTH_SECRET must be replaced with a strong random value in production");
    }
    if (e.PAYMENT_PROVIDER === "mock") {
      throw new Error("PAYMENT_PROVIDER=mock is not allowed in production");
    }
  }
  cached = {
    ...e,
    isProd: e.NODE_ENV === "production",
    isTest: e.NODE_ENV === "test",
    corsOrigins: [e.APP_URL, ...e.CORS_ALLOWED_ORIGINS.split(",")]
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean),
  };
  return cached;
}

/** Lazy proxy: `env.AUTH_SECRET` validates on first access. */
export const env: Env = new Proxy({} as Env, {
  get: (_t, prop: string) => loadEnv()[prop as keyof Env],
});

/** For tests that mutate process.env. */
export function resetEnvCache() {
  cached = null;
}
