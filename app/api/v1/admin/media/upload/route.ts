import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { AppError } from "@/server/core/errors";
import { env } from "@/server/core/env";
import { MAX_UPLOAD_BYTES, storeLocal } from "@/server/integrations/storage";
import { audit } from "@/server/services/audit";

/** Server-side upload (local storage provider only). File content is sniffed — the declared type is never trusted. */
export const POST = route(
  { permission: ["product:write", "content:write", "category:write", "brand:write"], permissionMode: "any", multipart: true, rateLimit: RL.admin, maxBodyBytes: MAX_UPLOAD_BYTES + 64 * 1024 },
  async (ctx) => {
    if (env.STORAGE_PROVIDER !== "local") throw new AppError("BAD_REQUEST", "Direct-to-storage uploads are enabled; use POST /admin/media/sign");
    const form = await ctx.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("UPLOAD_REJECTED", "Attach the file in a form field named 'file'");
    const folder = String(form.get("folder") ?? "products");
    const saved = await storeLocal(Buffer.from(await file.arrayBuffer()), file.type, folder);
    await audit({ action: "media.uploaded", resourceType: "media", resourceId: saved.key, actor: ctx.user, metadata: { size: saved.size, type: saved.contentType } });
    return created(saved);
  },
);
