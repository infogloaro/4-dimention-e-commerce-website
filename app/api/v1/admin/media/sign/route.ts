import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { uploadSignBody } from "@/server/validation/admin";
import { createUploadTarget } from "@/server/integrations/storage";

/**
 * Ask where to upload. `mode: "direct"` (S3/Cloudinary) returns a presigned request the browser sends straight to
 * object storage; `mode: "server"` (local dev) means POST the file to /admin/media/upload.
 */
export const POST = route({ permission: ["product:write", "content:write", "category:write", "brand:write"], permissionMode: "any", body: uploadSignBody, rateLimit: RL.admin }, (ctx) => createUploadTarget(ctx.body.folder, ctx.body.contentType));
