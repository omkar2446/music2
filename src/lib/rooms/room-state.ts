export const ROOM_HOST_TIMEOUT_MS = 90_000;

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;
const CLIENT_ID_PATTERN = /^[a-z0-9-]{8,80}$/i;

export type RoomSnapshot = {
  queue: Record<string, unknown>;
  isPlaying: boolean;
  position: number;
  sentAt: number;
};

export type RoomParticipant = { id: string; name: string; role: "host" | "guest" };

export type RoomRecord = {
  hostId: string;
  lastHostAt: number;
  snapshot: RoomSnapshot | null;
  members: Record<string, RoomParticipant>;
};

export type RoomAction = "create" | "join" | "sync" | "leave";

type RoomActionInput = {
  clientId: string;
  name?: string;
  snapshot?: RoomSnapshot;
  now: number;
};

export type RoomMutationResult = {
  commit: boolean;
  next: RoomRecord | null;
  status: number;
  body: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

export function isValidClientId(clientId: string): boolean {
  return CLIENT_ID_PATTERN.test(clientId);
}

export function parseRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (
    !isRecord(value) ||
    !isRecord(value.queue) ||
    typeof value.isPlaying !== "boolean" ||
    typeof value.position !== "number" ||
    !Number.isFinite(value.position) ||
    typeof value.sentAt !== "number" ||
    !Number.isFinite(value.sentAt)
  ) {
    return null;
  }

  const rawQueue = value.queue;
  const rawItems = rawQueue.items;
  const items = Array.isArray(rawItems)
    ? rawItems
    : rawItems && typeof rawItems === "object"
      ? Object.values(rawItems)
      : [];
  const rawOriginal = rawQueue.original;
  const original = Array.isArray(rawOriginal)
    ? rawOriginal
    : rawOriginal && typeof rawOriginal === "object"
      ? Object.values(rawOriginal)
      : null;
  const index = typeof rawQueue.index === "number" ? rawQueue.index : -1;

  return {
    queue: { ...rawQueue, items, original, index },
    isPlaying: value.isPlaying,
    position: Math.max(0, value.position),
    sentAt: value.sentAt,
  };
}

export function readRoomRecord(value: unknown): RoomRecord | null {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    typeof value.hostId !== "string" ||
    typeof value.lastHostAt !== "number" ||
    !Number.isFinite(value.lastHostAt)
  ) {
    throw new Error("Firebase room data has an invalid shape.");
  }

  const rawMembers = value.members;
  const members: Record<string, RoomParticipant> = {};
  if (rawMembers !== null && rawMembers !== undefined && isRecord(rawMembers)) {
    for (const [id, member] of Object.entries(rawMembers)) {
      if (
        isRecord(member) &&
        typeof member.name === "string" &&
        (member.role === "host" || member.role === "guest")
      ) {
        members[id] = {
          id: typeof member.id === "string" ? member.id : id,
          name: member.name,
          role: member.role,
        };
      }
    }
  }

  const snapshot = value.snapshot === null || value.snapshot === undefined
    ? null
    : parseRoomSnapshot(value.snapshot);

  return {
    hostId: value.hostId,
    lastHostAt: value.lastHostAt,
    snapshot,
    members,
  };
}

function isExpired(room: RoomRecord, now: number): boolean {
  return now - room.lastHostAt > ROOM_HOST_TIMEOUT_MS;
}

function fail(status: number, message: string): RoomMutationResult {
  return { commit: false, next: null, status, body: { message } };
}

export function applyRoomAction(
  current: RoomRecord | null,
  action: RoomAction,
  input: RoomActionInput,
): RoomMutationResult {
  const name = input.name?.trim().slice(0, 32) ?? "";
  if ((action === "create" || action === "join") && !name) {
    return fail(400, `Enter your name to ${action === "create" ? "create" : "join"} this room.`);
  }

  if (action === "create") {
    if (current && !isExpired(current, input.now)) {
      if (current.hostId === input.clientId) {
        const room: RoomRecord = {
          ...current,
          lastHostAt: input.now,
          members: {
            ...current.members,
            [input.clientId]: { id: input.clientId, name, role: "host" },
          },
        };
        return {
          commit: true,
          next: room,
          status: 200,
          body: {
            listeners: Object.keys(room.members).length,
            participants: Object.values(room.members),
            snapshot: room.snapshot,
          },
        };
      }
      return fail(409, "That room code is already in use.");
    }
    const room: RoomRecord = {
      hostId: input.clientId,
      lastHostAt: input.now,
      snapshot: null,
      members: {
        [input.clientId]: { id: input.clientId, name, role: "host" },
      },
    };
    return {
      commit: true,
      next: room,
      status: 200,
      body: { listeners: 1, participants: Object.values(room.members) },
    };
  }

  if (!current) return fail(404, "Room not found. Ask the host to create a new room.");
  if (isExpired(current, input.now)) {
    return {
      commit: true,
      next: null,
      status: 404,
      body: { message: "The host has disconnected. Ask them to create a new room." },
    };
  }

  if (action === "join") {
    const room: RoomRecord = {
      ...current,
      members: {
        ...current.members,
        [input.clientId]: {
          id: input.clientId,
          name,
          role: input.clientId === current.hostId ? "host" : "guest",
        },
      },
    };
    return {
      commit: true,
      next: room,
      status: 200,
      body: {
        listeners: Object.keys(room.members).length,
        participants: Object.values(room.members),
        snapshot: room.snapshot,
      },
    };
  }

  if (action === "sync") {
    if (current.hostId !== input.clientId) return fail(403, "Only the host can update playback.");
    if (!input.snapshot) return fail(400, "Invalid playback snapshot.");
    const room: RoomRecord = {
      ...current,
      lastHostAt: input.now,
      snapshot: { ...input.snapshot, sentAt: input.now },
    };
    return { commit: true, next: room, status: 200, body: { success: true } };
  }

  if (current.hostId === input.clientId) {
    return { commit: true, next: null, status: 200, body: { success: true } };
  }
  const members = { ...current.members };
  delete members[input.clientId];
  return {
    commit: true,
    next: { ...current, members },
    status: 200,
    body: { success: true },
  };
}
