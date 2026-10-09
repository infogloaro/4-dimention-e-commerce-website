import { z } from "zod";
import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { orderQueues } from "@/server/services/order-queues";

/** Live work queues + exceptions for the order desk (uncached, cheap counts). `since` powers the "new orders" indicator. */
export const GET = route({ permission: "order:read", query: z.object({ since: z.coerce.date().optional() }), rateLimit: RL.admin }, (ctx) => orderQueues(ctx.query.since));
