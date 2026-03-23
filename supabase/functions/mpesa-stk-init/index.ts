// Initiate M-PESA STK push for wallet top-ups (Daraja).
// Env: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_SHORTCODE, MPESA_CALLBACK_URL
// Optional: MPESA_ENV ("sandbox" | "live")
// Requires bearer token (age confirmed).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireAgeConfirmed } from "../_shared/guards.ts";

const MPESA_ENV = (Deno.env.get("MPESA_ENV") ?? "sandbox").toLowerCase();
const MPESA_BASE =
  MPESA_ENV === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
const passkey = Deno.env.get("MPESA_PASSKEY");
const shortcode = Deno.env.get("MPESA_SHORTCODE");
const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL");
const callbackToken = Deno.env.get("MPESA_CALLBACK_TOKEN");

type Body = {
  phone: string;
  amountMajor: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  if (!consumerKey || !consumerSecret || !passkey || !shortcode || !callbackUrl || !callbackToken) {
    return jsonWithCors({ error: "M-PESA environment variables missing" }, 500);
  }

  const { userId, errorResponse } = await requireAgeConfirmed(supabase, req);
  if (errorResponse) return jsonWithCors(await errorResponse.json(), errorResponse.status);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const phone = normalizePhone(body.phone);
  const amountMajor = Number(body.amountMajor);
  if (!phone) return jsonWithCors({ error: "Valid phone number is required" }, 400);
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return jsonWithCors({ error: "amountMajor must be positive" }, 400);
  }

  let callbackEndpoint: string;
  try {
    const callback = new URL(callbackUrl);
    callback.searchParams.set("token", callbackToken);
    callbackEndpoint = callback.toString();
  } catch {
    return jsonWithCors({ error: "Invalid MPESA_CALLBACK_URL" }, 500);
  }

  const token = await getMpesaToken();
  if (!token) return jsonWithCors({ error: "M-PESA auth failed" }, 500);

  const timestamp = mpesaTimestamp();
  const password = btoa(`${shortcode}${passkey}${timestamp}`);
  const requestPayload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(amountMajor),
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackEndpoint,
    AccountReference: `WALLET-${userId.slice(0, 8)}`,
    TransactionDesc: "Wallet top up",
  };

  const stkRes = await fetch(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });

  const stkJson = await stkRes.json();
  if (!stkRes.ok || stkJson?.ResponseCode !== "0") {
    return jsonWithCors({ error: "STK push failed", details: stkJson }, 400);
  }

  const checkoutRequestId = stkJson.CheckoutRequestID?.toString?.();
  const merchantRequestId = stkJson.MerchantRequestID?.toString?.();
  if (!checkoutRequestId) return jsonWithCors({ error: "Missing CheckoutRequestID" }, 500);

  const amountMinor = Math.round(Number(amountMajor) * 100);
  const { error: paymentErr } = await supabase.from("payments").insert({
    user_id: userId,
    amount_cents: amountMinor,
    currency: "KES",
    status: "requires_action",
    provider: "mpesa",
    provider_intent_id: checkoutRequestId,
    provider_event_id: merchantRequestId ?? null,
    type: "wallet_topup",
    metadata: {
      phone,
      amount_major: amountMajor,
      merchant_request_id: merchantRequestId ?? null,
      source: "mpesa.stk",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (paymentErr) return jsonWithCors({ error: "Payment record creation failed" }, 500);

  return jsonWithCors({
    ok: true,
    checkoutRequestId,
    merchantRequestId,
    customerMessage: stkJson.CustomerMessage ?? "STK prompt sent",
  });
});

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }
  if (digits.startsWith("254") && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  if (digits.startsWith("7") && digits.length === 9) {
    return `254${digits}`;
  }
  return null;
}

async function getMpesaToken(): Promise<string | null> {
  const auth = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  const json = await res.json();
  if (!res.ok) return null;
  return json.access_token ?? null;
}

function mpesaTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}
