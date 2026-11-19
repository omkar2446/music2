import { describe, expect, it } from "vitest";
import { applyRoomAction, type RoomRecord, type RoomSnapshot } from "@/lib/rooms/room-state";

const snapshot: RoomSnapshot = {
  queue: { items: [], index: 0 },
  isPlaying: true,
  position: 12,
  sentAt: 100,
};

const createRoom = (now = 1_000) =>
  applyRoomAction(null, "create", {
    clientId: "host-client-123",
    name: "Host",
    now,
  });

describe("room state", () => {
  it("creates a room with its host as the first participant", () => {
    const result = createRoom();

    expect(result.status).toBe(200);
    expect(result.next?.hostId).toBe("host-client-123");
    expect(result.body).toMatchObject({
      listeners: 1,
      participants: [{ id: "host-client-123", name: "Host", role: "host" }],
    });
  });

  it("rejects duplicate active room codes but replaces expired rooms", () => {
    const active = createRoom().next as RoomRecord;
    const duplicate = applyRoomAction(active, "create", {
      clientId: "other-client-123",
      name: "Other",
      now: 2_000,
    });
    const expired = applyRoomAction(active, "create", {
      clientId: "other-client-123",
      name: "Other",
      now: 92_000,
    });

    expect(duplicate.status).toBe(409);
    expect(expired.status).toBe(200);
    expect(expired.next?.hostId).toBe("other-client-123");
  });

  it("joins guests and returns the current playback snapshot", () => {
    const room = {
      ...createRoom().next!,
      snapshot,
    };
    const result = applyRoomAction(room, "join", {
      clientId: "guest-client-456",
      name: "Guest",
      now: 2_000,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      listeners: 2,
      snapshot,
      participants: [{ role: "host" }, { id: "guest-client-456", role: "guest" }],
    });
  });

  it("allows only the host to update playback and timestamps the update on the server", () => {
    const room = createRoom().next!;
    const guestUpdate = applyRoomAction(room, "sync", {
      clientId: "guest-client-456",
      snapshot,
      now: 3_000,
    });
    const hostUpdate = applyRoomAction(room, "sync", {
      clientId: room.hostId,
      snapshot,
      now: 3_000,
    });

    expect(guestUpdate.status).toBe(403);
    expect(hostUpdate.next?.snapshot).toEqual({ ...snapshot, sentAt: 3_000 });
    expect(hostUpdate.next?.lastHostAt).toBe(3_000);
  });

  it("removes guests on leave and closes the room when its host leaves", () => {
    const room: RoomRecord = {
      ...createRoom().next!,
      members: {
        ...createRoom().next!.members,
        "guest-client-456": { id: "guest-client-456", name: "Guest", role: "guest" },
      },
    };
    const guestLeave = applyRoomAction(room, "leave", {
      clientId: "guest-client-456",
      now: 2_000,
    });
    const hostLeave = applyRoomAction(room, "leave", {
      clientId: room.hostId,
      now: 2_000,
    });

    expect(guestLeave.next?.members["guest-client-456"]).toBeUndefined();
    expect(hostLeave.next).toBeNull();
  });

  it("expires rooms after the host stops syncing", () => {
    const room = createRoom().next!;
    const result = applyRoomAction(room, "join", {
      clientId: "guest-client-456",
      name: "Guest",
      now: 92_000,
    });

    expect(result.status).toBe(404);
    expect(result.next).toBeNull();
  });
});
