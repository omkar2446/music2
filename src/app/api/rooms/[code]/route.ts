import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const apiBase = () => (process.env.JIOSAAVN_API_BASE_URL ?? 'http://127.0.0.1:3101').replace(/\/$/, '');
type Context = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const { code } = await params;
  const body = await request.json().catch(() => null) as { action?: string } | null;
  if (!body?.action || !['create', 'join', 'sync', 'leave'].includes(body.action)) {
    return Response.json({ message: 'Invalid room action.' }, { status: 400 });
  }
  try {
    const response = await fetch(`${apiBase()}/rooms/${encodeURIComponent(code)}/${body.action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
    });
    return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ message: 'Room service is unreachable. Start the music API and try again.' }, { status: 503 });
  }
}

export async function GET(request: NextRequest, { params }: Context) {
  const { code } = await params;
  const clientId = request.nextUrl.searchParams.get('clientId') ?? '';
  try {
    const upstream = await fetch(`${apiBase()}/rooms/${encodeURIComponent(code)}/events?clientId=${encodeURIComponent(clientId)}`, {
      headers: { accept: 'text/event-stream' }, cache: 'no-store', signal: request.signal,
    });
    return new Response(upstream.body, { status: upstream.status, headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no',
    } });
  } catch {
    return Response.json({ message: 'Room service is unreachable.' }, { status: 503 });
  }
}
