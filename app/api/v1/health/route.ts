import { NextResponse } from "next/server";
import { db } from "@/server/db/client";

export const dynamic = "force-dynamic";

/** Liveness + DB readiness probe for load balancers. No auth, no secrets, no internals. */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ success: true, data: { status: "ok", db: "up", latencyMs: Date.now() - started, time: new Date().toISOString() } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable", details: {} } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
