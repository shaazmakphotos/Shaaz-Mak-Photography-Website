// update-client: admin-only edge function for editing an existing client
// account. Lets the admin change the full name, username, and (optionally)
// reset the password. Mirrors the structure of create-client/delete-client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Verify caller is an admin.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing auth" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "invalid token" }, 401);

    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleData?.role !== "admin") return json({ error: "admin only" }, 403);

    const { userId, fullName, username, password } = await req.json();
    if (!userId) return json({ error: "userId required" }, 400);

    // 1. Update profile (full_name + username) if provided.
    const profilePatch: Record<string, string> = {};
    if (typeof fullName === "string" && fullName.trim()) profilePatch.full_name = fullName.trim();
    if (typeof username === "string" && username.trim()) {
      // Username uniqueness check, ignoring the row that belongs to this user.
      // Case-insensitive — login is case-insensitive, so "London26" and "london26"
      // must be treated as the same name.
      const { data: clash } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("username", username.trim())
        .neq("user_id", userId)
        .maybeSingle();
      if (clash) return json({ error: "Username already taken" }, 400);
      profilePatch.username = username.trim();
    }
    if (Object.keys(profilePatch).length > 0) {
      const { error: profErr } = await supabase.from("profiles").update(profilePatch).eq("user_id", userId);
      if (profErr) return json({ error: profErr.message }, 500);
    }

    // 2. Reset password via the admin API if provided.
    if (typeof password === "string" && password.length > 0) {
      if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
      const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, { password });
      if (pwErr) return json({ error: pwErr.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("update-client error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
