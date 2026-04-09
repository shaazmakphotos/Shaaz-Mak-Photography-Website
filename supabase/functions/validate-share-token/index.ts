import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiting (resets on function restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  
  record.count++;
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   req.headers.get('cf-connecting-ip') || 
                   'unknown';
  const requestId = crypto.randomUUID().substring(0, 8);

  try {
    // Rate limiting check
    if (isRateLimited(clientIp)) {
      console.warn(`[${requestId}] Rate limit exceeded for IP: ${clientIp.substring(0, 10)}...`);
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      console.warn(`[${requestId}] Invalid token provided from IP: ${clientIp.substring(0, 10)}...`);
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token format (basic sanitization)
    if (token.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(token)) {
      console.warn(`[${requestId}] Token failed format validation from IP: ${clientIp.substring(0, 10)}...`);
      return new Response(
        JSON.stringify({ error: 'Invalid token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[${requestId}] Validating share token: ${token.substring(0, 8)}...`);

    // Fetch share link by token (server-side, bypasses RLS)
    const { data: shareLink, error: linkError } = await supabase
      .from('share_links')
      .select('id, album_id, is_full_album, expires_at, albums(title)')
      .eq('token', token)
      .maybeSingle();

    if (linkError) {
      console.error(`[${requestId}] Database error fetching share link:`, linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to validate token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!shareLink) {
      console.warn(`[${requestId}] Share link not found for token from IP: ${clientIp.substring(0, 10)}...`);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired share link' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
      console.warn(`[${requestId}] Share link has expired`);
      return new Response(
        JSON.stringify({ error: 'This share link has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let photos: any[] = [];

    if (shareLink.is_full_album) {
      // Fetch all photos from album
      const { data: allPhotos, error: photosError } = await supabase
        .from('photos')
        .select('id, url, thumbnail_url, title')
        .eq('album_id', shareLink.album_id)
        .order('sort_order', { ascending: true });

      if (photosError) {
        console.error(`[${requestId}] Error fetching photos:`, photosError);
        return new Response(
          JSON.stringify({ error: 'Failed to load photos' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      photos = allPhotos || [];
    } else {
      // Fetch only selected photos
      const { data: sharedPhotos, error: sharedError } = await supabase
        .from('shared_photos')
        .select('photos(id, url, thumbnail_url, title)')
        .eq('share_link_id', shareLink.id);

      if (sharedError) {
        console.error(`[${requestId}] Error fetching shared photos:`, sharedError);
        return new Response(
          JSON.stringify({ error: 'Failed to load photos' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      photos = (sharedPhotos || [])
        .map((sp: any) => sp.photos)
        .filter(Boolean);
    }

    console.log(`[${requestId}] Share link validated successfully. Album: ${(shareLink.albums as any)?.title}, Photos: ${photos.length}`);

    return new Response(
      JSON.stringify({
        album_title: (shareLink.albums as any)?.title || 'Shared Album',
        album_id: shareLink.album_id,
        photos,
        is_full_album: shareLink.is_full_album,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error(`[unknown] Error validating share token:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate share token';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
