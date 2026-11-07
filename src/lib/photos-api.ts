/**
 * Photo / media catalog API, handled by the Cloudflare Worker before the SSR
 * app sees the request.
 *
 * STORAGE MODEL (Cloudflare R2)
 * ----------------------------
 * Media is stored in an R2 bucket and the gallery list is kept as a single
 * JSON file (`gallery/index.json`) in that same bucket. This is the source of
 * truth: an upload writes the object and appends to the index immediately, so
 * the photo shows on the site the moment the upload finishes. There is no
 * dependence on any external "list my assets" API — which is exactly what was
 * unreliable with the previous Cloudinary setup.
 *
 * Serving: if R2_PUBLIC_URL is set we use the bucket's public URL directly
 * (fast, CDN-cached). Otherwise media is streamed through `/cdn/<key>`, which
 * this worker serves from the same R2 binding — so it works even without a
 * public bucket configured.
 *
 * Secrets/bindings come from the Worker environment (Cloudflare dashboard):
 *   PHOTO_BUCKET  — R2 bucket binding
 *   R2_PUBLIC_URL — optional public base URL for the bucket
 *   ADMIN_PASSWORD — required to upload/edit/delete
 */

// Minimal shape of the R2 binding we use, so this compiles without the full
// @cloudflare/workers-types in every environment.
import type { Category, Photo } from "../types";
import { isCategory } from "./catalog";

interface R2ObjectBodyLike {
  body?: ReadableStream;
  text(): Promise<string>;
  json(): Promise<unknown>;
  httpMetadata?: { contentType?: string };
}
interface R2Like {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: Blob | string | null,
    opts?: { customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export interface WorkerEnv {
  PHOTO_BUCKET?: R2Like;
  R2_PUBLIC_URL?: string;
  ADMIN_PASSWORD?: string;
}

const INDEX_KEY = "gallery/index.json";
const MEDIA_PREFIX = "media/";
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB — large enough for most videos
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function storageReady(env: WorkerEnv): boolean {
  return Boolean(env?.PHOTO_BUCKET);
}

function adminAllowed(request: Request, env: WorkerEnv): boolean {
  return Boolean(env?.ADMIN_PASSWORD) && request.headers.get("x-admin-key") === env.ADMIN_PASSWORD;
}

function publicUrl(env: WorkerEnv, key: string): string {
  const base = (env?.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (base) return `${base}/${key}`;
  return `/cdn/${key}`;
}

function extFor(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
  };
  return map[mime] ?? "bin";
}

// ---------------------------------------------------------------------------
// Gallery index (source of truth, stored in the bucket)
// ---------------------------------------------------------------------------

async function readIndex(bucket: R2Like): Promise<Photo[] | null> {
  try {
    const obj = await bucket.get(INDEX_KEY);
    if (!obj) return [];
    const data = (await obj.json()) as unknown;
    return Array.isArray(data) ? (data as Photo[]) : [];
  } catch {
    return null;
  }
}

async function writeIndex(bucket: R2Like, photos: Photo[]): Promise<boolean> {
  try {
    await bucket.put(INDEX_KEY, JSON.stringify(photos, null, 2), {
      customMetadata: { updated: new Date().toISOString() },
      httpMetadata: { contentType: "application/json" },
    });
    return true;
  } catch {
    return false;
  }
}

async function getPhotos(env: WorkerEnv): Promise<Photo[]> {
  const bucket = env.PHOTO_BUCKET;
  if (!bucket) return [];
  return (await readIndex(bucket)) ?? [];
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/photos — public, shared list of media. Backed by our own index, so
 * every uploaded item appears immediately.
 */
async function listPhotos(env: WorkerEnv): Promise<Response> {
  if (!storageReady(env)) return json({ configured: false, photos: [] });
  const photos = await getPhotos(env);
  return json({ configured: true, photos });
}

/** POST /api/photos — upload, protected by the admin key. */
async function uploadPhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const bucket = env.PHOTO_BUCKET;
  if (!bucket) return json({ error: "Media storage (R2) is not configured on the server yet." }, 503);

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return json({ error: "No file supplied" }, 400);
  if (!ALLOWED_IMAGE.has(file.type) && !ALLOWED_VIDEO.has(file.type)) {
    return json({ error: "Use a JPG, PNG, WebP, AVIF, GIF image or an MP4/WebM/MOV video" }, 400);
  }
  if (file.size > MAX_FILE_BYTES) return json({ error: "File is larger than 100 MB" }, 400);

  const categoryValue = incoming.get("category");
  const category: Category = isCategory(categoryValue) ? categoryValue : "Weddings";
  const alt = String(incoming.get("alt") ?? "").trim() || "Portfolio photograph";
  const featured = incoming.get("featured") === "1";
  const isVideo = ALLOWED_VIDEO.has(file.type);

  const key = `${MEDIA_PREFIX}${crypto.randomUUID()}.${extFor(file.type)}`;
  await bucket.put(key, file, {
    customMetadata: {
      category,
      alt,
      featured: featured ? "1" : "0",
      type: isVideo ? "video" : "image",
    },
    httpMetadata: { contentType: file.type },
  });

  const photo: Photo = {
    id: key,
    publicId: key,
    url: publicUrl(env, key),
    alt,
    category,
    ratio: isVideo ? 16 / 9 : 3 / 2,
    featured,
    type: isVideo ? "video" : "image",
  };

  const idx = (await readIndex(bucket)) ?? [];
  const next = [photo, ...idx.filter((p) => p.publicId !== photo.publicId)];
  await writeIndex(bucket, next);

  return json({ photo });
}

/** DELETE /api/photos?publicId=... — removes the object and the index entry. */
async function deletePhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const bucket = env.PHOTO_BUCKET;
  if (!bucket) return json({ error: "Media storage (R2) is not configured on the server yet." }, 503);

  const publicId = new URL(request.url).searchParams.get("publicId");
  if (!publicId) return json({ error: "Missing publicId" }, 400);

  await bucket.delete(publicId);
  const idx = (await readIndex(bucket)) ?? [];
  const next = idx.filter((p) => p.publicId !== publicId);
  await writeIndex(bucket, next);
  return json({ ok: true });
}

/** PATCH /api/photos — change category or the featured flag, kept in the index. */
async function updatePhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const bucket = env.PHOTO_BUCKET;
  if (!bucket) return json({ error: "Media storage (R2) is not configured on the server yet." }, 503);

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

  const newCategory = isCategory(payload.category) ? payload.category : undefined;
  const newFeatured = typeof payload.featured === "boolean" ? payload.featured : undefined;

  const idx = (await readIndex(bucket)) ?? [];
  const next: Photo[] = idx.map((p) =>
    p.publicId === publicId
      ? {
          ...p,
          category: newCategory ?? p.category,
          featured: newFeatured ?? p.featured ?? false,
        }
      : p,
  );
  await writeIndex(bucket, next);
  return json({ ok: true });
}

/**
 * Returns a Response for /api/photos (and /cdn/* media), or null when the
 * request should continue to the SSR app.
 */
export async function handlePhotosApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;

  // Never returns secret values — only yes/no flags for the admin page.
  if (path === "/api/admin-status" && request.method === "GET") {
    return json({
      storageReady: storageReady(env),
      adminConfigured: Boolean(env?.ADMIN_PASSWORD),
      adminValid: adminAllowed(request, env),
    });
  }

  // Serve media directly from R2 when no public bucket URL is configured.
  if (path.startsWith("/cdn/")) {
    const bucket = env.PHOTO_BUCKET;
    if (!bucket) return null;
    const key = decodeURIComponent(path.slice("/cdn/".length));
    if (!key.startsWith(MEDIA_PREFIX) || key.includes("..")) return json({ error: "Not found" }, 404);
    const obj = await bucket.get(key);
    if (!obj) return json({ error: "Not found" }, 404);
    const body: BodyInit = obj.body ?? (await obj.text());
    return new Response(body, {
      headers: {
        "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (path !== "/api/photos") return null;

  if (request.method === "GET") {
    try {
      return await listPhotos(env);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Media list threw", detail);
      return json({ configured: true, error: "Could not load media", detail }, 502);
    }
  }

  if (request.method === "POST" || request.method === "DELETE" || request.method === "PATCH") {
    if (!storageReady(env)) return json({ error: "Media storage (R2) is not configured on the server yet." }, 503);
    if (!env?.ADMIN_PASSWORD) {
      return json({ error: "No ADMIN_PASSWORD is set in Cloudflare. Add it before managing media." }, 503);
    }
    if (!adminAllowed(request, env)) {
      return json({ error: "Admin key is wrong. Check the key at the top of this page." }, 401);
    }
    try {
      if (request.method === "POST") return await uploadPhoto(request, env);
      return request.method === "DELETE" ? await deletePhoto(request, env) : await updatePhoto(request, env);
    } catch {
      return json({ error: "Storage request failed" }, 502);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}
