// Upsert creator payout destination for PayPal payouts (email-based).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";

type Body = {
  paypalEmail: string;
  currency?: string;
  kycStatus?: "pending" | "verified" | "rejected";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return jsonWithCors({ error: "Missing bearer token" }, 401);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) return jsonWithCors({ error: "Invalid token" }, 401);
  const creatorId = userData.user.id;

  const { data: creatorRow, error: creatorErr } = await supabase
    .from("creators")
    .select("id")
    .eq("id", creatorId)
    .maybeSingle();
  if (creatorErr) return jsonWithCors({ error: "Creator lookup failed" }, 500);
  if (!creatorRow) return jsonWithCors({ error: "Creator profile required" }, 403);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const paypalEmail = body.paypalEmail?.trim().toLowerCase();
  const currency = (body.currency?.trim() || "KES").toUpperCase();
  const emailValid = paypalEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(paypalEmail);
  if (!emailValid) return jsonWithCors({ error: "Valid PayPal email is required" }, 400);

  const kycStatus = body.kycStatus ?? "verified";
  const accountName = paypalEmail.split("@")[0];

  const { error: upsertErr } = await supabase.from("creator_payout_accounts").upsert({
    creator_id: creatorId,
    provider: "paypal",
    currency,
    account_name: accountName,
    paypal_email: paypalEmail,
    recipient_code: null,
    recipient_active: true,
    kyc_status: kycStatus,
    kyc_last_checked_at: new Date().toISOString(),
    metadata: {
      source: "paypal",
    },
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  if (upsertErr) return jsonWithCors({ error: "Payout account save failed" }, 500);

  return jsonWithCors({
    ok: true,
    payoutAccount: {
      provider: "paypal",
      currency,
      paypalEmail,
    },
  });
});
