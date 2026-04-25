// Scheduled worker: retries queued payout transfers with exponential backoff.
// Recommended via cron every 1-5 minutes.
// Env: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYOUT_QUEUE_BATCH_SIZE (optional).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

const PAYSTACK_API = "https://api.paystack.co";
const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
const batchSize = Number(Deno.env.get("PAYOUT_QUEUE_BATCH_SIZE") ?? "20");

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabase) return json({ error: "Supabase not configured" }, 500);

  const authToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const expectedToken = Deno.env.get("PAYOUT_QUEUE_CRON_TOKEN");
  if (!expectedToken) {
    return json({ error: "PAYOUT_QUEUE_CRON_TOKEN missing" }, 500);
  }
  if (authToken !== expectedToken) {
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
      const fallbackUpdated = await fallbackMarkSubmitted({
        transferId,
        attemptCount,
        status: internalStatus,
        paystackTransferCode: transferJson.data.transfer_code?.toString() ?? null,
        paystackTransferId: transferJson.data.id?.toString() ?? null,
      });
      outcomes.push({
        id: transferId,
        action: fallbackUpdated ? internalStatus : "error",
        detail: fallbackUpdated ? "fallback_state_update" : "mark_payout_result failed",
      });
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

async function fallbackMarkSubmitted({
  transferId,
  attemptCount,
  status,
  paystackTransferCode = null,
  paystackTransferId = null,
}: {
  transferId: number;
  attemptCount: number;
  status: "submitted" | "success";
  paystackTransferCode?: string | null;
  paystackTransferId?: string | null;
}) {
  const { error } = await supabase!
    .from("payout_transfers")
    .update({
      status,
      paystack_transfer_code: paystackTransferCode,
      paystack_transfer_id: paystackTransferId,
      attempt_count: attemptCount,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transferId);
  return !error;
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
