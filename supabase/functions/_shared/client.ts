import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceKey) {
  console.warn(
    "[supabase client] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Functions will fail until set."
  );
}

export const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;
