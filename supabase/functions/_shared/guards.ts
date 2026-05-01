import type { SupabaseClient } from "npm:@supabase/supabase-js@2.46.1";

export type AdminRole = "viewer" | "operator" | "super_admin";

const parseEmailList = (key: string) =>
  Array.from(
    new Set(
      (Deno.env.get(key) ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

const adminEmails = parseEmailList("ADMIN_EMAILS");
const viewerEmails = parseEmailList("ADMIN_VIEWER_EMAILS");
const operatorEmails = parseEmailList("ADMIN_OPERATOR_EMAILS");
const superAdminEmails = parseEmailList("ADMIN_SUPER_ADMIN_EMAILS");

const roleRank: Record<AdminRole, number> = {
  viewer: 1,
  operator: 2,
  super_admin: 3,
};

const resolveAdminRole = (email: string): AdminRole | null => {
  if (superAdminEmails.includes(email)) return "super_admin";
  if (operatorEmails.includes(email)) return "operator";
  if (viewerEmails.includes(email)) return "viewer";
  if (adminEmails.includes(email)) return "operator";
  return null;
};

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
  options?: {
    minimumRole?: AdminRole;
    requireRecentSignInMinutes?: number;
  },
): Promise<{ userId: string; email: string; role: AdminRole; errorResponse?: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return {
      userId: "",
      email: "",
      role: "viewer",
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
      role: "viewer",
      errorResponse: json({ error: "Invalid token" }, 401),
    };
  }

  if (!adminEmails.length && !viewerEmails.length && !operatorEmails.length && !superAdminEmails.length) {
    return {
      userId: "",
      email,
      role: "viewer",
      errorResponse: json({ error: "ADMIN_EMAILS missing" }, 500),
    };
  }

  const role = resolveAdminRole(email);
  if (!role) {
    return {
      userId: "",
      email,
      role: "viewer",
      errorResponse: json({ error: "Admin access required" }, 403),
    };
  }

  if (options?.minimumRole && roleRank[role] < roleRank[options.minimumRole]) {
    return {
      userId: "",
      email,
      role,
      errorResponse: json({ error: "Insufficient admin permissions" }, 403),
    };
  }

  const requireRecentSignInMinutes = options?.requireRecentSignInMinutes ?? 0;
  if (requireRecentSignInMinutes > 0) {
    const lastSignInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : NaN;
    const cutoff = Date.now() - requireRecentSignInMinutes * 60 * 1000;
    if (!Number.isFinite(lastSignInAt) || lastSignInAt < cutoff) {
      return {
        userId: "",
        email,
        role,
        errorResponse: json(
          { error: "Recent sign-in required. Sign in again before changing payout state." },
          403,
        ),
      };
    }
  }

  return { userId: user.id, email, role };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
