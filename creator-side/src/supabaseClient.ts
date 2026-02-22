import { createClient, type Session, type Provider } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

const supabaseUrl = env.supabaseUrl;
const supabaseAnonKey = env.supabaseAnonKey;

export const supabase =
  isSupabaseConfigured && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('supabase session error', error);
    return null;
  }
  return data.session ?? null;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function signInWithMagicLink(email: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

export async function signInWithOAuth(provider: Provider) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export type PayoutSummary = {
  currency: string;
  available_amount_minor: number;
  pending_amount_minor: number;
};

export type PayoutTransfer = {
  id: number;
  amount_minor: number;
  currency: string;
  status: 'queued' | 'submitted' | 'success' | 'failed' | 'reversed';
  created_at: string;
  failure_reason: string | null;
};

export type PayoutAccount = {
  currency: string;
  account_name: string;
  account_number_last4: string;
  bank_code: string;
  recipient_code: string;
};

async function requireUserId() {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Authentication required');
  return data.user.id;
}

export async function fetchPayoutSummary(): Promise<PayoutSummary | null> {
  if (!supabase) return null;
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('creator_balances')
    .select('currency, available_amount_minor, pending_amount_minor')
    .eq('creator_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchPayoutTransfers(limit = 20): Promise<PayoutTransfer[]> {
  if (!supabase) return [];
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('payout_transfers')
    .select('id, amount_minor, currency, status, created_at, failure_reason')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PayoutTransfer[];
}

export async function fetchPayoutAccount(): Promise<PayoutAccount | null> {
  if (!supabase) return null;
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('creator_payout_accounts')
    .select('currency, account_name, account_number_last4, bank_code, recipient_code')
    .eq('creator_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertMpesaPayoutAccount(params: {
  accountNumber: string;
  accountName: string;
  bankCode?: string;
  currency?: string;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('upsert-mpesa-payout-account', {
    body: params,
  });
  if (error) throw error;
  return data;
}

export async function requestCreatorPayout(params: {
  amountMinor?: number;
  currency?: string;
  reason?: string;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const idempotencyKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  const { data, error } = await supabase.functions.invoke('request-creator-payout', {
    body: params,
    headers: { 'x-idempotency-key': idempotencyKey },
  });
  if (error) throw error;
  return data;
}
