import { Instagram, MessageCircle } from "lucide-react";
import { CONTACT } from "@/lib/api";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-3">
        <div>
          <p className="font-serif text-2xl">
            Events Multimedia <span className="text-accent">GH</span>
          </p>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Wedding, portrait and event photography in Accra and across Ghana.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">Contact</p>
          <p>{CONTACT.location}</p>
          <a href={`tel:${CONTACT.phone.replace(/\s/g, "")}`} className="block hover:text-accent">{CONTACT.phone}</a>
          <a href={`mailto:${CONTACT.email}`} className="block hover:text-accent">{CONTACT.email}</a>
        </div>
        <div className="flex flex-col items-start gap-3">
          <p className="mb-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">Connect</p>
          <a
            href={`https://wa.me/${CONTACT.whatsapp}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-primary px-5 py-3 text-xs uppercase tracking-[0.2em] text-primary-foreground transition hover:bg-accent"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp us
          </a>
          <a href={CONTACT.instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm hover:text-accent">
            <Instagram className="h-4 w-4" /> @eventsmultimediagh
          </a>
        </div>
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Events Multimedia GH. All rights reserved.
      </div>
    </footer>
  );
}
