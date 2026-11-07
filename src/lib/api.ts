import type { Booking, BookingInput, BookingStatus, Category, Package, Photo } from "@/types";

/**
 * Photos live in Cloudinary and the shared list is served by /api/photos.
 * Packages and bookings are still browser-local placeholders for now.
 */

export const CONTACT = {
  phone: "+233 20 000 0000",
  whatsapp: "233200000000",
  email: "hello@eventsmultimediagh.com",
  instagram: "https://instagram.com/eventsmultimediagh",
  location: "East Legon, Accra, Ghana",
};

const u = (id: string) => `https://images.unsplash.com/${id}?w=1600&q=80&auto=format&fit=crop`;

export const IMAGES = {
  hero: u("photo-1519741497674-611481863552"),
  about: u("photo-1531384441138-2736e62e0919"),
  book: u("photo-1606216794074-735e91aa2c92"),
  cta: u("photo-1511285560929-80b456fea0bc"),
};

/** Shown until the shared photo list is configured or the first real photo is uploaded. */
const seedPhotos: Photo[] = [
  { id: "p1", url: u("photo-1519741497674-611481863552"), alt: "Bride and groom embrace", category: "Weddings", ratio: 2 / 3, featured: true },
  { id: "p2", url: u("photo-1531123897727-8f129e1688ce"), alt: "Portrait of a woman in soft light", category: "Portraits", ratio: 2 / 3, featured: true },
  { id: "p3", url: u("photo-1511578314322-379afb476865"), alt: "Evening event celebration", category: "Events", ratio: 3 / 2, featured: true },
  { id: "p4", url: u("photo-1511895426328-dc8714191300"), alt: "Family laughing together", category: "Family", ratio: 3 / 2, featured: true },
  { id: "p5", url: u("photo-1465495976277-4387d4b0b4c6"), alt: "Wedding ceremony details", category: "Weddings", ratio: 3 / 2, featured: true },
  { id: "p6", url: u("photo-1531384441138-2736e62e0919"), alt: "Portrait of a man", category: "Portraits", ratio: 2 / 3, featured: true },
  { id: "p7", url: u("photo-1523580494863-6f3031224c94"), alt: "Graduates celebrating", category: "Events", ratio: 3 / 2 },
  { id: "p8", url: u("photo-1583939003579-730e3918a45a"), alt: "Bride holding bouquet", category: "Weddings", ratio: 2 / 3 },
  { id: "p9", url: u("photo-1609220136736-443140cffec6"), alt: "Mother and child", category: "Family", ratio: 2 / 3 },
  { id: "p10", url: u("photo-1534528741775-53994a69daeb"), alt: "Editorial portrait", category: "Portraits", ratio: 2 / 3 },
  { id: "p11", url: u("photo-1492684223066-81342ee5ff30"), alt: "Crowd at a live event", category: "Events", ratio: 3 / 2 },
  { id: "p12", url: u("photo-1606216794074-735e91aa2c92"), alt: "Couple at golden hour", category: "Weddings", ratio: 3 / 2 },
  { id: "p13", url: u("photo-1475503572774-15a45e5d60b9"), alt: "Children playing outdoors", category: "Family", ratio: 3 / 2 },
  { id: "p14", url: u("photo-1544005313-94ddf0286df2"), alt: "Close-up portrait", category: "Portraits", ratio: 1 },
];

const seedPackages: Package[] = [
  { id: "essential", name: "Essential", price: 1500, description: "Portraits and intimate sessions.", inclusions: ["2-hour session", "1 location", "40 edited photos", "Online gallery"] },
  { id: "signature", name: "Signature", price: 4500, description: "Our most loved coverage for weddings and events.", inclusions: ["6-hour coverage", "2 photographers", "300+ edited photos", "Online gallery", "Engagement mini-shoot"], highlighted: true },
  { id: "luxury", name: "Luxury", price: 9000, description: "Full-day storytelling with heirloom keepsakes.", inclusions: ["Full-day coverage", "2 photographers + videographer", "500+ edited photos", "Highlight film", "Premium photo album"] },
];

const KEYS = { packages: "emgh_packages", bookings: "emgh_bookings" };
const ADMIN_KEY_STORAGE = "emgh_admin_key";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}
const id = () => Math.random().toString(36).slice(2, 10);

/** The admin key lives only in this browser tab and is never sent to other visitors. */
export function getAdminKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setAdminKey(value: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem(ADMIN_KEY_STORAGE, value);
}

export interface AdminStatus {
  cloudinaryReady: boolean;
  adminConfigured: boolean;
  adminValid: boolean;
}

/** Lets the admin page show exactly what is set up and whether the key is right. */
export async function getAdminStatus(key: string): Promise<AdminStatus | null> {
  const headers = new Headers();
  if (key) headers.set("x-admin-key", key);
  try {
    const response = await fetch("/api/admin-status", { headers });
    if (!response.ok) return null;
    return (await response.json()) as AdminStatus;
  } catch {
    return null;
  }
}

async function photoApi(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const key = getAdminKey();
  if (key) headers.set("x-admin-key", key);

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep the status-based message
    }
    throw new Error(message);
  }
  return response;
}

/** Shared gallery list. Falls back to sample photos until real ones exist. */
export async function getPhotos(): Promise<Photo[]> {
  try {
    const response = await fetch("/api/photos");
    if (!response.ok) return seedPhotos;
    const data = (await response.json()) as { configured?: boolean; photos?: Photo[] };
    if (!data.configured) return seedPhotos;
    return data.photos && data.photos.length > 0 ? data.photos : seedPhotos;
  } catch {
    return seedPhotos;
  }
}

/** Upload goes through our own server so only someone with the Admin key can add photos. */
export async function uploadPhotoFile(file: File, category: Category, featured = false): Promise<Photo> {
  const alt = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Portfolio photograph";

  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  form.append("alt", alt);
  form.append("featured", featured ? "1" : "0");

  const response = await photoApi("/api/photos", { method: "POST", body: form });
  const data = (await response.json()) as { photo: Photo };
  return data.photo;
}

export async function updatePhotoCategory(publicId: string, category: Category): Promise<void> {
  await photoApi("/api/photos", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publicId, category }),
  });
}

export async function setPhotoFeatured(publicId: string, featured: boolean): Promise<void> {
  await photoApi("/api/photos", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publicId, featured }),
  });
}

/** Removes the photo from Cloudinary as well as from the shared list. */
export async function deletePhoto(publicId: string): Promise<void> {
  await photoApi(`/api/photos?publicId=${encodeURIComponent(publicId)}`, { method: "DELETE" });
}

export async function getPackages(): Promise<Package[]> {
  return read(KEYS.packages, seedPackages);
}

export async function savePackage(pkg: Omit<Package, "id"> & { id?: string | undefined }): Promise<Package> {
  const all = await getPackages();
  const saved: Package = { ...pkg, id: pkg.id ?? id() };
  const exists = all.some((p) => p.id === saved.id);
  write(KEYS.packages, exists ? all.map((p) => (p.id === saved.id ? saved : p)) : [...all, saved]);
  return saved;
}

export async function deletePackage(pkgId: string): Promise<void> {
  write(KEYS.packages, (await getPackages()).filter((p) => p.id !== pkgId));
}

export async function getBookings(): Promise<Booking[]> {
  return read<Booking[]>(KEYS.bookings, []);
}

export async function createBooking(input: BookingInput): Promise<Booking> {
  const booking: Booking = { ...input, id: id(), status: "pending", createdAt: new Date().toISOString() };
  write(KEYS.bookings, [booking, ...(await getBookings())]);
  return booking;
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus): Promise<void> {
  write(KEYS.bookings, (await getBookings()).map((b) => (b.id === bookingId ? { ...b, status } : b)));
}

export const formatGHS = (n: number) => `GHS ${n.toLocaleString("en-GH")}`;
