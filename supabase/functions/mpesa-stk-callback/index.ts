// M-PESA STK push callback handler.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabase) return json({ error: "Supabase not configured" }, 500);

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

  if (paymentErr) return json({ error: "Payment lookup failed" }, 500);
  if (!payment) return json({ error: "Unknown payment intent" }, 404);

  const amountMinor = Math.round(Number.isFinite(amountMajor) ? amountMajor * 100 : 0);
  const succeeded = resultCode === 0;

  if (payment.status === "succeeded") {
    return json({ ok: true, already_processed: true });
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

  if (updateErr) return json({ error: "Payment update failed" }, 500);

  if (succeeded) {
    const creditAmount = amountMinor > 0 ? amountMinor : payment.amount_cents;
    const { error: creditErr } = await supabase.rpc("credit_user_wallet", {
      p_user_id: payment.user_id,
      p_amount_minor: creditAmount,
      p_currency: payment.currency ?? "KES",
      p_payment_id: payment.id,
      p_metadata: { source: "mpesa.stk.callback", receipt: receiptNumber },
    });
    if (creditErr) return json({ error: "Wallet credit failed" }, 500);
  }

  return json({ ok: true });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
