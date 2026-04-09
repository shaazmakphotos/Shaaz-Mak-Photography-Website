import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 20; // Download 20 photos in parallel at a time
const FETCH_TIMEOUT = 30000; // 30 second timeout per photo

// Fetch a single photo with timeout
async function fetchPhotoWithTimeout(url: string, timeoutMs: number): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      console.error(`Failed to fetch photo: ${response.status}`);
      return null;
    }
    return await response.arrayBuffer();
  } catch (error: unknown) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      console.error(`Timeout fetching photo: ${url}`);
    } else {
      console.error(`Error fetching photo: ${err.message || 'Unknown error'}`);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Download photos in parallel batches
async function downloadPhotosInBatches(
  photos: { id: string; url: string; title: string | null }[],
  zip: JSZip
): Promise<number> {
  let successCount = 0;
  const totalBatches = Math.ceil(photos.length / BATCH_SIZE);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE;
    const batch = photos.slice(startIdx, startIdx + BATCH_SIZE);
    
    console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (photos ${startIdx + 1}-${startIdx + batch.length})`);
    
    // Download all photos in this batch in parallel
    const results = await Promise.all(
      batch.map(async (photo, idx) => {
        const arrayBuffer = await fetchPhotoWithTimeout(photo.url, FETCH_TIMEOUT);
        return {
          photo,
          arrayBuffer,
          globalIndex: startIdx + idx,
        };
      })
    );
    
    // Add successful downloads to ZIP
    for (const { photo, arrayBuffer, globalIndex } of results) {
      if (arrayBuffer) {
        const extension = photo.url.split('.').pop()?.split('?')[0] || 'jpg';
        const fileName = photo.title 
          ? `${photo.title.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`
          : `photo_${String(globalIndex + 1).padStart(3, '0')}.${extension}`;
        
        zip.file(fileName, arrayBuffer);
        successCount++;
      }
    }
    
    console.log(`Batch ${batchIndex + 1} complete: ${results.filter(r => r.arrayBuffer).length}/${batch.length} photos added`);
  }
  
  return successCount;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { albumId, photoIds, shareToken } = await req.json();

    if (!albumId) {
      return new Response(
        JSON.stringify({ error: 'Album ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Authorization check
    let isAuthorized = false;
    let authorizedPhotoIds: string[] | null = null;

    // Check 1: If a share token is provided, validate it
    if (shareToken && typeof shareToken === 'string') {
      console.log('Validating share token for download access...');
      
      // Validate token format
      if (shareToken.length <= 100 && /^[a-zA-Z0-9_-]+$/.test(shareToken)) {
        const { data: shareLink, error: linkError } = await supabaseAdmin
          .from('share_links')
          .select('id, album_id, is_full_album, expires_at')
          .eq('token', shareToken)
          .maybeSingle();

        if (!linkError && shareLink && shareLink.album_id === albumId) {
          // Check expiration
          if (!shareLink.expires_at || new Date(shareLink.expires_at) >= new Date()) {
            isAuthorized = true;
            console.log('Share token validated successfully');

            // If not full album, get the allowed photo IDs
            if (!shareLink.is_full_album) {
              const { data: sharedPhotos } = await supabaseAdmin
                .from('shared_photos')
                .select('photo_id')
                .eq('share_link_id', shareLink.id);
              
              authorizedPhotoIds = (sharedPhotos || []).map(sp => sp.photo_id);
              console.log(`Share link allows ${authorizedPhotoIds.length} specific photos`);
            }
          } else {
            console.log('Share token has expired');
          }
        }
      }
    }

    // Check 2: If no share token or invalid, check user authentication
    if (!isAuthorized) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

        if (!authError && user) {
          console.log(`Authenticated user: ${user.id}`);

          // Check if user owns the album
          const { data: album, error: albumOwnerError } = await supabaseAdmin
            .from('albums')
            .select('client_id')
            .eq('id', albumId)
            .single();

          if (!albumOwnerError && album) {
            if (album.client_id === user.id) {
              isAuthorized = true;
              console.log('User owns the album');
            } else {
              // Check if user is admin
              const { data: roleData } = await supabaseAdmin
                .from('user_roles')
                .select('role')
                .eq('user_id', user.id)
                .eq('role', 'admin')
                .maybeSingle();

              if (roleData) {
                isAuthorized = true;
                console.log('User is admin');
              }
            }
          }
        }
      }
    }

    if (!isAuthorized) {
      console.log('Authorization failed - no valid share token or user permission');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - you do not have access to this album' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch album info
    const { data: album, error: albumError } = await supabaseAdmin
      .from('albums')
      .select('title')
      .eq('id', albumId)
      .single();

    if (albumError || !album) {
      console.error('Album fetch error:', albumError);
      return new Response(
        JSON.stringify({ error: 'Album not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch photos - either all or specific ones
    let query = supabaseAdmin
      .from('photos')
      .select('id, url, title')
      .eq('album_id', albumId)
      .order('sort_order', { ascending: true });

    // If specific photos requested, filter by those
    if (photoIds && photoIds.length > 0) {
      query = query.in('id', photoIds);
    }

    // If share token limits to specific photos, enforce that
    if (authorizedPhotoIds !== null) {
      query = query.in('id', authorizedPhotoIds);
    }

    const { data: photos, error: photosError } = await query;

    if (photosError || !photos || photos.length === 0) {
      console.error('Photos fetch error:', photosError);
      return new Response(
        JSON.stringify({ error: 'No photos found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating ZIP for album "${album.title}" with ${photos.length} photos using parallel batch processing`);
    const startTime = Date.now();

    // Create ZIP file
    const zip = new JSZip();

    // Download photos in parallel batches
    const successCount = await downloadPhotosInBatches(photos, zip);
    
    if (successCount === 0) {
      return new Response(
        JSON.stringify({ error: 'Failed to download any photos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate ZIP as ArrayBuffer
    const zipContent = await zip.generateAsync({ type: 'arraybuffer' });
    const albumName = album.title.replace(/[^a-zA-Z0-9]/g, '_');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`ZIP created successfully: ${zipContent.byteLength} bytes, ${successCount}/${photos.length} photos in ${elapsed}s`);

    return new Response(zipContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${albumName}.zip"`,
      },
    });
  } catch (error: unknown) {
    console.error('Error creating ZIP:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create ZIP';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
