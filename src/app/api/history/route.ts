import { NextResponse } from "next/server";
import { getHistory, upsertHistory, toggleFavorite, deleteHistory, compactNow } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: getHistory() });
}

interface HistoryBody {
  op?: "favorite" | "delete" | "compact" | "upsert";
  id?: string;
  url?: string;
  title?: string;
  format?: "hls" | "mp4";
  lastPositionSec?: number;
  durationSec?: number;
  thumbnailUrl?: string | null;
}

export async function POST(req: Request) {
  let body: HistoryBody;
  try {
    body = (await req.json()) as HistoryBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (body.op === "favorite" && body.id) {
    const item = toggleFavorite(body.id);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  }
  if (body.op === "delete" && body.id) {
    const ok = deleteHistory(body.id);
    return NextResponse.json({ ok });
  }
  if (body.op === "compact") {
    compactNow();
    return NextResponse.json({ ok: true });
  }

  if (!body.url || !/^https?:\/\/\S+$/i.test(body.url)) {
    return NextResponse.json({ error: "url required (http/s)" }, { status: 422 });
  }
  const item = upsertHistory({
    id: body.id,
    url: body.url,
    title: body.title,
    format: body.format,
    lastPositionSec: body.lastPositionSec,
    durationSec: body.durationSec,
    thumbnailUrl: body.thumbnailUrl,
    playedAt: Date.now(),
  });
  return NextResponse.json({ ok: true, item });
}
