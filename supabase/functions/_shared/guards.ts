import type { SupabaseClient } from "npm:@supabase/supabase-js@2.46.1";

const adminEmails = Array.from(
  new Set(
    (Deno.env.get("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ),
);

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

/**
 * Verifies bearer token, creator profile existence, and age confirmation.
 * Responds with 401 if no/invalid token, 403 if age not confirmed or creator missing.
 */
export async function requireCreatorPaymentAccess(
  supabase: SupabaseClient,
  req: Request,
): Promise<{ creatorId: string; errorResponse?: Response }> {
  const { userId, errorResponse } = await requireAgeConfirmed(supabase, req);
  if (errorResponse) {
    return {
      creatorId: "",
      errorResponse,
    };
  }

  const { data: creatorRow, error: creatorErr } = await supabase
    .from("creators")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (creatorErr) {
    return {
      creatorId: "",
      errorResponse: json({ error: "Creator lookup failed" }, 500),
    };
  }

  if (!creatorRow) {
    return {
      creatorId: "",
      errorResponse: json({ error: "Creator profile required" }, 403),
    };
  }

  return { creatorId: userId };
}

export async function requireAdminAccess(
  supabase: SupabaseClient,
  req: Request,
): Promise<{ userId: string; email: string; errorResponse?: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return {
      userId: "",
      email: "",
      errorResponse: json({ error: "Missing bearer token" }, 401),
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  const email = user?.email?.trim().toLowerCase() ?? "";
  if (userError || !user?.id || !email) {
    return {
      userId: "",
      email: "",
      errorResponse: json({ error: "Invalid token" }, 401),
    };
  }

  if (!adminEmails.length) {
    return {
      userId: "",
      email,
      errorResponse: json({ error: "ADMIN_EMAILS missing" }, 500),
    };
  }

  if (!adminEmails.includes(email)) {
    return {
      userId: "",
      email,
      errorResponse: json({ error: "Admin access required" }, 403),
    };
  }

  return { userId: user.id, email };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
