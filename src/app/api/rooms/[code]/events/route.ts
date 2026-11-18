import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const base = (process.env.JIOSAAVN_API_BASE_URL ?? 'http://127.0.0.1:3101').replace(/\/$/, '');
  const clientId = request.nextUrl.searchParams.get('clientId') ?? '';
  try {
    const upstream = await fetch(`${base}/rooms/${encodeURIComponent(code)}/events?clientId=${encodeURIComponent(clientId)}`, {
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
