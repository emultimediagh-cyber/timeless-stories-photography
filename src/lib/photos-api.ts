/**
 * Photo catalog API, handled directly by the Cloudflare Worker before the
 * SSR app sees the request.
 *
 * ROBUSTNESS MODEL
 * ---------------
 * Cloudinary's Admin *listing* API is eventually consistent and, in this
 * account, has proven unreliable: uploads succeed but the listing query
 * returns an empty `resources` array even though assets exist
 * (`total_count` says 2, `resources` is []). Relying on it as the source of
 * truth is what made "it uploads but doesn't show" happen.
 *
 * So we keep our OWN authoritative index of the gallery. It is stored as a
 * single JSON file in Cloudinary (a raw asset, `emgh_gallery_index`), written
 * the moment a photo is uploaded and read back on every listing. The listing
 * therefore reflects exactly what we uploaded — instantly and consistently.
 * No new Cloudflare binding is required; we already have the Cloudinary keys.
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
import type { Category, Photo } from "../types";

export interface WorkerEnv {
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_UPLOAD_PRESET?: string;
  ADMIN_PASSWORD?: string;
}

const API_BASE = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}`;

/**
 * The gallery index is a JSON file stored as a raw Cloudinary asset. Its public
 * delivery URL is predictable and public (it only contains data the site
 * already exposes), while only server-side signed writes can overwrite it.
 */
const INDEX_PUBLIC_ID = "emgh_gallery_index";
const INDEX_DELIVERY = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/raw/upload/${INDEX_PUBLIC_ID}`;

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

// ---------------------------------------------------------------------------
// Gallery index (our source of truth)
// ---------------------------------------------------------------------------

type ManifestRead =
  | { state: "ok"; photos: Photo[] }
  | { state: "absent" } // index asset does not exist yet
  | { state: "error" }; // transient read failure

/** Read the authoritative gallery index from its public delivery URL. */
async function readManifest(): Promise<ManifestRead> {
  try {
    const res = await fetch(`${INDEX_DELIVERY}?cb=${Date.now()}`, { cache: "no-store" });
    if (res.status === 404) return { state: "absent" };
    if (!res.ok) return { state: "error" };
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return { state: "absent" };
    return { state: "ok", photos: data as Photo[] };
  } catch {
    return { state: "error" };
  }
}

/** Write the gallery index back to Cloudinary (signed raw upload, overwrite). */
async function writeManifest(env: WorkerEnv, photos: Photo[]): Promise<boolean> {
  try {
    const blob = new Blob([JSON.stringify(photos)], { type: "application/json" });
    const fd = new FormData();
    fd.append("file", blob, "index.json");
    fd.append("public_id", INDEX_PUBLIC_ID);
    fd.append("overwrite", "true");
    fd.append("invalidate", "true");
    fd.append("resource_type", "raw");
    const res = await callCloudinary("/raw/upload", env, { method: "POST", body: fd });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Build a gallery index from Cloudinary directly. Used to seed the index the
 * first time, and as a fallback when the index can't be read. Uses the reliable
 * Search API rather than the broken folder listing.
 */
async function seedFromCloudinary(env: WorkerEnv): Promise<{ photos: Photo[]; raw: string }> {
  const expression = `folder:"${CLOUDINARY_ASSET_FOLDER}" OR tags:"${SITE_TAG}"`;
  const photos: Photo[] = [];
  const rawChunks: string[] = [];
  let nextCursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({
      expression,
      max_results: "500",
      tags: "true",
      context: "true",
      direction: "desc",
    });
    if (nextCursor) q.set("next_cursor", nextCursor);

    const res = await callCloudinary(`/resources/search?${q}`, env);
    if (!res.ok) {
      rawChunks.push(`[page ${page} status ${res.status}]`);
      break;
    }
    const data = (await res.json()) as {
      resources?: CloudinaryResource[];
      next_cursor?: string;
    };
    rawChunks.push(`[page ${page} count ${(data.resources ?? []).length}]`);
    for (const r of data.resources ?? []) photos.push(resourceToPhoto(r));
    if (!data.next_cursor) break;
    nextCursor = data.next_cursor;
  }

  const seen = new Set<string>();
  const deduped = photos.filter((p) =>
    seen.has(p.id) ? false : (seen.add(p.id), true),
  );
  return { photos: deduped, raw: rawChunks.join(" ") };
}

/**
 * In-memory cache used only as a safety net: if the persisted index can't be
 * written (e.g. Cloudinary denies the signed raw upload) we still avoid
 * hammering the Search API on every request. It is per-worker-instance and
 * short-lived, so it never becomes the source of truth.
 */
const SEED_CACHE_TTL_MS = 60_000;
let seedCache: { at: number; photos: Photo[] } | null = null;

function seedCacheGet(): Photo[] | null {
  if (!seedCache) return null;
  if (Date.now() - seedCache.at > SEED_CACHE_TTL_MS) {
    seedCache = null;
    return null;
  }
  return seedCache.photos;
}
function seedCacheSet(photos: Photo[]): void {
  seedCache = { at: Date.now(), photos };
}

/**
 * Read the gallery. If the index exists, use it. If it's missing, seed it from
 * Cloudinary and persist it. If the index read fails transiently, or the
 * persist fails, fall back to a Search-API read (cached briefly) without
 * clobbering a possibly-good index.
 */
async function getPhotos(env: WorkerEnv): Promise<{ photos: Photo[]; source: string; seedRaw?: string }> {
  const manifest = await readManifest();
  if (manifest.state === "ok") return { photos: manifest.photos, source: "manifest" };

  const seeded = await seedFromCloudinary(env);

  if (manifest.state === "absent") {
    // Only write when we know the index is genuinely missing (404), so we never
    // overwrite a good index with a possibly-incomplete seed.
    const wrote = await writeManifest(env, seeded.photos);
    if (wrote) return { photos: seeded.photos, source: "seeded", seedRaw: seeded.raw };
  }

  // Persist failed (or transient read error): serve the live result, cached.
  const cached = seedCacheGet();
  if (cached) return { photos: cached, source: "seeded-cache" };
  seedCacheSet(seeded.photos);
  return { photos: seeded.photos, source: "seeded-live", seedRaw: seeded.raw };
}

/** Resolve the current index, always returning a concrete array to mutate. */
async function resolveBaseForWrite(env: WorkerEnv): Promise<Photo[]> {
  const manifest = await readManifest();
  if (manifest.state === "ok") return manifest.photos;
  // absent or transient error: seed so we never lose existing photos
  return (await seedFromCloudinary(env)).photos;
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/photos — public, shared list of photos. Backed by our own index so
 * every uploaded photo appears immediately.
 */
async function listPhotos(request: Request, env: WorkerEnv): Promise<Response> {
  if (!cloudinaryReady(env)) return json({ configured: false, photos: [] });

  const debug = new URL(request.url).searchParams.get("debug") === "1";
  const { photos, source, seedRaw } = await getPhotos(env);

  return json({
    configured: true,
    photos,
    ...(debug
      ? {
          debug: {
            source,
            indexUrl: INDEX_DELIVERY,
            count: photos.length,
            seedRaw: seedRaw ?? "",
            firstFew: photos.slice(0, 5).map((p) => ({ publicId: p.publicId, category: p.category })),
          },
        }
      : {}),
  });
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

  const photo = resourceToPhoto(payload as CloudinaryResource);

  // Write to our index immediately so it shows on the site right away.
  const base = await resolveBaseForWrite(env);
  const next = [photo, ...base.filter((p) => p.publicId !== photo.publicId)];
  await writeManifest(env, next);

  return json({ photo });
}

/** DELETE /api/photos?publicId=... — removes the asset for real and from the index. */
async function deletePhoto(request: Request, env: WorkerEnv): Promise<Response> {
  const publicId = new URL(request.url).searchParams.get("publicId");
  if (!publicId) return json({ error: "Missing publicId" }, 400);

  const upstream = await callCloudinary("/image/destroy", env, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody({ public_id: publicId, invalidate: "true" }),
  });
  if (!upstream.ok) return json({ error: `Cloudinary returned ${upstream.status}` }, 502);

  const base = await resolveBaseForWrite(env);
  const next = base.filter((p) => p.publicId !== publicId);
  await writeManifest(env, next);

  return json({ ok: true });
}

/** PATCH /api/photos — change category or the featured flag, kept in the index. */
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

  const newCategory = isCategory(payload.category) ? payload.category : undefined;
  const newFeatured =
    typeof payload.featured === "boolean" ? payload.featured : undefined;

  // Best-effort: keep Cloudinary's own tags in sync too.
  const changes: { tag: string; command: "add" | "remove" }[] = [];
  if (newCategory) {
    changes.push({ tag: ALL_CATEGORY_TAGS, command: "remove" });
    changes.push({ tag: categoryTag(newCategory), command: "add" });
  }
  if (newFeatured !== undefined) {
    changes.push({ tag: FEATURED_TAG, command: newFeatured ? "add" : "remove" });
  }
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

  // Update the index — this is what the site actually reads.
  const base = await resolveBaseForWrite(env);
  const next: Photo[] = base.map((p) =>
    p.publicId === publicId
      ? {
          ...p,
          category: newCategory ?? p.category,
          featured: newFeatured ?? p.featured ?? false,
        }
      : p,
  );
  await writeManifest(env, next);

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
      return await listPhotos(request, env);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Photo list threw", detail);
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
