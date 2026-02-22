// Edge function to receive feature requests.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Accepts POST JSON: { message: string }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors, withCors } from "../_shared/cors.ts";
import { requireAgeConfirmed } from "../_shared/guards.ts";

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

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const message = body.message?.trim();
  if (!message) return jsonWithCors({ error: "message is required" }, 400);

  // Optional auth: if bearer token present, require age confirmation; otherwise allow anonymous feedback
  const authHeader = req.headers.get("Authorization");
  let userId: string | null = null;
  if (authHeader) {
    const result = await requireAgeConfirmed(supabase, req);
    if (result.errorResponse) return withCors(result.errorResponse);
    userId = result.userId;
  }

  const { error } = await supabase.from("feature_requests").insert({
    user_id: userId,
    message,
  });

  if (error) return jsonWithCors({ error: "Insert failed" }, 500);

  return jsonWithCors({ ok: true });
});
