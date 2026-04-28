import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireCreatorPaymentAccess } from "../_shared/guards.ts";
import { buildPayoutAdminRecipients, sendResendEmail } from "../_shared/email.ts";

const MIN_PAYOUT_AMOUNT_MINOR = 1000 * 100;

type Body = {
  amountMinor?: number;
  currency?: string;
  reason?: string;
  provider?: "mobile_money" | "bank";
  saveDetails?: boolean;
  methodDetails?: {
    accountName?: string;
    bankCode?: string;
    bankName?: string;
    accountNumber?: string;
    phoneNumber?: string;
  };
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

  const provider = body.provider;
  if (!provider || !["mobile_money", "bank"].includes(provider)) {
    return jsonWithCors({ error: "Choose bank or mobile money before requesting a withdrawal." }, 400);
  }

  const currency = (body.currency ?? "KES").toUpperCase();
  if (currency !== "KES") {
    return jsonWithCors({ error: "KES is the only supported withdrawal currency." }, 400);
  }

  const amountMinor = Math.round(Number(body.amountMinor));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return jsonWithCors({ error: "Enter a valid withdrawal amount." }, 400);
  }
  if (amountMinor < MIN_PAYOUT_AMOUNT_MINOR) {
    return jsonWithCors({ error: "The minimum withdrawal amount is KSh 1,000." }, 400);
  }

  const inlineDetails = normalizeMethodDetails(provider, body.methodDetails ?? {});
  const { data: savedMethod, error: savedMethodErr } = await supabase
    .from("creator_withdrawal_methods")
    .select("method, currency, account_name, bank_code, bank_name, account_number, phone_number")
    .eq("creator_id", creatorId)
    .eq("method", provider)
    .maybeSingle();
  if (savedMethodErr) {
    return jsonWithCors({ error: "Could not load saved withdrawal details." }, 500);
  }

  const resolvedDetails = inlineDetails ?? normalizeSavedMethod(savedMethod);
  if (!resolvedDetails) {
    return jsonWithCors({ error: "Enter your withdrawal details before submitting the request." }, 400);
  }

  if (body.saveDetails) {
    const { error: saveErr } = await supabase
      .from("creator_withdrawal_methods")
      .upsert(
        {
          creator_id: creatorId,
          method: provider,
          currency,
          account_name: resolvedDetails.accountName,
          bank_code: resolvedDetails.bankCode,
          bank_name: provider === "bank" ? resolvedDetails.bankName : null,
          account_number: provider === "bank" ? resolvedDetails.accountNumber : null,
          phone_number: provider === "mobile_money" ? resolvedDetails.phoneNumber : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "creator_id,method" },
      );
    if (saveErr) {
      return jsonWithCors({ error: "Could not save withdrawal details.", details: saveErr.message }, 400);
    }
  }

  const { data: balanceRow, error: balanceErr } = await supabase
    .from("creator_balances")
    .select("available_amount_minor, pending_amount_minor, currency")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (balanceErr) return jsonWithCors({ error: "Balance lookup failed" }, 500);
  if (!balanceRow) return jsonWithCors({ error: "No available balance" }, 400);
  if (balanceRow.currency !== currency) return jsonWithCors({ error: "Balance currency mismatch" }, 400);
  if (amountMinor > balanceRow.available_amount_minor) {
    return jsonWithCors({ error: "Requested amount exceeds your available balance." }, 400);
  }

  const idempotencyKey = req.headers.get("x-idempotency-key") ?? crypto.randomUUID();
  const reference = `wd_${creatorId.slice(0, 8)}_${Date.now()}`;
  const reason = body.reason?.trim() || "Creator withdrawal request";
  const recipientCode = `manual_${provider}_${creatorId.slice(0, 8)}`;

  const { data: payoutTransferId, error: queueErr } = await supabase.rpc("request_creator_payout", {
    p_creator_id: creatorId,
    p_amount_minor: amountMinor,
    p_currency: currency,
    p_recipient_code: recipientCode,
    p_reason: reason,
    p_requested_by: creatorId,
    p_idempotency_key: idempotencyKey,
    p_reference: reference,
    p_metadata: {
      source: "request-creator-payout",
      provider: "paystack",
      workflow: "manual_review",
      requested_method: provider,
      destination_snapshot: buildDestinationSnapshot(provider, resolvedDetails),
    },
  });
  if (queueErr) {
    if (queueErr.code === "23505") {
      const { data: existing, error: existingErr } = await supabase
        .from("payout_transfers")
        .select("id, status, reference, amount_minor, currency")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingErr) return jsonWithCors({ error: "Idempotency lookup failed" }, 500);
      if (existing) return jsonWithCors({ ok: true, transfer: existing, idempotent: true });
    }
    return jsonWithCors({ error: "Could not create withdrawal request", details: queueErr.message }, 400);
  }

  await notifyWithdrawalRequested({
    creatorId,
    amountMinor,
    currency,
    provider,
    destination: buildDestinationSnapshot(provider, resolvedDetails),
    reference,
  });

  return jsonWithCors({
    ok: true,
    transfer: {
      id: payoutTransferId,
      status: "queued",
      amount_minor: amountMinor,
      currency,
      reference,
    },
  });
});

function normalizeSavedMethod(
  row:
    | {
        method: string;
        account_name: string;
        bank_code: string;
        bank_name: string | null;
        account_number: string | null;
        phone_number: string | null;
      }
    | null,
) {
  if (!row) return null;
  if (row.method === "bank" && row.account_number) {
    return {
      accountName: row.account_name,
      bankCode: row.bank_code,
      bankName: row.bank_name ?? "",
      accountNumber: row.account_number,
      phoneNumber: null,
    };
  }
  if (row.method === "mobile_money" && row.phone_number) {
    return {
      accountName: row.account_name,
      bankCode: row.bank_code,
      bankName: null,
      accountNumber: null,
      phoneNumber: row.phone_number,
    };
  }
  return null;
}

function normalizeMethodDetails(
  provider: "mobile_money" | "bank",
  details: NonNullable<Body["methodDetails"]>,
) {
  const accountName = details.accountName?.trim() ?? "";
  const bankCode = details.bankCode?.trim().toUpperCase() ?? "";
  const bankName = details.bankName?.trim() ?? "";
  const accountNumber = details.accountNumber?.replace(/\D/g, "") ?? "";
  const phoneNumber = details.phoneNumber?.replace(/\D/g, "") ?? "";

  if (!accountName) return null;
  if (provider === "bank") {
    if (!accountNumber || accountNumber.length < 6 || !bankCode) return null;
    return {
      accountName,
      bankCode,
      bankName,
      accountNumber,
      phoneNumber: null,
    };
  }
  if (!phoneNumber || phoneNumber.length < 10 || !bankCode) return null;
  return {
    accountName,
    bankCode,
    bankName: null,
    accountNumber: null,
    phoneNumber,
  };
}

function buildDestinationSnapshot(
  provider: "mobile_money" | "bank",
  details: {
    accountName: string;
    bankCode: string;
    bankName: string | null;
    accountNumber: string | null;
    phoneNumber: string | null;
  },
) {
  return provider === "bank"
    ? {
        method: "bank",
        accountName: details.accountName,
        bankCode: details.bankCode,
        bankName: details.bankName,
        accountNumberLast4: details.accountNumber?.slice(-4) ?? null,
        accountNumberMasked: details.accountNumber
          ? `••••${details.accountNumber.slice(-4)}`
          : null,
      }
    : {
        method: "mobile_money",
        accountName: details.accountName,
        bankCode: details.bankCode,
        phoneNumberLast4: details.phoneNumber?.slice(-4) ?? null,
        phoneNumberMasked: details.phoneNumber ? `••••${details.phoneNumber.slice(-4)}` : null,
      };
}

async function notifyWithdrawalRequested(params: {
  creatorId: string;
  amountMinor: number;
  currency: string;
  provider: "mobile_money" | "bank";
  destination: Record<string, unknown>;
  reference: string;
}) {
  const adminRecipients = buildPayoutAdminRecipients();
  const creator = await supabase!.auth.admin.getUserById(params.creatorId).catch((error) => {
    console.warn("Could not load creator email for withdrawal notification", error);
    return { data: { user: null } };
  });
  const creatorEmail = creator.data.user?.email ?? null;

  const destinationText =
    params.provider === "bank"
      ? `${params.destination.bankName ?? "Bank"} ${params.destination.accountNumberMasked ?? ""}`.trim()
      : `${params.destination.bankCode ?? "Mobile money"} ${params.destination.phoneNumberMasked ?? ""}`.trim();
  const amountLabel = formatMinorCurrency(params.amountMinor, params.currency);

  if (creatorEmail) {
    await sendResendEmail({
      to: creatorEmail,
      subject: "Withdrawal request received",
      html: `<p>Your withdrawal request for <strong>${amountLabel}</strong> has been received.</p>
<p>Destination: ${destinationText}</p>
<p>Reference: ${params.reference}</p>
<p>Processing can take up to 5 working days. We will notify you again when it is completed.</p>`,
      text: `Your withdrawal request for ${amountLabel} has been received.\nDestination: ${destinationText}\nReference: ${params.reference}\nProcessing can take up to 5 working days.`,
    });
  }

  if (adminRecipients.length > 0) {
    await sendResendEmail({
      to: adminRecipients,
      subject: "New creator withdrawal request",
      html: `<p>A creator submitted a withdrawal request.</p>
<p>Amount: <strong>${amountLabel}</strong></p>
<p>Method: ${params.provider === "bank" ? "Bank payout" : "Mobile money payout"}</p>
<p>Destination: ${destinationText}</p>
<p>Reference: ${params.reference}</p>`,
      text: `New creator withdrawal request\nAmount: ${amountLabel}\nMethod: ${params.provider === "bank" ? "Bank payout" : "Mobile money payout"}\nDestination: ${destinationText}\nReference: ${params.reference}`,
    });
  }
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
