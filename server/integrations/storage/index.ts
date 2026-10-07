import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../core/env";
import { AppError } from "../../core/errors";

/**
 * Media abstraction. Binary files NEVER go into PostgreSQL — only the resulting URL + metadata do.
 *  - local:      dev default, writes under /public/uploads (server-side upload)
 *  - s3:         S3 / S3-compatible (MinIO, R2). Returns a SigV4 *presigned PUT* so the browser uploads directly.
 *  - cloudinary: returns a signed direct-upload form.
 * The s3/cloudinary signing code is implemented from the providers' public specs and has not been run against a live bucket here.
 */
export const ALLOWED_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm" };
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface UploadTarget {
  mode: "server" | "direct";
  provider: string;
  key: string;
  publicUrl: string;
  /** direct mode: how the client should upload */
  upload?: { method: "PUT" | "POST"; url: string; headers?: Record<string, string>; fields?: Record<string, string> };
  expiresInSec?: number;
}

function newKey(folder: string, contentType: string) {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new AppError("UPLOAD_REJECTED", "Unsupported file type", { allowed: Object.keys(ALLOWED_TYPES) });
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, "").replace(/^\/+|\/+$/g, "") || "misc";
  const d = new Date();
  return `${safeFolder}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}

export function detectImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (buf.subarray(4, 8).toString() === "ftyp") return buf.subarray(8, 12).toString().startsWith("avif") ? "image/avif" : "video/mp4";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "video/webm";
  return null;
}

export async function storeLocal(buf: Buffer, declaredType: string, folder: string) {
  if (buf.length > MAX_UPLOAD_BYTES) throw new AppError("UPLOAD_REJECTED", "File too large");
  const real = detectImageType(buf); // never trust the client-declared type
  if (!real || real !== declaredType) throw new AppError("UPLOAD_REJECTED", "File contents do not match the declared type");
  const key = newKey(folder, real);
  const dest = path.join(process.cwd(), "public", "uploads", key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return { key, url: `${env.STORAGE_PUBLIC_URL || ""}/uploads/${key}`, contentType: real, size: buf.length };
}

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();

function presignS3Put(key: string, contentType: string, expiresInSec = 600) {
  const { STORAGE_BUCKET: bucket, STORAGE_REGION: region, STORAGE_ACCESS_KEY: ak, STORAGE_SECRET_KEY: sk } = env;
  if (!bucket || !region || !ak || !sk) throw new AppError("SERVICE_UNAVAILABLE", "S3 storage is not configured");
  const host = env.STORAGE_ENDPOINT ? new URL(env.STORAGE_ENDPOINT).host : `${bucket}.s3.${region}.amazonaws.com`;
  const pathStyle = !!env.STORAGE_ENDPOINT;
  const canonicalUri = "/" + (pathStyle ? `${bucket}/` : "") + key.split("/").map(encodeURIComponent).join("/");
  const now = new Date();
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amz.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const params = new URLSearchParams({ "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${ak}/${scope}`, "X-Amz-Date": amz, "X-Amz-Expires": String(expiresInSec), "X-Amz-SignedHeaders": "content-type;host" });
  const sorted = [...params].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const canonical = ["PUT", canonicalUri, sorted, `content-type:${contentType}\nhost:${host}\n`, "content-type;host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha256hex(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${sk}`, date), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  const scheme = env.STORAGE_ENDPOINT ? new URL(env.STORAGE_ENDPOINT).protocol : "https:";
  return `${scheme}//${host}${canonicalUri}?${sorted}&X-Amz-Signature=${signature}`;
}

export function createUploadTarget(folder: string, contentType: string): UploadTarget {
  const key = newKey(folder, contentType);
  switch (env.STORAGE_PROVIDER) {
    case "s3": {
      const url = presignS3Put(key, contentType);
      const base = env.STORAGE_PUBLIC_URL || (env.STORAGE_ENDPOINT ? `${env.STORAGE_ENDPOINT}/${env.STORAGE_BUCKET}` : `https://${env.STORAGE_BUCKET}.s3.${env.STORAGE_REGION}.amazonaws.com`);
      return { mode: "direct", provider: "s3", key, publicUrl: `${base}/${key}`, upload: { method: "PUT", url, headers: { "Content-Type": contentType } }, expiresInSec: 600 };
    }
    case "cloudinary": {
      const cloud = process.env.CLOUDINARY_URL?.match(/^cloudinary:\/\/(\w+):(\w+)@(.+)$/);
      if (!cloud) throw new AppError("SERVICE_UNAVAILABLE", "Cloudinary is not configured");
      const [, apiKey, apiSecret, cloudName] = cloud;
      const timestamp = String(Math.floor(Date.now() / 1000));
      const publicId = key.replace(/\.[^.]+$/, "");
      const signature = createHash("sha1").update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`).digest("hex");
      return { mode: "direct", provider: "cloudinary", key, publicUrl: `https://res.cloudinary.com/${cloudName}/${contentType.startsWith("video") ? "video" : "image"}/upload/${key}`, upload: { method: "POST", url: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, fields: { api_key: apiKey!, timestamp, signature, public_id: publicId } }, expiresInSec: 3600 };
    }
    default:
      return { mode: "server", provider: "local", key, publicUrl: `${env.STORAGE_PUBLIC_URL || ""}/uploads/${key}` };
  }
}
