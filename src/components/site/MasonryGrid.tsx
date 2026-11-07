import type { Photo } from "@/types";
import { PhotoImage } from "./PhotoImage";

export function MasonryGrid({ photos, onOpen }: { photos: Photo[]; onOpen?: (index: number) => void }) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
      {photos.map((p, i) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen?.(i)}
          className="mb-4 block w-full break-inside-avoid focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${p.alt}`}
        >
          <PhotoImage src={p.url} alt={p.alt} ratio={p.ratio} />
        </button>
      ))}
    </div>
  );
}
