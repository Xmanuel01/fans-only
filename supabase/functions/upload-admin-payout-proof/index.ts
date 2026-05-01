import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";
import { requireAdminAccess } from "../_shared/guards.ts";
import { recordPayoutAudit } from "../_shared/admin.ts";

type Body = {
  transferId?: number;
  fileName?: string;
  contentType?: string;
  dataBase64?: string;
  externalReference?: string | null;
};

const MAX_BYTES = 5 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "application/pdf"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const { userId, email, role, errorResponse } = await requireAdminAccess(supabase, req, {
    minimumRole: "operator",
    requireRecentSignInMinutes: 30,
  });
  if (errorResponse) {
    return jsonWithCors(JSON.parse(await errorResponse.text()), errorResponse.status);
  }

  let body: Body = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const transferId = Number(body.transferId);
  const fileName = body.fileName?.trim() ?? "";
  const contentType = body.contentType?.trim() ?? "";
  const dataBase64 = body.dataBase64?.trim() ?? "";
  const externalReference = body.externalReference?.trim() ?? null;

  if (!Number.isFinite(transferId) || transferId <= 0) {
    return jsonWithCors({ error: "transferId is required" }, 400);
  }
  if (!fileName || !contentType || !dataBase64) {
    return jsonWithCors({ error: "fileName, contentType, and dataBase64 are required" }, 400);
  }
  if (!allowedMimeTypes.has(contentType)) {
    return jsonWithCors({ error: "Only PNG, JPEG, and PDF proof files are supported." }, 400);
  }

  const bytes = decodeBase64Payload(dataBase64);
  if (bytes.byteLength > MAX_BYTES) {
    return jsonWithCors({ error: "Proof files must be 5MB or smaller." }, 400);
  }

  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${transferId}/${Date.now()}-${sanitizedName}`;
  const upload = await supabase.storage
    .from("admin-payout-proofs")
    .upload(path, bytes, { contentType, upsert: false });
  if (upload.error) {
    return jsonWithCors({ error: "Could not upload payout proof", details: upload.error.message }, 400);
  }

  const { error: updateError } = await supabase
    .from("payout_transfers")
    .update({
      proof_path: path,
      external_reference: externalReference,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transferId);
  if (updateError) {
    return jsonWithCors({ error: "Could not attach payout proof", details: updateError.message }, 400);
  }

  const signed = await supabase.storage.from("admin-payout-proofs").createSignedUrl(path, 60 * 60);
  const proofUrl = signed.data?.signedUrl ?? null;

  await recordPayoutAudit(supabase, {
    payoutTransferId: transferId,
    actorId: userId,
    actorEmail: email,
    actorRole: role,
    action: "proof_uploaded",
    note: externalReference,
    metadata: {
      proof_path: path,
      content_type: contentType,
      external_reference: externalReference,
    },
  });

  return jsonWithCors({ ok: true, proofPath: path, proofUrl, externalReference });
});

function decodeBase64Payload(value: string) {
  const normalized = value.includes(",") ? value.split(",").pop() ?? "" : value;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
