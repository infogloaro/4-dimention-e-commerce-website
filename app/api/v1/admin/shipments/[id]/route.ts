import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { shipmentUpdateBody } from "@/server/validation/orders";
import { updateShipment } from "@/server/services/orders";

/** Carrier-style status update (Reached hub, Out for delivery, Delivered ...) — also advances the order and feeds the tracking timeline. */
export const PATCH = route({ permission: ["order:update", "shipping:manage"], permissionMode: "any", params: idParams, body: shipmentUpdateBody, rateLimit: RL.admin }, async (ctx) => {
  await updateShipment(ctx.requireUser(), ctx.params.id, ctx.body);
  return { updated: true };
});
