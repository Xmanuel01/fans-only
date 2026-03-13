// Ensure a profile exists and generate a unique username on first sign-in.
// Uses service role and validates the caller via Authorization bearer token.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/client.ts";
import { corsHeaders, jsonWithCors } from "../_shared/cors.ts";

const ADJECTIVES = [
  "amber",
  "brave",
  "brolly",
  "calm",
  "cloudy",
  "copper",
  "crisp",
  "dawn",
  "ember",
  "faded",
  "frosty",
  "gentle",
  "golden",
  "honey",
  "ivory",
  "jazzy",
  "lucid",
  "mellow",
  "midnight",
  "mossy",
  "noble",
  "opal",
  "pearl",
  "quiet",
  "rusty",
  "sable",
  "silky",
  "sunny",
  "tender",
  "velvet",
  "violet",
];

const NOUNS = [
  "aurora",
  "breeze",
  "cascade",
  "dahlia",
  "dune",
  "echo",
  "ember",
  "falcon",
  "feather",
  "flora",
  "glade",
  "harbor",
  "horizon",
  "island",
  "jewel",
  "lagoon",
  "lumen",
  "meadow",
  "nova",
  "oasis",
  "orbit",
  "petal",
  "prairie",
  "quartz",
  "ripple",
  "saffron",
  "sage",
  "tiger",
  "vivid",
  "whisper",
];

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

  const user = userData.user;
  const userId = user.id;

  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    return jsonWithCors({ error: "Profile lookup failed" }, 500);
  }

  if (existingProfile?.username) {
    return jsonWithCors(existingProfile);
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Member";

  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const digits = Math.floor(Math.random() * 90 + 10);
    const username = `${adjective}${noun}${digits}`.toLowerCase();

    const payload = {
      id: userId,
      username,
      display_name: displayName,
      avatar_url: avatarUrl,
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("id, username, display_name, avatar_url")
      .single();

    if (!error) {
      return jsonWithCors(data);
    }

    if (error.code === "23505") {
      continue;
    }

    return jsonWithCors({ error: "Profile update failed" }, 500);
  }

  return jsonWithCors({ error: "Could not generate a unique username" }, 500);
});
