// Server-side update of profiles.age_confirmed_at to keep an auditable trail.
// Expects env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

serve(async (req) => {
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401 });
  }

  let userId: string | undefined;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) throw error ?? new Error("No user");
    userId = data.user.id;
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ age_confirmed_at: new Date().toISOString() })
    .eq("id", userId);

  if (updateError) {
    return new Response(JSON.stringify({ error: "Update failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
