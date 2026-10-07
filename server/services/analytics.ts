import { db } from "../db/client";
import { memo } from "../core/cache";
import { lowStock } from "./inventory";

/**
 * Analytics read from the DailySalesStat rollup instead of scanning orders on every request.
 * Closed days are computed once; "today" and "yesterday" are refreshed at most every 60 s.
 * Dates are UTC days (documented in docs/backend/ADMIN.md).
 */
const DAY = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** (Re)compute the rollup for [from, to] inclusive, in one set-based statement. */
export async function refreshDailyStats(from: Date, to: Date) {
  const start = utcDay(from);
  const end = new Date(utcDay(to).getTime() + DAY);
  await db.$executeRaw`
    INSERT INTO "DailySalesStat" (date, orders, "itemsSold", "grossRevenue", discounts, shipping, tax, refunds, cancelled, "newCustomers", "computedAt")
    SELECT d::date,
      coalesce(o.orders, 0), coalesce(i.items, 0), coalesce(o.revenue, 0), coalesce(o.discounts, 0), coalesce(o.shipping, 0), coalesce(o.tax, 0),
      coalesce(r.refunds, 0), coalesce(c.cancelled, 0), coalesce(u.n, 0), now()
    FROM generate_series(${start}::date, (${end}::date - 1), interval '1 day') d
    LEFT JOIN (SELECT ("placedAt" AT TIME ZONE 'UTC')::date AS day, count(*)::int AS orders, sum("grandTotal")::int AS revenue, sum("discountTotal")::int AS discounts, sum("shippingTotal")::int AS shipping, sum("taxTotal")::int AS tax
               FROM "Order" WHERE "placedAt" >= ${start} AND "placedAt" < ${end} AND status NOT IN ('CANCELLED','FAILED','PENDING_PAYMENT') GROUP BY 1) o ON o.day = d::date
    LEFT JOIN (SELECT (od."placedAt" AT TIME ZONE 'UTC')::date AS day, sum(oi.quantity - oi."cancelledQuantity")::int AS items
               FROM "OrderItem" oi JOIN "Order" od ON od.id = oi."orderId" WHERE od."placedAt" >= ${start} AND od."placedAt" < ${end} AND od.status NOT IN ('CANCELLED','FAILED','PENDING_PAYMENT') GROUP BY 1) i ON i.day = d::date
    LEFT JOIN (SELECT ("processedAt" AT TIME ZONE 'UTC')::date AS day, sum(amount)::int AS refunds FROM "Refund" WHERE status = 'SUCCEEDED' AND "processedAt" >= ${start} AND "processedAt" < ${end} GROUP BY 1) r ON r.day = d::date
    LEFT JOIN (SELECT ("cancelledAt" AT TIME ZONE 'UTC')::date AS day, count(*)::int AS cancelled FROM "Order" WHERE "cancelledAt" >= ${start} AND "cancelledAt" < ${end} GROUP BY 1) c ON c.day = d::date
    LEFT JOIN (SELECT (u."createdAt" AT TIME ZONE 'UTC')::date AS day, count(*)::int AS n FROM "User" u JOIN "Role" ro ON ro.id = u."roleId" AND NOT ro."isStaff" WHERE u."createdAt" >= ${start} AND u."createdAt" < ${end} GROUP BY 1) u ON u.day = d::date
    ON CONFLICT (date) DO UPDATE SET orders = EXCLUDED.orders, "itemsSold" = EXCLUDED."itemsSold", "grossRevenue" = EXCLUDED."grossRevenue", discounts = EXCLUDED.discounts, shipping = EXCLUDED.shipping, tax = EXCLUDED.tax, refunds = EXCLUDED.refunds, cancelled = EXCLUDED.cancelled, "newCustomers" = EXCLUDED."newCustomers", "computedAt" = now()`;
}

/** Make sure every day in range has a row, and the two most recent days are fresh. */
async function ensureStats(from: Date, to: Date) {
  const start = utcDay(from);
  const end = utcDay(to);
  const today = utcDay(new Date());
  const existing = await db.dailySalesStat.findMany({ where: { date: { gte: start, lte: end } }, select: { date: true, computedAt: true } });
  const have = new Map(existing.map((e) => [iso(e.date), e.computedAt]));
  const stale: Date[] = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + DAY)) {
    const computed = have.get(iso(d));
    const recent = today.getTime() - d.getTime() <= DAY;
    if (!computed || (recent && Date.now() - computed.getTime() > 60_000)) stale.push(d);
  }
  if (stale.length) await refreshDailyStats(stale[0]!, stale[stale.length - 1]!);
}

export type Granularity = "day" | "week" | "month";

function bucket(d: Date, g: Granularity): string {
  if (g === "day") return iso(d);
  if (g === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY); // ISO week starts Monday
  return iso(monday);
}

export async function salesSeries(q: { from: Date; to: Date; granularity: Granularity }) {
  const from = utcDay(q.from);
  const to = utcDay(q.to);
  await ensureStats(from, to);
  const rows = await db.dailySalesStat.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
  const acc = new Map<string, { orders: number; itemsSold: number; revenue: number; discounts: number; refunds: number; shipping: number; tax: number; newCustomers: number; cancelled: number }>();
  for (const r of rows) {
    const k = bucket(r.date, q.granularity);
    const a = acc.get(k) ?? acc.set(k, { orders: 0, itemsSold: 0, revenue: 0, discounts: 0, refunds: 0, shipping: 0, tax: 0, newCustomers: 0, cancelled: 0 }).get(k)!;
    a.orders += r.orders; a.itemsSold += r.itemsSold; a.revenue += r.grossRevenue; a.discounts += r.discounts; a.refunds += r.refunds; a.shipping += r.shipping; a.tax += r.tax; a.newCustomers += r.newCustomers; a.cancelled += r.cancelled;
  }
  const series = [...acc].map(([period, a]) => ({ period, ...a, netRevenue: a.revenue - a.refunds, averageOrderValue: a.orders ? Math.round(a.revenue / a.orders) : 0 }));
  const totals = series.reduce((t, s) => ({ orders: t.orders + s.orders, revenue: t.revenue + s.revenue, refunds: t.refunds + s.refunds, itemsSold: t.itemsSold + s.itemsSold, discounts: t.discounts + s.discounts, newCustomers: t.newCustomers + s.newCustomers }), { orders: 0, revenue: 0, refunds: 0, itemsSold: 0, discounts: 0, newCustomers: 0 });

  // compare with the immediately preceding window of equal length
  const span = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
  const prevFrom = new Date(from.getTime() - span * DAY);
  const prevTo = new Date(from.getTime() - DAY);
  await ensureStats(prevFrom, prevTo);
  const prev = await db.dailySalesStat.aggregate({ where: { date: { gte: prevFrom, lte: prevTo } }, _sum: { grossRevenue: true, orders: true } });
  const pct = (cur: number, before: number | null) => (before ? Math.round(((cur - before) / before) * 1000) / 10 : null);
  return {
    range: { from: iso(from), to: iso(to), granularity: q.granularity, days: span },
    totals: { ...totals, netRevenue: totals.revenue - totals.refunds, averageOrderValue: totals.orders ? Math.round(totals.revenue / totals.orders) : 0 },
    comparison: { revenueChangePct: pct(totals.revenue, prev._sum.grossRevenue), ordersChangePct: pct(totals.orders, prev._sum.orders) },
    series,
  };
}

export async function topProducts(q: { from: Date; to: Date; limit: number }) {
  return db.$queryRaw<Array<{ productId: string; name: string; slug: string | null; unitsSold: number; revenue: number; image: string | null }>>`
    SELECT oi."productId", max(oi.name) AS name, max(p.slug) AS slug, sum(oi.quantity - oi."cancelledQuantity" - oi."returnedQuantity")::int AS "unitsSold",
           sum(round(oi."lineTotal"::numeric * (oi.quantity - oi."cancelledQuantity" - oi."returnedQuantity") / oi.quantity))::int AS revenue, max(oi."imageUrl") AS image
    FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" LEFT JOIN "Product" p ON p.id = oi."productId"
    WHERE o."placedAt" >= ${utcDay(q.from)} AND o."placedAt" < ${new Date(utcDay(q.to).getTime() + DAY)} AND o.status NOT IN ('CANCELLED','FAILED','PENDING_PAYMENT')
    GROUP BY oi."productId" HAVING sum(oi.quantity - oi."cancelledQuantity" - oi."returnedQuantity") > 0
    ORDER BY revenue DESC LIMIT ${q.limit}`;
}

export async function categoryPerformance(q: { from: Date; to: Date }) {
  return db.$queryRaw<Array<{ category: string; unitsSold: number; revenue: number; orders: number }>>`
    SELECT coalesce(oi."categoryName", 'Uncategorised') AS category, sum(oi.quantity - oi."cancelledQuantity" - oi."returnedQuantity")::int AS "unitsSold",
           sum(oi."lineTotal")::int AS revenue, count(DISTINCT oi."orderId")::int AS orders
    FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
    WHERE o."placedAt" >= ${utcDay(q.from)} AND o."placedAt" < ${new Date(utcDay(q.to).getTime() + DAY)} AND o.status NOT IN ('CANCELLED','FAILED','PENDING_PAYMENT')
    GROUP BY 1 ORDER BY revenue DESC`;
}

export async function customerMetrics(q: { from: Date; to: Date }) {
  const start = utcDay(q.from);
  const end = new Date(utcDay(q.to).getTime() + DAY);
  const [total, newCustomers, repeat, buyers, top] = await Promise.all([
    db.user.count({ where: { role: { isStaff: false } } }),
    db.user.count({ where: { role: { isStaff: false }, createdAt: { gte: start, lt: end } } }),
    db.user.count({ where: { role: { isStaff: false }, ordersCount: { gte: 2 } } }),
    db.user.count({ where: { role: { isStaff: false }, ordersCount: { gte: 1 } } }),
    db.user.findMany({ where: { role: { isStaff: false }, ordersCount: { gt: 0 } }, orderBy: { lifetimeValue: "desc" }, take: 10, select: { id: true, name: true, email: true, ordersCount: true, lifetimeValue: true } }),
  ]);
  return { totalCustomers: total, newCustomers, repeatCustomers: repeat, customersWithOrders: buyers, repeatRatePct: buyers ? Math.round((repeat / buyers) * 1000) / 10 : 0, topCustomers: top };
}

/** Conversion-related funnel from data we actually have: carts → checkouts started → orders placed. */
export async function funnel(q: { from: Date; to: Date }) {
  const start = utcDay(q.from);
  const end = new Date(utcDay(q.to).getTime() + DAY);
  const [carts, started, placed] = await Promise.all([
    db.cart.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.order.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.order.count({ where: { placedAt: { gte: start, lt: end }, status: { notIn: ["CANCELLED", "FAILED", "PENDING_PAYMENT"] } } }),
  ]);
  return { cartsCreated: carts, checkoutsStarted: started, ordersPlaced: placed, checkoutCompletionPct: started ? Math.round((placed / started) * 1000) / 10 : 0, cartToOrderPct: carts ? Math.round((placed / carts) * 1000) / 10 : 0 };
}

export function dashboard() {
  return memo("analytics:dashboard", 30_000, async () => {
    const now = new Date();
    const today = utcDay(now);
    const d30 = new Date(today.getTime() - 29 * DAY);
    await ensureStats(new Date(today.getTime() - 59 * DAY), today);
    const [trend, statusCounts, lowStockRows, recent, top, customers, products, openReturns, pendingRefunds, funnelData] = await Promise.all([
      salesSeries({ from: d30, to: today, granularity: "day" }),
      db.order.groupBy({ by: ["status"], _count: { _all: true } }),
      lowStock(10),
      db.order.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, orderNumber: true, status: true, paymentStatus: true, grandTotal: true, customerName: true, createdAt: true } }),
      topProducts({ from: d30, to: today, limit: 5 }),
      customerMetrics({ from: d30, to: today }),
      db.product.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
      db.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "REFUND_PENDING"] } } }),
      db.refund.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      funnel({ from: d30, to: today }),
    ]);
    const todayRow = trend.series.find((s) => s.period === iso(today));
    const week = trend.series.filter((s) => s.period >= iso(new Date(today.getTime() - 6 * DAY)));
    const sum = (rows: typeof week, k: "revenue" | "orders") => rows.reduce((s, r) => s + r[k], 0);
    const by = new Map(statusCounts.map((s) => [s.status, s._count._all]));
    return {
      generatedAt: now,
      kpis: {
        revenueToday: todayRow?.revenue ?? 0,
        ordersToday: todayRow?.orders ?? 0,
        revenue7d: sum(week, "revenue"),
        orders7d: sum(week, "orders"),
        revenue30d: trend.totals.revenue,
        orders30d: trend.totals.orders,
        averageOrderValue30d: trend.totals.averageOrderValue,
        revenueChangePct30d: trend.comparison.revenueChangePct,
        ordersChangePct30d: trend.comparison.ordersChangePct,
        refunds30d: trend.totals.refunds,
      },
      customers: { total: customers.totalCustomers, new30d: customers.newCustomers, repeatRatePct: customers.repeatRatePct },
      products: { active: products.find((p) => p.status === "ACTIVE")?._count._all ?? 0, draft: products.find((p) => p.status === "DRAFT")?._count._all ?? 0, lowStock: lowStockRows.length },
      orders: { pending: (by.get("PLACED") ?? 0) + (by.get("CONFIRMED") ?? 0) + (by.get("PROCESSING") ?? 0), awaitingPayment: by.get("PENDING_PAYMENT") ?? 0, toShip: by.get("PACKED") ?? 0, inTransit: (by.get("SHIPPED") ?? 0) + (by.get("OUT_FOR_DELIVERY") ?? 0), byStatus: Object.fromEntries(by) },
      alerts: { openReturns, pendingRefunds, lowStockCount: lowStockRows.length },
      salesTrend: trend.series.map((s) => ({ date: s.period, revenue: s.revenue, orders: s.orders })),
      topProducts: top,
      lowStock: lowStockRows,
      recentOrders: recent,
      funnel: funnelData,
    };
  });
}
