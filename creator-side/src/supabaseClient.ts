import { createClient, type Session, type Provider } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

const supabaseUrl = env.supabaseUrl;
const supabaseAnonKey = env.supabaseAnonKey;

export const supabase =
  isSupabaseConfigured && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
const CREATOR_PROFILE_BUCKET = 'creator-profiles';

const FALLBACK_PUBLIC_APP_ORIGIN = 'https://fans-only-olive.vercel.app';
const resolveAuthRedirectOrigin = () => {
  if (env.publicAppOrigin) {
    return env.publicAppOrigin;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return FALLBACK_PUBLIC_APP_ORIGIN;
};
const appRedirectUrl = () =>
  new URL(import.meta.env.BASE_URL ?? '/', resolveAuthRedirectOrigin()).toString();

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
    options: { emailRedirectTo: appRedirectUrl() },
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
    options: { emailRedirectTo: appRedirectUrl() },
  });
  if (error) throw error;
  return data;
}

export async function signInWithOAuth(provider: Provider) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: appRedirectUrl() },
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
  provider: "mpesa" | "bank" | "paypal";
  currency: string;
  account_name: string;
  account_number_last4: string | null;
  bank_code: string | null;
  bank_name?: string | null;
  recipient_code: string | null;
  paypal_email?: string | null;
  recipient_type?: string | null;
  msisdn_e164?: string | null;
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
    .select(
      'provider, currency, account_name, account_number_last4, bank_code, bank_name, recipient_code, paypal_email, recipient_type, msisdn_e164'
    )
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

export async function upsertBankPayoutAccount(params: {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName?: string;
  currency?: string;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('upsert-bank-payout-account', {
    body: params,
  });
  if (error) throw error;
  return data;
}

export async function upsertPaypalPayoutAccount(params: {
  paypalEmail: string;
  currency?: string;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('upsert-paypal-payout-account', {
    body: params,
  });
  if (error) throw error;
  return data;
}

export async function fetchCreatorPricing(): Promise<{
  subscription_price_cents: number;
  subscription_currency: string;
} | null> {
  if (!supabase) return null;
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('creators')
    .select('subscription_price_cents, subscription_currency')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function updateCreatorPricing(params: {
  subscription_price_cents: number;
  subscription_currency?: string;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const userId = await requireUserId();
  const { error } = await supabase
    .from('creators')
    .update({
      subscription_price_cents: params.subscription_price_cents,
      subscription_currency: params.subscription_currency ?? 'KES',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
}

export async function upsertCreatorProfileSetup(params: {
  handle: string;
  display_name: string;
  category: string;
  subscription_price_cents: number;
  subscription_currency?: string;
  avatarFile?: File | null;
  bannerFile?: File | null;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const userId = await requireUserId();
  const payload: Record<string, unknown> = {
    id: userId,
    handle: params.handle,
    display_name: params.display_name,
    category: params.category,
    subscription_price_cents: params.subscription_price_cents,
    subscription_currency: params.subscription_currency ?? 'KES',
    updated_at: new Date().toISOString(),
  };

  if (params.avatarFile) {
    payload.avatar_url = await uploadCreatorProfileAsset(userId, 'avatar', params.avatarFile);
  }

  if (params.bannerFile) {
    payload.banner_url = await uploadCreatorProfileAsset(userId, 'banner', params.bannerFile);
    payload.banner_media_type = params.bannerFile.type.startsWith('video/') ? 'video' : 'image';
  }

  const { error } = await supabase.from('creators').upsert(payload);
  if (error) throw error;
}

export async function publishCreatorPost(params: {
  title: string;
  body?: string | null;
  visibility: 'public' | 'subscribers' | 'ppv';
  price_cents?: number | null;
  currency?: string;
  content_rating?: 'sfw' | 'nsfw';
  post_type?: 'post' | 'story';
  expires_at?: string | null;
  files?: File[];
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const userId = await requireUserId();
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert({
      creator_id: userId,
      title: params.title,
      body: params.body ?? null,
      visibility: params.visibility,
      price_cents: params.price_cents ?? 0,
      currency: params.currency ?? 'KES',
      content_rating: params.content_rating ?? 'sfw',
      post_type: params.post_type ?? 'post',
      expires_at: params.expires_at ?? null,
    })
    .select('id')
    .single();
  if (postError) throw postError;

  const files = params.files ?? [];
  if (!files.length) return post;

  const uploads = await Promise.all(
    files.map(async (file) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${userId}/${post.id}/${crypto.randomUUID?.() ?? Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('creator-media')
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      return {
        post_id: post.id,
        storage_path: path,
        mime_type: file.type || null,
        width: null,
        height: null,
        size_bytes: file.size,
      };
    })
  );

  if (uploads.length) {
    const { error: mediaErr } = await supabase.from('media_assets').insert(uploads);
    if (mediaErr) throw mediaErr;
  }

  return post;
}

async function uploadCreatorProfileAsset(userId: string, folder: 'avatar' | 'banner', file: File) {
  if (!supabase) throw new Error('Supabase not configured');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${folder}/${crypto.randomUUID?.() ?? Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(CREATOR_PROFILE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(CREATOR_PROFILE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function requestCreatorPayout(params: {
  amountMinor?: number;
  currency?: string;
  reason?: string;
  provider?: 'mpesa' | 'bank';
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

export async function requestPaypalPayout(params: {
  amountMinor?: number;
  currency?: string;
  reason?: string;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const idempotencyKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  const { data, error } = await supabase.functions.invoke('request-paypal-payout', {
    body: params,
    headers: { 'x-idempotency-key': idempotencyKey },
  });
  if (error) throw error;
  return data;
}
