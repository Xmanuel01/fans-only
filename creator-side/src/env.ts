const normalizeUrl = (value: string | undefined, fallback: string, name: string) => {
  if (!value) {
    if (import.meta.env.DEV) {
      console.warn(`[env] ${name} is not set; using ${fallback}.`);
    }
    return fallback;
  }

  try {
    const url = new URL(value);
    return url.toString().replace(/\/$/, '');
  } catch {
    if (import.meta.env.DEV) {
      console.warn(`[env] ${name} is invalid: ${value}. Using ${fallback}.`);
    }
    return fallback;
  }
};

const readOptional = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const supabaseUrl = readOptional(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = readOptional(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  consumerAppUrl: normalizeUrl(
    import.meta.env.VITE_CONSUMER_APP_URL,
    'https://app.example.com',
    'VITE_CONSUMER_APP_URL'
  ),
  enableDemoMode: !import.meta.env.PROD && import.meta.env.VITE_ENABLE_DEMO_MODE !== 'false',
  forceAuthScreenOnDevBoot:
    !import.meta.env.PROD && import.meta.env.VITE_FORCE_AUTH_SCREEN_ON_DEV_BOOT !== 'false',
  isProd: Boolean(import.meta.env.PROD),
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn('[env] Supabase is not configured. Auth will be disabled.');
}
