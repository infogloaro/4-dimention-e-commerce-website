import { z } from "zod";
import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { AppError } from "@/server/core/errors";
import { providerKeyFromSlug } from "@/server/integrations/payments";
import { processWebhook } from "@/server/services/payments";

/**
 * Provider → us. No session/CSRF (it's server-to-server); authenticity comes from the provider signature, which is
 * verified over the RAW body. Duplicate deliveries are acknowledged without re-processing.
 */
export const POST = route({ params: z.object({ provider: z.string().max(20) }), raw: true, csrf: false, rateLimit: RL.webhook, maxBodyBytes: 512 * 1024 }, async (ctx) => {
  const key = providerKeyFromSlug(ctx.params.provider);
  if (!key) throw new AppError("NOT_FOUND", "Unknown payment provider");
  const result = await processWebhook(key, ctx.rawBody, ctx.req.headers);
  return result;
});
