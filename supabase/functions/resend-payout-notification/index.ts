import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireAdminAccess } from "../_shared/guards.ts";
import { buildPayoutAdminRecipients, sendResendEmail } from "../_shared/email.ts";
import { recordNotificationEvent, recordPayoutAudit } from "../_shared/admin.ts";

type Body = {
  transferId?: number;
  eventKind?: "creator_requested" | "admin_requested" | "creator_status";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const { userId, email, role, errorResponse } = await requireAdminAccess(supabase, req, {
    minimumRole: "operator",
    requireRecentSignInMinutes: 30,
  });
  if (errorResponse) {
    return jsonWithCors(JSON.parse(await errorResponse.text()), errorResponse.status);
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
  const eventKind = body.eventKind;
  if (!Number.isFinite(transferId) || transferId <= 0) {
    return jsonWithCors({ error: "transferId is required" }, 400);
  }
  if (!eventKind) {
    return jsonWithCors({ error: "eventKind is required" }, 400);
  }

  const { data: transfer, error } = await supabase
    .from("payout_transfers")
    .select("id, creator_id, amount_minor, currency, status, reference, metadata")
    .eq("id", transferId)
    .maybeSingle();
  if (error || !transfer) {
    return jsonWithCors({ error: "Withdrawal request not found" }, 404);
  }

  const metadata =
    transfer.metadata && typeof transfer.metadata === "object" && !Array.isArray(transfer.metadata)
      ? transfer.metadata
      : {};
  const destination =
    metadata.destination_snapshot &&
      typeof metadata.destination_snapshot === "object" &&
      !Array.isArray(metadata.destination_snapshot)
      ? metadata.destination_snapshot as Record<string, unknown>
      : {};
  const requestedMethod = typeof metadata.requested_method === "string" ? metadata.requested_method : "bank";
  const creatorAuth = await supabase.auth.admin.getUserById(transfer.creator_id).catch(() => ({ data: { user: null } }));
  const creatorEmail = creatorAuth.data.user?.email ?? null;
  const adminRecipients = buildPayoutAdminRecipients();
  const destinationText =
    requestedMethod === "bank"
      ? `${destination.bankName ?? "Bank"} ${destination.accountNumberMasked ?? ""}`.trim()
      : `${destination.bankCode ?? "Mobile money"} ${destination.phoneNumberMasked ?? ""}`.trim();
  const amountLabel = formatMinorCurrency(transfer.amount_minor, transfer.currency);

  const jobs: Array<Promise<unknown>> = [];
  if (eventKind === "creator_requested" && creatorEmail) {
    jobs.push(
      resendAndRecord({
        transferId,
        eventKind: "creator_requested",
        recipientEmail: creatorEmail,
        emailCall: () =>
          sendResendEmail({
            to: creatorEmail,
            subject: "Withdrawal request received",
            html: `<p>Your withdrawal request for <strong>${amountLabel}</strong> has been received.</p><p>Destination: ${destinationText}</p><p>Reference: ${transfer.reference}</p><p>Processing can take up to 5 working days.</p>`,
            text: `Your withdrawal request for ${amountLabel} has been received.\nDestination: ${destinationText}\nReference: ${transfer.reference}`,
          }),
      }),
    );
  }

  if (eventKind === "admin_requested" && adminRecipients.length) {
    for (const recipient of adminRecipients) {
      jobs.push(
        resendAndRecord({
          transferId,
          eventKind: "admin_requested",
          recipientEmail: recipient,
          emailCall: () =>
            sendResendEmail({
              to: recipient,
              subject: "New creator withdrawal request",
              html: `<p>A creator submitted a withdrawal request.</p><p>Amount: <strong>${amountLabel}</strong></p><p>Method: ${requestedMethod === "bank" ? "Bank payout" : "Mobile money payout"}</p><p>Destination: ${destinationText}</p><p>Reference: ${transfer.reference}</p>`,
              text: `New creator withdrawal request\nAmount: ${amountLabel}\nMethod: ${requestedMethod === "bank" ? "Bank payout" : "Mobile money payout"}\nDestination: ${destinationText}\nReference: ${transfer.reference}`,
            }),
        }),
      );
    }
  }

  if (eventKind === "creator_status" && creatorEmail) {
    const statusCopy =
      transfer.status === "success"
        ? "Your withdrawal has been completed."
        : transfer.status === "submitted"
          ? "Your withdrawal is now being processed."
          : transfer.status === "failed"
            ? "Your withdrawal request could not be completed."
            : "Your withdrawal amount has been returned to your available balance.";
    jobs.push(
      resendAndRecord({
        transferId,
        eventKind: "creator_status",
        recipientEmail: creatorEmail,
        emailCall: () =>
          sendResendEmail({
            to: creatorEmail,
            subject:
              transfer.status === "success"
                ? "Withdrawal completed"
                : transfer.status === "submitted"
                  ? "Withdrawal is being processed"
                  : "Withdrawal update",
            html: `<p>${statusCopy}</p><p>Amount: <strong>${amountLabel}</strong></p><p>Reference: ${transfer.reference}</p>`,
            text: `${statusCopy}\nAmount: ${amountLabel}\nReference: ${transfer.reference}`,
          }),
      }),
    );
  }

  await Promise.all(jobs);
  await recordPayoutAudit(supabase, {
    payoutTransferId: transferId,
    actorId: userId,
    actorEmail: email,
    actorRole: role,
    action: "notification_resent",
    metadata: { event_kind: eventKind },
  });

  return jsonWithCors({ ok: true });
});

async function resendAndRecord(params: {
  transferId: number;
  eventKind: "creator_requested" | "admin_requested" | "creator_status";
  recipientEmail: string;
  emailCall: () => Promise<{ skipped: boolean; ok?: boolean; status?: number; body?: string }>;
}) {
  const result = await params.emailCall();
  await recordNotificationEvent(supabase!, {
    payoutTransferId: params.transferId,
    eventKind: "admin_resend",
    recipientEmail: params.recipientEmail,
    status: result.skipped ? "skipped" : result.ok ? "sent" : "failed",
    errorMessage: result.ok ? null : result.body ?? null,
    metadata: {
      original_event_kind: params.eventKind,
    },
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
