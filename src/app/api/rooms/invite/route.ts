import { networkInterfaces } from 'node:os';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  let origin = requestUrl.origin;
  const hostname = requestUrl.hostname.replace(/^\[|\]$/g, "");
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const isWildcard = ["0.0.0.0", "::"].includes(hostname);
  if (isLoopback || isWildcard) {
    const interfaces = Object.entries(networkInterfaces()).flatMap(([name, items]) =>
      (items ?? []).map((item) => ({ name, item })),
    );
    const isVirtual = (name: string) => /virtual|vmware|vbox|hyper-v|vethernet|wsl|docker|bluetooth|loopback|vpn|tunnel/i.test(name);
    const score = (name: string) => {
      if (isVirtual(name)) return -1;
      if (/wi-?fi|wlan|wireless/i.test(name)) return 4;
      if (/^(en0|eth0)$/i.test(name)) return 3;
      if (/ethernet|^en\d+$/i.test(name)) return 2;
      return 1;
    };
    const lanAddress = interfaces
      .filter(({ name, item }) => item.family === 'IPv4' && !item.internal && score(name) >= 0)
      .sort((a, b) => score(b.name) - score(a.name))
      .at(0)?.item.address;
    const host = lanAddress ?? (isWildcard ? "127.0.0.1" : hostname);
    origin = `${requestUrl.protocol}//${host}${requestUrl.port ? `:${requestUrl.port}` : ""}`;
  }
  return Response.json({ origin });
}
