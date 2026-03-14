import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";

const CREATOR_PROFILE_BUCKET = Deno.env.get("CREATOR_PROFILE_BUCKET") ?? "creator-profiles";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, 405);
  if (!supabase) return jsonWithCors({ error: "Supabase not configured" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return jsonWithCors({ error: "Missing bearer token" }, 401);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return jsonWithCors({ error: "Invalid token" }, 401);
  }

  const formData = await req.formData();
  const folder = formData.get("folder");
  const file = formData.get("file");

  if ((folder !== "avatar" && folder !== "banner") || !(file instanceof File)) {
    return jsonWithCors({ error: "Invalid upload payload" }, 400);
  }

  const bucketReady = await ensureCreatorProfileBucket();
  if (!bucketReady.ok) {
    return jsonWithCors({ error: bucketReady.error }, 500);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userData.user.id}/${folder}/${crypto.randomUUID?.() ?? Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(CREATOR_PROFILE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (uploadError) {
    return jsonWithCors({ error: uploadError.message ?? "Upload failed" }, 500);
  }

  const { data } = supabase.storage.from(CREATOR_PROFILE_BUCKET).getPublicUrl(path);
  return jsonWithCors({
    bucket: CREATOR_PROFILE_BUCKET,
    path,
    publicUrl: data.publicUrl,
  });
});

async function ensureCreatorProfileBucket() {
  if (!supabase) {
    return { ok: false as const, error: "Supabase not configured" };
  }

  const { data: bucket, error: bucketError } = await supabase.storage.getBucket(CREATOR_PROFILE_BUCKET);
  if (!bucketError && bucket) {
    if (!bucket.public) {
      const { error: updateError } = await supabase.storage.updateBucket(CREATOR_PROFILE_BUCKET, {
        public: true,
      });
      if (updateError) {
        return { ok: false as const, error: updateError.message ?? "Could not update bucket" };
      }
    }
    return { ok: true as const };
  }

  const { error: createError } = await supabase.storage.createBucket(CREATOR_PROFILE_BUCKET, {
    public: true,
  });

  if (createError && !/already exists/i.test(createError.message ?? "")) {
    return { ok: false as const, error: createError.message ?? "Could not create bucket" };
  }

  return { ok: true as const };
}
