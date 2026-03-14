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
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return FALLBACK_PUBLIC_APP_ORIGIN
}
const appRedirectUrl = () =>
  new URL(import.meta.env.BASE_URL ?? '/', resolveAuthRedirectOrigin()).toString()

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

export type PpvPurchase = {
  post_id: number
}

export type CreatorCard = {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
  category: string | null
  popularity_score?: number | null
  subscription_price_cents?: number | null
  subscription_currency?: string | null
  score?: number | null
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
    subscription_price_cents: number | null
    subscription_currency: string | null
  }
  media: FeedMedia[]
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
}: {
  email: string
  creatorId?: string
  postId?: number
  amountMajor: number
  currency?: string
  // PPV unlocks use the wallet purchase RPC instead of direct checkout.
  type?: 'tip' | 'subscription' | 'wallet_topup'
  metadata?: Record<string, unknown>
  channels?: string[]
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
    },
  })
  if (error) throw error
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
  const { data, error } = await supabase.rpc('get_recommended_creators', {
    search_term: searchTerm?.trim() || null,
    category: category && category !== 'All' ? category : null,
    limit_count: limit,
  })

  if (error) {
    console.warn('Supabase recommended creators fetch failed', error)
    return []
  }

  return (
    data?.map((c: any) => ({
      id: c.id,
      handle: c.handle,
      display_name: c.display_name,
      avatar_url: c.avatar_url,
      category: c.category,
      popularity_score: c.popularity_score,
      subscription_price_cents: c.subscription_price_cents,
      subscription_currency: c.subscription_currency,
      score: c.score,
    })) ?? []
  )
}

export async function ensureProfile(): Promise<UserProfile | null> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.functions.invoke('ensure-profile', { body: {} })
  if (error) throw error
  return (data ?? null) as UserProfile | null
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
        'creator:creators(id, handle, display_name, avatar_url, subscription_price_cents, subscription_currency)',
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
        'creator:creators(id, handle, display_name, avatar_url, subscription_price_cents, subscription_currency)',
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
