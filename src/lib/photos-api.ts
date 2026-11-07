/**
 * Photo catalog API, handled directly by the Cloudflare Worker before the
 * SSR app sees the request. Keeps the list of photos in Cloudinary itself,
 * so every visitor sees the same gallery.
 *
 * Secrets are read from the Worker environment (set in the Cloudflare
 * dashboard) and are never sent to the browser.
 */
import {
  CATEGORIES,
  CLOUDINARY_ASSET_FOLDER,
  CLOUDINARY_CLOUD_NAME,
  FEATURED_TAG,
  SITE_TAG,
  categoryTag,
  encodeAlt,
  isCategory,
  resourceToPhoto,
  type CloudinaryResource,
} from "./catalog";
import type { Category } from "../types";

export interface WorkerEnv {
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_UPLOAD_PRESET?: string;
  ADMIN_PASSWORD?: string;
}

const API_BASE = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}`;
const ALL_CATEGORY_TAGS = CATEGORIES.map(categoryTag).join(",");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function cloudinaryReady(env: WorkerEnv): boolean {
  return Boolean(env?.CLOUDINARY_API_KEY && env?.CLOUDINARY_API_SECRET);
}

function adminAllowed(request: Request, env: WorkerEnv): boolean {
  return Boolean(env?.ADMIN_PASSWORD) && request.headers.get("x-admin-key") === env.ADMIN_PASSWORD;
}

async function callCloudinary(path: string, env: WorkerEnv, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set(
    "authorization",
    `Basic ${btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`)}`,
  );
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

function formBody(fields: Record<string, string>): URLSearchParams {
  return new URLSearchParams(fields);
}

/** GET /api/photos — public, shared list of photos. */
async function listPhotos(env: WorkerEnv): Promise<Response> {
  if (!cloudinaryReady(env)) return json({ configured: false, photos: [] });

  const query = new URLSearchParams({
    asset_folder: CLOUDINARY_ASSET_FOLDER,
    tags: "true",
    context: "true",
    max_results: "500",
    direction: "desc",
  });

  const upstream = await callCloudinary(`/resources/by_asset_folder?${query}`, env);
  // Cloudinary returns 404 "Folder doesn't exist" until the first photo is
  // uploaded. That's an empty gallery, not a failure.
  if (upstream.status === 404) return json({ configured: true, photos: [] });
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error("Cloudinary list failed", upstream.status, detail);
    return json({ configured: true, error: `Cloudinary returned ${upstream.status}`, detail }, 502);
  }

  try {
    const data = (await upstream.json()) as { resources?: CloudinaryResource[] };
    return json({ configured: true, photos: (data.resources ?? []).map(resourceToPhoto) });
  } catch {
    return json({ configured: true, error: "Cloudinary returned an unreadable response" }, 502);
  }
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/** POST /api/photos — signed server-side upload, protected by the admin key. */
async function uploadPhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return json({ error: "No file supplied" }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return json({ error: "Use a JPG, PNG, WebP or AVIF image" }, 400);
  if (file.size > MAX_FILE_BYTES) return json({ error: "Image is larger than 10 MB" }, 400);

  const categoryValue = incoming.get("category");
  const category: Category = isCategory(categoryValue) ? categoryValue : "Weddings";
  const alt = String(incoming.get("alt") ?? "").trim() || "Portfolio photograph";
  const featured = incoming.get("featured") === "1";

  const tags = [SITE_TAG, categoryTag(category)];
  if (featured) tags.push(FEATURED_TAG);

  const outgoing = new FormData();
  outgoing.append("file", file);
  // Unsigned uploads are authorised by the upload preset, not by an API key.
  // Only these extra fields are allowed in an unsigned request.
  outgoing.append("upload_preset", env?.CLOUDINARY_UPLOAD_PRESET || "emgh_portfolio");
  outgoing.append("asset_folder", CLOUDINARY_ASSET_FOLDER);
  outgoing.append("tags", tags.join(","));
  outgoing.append("context", encodeAlt(alt));

  // No Authorization header here: sending one makes Cloudinary treat this as a
  // signed upload, which this product environment currently denies ("create").
  const upstream = await fetch(`${API_BASE}/image/upload`, { method: "POST", body: outgoing });
  const payload = (await upstream.json()) as Partial<CloudinaryResource> & {
    error?: { message?: string };
  };
  if (!upstream.ok) {
    return json({ error: payload.error?.message ?? `Cloudinary returned ${upstream.status}` }, 502);
  }
  return json({ photo: resourceToPhoto(payload as CloudinaryResource) });
}

/** DELETE /api/photos?publicId=... — removes the asset for real. */
async function deletePhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const publicId = new URL(request.url).searchParams.get("publicId");
  if (!publicId) return json({ error: "Missing publicId" }, 400);

  const upstream = await callCloudinary("/image/destroy", env, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody({ public_id: publicId, invalidate: "true" }),
  });
  if (!upstream.ok) return json({ error: `Cloudinary returned ${upstream.status}` }, 502);
  return json({ ok: true });
}

/** PATCH /api/photos — change category or the featured flag. */
async function updatePhoto(request: Request, env: WorkerEnv): Promise<Response> {
  let payload: { publicId?: unknown; category?: unknown; featured?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const publicId = payload.publicId;
  if (typeof publicId !== "string" || publicId === "") return json({ error: "Missing publicId" }, 400);
  if (payload.category !== undefined && !isCategory(payload.category)) {
    return json({ error: "Invalid category" }, 400);
  }

  const changes: { tag: string; command: "add" | "remove" }[] = [];
  if (isCategory(payload.category)) {
    changes.push({ tag: ALL_CATEGORY_TAGS, command: "remove" });
    changes.push({ tag: categoryTag(payload.category), command: "add" });
  }
  if (typeof payload.featured === "boolean") {
    changes.push({ tag: FEATURED_TAG, command: payload.featured ? "add" : "remove" });
  }
  if (changes.length === 0) return json({ error: "Nothing to update" }, 400);

  for (const change of changes) {
    const body = formBody({
      tag: change.tag,
      command: change.command,
      "public_ids[]": publicId,
    });
    const upstream = await callCloudinary("/image/tags", env, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!upstream.ok) return json({ error: `Cloudinary returned ${upstream.status}` }, 502);
  }

  return json({ ok: true });
}

/**
 * Returns a Response for /api/photos, or null when the request should continue
 * to the SSR app.
 */
export async function handlePhotosApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;

  // Never returns secret values — only yes/no flags for the admin page.
  if (path === "/api/admin-status" && request.method === "GET") {
    return json({
      cloudinaryReady: cloudinaryReady(env),
      adminConfigured: Boolean(env?.ADMIN_PASSWORD),
      adminValid: adminAllowed(request, env),
    });
  }

  if (path !== "/api/photos") return null;

  if (request.method === "GET") {
    try {
      return await listPhotos(env);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Cloudinary list threw", detail);
      return json({ configured: true, error: "Could not load photos", detail }, 502);
    }
  }

  if (request.method === "POST" || request.method === "DELETE" || request.method === "PATCH") {
    if (!cloudinaryReady(env)) return json({ error: "Cloudinary keys are not set up on the server yet." }, 503);
    if (!env?.ADMIN_PASSWORD) {
      return json({ error: "No ADMIN_PASSWORD is set in Cloudflare. Add it before managing photos." }, 503);
    }
    if (!adminAllowed(request, env)) {
      return json({ error: "Admin key is wrong. Check the key at the top of this page." }, 401);
    }
    try {
      if (request.method === "POST") return await uploadPhoto(request, env);
      return request.method === "DELETE" ? await deletePhoto(request, env) : await updatePhoto(request, env);
    } catch {
      return json({ error: "Cloudinary request failed" }, 502);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}
