// Handle PayPal webhooks for payout status updates.
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_API_BASE (optional),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";

const PAYPAL_BASE = Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabase) return json({ error: "Supabase not configured" }, 500);
  if (!clientId || !clientSecret || !webhookId) {
    return json({ error: "PayPal env missing" }, 500);
  }

  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const transmissionSig = req.headers.get("paypal-transmission-sig");
  const certUrl = req.headers.get("paypal-cert-url");
  const authAlgo = req.headers.get("paypal-auth-algo");

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return json({ error: "Missing PayPal signature headers" }, 400);
  }

  const rawBody = await req.text();
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const verified = await verifyPaypalSignature({
    transmissionId,
    transmissionTime,
    transmissionSig,
    certUrl,
    authAlgo,
    webhookId,
    event,
  });
  if (!verified) return json({ error: "Signature verification failed" }, 400);

  const eventId = event?.id?.toString?.();
  if (!eventId) return json({ error: "Missing event id" }, 400);

  const { error: insertErr } = await supabase.from("provider_webhook_events").insert({
    provider: "paypal",
    provider_event_id: eventId,
    event_type: event?.event_type ?? "unknown",
    payload: event,
  });
  if (insertErr) {
    if (insertErr.code === "23505") return json({ ok: true, already_processed: true });
    return json({ error: "Webhook event persistence failed" }, 500);
  }

  const fail = async (status: number, error: string) => {
    const { error: rollbackErr } = await supabase
      .from("provider_webhook_events")
      .delete()
      .eq("provider", "paypal")
      .eq("provider_event_id", eventId);
    if (rollbackErr) {
      console.error("paypal webhook rollback failed", rollbackErr);
    }
    return json({ error }, status);
  };

  const outcome = await handlePayoutEvent(event);
  if (!outcome.ok) return await fail(400, outcome.error ?? "Webhook handling failed");

  return json({ ok: true, updated: outcome.updated });
});

async function handlePayoutEvent(event: any): Promise<{ ok: boolean; error?: string; updated?: boolean }> {
  const eventType = event?.event_type?.toString?.() ?? "";
  if (!eventType.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    return { ok: true, updated: false };
  }

  const status = mapPayoutStatus(eventType);
  if (!status) return { ok: true, updated: false };

  const resource = event?.resource ?? {};
  const payoutItemId =
    resource?.payout_item_id ??
    resource?.payout_item?.payout_item_id ??
    resource?.payout_item?.payout_item?.payout_item_id ??
    null;
  const batchId = resource?.payout_batch_id ?? resource?.payout_batch_id?.toString?.() ?? null;
  const senderItemId =
    resource?.payout_item?.sender_item_id ??
    resource?.payout_item?.payout_item?.sender_item_id ??
    resource?.sender_item_id ??
    null;

  let transferRow = null;
  if (senderItemId && /^\d+$/.test(String(senderItemId))) {
    const { data } = await supabase
      .from("payout_transfers")
      .select("id")
      .eq("id", Number(senderItemId))
      .maybeSingle();
    transferRow = data ?? null;
  }

  if (!transferRow && payoutItemId) {
    const { data } = await supabase
      .from("payout_transfers")
      .select("id")
      .eq("provider_transfer_id", String(payoutItemId))
      .maybeSingle();
    transferRow = data ?? null;
  }

  if (!transferRow && batchId) {
    const { data } = await supabase
      .from("payout_transfers")
      .select("id")
      .eq("provider_batch_id", String(batchId))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    transferRow = data ?? null;
  }

  if (!transferRow?.id) return { ok: false, error: "Payout transfer not found" };

  const { error: markErr } = await supabase.rpc("mark_payout_result", {
    p_transfer_id: transferRow.id,
    p_status: status,
    p_metadata: {
      source: "paypal.webhook",
      provider_transfer_id: payoutItemId ?? null,
      provider_batch_id: batchId ?? null,
    },
  });
  if (markErr) return { ok: false, error: "Payout update failed" };

  return { ok: true, updated: true };
}

function mapPayoutStatus(eventType: string): "success" | "failed" | "submitted" | null {
  if (eventType.endsWith("SUCCEEDED")) return "success";
  if (
    eventType.endsWith("FAILED") ||
    eventType.endsWith("DENIED") ||
    eventType.endsWith("BLOCKED") ||
    eventType.endsWith("RETURNED") ||
    eventType.endsWith("CANCELED")
  ) {
    return "failed";
  }
  if (eventType.endsWith("UNCLAIMED") || eventType.endsWith("ONHOLD")) return "submitted";
  return null;
}

async function verifyPaypalSignature(params: {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
  webhookId: string;
  event: any;
}): Promise<boolean> {
  const token = await getPaypalToken();
  if (!token) return false;

  const res = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transmission_id: params.transmissionId,
      transmission_time: params.transmissionTime,
      cert_url: params.certUrl,
      auth_algo: params.authAlgo,
      transmission_sig: params.transmissionSig,
      webhook_id: params.webhookId,
      webhook_event: params.event,
    }),
  });
  const json = await res.json();
  if (!res.ok) return false;
  return json?.verification_status === "SUCCESS";
}

async function getPaypalToken(): Promise<string | null> {
  const auth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json();
  if (!res.ok) return null;
  return json.access_token ?? null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
