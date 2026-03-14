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

const readEmail = (value: string | null, name: string): string | null => {
  if (!value) return null
  const email = value.trim()
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

const helpCenterUrl = normalizeUrl(
  readOptional(import.meta.env.VITE_HELP_CENTER_URL),
  'VITE_HELP_CENTER_URL'
)
const exitUrl = normalizeUrl(
  readRequired(import.meta.env.VITE_EXIT_URL, 'VITE_EXIT_URL'),
  'VITE_EXIT_URL'
)
const supportEmail = readEmail(
  readOptional(import.meta.env.VITE_SUPPORT_EMAIL),
  'VITE_SUPPORT_EMAIL'
)

const giftCreatorId = readOptional(import.meta.env.VITE_GIFT_CREATOR_ID)
const giftAmountRaw = readOptional(import.meta.env.VITE_GIFT_AMOUNT_MAJOR)
const giftAmountMajor = giftAmountRaw && Number.isFinite(Number(giftAmountRaw))
  ? Number(giftAmountRaw)
  : null
const mpesaStkEnabled = import.meta.env.VITE_MPESA_STK_ENABLED === 'true'

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  creatorAppUrl,
  publicAppOrigin,
  helpCenterUrl,
  exitUrl,
  supportEmail,
  giftCreatorId,
  giftAmountMajor,
  mpesaStkEnabled,
  isProd: Boolean(import.meta.env.PROD),
}

export const envStatus = {
  missing,
  invalid,
  hasIssues: missing.length > 0 || invalid.length > 0,
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)

if (envStatus.hasIssues && import.meta.env.PROD) {
  const details = [
    missing.length ? `missing: ${missing.join(', ')}` : null,
    invalid.length ? `invalid: ${invalid.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
  throw new Error(`[env] Production configuration invalid (${details})`)
}

if (envStatus.hasIssues && import.meta.env.DEV) {
  const details = [
    missing.length ? `missing: ${missing.join(', ')}` : null,
    invalid.length ? `invalid: ${invalid.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
  console.warn(`[env] Configuration issues detected (${details}).`)
}
