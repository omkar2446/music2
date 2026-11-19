import { NextRequest } from 'next/server';
import { FirebaseRoomConfigError, getFirebaseRoomDatabase } from '@/lib/rooms/firebase';
import {
  isValidClientId,
  isValidRoomCode,
  parseRoomSnapshot,
  readRoomRecord,
  ROOM_HOST_TIMEOUT_MS,
  type RoomParticipant,
  type RoomRecord,
} from '@/lib/rooms/room-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidRoomCode(code)) {
    return Response.json({ message: 'Invalid room code.' }, { status: 400 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ message: 'Invalid room action.' }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const action = payload.action;
  if (action !== 'create' && action !== 'join' && action !== 'sync' && action !== 'leave') {
    return Response.json({ message: 'Invalid room action.' }, { status: 400 });
  }

  const clientId = typeof payload.clientId === 'string' ? payload.clientId : '';
  if (!isValidClientId(clientId)) {
    return Response.json({ message: 'Invalid client id.' }, { status: 400 });
  }
  const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 32) : '';
  if ((action === 'create' || action === 'join') && !name) {
    return Response.json({ message: `Enter your name to ${action} this room.` }, { status: 400 });
  }

  const snapshot = parseRoomSnapshot(payload.snapshot);
  if (action === 'sync' && !snapshot) {
    return Response.json({ message: 'Invalid playback snapshot.' }, { status: 400 });
  }

  try {
    const db = getFirebaseRoomDatabase();
    const roomRef = db.ref(`rooms/${code}`);
    const now = Date.now();

    if (action === 'create') {
      const existingSnap = await roomRef.get();
      const existing = readRoomRecord(existingSnap.val());
      const isExpired = existing && (now - existing.lastHostAt > ROOM_HOST_TIMEOUT_MS);
      if (existing && !isExpired && existing.hostId !== clientId) {
        return Response.json({ message: 'That room code is already in use.' }, { status: 409 });
      }

      const hostParticipant: RoomParticipant = { id: clientId, name, role: 'host' };
      const initialRecord: RoomRecord = {
        hostId: clientId,
        lastHostAt: now,
        snapshot: existing?.snapshot ?? null,
        members: {
          [clientId]: hostParticipant,
        },
      };
      await roomRef.set(initialRecord);
      return Response.json({
        listeners: 1,
        participants: [hostParticipant],
      }, { status: 200, headers: { 'cache-control': 'no-store' } });
    }

    if (action === 'sync') {
      const hostSnap = await roomRef.child('hostId').get();
      if (!hostSnap.exists()) {
        return Response.json({ message: 'Room not found.' }, { status: 404 });
      }
      if (hostSnap.val() !== clientId) {
        return Response.json({ message: 'Only the host can update playback.' }, { status: 403 });
      }
      await roomRef.update({
        snapshot: { ...snapshot, sentAt: now },
        lastHostAt: now,
      });
      return Response.json({ success: true }, { status: 200, headers: { 'cache-control': 'no-store' } });
    }

    // For join & leave: verify room existence
    const roomSnap = await roomRef.get();
    const current = readRoomRecord(roomSnap.val());
    if (!current) {
      return Response.json({ message: 'Room not found. Ask the host to create a new room.' }, { status: 404 });
    }
    const isExpired = now - current.lastHostAt > ROOM_HOST_TIMEOUT_MS;
    if (isExpired) {
      await roomRef.remove();
      return Response.json({ message: 'The host has disconnected. Ask them to create a new room.' }, { status: 404 });
    }

    if (action === 'join') {
      const isHost = clientId === current.hostId;
      const participant: RoomParticipant = {
        id: clientId,
        name,
        role: isHost ? 'host' : 'guest',
      };
      await roomRef.child(`members/${clientId}`).set(participant);

      const membersSnap = await roomRef.child('members').get();
      const membersVal = membersSnap.val() as Record<string, RoomParticipant> | null;
      const participants = membersVal ? Object.values(membersVal) : [participant];

      return Response.json({
        listeners: participants.length,
        participants,
        snapshot: current.snapshot,
      }, { status: 200, headers: { 'cache-control': 'no-store' } });
    }

    if (action === 'leave') {
      if (current.hostId === clientId) {
        await roomRef.remove();
      } else {
        await roomRef.child(`members/${clientId}`).remove();
      }
      return Response.json({ success: true }, { status: 200, headers: { 'cache-control': 'no-store' } });
    }

    return Response.json({ message: 'Invalid room action.' }, { status: 400 });
  } catch (error) {
    if (error instanceof FirebaseRoomConfigError) {
      return Response.json({ message: error.message }, { status: 503 });
    }
    console.error('Firebase room action failed.', error);
    return Response.json({ message: 'Firebase room service is unavailable.' }, { status: 503 });
  }
}
