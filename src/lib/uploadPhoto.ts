// Shared upload helper used by all admin upload UIs (album photos, portfolio,
// homepage). Encapsulates the new pipeline:
//
//   1. Upload the original to `photos/originals/<section>/<uuid>.<ext>`.
//   2. Invoke the `process-upload` Edge Function, which generates the
//      thumb/preview/full-webp WebP variants in `photos/derived/...`.
//   3. Return the URLs + natural dimensions ready for a DB insert.
//
// All callers should treat the original `url` as the full-resolution download
// asset and use `thumbnail_url` / `preview_url` for on-screen rendering.

import { supabase } from "@/integrations/supabase/client";

export interface ProcessedUpload {
  url: string;            // original, full-res — for downloads
  thumbnail_url: string;  // small WebP for grid thumbnails
  preview_url: string;    // medium WebP for gallery viewing
  width: number;
  height: number;
}

function makeKey(section: string, file: File): string {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  // crypto.randomUUID is in every modern browser; collisions are not a concern.
  const id = (crypto as Crypto).randomUUID();
  return `originals/${section}/${id}.${ext}`;
}

export async function uploadAndProcessPhoto(
  file: File,
  section: string,
): Promise<ProcessedUpload> {
  const sourcePath = makeKey(section, file);

  // 1. Upload original.
  const { error: upErr } = await supabase.storage
    .from("photos")
    .upload(sourcePath, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  // 2. Ask the Edge Function to generate variants.
  const { data, error: fnErr } = await supabase.functions.invoke("process-upload", {
    body: { sourcePath },
  });
  if (fnErr) throw new Error(`Image processing failed: ${fnErr.message}`);
  if (!data || data.error) throw new Error(data?.error ?? "Image processing returned no data");

  return {
    url: data.url,
    thumbnail_url: data.thumbnail_url,
    preview_url: data.preview_url,
    width: data.width,
    height: data.height,
  };
}
