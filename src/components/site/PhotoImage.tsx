import { cn } from "@/lib/utils";
import { cloudinarySrcSet, cloudinaryUrl } from "@/lib/cloudinary";

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
  // R2 URLs, /cdn/ URLs, and Unsplash URLs pass through directly.
  // Only Cloudinary delivery URLs get transformation parameters.
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
          controls
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            zoom && "transition-transform duration-[1500ms] ease-out group-hover:scale-105",
          )}
        />
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
