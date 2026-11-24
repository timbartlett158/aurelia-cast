import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = globalThis as unknown as { __aureliaWsUp?: boolean };
  return NextResponse.json(
    {
      service: "aurelia-cast",
      ws: g.__aureliaWsUp ? "up" : "down",
      uptimeSec: Math.round(process.uptime()),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
