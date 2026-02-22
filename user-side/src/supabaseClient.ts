import { createClient, type Session, type Provider } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

export type CreatorProfile = {
  id: string
  handle: string
  display_name: string | null
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
    options: { emailRedirectTo: window.location.origin },
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
    options: { emailRedirectTo: window.location.origin },
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
    options: { redirectTo: window.location.origin },
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
  amountMajor,
  currency = 'KES',
  type = 'tip',
  metadata = {},
}: {
  email: string
  creatorId: string
  amountMajor: number
  currency?: string
  type?: 'tip' | 'subscription'
  metadata?: Record<string, unknown>
}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.functions.invoke('paystack-init', {
    body: {
      email,
      creator_id: creatorId,
      amountMajor,
      currency,
      type,
      metadata,
    },
  })
  if (error) throw error
  return data as { authorization_url?: string; reference?: string }
}

export type CreatorCard = {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
  category: string | null
}

export async function fetchPopularCreators(limit = 6): Promise<CreatorCard[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('creators')
    .select('id, handle, display_name, avatar_url, category, popularity_score')
    .order('popularity_score', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('Supabase popular creators fetch failed', error)
    return []
  }

  return (
    data?.map((c) => ({
      id: c.id,
      handle: c.handle,
      display_name: c.display_name,
      avatar_url: c.avatar_url,
      category: c.category,
    })) ?? []
  )
}

export async function fetchCreatorProfile(userId: string): Promise<CreatorProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('creators')
    .select('id, handle, display_name')
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
    .select('id, handle, display_name')
    .single()

  if (error) throw error
  return data
}
