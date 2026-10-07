import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { trackingEventBody } from "@/server/validation/orders";
import { addCustomTrackingEvent } from "@/server/services/orders";

export const POST = route({ permission: "order:update", params: idParams, body: trackingEventBody, rateLimit: RL.admin }, async (ctx) =>
  created(await addCustomTrackingEvent(ctx.requireUser(), ctx.params.id, { ...ctx.body, metadata: ctx.body.metadata as never })),
);
