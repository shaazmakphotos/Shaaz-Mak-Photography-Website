import type { RenderImageContext, RenderImageProps } from "react-photo-album";
import type { AlbumPhotoForGrid } from "@/lib/photoUrls";

/**
 * react-photo-album image renderer that:
 *  - never loads a full-res original in the grid
 *  - shows a muted placeholder when variants are missing (deferred)
 *  - sizes the <img> to the album cell (required by react-photo-album)
 *  - passes through srcSet/sizes + lazy loading when a real thumb exists
 */
export function renderAlbumImage(
  { alt = "", title, sizes, src, srcSet }: RenderImageProps,
  { photo, width, height }: RenderImageContext,
) {
  const deferred = Boolean((photo as AlbumPhotoForGrid).deferred) || !src;

  if (deferred) {
    return (
      <div
        role="img"
        aria-label={alt || "Photo processing"}
        title={title || alt || "Preview generating…"}
        className="w-full h-full bg-muted/50 animate-pulse"
        style={{
          width,
          height,
          display: "block",
        }}
      />
    );
  }

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      title={title}
      loading="lazy"
      decoding="async"
      width={width}
      height={height}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      }}
      className="transition-transform duration-500 hover:scale-[1.02]"
    />
  );
}
