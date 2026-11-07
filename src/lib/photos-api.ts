/**
 * Photo / media catalog API, handled by the Cloudflare Worker before the SSR
 * app sees the request.
 *
 * STORAGE MODEL (Cloudinary storage + Cloudflare KV index)
 * ---------------------------------------------------------
 * Media files (images AND videos) are uploaded to Cloudinary via the unsigned
 * upload preset — this already works and serves from Cloudinary's CDN.
 *
 * The gallery LIST is kept in a Cloudflare KV namespace as a single JSON value
 * (`gallery`). This is the source of truth the site reads. Every upload appends
 * to it immediately, so the photo shows the moment the upload finishes.
 *
 * We do NOT rely on Cloudinary's listing/Search API — that was unreliable
 * (returned total_count>0 but empty resources[]).
 *
 * Environment (Cloudflare dashboard → Workers & Pages → events-multimedia-gh):
 *   GALLERY_KV     — KV namespace binding (free, no credit card needed)
 *   ADMIN_PASSWORD  — required to upload/edit/delete
 *
 * Cloudinary credentials (already set as secrets):
 *   CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET — used for signed delete
 *   CLOUDINARY_CLOUD_NAME                     — public, in catalog.ts
 *   CLOUDINARY_UPLOAD_PRESET                  — optional override of "emgh_portfolio"
 */

import type { Category, Photo } from "../types";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_ASSET_FOLDER,
  isCategory,
} from "./catalog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal KV interface — the binding we expect from Cloudflare. */
interface KVLike {
  get(key: string, options?: { type?: "text" | "json" }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface WorkerEnv {
  GALLERY_KV?: KVLike;
  ADMIN_PASSWORD?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_UPLOAD_PRESET?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KV_KEY = "gallery";
const UPLOAD_PRESET_DEFAULT = "emgh_portfolio";
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function storageReady(env: WorkerEnv): boolean {
  return Boolean(env?.GALLERY_KV);
}

function adminAllowed(request: Request, env: WorkerEnv): boolean {
  return Boolean(env?.ADMIN_PASSWORD) && request.headers.get("x-admin-key") === env.ADMIN_PASSWORD;
}

function uploadPreset(env: WorkerEnv): string {
  return env?.CLOUDINARY_UPLOAD_PRESET || UPLOAD_PRESET_DEFAULT;
}

/** Build the Basic auth header for Cloudinary Admin API calls. */
function cloudinaryAuthHeader(env: WorkerEnv): string | null {
  if (!env?.CLOUDINARY_API_KEY || !env?.CLOUDINARY_API_SECRET) return null;
  return "Basic " + btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`);
}

/** Cloudinary's upload endpoint (same for images and videos). */
function cloudinaryUploadUrl(): string {
  return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
}

/** Cloudinary's delivery URL base for the /image/upload/ path. */
function cloudinaryDeliveryBaseUrl(): string {
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}`;
}

// ---------------------------------------------------------------------------
// Gallery index (source of truth — stored in KV)
// ---------------------------------------------------------------------------

async function readIndex(kv: KVLike): Promise<Photo[] | null> {
  try {
    const raw = await kv.get(KV_KEY, { type: "text" });
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as Photo[]) : [];
  } catch {
    return null;
  }
}

async function writeIndex(kv: KVLike, photos: Photo[]): Promise<boolean> {
  try {
    await kv.put(KV_KEY, JSON.stringify(photos));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Upload to Cloudinary (unsigned preset — works for both images and videos)
// ---------------------------------------------------------------------------

interface CloudinaryUploadResponse {
  public_id: string;
  secure_url: string;
  secure_url_video?: string; // not standard, but we check just in case
  url: string;
  width?: number;
  height?: number;
  bytes?: number;
  resource_type?: string;
  error?: { message?: string };
}

async function uploadToCloudinary(
  file: File,
  env: WorkerEnv,
  metadata: { alt: string; category: Category; featured: boolean },
): Promise<CloudinaryUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset(env));
  form.append("asset_folder", CLOUDINARY_ASSET_FOLDER);
  form.append("context", `alt=${encodeURIComponent(metadata.alt)}`);
  // Tags carry category + featured so they're queryable later if needed.
  const tags = ["emgh", `cat_${metadata.category.toLowerCase()}`];
  if (metadata.featured) tags.push("featured");
  form.append("tags", tags.join(","));

  const response = await fetch(cloudinaryUploadUrl(), {
    method: "POST",
    body: form,
  });

  const data = (await response.json()) as CloudinaryUploadResponse;
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? `Cloudinary upload failed (${response.status})`);
  }
  return data;
}

/** Delete an asset from Cloudinary via the signed Admin API. */
async function deleteFromCloudinary(publicId: string, env: WorkerEnv): Promise<boolean> {
  const auth = cloudinaryAuthHeader(env);
  if (!auth) return false; // can't delete without API key/secret — but still remove from index

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: auth,
        },
        body: JSON.stringify({ public_id: publicId, invalidate: true }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/photos — public, shared list of media. Reads from our KV index,
 * so every uploaded item appears immediately.
 */
async function listPhotos(env: WorkerEnv): Promise<Response> {
  if (!storageReady(env)) return json({ configured: false, photos: [] });
  const kv = env.GALLERY_KV!;
  const photos = (await readIndex(kv)) ?? [];
  return json({ configured: true, photos });
}

/** POST /api/photos — upload to Cloudinary, then append to KV index. */
async function uploadPhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const kv = env.GALLERY_KV;
  if (!kv) return json({ error: "Gallery storage (KV) is not configured on the server yet." }, 503);

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

  // 1. Upload the file to Cloudinary.
  const uploaded = await uploadToCloudinary(file, env, { alt, category, featured });

  // Cloudinary returns secure_url for both images and videos.
  // For videos, the URL uses /video/upload/ instead of /image/upload/.
  const url = uploaded.secure_url ?? uploaded.url;
  const width = uploaded.width ?? 0;
  const height = uploaded.height ?? 0;

  const photo: Photo = {
    id: uploaded.public_id,
    publicId: uploaded.public_id,
    url,
    alt,
    category,
    ratio: width > 0 && height > 0 ? width / height : isVideo ? 16 / 9 : 3 / 2,
    featured,
    type: isVideo ? "video" : "image",
  };

  // 2. Append to our KV index — this is what the site reads.
  const idx = (await readIndex(kv)) ?? [];
  const next = [photo, ...idx.filter((p) => p.publicId !== photo.publicId)];
  await writeIndex(kv, next);

  return json({ photo });
}

/** DELETE /api/photos?publicId=... — removes from Cloudinary + KV index. */
async function deletePhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const kv = env.GALLERY_KV;
  if (!kv) return json({ error: "Gallery storage (KV) is not configured on the server yet." }, 503);

  const publicId = new URL(request.url).searchParams.get("publicId");
  if (!publicId) return json({ error: "Missing publicId" }, 400);

  // Try to delete from Cloudinary (best-effort — index removal is what matters for the site).
  await deleteFromCloudinary(publicId, env);

  const idx = (await readIndex(kv)) ?? [];
  const next = idx.filter((p) => p.publicId !== publicId);
  await writeIndex(kv, next);
  return json({ ok: true });
}

/** PATCH /api/photos — change category or featured flag (KV index only). */
async function updatePhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const kv = env.GALLERY_KV;
  if (!kv) return json({ error: "Gallery storage (KV) is not configured on the server yet." }, 503);

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

  const idx = (await readIndex(kv)) ?? [];
  const next: Photo[] = idx.map((p) =>
    p.publicId === publicId
      ? {
          ...p,
          category: newCategory ?? p.category,
          featured: newFeatured ?? p.featured ?? false,
        }
      : p,
  );
  await writeIndex(kv, next);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Returns a Response for /api/photos, or null when the request should
 * continue to the SSR app.
 */
export async function handlePhotosApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;

  // Admin status — never returns secret values, only yes/no flags.
  if (path === "/api/admin-status" && request.method === "GET") {
    return json({
      storageReady: storageReady(env),
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
      console.error("Media list threw", detail);
      return json({ configured: true, error: "Could not load media", detail }, 502);
    }
  }

  if (request.method === "POST" || request.method === "DELETE" || request.method === "PATCH") {
    if (!storageReady(env)) {
      return json({ error: "Gallery storage (KV) is not configured on the server yet." }, 503);
    }
    if (!env?.ADMIN_PASSWORD) {
      return json({ error: "No ADMIN_PASSWORD is set in Cloudflare. Add it before managing media." }, 503);
    }
    if (!adminAllowed(request, env)) {
      return json({ error: "Admin key is wrong. Check the key at the top of this page." }, 401);
    }
    try {
      if (request.method === "POST") return await uploadPhoto(request, env);
      return request.method === "DELETE" ? await deletePhoto(request, env) : await updatePhoto(request, env);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Storage request failed";
      return json({ error: detail }, 502);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}
