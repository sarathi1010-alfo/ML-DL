/**
 * LLM Mini-Service
 * ----------------
 * A small HTTP service that exposes the z-ai-web-dev-sdk LLM as a simple
 * REST endpoint. It is called by the FastAPI backend (RAG answer synthesis
 * + Agentic HR reasoning) directly via http://localhost:3003.
 *
 * Port: 3003 (fixed)
 * Entry: bun --hot index.ts  (auto-restarts on file change)
 *
 * Endpoints:
 *   GET  /health        -> { status, model, uptime_s }
 *   POST /llm/chat      -> { prompt, system?, messages?, max_tokens? }
 *                          -> { response, latency_ms, tokens, model }
 */

import ZAI from 'z-ai-web-dev-sdk';

const PORT = 3003;
const startTime = Date.now();

let zaiInstance = null;
let initError = null;
let initPromise = (async () => {
  try {
    zaiInstance = await ZAI.create();
    console.log('[llm-service] ZAI SDK initialized');
  } catch (e) {
    initError = e;
    console.error('[llm-service] ZAI SDK init failed:', e?.message || e);
  }
})();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders,
    },
  });
}

async function handleChat(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { prompt, system, messages, max_tokens } = body || {};

  // Build the messages array. Prefer explicit messages, else build from prompt+system.
  let msgs;
  if (Array.isArray(messages) && messages.length) {
    msgs = messages;
  } else {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return json({ error: "Field 'prompt' (string) or 'messages' (array) is required" }, 400);
    }
    msgs = [
      { role: 'assistant', content: system || 'You are a helpful, concise AI assistant.' },
      { role: 'user', content: prompt },
    ];
  }

  // Ensure SDK ready
  await initPromise;
  if (!zaiInstance) {
    return json(
      { error: 'LLM SDK unavailable', detail: initError?.message || 'not initialized' },
      503
    );
  }

  const t0 = performance.now();
  try {
    const completion = await zaiInstance.chat.completions.create({
      messages: msgs,
      thinking: { type: 'disabled' },
      ...(max_tokens ? { max_tokens } : {}),
    });

    const response = completion?.choices?.[0]?.message?.content ?? '';
    const tokens =
      completion?.usage?.total_tokens ??
      Math.ceil(msgs.reduce((a, m) => a + (m.content?.length || 0), 0) / 4);

    return json({
      response,
      latency_ms: Math.round(performance.now() - t0),
      tokens,
      model: completion?.model || 'zai-llm',
      finish_reason: completion?.choices?.[0]?.finish_reason || 'stop',
    });
  } catch (e) {
    return json(
      { error: 'LLM completion failed', detail: e?.message || String(e) },
      502
    );
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({
        status: zaiInstance ? 'ok' : 'initializing',
        service: 'llm-service',
        model: 'zai-llm',
        uptime_s: Math.round((Date.now() - startTime) / 1000),
      });
    }

    if (req.method === 'POST' && (url.pathname === '/llm/chat' || url.pathname === '/chat')) {
      return handleChat(req);
    }

    // ── API proxy: forward /api/v1/* to the FastAPI backend on localhost:8000 ──
    // The public gateway can reach this service (port 3003) but NOT FastAPI
    // (port 8000) directly. So all frontend API calls are routed through here.
    if (url.pathname.startsWith('/api/')) {
      return proxyToBackend(req, url);
    }

    return json({ error: 'Not found', path: url.pathname }, 404);
  },
});

// ── Proxy /api/* to FastAPI at http://localhost:8000 ──
const BACKEND = 'http://21.0.19.237:8000';

async function proxyToBackend(req: Request, url: URL): Promise<Response> {
  // Strip the gateway-only XTransformPort query param
  const sp = new URLSearchParams(url.searchParams);
  sp.delete('XTransformPort');
  const qs = sp.toString();
  const target = `${BACKEND}${url.pathname}${qs ? '?' + qs : ''}`;

  // Forward headers except host/connection/content-length (fetch sets its own)
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'connection' || lk === 'content-length') return;
    headers.set(k, v);
  });

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    // @ts-expect-error duplex is required for streaming bodies in undici/Bun
    init.duplex = 'half';
  }

  try {
    const upstream = await fetch(target, init);
    const respHeaders = new Headers();
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (lk === 'content-encoding' || lk === 'content-length' || lk === 'transfer-encoding') return;
      respHeaders.set(k, v);
    });
    // CORS for browser
    respHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(
      { detail: `Backend unreachable: ${msg}`, error_code: 'PROXY_ERROR', status_code: 502 },
      502
    );
  }
}

console.log(`[llm-service] listening on http://localhost:${PORT} (proxying /api/* → ${BACKEND})`);
