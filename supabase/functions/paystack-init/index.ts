// Initialize a Paystack transaction and record a pending payment.
// Env required: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: PAYSTACK_CALLBACK_URL (falls back to request origin + /paystack/callback).
// Direct PPV checkout is intentionally unsupported; PPV unlocks use wallet balance.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors, withCors } from "../_shared/cors.ts";
import { requireAgeConfirmed } from "../_shared/guards.ts";

const PAYSTACK_API = "https://api.paystack.co";
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

type InitRequest = {
  email: string;
  amountMajor?: number; // major units e.g. KES
  amountNaira?: number; // backward compatibility; treated as amountMajor
  currency?: string; // default KES
  metadata?: Record<string, unknown>;
  creator_id?: string;
  post_id?: number;
  type: "tip" | "subscription" | "wallet_topup" | "ppv";
  channels?: string[];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);
  if (!secret) return jsonWithCors({ error: "PAYSTACK_SECRET_KEY missing" }, 500);

  let body: InitRequest;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const amountMajor = Number(body.amountMajor ?? body.amountNaira ?? 0);
  if (!body.email || !amountMajor || !body.type) {
    return jsonWithCors({ error: "email, amountMajor, type required" }, 400);
  }
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return jsonWithCors({ error: "amountMajor must be a positive number" }, 400);
  }

  // Require authenticated + age-confirmed user to create a payment intent
  const { userId, errorResponse } = await requireAgeConfirmed(supabase, req);
  if (errorResponse) return withCors(errorResponse);

  let creatorId: string | null = body.creator_id ?? null;

  if (body.type !== "wallet_topup") {
    if (!creatorId) {
      return jsonWithCors({ error: "creator_id required" }, 400);
    }
    const { data: creatorRow, error: creatorErr } = await supabase
      .from("creators")
      .select("id")
      .eq("id", creatorId)
      .maybeSingle();
    if (creatorErr) return jsonWithCors({ error: "Creator lookup failed" }, 500);
    if (!creatorRow) return jsonWithCors({ error: "Unknown creator_id" }, 400);
  }

  if (body.type === "ppv") {
    return jsonWithCors(
      { error: "Direct PPV checkout is not supported. Use wallet balance to unlock PPV posts." },
      400,
    );
  }

  const amountMinor = Math.round(amountMajor * 100);
  const currency = (body.currency ?? "KES").toUpperCase();
  const creatorRef = creatorId ? creatorId.slice(0, 8) : "wallet";
  const reference = `pay_${userId.slice(0, 8)}_${creatorRef}_${Date.now()}`;
  const callback_url =
    Deno.env.get("PAYSTACK_CALLBACK_URL") ??
    new URL("/paystack/callback", req.url).toString();

  const payload = {
    email: body.email,
    amount: amountMinor,
    currency,
    reference,
    callback_url,
    channels: body.channels?.length ? body.channels : ["mobile_money"],
    metadata: {
      type: body.type,
      creator_id: creatorId,
      post_id: body.post_id ?? null,
      payer_user_id: userId,
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
    return jsonWithCors({ error: "Paystack init failed", details: initJson }, initRes.status);
  }

  // Record pending payment (service role context)
  const { data: payData } = initJson;
  const providerReference = payData?.reference ?? reference;
  const { error: insertErr } = await supabase
    .from("payments")
    .insert({
      provider: "paystack",
      provider_intent_id: providerReference,
      amount_cents: amountMinor,
      currency: payload.currency,
      status: "requires_action",
      creator_id: creatorId,
      user_id: userId,
      type: body.type,
      metadata: payload.metadata ?? {},
    })
    .select()
    .single();
  if (insertErr) {
    return jsonWithCors({ error: "Payment persistence failed" }, 500);
  }

  return jsonWithCors({ authorization_url: payData.authorization_url, reference: providerReference });
});
