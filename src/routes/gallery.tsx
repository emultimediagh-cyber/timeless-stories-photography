import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getPhotos } from "@/lib/api";
import type { Category, Photo } from "@/types";
import { MasonryGrid } from "@/components/site/MasonryGrid";
import { Lightbox } from "@/components/site/Lightbox";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { cn } from "@/lib/utils";

const filters: ("All" | Category)[] = ["All", "Weddings", "Portraits", "Events", "Family"];
const mediaFilters = ["all", "image", "video"] as const;
type MediaFilter = (typeof mediaFilters)[number];
const mediaLabel: Record<MediaFilter, string> = { all: "All media", image: "Photos", video: "Videos" };

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Events Multimedia GH" },
      { name: "description", content: "Browse weddings, portraits, events and family photography by Events Multimedia GH in Accra." },
      { property: "og:title", content: "Gallery — Events Multimedia GH" },
      { property: "og:description", content: "Weddings, portraits, events and family photography in Accra." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { media?: MediaFilter } => {
    const m = search["media"];
    const media = m === "image" || m === "video" ? m : undefined;
    return media === undefined ? {} : { media };
  },
  component: Gallery,
});

function Gallery() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [media, setMedia] = useState<MediaFilter>(Route.useSearch().media ?? "all");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    getPhotos().then(setPhotos);
  }, []);
  const shown = photos
    .filter((p) => (filter === "All" ? true : p.category === filter))
    .filter((p) => (media === "all" ? true : media === "video" ? p.type === "video" : p.type !== "video"));

  return (
    <main className="mx-auto max-w-7xl px-6 pb-24 pt-36">
      <Reveal><SectionHeading eyebrow="Portfolio" title="Gallery" /></Reveal>
      <div className="mt-10 mb-6 flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Show</span>
        {mediaFilters.map((m) => (
          <button
            key={m}
            onClick={() => setMedia(m)}
            className={cn(
              "rounded-full border px-5 py-2 text-xs uppercase tracking-[0.2em] transition",
              media === m ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground",
            )}
          >
            {mediaLabel[m]}
          </button>
        ))}
      </div>
      <div className="mb-12 flex flex-wrap gap-3">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-5 py-2 text-xs uppercase tracking-[0.2em] transition",
              filter === f ? "border-accent bg-accent text-accent-foreground" : "border-border hover:border-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          {media === "video" ? "No videos here yet — upload your first reel from the admin panel." : "No photos in this category yet."}
        </p>
      ) : (
        <MasonryGrid key={`${filter}-${media}`} photos={shown} onOpen={setOpen} />
      )}
      {open !== null && <Lightbox photos={shown} index={open} onClose={() => setOpen(null)} onChange={setOpen} />}
    </main>
  );
}
