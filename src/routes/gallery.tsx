import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getPhotos } from "@/lib/api";
import type { Category, Photo } from "@/types";
import { MasonryGrid } from "@/components/site/MasonryGrid";
import { Lightbox } from "@/components/site/Lightbox";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Events Multimedia GH" },
      { name: "description", content: "Browse weddings, portraits, events and family photography by Events Multimedia GH in Accra." },
      { property: "og:title", content: "Gallery — Events Multimedia GH" },
      { property: "og:description", content: "Weddings, portraits, events and family photography in Accra." },
    ],
  }),
  component: Gallery,
});

const filters: ("All" | Category)[] = ["All", "Weddings", "Portraits", "Events", "Family"];

function Gallery() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    getPhotos().then(setPhotos);
  }, []);
  const shown = filter === "All" ? photos : photos.filter((p) => p.category === filter);

  return (
    <main className="mx-auto max-w-7xl px-6 pb-24 pt-36">
      <Reveal><SectionHeading eyebrow="Portfolio" title="Gallery" /></Reveal>
      <div className="mt-10 mb-12 flex flex-wrap gap-3">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-5 py-2 text-xs uppercase tracking-[0.2em] transition",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <MasonryGrid key={filter} photos={shown} onOpen={setOpen} />
      {open !== null && <Lightbox photos={shown} index={open} onClose={() => setOpen(null)} onChange={setOpen} />}
    </main>
  );
}
