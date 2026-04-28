const missing: string[] = [];
const invalid: string[] = [];

const readRequired = (value: string | undefined, name: string): string | null => {
  if (!value) {
    missing.push(name);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    missing.push(name);
    return null;
  }
  return trimmed;
};

const readOptional = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readEmailList = (value: string | undefined, name: string): string[] => {
  const raw = readOptional(value);
  if (!raw) return [];
  const emails = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const invalidEmail = emails.find((entry) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry));
  if (invalidEmail) {
    invalid.push(name);
    return [];
  }
  return Array.from(new Set(emails));
};

const normalizeUrl = (value: string | null, name: string): string | null => {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.toString().replace(/\/$/, '');
  } catch {
    invalid.push(name);
    return null;
  }
};

const normalizeUrlOrPath = (value: string | null, name: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) {
    return trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  }
  return normalizeUrl(trimmed, name);
};

const normalizeBasePath = (value: string | null, fallback: string): string => {
  if (!value) return fallback;
  let trimmed = value.trim();
  if (!trimmed) return fallback;
  if (!trimmed.startsWith('/')) {
    trimmed = `/${trimmed}`;
  }
  if (trimmed.length > 1 && trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

const supabaseUrl = normalizeUrl(
  readRequired(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  'VITE_SUPABASE_URL'
);
const supabaseAnonKey = readRequired(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  'VITE_SUPABASE_ANON_KEY'
);
const consumerAppUrl =
  normalizeUrlOrPath(readOptional(import.meta.env.VITE_CONSUMER_APP_URL), 'VITE_CONSUMER_APP_URL') ??
  '/user';
const publicAppOrigin = normalizeUrl(
  readOptional(import.meta.env.VITE_PUBLIC_APP_ORIGIN),
  'VITE_PUBLIC_APP_ORIGIN'
);
const creatorBasePath = normalizeBasePath(
  readOptional(import.meta.env.VITE_CREATOR_BASE_PATH),
  '/creator'
);
const adminAppUrl =
  normalizeUrlOrPath(readOptional(import.meta.env.VITE_ADMIN_APP_URL), 'VITE_ADMIN_APP_URL') ??
  `${creatorBasePath}/admin`;
const adminEmails = readEmailList(import.meta.env.VITE_ADMIN_EMAILS, 'VITE_ADMIN_EMAILS');

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  consumerAppUrl,
  publicAppOrigin,
  creatorBasePath,
  adminAppUrl,
  adminEmails,
  isProd: Boolean(import.meta.env.PROD),
};

export const envStatus = {
  missing,
  invalid,
  hasIssues: missing.length > 0 || invalid.length > 0,
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isConsumerAppConfigured = Boolean(env.consumerAppUrl);
export const isAdminEmail = (email: string | null | undefined) =>
  Boolean(email && env.adminEmails.includes(email.trim().toLowerCase()));

if (envStatus.hasIssues && import.meta.env.DEV) {
  const details = [
    missing.length ? `missing: ${missing.join(', ')}` : null,
    invalid.length ? `invalid: ${invalid.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
  console.warn(`[env] Configuration issues detected (${details}).`);
}
