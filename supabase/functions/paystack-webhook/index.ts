// Handle Paystack webhooks to confirm payments.
// Env: PAYSTACK_SECRET_KEY (required), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

// Paystack signs events with a SHA512 hash in `x-paystack-signature`.
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

serve(async (req) => {
  if (!supabase) return json({ error: "Supabase not configured" }, 500);
  if (!secret) return json({ error: "PAYSTACK_SECRET_KEY missing" }, 500);

  const signature = req.headers.get("x-paystack-signature");
  const bodyText = await req.text();
  if (!signature) return json({ error: "Missing signature" }, 400);

  const hash = await hmacSHA512(bodyText, secret);
  if (hash !== signature) return json({ error: "Invalid signature" }, 400);

  let event: { event?: string; data?: any };
  try {
    event = JSON.parse(bodyText);
  } catch {
    return json({ error: "Malformed JSON" }, 400);
  }

  const eventType = event?.event;
  const data = event?.data;
  if (!eventType || !data) return json({ error: "Malformed payload" }, 400);

  const reference: string | undefined = data.reference;
  if (!reference) return json({ error: "Missing reference" }, 400);

  // Idempotency: bail if already succeeded
  const { data: paymentRow, error: fetchErr } = await supabase
    .from("payments")
    .select("id, status, type, creator_id, user_id")
    .eq("provider", "paystack")
    .eq("provider_intent_id", reference)
    .maybeSingle();

  if (fetchErr) return json({ error: "DB fetch error" }, 500);
  if (!paymentRow) return json({ error: "Unknown payment reference" }, 404);
  if (paymentRow.status === "succeeded") return json({ ok: true, already_processed: true });

  if (eventType === "charge.success") {
    const amount = data.amount; // kobo
    const currency = data.currency ?? "NGN";

    const { error: updateErr } = await supabase
      .from("payments")
      .update({
        status: "succeeded",
        amount_cents: amount,
        currency,
        provider_event_id: data.id?.toString() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "paystack")
      .eq("provider_intent_id", reference);

    if (updateErr) return json({ error: "Update failed" }, 500);

    // TODO: create subscriptions or tips based on type once flows are wired.
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
