import { NextRequest } from 'next/server';
import { FirebaseRoomConfigError, getFirebaseRoomDatabase } from '@/lib/rooms/firebase';
import {
  isValidClientId,
  isValidRoomCode,
  readRoomRecord,
  type RoomRecord,
} from '@/lib/rooms/room-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const clientId = request.nextUrl.searchParams.get('clientId') ?? '';
  if (!isValidRoomCode(code) || !isValidClientId(clientId)) {
    return Response.json({ message: 'Invalid room or client id.' }, { status: 400 });
  }

  try {
    const roomRef = getFirebaseRoomDatabase().ref(`rooms/${code}`);
    const initialRoom = readRoomRecord((await roomRef.get()).val());
    if (!initialRoom?.members[clientId]) {
      return Response.json({ message: 'Join the room before connecting.' }, { status: 404 });
    }

    const encoder = new TextEncoder();
    let stop: (() => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let stopped = false;
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        let previousPresence: string | undefined;
        let previousSnapshot: string | undefined;

        const detach = () => {
          if (stopped) return;
          stopped = true;
          if (heartbeat) clearInterval(heartbeat);
          roomRef.off('value', onValue);
          request.signal.removeEventListener('abort', detach);
        };
        stop = detach;

        const emit = (event: string, value: unknown) => {
          if (stopped) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
          } catch (error) {
            console.error('Could not write Firebase room event.', error);
            detach();
          }
        };
        const finish = () => {
          if (stopped) return;
          detach();
          controller.close();
        };
        const sendRoomError = (error: unknown) => {
          console.error('Firebase room event subscription failed.', error);
          emit('room-error', { message: 'Realtime room updates are temporarily unavailable.' });
          finish();
        };
        const onValue = (snapshot: { val: () => unknown }) => {
          let room: RoomRecord | null;
          try {
            room = readRoomRecord(snapshot.val());
          } catch (error) {
            sendRoomError(error);
            return;
          }
          if (!room) {
            emit('closed', { message: 'The host ended this room.' });
            finish();
            return;
          }
          if (!room.members[clientId]) {
            emit('closed', { message: 'You are no longer in this room.' });
            finish();
            return;
          }

          const participants = Object.values(room.members);
          const presence = JSON.stringify({ listeners: participants.length, participants });
          if (presence !== previousPresence) {
            emit('presence', { listeners: participants.length, participants });
            previousPresence = presence;
          }
          if (room.snapshot) {
            const serializedSnapshot = JSON.stringify(room.snapshot);
            if (serializedSnapshot !== previousSnapshot) {
              emit('snapshot', room.snapshot);
              previousSnapshot = serializedSnapshot;
            }
          }
        };

        request.signal.addEventListener('abort', detach, { once: true });
        roomRef.on('value', onValue, sendRoomError);
        heartbeat = setInterval(() => emit('ping', Date.now()), 15_000);
        if (request.signal.aborted) detach();
      },
      cancel() {
        stop?.();
      },
    });

    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    if (error instanceof FirebaseRoomConfigError) {
      return Response.json({ message: error.message }, { status: 503 });
    }
    console.error('Firebase room stream failed.', error);
    return Response.json({ message: 'Firebase room service is unavailable.' }, { status: 503 });
  }
}
