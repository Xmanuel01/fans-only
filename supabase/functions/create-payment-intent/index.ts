// Stub edge function for creating payment intents.
// Expects env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (future).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

serve(async (req) => {
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500 });
  }

  // TODO: implement Stripe payment intent creation and persist to payments table.
  // Keep service-role-only logic here; never expose service key to client.

  return new Response(
    JSON.stringify({ message: "create-payment-intent not implemented yet" }),
    { status: 501, headers: { "Content-Type": "application/json" } }
  );
});
