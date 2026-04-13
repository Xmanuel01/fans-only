// Request payout from creator balance to a Paystack-backed recipient via Paystack transfers.
// Env: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireCreatorPaymentAccess } from "../_shared/guards.ts";

const PAYSTACK_API = "https://api.paystack.co";
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

type Body = {
  amountMinor: number;
  currency?: string;
  reason?: string;
  provider?: "mpesa" | "bank" | "card";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);
  if (!secret) return jsonWithCors({ error: "PAYSTACK_SECRET_KEY missing" }, 500);

  const { creatorId, errorResponse } = await requireCreatorPaymentAccess(supabase, req);
  if (errorResponse) return jsonWithCors(await errorResponse.json(), errorResponse.status);

  let body: Body = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const requestedProvider = body.provider?.trim?.() as "mpesa" | "bank" | "card" | undefined;
  let payoutQuery = supabase
    .from("creator_payout_accounts")
    .select("provider, recipient_code, currency, recipient_active, bank_code, account_number_last4, kyc_status")
    .eq("creator_id", creatorId);
  if (requestedProvider) {
    payoutQuery = payoutQuery.eq("provider", requestedProvider);
  }
  const { data: payoutAccount, error: payoutAccountErr } = await payoutQuery.maybeSingle();
  if (payoutAccountErr) return jsonWithCors({ error: "Payout account lookup failed" }, 500);
  if (!payoutAccount || !payoutAccount.recipient_code) {
    return jsonWithCors({ error: "Payout destination not configured" }, 400);
  }
  if (!payoutAccount.recipient_active) {
    return jsonWithCors({ error: "Payout destination inactive" }, 400);
  }
  if (payoutAccount.kyc_status !== "verified") {
    return jsonWithCors({ error: "Payout destination requires KYC verification" }, 400);
  }
  if (payoutAccount.provider === "paypal") {
    return jsonWithCors({ error: "Use PayPal payout endpoint for PayPal payouts" }, 400);
  }

  const currency = (body.currency ?? payoutAccount.currency ?? "KES").toUpperCase();
  if (currency !== "KES") {
    return jsonWithCors({ error: "KES is the only supported payout currency" }, 400);
  }
  const { data: balanceRow, error: balanceErr } = await supabase
    .from("creator_balances")
    .select("available_amount_minor, pending_amount_minor, currency")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (balanceErr) return jsonWithCors({ error: "Balance lookup failed" }, 500);
  if (!balanceRow) return jsonWithCors({ error: "No available balance" }, 400);
  if (balanceRow.currency !== currency) return jsonWithCors({ error: "Balance currency mismatch" }, 400);

  const amountMinor = Math.round(Number(body.amountMinor));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return jsonWithCors({ error: "amountMinor must be positive" }, 400);
  }
  if (amountMinor > balanceRow.available_amount_minor) {
    return jsonWithCors({ error: "Insufficient available balance" }, 400);
  }

  const idempotencyKey = req.headers.get("x-idempotency-key") ?? crypto.randomUUID();
  const reference = `payout_${creatorId.slice(0, 8)}_${Date.now()}`;
  const reason = body.reason?.trim() || "Creator payout";

  const { data: payoutTransferId, error: queueErr } = await supabase.rpc("request_creator_payout", {
    p_creator_id: creatorId,
    p_amount_minor: amountMinor,
    p_currency: currency,
    p_recipient_code: payoutAccount.recipient_code,
    p_reason: reason,
    p_requested_by: creatorId,
    p_idempotency_key: idempotencyKey,
    p_reference: reference,
    p_metadata: { source: "request-creator-payout", provider: "paystack", payout_provider: payoutAccount.provider },
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

  const submitResult = await submitTransferNow({
    payoutTransferId,
    reference,
    recipientCode: payoutAccount.recipient_code,
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
      recipient_code: payoutAccount.recipient_code,
    },
  });
});

async function submitTransferNow({
  payoutTransferId,
  reference,
  recipientCode,
  reason,
  amountMinor,
  currency,
}: {
  payoutTransferId: number;
  reference: string;
  recipientCode: string;
  reason: string;
  amountMinor: number;
  currency: string;
}): Promise<
  | { ok: true; status: "queued" | "submitted" | "success" }
  | { ok: false; error: string; details?: unknown }
> {
  const transferRes = await fetch(`${PAYSTACK_API}/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: amountMinor,
      recipient: recipientCode,
      reason,
      reference,
      currency,
    }),
  });

  const transferJson = await transferRes.json();
  if (!transferRes.ok || !transferJson?.data) {
    const failureReason = transferJson?.message ?? "Paystack transfer submit failed";

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
        p_metadata: { source: "paystack.transfer", phase: "submit", terminal: true, attemptCount },
      });
      return { ok: false, error: "Paystack transfer failed permanently", details: transferJson };
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
        processing_error_code: String(transferRes.status),
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payoutTransferId);

    return { ok: true, status: "queued" };
  }

  const paystackStatus = transferJson.data.status;
  const internalStatus: "submitted" | "success" = paystackStatus === "success" ? "success" : "submitted";

  const { error: markErr } = await supabase!.rpc("mark_payout_result", {
    p_transfer_id: payoutTransferId,
    p_status: internalStatus,
    p_paystack_transfer_code: transferJson.data.transfer_code?.toString() ?? null,
    p_paystack_transfer_id: transferJson.data.id?.toString() ?? null,
    p_metadata: { source: "paystack.transfer", phase: "submit" },
  });
  if (markErr) {
    const { error: fallbackErr } = await supabase!
      .from("payout_transfers")
      .update({
        status: internalStatus,
        paystack_transfer_code: transferJson.data.transfer_code?.toString() ?? null,
        paystack_transfer_id: transferJson.data.id?.toString() ?? null,
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payoutTransferId);
    if (fallbackErr) return { ok: false, error: "Payout state update failed" };
    return { ok: true, status: internalStatus };
  }

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

  return { ok: true, status: internalStatus };
}
