"use client";

import { useEffect, useMemo, useState } from "react";
import { Rail, TopBar, Toasts } from "@/components/Chrome";
import { formatTimecode } from "@/lib/sync";
import { useToastStore } from "@/stores/deviceStore";
import type { HistoryItem } from "@/lib/types";

type Filter = "recent" | "favorites";

export default function LibraryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>("recent");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState("living-room");
  const toast = useToastStore((s) => s.push);

  const load = () => {
    void fetch("/api/history")
      .then((r) => r.json())
      .then((d: { items: HistoryItem[] }) => setItems(d.items))
      .catch(() => toast("Failed to load history", "err"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    let list = filter === "favorites" ? items.filter((i) => i.isFavorite) : items;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q));
    }
    return list;
  }, [items, filter, query]);

  const act = async (body: object, okMsg: string) => {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    toast(okMsg, "ok");
    load();
  };

  const resumeCast = async (item: HistoryItem) => {
    await fetch("/api/cast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: item.url, title: item.title, roomId }),
    });
    toast(
      `Re-cast "${item.title}" to room ${roomId}${
        item.lastPositionSec > 5 ? ` · resumes ${formatTimecode(item.lastPositionSec)}` : ""
      }`,
      "ok"
    );
  };

  return (
    <div className="flex min-h-screen">
      <Rail />
      <div className="flex flex-1 flex-col">
        <TopBar
          primaryAction={
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.trim() || "living-room")}
              className="w-40 font-mono text-[11px]"
              placeholder="target room"
            />
          }
        />
        <main className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex w-full max-w-[960px] items-center gap-3">
            <div className="flex gap-1">
              {(["recent", "favorites"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md border px-3 py-1.5 text-[12px] ${
                    filter === f ? "border-gold text-gold" : "border-hairline text-ink-dim hover:text-ink"
                  }`}
                >
                  {f === "recent" ? "Recent" : "★ Favorites"}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or URL…"
              className="w-64 text-[12px]"
            />
            <span className="ml-auto font-mono text-[10px] text-ink-dim">
              {visible.length} item(s) · persisted server-side
            </span>
          </div>

          {loading ? (
            <div className="flex w-full max-w-[960px] flex-col gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-lg" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="panel w-full max-w-[960px] p-8 text-center text-[12px] text-ink-dim">
              Library is empty — cast a stream to start building history.
            </div>
          ) : (
            <div className="flex w-full max-w-[960px] flex-col gap-2">
              {visible.map((h) => (
                <div key={h.id} className="well flex items-center gap-4 px-4 py-3">
                  {h.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.thumbnailUrl} alt="" className="h-12 w-20 rounded object-cover" />
                  ) : (
                    <div className="flex h-12 w-20 items-center justify-center rounded bg-obsidian font-mono text-[10px] text-gold-dim">
                      {h.format.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {h.isFavorite && <span className="mr-1 text-gold">★</span>}
                      {h.title}
                    </div>
                    <div className="truncate font-mono text-[10px] text-ink-dim">{h.url}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-ink-dim">
                      {h.format.toUpperCase()} · {formatTimecode(h.lastPositionSec)} /{" "}
                      {formatTimecode(h.durationSec)} · played ×{h.playCount} ·{" "}
                      {new Date(h.playedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => void resumeCast(h)}
                    className="rounded border border-gold/40 px-3 py-1.5 text-[11px] text-gold hover:bg-gold/10"
                  >
                    {h.lastPositionSec > 5 ? `RESUME ${formatTimecode(h.lastPositionSec)}` : "CAST"}
                  </button>
                  <button
                    onClick={() => void act({ op: "favorite", id: h.id }, h.isFavorite ? "Unfavorited" : "Favorited")}
                    className="rounded border border-hairline px-2 py-1.5 text-[11px] text-ink-dim hover:border-gold hover:text-gold"
                  >
                    ★
                  </button>
                  <button
                    onClick={() => void act({ op: "delete", id: h.id }, "Deleted")}
                    className="rounded border border-hairline px-2 py-1.5 text-[11px] text-crimson-off hover:border-crimson-off"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
        <Toasts />
      </div>
    </div>
  );
}
