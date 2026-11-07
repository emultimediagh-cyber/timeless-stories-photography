/**
 * Cloudinary delivery + unsigned upload helpers.
 *
 * CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET are public identifiers —
 * an unsigned preset name is discoverable in client-side code by design.
 * The API Secret is deliberately NOT here and must never be committed or
 * embedded in browser code.
 *
 * Both values can be overridden at build time with VITE_* env vars.
 */

export const CLOUDINARY_CLOUD_NAME: string =
  import.meta.env["VITE_CLOUDINARY_CLOUD_NAME"] || "i98tepgb";

export const CLOUDINARY_UPLOAD_PRESET: string =
  import.meta.env["VITE_CLOUDINARY_UPLOAD_PRESET"] || "emgh_portfolio";

/** Folder configured on the `emgh_portfolio` upload preset. */
export const CLOUDINARY_ASSET_FOLDER = "events-multimedia-gh";

const UPLOAD_ENDPOINT = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const DELIVERY_MARKER = "/image/upload/";

/** Client-side guard — unsigned presets cannot enforce a per-file size limit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export const RESPONSIVE_WIDTHS = [400, 640, 800, 1024, 1280, 1600, 2000] as const;

export interface DeliveryOptions {
  width?: number;
  height?: number;
  crop?: "limit" | "fill" | "scale";
  gravity?: string;
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
}

function isCloudinarySource(source: string): boolean {
  return source.includes(`res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}${DELIVERY_MARKER}`);
}

function buildTransformation(opts: DeliveryOptions): string {
  const parts = ["f_auto", "q_auto"];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  if (opts.crop) parts.push(`c_${opts.crop}`);
  if (opts.gravity) parts.push(`g_${opts.gravity}`);
  return parts.join(",");
}

/**
 * Keep only the `v<version>/<public_id>` part of a delivery URL so we never
 * stack a new transformation chain on top of an already-transformed URL.
 * Dynamic folder mode means the folder is metadata, not part of the URL —
 * that's why we preserve the exact tail Cloudinary returned instead of
 * rebuilding it from a folder path.
 */
function versionedTail(tail: string): string {
  const match = tail.match(/v\d+\//);
  if (match && match.index !== undefined) return tail.slice(match.index);
  return tail;
}

/**
 * Build an optimized Cloudinary delivery URL.
 *
 * Accepts a full `secure_url` (what the upload API returns), a bare public ID,
 * or any other URL. Non-Cloudinary URLs pass through untouched so the Unsplash
 * seed placeholders keep working until real photos have been uploaded.
 */
export function cloudinaryUrl(source: string, opts: DeliveryOptions = {}): string {
  if (!isCloudinarySource(source)) {
    if (source.trim() !== "" && !source.startsWith("http") && !source.startsWith("data:")) {
      return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}${DELIVERY_MARKER}${buildTransformation(opts)}/${source}`;
    }
    return source;
  }

  const index = source.indexOf(DELIVERY_MARKER);
  if (index === -1) return source;
  const at = index + DELIVERY_MARKER.length;
  return `${source.slice(0, at)}${buildTransformation(opts)}/${versionedTail(source.slice(at))}`;
}

/** Responsive srcset for Cloudinary assets; undefined for placeholder URLs. */
export function cloudinarySrcSet(source: string): string | undefined {
  if (!isCloudinarySource(source)) return undefined;
  return RESPONSIVE_WIDTHS.map(
    (width) => `${cloudinaryUrl(source, { width, crop: "limit" })} ${width}w`,
  ).join(", ");
}

export function validateImageFile(file: File): string | undefined {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Please choose a JPG, PNG, WebP or AVIF image.";
  if (file.size > MAX_UPLOAD_BYTES) return "Image is larger than 10 MB. Please resize it first.";
  return undefined;
}

/** Upload straight from the browser using the unsigned `emgh_portfolio` preset. */
export async function uploadImageToCloudinary(file: File): Promise<CloudinaryUploadResult> {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  // The asset folder is fixed by the preset; unsigned uploads cannot override it.

  const response = await fetch(UPLOAD_ENDPOINT, { method: "POST", body: form });
  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // keep the status-based message
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as {
    secure_url: string;
    public_id: string;
    width: number;
    height: number;
    format: string;
  };

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    width: payload.width,
    height: payload.height,
    format: payload.format,
  };
}
