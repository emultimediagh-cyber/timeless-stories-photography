import { cn } from "@/lib/utils";

export function PhotoImage({
  src,
  alt,
  ratio,
  className,
  zoom = true,
}: {
  src: string;
  alt: string;
  ratio: number;
  className?: string;
  zoom?: boolean;
}) {
  return (
    <div className={cn("group relative overflow-hidden bg-muted", className)} style={{ aspectRatio: ratio }}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          zoom && "transition-transform duration-[1500ms] ease-out group-hover:scale-105",
        )}
      />
    </div>
  );
}
