import type { SupabaseClient } from "npm:@supabase/supabase-js@2.46.1";

/**
 * Verifies the bearer token, returns user id, and checks profiles.age_confirmed_at.
 * Responds with 401 if no/invalid token, 403 if age not confirmed.
 */
export async function requireAgeConfirmed(
  supabase: SupabaseClient,
  req: Request,
): Promise<{ userId: string; errorResponse?: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return {
      userId: "",
      errorResponse: json({ error: "Missing bearer token" }, 401),
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return {
      userId: "",
      errorResponse: json({ error: "Invalid token" }, 401),
    };
  }
  const userId = userData.user.id;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("age_confirmed_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    return { userId: "", errorResponse: json({ error: "Profile fetch failed" }, 500) };
  }

  if (!profile?.age_confirmed_at) {
    return {
      userId: "",
      errorResponse: json({ error: "Age confirmation required" }, 403),
    };
  }

  return { userId };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
