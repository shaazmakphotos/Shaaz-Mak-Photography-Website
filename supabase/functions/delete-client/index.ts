import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get the authorization header to verify admin status
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the requesting user is an admin
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if requesting user is admin
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !adminRole) {
      console.error('Admin check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the userId to delete from request body
    const { userId } = await req.json();
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deleting client with userId:', userId);

    // Step 1: Get all albums for this client
    const { data: albums, error: albumsError } = await supabaseAdmin
      .from('albums')
      .select('id')
      .eq('client_id', userId);

    if (albumsError) {
      console.error('Error fetching albums:', albumsError);
      throw albumsError;
    }

    console.log('Found albums:', albums?.length || 0);

    // Step 2: For each album, get all photos and delete from storage
    if (albums && albums.length > 0) {
      for (const album of albums) {
        const { data: photos, error: photosError } = await supabaseAdmin
          .from('photos')
          .select('url')
          .eq('album_id', album.id);

        if (photosError) {
          console.error('Error fetching photos:', photosError);
          continue;
        }

        // Delete photos from storage
        if (photos && photos.length > 0) {
          const filePaths = photos
            .map(photo => {
              const urlParts = photo.url.split('/photos/');
              return urlParts.length > 1 ? urlParts[1] : null;
            })
            .filter(Boolean) as string[];

          if (filePaths.length > 0) {
            const { error: storageError } = await supabaseAdmin.storage
              .from('photos')
              .remove(filePaths);

            if (storageError) {
              console.error('Error deleting photos from storage:', storageError);
            } else {
              console.log('Deleted', filePaths.length, 'photos from storage');
            }
          }
        }

        // Delete photos from database (will be done by cascade, but let's be explicit)
        await supabaseAdmin
          .from('photos')
          .delete()
          .eq('album_id', album.id);
      }

      // Step 3: Delete all albums
      const { error: deleteAlbumsError } = await supabaseAdmin
        .from('albums')
        .delete()
        .eq('client_id', userId);

      if (deleteAlbumsError) {
        console.error('Error deleting albums:', deleteAlbumsError);
        throw deleteAlbumsError;
      }

      console.log('Deleted', albums.length, 'albums');
    }

    // Step 4: Delete the user (this will cascade delete profiles and user_roles)
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('Error deleting user:', deleteUserError);
      throw deleteUserError;
    }

    console.log('Successfully deleted client:', userId);

    return new Response(
      JSON.stringify({ success: true, message: 'Client deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in delete-client function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete client';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
