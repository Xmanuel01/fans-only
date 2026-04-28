const missing: string[] = []
const invalid: string[] = []

const readRequired = (value: string | undefined, name: string): string | null => {
  if (!value) {
    missing.push(name)
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    missing.push(name)
    return null
  }
  return trimmed
}

const readOptional = (value: string | undefined): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const readEmailList = (value: string | undefined, name: string): string[] => {
  const raw = readOptional(value)
  if (!raw) return []
  const emails = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  const invalidEmail = emails.find((entry) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry))
  if (invalidEmail) {
    invalid.push(name)
    return []
  }
  return Array.from(new Set(emails))
}

const readEmail = (value: string | undefined, name: string): string | null => {
  const email = readOptional(value)
  if (!email) return null
  const isValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  if (!isValid) {
    invalid.push(name)
    return null
  }
  return email
}

const normalizeUrl = (value: string | null, name: string): string | null => {
  if (!value) {
    return null
  }
  try {
    const url = new URL(value)
    return url.toString().replace(/\/$/, '')
  } catch {
    invalid.push(name)
    return null
  }
}

const normalizeUrlOrPath = (value: string | null, name: string): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/')) {
    return trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
  }
  return normalizeUrl(trimmed, name)
}

const supabaseUrl = normalizeUrl(
  readRequired(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  'VITE_SUPABASE_URL'
)
const supabaseAnonKey = readRequired(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  'VITE_SUPABASE_ANON_KEY'
)
const creatorAppUrl =
  normalizeUrlOrPath(readOptional(import.meta.env.VITE_CREATOR_APP_URL), 'VITE_CREATOR_APP_URL') ??
  '/creator'
const publicAppOrigin = normalizeUrl(
  readOptional(import.meta.env.VITE_PUBLIC_APP_ORIGIN),
  'VITE_PUBLIC_APP_ORIGIN'
)
const adminAppUrl =
  normalizeUrlOrPath(readOptional(import.meta.env.VITE_ADMIN_APP_URL), 'VITE_ADMIN_APP_URL') ??
  '/creator/admin'
const adminEmails = readEmailList(import.meta.env.VITE_ADMIN_EMAILS, 'VITE_ADMIN_EMAILS')

const helpCenterUrl = normalizeUrl(
  readOptional(import.meta.env.VITE_HELP_CENTER_URL),
  'VITE_HELP_CENTER_URL'
)
const releaseNotesUrl = normalizeUrl(
  readOptional(import.meta.env.VITE_RELEASE_NOTES_URL),
  'VITE_RELEASE_NOTES_URL'
)
const appDownloadUrl = normalizeUrl(
  readOptional(import.meta.env.VITE_APP_DOWNLOAD_URL),
  'VITE_APP_DOWNLOAD_URL'
)
const exitUrl = normalizeUrl(readOptional(import.meta.env.VITE_EXIT_URL), 'VITE_EXIT_URL')
const supportEmail = readEmail(import.meta.env.VITE_SUPPORT_EMAIL, 'VITE_SUPPORT_EMAIL')

const giftCreatorId = readOptional(import.meta.env.VITE_GIFT_CREATOR_ID)
const giftAmountRaw = readOptional(import.meta.env.VITE_GIFT_AMOUNT_MAJOR)
const giftAmountMajor = giftAmountRaw && Number.isFinite(Number(giftAmountRaw))
  ? Number(giftAmountRaw)
  : null
const featureRequestsEnabled = import.meta.env.VITE_FEATURE_REQUESTS_ENABLED === 'true'

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  creatorAppUrl,
  publicAppOrigin,
  adminAppUrl,
  adminEmails,
  helpCenterUrl,
  releaseNotesUrl,
  appDownloadUrl,
  exitUrl,
  supportEmail,
  giftCreatorId,
  giftAmountMajor,
  featureRequestsEnabled,
  isProd: Boolean(import.meta.env.PROD),
}

export const envStatus = {
  missing,
  invalid,
  hasIssues: missing.length > 0 || invalid.length > 0,
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
export const isAdminEmail = (email: string | null | undefined) =>
  Boolean(email && env.adminEmails.includes(email.trim().toLowerCase()))

if (envStatus.hasIssues && import.meta.env.DEV) {
  const details = [
    missing.length ? `missing: ${missing.join(', ')}` : null,
    invalid.length ? `invalid: ${invalid.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
  console.warn(`[env] Configuration issues detected (${details}).`)
}
