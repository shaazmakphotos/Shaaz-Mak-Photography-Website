// process-upload: given a freshly uploaded original image at `sourcePath` in the
// `photos` storage bucket, generate three WebP variants (thumb / preview /
// full-webp), upload them under the `derived/` prefix, and return all the URLs
// + the natural dimensions for the calling code to insert into the database.
//
// Why we do it server-side:
//   - We never trust client-reported dimensions or sizes.
//   - We keep the originals untouched so full-resolution downloads still work.
//   - The variants are deterministic, immutable, and uuid-named, so a CDN
//     in front of Supabase Storage can cache them forever.
//
// JWT verification is enforced via supabase/config.toml.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";
import { decode, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "photos";

// Variants: name, max long-edge, WebP quality.
const VARIANTS: Array<{ name: "thumb" | "preview" | "full-webp"; maxEdge: number; quality: number }> = [
  { name: "thumb",     maxEdge: 480,  quality: 70 },
  { name: "preview",   maxEdge: 1600, quality: 80 },
  { name: "full-webp", maxEdge: 2560, quality: 85 },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function deriveKey(sourcePath: string, variant: string): string {
  // sourcePath looks like "originals/<albumId-or-section>/<uuid>.<ext>"
  // -> "derived/<variant>/<albumId-or-section>/<uuid>.webp"
  const stripped = sourcePath.replace(/^originals\//, "");
  const noExt = stripped.replace(/\.[^.]+$/, "");
  return `derived/${variant}/${noExt}.webp`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Auth: only logged-in users (admins in practice) may invoke this.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "missing auth" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return jsonResponse({ error: "invalid token" }, 401);

    const { sourcePath } = await req.json();
    if (!sourcePath || typeof sourcePath !== "string") {
      return jsonResponse({ error: "sourcePath required" }, 400);
    }

    // 1. Pull the original out of storage as bytes.
    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(sourcePath);
    if (dlError || !blob) return jsonResponse({ error: `download failed: ${dlError?.message}` }, 500);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // 2. Decode once; reuse the decoded image for each variant.
    const decoded = await decode(bytes);
    if (!(decoded instanceof Image)) {
      return jsonResponse({ error: "unsupported image (animated images are not allowed)" }, 400);
    }
    const origWidth = decoded.width;
    const origHeight = decoded.height;

    // 3. Encode + upload each variant in sequence (parallel uploads risk
    //    rate limits on the Supabase free tier).
    const urls: Record<string, string> = {};
    for (const v of VARIANTS) {
      const longEdge = Math.max(origWidth, origHeight);
      const scale = longEdge > v.maxEdge ? v.maxEdge / longEdge : 1;
      const targetW = Math.round(origWidth * scale);
      const targetH = Math.round(origHeight * scale);

      // .clone() because .resize() mutates and we need the original for the next pass.
      const variantImg = decoded.clone().resize(targetW, targetH);
      const webp = await variantImg.encode(v.quality);

      const key = deriveKey(sourcePath, v.name);
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(key, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000, immutable" });
      if (upError) return jsonResponse({ error: `upload ${v.name} failed: ${upError.message}` }, 500);

      urls[v.name] = supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
    }

    const original = supabase.storage.from(BUCKET).getPublicUrl(sourcePath).data.publicUrl;

    return jsonResponse({
      url: original,                  // untouched original — used for full-res download
      thumbnail_url: urls["thumb"],   // grid thumbnail
      preview_url: urls["preview"],   // gallery viewing size
      full_webp_url: urls["full-webp"], // lightbox viewing size (large screens)
      width: origWidth,
      height: origHeight,
    });
  } catch (err) {
    console.error("process-upload error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
