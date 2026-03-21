import { createClient, type Session, type Provider } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from './env'

const supabaseUrl = env.supabaseUrl
const supabaseAnonKey = env.supabaseAnonKey

export const supabase =
  isSupabaseConfigured && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

const FALLBACK_PUBLIC_APP_ORIGIN = 'https://fans-only-olive.vercel.app'
const resolveAuthRedirectOrigin = () => {
  if (env.publicAppOrigin) {
    return env.publicAppOrigin
  }
  if (import.meta.env.PROD) {
    return FALLBACK_PUBLIC_APP_ORIGIN
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return FALLBACK_PUBLIC_APP_ORIGIN
}
const appRedirectUrl = () =>
  new URL(import.meta.env.BASE_URL ?? '/', resolveAuthRedirectOrigin()).toString()

const isMissingRpcError = (error: unknown, functionName: string) => {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string }
  return (
    candidate.code === 'PGRST202' &&
    typeof candidate.message === 'string' &&
    candidate.message.includes(functionName)
  )
}

async function describeFunctionInvokeError(error: unknown, fallback: string): Promise<string> {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const candidate = error as {
    message?: string
    details?: string
    context?: {
      json?: () => Promise<unknown>
      text?: () => Promise<string>
      status?: number
      statusText?: string
      clone?: () => {
        json?: () => Promise<unknown>
        text?: () => Promise<string>
        status?: number
        statusText?: string
      }
    }
  }

  const response = candidate.context?.clone?.() ?? candidate.context
  if (response?.json) {
    try {
      const payload = await response.json()
      if (payload && typeof payload === 'object') {
        const body = payload as { error?: unknown; details?: unknown; message?: unknown }
        const directMessage =
          typeof body.error === 'string'
            ? body.error
            : typeof body.message === 'string'
              ? body.message
              : null
        if (directMessage) {
          return directMessage
        }
        if (typeof body.details === 'string' && body.details.trim()) {
          return body.details
        }
      }
    } catch {
      // ignore invalid JSON payloads and fall through to text/message handling
    }
  }

  if (response?.text) {
    try {
      const text = await response.text()
      if (text.trim()) {
        return text.trim()
      }
    } catch {
      // ignore response body read failures
    }
  }

  if (typeof candidate.details === 'string' && candidate.details.trim()) {
    return candidate.details
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    const rawMessage = candidate.message.trim()
    return rawMessage === 'Failed to send a request to the Edge Function'
      ? 'Could not reach the payment service'
      : rawMessage
  }

  if (response?.status && response?.statusText) {
    return `${fallback} (${response.status} ${response.statusText})`
  }

  return fallback
}

export type CreatorProfile = {
  id: string
  handle: string
  display_name: string | null
  subscription_price_cents?: number
  subscription_currency?: string
}

export type UserProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export type WalletBalance = {
  available_amount_minor: number
  pending_amount_minor: number
  currency: string
}

export type WalletHistoryItem = {
  id: number
  entry_type: 'credit_topup' | 'debit_ppv' | 'debit_tip' | 'refund'
  amount_minor: number
  currency: string
  created_at: string
  metadata: Record<string, any>
  creator: CreatorCard | null
  post_title: string | null
}

export type PpvPurchase = {
  post_id: number
}

export type CreatorCard = {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
  category: string | null
  categories?: string[] | null
  popularity_score?: number | null
  subscription_price_cents?: number | null
  subscription_currency?: string | null
  score?: number | null
}

export type SubscriptionHistoryItem = {
  payment_id: number
  creator: CreatorCard
  amount_cents: number
  currency: string
  subscribed_at: string
  expires_at: string | null
  status: 'active' | 'canceled' | 'expired'
}

function mapCreatorCard(row: any): CreatorCard {
  return {
    id: row.id,
    handle: row.handle,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    category: row.category,
    categories: Array.isArray(row.categories)
      ? row.categories.filter((item: unknown): item is string => typeof item === 'string')
      : null,
    popularity_score: row.popularity_score,
    subscription_price_cents: row.subscription_price_cents,
    subscription_currency: row.subscription_currency,
    score: row.score,
  }
}

function mergeCreatorCards(primary: CreatorCard[], extra: CreatorCard[]) {
  const byId = new Map<string, CreatorCard>()
  for (const creator of primary) {
    byId.set(creator.id, creator)
  }
  for (const creator of extra) {
    const existing = byId.get(creator.id)
    if (!existing) {
      byId.set(creator.id, creator)
      continue
    }
    byId.set(creator.id, {
      ...existing,
      ...creator,
      categories:
        creator.categories?.length
          ? creator.categories
          : existing.categories?.length
            ? existing.categories
            : null,
    })
  }
  return Array.from(byId.values())
}

export type FeedMedia = {
  id: number
  url: string
  mime_type: string | null
  width: number | null
  height: number | null
}

export type FeedPost = {
  id: number
  title: string
  body: string | null
  visibility: 'public' | 'subscribers' | 'ppv'
  price_cents: number | null
  currency: string | null
  content_rating: 'sfw' | 'nsfw'
  post_type: 'post' | 'story'
  expires_at: string | null
  created_at: string
  creator: {
    id: string
    handle: string
    display_name: string
    avatar_url: string | null
    category: string | null
    categories?: string[] | null
    subscription_price_cents: number | null
    subscription_currency: string | null
  }
  media: FeedMedia[]
}

export type ChatThreadSummary = {
  thread_id: string
  creator_id: string
  member_id: string
  peer_id: string
  peer_role: 'creator' | 'member'
  peer_name: string
  peer_handle: string
  peer_avatar_url: string | null
  last_message_preview: string | null
  last_message_at: string | null
  last_message_sender_id: string | null
  unread_count: number
  created_at: string
}

export type ChatMessage = {
  message_id: number
  thread_id: string
  sender_id: string
  sender_role: 'creator' | 'member'
  sender_name: string
  sender_handle: string
  sender_avatar_url: string | null
  body: string
  created_at: string
}

export type ChatableCreator = {
  creator_id: string
  display_name: string
  handle: string
  avatar_url: string | null
}

export type AppNotification = {
  id: number
  type: string
  payload: Record<string, any>
  read_at: string | null
  created_at: string
}

export type NotificationPreferences = {
  push: boolean
  email: boolean
  sms: boolean
  messages: boolean
  payments: boolean
  subscriptions: boolean
  content: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  email: true,
  sms: false,
  messages: true,
  payments: true,
  subscriptions: true,
  content: true,
}

const notificationPreferencesStorageKey = (userId: string) =>
  `fans-only:notification-preferences:${userId}`

function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const parsed =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  return {
    push:
      typeof parsed.push === 'boolean'
        ? parsed.push
        : DEFAULT_NOTIFICATION_PREFERENCES.push,
    email:
      typeof parsed.email === 'boolean'
        ? parsed.email
        : DEFAULT_NOTIFICATION_PREFERENCES.email,
    sms:
      typeof parsed.sms === 'boolean' ? parsed.sms : DEFAULT_NOTIFICATION_PREFERENCES.sms,
    messages:
      typeof parsed.messages === 'boolean'
        ? parsed.messages
        : DEFAULT_NOTIFICATION_PREFERENCES.messages,
    payments:
      typeof parsed.payments === 'boolean'
        ? parsed.payments
        : DEFAULT_NOTIFICATION_PREFERENCES.payments,
    subscriptions:
      typeof parsed.subscriptions === 'boolean'
        ? parsed.subscriptions
        : DEFAULT_NOTIFICATION_PREFERENCES.subscriptions,
    content:
      typeof parsed.content === 'boolean'
        ? parsed.content
        : DEFAULT_NOTIFICATION_PREFERENCES.content,
  }
}

function readNotificationPreferencesFallback(userId: string): NotificationPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_NOTIFICATION_PREFERENCES
  }

  try {
    const raw = window.localStorage.getItem(notificationPreferencesStorageKey(userId))
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES
    return normalizeNotificationPreferences(JSON.parse(raw))
  } catch (error) {
    console.warn('Notification preferences local fallback read failed', error)
    return DEFAULT_NOTIFICATION_PREFERENCES
  }
}

function persistNotificationPreferencesFallback(userId: string, value: NotificationPreferences) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(notificationPreferencesStorageKey(userId), JSON.stringify(value))
  } catch (error) {
    console.warn('Notification preferences local fallback save failed', error)
  }
}

const AGE_EVENT_RATE_LIMIT_MS = 10_000
let lastAgeEventTs = 0

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.warn('Supabase session fetch failed', error)
    return null
  }
  return data.session ?? null
}

export async function fetchAgeConfirmation(): Promise<boolean | null> {
  if (!supabase) return null
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('age_confirmed_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Supabase age fetch failed', error)
    return null
  }

  return Boolean(data?.age_confirmed_at)
}

export async function markAgeConfirmed() {
  if (!supabase) return
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return

  const { error } = await supabase
    .from('profiles')
    .update({ age_confirmed_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    console.warn('Supabase age confirm update failed', error)
  }
}

export async function logAgeEvent(action: 'enter' | 'exit') {
  if (!supabase) return

  const now = Date.now()
  if (now - lastAgeEventTs < AGE_EVENT_RATE_LIMIT_MS) {
    return
  }
  lastAgeEventTs = now

  const session = await getCurrentSession()
  const userId = session?.user?.id
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'

  const { error } = await supabase.from('age_gate_events').insert({
    user_id: userId ?? null,
    action,
    user_agent: userAgent,
    ip: null, // intentionally not collecting client IP without explicit consent
    created_at: new Date().toISOString(),
  })

  if (error) {
    console.warn('Supabase age event log failed', error)
  }
}

export async function logAgeExit() {
  await logAgeEvent('exit')
}

export async function sendMagicLink(email: string) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: appRedirectUrl() },
  })
  if (error) throw error
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUpWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appRedirectUrl() },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.warn('Supabase sign-out failed', error)
  }
}

export async function signInWithProvider(provider: Provider) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: appRedirectUrl() },
  })
  if (error) throw error
}

export async function submitFeatureRequest(message: string) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.functions.invoke('feature-request', {
    body: { message },
  })
  if (error) throw error
  return data
}

export async function initiatePaystackPayment({
  email,
  creatorId,
  postId,
  amountMajor,
  currency = 'KES',
  type = 'tip',
  metadata = {},
  channels,
  callbackUrl,
}: {
  email: string
  creatorId?: string
  postId?: number
  amountMajor: number
  currency?: string
  type?: 'tip' | 'subscription' | 'wallet_topup' | 'ppv'
  metadata?: Record<string, unknown>
  channels?: string[]
  callbackUrl?: string
}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.functions.invoke('paystack-init', {
    body: {
      email,
      creator_id: creatorId,
      post_id: postId,
      amountMajor,
      currency,
      type,
      metadata,
      channels,
      callback_url: callbackUrl,
    },
  })
  if (error) {
    throw new Error(await describeFunctionInvokeError(error, 'Could not start checkout'))
  }
  return data as { authorization_url?: string; reference?: string }
}

export async function initiateMpesaStkPush({
  phone,
  amountMajor,
}: {
  phone: string
  amountMajor: number
}): Promise<{ checkoutRequestId?: string; merchantRequestId?: string; customerMessage?: string }> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.functions.invoke('mpesa-stk-init', {
    body: { phone, amountMajor },
  })
  if (error) throw error
  return data as { checkoutRequestId?: string; merchantRequestId?: string; customerMessage?: string }
}

export async function fetchRecommendedCreators({
  searchTerm,
  category,
  limit = 12,
}: {
  searchTerm?: string
  category?: string
  limit?: number
} = {}): Promise<CreatorCard[]> {
  if (!supabase) return []
  const normalizedSearch = searchTerm?.trim().toLowerCase() ?? ''
  const activeCategory = category && category !== 'All' ? category : null
  const { data, error } = await supabase.rpc('get_recommended_creators', {
    search_term: searchTerm?.trim() || null,
    category: activeCategory,
    limit_count: limit,
  })

  if (error) {
    console.warn('Supabase recommended creators fetch failed', error)
  }

  let creators = data?.map((creator: any) => mapCreatorCard(creator)) ?? []

  if (activeCategory) {
    const directSelect =
      'id, handle, display_name, avatar_url, category, categories, popularity_score, subscription_price_cents, subscription_currency'
    const [{ data: directPrimary, error: primaryError }, { data: directSecondary, error: secondaryError }] =
      await Promise.all([
        supabase
          .from('creators')
          .select(directSelect)
          .eq('category', activeCategory)
          .order('popularity_score', { ascending: false })
          .limit(limit),
        supabase
          .from('creators')
          .select(directSelect)
          .contains('categories', [activeCategory])
          .order('popularity_score', { ascending: false })
          .limit(limit),
      ])

    if (primaryError) {
      console.warn('Supabase primary creator category fetch failed', primaryError)
    }
    if (secondaryError) {
      console.warn('Supabase secondary creator category fetch failed', secondaryError)
    }

    creators = mergeCreatorCards(creators, [
      ...(directPrimary?.map((creator: any) => mapCreatorCard(creator)) ?? []),
      ...(directSecondary?.map((creator: any) => mapCreatorCard(creator)) ?? []),
    ])
  }

  if (normalizedSearch) {
    creators = creators.filter((creator: CreatorCard) => {
      const haystacks = [creator.handle, creator.display_name]
      return haystacks.some((value: string) => value.toLowerCase().includes(normalizedSearch))
    })
  }

  return creators.slice(0, limit)
}

export async function ensureProfile(): Promise<UserProfile | null> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.functions.invoke('ensure-profile', { body: {} })
  if (error) throw error
  return (data ?? null) as UserProfile | null
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  if (!supabase) return DEFAULT_NOTIFICATION_PREFERENCES
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return DEFAULT_NOTIFICATION_PREFERENCES

  const { data, error } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Supabase notification preferences fetch failed; using local fallback', error)
    return readNotificationPreferencesFallback(userId)
  }

  const normalized = normalizeNotificationPreferences(data?.notification_preferences)
  persistNotificationPreferencesFallback(userId, normalized)
  return normalized
}

export async function updateNotificationPreferences(
  next: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  if (!supabase) throw new Error('Supabase not configured')
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Authentication required')

  const current = await fetchNotificationPreferences()
  const merged = normalizeNotificationPreferences({ ...current, ...next })

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        notification_preferences: merged,
      },
      { onConflict: 'id' }
    )

  if (error) {
    console.warn('Supabase notification preferences update failed; using local fallback', error)
    persistNotificationPreferencesFallback(userId, merged)
    return merged
  }

  persistNotificationPreferencesFallback(userId, merged)
  return merged
}

export async function fetchCreatorProfile(userId: string): Promise<CreatorProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('creators')
    .select('id, handle, display_name, subscription_price_cents, subscription_currency')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Supabase creator fetch failed', error)
    return null
  }
  return data ?? null
}

export async function createCreatorProfile({
  userId,
  handle,
  displayName,
}: {
  userId: string
  handle: string
  displayName: string
}): Promise<CreatorProfile | null> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('creators')
    .upsert({ id: userId, handle, display_name: displayName })
    .select('id, handle, display_name, subscription_price_cents, subscription_currency')
    .single()

  if (error) throw error
  return data
}

export async function fetchActiveSubscriptions(): Promise<string[]> {
  if (!supabase) return []
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return []
  const { data, error } = await supabase
    .from('subscriptions')
    .select('creator_id, status, current_period_end')
    .eq('subscriber_id', userId)
    .eq('status', 'active')
  if (error) {
    console.warn('Supabase subscriptions fetch failed', error)
    return []
  }
  const now = Date.now()
  return (
    data
      ?.filter((row) => {
        if (!row.current_period_end) return true
        return new Date(row.current_period_end).getTime() > now
      })
      .map((row) => row.creator_id) ?? []
  )
}

export async function fetchSubscriptionHistory(): Promise<SubscriptionHistoryItem[]> {
  if (!supabase) return []
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return []

  const [{ data: payments, error: paymentsError }, { data: subscriptions, error: subscriptionsError }] =
    await Promise.all([
      supabase
        .from('payments')
        .select(
          'id, creator_id, amount_cents, currency, created_at, creator:creators(id, handle, display_name, avatar_url, category, categories, popularity_score, subscription_price_cents, subscription_currency)'
        )
        .eq('user_id', userId)
        .eq('type', 'subscription')
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false }),
      supabase
        .from('subscriptions')
        .select('creator_id, payment_id, current_period_end, status')
        .eq('subscriber_id', userId),
    ])

  if (paymentsError) {
    console.warn('Supabase subscription payment history fetch failed', paymentsError)
    return []
  }
  if (subscriptionsError) {
    console.warn('Supabase subscription state fetch failed', subscriptionsError)
    return []
  }

  const latestSubscriptionByPaymentId = new Map<number, any>()
  const latestSubscriptionByCreatorId = new Map<string, any>()
  ;(subscriptions ?? []).forEach((subscription: any) => {
    if (typeof subscription.payment_id === 'number') {
      latestSubscriptionByPaymentId.set(subscription.payment_id, subscription)
    }
    if (typeof subscription.creator_id === 'string') {
      latestSubscriptionByCreatorId.set(subscription.creator_id, subscription)
    }
  })

  return ((payments ?? []) as any[])
    .map((payment) => {
      const creator = payment.creator ? mapCreatorCard(payment.creator) : null
      if (!creator) return null

      const linkedSubscription =
        latestSubscriptionByPaymentId.get(payment.id) ??
        latestSubscriptionByCreatorId.get(payment.creator_id)

      const subscribedAt = payment.created_at
      let expiresAt: string | null = null
      let status: 'active' | 'canceled' | 'expired' = 'expired'

      if (linkedSubscription?.payment_id === payment.id && linkedSubscription.current_period_end) {
        expiresAt = linkedSubscription.current_period_end
        status = linkedSubscription.status ?? 'expired'
      } else if (subscribedAt) {
        const expiryDate = new Date(subscribedAt)
        expiryDate.setMonth(expiryDate.getMonth() + 1)
        expiresAt = expiryDate.toISOString()
        status = expiryDate.getTime() > Date.now() ? 'active' : 'expired'
      }

      return {
        payment_id: payment.id,
        creator,
        amount_cents: payment.amount_cents ?? 0,
        currency: payment.currency ?? 'KES',
        subscribed_at: subscribedAt,
        expires_at: expiresAt,
        status,
      } satisfies SubscriptionHistoryItem
    })
    .filter((item): item is SubscriptionHistoryItem => Boolean(item))
}

export async function fetchWalletBalance(): Promise<WalletBalance | null> {
  if (!supabase) return null
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return null
  const { data, error } = await supabase
    .from('user_wallets')
    .select('available_amount_minor, pending_amount_minor, currency')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('Supabase wallet fetch failed', error)
    return null
  }
  return data ?? null
}

export async function fetchWalletHistory(limit = 30): Promise<WalletHistoryItem[]> {
  if (!supabase) return []
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return []

  const { data: rows, error } = await supabase
    .from('user_wallet_ledger')
    .select('id, payment_id, post_id, entry_type, amount_minor, currency, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('Supabase wallet history fetch failed', error)
    return []
  }

  const ledgerRows = (rows ?? []) as Array<{
    id: number
    payment_id: number | null
    post_id: number | null
    entry_type: WalletHistoryItem['entry_type']
    amount_minor: number
    currency: string
    metadata: Record<string, any> | null
    created_at: string
  }>

  const paymentIds = Array.from(
    new Set(
      ledgerRows
        .map((row) => row.payment_id)
        .filter((value): value is number => typeof value === 'number')
    )
  )
  const postIds = Array.from(
    new Set(
      ledgerRows
        .map((row) => row.post_id)
        .filter((value): value is number => typeof value === 'number')
    )
  )

  const [paymentsResult, postsResult] = await Promise.all([
    paymentIds.length
      ? supabase
          .from('payments')
          .select('id, creator:creators(id, handle, display_name, avatar_url)')
          .in('id', paymentIds)
      : Promise.resolve({ data: [], error: null }),
    postIds.length
      ? supabase.from('posts').select('id, title').in('id', postIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (paymentsResult.error) {
    console.warn('Supabase wallet payment detail fetch failed', paymentsResult.error)
  }
  if (postsResult.error) {
    console.warn('Supabase wallet post detail fetch failed', postsResult.error)
  }

  const paymentMap = new Map<number, CreatorCard | null>()
  for (const row of (paymentsResult.data ?? []) as any[]) {
    const creatorRow = Array.isArray(row.creator) ? row.creator[0] : row.creator
    paymentMap.set(
      row.id,
      creatorRow
        ? {
            id: creatorRow.id,
            handle: creatorRow.handle,
            display_name: creatorRow.display_name,
            avatar_url: creatorRow.avatar_url,
            category: null,
            categories: null,
            popularity_score: null,
            subscription_price_cents: null,
            subscription_currency: null,
            score: null,
          }
        : null
    )
  }

  const postMap = new Map<number, string | null>()
  for (const row of (postsResult.data ?? []) as any[]) {
    postMap.set(row.id, row.title ?? null)
  }

  return ledgerRows.map((row) => ({
    id: row.id,
    entry_type: row.entry_type,
    amount_minor: row.amount_minor,
    currency: row.currency,
    created_at: row.created_at,
    metadata: row.metadata ?? {},
    creator:
      row.payment_id && paymentMap.has(row.payment_id) ? paymentMap.get(row.payment_id) ?? null : null,
    post_title: row.post_id ? postMap.get(row.post_id) ?? null : null,
  }))
}

export async function fetchPpvPurchases(): Promise<number[]> {
  if (!supabase) return []
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return []
  const { data, error } = await supabase
    .from('ppv_purchases')
    .select('post_id')
    .eq('user_id', userId)
  if (error) {
    console.warn('Supabase ppv purchases fetch failed', error)
    return []
  }
  return data?.map((row) => row.post_id) ?? []
}

export async function purchasePpv(postId: number): Promise<{ purchase_id: number; new_balance_minor: number } | null> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('purchase_ppv', { p_post_id: postId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}

export async function fetchFeedPosts(limit = 20): Promise<FeedPost[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('posts')
    .select(
      [
        'id',
        'title',
        'body',
        'visibility',
        'price_cents',
        'currency',
        'content_rating',
        'post_type',
        'expires_at',
        'created_at',
        'creator:creators(id, handle, display_name, avatar_url, category, categories, subscription_price_cents, subscription_currency)',
        'media_assets(id, storage_path, mime_type, width, height)',
      ].join(',')
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('Supabase posts fetch failed', error)
    return []
  }

  const rows = (data ?? []) as any[]
  const paths = rows.flatMap((row) =>
    (row.media_assets ?? []).map((asset: any) => asset.storage_path)
  )
  const uniquePaths = Array.from(new Set(paths)).filter(
    (path): path is string => typeof path === 'string' && path.length > 0
  )
  const signedMap = new Map<string, string>()

  if (uniquePaths.length) {
    const { data: signed, error: signedErr } = await supabase.storage
      .from('creator-media')
      .createSignedUrls(uniquePaths, 60 * 60)
    if (signedErr) {
      console.warn('Supabase signed url fetch failed', signedErr)
    } else {
      signed?.forEach((item) => {
        if (item.signedUrl && item.path) {
          signedMap.set(item.path, item.signedUrl)
        }
      })
    }
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    visibility: row.visibility,
    price_cents: row.price_cents,
    currency: row.currency,
    content_rating: row.content_rating,
    post_type: row.post_type,
    expires_at: row.expires_at,
    created_at: row.created_at,
    creator: {
      id: row.creator?.id,
      handle: row.creator?.handle,
      display_name: row.creator?.display_name,
      avatar_url: row.creator?.avatar_url,
      category: row.creator?.category ?? null,
      categories: Array.isArray(row.creator?.categories)
        ? row.creator.categories.filter((item: unknown): item is string => typeof item === 'string')
        : null,
      subscription_price_cents: row.creator?.subscription_price_cents ?? null,
      subscription_currency: row.creator?.subscription_currency ?? null,
    },
    media: (row.media_assets ?? []).map((asset: any) => {
      const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path : ''
      return {
        id: asset.id,
        url: storagePath ? signedMap.get(storagePath) ?? '' : '',
        mime_type: asset.mime_type ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
      }
    }),
  })) as FeedPost[]
}

export async function fetchStories(limit = 10): Promise<FeedPost[]> {
  if (!supabase) return []
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('posts')
    .select(
      [
        'id',
        'title',
        'body',
        'visibility',
        'price_cents',
        'currency',
        'content_rating',
        'post_type',
        'expires_at',
        'created_at',
        'creator:creators(id, handle, display_name, avatar_url, category, categories, subscription_price_cents, subscription_currency)',
        'media_assets(id, storage_path, mime_type, width, height)',
      ].join(',')
    )
    .eq('post_type', 'story')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('Supabase stories fetch failed', error)
    return []
  }

  const rows = (data ?? []) as any[]
  const paths = rows.flatMap((row) =>
    (row.media_assets ?? []).map((asset: any) => asset.storage_path)
  )
  const uniquePaths = Array.from(new Set(paths)).filter(
    (path): path is string => typeof path === 'string' && path.length > 0
  )
  const signedMap = new Map<string, string>()

  if (uniquePaths.length) {
    const { data: signed, error: signedErr } = await supabase.storage
      .from('creator-media')
      .createSignedUrls(uniquePaths, 60 * 60)
    if (signedErr) {
      console.warn('Supabase story signed url fetch failed', signedErr)
    } else {
      signed?.forEach((item) => {
        if (item.signedUrl && item.path) {
          signedMap.set(item.path, item.signedUrl)
        }
      })
    }
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    visibility: row.visibility,
    price_cents: row.price_cents,
    currency: row.currency,
    content_rating: row.content_rating,
    post_type: row.post_type,
    expires_at: row.expires_at,
    created_at: row.created_at,
    creator: {
      id: row.creator?.id,
      handle: row.creator?.handle,
      display_name: row.creator?.display_name,
      avatar_url: row.creator?.avatar_url,
      category: row.creator?.category ?? null,
      categories: Array.isArray(row.creator?.categories)
        ? row.creator.categories.filter((item: unknown): item is string => typeof item === 'string')
        : null,
      subscription_price_cents: row.creator?.subscription_price_cents ?? null,
      subscription_currency: row.creator?.subscription_currency ?? null,
    },
    media: (row.media_assets ?? []).map((asset: any) => {
      const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path : ''
      return {
        id: asset.id,
        url: storagePath ? signedMap.get(storagePath) ?? '' : '',
        mime_type: asset.mime_type ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
      }
    }),
  })) as FeedPost[]
}

export async function fetchChatThreads(): Promise<ChatThreadSummary[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_chat_threads')
  if (error) throw error
  return (data ?? []) as ChatThreadSummary[]
}

export async function fetchChatMessages(
  threadId: string,
  limit = 100
): Promise<ChatMessage[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_chat_messages', {
    p_thread_id: threadId,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as ChatMessage[]
}

export async function fetchChatableCreators(): Promise<ChatableCreator[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_chatable_creators')
  if (error) {
    if (isMissingRpcError(error, 'get_chatable_creators')) {
      console.warn('Chat creators RPC is unavailable. Apply direct message migrations.', error)
      return []
    }
    throw error
  }
  return (data ?? []) as ChatableCreator[]
}

export async function markChatThreadRead(threadId: string) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('mark_chat_thread_read', {
    p_thread_id: threadId,
  })
  if (error) throw error
  return data ?? null
}

export async function sendChatMessage({
  body,
  threadId,
  creatorId,
}: {
  body: string
  threadId?: string | null
  creatorId?: string | null
}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_body: body,
    p_thread_id: threadId ?? null,
    p_creator_id: creatorId ?? null,
    p_member_id: null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row as { thread_id: string; message_id: number; created_at: string } | null
}

export async function subscribeToMemberChatThreads(
  onChange: () => void
): Promise<() => void> {
  if (!supabase) return () => {}
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return () => {}

  const channel = supabase
    .channel(`member-chat-threads:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_threads',
        filter: `member_id=eq.${userId}`,
      },
      () => onChange()
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToChatMessages(
  threadId: string,
  onChange: () => void
): () => void {
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`chat-messages:${threadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `thread_id=eq.${threadId}`,
      },
      () => onChange()
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  if (!supabase) return []
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return []

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return ((data ?? []) as AppNotification[]).map((item) => ({
    ...item,
    payload:
      item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
        ? item.payload
        : {},
  }))
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  if (!supabase) return 0
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return 0

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(notificationId: number) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)

  if (error) throw error
}

export async function markAllNotificationsRead() {
  if (!supabase) throw new Error('Supabase not configured')
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) throw error
}

export async function subscribeToNotifications(onChange: () => void): Promise<() => void> {
  if (!supabase) return () => {}
  const session = await getCurrentSession()
  const userId = session?.user?.id
  if (!userId) return () => {}

  const channel = supabase
    .channel(`user-notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => onChange()
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
