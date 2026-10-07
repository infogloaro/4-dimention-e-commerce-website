import { route, reply } from "@/server/core/http";
import { shippingEstimateQuery } from "@/server/validation/commerce";
import { quoteShipping } from "@/server/services/shipping";

/** Delivery-by-pincode checker for the product page / cart. */
export const GET = route({ query: shippingEstimateQuery }, async (ctx) => {
  const options = await quoteShipping({ addr: { postalCode: ctx.query.postalCode, state: ctx.query.state, country: ctx.query.country }, subtotal: ctx.query.subtotal, weightGrams: ctx.query.weightGrams });
  return reply({ serviceable: options.length > 0, options }, { headers: { "Cache-Control": "public, max-age=60" } });
});
