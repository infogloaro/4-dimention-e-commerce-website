import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { env } from "./env";

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, keylen, opts, (e, key) => (e ? reject(e) : resolve(key))),
  );
}

/** scrypt$N$r$p$salt$hash — parameters are stored so they can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummyHash: Promise<string> | null = null;
/** Burn equivalent CPU for unknown accounts so login timing does not reveal which emails exist. */
export async function fakePasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password");
  await verifyPassword(password, await dummyHash);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const randomDigits = (len = 6) => Array.from({ length: len }, () => randomInt(0, 10)).join("");

/** Peppered hash for bearer-style secrets (sessions, reset tokens, guest cart tokens): DB leaks are not usable. */
export const hashToken = (token: string) => createHmac("sha256", env.AUTH_SECRET).update(token).digest("hex");

export const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function hmacHex(secret: string, payload: string | Buffer, algo = "sha256") {
  return createHmac(algo, secret).update(payload).digest("hex");
}
