import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check if any admin already exists
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    if (checkError) {
      console.error('Error checking for existing admins:', checkError);
      throw new Error('Failed to check for existing admins');
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ error: 'An admin account already exists. This setup can only be used once.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { password } = await req.json();

    // Validate password strength
    const validatePassword = (pwd: string): { valid: boolean; error?: string } => {
      if (!pwd || pwd.length < 12) {
        return { valid: false, error: 'Password must be at least 12 characters' };
      }
      if (!/[a-z]/.test(pwd)) {
        return { valid: false, error: 'Password must contain lowercase letters' };
      }
      if (!/[A-Z]/.test(pwd)) {
        return { valid: false, error: 'Password must contain uppercase letters' };
      }
      if (!/[0-9]/.test(pwd)) {
        return { valid: false, error: 'Password must contain numbers' };
      }
      if (!/[^a-zA-Z0-9]/.test(pwd)) {
        return { valid: false, error: 'Password must contain special characters' };
      }
      return { valid: true };
    };

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ error: passwordValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const email = 'Shaaz.Maknojiya@gmail.com';

    // Create the admin user
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Shaaz Maknojiya' }
    });

    if (createError) {
      console.error('Error creating admin user:', createError);
      throw createError;
    }

    console.log('Admin user created successfully:', userData.user?.id);

    // Update the role to admin (the trigger already creates a 'client' role)
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: 'admin' })
      .eq('user_id', userData.user!.id);

    if (roleError) {
      console.error('Error updating role to admin:', roleError);
      throw roleError;
    }

    console.log('Admin role assigned successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Admin account created successfully! You can now login at /login' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create admin account';
    console.error('Setup admin error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
