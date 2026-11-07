/**
 * Cloudinary delivery helpers (browser-side).
 *
 * Only the public cloud name lives here. Uploading, deleting and editing photos
 * all go through /api/photos in the Worker, where the API Key and Secret stay
 * private. Never put a Cloudinary secret in this file.
 */
import { CLOUDINARY_ASSET_FOLDER, CLOUDINARY_CLOUD_NAME as DEFAULT_CLOUD_NAME } from "./catalog";

export { CLOUDINARY_ASSET_FOLDER };

export const CLOUDINARY_CLOUD_NAME: string =
  import.meta.env["VITE_CLOUDINARY_CLOUD_NAME"] || DEFAULT_CLOUD_NAME;

const DELIVERY_MARKER = "/image/upload/";
const VIDEO_MARKER = "/video/upload/";

export const RESPONSIVE_WIDTHS = [400, 640, 800, 1024, 1280, 1600, 2000] as const;

export interface DeliveryOptions {
  width?: number;
  height?: number;
  crop?: "limit" | "fill" | "scale";
  gravity?: string;
}

function isCloudinarySource(source: string): boolean {
  const base = `res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}`;
  return source.includes(`${base}${DELIVERY_MARKER}`) || source.includes(`${base}${VIDEO_MARKER}`);
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
 * stack a transformation chain on top of an already-transformed URL.
 * Dynamic folder mode means the folder is metadata, not part of the URL —
 * that's why we preserve the exact tail Cloudinary returned.
 */
function versionedTail(tail: string): string {
  const match = tail.match(/v\d+\//);
  if (match && match.index !== undefined) return tail.slice(match.index);
  return tail;
}

/**
 * Build an optimized Cloudinary delivery URL.
 * Non-Cloudinary URLs pass through untouched, so the Unsplash sample photos
 * keep working until real photos have been uploaded.
 */
export function cloudinaryUrl(source: string, opts: DeliveryOptions = {}): string {
  if (!isCloudinarySource(source)) {
    if (source.trim() !== "" && !source.startsWith("http") && !source.startsWith("data:")) {
      return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}${DELIVERY_MARKER}${buildTransformation(opts)}/${source}`;
    }
    return source;
  }

  // Try image marker first, then video marker.
  const imgIdx = source.indexOf(DELIVERY_MARKER);
  const vidIdx = source.indexOf(VIDEO_MARKER);
  let marker: string;
  let index: number;
  if (imgIdx !== -1) {
    marker = DELIVERY_MARKER;
    index = imgIdx;
  } else if (vidIdx !== -1) {
    marker = VIDEO_MARKER;
    index = vidIdx;
  } else {
    return source;
  }
  const at = index + marker.length;
  return `${source.slice(0, at)}${buildTransformation(opts)}/${versionedTail(source.slice(at))}`;
}

/** Responsive srcset for Cloudinary assets; undefined for placeholder URLs. */
export function cloudinarySrcSet(source: string): string | undefined {
  if (!isCloudinarySource(source)) return undefined;
  return RESPONSIVE_WIDTHS.map(
    (width) => `${cloudinaryUrl(source, { width, crop: "limit" })} ${width}w`,
  ).join(", ");
}
