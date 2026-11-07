import { cn } from "@/lib/utils";
import { cloudinarySrcSet, cloudinaryUrl } from "@/lib/cloudinary";
import { Play } from "lucide-react";

export function PhotoImage({
  src,
  alt,
  ratio,
  className,
  zoom = true,
  type,
}: {
  src: string;
  alt: string;
  ratio: number;
  className?: string;
  zoom?: boolean;
  type?: "image" | "video";
}) {
  // Only Cloudinary delivery URLs get transformation parameters.
  // R2/Unsplash/other URLs pass through directly.
  const isCloudinary = src.includes("res.cloudinary.com/");
  const srcSet = isCloudinary ? cloudinarySrcSet(src) : undefined;
  const imgSrc = isCloudinary ? cloudinaryUrl(src, { width: 1024, crop: "limit" }) : src;

  if (type === "video") {
    return (
      <div className={cn("group relative overflow-hidden bg-muted", className)} style={{ aspectRatio: ratio }}>
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            zoom && "transition-transform duration-[1500ms] ease-out group-hover:scale-105",
          )}
        />
        {/* Play icon overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/40 backdrop-blur-sm transition group-hover:bg-foreground/60">
            <Play className="h-5 w-5 fill-white text-white" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group relative overflow-hidden bg-muted", className)} style={{ aspectRatio: ratio }}>
      <img
        src={imgSrc}
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
