import { z } from "zod";
import { route } from "@/server/core/http";
import { getTracking } from "@/server/services/orders";

/** Lean tracking payload for the animated timeline: progress stages, events, shipments, ETA. */
export const GET = route({ auth: "required", params: z.object({ id: z.string().min(6).max(40) }) }, (ctx) => getTracking(ctx.requireUser().id, ctx.params.id));
