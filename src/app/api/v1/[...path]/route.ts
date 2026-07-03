import { NextRequest, NextResponse } from 'next/server';
const BACKEND = 'http://localhost:8000';
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const sp = new URLSearchParams(req.nextUrl.searchParams);
  sp.delete('XTransformPort');
  const qs = sp.toString();
  const url = `${BACKEND}/api/v1/${path.join('/')}${qs ? '?' + qs : ''}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => { const lk = k.toLowerCase(); if (lk !== 'host' && lk !== 'connection' && lk !== 'content-length') headers.set(k, v); });
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = req.body as unknown as BodyInit; (init as any).duplex = 'half'; }
  try {
    const up = await fetch(url, init);
    const h = new Headers(); up.headers.forEach((v, k) => { const lk = k.toLowerCase(); if (lk !== 'content-encoding' && lk !== 'content-length' && lk !== 'transfer-encoding') h.set(k, v); });
    return new NextResponse(up.body, { status: up.status, headers: h });
  } catch (e: unknown) { const m = e instanceof Error ? e.message : String(e); return NextResponse.json({ detail: `Backend unreachable: ${m}`, error_code: 'PROXY_ERROR' }, { status: 502 }); }
}
export const GET = (r: NextRequest, c: { params: Promise<{ path: string[] }> }) => proxy(r, c);
export const POST = (r: NextRequest, c: { params: Promise<{ path: string[] }> }) => proxy(r, c);
export const PUT = (r: NextRequest, c: { params: Promise<{ path: string[] }> }) => proxy(r, c);
export const DELETE = (r: NextRequest, c: { params: Promise<{ path: string[] }> }) => proxy(r, c);
export const PATCH = (r: NextRequest, c: { params: Promise<{ path: string[] }> }) => proxy(r, c);
