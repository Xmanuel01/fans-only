// Handle Paystack webhooks to confirm payments.
// Env: PAYSTACK_SECRET_KEY (for optional validation), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

// Note: Paystack signs events with a SHA512 hash in `x-paystack-signature`.
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

serve(async (req) => {
  if (!supabase) return json({ error: "Supabase not configured" }, 500);

  const signature = req.headers.get("x-paystack-signature");
  const bodyText = await req.text();

  if (secret) {
    const hash = await hmacSHA512(bodyText, secret);
    if (hash !== signature) return json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(bodyText);
  const eventType = event?.event;
  const data = event?.data;
  if (!eventType || !data) return json({ error: "Malformed payload" }, 400);

  // Only handle successful charge events for now.
  if (eventType === "charge.success") {
    const reference = data.reference;
    const amount = data.amount; // kobo
    const currency = data.currency ?? "NGN";

    await supabase
      .from("payments")
      .update({
        status: "succeeded",
        amount_cents: amount,
        currency,
      })
      .eq("provider", "paystack")
      .eq("provider_intent_id", reference);

    // TODO: create subscriptions or tips based on metadata.
  }

  return json({ ok: true });
});

async function hmacSHA512(content: string, key: string) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(content));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
