import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireAdminAccess } from "../_shared/guards.ts";

type Body = {
  status?: "queued" | "submitted" | "success" | "failed" | "reversed" | "open" | "all";
  limit?: number;
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

  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
  const normalizedStatus = body.status ?? "all";
  const openStatuses = ["queued", "submitted"];

  let query = supabase
    .from("payout_transfers")
    .select(
      "id, creator_id, amount_minor, currency, status, reference, recipient_code, reason, failure_reason, metadata, created_at, updated_at, manual_hold, hold_reason, external_reference, proof_path, settled_at",
    )
    .filter("metadata->>workflow", "eq", "manual_review")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (normalizedStatus === "open") {
    query = query.in("status", openStatuses);
  } else if (
    normalizedStatus === "queued" ||
    normalizedStatus === "submitted" ||
    normalizedStatus === "success" ||
    normalizedStatus === "failed" ||
    normalizedStatus === "reversed"
  ) {
    query = query.eq("status", normalizedStatus);
  }

  const { data: transfers, error } = await query;
  if (error) {
    return jsonWithCors({ error: "Could not load payout requests", details: error.message }, 400);
  }

  const creatorIds = Array.from(new Set((transfers ?? []).map((item) => item.creator_id)));
  const creatorsById = new Map<
    string,
    { display_name: string | null; handle: string | null; created_at: string | null; avatar_url: string | null }
  >();
  if (creatorIds.length) {
    const { data: creators } = await supabase
      .from("creators")
      .select("id, display_name, handle, created_at, avatar_url")
      .in("id", creatorIds);
    for (const creator of creators ?? []) {
      creatorsById.set(creator.id, {
        display_name: creator.display_name ?? null,
        handle: creator.handle ?? null,
        created_at: creator.created_at ?? null,
        avatar_url: creator.avatar_url ?? null,
      });
    }
  }

  const methodRowsByCreator = new Map<
    string,
    Array<{
      method: string;
      bank_code: string | null;
      bank_name: string | null;
      account_name: string;
      account_number: string | null;
      phone_number: string | null;
      updated_at: string | null;
    }>
  >();
  if (creatorIds.length) {
    const { data: methods } = await supabase
      .from("creator_withdrawal_methods")
      .select("creator_id, method, bank_code, bank_name, account_name, account_number, phone_number, updated_at")
      .in("creator_id", creatorIds)
      .order("updated_at", { ascending: false });
    for (const method of methods ?? []) {
      const list = methodRowsByCreator.get(method.creator_id) ?? [];
      list.push(method);
      methodRowsByCreator.set(method.creator_id, list);
    }
  }

  const payoutControlsByCreator = new Map<
    string,
    { payout_changes_locked: boolean; payout_changes_lock_reason: string | null; updated_at: string | null }
  >();
  if (creatorIds.length) {
    const { data: controls } = await supabase
      .from("creator_payout_controls")
      .select("creator_id, payout_changes_locked, payout_changes_lock_reason, updated_at")
      .in("creator_id", creatorIds);
    for (const control of controls ?? []) {
      payoutControlsByCreator.set(control.creator_id, {
        payout_changes_locked: control.payout_changes_locked ?? false,
        payout_changes_lock_reason: control.payout_changes_lock_reason ?? null,
        updated_at: control.updated_at ?? null,
      });
    }
  }

  const creatorEmailsById = new Map<string, string | null>();
  await Promise.all(
    creatorIds.map(async (creatorId) => {
      try {
        const userResult = await supabase.auth.admin.getUserById(creatorId);
        creatorEmailsById.set(creatorId, userResult.data.user?.email ?? null);
      } catch (lookupError) {
        console.warn("Could not load payout creator email", creatorId, lookupError);
        creatorEmailsById.set(creatorId, null);
      }
    }),
  );

  const requests = (transfers ?? []).map((transfer) => {
    const creator = creatorsById.get(transfer.creator_id);
    const creatorMethods = methodRowsByCreator.get(transfer.creator_id) ?? [];
    const payoutControl = payoutControlsByCreator.get(transfer.creator_id) ?? null;
    const metadata =
      transfer.metadata && typeof transfer.metadata === "object" && !Array.isArray(transfer.metadata)
        ? transfer.metadata
        : {};
    const createdAtMs = new Date(transfer.created_at).getTime();
    const creatorCreatedAtMs = creator?.created_at ? new Date(creator.created_at).getTime() : NaN;
    const requestedMethod =
      typeof metadata.requested_method === "string" ? metadata.requested_method : null;
    const latestMethod = creatorMethods[0] ?? null;
    const largeWithdrawal = transfer.amount_minor >= 100000 * 100;
    const newCreator = Number.isFinite(creatorCreatedAtMs) && createdAtMs - creatorCreatedAtMs < 7 * 24 * 60 * 60 * 1000;
    const recentMethodChange =
      latestMethod?.updated_at
        ? createdAtMs - new Date(latestMethod.updated_at).getTime() < 24 * 60 * 60 * 1000
        : false;
    const rapidRepeat = (transfers ?? []).filter(
      (item) =>
        item.creator_id === transfer.creator_id &&
        Math.abs(new Date(item.created_at).getTime() - createdAtMs) < 24 * 60 * 60 * 1000,
    ).length >= 3;

    return {
      id: transfer.id,
      creatorId: transfer.creator_id,
      creatorEmail: creatorEmailsById.get(transfer.creator_id) ?? null,
      creatorName: creator?.display_name ?? null,
      creatorHandle: creator?.handle ?? null,
      creatorCreatedAt: creator?.created_at ?? null,
      creatorAvatarUrl: creator?.avatar_url ?? null,
      amountMinor: transfer.amount_minor,
      currency: transfer.currency,
      status: transfer.status,
      reference: transfer.reference,
      recipientCode: transfer.recipient_code,
      reason: transfer.reason,
      failureReason: transfer.failure_reason,
      metadata,
      requestedMethod,
      destinationSnapshot:
        metadata.destination_snapshot &&
          typeof metadata.destination_snapshot === "object" &&
          !Array.isArray(metadata.destination_snapshot)
          ? metadata.destination_snapshot
          : null,
      manualHold: Boolean(transfer.manual_hold),
      holdReason: transfer.hold_reason ?? null,
      externalReference: transfer.external_reference ?? null,
      proofPath: transfer.proof_path ?? null,
      settledAt: transfer.settled_at ?? null,
      payoutChangesLocked: payoutControl?.payout_changes_locked ?? false,
      payoutChangesLockReason: payoutControl?.payout_changes_lock_reason ?? null,
      latestSavedMethod: latestMethod
        ? {
            method: latestMethod.method,
            bankCode: latestMethod.bank_code,
            bankName: latestMethod.bank_name,
            accountName: latestMethod.account_name,
            accountNumberLast4: latestMethod.account_number?.slice(-4) ?? null,
            phoneNumberLast4: latestMethod.phone_number?.slice(-4) ?? null,
            updatedAt: latestMethod.updated_at,
          }
        : null,
      flags: {
        largeWithdrawal,
        rapidRepeat,
        newCreator,
        recentMethodChange,
        manualHold: Boolean(transfer.manual_hold),
        payoutChangesLocked: payoutControl?.payout_changes_locked ?? false,
      },
      createdAt: transfer.created_at,
      updatedAt: transfer.updated_at,
    };
  });

  return jsonWithCors({ role, requests });
});
