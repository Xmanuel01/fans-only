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
  provider: "mpesa" | "bank" | "paypal" | "card";
  currency: string;
  account_name: string;
  account_number_last4: string | null;
  bank_code: string | null;
  bank_name?: string | null;
  recipient_code: string | null;
  paypal_email?: string | null;
  recipient_type?: string | null;
  msisdn_e164?: string | null;
  recipient_active?: boolean | null;
  kyc_status?: 'pending' | 'verified' | 'rejected' | null;
  verified_at?: string | null;
  verification_source?: string | null;
  card_brand?: string | null;
  card_exp_month?: number | null;
  card_exp_year?: number | null;
  paystack_authorization_signature?: string | null;
};

export type ChatThreadSummary = {
  thread_id: string;
  creator_id: string;
  member_id: string;
  peer_id: string;
  peer_role: 'creator' | 'member';
  peer_name: string;
  peer_handle: string;
  peer_avatar_url: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
  created_at: string;
};

export type ChatMessage = {
  message_id: number;
  thread_id: string;
  sender_id: string;
  sender_role: 'creator' | 'member';
  sender_name: string;
  sender_handle: string;
  sender_avatar_url: string | null;
  body: string;
  created_at: string;
};

export type ChatableMember = {
  member_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type AppNotification = {
  id: number;
  type: string;
  payload: Record<string, any>;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreferences = {
  push: boolean;
  email: boolean;
  sms: boolean;
  messages: boolean;
  payments: boolean;
  subscriptions: boolean;
  content: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  email: true,
  sms: false,
  messages: true,
  payments: true,
  subscriptions: true,
  content: true,
};

function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const parsed =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

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
  };
}

async function requireUserId() {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Authentication required');
  return data.user.id;
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  if (!supabase) return DEFAULT_NOTIFICATION_PREFERENCES;
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return normalizeNotificationPreferences(data?.notification_preferences);
}

export async function updateNotificationPreferences(
  next: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  if (!supabase) throw new Error('Supabase not configured');
  const userId = await requireUserId();
  const current = await fetchNotificationPreferences();
  const merged = normalizeNotificationPreferences({ ...current, ...next });

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        notification_preferences: merged,
      },
      { onConflict: 'id' },
    );
  if (error) throw error;
  return merged;
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
      'provider, currency, account_name, account_number_last4, bank_code, bank_name, recipient_code, paypal_email, recipient_type, msisdn_e164, recipient_active, kyc_status, verified_at, verification_source, card_brand, card_exp_month, card_exp_year, paystack_authorization_signature'
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

export async function startCreatorCardPayoutSetup(params: { returnUrl: string }) {
  if (!supabase) throw new Error('Supabase not configured');

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('Authentication required');
  }
  if (!user.email) {
    throw new Error('Your account is missing an email required for secure card setup.');
  }

  const { data, error } = await supabase.functions.invoke('start-creator-card-payout-setup', {
    body: {
      email: user.email,
      returnUrl: params.returnUrl,
    },
  });
  if (error) throw error;
  return data as {
    authorization_url?: string;
    reference?: string;
    amount_major?: number;
  };
}

export async function completeCreatorCardPayoutSetup(params: { reference: string }) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('complete-creator-card-payout-setup', {
    body: params,
  });
  if (error) throw error;
  return data as {
    ok?: boolean;
    payoutAccount?: PayoutAccount;
  };
}

export async function fetchChatThreads(): Promise<ChatThreadSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_chat_threads');
  if (error) throw error;
  return (data ?? []) as ChatThreadSummary[];
}

export async function fetchChatMessages(
  threadId: string,
  limit = 100
): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_chat_messages', {
    p_thread_id: threadId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function fetchChatableMembers(): Promise<ChatableMember[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_chatable_members');
  if (error) throw error;
  return (data ?? []) as ChatableMember[];
}

export async function markChatThreadRead(threadId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('mark_chat_thread_read', {
    p_thread_id: threadId,
  });
  if (error) throw error;
  return data ?? null;
}

export async function sendChatMessage(params: {
  body: string;
  threadId?: string | null;
  memberId?: string | null;
}) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_body: params.body,
    p_thread_id: params.threadId ?? null,
    p_creator_id: null,
    p_member_id: params.memberId ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { thread_id: string; message_id: number; created_at: string } | null;
}

export async function subscribeToCreatorChatThreads(
  onChange: () => void
): Promise<() => void> {
  if (!supabase) return () => {};
  const userId = await requireUserId();
  const channel = supabase
    .channel(`creator-chat-threads:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_threads',
        filter: `creator_id=eq.${userId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToChatMessages(
  threadId: string,
  onChange: () => void
): () => void {
  if (!supabase) return () => {};
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
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  if (!supabase) return [];
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as AppNotification[]).map((item) => ({
    ...item,
    payload:
      item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
        ? item.payload
        : {},
  }));
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  if (!supabase) return 0;
  const userId = await requireUserId();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(notificationId: number) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  if (!supabase) throw new Error('Supabase not configured');
  const userId = await requireUserId();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

export async function subscribeToNotifications(onChange: () => void): Promise<() => void> {
  if (!supabase) return () => {};
  const userId = await requireUserId();
  const channel = supabase
    .channel(`creator-notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
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

export type CurrentCreatorProfile = {
  name: string;
  handle: string;
  avatar_url: string | null;
};

export type CreatorProfileSettings = {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerMediaType: 'image' | 'video' | null;
};

export async function fetchCurrentCreatorProfile(): Promise<CurrentCreatorProfile | null> {
  if (!supabase) return null;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const user = authData.user;
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from('creators')
    .select('display_name, handle, avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataName = [
    metadata.display_name,
    metadata.full_name,
    metadata.name,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const metadataAvatar = [
    metadata.avatar_url,
    metadata.picture,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const handleValue =
    typeof data?.handle === 'string' && data.handle.trim().length > 0
      ? data.handle.startsWith('@')
        ? data.handle
        : `@${data.handle}`
      : '';

  return {
    name:
      (typeof data?.display_name === 'string' && data.display_name.trim().length > 0
        ? data.display_name.trim()
        : metadataName) || 'Creator',
    handle: handleValue,
    avatar_url:
      (typeof data?.avatar_url === 'string' && data.avatar_url.trim().length > 0
        ? data.avatar_url
        : metadataAvatar) ?? null,
  };
}

export async function fetchCreatorProfileSettings(): Promise<CreatorProfileSettings | null> {
  if (!supabase) return null;

  const userId = await requireUserId();
  const [{ data: creator, error: creatorError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase
        .from('creators')
        .select('handle, display_name, avatar_url, banner_url, banner_media_type')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('username, display_name, avatar_url, bio')
        .eq('id', userId)
        .maybeSingle(),
    ]);

  if (creatorError) throw creatorError;
  if (profileError) throw profileError;

  if (!creator && !profile) {
    return null;
  }

  const usernameSource =
    (typeof creator?.handle === 'string' && creator.handle.trim().length > 0
      ? creator.handle
      : typeof profile?.username === 'string'
        ? profile.username
        : '') || '';
  const normalizedUsername = usernameSource
    ? usernameSource.startsWith('@')
      ? usernameSource
      : `@${usernameSource}`
    : '';

  return {
    username: normalizedUsername,
    displayName:
      (typeof creator?.display_name === 'string' && creator.display_name.trim().length > 0
        ? creator.display_name.trim()
        : typeof profile?.display_name === 'string'
          ? profile.display_name
          : '') || '',
    bio: typeof profile?.bio === 'string' ? profile.bio : '',
    avatarUrl:
      (typeof creator?.avatar_url === 'string' && creator.avatar_url.trim().length > 0
        ? creator.avatar_url
        : typeof profile?.avatar_url === 'string'
          ? profile.avatar_url
          : null) ?? null,
    bannerUrl:
      typeof creator?.banner_url === 'string' && creator.banner_url.trim().length > 0
        ? creator.banner_url
        : null,
    bannerMediaType:
      creator?.banner_media_type === 'video' || creator?.banner_media_type === 'image'
        ? creator.banner_media_type
        : null,
  };
}

function normalizeHandle(value: string) {
  return value
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function extractCreatorProfileStoragePath(publicUrl: string | null | undefined) {
  if (!publicUrl) return null;

  try {
    const url = new URL(publicUrl);
    const marker = '/storage/v1/object/public/creator-profiles/';
    const index = url.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

async function removeCreatorProfileAsset(publicUrl: string | null | undefined) {
  if (!supabase) return;

  const path = extractCreatorProfileStoragePath(publicUrl);
  if (!path) return;

  const { error } = await supabase.storage.from(CREATOR_PROFILE_BUCKET).remove([path]);
  if (error) {
    console.warn('Failed to remove creator profile asset', error);
  }
}

export async function updateCreatorProfileSettings(params: {
  username: string;
  displayName: string;
  bio: string;
  avatarFile?: File | null;
  removeAvatar?: boolean;
  bannerFile?: File | null;
  removeBanner?: boolean;
}) {
  if (!supabase) throw new Error('Supabase not configured');

  const userId = await requireUserId();
  const handle = normalizeHandle(params.username);
  if (!handle) {
    throw new Error('Enter a valid username.');
  }

  const current = await fetchCreatorProfileSettings();
  let nextAvatarUrl = current?.avatarUrl ?? null;
  let nextBannerUrl = current?.bannerUrl ?? null;
  let nextBannerMediaType = current?.bannerMediaType ?? null;

  if (params.removeAvatar && nextAvatarUrl) {
    await removeCreatorProfileAsset(nextAvatarUrl);
    nextAvatarUrl = null;
  }

  if (params.removeBanner && nextBannerUrl) {
    await removeCreatorProfileAsset(nextBannerUrl);
    nextBannerUrl = null;
    nextBannerMediaType = null;
  }

  if (params.avatarFile) {
    const uploadedAvatarUrl = await uploadCreatorProfileAsset(userId, 'avatar', params.avatarFile);
    if (nextAvatarUrl && nextAvatarUrl !== uploadedAvatarUrl) {
      await removeCreatorProfileAsset(nextAvatarUrl);
    }
    nextAvatarUrl = uploadedAvatarUrl;
  }

  if (params.bannerFile) {
    const uploadedBannerUrl = await uploadCreatorProfileAsset(userId, 'banner', params.bannerFile);
    if (nextBannerUrl && nextBannerUrl !== uploadedBannerUrl) {
      await removeCreatorProfileAsset(nextBannerUrl);
    }
    nextBannerUrl = uploadedBannerUrl;
    nextBannerMediaType = params.bannerFile.type.startsWith('video/') ? 'video' : 'image';
  }

  const creatorPayload = {
    id: userId,
    handle,
    display_name: params.displayName.trim() || 'Creator',
    avatar_url: nextAvatarUrl,
    banner_url: nextBannerUrl,
    banner_media_type: nextBannerMediaType,
  };

  const profilePayload = {
    id: userId,
    username: handle,
    display_name: params.displayName.trim() || 'Creator',
    avatar_url: nextAvatarUrl,
    bio: params.bio.trim() || null,
  };

  const [{ error: creatorError }, { error: profileError }] = await Promise.all([
    supabase.from('creators').upsert(creatorPayload),
    supabase.from('profiles').upsert(profilePayload),
  ]);

  if (creatorError) throw creatorError;
  if (profileError) throw profileError;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('creator-profile-updated'));
  }

  return {
    username: `@${handle}`,
    displayName: profilePayload.display_name,
    bio: params.bio.trim(),
    avatarUrl: nextAvatarUrl,
    bannerUrl: nextBannerUrl,
    bannerMediaType: nextBannerMediaType,
  } satisfies CreatorProfileSettings;
}

export type CreatorContentMedia = {
  id: number;
  url: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
};

export type CreatorContentItem = {
  id: number;
  title: string;
  body: string | null;
  visibility: 'public' | 'subscribers' | 'ppv';
  price_cents: number | null;
  currency: string | null;
  content_rating: 'sfw' | 'nsfw';
  post_type: 'post' | 'story';
  expires_at: string | null;
  created_at: string;
  creator: {
    id: string;
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  media: CreatorContentMedia[];
};

const CREATOR_CONTENT_SELECT = [
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
  'creator:creators(id, handle, display_name, avatar_url)',
  'media_assets(id, storage_path, mime_type, width, height)',
].join(',');

async function createSignedMediaMap(rows: any[]) {
  if (!supabase) return new Map<string, string>();

  const paths = rows.flatMap((row) =>
    (row.media_assets ?? []).map((asset: any) => asset.storage_path)
  );
  const uniquePaths = Array.from(new Set(paths)).filter(
    (path): path is string => typeof path === 'string' && path.length > 0
  );
  const signedMap = new Map<string, string>();

  if (!uniquePaths.length) {
    return signedMap;
  }

  const { data: signed, error: signedErr } = await supabase.storage
    .from('creator-media')
    .createSignedUrls(uniquePaths, 60 * 60);

  if (signedErr) {
    throw signedErr;
  }

  signed?.forEach((item) => {
    if (item.path && item.signedUrl) {
      signedMap.set(item.path, item.signedUrl);
    }
  });

  return signedMap;
}

function mapCreatorContentRows(rows: any[], signedMap: Map<string, string>): CreatorContentItem[] {
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
    creator: row.creator
      ? {
          id: row.creator.id,
          handle: row.creator.handle,
          display_name: row.creator.display_name,
          avatar_url: row.creator.avatar_url,
        }
      : null,
    media: (row.media_assets ?? []).map((asset: any) => {
      const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path : '';
      return {
        id: asset.id,
        url: storagePath ? signedMap.get(storagePath) ?? '' : '',
        mime_type: asset.mime_type ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
      };
    }),
  }));
}

async function fetchCreatorContent(params: {
  post_type?: 'post' | 'story';
  limit?: number;
  onlyActiveStories?: boolean;
} = {}) {
  if (!supabase) return [];

  const userId = await requireUserId();
  let query = supabase
    .from('posts')
    .select(CREATOR_CONTENT_SELECT)
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 20);

  if (params.post_type) {
    query = query.eq('post_type', params.post_type);
  }

  if (params.onlyActiveStories) {
    query = query.gt('expires_at', new Date().toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const signedMap = await createSignedMediaMap(rows);
  return mapCreatorContentRows(rows, signedMap);
}

export async function fetchCreatorFeedPosts(limit = 20): Promise<CreatorContentItem[]> {
  return fetchCreatorContent({ post_type: 'post', limit });
}

export async function fetchCreatorStories(limit = 12): Promise<CreatorContentItem[]> {
  return fetchCreatorContent({ post_type: 'story', limit, onlyActiveStories: true });
}

export async function upsertCreatorProfileSetup(params: {
  handle: string;
  display_name: string;
  category: string;
  categories: string[];
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
    categories: params.categories,
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
  let postId: number | null = null;
  const uploadedPaths: string[] = [];

  try {
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

    postId = post.id;
    const files = params.files ?? [];
    if (!files.length) return post;

    const uploads = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${userId}/${post.id}/${crypto.randomUUID?.() ?? Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('creator-media')
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      uploads.push({
        post_id: post.id,
        storage_path: path,
        mime_type: file.type || null,
        width: null,
        height: null,
        size_bytes: file.size,
      });
    }

    if (uploads.length) {
      const { error: mediaErr } = await supabase.from('media_assets').insert(uploads);
      if (mediaErr) throw mediaErr;
    }

    return post;
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupStorageError } = await supabase.storage
        .from('creator-media')
        .remove(uploadedPaths);
      if (cleanupStorageError) {
        console.warn('Failed to clean up uploaded media after publish error', cleanupStorageError);
      }
    }

    if (postId) {
      const { error: cleanupPostError } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('creator_id', userId);
      if (cleanupPostError) {
        console.warn('Failed to clean up draft post after publish error', cleanupPostError);
      }
    }

    throw error;
  }
}

async function uploadCreatorProfileAsset(userId: string, folder: 'avatar' | 'banner', file: File) {
  if (!supabase) throw new Error('Supabase not configured');
  const formData = new FormData();
  formData.set('folder', folder);
  formData.set('file', file);

  try {
    const data = await invokeProfileUploadFunction(formData);
    if (data && typeof data.publicUrl === 'string') {
      return data.publicUrl;
    }
  } catch (error) {
    if (!isMissingEdgeFunction(error)) {
      throw error;
    }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${folder}/${crypto.randomUUID?.() ?? Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(CREATOR_PROFILE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) {
    if (isBucketMissingError(uploadError)) {
      throw new Error(
        'Profile uploads are not configured yet. Deploy the upload-creator-profile-asset edge function or create the creator-profiles bucket in Supabase.',
      );
    }
    throw uploadError;
  }
  const { data: publicUrlData } = supabase.storage.from(CREATOR_PROFILE_BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

function isMissingEdgeFunction(error: unknown) {
  const message = getErrorMessage(error);
  return /404|not found|failed to send a request to the edge function|failed to fetch/i.test(message);
}

function isBucketMissingError(error: unknown) {
  const message = getErrorMessage(error);
  return /bucket not found/i.test(message);
}

function getErrorMessage(error: unknown) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}

async function invokeProfileUploadFunction(formData: FormData) {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase not configured');
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.access_token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/upload-creator-profile-asset`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  const responseText = await response.text();
  let payload: any = null;
  if (responseText.trim()) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { error: responseText.trim() };
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.trim?.() ||
        payload?.message?.trim?.() ||
        `Profile upload failed (${response.status}).`,
    );
  }

  return payload;
}

export async function requestCreatorPayout(params: {
  amountMinor: number;
  currency?: string;
  reason?: string;
  provider?: 'mpesa' | 'bank' | 'card';
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
  amountMinor: number;
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
