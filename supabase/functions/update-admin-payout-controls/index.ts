import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireAdminAccess } from "../_shared/guards.ts";
import { recordPayoutAudit } from "../_shared/admin.ts";

type Body = {
  transferId?: number;
  creatorId?: string;
  manualHold?: boolean;
  holdReason?: string | null;
  payoutChangesLocked?: boolean;
  payoutChangesLockReason?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const { userId, email, role, errorResponse } = await requireAdminAccess(supabase, req, {
    minimumRole: "super_admin",
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

  const transferId = body.transferId ? Number(body.transferId) : null;
  let creatorId = body.creatorId?.trim() ?? "";
  if (transferId && !creatorId) {
    const { data: transfer } = await supabase
      .from("payout_transfers")
      .select("creator_id")
      .eq("id", transferId)
      .maybeSingle();
    creatorId = transfer?.creator_id ?? "";
  }
  if (!creatorId) {
    return jsonWithCors({ error: "creatorId is required" }, 400);
  }

  if (typeof body.payoutChangesLocked === "boolean") {
    const { error } = await supabase.from("creator_payout_controls").upsert({
      creator_id: creatorId,
      payout_changes_locked: body.payoutChangesLocked,
      payout_changes_lock_reason: body.payoutChangesLocked
        ? body.payoutChangesLockReason?.trim() ?? "Locked for admin review"
        : null,
      payout_changes_locked_by: userId,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      return jsonWithCors({ error: "Could not update payout change lock", details: error.message }, 400);
    }
  }

  if (transferId && typeof body.manualHold === "boolean") {
    const { error } = await supabase
      .from("payout_transfers")
      .update({
        manual_hold: body.manualHold,
        hold_reason: body.manualHold ? body.holdReason?.trim() ?? "Manual hold" : null,
        last_reviewed_at: new Date().toISOString(),
        last_reviewed_by: userId,
      })
      .eq("id", transferId);
    if (error) {
      return jsonWithCors({ error: "Could not update manual hold", details: error.message }, 400);
    }
    await recordPayoutAudit(supabase, {
      payoutTransferId: transferId,
      actorId: userId,
      actorEmail: email,
      actorRole: role,
      action: "hold_changed",
      note: body.manualHold ? body.holdReason?.trim() ?? "Manual hold" : "Hold cleared",
      metadata: { manual_hold: body.manualHold },
    });
  }

  return jsonWithCors({ ok: true });
});
