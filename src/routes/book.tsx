import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { CONTACT, createBooking, formatGHS, getPackages, IMAGES } from "@/lib/api";
import type { BookingInput, Package } from "@/types";
import { SectionHeading, btnPrimary } from "@/components/site/SectionHeading";

export const Route = createFileRoute("/book")({
  validateSearch: (s: Record<string, unknown>): { package?: string } => ({
    package: typeof s.package === "string" ? s.package : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Book a Session — Events Multimedia GH" },
      { name: "description", content: "Request a date for your wedding, portrait or event photography session in Accra." },
      { property: "og:title", content: "Book a Session — Events Multimedia GH" },
      { property: "og:description", content: "Request a date for your photography session in Accra." },
    ],
  }),
  component: Book,
});

const field = "w-full border-0 border-b border-input bg-transparent px-0 py-3 text-base outline-none transition focus:border-accent";
const label = "text-xs uppercase tracking-[0.2em] text-muted-foreground";

function Book() {
  const { package: preselected } = Route.useSearch();
  const [packages, setPackages] = useState<Package[]>([]);
  const [form, setForm] = useState<BookingInput>({ name: "", phone: "", email: "", date: "", packageId: preselected ?? "", message: "" });
  const [done, setDone] = useState<BookingInput | null>(null);

  useEffect(() => {
    getPackages().then(setPackages);
  }, []);
  useEffect(() => {
    if (preselected) setForm((f) => ({ ...f, packageId: preselected }));
  }, [preselected]);

  const set = (k: keyof BookingInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await createBooking(form);
    setDone(form);
  };

  const pkgName = (id: string) => packages.find((p) => p.id === id)?.name ?? "Not sure yet";
  const waText = done
    ? `Hello Events Multimedia GH, I'd like to book a session.\nName: ${done.name}\nPhone: ${done.phone}\nEmail: ${done.email}\nDate: ${done.date}\nPackage: ${pkgName(done.packageId)}\nMessage: ${done.message}`
    : "";

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden md:block">
        <img src={IMAGES.book} alt="Couple at golden hour" className="sticky top-0 h-screen w-full object-cover" />
      </div>
      <div className="px-6 pb-24 pt-36 md:px-16">
        {done ? (
          <div className="max-w-md">
            <SectionHeading eyebrow="Thank you" title={`We'll be in touch, ${done.name.split(" ")[0]}.`} />
            <p className="mt-6 leading-relaxed text-muted-foreground">
              Your request has been received. For a faster reply, send your booking details straight to us on WhatsApp.
            </p>
            <a href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer" className={`${btnPrimary} mt-10 gap-2`}>
              <MessageCircle className="h-4 w-4" /> Send on WhatsApp
            </a>
          </div>
        ) : (
          <>
            <SectionHeading eyebrow="Reservations" title="Book a session" />
            <form onSubmit={submit} className="mt-12 grid max-w-lg gap-8">
              <label className="grid gap-1"><span className={label}>Full name</span><input required className={field} value={form.name} onChange={set("name")} /></label>
              <div className="grid gap-8 sm:grid-cols-2">
                <label className="grid gap-1"><span className={label}>Phone</span><input required type="tel" className={field} value={form.phone} onChange={set("phone")} /></label>
                <label className="grid gap-1"><span className={label}>Email</span><input required type="email" className={field} value={form.email} onChange={set("email")} /></label>
              </div>
              <div className="grid gap-8 sm:grid-cols-2">
                <label className="grid gap-1"><span className={label}>Date</span><input required type="date" className={field} value={form.date} onChange={set("date")} /></label>
                <label className="grid gap-1">
                  <span className={label}>Package</span>
                  <select className={field} value={form.packageId} onChange={set("packageId")}>
                    <option value="">Not sure yet</option>
                    {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatGHS(p.price)}</option>)}
                  </select>
                </label>
              </div>
              <label className="grid gap-1"><span className={label}>Message</span><textarea rows={4} className={field} value={form.message} onChange={set("message")} /></label>
              <button type="submit" className={`${btnPrimary} justify-self-start`}>Send request</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
