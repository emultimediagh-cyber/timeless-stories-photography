import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Photo } from "@/types";
import { cloudinaryUrl } from "@/lib/cloudinary";

export function Lightbox({
  photos,
  index,
  onClose,
  onChange,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onChange: (i: number) => void;
}) {
  const touchX = useRef<number | null>(null);
  const prev = () => onChange((index - 1 + photos.length) % photos.length);
  const next = () => onChange((index + 1) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  const photo = photos[index];
  if (!photo) return null;
  const btn = "absolute z-10 p-3 text-on-image/80 transition hover:text-on-image";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="lb-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/95"
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
        touchX.current = null;
      }}
    >
      <button aria-label="Close" className={`${btn} right-4 top-4`} onClick={onClose}>
        <X className="h-7 w-7" />
      </button>
      <button aria-label="Previous" className={`${btn} left-2 md:left-6`} onClick={(e) => { e.stopPropagation(); prev(); }}>
        <ChevronLeft className="h-9 w-9" />
      </button>
      <img
        key={photo.id}
        src={cloudinaryUrl(photo.url, { width: 2000, crop: "limit" })}
        alt={photo.alt}
        className="lb-in max-h-[88vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button aria-label="Next" className={`${btn} right-2 md:right-6`} onClick={(e) => { e.stopPropagation(); next(); }}>
        <ChevronRight className="h-9 w-9" />
      </button>
      <p className="absolute bottom-5 text-xs uppercase tracking-[0.3em] text-on-image/70">
        {index + 1} / {photos.length}
      </p>
    </div>
  );
}
