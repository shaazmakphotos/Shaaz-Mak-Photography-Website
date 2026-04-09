// Rewrites Supabase Storage public URLs to point at the configured CDN host
// when VITE_CDN_BASE is set. Used everywhere image URLs are read from the
// database so we can put Cloudflare (or any reverse proxy) in front of
// Supabase Storage without touching upload code.
//
// Behavior:
//   - If VITE_CDN_BASE is empty, the original URL is returned unchanged.
//   - Only the host is replaced; the storage path is preserved verbatim
//     so caching keys stay stable.
//   - Non-Supabase URLs (any other host, data: URIs, relative paths) pass through.

const CDN_BASE = (import.meta.env.VITE_CDN_BASE as string | undefined)?.replace(/\/$/, "") || "";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") || "";

export function cdn(url: string | null | undefined): string {
  if (!url) return "";
  if (!CDN_BASE || !SUPABASE_URL) return url;
  if (!url.startsWith(SUPABASE_URL)) return url;
  return CDN_BASE + url.slice(SUPABASE_URL.length);
}

// Helper for srcset strings: pass any number of [url, width] pairs.
export function srcset(...entries: Array<[string | null | undefined, number]>): string {
  return entries
    .filter(([u]) => !!u)
    .map(([u, w]) => `${cdn(u as string)} ${w}w`)
    .join(", ");
}
