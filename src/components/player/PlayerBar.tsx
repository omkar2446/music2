"use client";

import { ListMusic, Maximize2, X } from "lucide-react";
import Link from "next/link";
import { LikeButton } from "@/components/tracks/LikeButton";
import { EqualizerIcon } from "@/components/tracks/TrackList";
import { Artwork } from "@/components/ui/Artwork";
import { IconButton } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { selectCurrentTrack, usePlayerStore } from "@/stores/player.store";
import { useProgressStore } from "@/stores/progress.store";
import { useUiStore } from "@/stores/ui.store";
import { PlayerControls, PlayPauseButton } from "./PlayerControls";
import { ProgressBar } from "./ProgressBar";
import { QueueList } from "./QueueList";
import { Stage } from "./Stage";
import { VolumeControl } from "./VolumeControl";

const openStage = () => useUiStore.getState().setNowPlayingOpen(true);

function NowPlayingInfo() {
  const track = usePlayerStore(selectCurrentTrack);
  const error = usePlayerStore((s) => s.error);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  if (!track) {
    return <p className="label-mono text-subtle">Nothing playing</p>;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={openStage}
        aria-label={`Open stage for ${track.title}`}
        className={cn(
          "group/art border-border relative shrink-0 overflow-hidden rounded-md border transition-all duration-300",
          isPlaying && "ring-primary/40 shadow-[0_0_16px_-3px_var(--primary)] ring-2",
        )}
      >
        <Artwork image={track.artwork} size="small" className="size-12 rounded-none" eager />
        {isPlaying && (
          <span className="bg-background/85 absolute right-1 bottom-1 flex items-center rounded-sm px-1 py-0.5 backdrop-blur-md">
            <EqualizerIcon className="h-2.5" />
          </span>
        )}
        <span className="bg-background/60 absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/art:opacity-100">
          <Maximize2 className="size-4" />
        </span>
      </button>
      <div className="min-w-0">
        <Link
          href={routes.track(track.id)}
          className={cn(
            "block truncate text-sm font-medium tracking-[-0.01em] transition-colors hover:underline",
            isPlaying && "text-primary font-semibold",
          )}
        >
          {track.title}
        </Link>
        {error ? (
          <p className="text-destructive truncate text-xs" role="status">
            {error}
          </p>
        ) : (
          <Link
            href={routes.artist(track.artist.id)}
            className="text-muted-foreground block truncate text-xs hover:underline"
          >
            {track.artist.name}
          </Link>
        )}
      </div>
      <LikeButton track={track} className="shrink-0" />
    </div>
  );
}

function TempoBadge() {
  const bpm = usePlayerStore((s) => selectCurrentTrack(s)?.bpm);
  if (!bpm) return null;
  return (
    <span className="label-mono border-border hidden rounded-sm border px-1.5 py-1 text-[10px] xl:inline">
      {bpm} bpm
    </span>
  );
}

function DesktopPlayer() {
  const queueOpen = useUiStore((s) => s.queueOpen);
  const hasTrack = usePlayerStore((s) => s.queue.index >= 0);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  return (
    <div
      className={cn(
        "border-border bg-card/90 fixed inset-x-3 bottom-3 z-40 hidden h-(--player-height) grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 rounded-2xl border px-4 shadow-2xl shadow-black/20 backdrop-blur-xl transition-all duration-500 md:grid",
        isPlaying && "border-primary/40 shadow-[0_12px_45px_-12px_var(--primary)]",
      )}
    >
      {isPlaying && (
        <div
          aria-hidden
          className="via-primary/50 pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
        />
      )}
      <NowPlayingInfo />
      <div className="flex max-w-2xl min-w-0 flex-col items-center gap-0.5 justify-self-center sm:w-full">
        <PlayerControls />
        <ProgressBar className="w-full" />
      </div>
      <div className="flex items-center justify-end gap-1">
        <TempoBadge />
        <IconButton label="Open stage" disabled={!hasTrack} onClick={openStage}>
          <Maximize2 className="size-[18px]!" />
        </IconButton>
        <IconButton
          label={queueOpen ? "Hide queue" : "Show queue"}
          aria-pressed={queueOpen}
          active={queueOpen}
          onClick={() => useUiStore.getState().toggleQueue()}
        >
          <ListMusic />
        </IconButton>
        <div className="hidden lg:block">
          <VolumeControl />
        </div>
      </div>
    </div>
  );
}

function QueueDrawer() {
  const open = useUiStore((s) => s.queueOpen);
  if (!open) return null;
  return (
    <aside
      aria-label="Queue"
      className="queue-drawer border-border bg-card/95 fixed top-14 right-3 bottom-[calc(var(--player-height)+1.5rem)] z-30 hidden w-96 flex-col rounded-2xl border shadow-2xl shadow-black/20 backdrop-blur-xl md:flex"
    >
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <p className="label-mono">
          <span
            aria-hidden
            className="bg-primary/70 mr-2 inline-block size-1.5 rounded-full align-middle"
          />
          Queue
        </p>
        <IconButton label="Close queue" onClick={() => useUiStore.getState().setQueueOpen(false)}>
          <X />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <QueueList />
      </div>
    </aside>
  );
}

function MiniProgress() {
  const currentTime = useProgressStore((s) => s.currentTime);
  const duration = useProgressStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  return (
    <div className="bg-foreground/10 absolute inset-x-0 bottom-0 h-px" aria-hidden>
      <div
        className={cn(
          "bg-primary h-full transition-[width] duration-150 ease-out",
          isPlaying && "shadow-[0_0_10px_var(--primary)]",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MobileMiniPlayer() {
  const track = usePlayerStore(selectCurrentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  if (!track) return null;
  return (
    <div className="mini-player-enter fixed inset-x-2 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+0.375rem)] z-40 md:hidden">
      <div
        className={cn(
          "border-border bg-card/90 relative flex h-(--mini-player-height) items-center gap-3 overflow-hidden rounded-lg border px-2 shadow-xl shadow-black/40 backdrop-blur-xl transition-all duration-300",
          isPlaying && "border-primary/40 shadow-[0_4px_24px_-6px_var(--primary)]",
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Open stage: ${track.title} by ${track.artist.name}`}
          onClick={openStage}
        >
          <div className="relative shrink-0">
            <Artwork image={track.artwork} size="small" className="size-10 rounded-md" eager />
            {isPlaying && (
              <span className="bg-background/85 absolute right-0.5 bottom-0.5 flex items-center rounded-xs px-1 py-0.5 backdrop-blur-md">
                <EqualizerIcon className="h-2" />
              </span>
            )}
          </div>
          <span className="min-w-0">
            <span className={cn("block truncate text-sm font-medium", isPlaying && "text-primary")}>
              {track.title}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {track.artist.name}
            </span>
          </span>
        </button>
        <LikeButton track={track} />
        <PlayPauseButton className="mr-1 size-9" />
        <MiniProgress />
      </div>
    </div>
  );
}

/** Everything player-related that lives outside page content and survives navigation. */
export function PlayerBar() {
  return (
    <>
      <DesktopPlayer />
      <QueueDrawer />
      <MobileMiniPlayer />
      <Stage />
    </>
  );
}
