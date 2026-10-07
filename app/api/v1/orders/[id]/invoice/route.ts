import { route } from "@/server/core/http";
import { idParams } from "@/server/validation/common";
import { getInvoice } from "@/server/services/orders";

/** Structured invoice data; the frontend renders / prints it (PDF generation is a client concern). */
export const GET = route({ auth: "required", params: idParams }, (ctx) => getInvoice(ctx.requireUser().id, ctx.params.id));
