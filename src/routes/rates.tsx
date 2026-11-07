import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { formatGHS, getPackages } from "@/lib/api";
import type { Package } from "@/types";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rates")({
  head: () => ({
    meta: [
      { title: "Rates & Packages — Events Multimedia GH" },
      { name: "description", content: "Photography packages in GHS for weddings, portraits and events in Accra." },
      { property: "og:title", content: "Rates & Packages — Events Multimedia GH" },
      { property: "og:description", content: "Photography packages in GHS for weddings, portraits and events." },
    ],
  }),
  component: Rates,
});

function Rates() {
  const [packages, setPackages] = useState<Package[]>([]);
  useEffect(() => {
    getPackages().then(setPackages);
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-6 pb-24 pt-36">
      <Reveal><SectionHeading eyebrow="Investment" title="Rates & packages" center /></Reveal>
      <div className="mt-16 grid items-stretch gap-8 md:grid-cols-3">
        {packages.map((p) => (
          <Reveal key={p.id} className="h-full">
            <div
              className={cn(
                "flex h-full flex-col border p-10",
                p.highlighted ? "border-primary bg-primary text-primary-foreground md:-my-6 md:py-16" : "border-border bg-card",
              )}
            >
              {p.highlighted && <p className="mb-4 text-xs uppercase tracking-[0.3em] text-accent">Most popular</p>}
              <h3 className="text-4xl">{p.name}</h3>
              <p className={cn("mt-3 text-sm", p.highlighted ? "opacity-70" : "text-muted-foreground")}>{p.description}</p>
              <p className="mt-8 font-serif text-5xl">{formatGHS(p.price)}</p>
              <div className="my-8 h-px bg-current opacity-15" />
              <ul className="flex-1 space-y-3 text-sm">
                {p.inclusions.map((inc) => (
                  <li key={inc} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{inc}</li>
                ))}
              </ul>
              <Link
                to="/book"
                search={{ package: p.id }}
                className={cn(
                  "mt-10 inline-flex justify-center px-6 py-4 text-xs uppercase tracking-[0.25em] transition hover:bg-accent hover:text-accent-foreground",
                  p.highlighted ? "bg-primary-foreground text-primary" : "border border-foreground",
                )}
              >
                Book this package
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </main>
  );
}
