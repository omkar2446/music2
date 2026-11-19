"use client";

import { DoorOpen, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useHydrated } from "@/stores/hydration";
import { selectCurrentTrack, usePlayerStore } from "@/stores/player.store";
import { useProgressStore } from "@/stores/progress.store";
import {
  clearActiveRoomSession,
  leaveRoomSession,
  readActiveRoomSession,
  roomSessionChangeEvent,
  type ActiveRoomSession,
} from "@/lib/rooms/client-session";

export function ActiveRoomRuntime() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [session, setSession] = useState<ActiveRoomSession | null>(null);
  const [status, setStatus] = useState<"live" | "reconnecting">("live");

  const refresh = useCallback(() => {
    setSession(readActiveRoomSession());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    refresh();
    const event = roomSessionChangeEvent();
    window.addEventListener(event, refresh);
    return () => window.removeEventListener(event, refresh);
  }, [hydrated, refresh]);

  useEffect(() => {
    if (!hydrated || !session) return;
    let stopped = false;
    let inFlight = false;

    const sync = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      const player = usePlayerStore.getState();
      const track = selectCurrentTrack(player);
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(session.code)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "sync",
            clientId: session.clientId,
            name: session.name,
            snapshot: {
              queue: player.queue,
              isPlaying: player.isPlaying && Boolean(track),
              position: useProgressStore.getState().currentTime,
              sentAt: Date.now(),
            },
          }),
        });
        if (response.ok) {
          setStatus("live");
        } else if (response.status === 404 || response.status === 403) {
          await leaveRoomSession(session).catch(() => clearActiveRoomSession());
        } else {
          setStatus("reconnecting");
        }
      } catch {
        setStatus("reconnecting");
      } finally {
        inFlight = false;
      }
    };

    void sync();
    const timer = window.setInterval(() => void sync(), 1600);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [hydrated, session]);

  const leave = async () => {
    if (!session) return;
    await leaveRoomSession(session).catch(() => clearActiveRoomSession());
    router.push("/rooms");
  };

  if (!session) return null;

  return (
    <aside className="active-room-pill fixed top-14 right-4 z-40 flex items-center gap-2 rounded-full border border-primary/30 bg-card/95 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-xl">
      <span className="relative flex size-2" aria-hidden>
        <span className="bg-primary absolute inset-0 animate-ping rounded-full opacity-50" />
        <span className="bg-primary relative size-2 rounded-full" />
      </span>
      <span className="label-mono text-foreground hidden sm:inline">
        {status === "live" ? "Room live" : "Room reconnecting"} · {session.code}
      </span>
      <Link
        href={`/rooms?code=${encodeURIComponent(session.code)}&host=1`}
        className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
      >
        <Radio className="size-3.5 sm:hidden" />
        Open room
      </Link>
      <button
        type="button"
        onClick={() => void leave()}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors"
      >
        <DoorOpen className="size-3.5" /> Leave
      </button>
    </aside>
  );
}
