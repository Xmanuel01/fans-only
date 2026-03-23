import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";

type ReviewStatus = "pending" | "verified" | "rejected" | "inactive";
type Provider = "mpesa" | "bank" | "card" | "paypal";

type Body = {
  creatorId?: string;
  provider?: Provider;
  status?: ReviewStatus;
  reason?: string | null;
  reviewedBy?: string | null;
  verificationSource?: string | null;
  metadata?: Record<string, unknown> | null;
};

const operatorToken = Deno.env.get("OPERATOR_API_TOKEN");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);
  if (!operatorToken) return jsonWithCors({ error: "OPERATOR_API_TOKEN missing" }, 500);

  const bearerToken = req.headers.get("Authorization")?.replace("Bearer ", "").trim() ?? "";
  const headerToken = req.headers.get("x-operator-token")?.trim() ?? "";
  const suppliedToken = headerToken || bearerToken;
  if (!suppliedToken || suppliedToken !== operatorToken) {
    return jsonWithCors({ error: "Unauthorized" }, 401);
  }

  let body: Body = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const creatorId = body.creatorId?.trim();
  const provider = body.provider;
  const status = body.status;
  if (!creatorId) return jsonWithCors({ error: "creatorId is required" }, 400);
  if (!provider || !["mpesa", "bank", "card", "paypal"].includes(provider)) {
    return jsonWithCors({ error: "provider must be one of mpesa, bank, card, paypal" }, 400);
  }
  if (!status || !["pending", "verified", "rejected", "inactive"].includes(status)) {
    return jsonWithCors({ error: "status must be one of pending, verified, rejected, inactive" }, 400);
  }

  const { data, error } = await supabase.rpc("set_creator_payout_account_verification", {
    p_creator_id: creatorId,
    p_provider: provider,
    p_status: status,
    p_reviewed_by: body.reviewedBy ?? null,
    p_verification_source: body.verificationSource ?? "manual_ops_review",
    p_reason: body.reason ?? null,
    p_metadata: body.metadata ?? {},
  });

  if (error) {
    return jsonWithCors(
      {
        error: "Could not review payout account",
        details: error.message,
      },
      400,
    );
  }

  return jsonWithCors({
    ok: true,
    payoutAccount: data,
  });
});
