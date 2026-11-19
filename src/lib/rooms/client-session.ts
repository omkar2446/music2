import type { RepeatMode } from "@/types/music";
import { usePlayerStore } from "@/stores/player.store";

const ACTIVE_ROOM_KEY = "cadence-active-room";
const ROOM_CHANGE_EVENT = "cadence:room-session-change";

export type ActiveRoomSession = {
  code: string;
  clientId: string;
  name: string;
  previousRepeat: RepeatMode;
};

export function readActiveRoomSession(): ActiveRoomSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(ACTIVE_ROOM_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<ActiveRoomSession>;
    if (
      typeof parsed.code !== "string" ||
      typeof parsed.clientId !== "string" ||
      typeof parsed.name !== "string" ||
      (parsed.previousRepeat !== "off" && parsed.previousRepeat !== "all" && parsed.previousRepeat !== "one")
    ) return null;
    return parsed as ActiveRoomSession;
  } catch {
    return null;
  }
}

export function setActiveRoomSession(session: ActiveRoomSession): void {
  sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(ROOM_CHANGE_EVENT));
}

export function clearActiveRoomSession(): void {
  sessionStorage.removeItem(ACTIVE_ROOM_KEY);
  window.dispatchEvent(new Event(ROOM_CHANGE_EVENT));
}

export async function leaveRoomSession(session: ActiveRoomSession): Promise<void> {
  try {
    await fetch(`/api/rooms/${encodeURIComponent(session.code)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "leave", clientId: session.clientId, name: session.name }),
      keepalive: true,
    });
  } finally {
    const active = readActiveRoomSession();
    if (active?.code === session.code && active.clientId === session.clientId) {
      clearActiveRoomSession();
    }
    const player = usePlayerStore.getState();
    if (player.repeat === "all") player.setRepeatMode(session.previousRepeat);
  }
}

export function roomSessionChangeEvent(): string {
  return ROOM_CHANGE_EVENT;
}
