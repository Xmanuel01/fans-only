// Scheduled worker: retries queued payout transfers with exponential backoff.
// Recommended via cron every 1-5 minutes.
// Env: PAYSTACK_SECRET_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE (optional),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYOUT_QUEUE_BATCH_SIZE (optional).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

const PAYSTACK_API = "https://api.paystack.co";
const PAYPAL_BASE = Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
const paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
const batchSize = Number(Deno.env.get("PAYOUT_QUEUE_BATCH_SIZE") ?? "20");

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabase) return json({ error: "Supabase not configured" }, 500);

  const authToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const expectedToken = Deno.env.get("PAYOUT_QUEUE_CRON_TOKEN");
  if (expectedToken && authToken !== expectedToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: jobs, error: claimErr } = await supabase.rpc("claim_due_payout_transfers", {
    p_limit: Number.isFinite(batchSize) ? Math.max(1, Math.min(batchSize, 100)) : 20,
  });
  if (claimErr) return json({ error: "Queue claim failed" }, 500);

  const outcomes: Array<{ id: number; action: string; detail?: string }> = [];

  for (const job of jobs ?? []) {
    const transferId: number = job.id;
    const attemptCount: number = (job.attempt_count ?? 0) + 1;
    const maxAttempts: number = job.max_attempts ?? 5;
    const provider: string = job.provider ?? job.metadata?.provider ?? "paystack";

    if (provider === "paypal") {
      const outcome = await handlePaypalPayout({
        transferId,
        attemptCount,
        maxAttempts,
        recipientEmail: job.recipient_code,
        reference: job.reference,
        reason: job.reason ?? "Creator payout retry",
        amountMinor: job.amount_minor,
        currency: job.currency,
      });
      outcomes.push(outcome);
      continue;
    }

    if (!paystackSecret) {
      await scheduleRetry({
        transferId,
        attemptCount,
        maxAttempts,
        failureReason: "PAYSTACK_SECRET_KEY missing",
        statusCode: "500",
        source: "process-payout-queue",
      });
      outcomes.push({ id: transferId, action: "retry_scheduled", detail: "PAYSTACK_SECRET_KEY missing" });
      continue;
    }

    const transferRes = await fetch(`${PAYSTACK_API}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: job.amount_minor,
        recipient: job.recipient_code,
        reason: job.reason ?? "Creator payout retry",
        reference: job.reference,
        currency: job.currency,
      }),
    });

    const transferJson = await transferRes.json();

    if (!transferRes.ok || !transferJson?.data) {
      const failureReason = transferJson?.message ?? "Paystack transfer submit failed";

      const scheduled = await scheduleRetry({
        transferId,
        attemptCount,
        maxAttempts,
        failureReason,
        statusCode: String(transferRes.status),
        source: "process-payout-queue",
      });
      outcomes.push(
        scheduled
          ? { id: transferId, action: "retry_scheduled", detail: failureReason }
          : { id: transferId, action: "failed", detail: failureReason },
      );
      continue;
    }

    const paystackStatus = transferJson.data.status;
    const internalStatus: "submitted" | "success" = paystackStatus === "success" ? "success" : "submitted";

    const { error: markErr } = await supabase.rpc("mark_payout_result", {
      p_transfer_id: transferId,
      p_status: internalStatus,
      p_paystack_transfer_code: transferJson.data.transfer_code?.toString() ?? null,
      p_paystack_transfer_id: transferJson.data.id?.toString() ?? null,
      p_metadata: { source: "process-payout-queue", attemptCount },
    });

    if (markErr) {
      outcomes.push({ id: transferId, action: "error", detail: "mark_payout_result failed" });
      continue;
    }

    await supabase
      .from("payout_transfers")
      .update({
        attempt_count: attemptCount,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transferId);

    outcomes.push({ id: transferId, action: internalStatus });
  }

  return json({ ok: true, claimed: (jobs ?? []).length, outcomes });
});

async function handlePaypalPayout({
  transferId,
  attemptCount,
  maxAttempts,
  recipientEmail,
  reference,
  reason,
  amountMinor,
  currency,
}: {
  transferId: number;
  attemptCount: number;
  maxAttempts: number;
  recipientEmail: string;
  reference: string;
  reason: string;
  amountMinor: number;
  currency: string;
}): Promise<{ id: number; action: string; detail?: string }> {
  if (!paypalClientId || !paypalClientSecret) {
    await scheduleRetry({
      transferId,
      attemptCount,
      maxAttempts,
      failureReason: "PayPal credentials missing",
      statusCode: "500",
      source: "process-payout-queue",
    });
    return { id: transferId, action: "retry_scheduled", detail: "PayPal credentials missing" };
  }
  if (!recipientEmail) {
    await scheduleRetry({
      transferId,
      attemptCount,
      maxAttempts,
      failureReason: "Missing PayPal recipient email",
      statusCode: "400",
      source: "process-payout-queue",
    });
    return { id: transferId, action: "failed", detail: "Missing PayPal recipient email" };
  }

  const token = await getPaypalToken();
  if (!token) {
    await scheduleRetry({
      transferId,
      attemptCount,
      maxAttempts,
      failureReason: "PayPal auth failed",
      statusCode: "401",
      source: "process-payout-queue",
    });
    return { id: transferId, action: "retry_scheduled", detail: "PayPal auth failed" };
  }

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
          sender_item_id: String(transferId),
        },
      ],
    }),
  });

  const payoutJson = await payoutRes.json();
  if (!payoutRes.ok) {
    const failureReason = payoutJson?.message ?? "PayPal payout submit failed";
    const scheduled = await scheduleRetry({
      transferId,
      attemptCount,
      maxAttempts,
      failureReason,
      statusCode: String(payoutRes.status),
      source: "process-payout-queue",
    });
    return scheduled
      ? { id: transferId, action: "retry_scheduled", detail: failureReason }
      : { id: transferId, action: "failed", detail: failureReason };
  }

  const batchId = payoutJson?.batch_header?.payout_batch_id?.toString?.() ?? null;
  const itemId =
    payoutJson?.items?.[0]?.payout_item_id?.toString?.() ??
    payoutJson?.items?.[0]?.payout_item?.payout_item_id?.toString?.() ??
    null;

  const { error: markErr } = await supabase!.rpc("mark_payout_result", {
    p_transfer_id: transferId,
    p_status: "submitted",
    p_metadata: {
      source: "process-payout-queue",
      provider_batch_id: batchId,
      provider_transfer_id: itemId,
    },
  });
  if (markErr) return { id: transferId, action: "error", detail: "mark_payout_result failed" };

  await supabase!
    .from("payout_transfers")
    .update({
      attempt_count: attemptCount,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transferId);

  return { id: transferId, action: "submitted" };
}

async function scheduleRetry({
  transferId,
  attemptCount,
  maxAttempts,
  failureReason,
  statusCode,
  source,
}: {
  transferId: number;
  attemptCount: number;
  maxAttempts: number;
  failureReason: string;
  statusCode: string;
  source: string;
}): Promise<boolean> {
  if (attemptCount >= maxAttempts) {
    await supabase!.rpc("mark_payout_result", {
      p_transfer_id: transferId,
      p_status: "failed",
      p_failure_reason: failureReason,
      p_metadata: { source, terminal: true, attemptCount },
    });
    await supabase!
      .from("payout_transfers")
      .update({
        attempt_count: attemptCount,
        last_attempt_at: new Date().toISOString(),
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transferId);
    return false;
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
      processing_error_code: statusCode,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transferId);
  return true;
}

async function getPaypalToken(): Promise<string | null> {
  const auth = btoa(`${paypalClientId}:${paypalClientSecret}`);
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
