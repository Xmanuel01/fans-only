// Start a hosted Paystack card authorization flow for creator card payouts.
// Env: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireCreatorPaymentAccess } from "../_shared/guards.ts";

const PAYSTACK_API = "https://api.paystack.co";
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
const cardSetupAmountMajor = Number(Deno.env.get("PAYSTACK_CARD_SETUP_AMOUNT_MAJOR") ?? "100");

type Body = {
  email: string;
  returnUrl: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);
  if (!secret) return jsonWithCors({ error: "PAYSTACK_SECRET_KEY missing" }, 500);

  const { creatorId, errorResponse } = await requireCreatorPaymentAccess(supabase, req);
  if (errorResponse) return jsonWithCors(await errorResponse.json(), errorResponse.status);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return jsonWithCors({ error: "A valid email is required for secure card setup" }, 400);
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(body.returnUrl);
  } catch {
    return jsonWithCors({ error: "returnUrl must be a valid absolute URL" }, 400);
  }

  const requestOrigin = req.headers.get("origin");
  if (requestOrigin && callbackUrl.origin !== requestOrigin) {
    return jsonWithCors({ error: "returnUrl origin mismatch" }, 400);
  }

  callbackUrl.searchParams.set("paystack_card_setup", "1");

  const amountMinor = Math.round(cardSetupAmountMajor * 100);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return jsonWithCors({ error: "PAYSTACK_CARD_SETUP_AMOUNT_MAJOR must be positive" }, 500);
  }

  const reference = `card_setup_${creatorId.slice(0, 8)}_${Date.now()}`;
  const initRes = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountMinor,
      currency: "KES",
      callback_url: callbackUrl.toString(),
      channels: ["card"],
      reference,
      metadata: {
        type: "creator_card_setup",
        creator_id: creatorId,
        creator_email: email,
      },
    }),
  });

  const initJson = await initRes.json();
  if (!initRes.ok || !initJson?.data?.authorization_url) {
    return jsonWithCors({ error: "Paystack card setup init failed", details: initJson }, 400);
  }

  return jsonWithCors({
    ok: true,
    authorization_url: initJson.data.authorization_url,
    reference,
    amount_major: cardSetupAmountMajor,
  });
});
