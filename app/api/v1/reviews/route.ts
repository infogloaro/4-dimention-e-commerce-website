import { route } from "@/server/core/http";
import { myReviews } from "@/server/services/reviews";

/** The signed-in customer's own reviews (all statuses). */
export const GET = route({ auth: "required" }, (ctx) => myReviews(ctx.requireUser().id));
