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

// Measure image dimensions client-side from a File. Used as a fallback when
// the process-upload Edge Function isn't deployed and we can't get them
// from the server's image-decode step.
async function measureDimensions(file: File): Promise<{ width: number; height: number }> {
  // Prefer createImageBitmap — fast, off-main-thread on most browsers.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      const dims = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return dims;
    } catch {
      // fall through to <img> path
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
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

  // 2. Try the process-upload Edge Function for WebP variants.
  //    If it's not deployed (or errors out), fall back to using the original
  //    for all sizes so uploads still succeed. Once the function is deployed
  //    to Supabase, this path won't be hit and new uploads will get proper
  //    thumb/preview variants.
  try {
    const { data, error: fnErr } = await supabase.functions.invoke("process-upload", {
      body: { sourcePath },
    });
    if (!fnErr && data && !data.error && data.url) {
      return {
        url: data.url,
        thumbnail_url: data.thumbnail_url,
        preview_url: data.preview_url,
        width: data.width,
        height: data.height,
      };
    }
    // If we got here, the function returned an error or no data — log and fall through.
    console.warn(
      "[uploadAndProcessPhoto] process-upload unavailable, falling back to original-only:",
      fnErr?.message || data?.error || "no data"
    );
  } catch (err) {
    console.warn(
      "[uploadAndProcessPhoto] process-upload threw, falling back to original-only:",
      err
    );
  }

  // Fallback: use the original file URL for thumb/preview as well. Image grids
  // will still render — just heavier. Dimensions come from the client.
  const { data: pub } = supabase.storage.from("photos").getPublicUrl(sourcePath);
  const publicUrl = pub.publicUrl;
  const dims = await measureDimensions(file).catch(() => ({ width: 1500, height: 1000 }));
  return {
    url: publicUrl,
    thumbnail_url: publicUrl,
    preview_url: publicUrl,
    width: dims.width,
    height: dims.height,
  };
}
