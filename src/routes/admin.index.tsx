import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Trash2, Pencil, Star } from "lucide-react";
import { toast } from "sonner";
import {
  deletePackage, deletePhoto, formatGHS, getAdminKey, getAdminStatus, getBookings, getPackages, getPhotos,
  savePackage, setAdminKey, setPhotoFeatured, updateBookingStatus, updatePhotoCategory, uploadPhotoFile,
  type AdminStatus,
} from "@/lib/api";
import type { Booking, BookingStatus, Category, Package, Photo } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Events Multimedia GH" },
      { name: "description", content: "Manage photos, rates and bookings." },
      { property: "og:title", content: "Dashboard — Events Multimedia GH" },
      { property: "og:description", content: "Manage photos, rates and bookings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

const categories: Category[] = ["Weddings", "Portraits", "Events", "Family"];
const statuses: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];
const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";

function Admin() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async (value: string) => {
    setChecking(true);
    setStatus(await getAdminStatus(value));
    setChecking(false);
  };

  useEffect(() => {
    const saved = getAdminKey();
    setKey(saved);
    void check(saved);
  }, []);

  const adminReady = status?.adminValid === true;

  const message = status === null
    ? "Could not reach the server. Refresh the page and try again."
    : !status.storageReady
      ? "Gallery storage (KV) is not configured on the server yet. See the instructions below."
      : !status.adminConfigured
        ? "No admin password is set in Cloudflare. Add the ADMIN_PASSWORD secret — uploads and edits are disabled until then."
        : status.adminValid
          ? "Admin key accepted. You can upload, edit and delete photos."
          : "Admin key is missing or wrong. Type it above and click Check key.";

  return (
    <main className="min-h-screen bg-secondary">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="Events Multimedia GH" className="h-7 w-auto rounded-sm" />
            <span className="font-serif text-xl">Events Multimedia <span className="text-accent">GH</span></span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="password"
              placeholder="Admin key"
              aria-label="Admin key"
              value={key}
              onChange={(e) => { setKey(e.target.value); setAdminKey(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") void check(key); }}
              className="h-9 w-40"
            />
            <Button variant="outline" size="sm" disabled={checking} onClick={() => void check(key)}>
              {checking ? "Checking…" : "Check key"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>View site</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <p
          role="status"
          aria-live="polite"
          className={`rounded-md border px-4 py-3 text-sm ${
            adminReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {adminReady ? "✓ " : "⚠ "}{message}
        </p>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Tabs defaultValue="photos">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="rates">Rates</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
          </TabsList>
          <TabsContent value="photos"><PhotosTab adminReady={adminReady} /></TabsContent>
          <TabsContent value="rates"><RatesTab /></TabsContent>
          <TabsContent value="bookings"><BookingsTab /></TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

const reportError = (error: unknown) =>
  toast.error(error instanceof Error ? error.message : "Something went wrong");

function PhotosTab({ adminReady }: { adminReady: boolean }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [category, setCategory] = useState<Category>("Weddings");
  const [featured, setFeatured] = useState(false);
  const [uploading, setUploading] = useState(false);
  const reload = () => getPhotos().then(setPhotos);
  useEffect(() => { reload(); }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!adminReady) {
      toast.error("Check the Admin key at the top of this page first.");
      return;
    }
    setUploading(true);
    try {
      await uploadPhotoFile(file, category, featured);
      toast.success("Photo uploaded");
      await reload();
    } catch (error) {
      reportError(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-md border border-border bg-card p-5">
        <div className="space-y-2"><Label>Category</Label>
          <select className={select} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          Show on home page
        </label>
        <div className="space-y-2"><Label htmlFor="file">{uploading ? "Uploading…" : "Upload photo or video"}</Label>
          <Input
            id="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime"
            disabled={uploading || !adminReady}
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Photos and videos are stored in Cloudinary and served via a Cloudflare KV gallery index, so every visitor sees the same gallery.
        {adminReady
          ? " You can upload, change and delete real photos. Sample photos can't be edited."
          : " Get a green status message at the top of this page before you can make changes."}
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-md border border-border bg-card">
            <div className="relative aspect-square bg-muted">
              {p.type === "video" ? (
                <>
                  <video src={p.url} className="h-full w-full object-cover" muted preload="metadata" />
                  <span className="absolute left-2 top-2 rounded bg-foreground/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">Video</span>
                </>
              ) : (
                <img src={p.url} alt={p.alt} loading="lazy" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex items-center gap-1 p-2">
              <select
                className={`${select} flex-1`}
                value={p.category}
                disabled={!p.publicId || !adminReady}
                onChange={async (e) => {
                  if (!p.publicId) return;
                  try {
                    await updatePhotoCategory(p.publicId, e.target.value as Category);
                    await reload();
                  } catch (error) { reportError(error); }
                }}
              >
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
              <Button
                size="icon"
                variant="ghost"
                aria-label={p.featured ? "Remove from home page" : "Show on home page"}
                title={p.featured ? "Remove from home page" : "Show on home page"}
                disabled={!p.publicId || !adminReady}
                onClick={async () => {
                  if (!p.publicId) return;
                  try {
                    await setPhotoFeatured(p.publicId, !p.featured);
                    await reload();
                  } catch (error) { reportError(error); }
                }}
              >
                <Star className={p.featured ? "h-4 w-4 fill-accent text-accent" : "h-4 w-4"} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete"
                disabled={!p.publicId || !adminReady}
                onClick={async () => {
                  if (!p.publicId) return;
                  try {
                    await deletePhoto(p.publicId);
                    await reload();
                  } catch (error) { reportError(error); }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const emptyPkg = { name: "", price: 0, description: "", inclusions: "", highlighted: false };

function RatesTab() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [editId, setEditId] = useState<string | undefined>();
  const [form, setForm] = useState(emptyPkg);
  const reload = () => getPackages().then(setPackages);
  useEffect(() => { reload(); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await savePackage({
      id: editId, name: form.name, price: Number(form.price), description: form.description,
      highlighted: form.highlighted, inclusions: form.inclusions.split("\n").map((s) => s.trim()).filter(Boolean),
    });
    toast.success("Package saved");
    setEditId(undefined); setForm(emptyPkg); reload();
  };

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {packages.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-card p-4">
            <div>
              <p className="font-medium">{p.name} {p.highlighted && <span className="ml-2 text-xs text-accent">Highlighted</span>}</p>
              <p className="text-sm text-muted-foreground">{formatGHS(p.price)} · {p.inclusions.length} inclusions</p>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setEditId(p.id); setForm({ ...p, inclusions: p.inclusions.join("\n"), highlighted: !!p.highlighted }); }}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Delete" onClick={async () => { await deletePackage(p.id); reload(); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-md border border-border bg-card p-5">
        <p className="font-medium">{editId ? "Edit package" : "Add package"}</p>
        <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-2"><Label>Price (GHS)</Label><Input required type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
        <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="space-y-2"><Label>Inclusions (one per line)</Label><Textarea rows={5} value={form.inclusions} onChange={(e) => setForm({ ...form, inclusions: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.highlighted} onChange={(e) => setForm({ ...form, highlighted: e.target.checked })} /> Highlight this package</label>
        <div className="flex gap-2">
          <Button type="submit">Save</Button>
          {editId && <Button type="button" variant="ghost" onClick={() => { setEditId(undefined); setForm(emptyPkg); }}>Cancel</Button>}
        </div>
      </form>
    </section>
  );
}

function BookingsTab() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const reload = () => getBookings().then(setBookings);
  useEffect(() => { reload(); getPackages().then(setPackages); }, []);

  return (
    <section className="mt-6 rounded-md border border-border bg-card">
      {bookings.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">No bookings yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Package</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b) => (
              <TableRow key={b.id}>
                <TableCell><p className="font-medium">{b.name}</p><p className="text-xs text-muted-foreground">{b.phone} · {b.email}</p></TableCell>
                <TableCell>{b.date}</TableCell>
                <TableCell>{packages.find((p) => p.id === b.packageId)?.name ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{b.message || "—"}</TableCell>
                <TableCell>
                  <select className={select} value={b.status} onChange={async (e) => { await updateBookingStatus(b.id, e.target.value as BookingStatus); reload(); }}>
                    {statuses.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
