import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireCreatorPaymentAccess } from "../_shared/guards.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const { creatorId, errorResponse } = await requireCreatorPaymentAccess(supabase, req);
  if (errorResponse) return jsonWithCors(await errorResponse.json(), errorResponse.status);

  const { data, error } = await supabase
    .from("creator_withdrawal_methods")
    .select("method, currency, account_name, bank_code, bank_name, account_number, phone_number, updated_at")
    .eq("creator_id", creatorId)
    .order("updated_at", { ascending: false });

  if (error) {
    return jsonWithCors({ error: "Could not load saved withdrawal methods", details: error.message }, 400);
  }

  return jsonWithCors({
    ok: true,
    methods: (data ?? []).map((item) => ({
      method: item.method,
      currency: item.currency,
      accountName: item.account_name,
      bankCode: item.bank_code,
      bankName: item.bank_name,
      accountNumber: item.account_number,
      phoneNumber: item.phone_number,
      updatedAt: item.updated_at,
    })),
  });
});
