// Complete a hosted Paystack card authorization flow and save the card payout destination.
// Env: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireCreatorPaymentAccess } from "../_shared/guards.ts";

const PAYSTACK_API = "https://api.paystack.co";
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

type Body = {
  reference: string;
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

  const reference = body.reference?.trim();
  if (!reference) {
    return jsonWithCors({ error: "reference is required" }, 400);
  }

  const verifyRes = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });
  const verifyJson = await verifyRes.json();

  if (!verifyRes.ok || !verifyJson?.data) {
    return jsonWithCors({ error: "Paystack transaction verification failed", details: verifyJson }, 400);
  }

  const transaction = verifyJson.data;
  if (transaction.status !== "success") {
    return jsonWithCors({ error: "Card setup payment was not successful" }, 400);
  }

  const metadata = transaction.metadata ?? {};
  if (metadata.type !== "creator_card_setup") {
    return jsonWithCors({ error: "Invalid card setup transaction type" }, 400);
  }
  if (metadata.creator_id !== creatorId) {
    return jsonWithCors({ error: "Card setup transaction does not belong to this creator" }, 403);
  }

  const authorization = transaction.authorization ?? {};
  const customer = transaction.customer ?? {};
  const authorizationCode = authorization.authorization_code?.toString?.() ?? null;
  const reusable = Boolean(authorization.reusable);
  const customerEmail =
    customer.email?.toString?.().trim?.().toLowerCase?.() ??
    metadata.creator_email?.toString?.().trim?.().toLowerCase?.() ??
    null;

  if (!authorizationCode || !reusable || !customerEmail) {
    return jsonWithCors({
      error:
        "Paystack did not return a reusable card authorization for payouts. Use Bank or M-PESA instead.",
    }, 400);
  }

  const recipientRes = await fetch(`${PAYSTACK_API}/transferrecipient`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "authorization",
      name: customerEmail,
      email: customerEmail,
      authorization_code: authorizationCode,
      currency: "KES",
    }),
  });
  const recipientJson = await recipientRes.json();
  if (!recipientRes.ok || !recipientJson?.data?.recipient_code) {
    return jsonWithCors({
      error: "Paystack card recipient creation failed. Use Bank or M-PESA instead.",
      details: recipientJson,
    }, 400);
  }

  const cardLast4 = authorization.last4?.toString?.() ?? null;
  const cardBrand = authorization.brand?.toString?.() ?? authorization.card_type?.toString?.() ?? null;
  const expMonth = authorization.exp_month ? Number(authorization.exp_month) : null;
  const expYear = authorization.exp_year ? Number(authorization.exp_year) : null;
  const signature = authorization.signature?.toString?.() ?? null;

  const { error: upsertErr } = await supabase.from("creator_payout_accounts").upsert({
    creator_id: creatorId,
    provider: "card",
    currency: "KES",
    account_name: customerEmail,
    account_number_last4: cardLast4,
    recipient_code: recipientJson.data.recipient_code,
    recipient_active: Boolean(recipientJson.data.active ?? true),
    provider_account_id: recipientJson.data.id?.toString?.() ?? null,
    recipient_type: recipientJson.data.type ?? "authorization",
    paystack_authorization_code: authorizationCode,
    paystack_authorization_signature: signature,
    paystack_customer_code: customer.customer_code?.toString?.() ?? null,
    card_brand: cardBrand,
    card_exp_month: Number.isFinite(expMonth) ? expMonth : null,
    card_exp_year: Number.isFinite(expYear) ? expYear : null,
    kyc_status: "pending",
    kyc_last_checked_at: new Date().toISOString(),
    verified_at: null,
    verified_by: null,
    verification_source: "manual_review_required",
    verification_metadata: {
      manual_review_required: true,
      provider_active: Boolean(recipientJson.data.active ?? true),
      recipient_type: recipientJson.data.type ?? "authorization",
      source_reference: reference,
    },
    metadata: {
      source: "paystack.card_setup",
      card_brand: cardBrand,
      customer_email: customerEmail,
      reusable_authorization: true,
    },
    last_error: null,
    updated_at: new Date().toISOString(),
  });

  if (upsertErr) {
    return jsonWithCors({ error: "Card payout destination save failed" }, 500);
  }

  return jsonWithCors({
    ok: true,
    payoutAccount: {
      provider: "card",
      currency: "KES",
      accountName: customerEmail,
      accountNumberMasked: cardLast4 ? `****${cardLast4}` : null,
      cardBrand,
      expMonth,
      expYear,
      recipientCode: recipientJson.data.recipient_code,
      kycStatus: "pending",
    },
  });
});
