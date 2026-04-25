// Upsert creator payout destination using the active transfer recipient provider (mobile money).
// Env: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireCreatorPaymentAccess } from "../_shared/guards.ts";

const PAYSTACK_API = "https://api.paystack.co";
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

type Body = {
  accountNumber: string;
  accountName: string;
  bankCode?: string;
  currency?: string;
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

  const accountNumber = body.accountNumber?.trim();
  const accountName = body.accountName?.trim();
  const bankCode = body.bankCode?.trim() || "MPESA";
  const currency = (body.currency?.trim() || "KES").toUpperCase();

  if (!accountNumber || !accountName) {
    return jsonWithCors({ error: "accountNumber and accountName are required" }, 400);
  }
  if (accountNumber.length < 7 || accountNumber.length > 20) {
    return jsonWithCors({ error: "accountNumber format is invalid" }, 400);
  }

  const recipientRes = await fetch(`${PAYSTACK_API}/transferrecipient`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "mobile_money",
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency,
    }),
  });

  const recipientJson = await recipientRes.json();
  if (!recipientRes.ok || !recipientJson?.data?.recipient_code) {
    return jsonWithCors({ error: "Mobile money payout destination setup failed", details: recipientJson }, 400);
  }
  const accountNumberLast4 = accountNumber.slice(-4);
  const { error: upsertErr } = await supabase.from("creator_payout_accounts").upsert({
    creator_id: creatorId,
    provider: "mpesa",
    currency,
    account_name: accountName,
    account_number_last4: accountNumberLast4,
    bank_code: bankCode,
    recipient_code: recipientJson.data.recipient_code,
    recipient_active: Boolean(recipientJson.data.active ?? true),
    msisdn_e164: accountNumber,
    provider_account_id: recipientJson.data.id?.toString?.() ?? null,
    recipient_type: recipientJson.data.type ?? "mobile_money",
    kyc_status: "pending",
    kyc_last_checked_at: new Date().toISOString(),
    verified_at: null,
    verified_by: null,
    verification_source: "manual_review_required",
    verification_metadata: {
      manual_review_required: true,
      provider_active: Boolean(recipientJson.data.active ?? true),
      recipient_type: recipientJson.data.type ?? "mobile_money",
      msisdn_e164: accountNumber,
    },
    metadata: {
      recipient_name: recipientJson.data.name ?? null,
      recipient_type: recipientJson.data.type ?? "mobile_money",
      provider_active: Boolean(recipientJson.data.active ?? true),
    },
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  if (upsertErr) return jsonWithCors({ error: "Payout account save failed" }, 500);

  return jsonWithCors({
    ok: true,
    payoutAccount: {
      provider: "mpesa",
      currency,
      bankCode,
      accountName,
      accountNumberMasked: `****${accountNumberLast4}`,
      recipientCode: recipientJson.data.recipient_code,
      kycStatus: "pending",
    },
  });
});
