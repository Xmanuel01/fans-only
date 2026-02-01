// Initialize a Paystack transaction and record a pending payment.
// Env required: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: PAYSTACK_CALLBACK_URL (falls back to request origin + /paystack/callback).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

const PAYSTACK_API = "https://api.paystack.co";
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

type InitRequest = {
  email: string;
  amountNaira: number; // amount in NGN (naira)
  currency?: string; // default NGN
  metadata?: Record<string, unknown>;
  creator_id: string;
  type: "tip" | "subscription";
};

serve(async (req) => {
  if (!supabase) return json({ error: "Supabase not configured" }, 500);
  if (!secret) return json({ error: "PAYSTACK_SECRET_KEY missing" }, 500);

  let body: InitRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.email || !body.amountNaira || !body.creator_id) {
    return json({ error: "email, amountNaira, creator_id required" }, 400);
  }

  const amountKobo = Math.round(body.amountNaira * 100);
  const callback_url =
    Deno.env.get("PAYSTACK_CALLBACK_URL") ??
    new URL("/paystack/callback", req.url).toString();

  const payload = {
    email: body.email,
    amount: amountKobo,
    currency: body.currency ?? "NGN",
    callback_url,
    metadata: {
      type: body.type,
      creator_id: body.creator_id,
      ...body.metadata,
    },
  };

  const initRes = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const initJson = await initRes.json();
  if (!initRes.ok) {
    return json({ error: "Paystack init failed", details: initJson }, initRes.status);
  }

  // Record pending payment (service role context)
  const { data: payData } = initJson;
  await supabase
    .from("payments")
    .insert({
      provider: "paystack",
      provider_intent_id: payData.reference,
      amount_cents: amountKobo, // kobo is NGN*100; treating as "cents" equivalent
      currency: payload.currency,
      status: "requires_action",
      creator_id: body.creator_id,
    })
    .select()
    .single();

  return json({ authorization_url: payData.authorization_url, reference: payData.reference });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
