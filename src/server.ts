import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handlePhotosApi, type WorkerEnv } from "./lib/photos-api";

type ServerEntry = {
  fetch: (request: Request, env: WorkerEnv, ctx: unknown) => Promise<Response> | Response;
};

/**
 * Nitro's Cloudflare runtime saves the Worker bindings on globalThis.__env__
 * at the start of every request, but its Vite service loader calls our fetch
 * handler with an env that may be empty or partial. Merge both sources so
 * secrets and bindings (KV, R2, etc.) are always available.
 */
type EnvGlobal = typeof globalThis & { __env__?: WorkerEnv };

function resolveEnv(env: WorkerEnv | undefined): WorkerEnv {
  const globalEnv = (globalThis as EnvGlobal).__env__ ?? {};
  // Merge: globalEnv provides bindings/secrets that Nitro didn't pass directly.
  // env (if provided) takes precedence for keys it actually has.
  return { ...globalEnv, ...(env ?? {}) };
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * A cryptographic, per-request nonce used by both the CSP header and React's
 * inline <script>/<style> tags. Keeping them identical lets us run a strict
 * `script-src`/`style-src` (no `'unsafe-inline'`) while still allowing the
 * framework's own inline hydration code.
 */
function makeNonce(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Copy the incoming request but inject the CSP nonce as a private request
 * header. The TanStack request middleware reads it to tag the SSR inline
 * scripts, and this same value is later written into the response CSP header.
 */
function withCspNonce(request: Request, nonce: string): Request {
  const headers = new Headers(request.headers);
  headers.set("x-csp-nonce", nonce);
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: request.redirect,
  };
  if (request.body !== null) {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(request.url, init);
}

/** Hardening headers applied to every response leaving the Worker. */
function buildSecurityHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com 'unsafe-inline'`,
    "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
    "media-src 'self' https://res.cloudinary.com blob:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' https://api.cloudinary.com https://res.cloudinary.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    // Two years; covers every current/future subdomain (site is HTTPS-only).
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": [
      "accelerometer=()",
      "ambient-light-sensor=()",
      "autoplay=()",
      "battery=()",
      "camera=()",
      "display-capture=()",
      "document-domain=()",
      "encrypted-media=()",
      "fullscreen=()",
      "geolocation=()",
      "gyroscope=()",
      "hid=()",
      "idle-detection=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-get=()",
      "screen-wake-lock=()",
      "speaker-selection=()",
      "sync-xhr=()",
      "usb=()",
      "web-share=()",
      "xr-spatial-tracking=()",
    ].join(", "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

function applySecurityHeaders(response: Response, nonce: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(buildSecurityHeaders(nonce))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: WorkerEnv | undefined, ctx: unknown) {
    const nonce = makeNonce();
    try {
      const workerEnv = resolveEnv(env);

      // Photo catalog API is handled here so it can use the Worker's private
      // secrets. Everything else goes to the SSR app.
      const secured = withCspNonce(request, nonce);
      const apiResponse = await handlePhotosApi(secured, workerEnv);
      if (apiResponse) return applySecurityHeaders(apiResponse, nonce);

      const handler = await getServerEntry();
      const response = await handler.fetch(secured, workerEnv, ctx);
      const final = await normalizeCatastrophicSsrResponse(response);
      return applySecurityHeaders(final, nonce);
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        nonce,
      );
    }
  },
};
