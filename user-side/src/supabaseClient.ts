import { createClient, type Session, type Provider } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

const AGE_EVENT_RATE_LIMIT_MS = 10_000
let lastAgeEventTs = 0
let cachedIp: string | null = null

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
  const ip = await getPublicIp()

  const { error } = await supabase.from('age_gate_events').insert({
    user_id: userId ?? null,
    action,
    user_agent: userAgent,
    ip,
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

async function getPublicIp(): Promise<string | null> {
  if (cachedIp) return cachedIp
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    if (!res.ok) return null
    const json = (await res.json()) as { ip?: string }
    cachedIp = json.ip ?? null
    return cachedIp
  } catch {
    return null
  }
}
