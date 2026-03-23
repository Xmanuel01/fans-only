// M-PESA STK push callback handler.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

const callbackToken = Deno.env.get("MPESA_CALLBACK_TOKEN");

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabase) return json({ error: "Supabase not configured" }, 500);
  if (!callbackToken) return json({ error: "MPESA_CALLBACK_TOKEN missing" }, 500);

  const requestUrl = new URL(req.url);
  if (requestUrl.searchParams.get("token") !== callbackToken) {
    return json({ error: "Invalid callback token" }, 401);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const stk = payload?.Body?.stkCallback;
  if (!stk) return json({ error: "Missing stkCallback" }, 400);

  const checkoutRequestId = stk.CheckoutRequestID?.toString?.();
  const merchantRequestId = stk.MerchantRequestID?.toString?.();
  const resultCode = Number(stk.ResultCode);
  const resultDesc = stk.ResultDesc ?? null;

  if (!checkoutRequestId) return json({ error: "Missing CheckoutRequestID" }, 400);

  const { error: eventInsertErr } = await supabase.from("provider_webhook_events").insert({
    provider: "mpesa",
    provider_event_id: checkoutRequestId,
    event_type: resultCode === 0 ? "stk.success" : "stk.failed",
    payload,
  });
  if (eventInsertErr) {
    if (eventInsertErr.code === "23505") {
      return json({ ok: true, already_processed: true });
    }
    return json({ error: "Webhook event persistence failed" }, 500);
  }

  const fail = async (error: string, status = 500) => {
    const { error: cleanupErr } = await supabase
      .from("provider_webhook_events")
      .delete()
      .eq("provider", "mpesa")
      .eq("provider_event_id", checkoutRequestId);
    if (cleanupErr) {
      console.error("Failed to roll back M-PESA webhook event", cleanupErr);
    }
    return json({ error }, status);
  };

  const metadataItems = stk.CallbackMetadata?.Item ?? [];
  const lookup = (name: string) =>
    metadataItems.find((item: any) => item.Name === name)?.Value ?? null;

  const amountMajor = Number(lookup("Amount") ?? 0);
  const receiptNumber = lookup("MpesaReceiptNumber")?.toString?.() ?? null;
  const phoneNumber = lookup("PhoneNumber")?.toString?.() ?? null;
  const transactionDate = lookup("TransactionDate")?.toString?.() ?? null;

  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, user_id, status, amount_cents, currency, metadata")
    .eq("provider", "mpesa")
    .eq("provider_intent_id", checkoutRequestId)
    .maybeSingle();

  if (paymentErr) return await fail("Payment lookup failed");
  if (!payment) return await fail("Unknown payment intent", 404);

  const amountMinor = Math.round(Number.isFinite(amountMajor) ? amountMajor * 100 : 0);
  const succeeded = resultCode === 0;
  const priorStatus = payment.status;

  if (succeeded) {
    const creditAmount = amountMinor > 0 ? amountMinor : payment.amount_cents;
    const { error: creditErr } = await supabase.rpc("credit_user_wallet", {
      p_user_id: payment.user_id,
      p_amount_minor: creditAmount,
      p_currency: payment.currency ?? "KES",
      p_payment_id: payment.id,
      p_metadata: { source: "mpesa.stk.callback", receipt: receiptNumber },
    });
    if (creditErr) return await fail("Wallet credit failed");
  }

  const { error: updateErr } = await supabase
    .from("payments")
    .update({
      status: succeeded ? "succeeded" : "canceled",
      amount_cents: amountMinor > 0 ? amountMinor : payment.amount_cents,
      provider_event_id: receiptNumber ?? merchantRequestId ?? null,
      metadata: {
        ...(payment.metadata ?? {}),
        mpesa_result_code: resultCode,
        mpesa_result_desc: resultDesc,
        mpesa_receipt: receiptNumber,
        phone: phoneNumber,
        transaction_date: transactionDate,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  if (updateErr) return await fail("Payment update failed");

  if (succeeded) {
    const creditAmount = amountMinor > 0 ? amountMinor : payment.amount_cents;
    if (priorStatus === "succeeded") {
      return json({ ok: true, already_processed: true });
    }

    const { error: notifyErr } = await supabase.rpc("create_notification_if_enabled", {
      p_user_id: payment.user_id,
      p_type: "wallet_topup_succeeded",
      p_payload: {
        amount_cents: creditAmount,
        currency: payment.currency ?? "KES",
        provider: "mpesa",
        receipt_number: receiptNumber,
      },
      p_pref_key: "payments",
    });
    if (notifyErr) return await fail("Wallet notification failed");
  } else {
    const { error: notifyErr } = await supabase.rpc("create_notification_if_enabled", {
      p_user_id: payment.user_id,
      p_type: "wallet_topup_failed",
      p_payload: {
        amount_cents: amountMinor > 0 ? amountMinor : payment.amount_cents,
        currency: payment.currency ?? "KES",
        provider: "mpesa",
        result_code: resultCode,
        result_desc: resultDesc,
      },
      p_pref_key: "payments",
    });
    if (notifyErr) return await fail("Wallet failure notification failed");
  }

  return json({ ok: true });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
