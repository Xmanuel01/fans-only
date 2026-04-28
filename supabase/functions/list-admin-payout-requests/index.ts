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

  const { errorResponse } = await requireAdminAccess(supabase, req);
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
      "id, creator_id, amount_minor, currency, status, reference, recipient_code, reason, failure_reason, metadata, created_at, updated_at",
    )
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
  const creatorsById = new Map<string, { display_name: string | null; handle: string | null }>();
  if (creatorIds.length) {
    const { data: creators } = await supabase
      .from("creators")
      .select("id, display_name, handle")
      .in("id", creatorIds);
    for (const creator of creators ?? []) {
      creatorsById.set(creator.id, {
        display_name: creator.display_name ?? null,
        handle: creator.handle ?? null,
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
    const metadata =
      transfer.metadata && typeof transfer.metadata === "object" && !Array.isArray(transfer.metadata)
        ? transfer.metadata
        : {};

    return {
      id: transfer.id,
      creatorId: transfer.creator_id,
      creatorEmail: creatorEmailsById.get(transfer.creator_id) ?? null,
      creatorName: creator?.display_name ?? null,
      creatorHandle: creator?.handle ?? null,
      amountMinor: transfer.amount_minor,
      currency: transfer.currency,
      status: transfer.status,
      reference: transfer.reference,
      recipientCode: transfer.recipient_code,
      reason: transfer.reason,
      failureReason: transfer.failure_reason,
      metadata,
      requestedMethod:
        typeof metadata.requested_method === "string" ? metadata.requested_method : null,
      destinationSnapshot:
        metadata.destination_snapshot &&
          typeof metadata.destination_snapshot === "object" &&
          !Array.isArray(metadata.destination_snapshot)
          ? metadata.destination_snapshot
          : null,
      createdAt: transfer.created_at,
      updatedAt: transfer.updated_at,
    };
  });

  return jsonWithCors({ requests });
});
