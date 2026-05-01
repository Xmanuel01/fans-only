import type { SupabaseClient } from "npm:@supabase/supabase-js@2.46.1";
import type { AdminRole } from "./guards.ts";

export async function recordPayoutAudit(
  supabase: SupabaseClient,
  params: {
    payoutTransferId: number;
    actorId?: string | null;
    actorEmail: string;
    actorRole: AdminRole | "service";
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabase.from("payout_admin_audit_log").insert({
    payout_transfer_id: params.payoutTransferId,
    actor_id: params.actorId ?? null,
    actor_email: params.actorEmail,
    actor_role: params.actorRole,
    action: params.action,
    from_status: params.fromStatus ?? null,
    to_status: params.toStatus ?? null,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.warn("Could not record payout audit event", params.action, error);
  }
}

export async function recordNotificationEvent(
  supabase: SupabaseClient,
  params: {
    payoutTransferId?: number | null;
    eventKind: "creator_requested" | "admin_requested" | "creator_status" | "admin_resend";
    recipientEmail: string;
    status: "sent" | "failed" | "skipped";
    provider?: string;
    errorMessage?: string | null;
    providerMessageId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabase.from("payout_notification_events").insert({
    payout_transfer_id: params.payoutTransferId ?? null,
    event_kind: params.eventKind,
    recipient_email: params.recipientEmail,
    provider: params.provider ?? "resend",
    status: params.status,
    error_message: params.errorMessage ?? null,
    provider_message_id: params.providerMessageId ?? null,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.warn("Could not record payout notification event", params.eventKind, error);
  }
}
