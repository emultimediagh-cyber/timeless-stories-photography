import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getPhotos, IMAGES } from "@/lib/api";
import type { Photo } from "@/types";
import { Reveal } from "@/components/site/Reveal";
import { MasonryGrid } from "@/components/site/MasonryGrid";
import { Lightbox } from "@/components/site/Lightbox";
import { PhotoImage } from "@/components/site/PhotoImage";
import { SectionHeading, btnOutline, btnPrimary } from "@/components/site/SectionHeading";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Events Multimedia GH — Timeless Photography in Accra" },
      { name: "description", content: "Wedding, portrait, family and event photography in Accra, Ghana. Timeless stories, captured with elegance." },
      { property: "og:title", content: "Events Multimedia GH — Timeless Photography in Accra" },
      { property: "og:description", content: "Wedding, portrait, family and event photography in Accra, Ghana." },
      { property: "og:image", content: IMAGES.hero },
      { name: "twitter:image", content: IMAGES.hero },
    ],
  }),
  component: Home,
});

const services = [
  { title: "Weddings", text: "Engagements, traditional ceremonies and white weddings — every vow and every dance." },
  { title: "Portraits", text: "Editorial portraits, graduations and personal branding with refined, natural light." },
  { title: "Events", text: "Corporate functions, birthdays and celebrations documented with discretion." },
];

const testimonials = [
  { quote: "They captured our traditional and white wedding beautifully. Every photo feels like a memory we can step back into.", name: "Akosua & Kwame" },
  { quote: "Professional, calm and incredibly talented. Our family portraits are now framed in every room.", name: "The Mensah Family" },
  { quote: "The graduation shoot exceeded every expectation. Elegant, timeless work.", name: "Efua A." },
];

function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    getPhotos().then((all) => setPhotos(all.filter((p) => p.featured).slice(0, 6)));
  }, []);

  return (
    <main>
      <section className="relative h-[100svh] min-h-[560px] w-full overflow-hidden">
        <img src={IMAGES.hero} alt="Bride and groom at golden hour" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-overlay" />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-24 text-on-image md:pb-32">
          <p className="text-xs uppercase tracking-[0.35em] opacity-80">Accra · Ghana</p>
          <h1 className="mt-6 max-w-4xl text-[2.75rem] leading-[1.05] sm:text-6xl md:text-8xl">Timeless stories, captured with elegance.</h1>
          <div className="mt-10 grid gap-3 sm:flex sm:flex-wrap sm:gap-4">
            <Link to="/gallery" className={btnOutline}>View portfolio</Link>
            <Link to="/book" search={{ package: undefined }} className="inline-flex items-center justify-center bg-on-image px-8 py-4 text-xs uppercase tracking-[0.25em] text-foreground transition hover:bg-accent hover:text-accent-foreground">
              Book a session
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <Reveal className="mb-14 flex flex-wrap items-end justify-between gap-6">
          <SectionHeading eyebrow="Portfolio" title="Featured work" />
          <Link to="/gallery" className="text-xs uppercase tracking-[0.25em] underline-offset-8 hover:underline">See full gallery →</Link>
        </Reveal>
        <Reveal>
          <MasonryGrid photos={photos} onOpen={setOpen} />
        </Reveal>
      </section>

      <section className="border-y border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-24 md:grid-cols-2 md:py-32">
          <Reveal>
            <PhotoImage src={IMAGES.about} alt="Lead photographer portrait" ratio={4 / 5} />
          </Reveal>
          <Reveal className="md:pl-12">
            <SectionHeading eyebrow="About" title="Quiet artistry, honest emotion." />
            <div className="mt-6 h-px w-16 bg-accent" />
            <p className="mt-8 text-lg leading-relaxed text-muted-foreground">
              Events Multimedia GH is an Accra-based studio devoted to elegant, unhurried photography. We blend editorial
              composition with genuine moments — so your images feel as true in fifty years as they do today.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <Reveal><SectionHeading eyebrow="Services" title="What we capture" center /></Reveal>
        <div className="mt-16 grid gap-12 md:grid-cols-3">
          {services.map((s, i) => (
            <Reveal key={s.title} className="border-t border-border pt-8">
              <p className="font-serif text-accent">0{i + 1}</p>
              <h3 className="mt-3 text-3xl">{s.title}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="bg-secondary">
        <div className="mx-auto max-w-5xl px-6 py-24 md:py-32">
          <Reveal><SectionHeading eyebrow="Kind words" title="From our clients" center /></Reveal>
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {testimonials.map((t) => (
              <Reveal key={t.name} className="text-center">
                <p className="font-serif text-xl italic leading-relaxed">“{t.quote}”</p>
                <p className="mt-6 text-xs uppercase tracking-[0.25em] text-muted-foreground">{t.name}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <img src={IMAGES.cta} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-overlay" />
        <Reveal className="relative mx-auto max-w-3xl px-6 py-32 text-center text-on-image">
          <h2 className="text-4xl md:text-6xl">Let's tell your story.</h2>
          <p className="mt-6 opacity-80">Limited dates available each season.</p>
          <Link to="/book" search={{ package: undefined }} className={`${btnPrimary} mt-10 bg-on-image text-foreground`}>Book a session</Link>
        </Reveal>
      </section>

      {open !== null && <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} onChange={setOpen} />}
    </main>
  );
}
