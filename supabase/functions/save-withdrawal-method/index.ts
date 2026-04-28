import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireCreatorPaymentAccess } from "../_shared/guards.ts";

type Body = {
  method?: "mobile_money" | "bank";
  accountName?: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  phoneNumber?: string;
  currency?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const { creatorId, errorResponse } = await requireCreatorPaymentAccess(supabase, req);
  if (errorResponse) return jsonWithCors(await errorResponse.json(), errorResponse.status);

  let body: Body = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const method = body.method;
  const accountName = body.accountName?.trim() ?? "";
  const bankCode = body.bankCode?.trim().toUpperCase() ?? "";
  const bankName = body.bankName?.trim() || null;
  const accountNumber = body.accountNumber?.replace(/\D/g, "") ?? "";
  const phoneNumber = body.phoneNumber?.replace(/\D/g, "") ?? "";
  const currency = (body.currency ?? "KES").toUpperCase();

  if (!method || !["mobile_money", "bank"].includes(method)) {
    return jsonWithCors({ error: "method must be bank or mobile_money" }, 400);
  }
  if (!accountName) {
    return jsonWithCors({ error: "accountName is required" }, 400);
  }
  if (currency !== "KES") {
    return jsonWithCors({ error: "KES is the only supported withdrawal currency" }, 400);
  }

  if (method === "mobile_money") {
    if (!phoneNumber || phoneNumber.length < 10) {
      return jsonWithCors({ error: "Enter a valid mobile money number" }, 400);
    }
    if (!bankCode) {
      return jsonWithCors({ error: "Network code is required" }, 400);
    }
  }

  if (method === "bank") {
    if (!accountNumber || accountNumber.length < 6) {
      return jsonWithCors({ error: "Enter a valid bank account number" }, 400);
    }
    if (!bankCode) {
      return jsonWithCors({ error: "Bank code is required" }, 400);
    }
  }

  const payload = {
    creator_id: creatorId,
    method,
    currency,
    account_name: accountName,
    bank_code: bankCode,
    bank_name: method === "bank" ? bankName : null,
    account_number: method === "bank" ? accountNumber : null,
    phone_number: method === "mobile_money" ? phoneNumber : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("creator_withdrawal_methods")
    .upsert(payload, { onConflict: "creator_id,method" });
  if (error) {
    return jsonWithCors({ error: "Could not save withdrawal method", details: error.message }, 400);
  }

  return jsonWithCors({
    ok: true,
    method: {
      method,
      currency,
      accountName,
      bankCode,
      bankName: method === "bank" ? bankName : null,
      accountNumber: method === "bank" ? accountNumber : null,
      phoneNumber: method === "mobile_money" ? phoneNumber : null,
    },
  });
});
