export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Escape `%`, `_` and `\` so user input can be embedded in a LIKE/ILIKE pattern literally. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function randomCode(len: number, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function formatMoney(minor: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(minor / 100);
}
