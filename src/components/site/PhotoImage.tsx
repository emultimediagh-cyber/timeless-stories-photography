import { cn } from "@/lib/utils";
import { cloudinarySrcSet, cloudinaryUrl } from "@/lib/cloudinary";

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
  const srcSet = cloudinarySrcSet(src);

  return (
    <div className={cn("group relative overflow-hidden bg-muted", className)} style={{ aspectRatio: ratio }}>
      <img
        src={cloudinaryUrl(src, { width: 1024, crop: "limit" })}
        {...(srcSet
          ? { srcSet, sizes: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" }
          : {})}
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
