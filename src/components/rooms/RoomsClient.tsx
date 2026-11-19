"use client";

import { ArrowRight, Check, Copy, Headphones, Link2, Radio, Users, Wifi } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { selectCurrentTrack, usePlayerStore } from "@/stores/player.store";
import { useProgressStore } from "@/stores/progress.store";
import { Artwork } from "@/components/ui/Artwork";
import { PlayPauseButton } from "@/components/player/PlayerControls";
import { EqualizerIcon } from "@/components/tracks/TrackList";
import { formatDuration } from "@/lib/format";
import {
  clearActiveRoomSession,
  leaveRoomSession,
  readActiveRoomSession,
  setActiveRoomSession,
} from "@/lib/rooms/client-session";
import type { QueueItem, RepeatMode } from "@/types/music";
import type { QueueState } from "@/lib/queue";

type RoomSnapshot = {
  queue: QueueState;
  isPlaying: boolean;
  position: number;
  sentAt: number;
};
type Participant = { id: string; name: string; role: "host" | "guest" };

const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem("cadence-client-id");
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("cadence-client-id", id);
  }
  return id;
}

export function RoomsClient({ code: roomCode, isHost }: { code: string; isHost: boolean }) {
  const code = roomCode.toUpperCase();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selfId] = useState(getOrCreateClientId);
  const [copied, setCopied] = useState(false);
  const [listeners, setListeners] = useState(1);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [status, setStatus] = useState(code ? "Connecting to room…" : "");
  const [error, setError] = useState("");
  const [readyToListen, setReadyToListen] = useState(isHost);
  const [remoteSnapshot, setRemoteSnapshot] = useState<RoomSnapshot | null>(null);
  const [inviteOrigin, setInviteOrigin] = useState("");
  const appliedTrack = useRef("");
  const remoteSnapshotRef = useRef<RoomSnapshot | null>(null);
  const enabled = useRef(isHost);
  const previousRepeat = useRef<RepeatMode | null>(null);
  const track = usePlayerStore(selectCurrentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = useProgressStore((s) => s.currentTime);
  const invite = useMemo(() => inviteOrigin && code ? `${inviteOrigin}/rooms?code=${code}` : "", [inviteOrigin, code]);

  useEffect(() => {
    const saved = sessionStorage.getItem("cadence-room-name");
    if (saved) setDisplayName(saved);
  }, []);

  useEffect(() => {
    if (code) return;
    const active = readActiveRoomSession();
    if (active) {
      router.replace(`/rooms?code=${encodeURIComponent(active.code)}&host=1`);
    }
  }, [code, router]);

  useEffect(() => {
    void fetch("/api/rooms/invite").then((response) => response.json()).then((data: { origin: string }) => setInviteOrigin(data.origin)).catch(() => {});
  }, []);

  const sendAction = useCallback(async (action: string, id: string, snapshot?: RoomSnapshot, keepalive = false) => {
    return fetch(`/api/rooms/${encodeURIComponent(code)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        clientId: id,
        name: displayName.trim(),
        ...(snapshot ? { snapshot } : {}),
      }),
      keepalive,
    });
  }, [code, displayName]);

  // Connect to room & setup SSE stream
  useEffect(() => {
    if (!code || !displayName.trim() || !selfId) return;
    let source: EventSource | null = null;
    let stopped = false;

    const connect = async () => {
      try {
        const response = await sendAction(isHost ? "create" : "join", selfId);
        const data = await response.json() as { message?: string; listeners?: number; participants?: Participant[]; snapshot?: RoomSnapshot | null };
        if (!response.ok) throw new Error(data.message ?? "Couldn't enter this room.");
        if (stopped) return;
        setError("");
        setStatus("Connected · listening together");
        setListeners(data.listeners ?? 1);
        setParticipants(data.participants ?? []);
        if (isHost) {
          const player = usePlayerStore.getState();
          const active = readActiveRoomSession();
          const previous =
            active?.code === code && active.clientId === selfId
              ? active.previousRepeat
              : player.repeat;
          previousRepeat.current = previous;
          setActiveRoomSession({
            code,
            clientId: selfId,
            name: displayName.trim(),
            previousRepeat: previous,
          });
          if (player.repeat !== "all") player.setRepeatMode("all");
        }
        if (data.snapshot) {
          remoteSnapshotRef.current = data.snapshot;
          setRemoteSnapshot(data.snapshot);
        }

        source = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events?clientId=${encodeURIComponent(selfId)}`);
        source.onopen = () => setStatus("Connected · listening together");
        source.onerror = () => setStatus("Reconnecting to room…");
        source.addEventListener("snapshot", (event) => {
          try {
            const snapshot = JSON.parse((event as MessageEvent).data) as RoomSnapshot;
            remoteSnapshotRef.current = snapshot;
            setRemoteSnapshot(snapshot);
          } catch {
            /* Ignore malformed events */
          }
        });
        source.addEventListener("presence", (event) => {
          try {
            const presence = JSON.parse((event as MessageEvent).data) as { listeners: number; participants?: Participant[] };
            setListeners(presence.listeners);
            setParticipants(presence.participants ?? []);
          } catch {
            /* Ignore malformed presence events */
          }
        });
        source.addEventListener("closed", (event) => {
          try { setError((JSON.parse((event as MessageEvent).data) as { message: string }).message); }
          catch { setError("The host ended this room."); }
          setStatus("Room closed");
          source?.close();
        });
        source.addEventListener("room-error", (event) => {
          try { setError((JSON.parse((event as MessageEvent).data) as { message: string }).message); }
          catch { setError("Realtime room updates are temporarily unavailable."); }
          setStatus("Room unavailable");
          source?.close();
        });

      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Couldn't connect to room service.");
      }
    };

    void connect();
    return () => {
      stopped = true;
      source?.close();
      // Note: Do not call sendAction('leave') here. Effect remounts in React
      // must not terminate active room sessions. Window beforeunload handles page exit.
    };
  }, [code, displayName, isHost, selfId, sendAction]);

  // Cleanly notify server on page close
  useEffect(() => {
    if (!code || !selfId) return;
    const handleUnload = () => {
      const player = usePlayerStore.getState();
      if (isHost && previousRepeat.current !== null && player.repeat === "all") {
        player.setRepeatMode(previousRepeat.current);
      }
      if (isHost) clearActiveRoomSession();
      void sendAction("leave", selfId, undefined, true).catch(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [code, isHost, selfId, sendAction]);

  // Guest sync logic: follow host's playback & queue
  useEffect(() => {
    if (isHost || !remoteSnapshot) return;
    const state = remoteSnapshot;
    const current = usePlayerStore.getState();
    const rawItems = state.queue?.items;
    const items = (Array.isArray(rawItems)
      ? rawItems
      : rawItems && typeof rawItems === "object"
        ? Object.values(rawItems)
        : []) as QueueItem[];
    const incomingItem = items[state.queue.index];
    const incomingCurrent = incomingItem?.track;
    if (!incomingItem || !incomingCurrent) {
      if (current.queue.items.length > 0 || current.isPlaying) {
        usePlayerStore.setState({ queue: { items: [], original: null, index: -1 }, isPlaying: false });
      }
      return;
    }

    const expected = state.position + (state.isPlaying ? Math.max(0, (Date.now() - state.sentAt) / 1000) : 0);
    const currentItem = current.queue.items[current.queue.index];
    const itemChanged = currentItem?.uid !== incomingItem.uid;
    const queueChanged =
      current.queue.index !== state.queue.index ||
      current.queue.items.length !== items.length ||
      current.queue.items.some((item, index) => item.uid !== items[index]?.uid);

    if (queueChanged || current.queue.items.length === 0) {
      const normalizedQueue: QueueState = {
        items,
        original: Array.isArray(state.queue?.original) ? (state.queue.original as QueueItem[]) : null,
        index: state.queue?.index ?? 0,
      };
      usePlayerStore.setState({
        queue: normalizedQueue,
        ...(itemChanged || current.queue.items.length === 0
          ? { isPlaying: enabled.current && state.isPlaying, resumePosition: expected }
          : {}),
      });
    }

    if (itemChanged || current.queue.items.length === 0) {
      appliedTrack.current = incomingItem.uid;
      useProgressStore.setState({ currentTime: expected, duration: incomingCurrent.duration });
      if (enabled.current) {
        usePlayerStore.getState().seek(expected);
        if (state.isPlaying) usePlayerStore.getState().play();
      }
      return;
    }

    const drift = Math.abs(useProgressStore.getState().currentTime - expected);
    if (enabled.current && drift > 1.25) {
      usePlayerStore.getState().seek(expected);
    }
    const playingNow = enabled.current && state.isPlaying;
    if (current.isPlaying !== playingNow) {
      if (playingNow) {
        usePlayerStore.getState().play();
      } else {
        usePlayerStore.getState().pause();
      }
    }
  }, [isHost, remoteSnapshot]);

  const createRoom = () => {
    if (!displayName.trim()) return;
    sessionStorage.setItem("cadence-room-name", displayName.trim().slice(0, 32));
    const newCode = randomCode();
    router.push(`/rooms?code=${newCode}&host=1`);
  };

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean && displayName.trim()) {
      sessionStorage.setItem("cadence-room-name", displayName.trim().slice(0, 32));
      router.push(`/rooms?code=${clean}`);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(invite);
        setCopied(true);
      } catch {
        const el = document.createElement("textarea");
        el.value = invite;
        el.style.position = "fixed";
        document.body.appendChild(el);
        el.select();
        try {
          document.execCommand("copy");
          setCopied(true);
        } catch {}
        document.body.removeChild(el);
      }
    } else {
      const el = document.createElement("textarea");
      el.value = invite;
      el.style.position = "fixed";
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
        setCopied(true);
      } catch {}
      document.body.removeChild(el);
    }
    window.setTimeout(() => setCopied(false), 1800);
  };

  const enableListening = () => {
    enabled.current = true;
    setReadyToListen(true);
    if (!remoteSnapshot) return;
    const snapshot = remoteSnapshot;
    const rawItems = snapshot.queue?.items;
    const items = (Array.isArray(rawItems)
      ? rawItems
      : rawItems && typeof rawItems === "object"
        ? Object.values(rawItems)
        : []) as QueueItem[];
    const incoming = items[snapshot.queue.index]?.track;
    if (!incoming) return;
    const expected = snapshot.position + (snapshot.isPlaying ? Math.max(0, (Date.now() - snapshot.sentAt) / 1000) : 0);
    const normalizedQueue: QueueState = {
      items,
      original: Array.isArray(snapshot.queue?.original) ? (snapshot.queue.original as QueueItem[]) : null,
      index: snapshot.queue?.index ?? 0,
    };
    usePlayerStore.setState({
      queue: normalizedQueue,
      isPlaying: snapshot.isPlaying,
      resumePosition: expected,
    });
    useProgressStore.setState({ currentTime: expected, duration: incoming.duration });
    usePlayerStore.getState().seek(expected);
    if (snapshot.isPlaying) {
      usePlayerStore.getState().play();
    }
  };

  const leaveRoom = async () => {
    const active = readActiveRoomSession();
    if (isHost && active?.code === code && active.clientId === selfId) {
      await leaveRoomSession(active).catch(() => clearActiveRoomSession());
    } else {
      try {
        await sendAction("leave", selfId, undefined, true);
      } catch {}
    }
    router.push("/rooms");
  };

  const queueItems = Array.isArray(queue?.items) ? queue.items : [];
  const queueIndex = typeof queue?.index === "number" ? queue.index : -1;

  return (
    <div>
      <PageHeader
        eyebrow="Listen together"
        title={code ? "The listening room" : "Music is better together"}
        description={code ? "Bring your people in, pick a track, and settle into the same rhythm." : "Create a room, share an invite, and make a soundtrack together."}
      />
      {!code ? (
        <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
          <label className="text-muted-foreground text-sm md:col-span-2">
            Your name
            <input
              required
              aria-label="Your name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value.slice(0, 32))}
              placeholder="What should friends call you?"
              maxLength={32}
              className="border-input bg-background focus:ring-ring mt-2 block w-full rounded-full border px-4 py-3 text-sm outline-none focus:ring-2"
            />
          </label>
          <section className="border-border bg-card rounded-xl border p-6 md:p-8">
            <div className="bg-primary/10 text-primary mb-6 flex size-12 items-center justify-center rounded-xl"><Radio /></div>
            <p className="label-mono">Start a session</p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight">Create a room</h2>
            <p className="text-muted-foreground mt-2 min-h-12 text-sm">Get a room code and invite friends to listen along.</p>
            <Button variant="primary" className="mt-6" onClick={createRoom} disabled={!displayName.trim()}>
              Create room <ArrowRight />
            </Button>
          </section>
          <section className="border-border bg-card rounded-xl border p-6 md:p-8">
            <div className="bg-muted text-muted-foreground mb-6 flex size-12 items-center justify-center rounded-xl"><Headphones /></div>
            <p className="label-mono">Got an invite?</p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight">Join a room</h2>
            <p className="text-muted-foreground mt-2 text-sm">Enter the room code your friend shared with you.</p>
            <form onSubmit={joinRoom} className="mt-6 flex gap-2">
              <input
                aria-label="Room code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={12}
                className="border-input bg-background focus:ring-ring min-w-0 flex-1 rounded-full border px-4 font-mono text-sm uppercase tracking-widest outline-none focus:ring-2"
              />
              <Button variant="secondary" type="submit" disabled={!joinCode.trim() || !displayName.trim()}>
                Join <ArrowRight />
              </Button>
            </form>
          </section>
          <div className="text-muted-foreground flex items-center justify-center gap-2 text-xs md:col-span-2">
            <Wifi className="text-primary size-4" /> Shared listening, built around independent music
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl">
          <div className="border-border bg-card overflow-hidden rounded-xl border">
            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-b p-5 md:p-7">
              <div>
                <p className="label-mono flex items-center gap-2">
                  <span className="bg-primary size-1.5 animate-pulse rounded-full" /> {status}
                </p>
                <h2 className="mt-2 font-mono text-3xl font-semibold tracking-[0.14em]">{code}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={copyInvite} disabled={!invite}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy invite"}
                </Button>
                <Button variant="ghost" onClick={leaveRoom}>
                  Leave room
                </Button>
              </div>
            </div>
            {error && <p role="alert" className="bg-destructive/10 text-destructive px-5 py-3 text-sm md:px-7">{error}</p>}
            {!displayName.trim() && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = displayName.trim().slice(0, 32);
                  if (name) {
                    sessionStorage.setItem("cadence-room-name", name);
                    setDisplayName(name);
                  }
                }}
                className="border-border grid gap-3 border-b p-5 sm:grid-cols-[1fr_auto] md:px-7"
              >
                <label className="text-muted-foreground text-sm">
                  Enter your name to join this room
                  <input
                    autoComplete="name"
                    required
                    autoFocus
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value.slice(0, 32))}
                    placeholder="Your name"
                    maxLength={32}
                    className="border-input bg-background focus:ring-ring mt-2 block w-full rounded-full border px-4 py-3 text-sm outline-none focus:ring-2"
                  />
                </label>
                <Button variant="primary" className="self-end" disabled={!displayName.trim()}>
                  Join room <ArrowRight />
                </Button>
              </form>
            )}
            <div className="grid md:grid-cols-[1.1fr_0.9fr]">
              <section className="border-border border-b p-5 md:border-r md:border-b-0 md:p-7">
                <div className="flex items-center justify-between">
                  <p className="label-mono flex items-center gap-2">
                    Now playing
                    {isPlaying && <EqualizerIcon className="h-2.5" />}
                  </p>
                  {isPlaying && (
                    <span className="label-mono bg-primary/15 text-primary flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-semibold tracking-wider">
                      <span className="bg-primary size-1.5 animate-pulse rounded-full" />
                      LIVE
                    </span>
                  )}
                </div>
                {track ? (
                  <div className="mt-5 flex items-center gap-4">
                    <div className="relative shrink-0">
                      {isPlaying && (
                        <div
                          aria-hidden
                          className="animate-music-pulse pointer-events-none absolute -inset-1 rounded-xl bg-primary/25 blur-sm"
                        />
                      )}
                      <Artwork image={track.artwork} size="medium" className="relative z-1 size-20 rounded-lg shadow-md" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-medium">{track.title}</p>
                      <p className="text-muted-foreground truncate text-sm">{track.artist.name}</p>
                      <p className="text-subtle mt-2 font-mono text-xs">
                        {formatDuration(currentTime)} / {formatDuration(track.duration)}
                      </p>
                    </div>
                    {isHost ? (
                      <PlayPauseButton />
                    ) : !readyToListen ? (
                      <Button variant="primary" onClick={enableListening}>
                        Enable listening <Headphones />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">Synced with host</span>
                    )}
                  </div>
                ) : (
                  <div className="bg-muted/50 mt-5 rounded-lg p-6 text-center">
                    <Headphones className="text-subtle mx-auto size-7" />
                    <p className="mt-3 font-medium">{isHost ? "Choose the first track" : "Waiting for the host"}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {isHost ? "Browse OS Vibes and press play to start the room." : "The host’s queue will appear here when playback starts."}
                    </p>
                    {isHost && (
                      <Link className="text-primary mt-4 inline-block text-sm hover:underline" href="/search">
                        Find music <ArrowRight className="inline size-3" />
                      </Link>
                    )}
                  </div>
                )}
                {!isHost && remoteSnapshot?.isPlaying && !isPlaying && (
                  <div className="mt-4 space-y-2">
                    <p className="text-muted-foreground text-sm">Your browser needs a tap before it can play synced audio.</p>
                    {readyToListen && (
                      <Button variant="primary" onClick={enableListening}>
                        Tap to start audio <Headphones />
                      </Button>
                    )}
                  </div>
                )}
                <div className="border-border mt-6 flex items-center justify-between border-t pt-4">
                  <span className="label-mono">Up next</span>
                  <span className="text-muted-foreground text-xs">
                    {Math.max(0, queueItems.length - queueIndex - 1)} tracks
                  </span>
                </div>
                {queueItems.slice(queueIndex + 1, queueIndex + 4).map((item) => (
                  <div key={item.uid} className="text-muted-foreground flex justify-between gap-3 py-2 text-sm">
                    <span className="truncate">
                      {item.track.title} <span className="text-subtle">· {item.track.artist.name}</span>
                    </span>
                    <span className="font-mono text-xs">{formatDuration(item.track.duration)}</span>
                  </div>
                ))}
              </section>
              <aside className="p-5 md:p-7">
                <div className="flex items-center justify-between">
                  <p className="label-mono">In the room</p>
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Users className="size-3.5" />{listeners} listening
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {participants.map((participant) => (
                    <div key={participant.id} className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border p-3">
                      <span className="bg-primary/15 text-primary flex size-9 items-center justify-center rounded-full font-mono text-xs">
                        {participant.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {participant.name}
                        {participant.id === selfId ? <span className="text-subtle text-xs"> · You</span> : null}
                        <span className="text-subtle block text-xs">{participant.role === "host" ? "Host" : "Listener"}</span>
                      </span>
                      {participant.role === "host" && (
                        <span className="bg-primary/15 text-primary label-mono ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-medium tracking-wide">
                          {isPlaying && <span className="bg-primary size-1 animate-ping rounded-full" />}
                          DJ
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-muted/40 mt-5 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Link2 className="text-primary mt-0.5 size-4 shrink-0" />
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      Share the invite link or room ID so friends can join. Everyone’s playback follows the host’s queue and position.
                    </p>
                  </div>
                </div>
                <p className="text-subtle mt-5 text-xs leading-relaxed">
                  Room code <span className="font-mono text-muted-foreground">{code}</span> · Free listening powered by OS Vibes
                </p>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
