import { z } from "zod";

export const id = z.string().uuid("Invalid id");
export const idParams = z.object({ id });
export const slugParams = z.object({ slug: z.string().min(1).max(160) });

export const slug = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

export const email = z.string().trim().toLowerCase().email("Enter a valid email").max(254);

/** E.164-ish: optional +, 8-15 digits. Spaces/dashes are stripped before validation. */
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .refine((v) => /^\+?[1-9]\d{7,14}$/.test(v), "Enter a valid phone number");

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Password must contain a letter and a number");

/** Minor-unit money (paise/cents). */
export const money = z.number().int().min(0).max(2_000_000_000);
export const positiveInt = z.number().int().min(1);
export const quantity = z.number().int().min(1).max(100);

export const url = z.string().url().max(2048);
export const mediaUrl = z
  .string()
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "Must be an http(s) URL or site-relative path");

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/** Accept `?x=a&x=b` or `?x=a,b` and always give an array. */
export const arrayParam = <T extends z.ZodType>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(item).max(50) as unknown as z.ZodType<z.output<T>[], string[]>);

export const boolParam = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

export const intParam = z.coerce.number().int();

export const dateParam = z.coerce.date();

/** Strips HTML control characters so user-generated text can't smuggle markup into emails / logs. Output is still escaped by the client. */
export const plainText = (max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/<[^>]*>/g, ""));

export const postalCode = z.string().trim().min(3).max(12).regex(/^[A-Za-z0-9\- ]+$/, "Invalid postal code");
export const countryCode = z.string().trim().length(2).toUpperCase();

/** Spread into a query object schema: `z.object({ ...paginationSchemaRef })`. */
export const paginationSchemaRef = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
};
