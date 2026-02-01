// Stub edge function to handle Stripe webhooks.
// Expects env: STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

serve(async (_req) => {
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500 });
  }

  // TODO: verify Stripe signature, update payments/subscriptions, enqueue notifications.

  return new Response(
    JSON.stringify({ message: "stripe-webhook not implemented yet" }),
    { status: 501, headers: { "Content-Type": "application/json" } }
  );
});
