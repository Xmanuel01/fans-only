// Upsert creator payout destination using Paystack transfer recipient (bank account).
// Env: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";

const PAYSTACK_API = "https://api.paystack.co";
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

type Body = {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName?: string;
  currency?: string;
  kycStatus?: "pending" | "verified" | "rejected";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);
  if (!secret) return jsonWithCors({ error: "PAYSTACK_SECRET_KEY missing" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return jsonWithCors({ error: "Missing bearer token" }, 401);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) return jsonWithCors({ error: "Invalid token" }, 401);
  const creatorId = userData.user.id;

  const { data: creatorRow, error: creatorErr } = await supabase
    .from("creators")
    .select("id")
    .eq("id", creatorId)
    .maybeSingle();
  if (creatorErr) return jsonWithCors({ error: "Creator lookup failed" }, 500);
  if (!creatorRow) return jsonWithCors({ error: "Creator profile required" }, 403);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const accountNumber = body.accountNumber?.trim();
  const accountName = body.accountName?.trim();
  const bankCode = body.bankCode?.trim();
  const bankName = body.bankName?.trim() || null;
  const currency = (body.currency?.trim() || "KES").toUpperCase();

  if (!accountNumber || !accountName || !bankCode) {
    return jsonWithCors({ error: "accountNumber, accountName, and bankCode are required" }, 400);
  }
  if (accountNumber.length < 6 || accountNumber.length > 20) {
    return jsonWithCors({ error: "accountNumber format is invalid" }, 400);
  }

  const recipientRes = await fetch(`${PAYSTACK_API}/transferrecipient`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "bank_account",
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency,
    }),
  });

  const recipientJson = await recipientRes.json();
  if (!recipientRes.ok || !recipientJson?.data?.recipient_code) {
    return jsonWithCors({ error: "Paystack recipient create failed", details: recipientJson }, 400);
  }

  const kycStatus =
    body.kycStatus ?? (recipientJson?.data?.active === true ? "verified" : "pending");

  const accountNumberLast4 = accountNumber.slice(-4);
  const { error: upsertErr } = await supabase.from("creator_payout_accounts").upsert({
    creator_id: creatorId,
    provider: "bank",
    currency,
    account_name: accountName,
    account_number_last4: accountNumberLast4,
    bank_code: bankCode,
    bank_name: bankName,
    recipient_code: recipientJson.data.recipient_code,
    recipient_active: Boolean(recipientJson.data.active ?? true),
    provider_account_id: recipientJson.data.id?.toString?.() ?? null,
    recipient_type: recipientJson.data.type ?? "bank_account",
    kyc_status: kycStatus,
    kyc_last_checked_at: new Date().toISOString(),
    metadata: {
      recipient_name: recipientJson.data.name ?? null,
      bank_name: bankName,
    },
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  if (upsertErr) return jsonWithCors({ error: "Payout account save failed" }, 500);

  return jsonWithCors({
    ok: true,
    payoutAccount: {
      provider: "bank",
      currency,
      bankCode,
      bankName,
      accountName,
      accountNumberMasked: `****${accountNumberLast4}`,
      recipientCode: recipientJson.data.recipient_code,
    },
  });
});
