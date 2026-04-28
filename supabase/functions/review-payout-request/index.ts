import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { sendResendEmail } from "../_shared/email.ts";
import { requireAdminAccess } from "../_shared/guards.ts";

type Body = {
  transferId?: number;
  status?: "submitted" | "success" | "failed" | "reversed";
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

const operatorToken = Deno.env.get("OPERATOR_API_TOKEN");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const bearerToken = req.headers.get("Authorization")?.replace("Bearer ", "").trim() ?? "";
  const headerToken = req.headers.get("x-operator-token")?.trim() ?? "";
  const suppliedToken = headerToken || bearerToken;
  const operatorAuthorized = Boolean(operatorToken && suppliedToken && suppliedToken === operatorToken);
  if (!operatorAuthorized) {
    const { errorResponse } = await requireAdminAccess(supabase, req);
    if (errorResponse) {
      return jsonWithCors(JSON.parse(await errorResponse.text()), errorResponse.status);
    }
  }

  let body: Body = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const transferId = Number(body.transferId);
  if (!Number.isFinite(transferId) || transferId <= 0) {
    return jsonWithCors({ error: "transferId is required" }, 400);
  }
  if (!body.status || !["submitted", "success", "failed", "reversed"].includes(body.status)) {
    return jsonWithCors({ error: "status must be submitted, success, failed, or reversed" }, 400);
  }

  const { data: transfer, error: transferErr } = await supabase
    .from("payout_transfers")
    .select("id, creator_id, amount_minor, currency, reference, metadata, failure_reason")
    .eq("id", transferId)
    .maybeSingle();
  if (transferErr || !transfer) {
    return jsonWithCors({ error: "Payout transfer not found" }, 404);
  }

  const { error: markErr } = await supabase.rpc("mark_payout_result", {
    p_transfer_id: transferId,
    p_status: body.status,
    p_failure_reason: body.reason ?? null,
    p_metadata: {
      source: "review-payout-request",
      ...(body.metadata ?? {}),
    },
  });
  if (markErr) {
    return jsonWithCors({ error: "Could not update payout request", details: markErr.message }, 400);
  }

  await notifyCreatorStatus({
    creatorId: transfer.creator_id,
    amountMinor: transfer.amount_minor,
    currency: transfer.currency,
    reference: transfer.reference,
    status: body.status,
    reason: body.reason ?? null,
  });

  return jsonWithCors({ ok: true });
});

async function notifyCreatorStatus(params: {
  creatorId: string;
  amountMinor: number;
  currency: string;
  reference: string;
  status: "submitted" | "success" | "failed" | "reversed";
  reason: string | null;
}) {
  const creator = await supabase!.auth.admin.getUserById(params.creatorId).catch((error) => {
    console.warn("Could not load creator email for payout status update", error);
    return { data: { user: null } };
  });
  const creatorEmail = creator.data.user?.email ?? null;
  if (!creatorEmail) return;

  const amountLabel = formatMinorCurrency(params.amountMinor, params.currency);
  const subject =
    params.status === "success"
      ? "Withdrawal completed"
      : params.status === "submitted"
        ? "Withdrawal is being processed"
        : "Withdrawal update";
  const statusCopy =
    params.status === "success"
      ? "Your withdrawal has been completed."
      : params.status === "submitted"
        ? "Your withdrawal is now being processed."
        : params.status === "failed"
          ? "Your withdrawal request could not be completed."
          : "Your withdrawal amount has been returned to your available balance.";

  await sendResendEmail({
    to: creatorEmail,
    subject,
    html: `<p>${statusCopy}</p>
<p>Amount: <strong>${amountLabel}</strong></p>
<p>Reference: ${params.reference}</p>
${params.reason ? `<p>Reason: ${params.reason}</p>` : ""}`,
    text: `${statusCopy}\nAmount: ${amountLabel}\nReference: ${params.reference}${params.reason ? `\nReason: ${params.reason}` : ""}`,
  });
}

function formatMinorCurrency(amountMinor: number, currency: string) {
  const amount = Math.max(0, amountMinor);
  const major = amount / 100;
  if (currency === "KES") {
    return `KSh ${major.toLocaleString(undefined, {
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${currency} ${major.toLocaleString(undefined, {
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
