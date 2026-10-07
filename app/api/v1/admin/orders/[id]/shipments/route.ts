import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { idParams } from "@/server/validation/common";
import { shipmentBody } from "@/server/validation/orders";
import { createShipment } from "@/server/services/orders";

export const POST = route({ permission: ["order:update", "shipping:manage"], permissionMode: "any", params: idParams, body: shipmentBody, rateLimit: RL.admin }, async (ctx) => created(await createShipment(ctx.requireUser(), ctx.params.id, ctx.body)));
