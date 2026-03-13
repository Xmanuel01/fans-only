// Request payout from creator balance to PayPal email using PayPal Payouts.
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE (optional),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";

const PAYPAL_BASE = Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");

type Body = {
  amountMinor?: number;
  currency?: string;
  reason?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);
  if (!clientId || !clientSecret) return jsonWithCors({ error: "PayPal env missing" }, 500);

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

  let body: Body = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const { data: payoutAccount, error: payoutAccountErr } = await supabase
    .from("creator_payout_accounts")
    .select("paypal_email, currency, recipient_active, kyc_status")
    .eq("creator_id", creatorId)
    .eq("provider", "paypal")
    .maybeSingle();
  if (payoutAccountErr) return jsonWithCors({ error: "Payout account lookup failed" }, 500);
  if (!payoutAccount || !payoutAccount.paypal_email) {
    return jsonWithCors({ error: "PayPal destination not configured" }, 400);
  }
  if (!payoutAccount.recipient_active) {
    return jsonWithCors({ error: "Payout destination inactive" }, 400);
  }
  if (payoutAccount.kyc_status !== "verified") {
    return jsonWithCors({ error: "Payout destination requires KYC verification" }, 400);
  }

  const { data: balanceRow, error: balanceErr } = await supabase
    .from("creator_balances")
    .select("available_amount_minor, pending_amount_minor, currency")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (balanceErr) return jsonWithCors({ error: "Balance lookup failed" }, 500);
  if (!balanceRow) return jsonWithCors({ error: "No available balance" }, 400);
  const currency = (balanceRow.currency ?? payoutAccount.currency ?? body.currency ?? "USD").toUpperCase();

  const requestedAmount = Number(body.amountMinor ?? 0);
  const amountMinor = requestedAmount > 0 ? Math.round(requestedAmount) : balanceRow.available_amount_minor;
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return jsonWithCors({ error: "amountMinor must be positive" }, 400);
  }
  if (amountMinor > balanceRow.available_amount_minor) {
    return jsonWithCors({ error: "Insufficient available balance" }, 400);
  }

  const idempotencyKey = req.headers.get("x-idempotency-key") ?? crypto.randomUUID();
  const reference = `paypal_${creatorId.slice(0, 8)}_${Date.now()}`;
  const reason = body.reason?.trim() || "Creator payout (PayPal)";

  const { data: payoutTransferId, error: queueErr } = await supabase.rpc("request_creator_payout", {
    p_creator_id: creatorId,
    p_amount_minor: amountMinor,
    p_currency: currency,
    p_recipient_code: payoutAccount.paypal_email,
    p_reason: reason,
    p_requested_by: creatorId,
    p_idempotency_key: idempotencyKey,
    p_reference: reference,
    p_metadata: { source: "request-paypal-payout", provider: "paypal", paypal_email: payoutAccount.paypal_email },
  });
  if (queueErr) {
    if (queueErr.code === "23505") {
      const { data: existing, error: existingErr } = await supabase
        .from("payout_transfers")
        .select("id, status, reference, amount_minor, currency")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingErr) return jsonWithCors({ error: "Idempotency lookup failed" }, 500);
      if (existing) return jsonWithCors({ ok: true, transfer: existing, idempotent: true });
    }
    return jsonWithCors({ error: "Payout queue failed", details: queueErr.message }, 400);
  }

  const submitResult = await submitPaypalPayout({
    payoutTransferId,
    reference,
    recipientEmail: payoutAccount.paypal_email,
    reason,
    amountMinor,
    currency,
  });
  if (!submitResult.ok) {
    return jsonWithCors({ error: submitResult.error, details: submitResult.details }, 400);
  }

  return jsonWithCors({
    ok: true,
    transfer: {
      id: payoutTransferId,
      status: submitResult.status,
      amount_minor: amountMinor,
      currency,
      reference,
      recipient_email: payoutAccount.paypal_email,
    },
  });
});

async function submitPaypalPayout({
  payoutTransferId,
  reference,
  recipientEmail,
  reason,
  amountMinor,
  currency,
}: {
  payoutTransferId: number;
  reference: string;
  recipientEmail: string;
  reason: string;
  amountMinor: number;
  currency: string;
}): Promise<
  | { ok: true; status: "queued" | "submitted" | "success" }
  | { ok: false; error: string; details?: unknown }
> {
  const token = await getPaypalToken();
  if (!token) return { ok: false, error: "PayPal auth failed" };

  const amountValue = (amountMinor / 100).toFixed(2);
  const payoutRes = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": reference,
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: reference,
        email_subject: "You have a new payout",
        email_message: reason,
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: recipientEmail,
          amount: { value: amountValue, currency },
          note: reason,
          sender_item_id: String(payoutTransferId),
        },
      ],
    }),
  });

  const payoutJson = await payoutRes.json();
  if (!payoutRes.ok) {
    const failureReason = payoutJson?.message ?? "PayPal payout submit failed";

    const { data: transferState } = await supabase!
      .from("payout_transfers")
      .select("attempt_count, max_attempts")
      .eq("id", payoutTransferId)
      .maybeSingle();
    const attemptCount = (transferState?.attempt_count ?? 0) + 1;
    const maxAttempts = transferState?.max_attempts ?? 5;

    if (attemptCount >= maxAttempts) {
      await supabase!.rpc("mark_payout_result", {
        p_transfer_id: payoutTransferId,
        p_status: "failed",
        p_failure_reason: failureReason,
        p_metadata: { source: "paypal.payout", phase: "submit", terminal: true, attemptCount },
      });
      return { ok: false, error: "PayPal payout failed permanently", details: payoutJson };
    }

    const backoffMinutes = Math.min(60, 2 ** Math.min(attemptCount, 5));
    await supabase!
      .from("payout_transfers")
      .update({
        status: "queued",
        attempt_count: attemptCount,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
        failure_reason: failureReason,
        processing_error_code: String(payoutRes.status),
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payoutTransferId);

    return { ok: true, status: "queued" };
  }

  const batchId = payoutJson?.batch_header?.payout_batch_id?.toString?.() ?? null;
  const itemId =
    payoutJson?.items?.[0]?.payout_item_id?.toString?.() ??
    payoutJson?.items?.[0]?.payout_item?.payout_item_id?.toString?.() ??
    null;

  const { error: markErr } = await supabase!.rpc("mark_payout_result", {
    p_transfer_id: payoutTransferId,
    p_status: "submitted",
    p_metadata: {
      source: "paypal.payout",
      phase: "submit",
      provider_batch_id: batchId,
      provider_transfer_id: itemId,
    },
  });
  if (markErr) return { ok: false, error: "Payout state update failed" };

  await supabase!
    .from("payout_transfers")
    .update({
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payoutTransferId);

  return { ok: true, status: "submitted" };
}

async function getPaypalToken(): Promise<string | null> {
  const auth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json();
  if (!res.ok) return null;
  return json.access_token ?? null;
}
