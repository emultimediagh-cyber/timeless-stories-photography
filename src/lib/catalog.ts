/**
 * Shared, browser-safe constants and helpers for the photo catalog.
 * Imported by both the browser code and the Cloudflare Worker, so this file
 * must NOT use import.meta.env, window, or any browser-only API.
 */
import type { Category, Photo } from "../types";

export const CLOUDINARY_CLOUD_NAME = "i98tepgb";
export const CLOUDINARY_ASSET_FOLDER = "events-multimedia-gh";
export const CATEGORIES: Category[] = ["Weddings", "Portraits", "Events", "Family"];

/** Tags and context are stored on the Cloudinary asset itself. */
export const SITE_TAG = "emgh";
export const FEATURED_TAG = "featured";
export const CATEGORY_TAG_PREFIX = "cat_";

export function categoryTag(category: Category): string {
  return `${CATEGORY_TAG_PREFIX}${category.toLowerCase()}`;
}

export function categoryFromTags(tags: string[] | undefined): Category {
  const found = tags?.find((tag) => tag.startsWith(CATEGORY_TAG_PREFIX));
  const value = found?.slice(CATEGORY_TAG_PREFIX.length);
  return CATEGORIES.find((category) => category.toLowerCase() === value) ?? "Weddings";
}

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as string[]).includes(value);
}

export interface CloudinaryResource {
  public_id: string;
  secure_url: string;
  width?: number;
  height?: number;
  tags?: string[];
  context?: { custom?: Record<string, string> };
}

/** Convert one Cloudinary asset into the Photo shape the site renders. */
export function resourceToPhoto(resource: CloudinaryResource): Photo {
  let alt = "Portfolio photograph";
  const stored = resource.context?.custom?.["alt"];
  if (stored) {
    try {
      alt = decodeURIComponent(stored);
    } catch {
      alt = stored;
    }
  }

  const width = resource.width ?? 3;
  const height = resource.height ?? 2;

  return {
    id: resource.public_id,
    publicId: resource.public_id,
    url: resource.secure_url,
    alt,
    category: categoryFromTags(resource.tags),
    ratio: height > 0 ? width / height : 3 / 2,
    featured: resource.tags?.includes(FEATURED_TAG) ?? false,
  };
}

/** Escape alt text so it is safe inside Cloudinary's pipe-separated context. */
export function encodeAlt(alt: string): string {
  return `alt=${encodeURIComponent(alt)}`;
}
