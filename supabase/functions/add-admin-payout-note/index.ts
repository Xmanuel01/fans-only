import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireAdminAccess } from "../_shared/guards.ts";
import { recordPayoutAudit } from "../_shared/admin.ts";

type Body = {
  transferId?: number;
  body?: string;
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
  const noteBody = body.body?.trim() ?? "";
  if (!Number.isFinite(transferId) || transferId <= 0) {
    return jsonWithCors({ error: "transferId is required" }, 400);
  }
  if (!noteBody) {
    return jsonWithCors({ error: "Note body is required" }, 400);
  }

  const { data, error } = await supabase
    .from("payout_admin_notes")
    .insert({
      payout_transfer_id: transferId,
      author_id: userId,
      author_email: email,
      author_role: role,
      body: noteBody,
    })
    .select("id, author_id, author_email, author_role, body, created_at")
    .single();
  if (error) {
    return jsonWithCors({ error: "Could not save admin note", details: error.message }, 400);
  }

  await recordPayoutAudit(supabase, {
    payoutTransferId: transferId,
    actorId: userId,
    actorEmail: email,
    actorRole: role,
    action: "note_added",
    note: noteBody,
  });

  return jsonWithCors({ note: data });
});
