import { NextResponse } from "next/server";
import { publish } from "@/lib/bus";
import { upsertHistory } from "@/lib/store";
import { detectFormat, titleFromUrl } from "@/lib/presets";

interface CastBody {
  url?: string;
  title?: string;
  roomId?: string;
}

export async function POST(req: Request) {
  const token = process.env.CAST_TOKEN;
  if (token && req.headers.get("x-aurelia-token") !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CastBody;
  try {
    body = (await req.json()) as CastBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url || !/^https?:\/\/\S+$/i.test(url)) {
    return NextResponse.json({ error: "url must be an http(s) URL" }, { status: 422 });
  }
  const ext = url.split("?")[0];
  if (!/\.(m3u8|mp4)$/i.test(ext)) {
    return NextResponse.json({ error: "url must point to .m3u8 (HLS) or .mp4" }, { status: 422 });
  }

  const roomId = body.roomId?.trim() || "living-room";
  const format = detectFormat(url);
  const title = body.title?.trim() || titleFromUrl(url);
  const item = upsertHistory({ url, title, format });
  const resumeSec = item.lastPositionSec > 5 ? item.lastPositionSec : 0;

  publish(roomId, {
    v: 2,
    type: "cast",
    roomId,
    ts: Date.now(),
    payload: { url, title, format, historyId: item.id, resumeSec },
  });

  return NextResponse.json({ ok: true, roomId, historyId: item.id, format, acceptedAt: Date.now() });
}
