// Server-side update of profiles.age_confirmed_at to keep an auditable trail.
// Expects env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonWithCors({ error: "Method not allowed" }, 405);
  }

  if (!supabase) {
    return jsonWithCors({ error: "Supabase not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return jsonWithCors({ error: "Missing bearer token" }, 401);
  }

  let userId: string | undefined;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) throw error ?? new Error("No user");
    userId = data.user.id;
  } catch (_err) {
    return jsonWithCors({ error: "Invalid token" }, 401);
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ age_confirmed_at: new Date().toISOString() })
    .eq("id", userId);

  if (updateError) {
    return jsonWithCors({ error: "Update failed" }, 500);
  }

  return jsonWithCors({ ok: true }, 200);
});
