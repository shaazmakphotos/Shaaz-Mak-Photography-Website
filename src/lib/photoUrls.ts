// Resolves which image URL to load for grids vs lightbox vs downloads.
//
// Contract:
//   - `url`            = full-res original (downloads ONLY)
//   - `thumbnail_url`  = small WebP for collage/grid (derived/thumb)
//   - `preview_url`    = medium WebP for lightbox/viewing (derived/preview)
//
// When process-upload is down, older uploads may have thumbnail_url/preview_url
// equal to `url` (or null). Grids must NOT load the original in that case.

import { cdn } from "@/lib/cdn";

export const THUMB_MAX_EDGE = 480;
export const PREVIEW_MAX_EDGE = 1600;

export interface VariantPhoto {
  id?: string;
  url: string;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  title?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

/** Normalize for equality checks (ignore query string / trailing slash). */
function normalizeUrl(u: string): string {
  return u.split("?")[0].replace(/\/$/, "");
}

/**
 * True when `candidate` is a usable display variant distinct from the
 * download original. Treats identical URLs and missing values as "not real".
 */
export function isRealVariant(
  candidate: string | null | undefined,
  original: string | null | undefined,
): boolean {
  if (!candidate) return false;
  if (!original) return true;
  if (normalizeUrl(candidate) === normalizeUrl(original)) return false;
  return true;
}

/** Grid/collage src — real thumbnail only. Never the download original. */
export function gridSrc(photo: VariantPhoto): string | null {
  if (isRealVariant(photo.thumbnail_url, photo.url)) {
    return cdn(photo.thumbnail_url);
  }
  return null;
}

/**
 * Lightbox / viewing src. Prefer preview, then thumb, then original as a
 * last resort (only used when the user explicitly opens the photo).
 */
export function lightboxSrc(photo: VariantPhoto): string {
  if (isRealVariant(photo.preview_url, photo.url)) {
    return cdn(photo.preview_url!);
  }
  if (isRealVariant(photo.thumbnail_url, photo.url)) {
    return cdn(photo.thumbnail_url!);
  }
  return cdn(photo.url);
}

/** Best URL to probe for natural dimensions without pulling a full original. */
export function measureSrc(photo: VariantPhoto): string | null {
  if (isRealVariant(photo.thumbnail_url, photo.url)) {
    return photo.thumbnail_url!;
  }
  if (isRealVariant(photo.preview_url, photo.url)) {
    return photo.preview_url!;
  }
  return null;
}

export interface AlbumPhotoForGrid {
  src: string;
  width: number;
  height: number;
  alt: string;
  key?: string;
  /** When true, grid must render a placeholder — do not load `url`. */
  deferred: boolean;
  srcSet?: Array<{ src: string; width: number; height: number }>;
}

/**
 * Build a react-photo-album Photo object that never points the grid at a
 * full-resolution original. When no real thumb exists, `deferred` is set and
 * `src` is empty — callers should render a placeholder via `render.image`.
 */
export function toGridPhoto(
  photo: VariantPhoto,
  dims?: { w: number; h: number } | null,
): AlbumPhotoForGrid {
  const width = photo.width || dims?.w || 1500;
  const height = photo.height || dims?.h || 1000;
  const alt = photo.alt || photo.title || "Photo";
  const thumb = gridSrc(photo);

  if (!thumb) {
    return {
      src: "",
      width,
      height,
      alt,
      key: photo.id,
      deferred: true,
    };
  }

  // Same aspect ratio for every srcSet entry (required by react-photo-album).
  // Prefer preview as default `src` when present so large grid cells don't
  // upscale a soft 480px thumb (looked washed-out / low-res on desktop).
  const thumbH = Math.max(1, Math.round((THUMB_MAX_EDGE * height) / width));
  const hasPreview = isRealVariant(photo.preview_url, photo.url);
  const preview = hasPreview ? cdn(photo.preview_url!) : null;
  const previewH = Math.max(1, Math.round((PREVIEW_MAX_EDGE * height) / width));

  const srcSet: Array<{ src: string; width: number; height: number }> = [
    { src: thumb, width: THUMB_MAX_EDGE, height: thumbH },
  ];
  if (preview) {
    srcSet.push({ src: preview, width: PREVIEW_MAX_EDGE, height: previewH });
  }

  return {
    src: preview ?? thumb,
    width,
    height,
    alt,
    key: photo.id,
    deferred: false,
    srcSet,
  };
}
