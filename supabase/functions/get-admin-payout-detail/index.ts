import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireAdminAccess } from "../_shared/guards.ts";

type Body = {
  transferId?: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const { role, errorResponse } = await requireAdminAccess(supabase, req);
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
  if (!Number.isFinite(transferId) || transferId <= 0) {
    return jsonWithCors({ error: "transferId is required" }, 400);
  }

  const { data: transfer, error } = await supabase
    .from("payout_transfers")
    .select(
      "id, creator_id, amount_minor, currency, status, reference, recipient_code, reason, failure_reason, metadata, created_at, updated_at, manual_hold, hold_reason, external_reference, proof_path, settled_at, requested_by",
    )
    .eq("id", transferId)
    .maybeSingle();
  if (error || !transfer) {
    return jsonWithCors({ error: "Withdrawal request not found" }, 404);
  }

  const metadata =
    transfer.metadata && typeof transfer.metadata === "object" && !Array.isArray(transfer.metadata)
      ? transfer.metadata
      : {};
  const creatorId = transfer.creator_id;

  const [creatorResult, methodResult, controlsResult, notesResult, auditResult, notificationResult] =
    await Promise.all([
      supabase
        .from("creators")
        .select("id, display_name, handle, avatar_url, created_at")
        .eq("id", creatorId)
        .maybeSingle(),
      supabase
        .from("creator_withdrawal_methods")
        .select("method, currency, account_name, bank_code, bank_name, account_number, phone_number, updated_at")
        .eq("creator_id", creatorId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("creator_payout_controls")
        .select("payout_changes_locked, payout_changes_lock_reason, updated_at")
        .eq("creator_id", creatorId)
        .maybeSingle(),
      supabase
        .from("payout_admin_notes")
        .select("id, author_id, author_email, author_role, body, created_at")
        .eq("payout_transfer_id", transferId)
        .order("created_at", { ascending: false }),
      supabase
        .from("payout_admin_audit_log")
        .select("id, actor_id, actor_email, actor_role, action, from_status, to_status, note, metadata, created_at")
        .eq("payout_transfer_id", transferId)
        .order("created_at", { ascending: false }),
      supabase
        .from("payout_notification_events")
        .select("id, event_kind, recipient_email, channel, provider, status, provider_message_id, error_message, metadata, created_at")
        .eq("payout_transfer_id", transferId)
        .order("created_at", { ascending: false }),
    ]);

  const creatorAuth = await supabase.auth.admin.getUserById(creatorId).catch(() => ({ data: { user: null } }));
  const creatorEmail = creatorAuth.data.user?.email ?? null;

  let proofUrl: string | null = null;
  if (transfer.proof_path) {
    const signed = await supabase.storage.from("admin-payout-proofs").createSignedUrl(transfer.proof_path, 60 * 60).catch(() => null);
    proofUrl = signed?.data?.signedUrl ?? null;
  }

  return jsonWithCors({
    role,
    request: {
      id: transfer.id,
      creatorId,
      creatorName: creatorResult.data?.display_name ?? null,
      creatorHandle: creatorResult.data?.handle ?? null,
      creatorAvatarUrl: creatorResult.data?.avatar_url ?? null,
      creatorCreatedAt: creatorResult.data?.created_at ?? null,
      creatorEmail,
      amountMinor: transfer.amount_minor,
      currency: transfer.currency,
      status: transfer.status,
      reference: transfer.reference,
      recipientCode: transfer.recipient_code,
      reason: transfer.reason,
      failureReason: transfer.failure_reason,
      metadata,
      destinationSnapshot:
        metadata.destination_snapshot &&
          typeof metadata.destination_snapshot === "object" &&
          !Array.isArray(metadata.destination_snapshot)
          ? metadata.destination_snapshot
          : null,
      creatorSnapshot:
        metadata.creator_snapshot &&
          typeof metadata.creator_snapshot === "object" &&
          !Array.isArray(metadata.creator_snapshot)
          ? metadata.creator_snapshot
          : null,
      requestedMethod:
        typeof metadata.requested_method === "string" ? metadata.requested_method : null,
      manualHold: Boolean(transfer.manual_hold),
      holdReason: transfer.hold_reason ?? null,
      externalReference: transfer.external_reference ?? null,
      proofPath: transfer.proof_path ?? null,
      proofUrl,
      settledAt: transfer.settled_at ?? null,
      requestedBy: transfer.requested_by ?? null,
      createdAt: transfer.created_at,
      updatedAt: transfer.updated_at,
    },
    savedMethods: (methodResult.data ?? []).map((item) => ({
      method: item.method,
      currency: item.currency,
      accountName: item.account_name,
      bankCode: item.bank_code,
      bankName: item.bank_name,
      accountNumberLast4: item.account_number?.slice(-4) ?? null,
      phoneNumberLast4: item.phone_number?.slice(-4) ?? null,
      updatedAt: item.updated_at,
    })),
    controls: {
      payoutChangesLocked: controlsResult.data?.payout_changes_locked ?? false,
      payoutChangesLockReason: controlsResult.data?.payout_changes_lock_reason ?? null,
      updatedAt: controlsResult.data?.updated_at ?? null,
    },
    notes: notesResult.data ?? [],
    auditLog: auditResult.data ?? [],
    notifications: notificationResult.data ?? [],
  });
});
