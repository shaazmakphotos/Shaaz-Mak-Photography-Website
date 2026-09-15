// backfill-variants: walks photos / portfolio_photos / homepage_photos rows that
// are missing real derived WebP variants, regenerates them the same way
// process-upload does, and writes the new URLs back to the row.
//
// A row needs work when thumbnail_url / preview_url is null, equal to the
// original `url`, or not under `/derived/` (legacy upload fallback used to
// copy the original into those columns).
//
// Idempotent — safe to re-run. Admin-only.
// Requires migration 20260408000000_add_image_variants for preview_url writes;
// if that column is missing we still write thumbnail_url + dimensions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";
import { decode, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "photos";
const PAGE_SIZE = 25; // Process this many rows per table per invocation; small enough to fit in the function timeout.
const CANDIDATE_FETCH = 200;

const VARIANTS = [
  { name: "thumb",     maxEdge: 480,  quality: 70 },
  { name: "preview",   maxEdge: 1600, quality: 80 },
  { name: "full-webp", maxEdge: 2560, quality: 85 },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Extract the storage key from a public URL like
// https://<project>.supabase.co/storage/v1/object/public/photos/<key>
function urlToStorageKey(url: string): string | null {
  const m = url.match(/\/object\/public\/photos\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function variantKey(srcKey: string, variant: string) {
  // For legacy rows the original was uploaded directly under e.g. "<albumId>/<file>.jpg"
  // (no "originals/" prefix). We just nest derived/<variant>/ in front of whatever the
  // original key was, dropping the file extension and adding .webp.
  const stripped = srcKey.replace(/^originals\//, "");
  const noExt = stripped.replace(/\.[^.]+$/, "");
  return `derived/${variant}/${noExt}.webp`;
}

function isDerivedVariant(candidate: string | null | undefined, original: string): boolean {
  if (!candidate) return false;
  if (candidate.split("?")[0] === original.split("?")[0]) return false;
  return candidate.includes("/derived/");
}

type PhotoRow = {
  id: string;
  url: string;
  thumbnail_url?: string | null;
  preview_url?: string | null;
};

function needsVariants(row: PhotoRow, requirePreview: boolean): boolean {
  const thumbOk = isDerivedVariant(row.thumbnail_url, row.url);
  if (!requirePreview) return !thumbOk;
  const previewOk = isDerivedVariant(row.preview_url, row.url);
  return !thumbOk || !previewOk;
}

async function processRow(
  supabase: ReturnType<typeof createClient>,
  table: "photos" | "portfolio_photos" | "homepage_photos",
  row: PhotoRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const srcKey = urlToStorageKey(row.url);
  if (!srcKey) return { ok: false, error: `cannot parse storage key from url: ${row.url}` };

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(srcKey);
  if (dlErr || !blob) return { ok: false, error: `download failed: ${dlErr?.message}` };

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decoded = await decode(bytes);
  if (!(decoded instanceof Image)) return { ok: false, error: "unsupported image" };

  const origW = decoded.width;
  const origH = decoded.height;
  const urls: Record<string, string> = {};

  for (const v of VARIANTS) {
    const longEdge = Math.max(origW, origH);
    const scale = longEdge > v.maxEdge ? v.maxEdge / longEdge : 1;
    const variantImg = decoded.clone().resize(Math.round(origW * scale), Math.round(origH * scale));
    const webp = await variantImg.encode(v.quality);

    const key = variantKey(srcKey, v.name);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(key, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000, immutable" });
    if (upErr) return { ok: false, error: `upload ${v.name} failed: ${upErr.message}` };

    urls[v.name] = supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }

  // Prefer writing preview_url; if the column migration isn't applied yet, still
  // persist thumbnail_url + dimensions so client grids can load fast.
  let { error: updErr } = await supabase
    .from(table)
    .update({
      thumbnail_url: urls["thumb"],
      preview_url: urls["preview"],
      width: origW,
      height: origH,
    })
    .eq("id", row.id);

  if (updErr && /preview_url|schema cache|column/i.test(updErr.message)) {
    ({ error: updErr } = await supabase
      .from(table)
      .update({
        thumbnail_url: urls["thumb"],
        width: origW,
        height: origH,
      })
      .eq("id", row.id));
  }
  if (updErr) return { ok: false, error: `db update failed: ${updErr.message}` };

  return { ok: true };
}

async function fetchCandidates(
  supabase: ReturnType<typeof createClient>,
  table: "photos" | "portfolio_photos" | "homepage_photos",
): Promise<{ rows: PhotoRow[]; requirePreview: boolean; error?: string }> {
  let requirePreview = true;
  let { data, error } = await supabase
    .from(table)
    .select("id, url, thumbnail_url, preview_url")
    .limit(CANDIDATE_FETCH);

  if (error && /preview_url|schema cache|column/i.test(error.message)) {
    requirePreview = false;
    ({ data, error } = await supabase
      .from(table)
      .select("id, url, thumbnail_url")
      .limit(CANDIDATE_FETCH));
  }
  if (error) return { rows: [], requirePreview, error: error.message };

  const needing = ((data ?? []) as PhotoRow[]).filter((row) => needsVariants(row, requirePreview));
  return { rows: needing, requirePreview };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing auth" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "invalid token" }, 401);

    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleData?.role !== "admin") return json({ error: "admin only" }, 403);

    const tables: Array<"photos" | "portfolio_photos" | "homepage_photos"> = [
      "photos",
      "portfolio_photos",
      "homepage_photos",
    ];

    const summary: Record<string, { processed: number; failed: number; remaining: number; errors: string[] }> = {};

    for (const table of tables) {
      const { rows: candidates, error: selErr } = await fetchCandidates(supabase, table);
      if (selErr) return json({ error: `select ${table} failed: ${selErr}` }, 500);

      const batch = candidates.slice(0, PAGE_SIZE);
      const result = { processed: 0, failed: 0, remaining: 0, errors: [] as string[] };

      for (const row of batch) {
        const r = await processRow(supabase, table, row);
        if (r.ok) result.processed++;
        else { result.failed++; result.errors.push(`${row.id}: ${r.error}`); }
      }

      // Remaining ≈ candidates not yet processed in this page (lower bound if > CANDIDATE_FETCH exist).
      result.remaining = Math.max(0, candidates.length - result.processed);
      summary[table] = result;
    }

    return json({ summary });
  } catch (err) {
    console.error("backfill-variants error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
