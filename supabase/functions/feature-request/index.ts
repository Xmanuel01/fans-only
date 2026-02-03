// Edge function to receive feature requests.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Accepts POST JSON: { message: string }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const message = body.message?.trim();
  if (!message) return json({ error: "message is required" }, 400);

  const user = await supabase.auth.getUser(req.headers.get("Authorization")?.replace("Bearer ", "") ?? "");
  const userId = user.data?.user?.id ?? null;

  const { error } = await supabase.from("feature_requests").insert({
    user_id: userId,
    message,
  });

  if (error) return json({ error: "Insert failed" }, 500);

  return json({ ok: true });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
