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

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: WorkerEnv | undefined, ctx: unknown) {
    try {
      const workerEnv = resolveEnv(env);

      // Hide the admin panel: it must only be served on the dedicated admin
      // subdomain. Everywhere else (main domain, *.workers.dev) /admin returns 404.
      const url = new URL(request.url);
      const host = url.host.toLowerCase();
      const adminHost =
        (typeof workerEnv["ADMIN_HOST"] === "string" && workerEnv["ADMIN_HOST"]) ||
        "admin.eventsmultimediagh.com";
      const pathname = url.pathname;
      const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
      if (isAdminPath && host !== adminHost) {
        return new Response("Not Found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      // On the admin subdomain, send the bare root straight to the panel.
      if (host === adminHost && pathname === "/") {
        return Response.redirect(`${url.origin}/admin`, 302);
      }

      // Photo catalog API is handled here so it can use the Worker's private
      // secrets. Everything else goes to the SSR app.
      const apiResponse = await handlePhotosApi(request, workerEnv);
      if (apiResponse) return apiResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, workerEnv, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
