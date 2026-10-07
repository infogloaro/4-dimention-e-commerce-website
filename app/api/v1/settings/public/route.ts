import { route, reply, publicCache } from "@/server/core/http";
import { publicSettings } from "@/server/services/admin-ops";
import { env } from "@/server/core/env";

export const GET = route({}, async () =>
  reply({ currency: env.STORE_CURRENCY, pricesIncludeTax: env.STORE_PRICES_INCLUDE_TAX, paymentProvider: env.PAYMENT_PROVIDER, reservationMinutes: env.STOCK_RESERVATION_MINUTES, settings: await publicSettings() }, { headers: publicCache(60, 300) }),
);
