import { createClient, type Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

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

export async function logAgeExit() {
  if (!supabase) return
  const session = await getCurrentSession()
  const userId = session?.user?.id

  const { error } = await supabase
    .from('age_gate_events')
    .insert({ user_id: userId ?? null, action: 'exit', created_at: new Date().toISOString() })

  if (error) {
    console.warn('Supabase age exit log failed', error)
  }
}
