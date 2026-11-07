import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/gallery", label: "Gallery" },
  { to: "/rates", label: "Rates" },
  { to: "/book", label: "Book" },
] as const;

export function SiteHeader() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const overHero = pathname === "/" && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-colors duration-500",
        overHero ? "bg-transparent text-on-image" : "border-b border-border bg-background/95 text-foreground backdrop-blur",
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 truncate">
          <img src="/logo.jpg" alt="Events Multimedia GH" className="h-9 w-auto rounded-sm" />
          <span className="hidden font-serif text-xl tracking-wide sm:inline sm:text-2xl">
            Events Multimedia <span className="text-accent">GH</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-10 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-xs uppercase tracking-[0.25em] opacity-80 transition hover:opacity-100"
              activeProps={{ className: "!opacity-100 text-accent" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <button className="-mr-2 shrink-0 p-2 md:hidden" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav className="flex h-[calc(100svh-5rem)] flex-col justify-center gap-8 border-t border-border bg-background px-6 md:hidden">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="font-serif text-3xl">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
