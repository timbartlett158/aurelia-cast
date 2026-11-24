"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar, Toasts } from "@/components/Chrome";
import { PlayerStage } from "@/components/PlayerStage";

function ReceiverInner() {
  const params = useSearchParams();
  const roomId = params.get("room") ?? "living-room";
  const [name, setName] = useState("Receiver Node");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("aurelia-name");
    if (stored) setName(stored);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        primaryAction={
          editing ? (
            <input
              autoFocus
              defaultValue={name}
              className="w-48 text-[12px]"
              onBlur={(e) => {
                setName(e.target.value.trim() || "Receiver Node");
                localStorage.setItem("aurelia-name", e.target.value.trim() || "Receiver Node");
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <button
              className="rounded-md border border-hairline bg-well px-3 py-1.5 font-mono text-[11px] text-ink-dim hover:border-gold hover:text-gold"
              onClick={() => setEditing(true)}
            >
              {name} · room {roomId}
            </button>
          )
        }
      />
      <main className="flex flex-1 flex-col">
        <PlayerStage key={roomId + name} roomId={roomId} name={name} />
      </main>
      <Toasts />
    </div>
  );
}

export default function ReceiverPage() {
  return (
    <Suspense>
      <ReceiverInner />
    </Suspense>
  );
}
