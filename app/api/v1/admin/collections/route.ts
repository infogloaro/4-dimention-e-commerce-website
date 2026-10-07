import { route, created } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { collectionBody } from "@/server/validation/admin";
import { createCollection, listAllCollections } from "@/server/services/catalog/admin-taxonomy";

export const GET = route({ permission: ["product:read", "collection:write"], permissionMode: "any", rateLimit: RL.admin }, () => listAllCollections());
export const POST = route({ permission: "collection:write", body: collectionBody, rateLimit: RL.admin }, async (ctx) => created(await createCollection(ctx.requireUser(), ctx.body)));
