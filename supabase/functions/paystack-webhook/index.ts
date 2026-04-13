// Handle Paystack webhooks to confirm payments.
// Env: PAYSTACK_SECRET_KEY (required), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

// Paystack signs events with a SHA512 hash in `x-paystack-signature`.
const secret = Deno.env.get("PAYSTACK_SECRET_KEY");

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabase) return json({ error: "Supabase not configured" }, 500);
  if (!secret) return json({ error: "PAYSTACK_SECRET_KEY missing" }, 500);

  const signature = req.headers.get("x-paystack-signature");
  const bodyText = await req.text();
  if (!signature) return json({ error: "Missing signature" }, 400);

  const hash = await hmacSHA512(bodyText, secret);
  if (hash !== signature.toLowerCase()) return json({ error: "Invalid signature" }, 400);

  let event: { event?: string; data?: any };
  try {
    event = JSON.parse(bodyText);
  } catch {
    return json({ error: "Malformed JSON" }, 400);
  }

  const eventType = event?.event;
  const data = event?.data;
  if (!eventType || !data) return json({ error: "Malformed payload" }, 400);
  const providerEventId = data.id?.toString?.();
  if (!providerEventId) return json({ error: "Missing event id" }, 400);

  // Idempotency by provider event id
  const { error: eventInsertErr } = await supabase.from("provider_webhook_events").insert({
    provider: "paystack",
    provider_event_id: providerEventId,
    event_type: eventType,
    payload: event,
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
      .eq("provider", "paystack")
      .eq("provider_event_id", providerEventId);
    if (cleanupErr) {
      console.error("Failed to roll back Paystack webhook event", cleanupErr);
    }
    return json({ error }, status);
  };

  const logNonCritical = (label: string, error: unknown) => {
    console.error(`Non-critical Paystack webhook follow-up failed: ${label}`, error);
  };

  if (eventType === "charge.success") {
    const reference: string | undefined = data.reference;
    if (!reference) return json({ error: "Missing reference" }, 400);
    const metadata = data.metadata ?? {};

    if (metadata.type === "creator_card_setup") {
      return json({ ok: true, ignored: "creator_card_setup" });
    }

    // Idempotency: bail if already succeeded
    const { data: paymentRow, error: fetchErr } = await supabase
      .from("payments")
      .select("id, status, type, creator_id, user_id, amount_cents, currency, metadata")
      .eq("provider", "paystack")
      .eq("provider_intent_id", reference)
      .maybeSingle();

    if (fetchErr) return await fail("DB fetch error");
    const amount = data.amount; // minor unit
    const currency = (data.currency ?? paymentRow?.currency ?? "KES").toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0) return await fail("Invalid amount", 400);

    let resolvedPayment = paymentRow;
    if (!resolvedPayment) {
      const creatorId = metadata.creator_id?.toString?.() ?? null;
      const payerUserId = metadata.payer_user_id?.toString?.() ?? null;
      const rawType = metadata.type?.toString?.();
      const paymentType =
        rawType === "subscription"
          ? "subscription"
          : rawType === "wallet_topup"
            ? "wallet_topup"
            : rawType === "ppv"
              ? "ppv"
              : "tip";
      if (!creatorId && paymentType !== "wallet_topup") {
        return await fail("Unknown payment reference and missing creator metadata", 404);
      }

      const { data: recoveredPayment, error: recoverErr } = await supabase
        .from("payments")
        .upsert(
          {
            provider: "paystack",
            provider_intent_id: reference,
            provider_event_id: providerEventId,
            amount_cents: amount,
            currency,
            status: "requires_action",
            creator_id: creatorId,
            user_id: payerUserId,
            type: paymentType,
            metadata,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider_intent_id" },
        )
        .select("id, status, type, creator_id, user_id, amount_cents, currency, metadata")
        .single();
      if (recoverErr) return await fail("Payment recovery failed");
      resolvedPayment = recoveredPayment;
    }

    const priorStatus = resolvedPayment.status;
    if (priorStatus === "succeeded") {
      return json({ ok: true, already_processed: true });
    }

    if (resolvedPayment.type === "wallet_topup") {
      if (!resolvedPayment.user_id) {
        return await fail("Wallet topup missing user_id", 400);
      }
      const { error: walletErr } = await supabase.rpc("credit_user_wallet", {
        p_user_id: resolvedPayment.user_id,
        p_amount_minor: amount,
        p_currency: currency,
        p_payment_id: resolvedPayment.id,
        p_metadata: { source: "paystack.wallet_topup", reference },
      });
      if (walletErr) return await fail("Wallet credit failed");
    }

    if (resolvedPayment.type === "tip") {
      const { error: tipErr } = await supabase.from("tips").insert({
        from_user: resolvedPayment.user_id,
        to_creator: resolvedPayment.creator_id,
        amount_cents: amount,
        currency,
        payment_id: resolvedPayment.id,
      });
      if (tipErr && tipErr.code !== "23505") return await fail("Tip create failed");
    }

    if (resolvedPayment.type === "subscription") {
      const now = new Date();
      const periodEnd = new Date(now.getTime());
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const { error: subErr } = await supabase.from("subscriptions").upsert(
        {
          subscriber_id: resolvedPayment.user_id,
          creator_id: resolvedPayment.creator_id,
          status: "active",
          current_period_end: periodEnd.toISOString(),
          payment_id: resolvedPayment.id,
          updated_at: now.toISOString(),
        },
        { onConflict: "subscriber_id,creator_id" },
      );
      if (subErr) return await fail("Subscription upsert failed");
    }

    if (resolvedPayment.type === "ppv") {
      const postId = resolvedPayment.metadata?.post_id ?? data?.metadata?.post_id;
      if (!postId) return await fail("PPV purchase missing post_id", 400);

      const { error: ppvErr } = await supabase.from("ppv_purchases").upsert(
        {
          user_id: resolvedPayment.user_id,
          post_id: Number(postId),
          creator_id: resolvedPayment.creator_id,
          amount_cents: amount,
          currency,
          payment_id: resolvedPayment.id,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,post_id" },
      );
      if (ppvErr && ppvErr.code !== "23505") return await fail("PPV purchase create failed");
    }

    if (resolvedPayment.creator_id) {
      const { error: creditErr } = await supabase.rpc("credit_creator_balance", {
        p_creator_id: resolvedPayment.creator_id,
        p_amount_minor: amount,
        p_currency: currency,
        p_payment_id: resolvedPayment.id,
        p_metadata: { source: "paystack.charge.success", reference },
      });
      if (creditErr) return await fail("Creator balance credit failed");
    }

    const { error: updateErr } = await supabase
      .from("payments")
      .update({
        status: "succeeded",
        amount_cents: amount,
        currency,
        provider_event_id: data.id?.toString() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "paystack")
      .eq("provider_intent_id", reference);
    if (updateErr) return await fail("Update failed");

    if (resolvedPayment.type === "wallet_topup" && priorStatus !== "succeeded") {
      const { error: notifyErr } = await supabase.rpc("create_notification_if_enabled", {
        p_user_id: resolvedPayment.user_id,
        p_type: "wallet_topup_succeeded",
        p_payload: {
          amount_cents: amount,
          currency,
          provider: "paystack",
          reference,
        },
        p_pref_key: "payments",
      });
      if (notifyErr) logNonCritical("wallet_topup_succeeded notification", notifyErr);
    }
    return json({ ok: true });
  }

  if (eventType === "transfer.success" || eventType === "transfer.failed" || eventType === "transfer.reversed") {
    const paystackTransferId = data.id?.toString?.() ?? null;
    const transferCode = data.transfer_code ?? null;
    const payoutLookupFilters = [
      paystackTransferId ? `paystack_transfer_id.eq.${paystackTransferId}` : null,
      transferCode ? `paystack_transfer_code.eq.${transferCode}` : null,
    ].filter(Boolean);
    if (!payoutLookupFilters.length) return await fail("Missing transfer identifiers", 400);

    const query = supabase
      .from("payout_transfers")
      .select("id")
      .or(payoutLookupFilters.join(","))
      .limit(1)
      .maybeSingle();
    const { data: payoutRow, error: payoutFetchErr } = await query;
    if (payoutFetchErr) return await fail("Payout fetch failed");
    if (!payoutRow) return await fail("Unknown payout transfer", 404);

    const statusMap: Record<string, "success" | "failed" | "reversed"> = {
      "transfer.success": "success",
      "transfer.failed": "failed",
      "transfer.reversed": "reversed",
    };

    const { error: markErr } = await supabase.rpc("mark_payout_result", {
      p_transfer_id: payoutRow.id,
      p_status: statusMap[eventType],
      p_paystack_transfer_code: transferCode,
      p_paystack_transfer_id: paystackTransferId,
      p_failure_reason: data.complete_message ?? data.reason ?? null,
      p_metadata: { source: eventType },
    });
    if (markErr) return await fail("Payout state update failed");

    const { error: unlockErr } = await supabase
      .from("payout_transfers")
      .update({
        last_attempt_at: new Date().toISOString(),
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payoutRow.id);
    if (unlockErr) return await fail("Payout unlock failed");
  }

  return json({ ok: true });
});

async function hmacSHA512(content: string, key: string) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(content));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
