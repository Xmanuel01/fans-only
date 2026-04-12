import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  completeCreatorCardPayoutSetup,
  fetchNotifications,
  fetchChatableMembers,
  fetchChatMessages,
  fetchChatThreads,
  fetchCreatorSubscribers,
  fetchCurrentCreatorProfile,
  fetchCreatorFeedPosts,
  fetchPayoutAccount,
  fetchPayoutSummary,
  fetchPayoutTransfers,
  fetchUnreadNotificationCount,
  fetchCreatorStories,
  publishCreatorPost,
  markChatThreadRead,
  markAllNotificationsRead,
  markNotificationRead,
  requestCreatorPayout,
  sendChatMessage,
  startCreatorCardPayoutSetup,
  subscribeToChatMessages,
  subscribeToCreatorChatThreads,
  subscribeToNotifications,
  type AppNotification,
  type ChatableMember,
  type ChatMessage,
  type ChatThreadSummary,
  type CreatorSubscriber,
  type CreatorContentItem,
  type PayoutAccount,
  type PayoutSummary,
  type PayoutTransfer,
  upsertBankPayoutAccount,
  upsertMpesaPayoutAccount,
} from '../supabaseClient';
import './MyPages.css';

type NavKey =
  | 'home'
  | 'notifications'
  | 'messages'
  | 'collections'
  | 'subscriptions'
  | 'payments'
  | 'profile'
  | 'more';

type MyLayoutProps = {
  title: string;
  subtitle?: string;
  activeNav?: NavKey;
  headerActions?: ReactNode;
  header?: ReactNode | null;
  aside?: ReactNode;
  gridClassName?: string;
  contentClassName?: string;
  children: ReactNode;
};

type NotificationTab =
  | 'all'
  | 'unread'
  | 'messages'
  | 'earnings'
  | 'subscriptions'
  | 'payouts'
  | 'content';

type PersonItem = {
  id: string;
  name: string;
  handle: string;
  detail: string;
  status: string;
  order: number;
  avatar: string | null;
};

type HomePost = {
  id: string;
  author: string;
  handle: string;
  avatar: string;
  time: string;
  caption: string;
  type: 'photo' | 'video' | 'text';
  media?: string[];
  video?: {
    src: string;
    poster: string;
  };
  footerPrimary: string;
  footerSecondary: string;
};

type StoryItem = {
  id: string;
  name: string;
  handle: string;
  image: string;
  previewUrl: string;
  previewType: 'image' | 'video' | 'text';
  caption: string;
  expiresLabel: string;
  publishedLabel: string;
  visibilityLabel: string;
  contentLabel: string;
  isLive?: boolean;
};

const CREATOR_DRAFT_STORAGE_KEY = 'creator-post-draft-v1';
const CREATOR_PROFILE_CACHE_KEY = 'creator-profile-cache-v1';

const ensureHandle = (value: string | null | undefined) => {
  if (!value) return '';
  return value.startsWith('@') ? value : `@${value}`;
};

const formatRelativeTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Just now';

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(value).toLocaleDateString();
};

type CreatorNavProfile = {
  name: string;
  handle: string;
  avatar: string;
  meta: null | { fans: string; followers: string };
};

const formatMinorCurrency = (amountMinor?: number | null, currency?: string | null) => {
  const amount = Math.max(0, amountMinor ?? 0);
  const normalizedCurrency = (currency ?? 'KES').toUpperCase();
  const major = amount / 100;

  if (normalizedCurrency === 'KES') {
    return `KSh ${major.toLocaleString(undefined, {
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return `${normalizedCurrency} ${major.toLocaleString(undefined, {
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatExpiryLabel = (expiresAt: string | null) => {
  if (!expiresAt) return 'Expires soon';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Expired';
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) return `Expires in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `Expires in ${diffDays}d`;
};

const formatShortDate = (value: string | null) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const isActiveSubscriber = (item: CreatorSubscriber) =>
  item.status === 'active' &&
  (!item.current_period_end || new Date(item.current_period_end).getTime() > Date.now());

const mapSubscriberToPersonItem = (item: CreatorSubscriber): PersonItem => {
  const name = item.display_name?.trim() || item.username?.trim() || 'Subscriber';
  const handle = item.username ? ensureHandle(item.username) : '@member';
  const amount =
    typeof item.amount_cents === 'number'
      ? formatMinorCurrency(item.amount_cents, item.currency ?? 'KES')
      : null;

  if (isActiveSubscriber(item)) {
    return {
      id: item.subscriber_id,
      name,
      handle,
      detail: item.current_period_end
        ? `Renews ${formatShortDate(item.current_period_end)}`
        : `Subscribed ${formatShortDate(item.subscribed_at)}`,
      status: amount ? amount : 'Active',
      order: -new Date(item.subscribed_at).getTime(),
      avatar: item.avatar_url,
    };
  }

  return {
    id: item.subscriber_id,
    name,
    handle,
    detail: item.current_period_end
      ? `Expired ${formatShortDate(item.current_period_end)}`
      : `Ended ${formatShortDate(item.subscribed_at)}`,
    status: amount ? amount : 'Expired',
    order: -new Date(item.current_period_end ?? item.subscribed_at).getTime(),
    avatar: item.avatar_url,
  };
};

const normalizeHomePost = (post: CreatorContentItem): HomePost => {
  const primaryMedia = post.media[0] ?? null;
  const isVideo = Boolean(primaryMedia?.mime_type?.startsWith('video/'));
  const author = post.creator?.display_name?.trim() || 'You';
  const type: HomePost['type'] = primaryMedia ? (isVideo ? 'video' : 'photo') : 'text';

  return {
    id: String(post.id),
    author,
    handle: ensureHandle(post.creator?.handle),
    avatar: post.creator?.avatar_url ?? '',
    time: formatRelativeTime(post.created_at),
    caption: post.body?.trim() || post.title || (post.post_type === 'story' ? 'Story' : 'Post'),
    type,
    media: !isVideo && primaryMedia?.url ? [primaryMedia.url] : undefined,
    video: isVideo && primaryMedia?.url ? { src: primaryMedia.url, poster: '' } : undefined,
    footerPrimary: describeVisibility(post).replace('Â·', '-'),
    footerSecondary: `${post.content_rating.toUpperCase()} - ${formatRelativeTime(post.created_at)}`,
  };
};

const parseMajorAmountToMinor = (value: string) => {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
};

type PaymentsRail = 'mpesa' | 'card-bank';
type CardBankRail = 'card' | 'bank';
type PaymentsPanel = 'method' | 'request' | 'history';

const normalizePaymentsRail = (value: string | null): PaymentsRail | null => {
  if (value === 'mpesa' || value === 'card-bank') {
    return value;
  }
  return null;
};

const normalizeCardBankRail = (value: string | null): CardBankRail | null => {
  if (value === 'card' || value === 'bank') {
    return value;
  }
  return null;
};

const normalizePaymentsPanel = (value: string | null): PaymentsPanel | null => {
  if (value === 'method' || value === 'request' || value === 'history') {
    return value;
  }
  return null;
};

const getPaymentsRailFromAccount = (account: PayoutAccount | null): PaymentsRail => {
  if (!account) return 'mpesa';
  if (account?.provider === 'mpesa') return 'mpesa';
  return 'card-bank';
};

const getCardBankRailFromAccount = (account: PayoutAccount | null): CardBankRail => {
  if (account?.provider === 'bank') return 'bank';
  return 'card';
};

const getPayoutProviderLabel = (provider?: PayoutAccount['provider'] | null) => {
  if (provider === 'mpesa') return 'M-PESA';
  if (provider === 'bank') return 'Bank';
  if (provider === 'card') return 'Card';
  return 'No payout method';
};

const getPayoutVerificationState = (
  account: PayoutAccount | null,
): 'unconfigured' | 'pending' | 'verified' | 'rejected' | 'inactive' => {
  if (!account) return 'unconfigured';
  if (account.recipient_active === false) return 'inactive';
  if (account.kyc_status === 'verified') return 'verified';
  if (account.kyc_status === 'rejected') return 'rejected';
  return 'pending';
};

const getPayoutVerificationLabel = (
  state: ReturnType<typeof getPayoutVerificationState>,
) => {
  if (state === 'verified') return 'Verified';
  if (state === 'pending') return 'Pending review';
  if (state === 'rejected') return 'Rejected';
  if (state === 'inactive') return 'Inactive';
  return 'Setup required';
};

const getPayoutDestinationLabel = (account: PayoutAccount | null) => {
  if (!account) return 'No payout destination configured';

  if (account.account_number_last4) {
    return `${getPayoutProviderLabel(account.provider)} ••••${account.account_number_last4}`;
  }

  return `${getPayoutProviderLabel(account.provider)} destination`;
};

const getPayoutDestinationMeta = (account: PayoutAccount | null) => {
  if (!account) return 'Save a payout destination in Banking before requesting a transfer.';

  if (account.provider === 'bank') {
    if (account.bank_name) return account.bank_name;
    if (account.bank_code) return `Bank code ${account.bank_code}`;
  }

  if (account.provider === 'mpesa') {
    return account.account_name || 'Mobile money destination';
  }

  return account.account_name || 'Payout destination';
};

const getUnifiedPayoutDestinationLabel = (account: PayoutAccount | null) => {
  if (!account) return 'No payout method saved';

  if (account.provider === 'card') {
    const brand = account.card_brand?.trim();
    const brandLabel = brand ? `${brand[0].toUpperCase()}${brand.slice(1).toLowerCase()} ` : '';
    return account.account_number_last4
      ? `${brandLabel}card ending ${account.account_number_last4}`
      : `${brandLabel.trim() || 'Card'} payout rail`;
  }

  if (account.provider === 'bank' && account.account_number_last4) {
    return `Bank account ending ${account.account_number_last4}`;
  }

  if (account.provider === 'mpesa' && account.account_number_last4) {
    return `M-PESA ending ${account.account_number_last4}`;
  }

  return `${getPayoutProviderLabel(account.provider)} payout rail`;
};

const getUnifiedPayoutDestinationMeta = (account: PayoutAccount | null) => {
  if (!account) return 'Choose a payout rail, save it, and wait for verification.';

  if (account.provider === 'bank') {
    return account.bank_name || (account.bank_code ? `Bank code ${account.bank_code}` : 'Bank payout rail');
  }

  if (account.provider === 'mpesa') {
    return account.account_name || 'Mobile money payout rail';
  }

  if (account.provider === 'card') {
    const details: string[] = [];
    if (account.card_brand) {
      details.push(account.card_brand[0].toUpperCase() + account.card_brand.slice(1).toLowerCase());
    }
    if (account.card_exp_month && account.card_exp_year) {
      details.push(
        `Exp ${String(account.card_exp_month).padStart(2, '0')}/${String(account.card_exp_year).slice(-2)}`,
      );
    }
    return details.join(' · ') || 'Tokenized securely through Paystack';
  }

  return account.account_name || 'Payout rail';
};

const formatPayoutTransferStatus = (status: PayoutTransfer['status']) => {
  if (status === 'success') return 'Success';
  if (status === 'submitted') return 'Submitted';
  if (status === 'queued') return 'Queued';
  if (status === 'reversed') return 'Reversed';
  return 'Failed';
};

const formatPayoutTransferDate = (value: string) => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Unknown date';
  return timestamp.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const describeVisibility = (post: CreatorContentItem) => {
  if (post.visibility === 'ppv') {
    return `PPV · ${formatMinorCurrency(post.price_cents, post.currency)}`;
  }
  if (post.visibility === 'subscribers') {
    return 'Subscribers only';
  }
  return 'Public';
};

const mapCreatorPostToHomePost = (post: CreatorContentItem): HomePost => {
  return normalizeHomePost(post);
};

const mapCreatorStoryToStoryItem = (story: CreatorContentItem): StoryItem => {
  const primaryMedia = story.media[0];
  const previewType = primaryMedia?.mime_type?.startsWith('video/')
    ? 'video'
    : primaryMedia?.url
      ? 'image'
      : 'text';

  return {
    id: String(story.id),
    name: story.creator?.display_name?.trim() || 'You',
    handle: ensureHandle(story.creator?.handle) || '@you',
    image: story.creator?.avatar_url ?? primaryMedia?.url ?? '',
    previewUrl: primaryMedia?.url ?? '',
    previewType,
    caption: story.body?.trim() || story.title || 'Story',
    expiresLabel: formatExpiryLabel(story.expires_at),
    publishedLabel: formatRelativeTime(story.created_at),
    visibilityLabel: describeVisibility(story).replace('Â·', '-'),
    contentLabel: story.content_rating.toUpperCase(),
    isLive: false,
  };
};

type CreatorPostDraft = {
  content: string;
  audience: 'All fans' | 'Subscribers';
  postType: 'post' | 'story';
  contentRating: 'sfw' | 'nsfw';
  storyDurationHours: string;
  isPaid: boolean;
  price: string;
  isScheduled: boolean;
  scheduleAt: string;
  pollEnabled: boolean;
  pollOptions: string[];
};

const DEFAULT_CREATOR_DRAFT: CreatorPostDraft = {
  content: '',
  audience: 'All fans',
  postType: 'post',
  contentRating: 'sfw',
  storyDurationHours: '24',
  isPaid: false,
  price: '',
  isScheduled: false,
  scheduleAt: '',
  pollEnabled: false,
  pollOptions: ['', ''],
};

const readCreatorDraft = (): CreatorPostDraft | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CREATOR_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreatorPostDraft>;
    return {
      ...DEFAULT_CREATOR_DRAFT,
      ...parsed,
      audience: parsed.audience === 'Subscribers' ? 'Subscribers' : 'All fans',
      postType: parsed.postType === 'story' ? 'story' : 'post',
      contentRating: parsed.contentRating === 'nsfw' ? 'nsfw' : 'sfw',
      storyDurationHours: parsed.storyDurationHours ?? DEFAULT_CREATOR_DRAFT.storyDurationHours,
      isPaid: Boolean(parsed.isPaid),
      price: typeof parsed.price === 'string' ? parsed.price : '',
      isScheduled: Boolean(parsed.isScheduled),
      scheduleAt: typeof parsed.scheduleAt === 'string' ? parsed.scheduleAt : '',
      pollEnabled: Boolean(parsed.pollEnabled),
      pollOptions: Array.isArray(parsed.pollOptions)
        ? parsed.pollOptions.filter((option): option is string => typeof option === 'string').slice(0, 6)
        : DEFAULT_CREATOR_DRAFT.pollOptions,
      content: typeof parsed.content === 'string' ? parsed.content : '',
    };
  } catch (error) {
    console.warn('Could not restore creator draft', error);
    return null;
  }
};

const writeCreatorDraft = (draft: CreatorPostDraft) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(CREATOR_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn('Could not save creator draft', error);
  }
};

const clearCreatorDraft = () => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(CREATOR_DRAFT_STORAGE_KEY);
  } catch (error) {
    console.warn('Could not clear creator draft', error);
  }
};

const formatNotificationDate = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Just now';

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(value).toLocaleDateString();
};

const getNotificationTabForType = (
  type: string,
): Exclude<NotificationTab, 'all' | 'unread'> => {
  if (type === 'chat_message') return 'messages';
  if (
    [
      'new_tip',
      'tip_sent',
      'ppv_purchase',
      'ppv_unlocked',
    ].includes(type)
  ) {
    return 'earnings';
  }
  if (['new_subscription', 'subscription_active', 'subscription_renewed'].includes(type)) {
    return 'subscriptions';
  }
  if (
    ['payout_requested', 'payout_submitted', 'payout_success', 'payout_failed', 'payout_reversed'].includes(
      type,
    )
  ) {
    return 'payouts';
  }
  return 'content';
};

const getCreatorNotificationTitle = (item: AppNotification) => {
  const payload = item.payload ?? {};

  if (item.type === 'chat_message') return `New message from ${payload.from_name ?? 'a fan'}`;
  if (item.type === 'new_tip') return `New tip from ${payload.from_name ?? 'a fan'}`;
  if (item.type === 'ppv_purchase') {
    return `${payload.buyer_name ?? 'A fan'} unlocked ${payload.post_title ?? 'a post'}`;
  }
  if (item.type === 'new_subscription') {
    return `${payload.subscriber_name ?? 'A fan'} subscribed`;
  }
  if (item.type === 'subscription_renewed') {
    return `${payload.subscriber_name ?? 'A fan'} renewed`;
  }
  if (item.type === 'payout_requested') return 'Payout request queued';
  if (item.type === 'payout_submitted') return 'Payout submitted';
  if (item.type === 'payout_success') return 'Payout completed';
  if (item.type === 'payout_failed') return 'Payout failed';
  if (item.type === 'payout_reversed') return 'Payout reversed';
  return 'New activity';
};

const getCreatorNotificationDetail = (item: AppNotification) => {
  const payload = item.payload ?? {};

  if (item.type === 'chat_message') {
    return payload.preview ?? 'Open chats to read the latest message.';
  }
  if (item.type === 'new_tip' || item.type === 'ppv_purchase') {
    return `Amount: ${formatMinorCurrency(payload.amount_cents ?? 0, payload.currency ?? 'KES')}`;
  }
  if (item.type === 'new_subscription' || item.type === 'subscription_renewed') {
    return payload.current_period_end
      ? `Access runs until ${new Date(payload.current_period_end).toLocaleDateString()}.`
      : 'Subscription access is active.';
  }
  if (item.type === 'payout_requested') {
    return `Amount: ${formatMinorCurrency(payload.amount_minor ?? 0, payload.currency ?? 'KES')}`;
  }
  if (item.type === 'payout_submitted') {
    return 'Your payout is on the way to the saved destination.';
  }
  if (item.type === 'payout_success') {
    return `Transferred ${formatMinorCurrency(payload.amount_minor ?? 0, payload.currency ?? 'KES')}.`;
  }
  if (item.type === 'payout_failed' || item.type === 'payout_reversed') {
    return payload.failure_reason ?? 'The amount was returned to your available balance.';
  }
  return 'Open the app to review the latest activity.';
};

const getCreatorNotificationTarget = (item: AppNotification) => {
  if (item.type === 'chat_message') return '/my/chats';
  if (
    ['payout_requested', 'payout_submitted', 'payout_success', 'payout_failed', 'payout_reversed'].includes(
      item.type,
    )
  ) {
    return '/my/payments';
  }
  if (['new_subscription', 'subscription_renewed'].includes(item.type)) {
    return '/my/collections/user-lists/subscriptions/active';
  }
  return '/';
};

const NOTIFICATION_TABS: Array<{ key: NotificationTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'messages', label: 'Messages' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'content', label: 'Content' },
];

const EMPTY_POSTS: HomePost[] = [];
const EMPTY_STORIES: StoryItem[] = [];

export function MyHome() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'photos' | 'videos' | 'texts'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [feedPosts, setFeedPosts] = useState<HomePost[]>(EMPTY_POSTS);
  const [stories, setStories] = useState<StoryItem[]>(EMPTY_STORIES);
  const [audienceSummary, setAudienceSummary] = useState({ active: 0, expired: 0 });
  const [loadingContent, setLoadingContent] = useState(true);
  const [contentError, setContentError] = useState('');
  const [activeStory, setActiveStory] = useState<StoryItem | null>(null);
  const storiesScrollerRef = useRef<HTMLDivElement | null>(null);
  const storyRail = useMemo(() => {
    if (stories.length > 1) {
      return [...stories, ...stories, ...stories];
    }
    return stories;
  }, [stories]);

  useEffect(() => {
    let cancelled = false;

    const loadCreatorContent = async () => {
      setLoadingContent(true);
      setContentError('');

      try {
        const [postsData, storiesData, subscribers] = await Promise.all([
          fetchCreatorFeedPosts(24),
          fetchCreatorStories(18),
          fetchCreatorSubscribers('all'),
        ]);

        if (cancelled) {
          return;
        }

        setFeedPosts(postsData.map(mapCreatorPostToHomePost));
        setStories(storiesData.map(mapCreatorStoryToStoryItem));
        setAudienceSummary({
          active: subscribers.filter(isActiveSubscriber).length,
          expired: subscribers.filter((entry) => !isActiveSubscriber(entry)).length,
        });
      } catch (error) {
        console.error(error);
        if (cancelled) {
          return;
        }
        setFeedPosts([]);
        setStories([]);
        setAudienceSummary({ active: 0, expired: 0 });
        setContentError('Could not load your latest posts and stories.');
      } finally {
        if (!cancelled) {
          setLoadingContent(false);
        }
      }
    };

    void loadCreatorContent();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const node = storiesScrollerRef.current;
    if (!node || storyRail.length <= 1) {
      return;
    }
    const segmentWidth = node.scrollWidth / 3;
    node.scrollLeft = segmentWidth;
  }, [storyRail]);

  const handleStoriesScroll = () => {
    const node = storiesScrollerRef.current;
    if (!node || storyRail.length <= 1) {
      return;
    }

    const segmentWidth = node.scrollWidth / 3;
    if (!segmentWidth) {
      return;
    }

    if (node.scrollLeft <= segmentWidth * 0.25) {
      node.scrollLeft += segmentWidth;
      return;
    }

    if (node.scrollLeft >= segmentWidth * 1.75) {
      node.scrollLeft -= segmentWidth;
    }
  };

  const filteredPosts = useMemo(() => {
    return feedPosts.filter((post) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'photos' && post.type === 'photo') ||
        (activeFilter === 'videos' && post.type === 'video') ||
        (activeFilter === 'texts' && post.type === 'text');

      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        post.author.toLowerCase().includes(term) ||
        post.handle.toLowerCase().includes(term) ||
        post.caption.toLowerCase().includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchTerm, feedPosts]);

  const photoCount = feedPosts.filter((post) => post.type === 'photo').length;
  const videoCount = feedPosts.filter((post) => post.type === 'video').length;
  const textCount = feedPosts.filter((post) => post.type === 'text').length;

  const aside = (
    <div className="creator-home-aside">
      <div className="notif-search-card">
        <div className="notif-search">
          <input
            className="notif-search-input"
            type="search"
            placeholder="Search posts"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <span className="notif-search-icon">
            <SearchIcon />
          </span>
        </div>
      </div>

      <div className="creator-home-panel">
        <div className="creator-home-panel__header">
          <span>Workspace snapshot</span>
        </div>
        <div className="creator-home-stats">
          <div className="creator-home-stat">
            <span>Active subscribers</span>
            <strong>{audienceSummary.active}</strong>
          </div>
          <div className="creator-home-stat">
            <span>Expired subscribers</span>
            <strong>{audienceSummary.expired}</strong>
          </div>
          <div className="creator-home-stat">
            <span>Live stories</span>
            <strong>{stories.length}</strong>
          </div>
          <div className="creator-home-stat">
            <span>Published posts</span>
            <strong>{feedPosts.length}</strong>
          </div>
        </div>
      </div>

      <div className="creator-home-panel">
        <div className="creator-home-panel__header">
          <span>Quick actions</span>
        </div>
        <div className="creator-home-links">
          <a href="/posts/create">Create a new post</a>
          <a href="/my/collections">View audience</a>
          <a href="/my/payments">Review payouts</a>
          <a href="/my/chats">Open chats</a>
        </div>
      </div>

      <div className="creator-home-panel">
        <div className="creator-home-panel__header">
          <span>Content mix</span>
        </div>
        <div className="creator-home-metrics">
          <div className="creator-home-metric">
            <span>Photos</span>
            <strong>{photoCount}</strong>
          </div>
          <div className="creator-home-metric">
            <span>Videos</span>
            <strong>{videoCount}</strong>
          </div>
          <div className="creator-home-metric">
            <span>Texts</span>
            <strong>{textCount}</strong>
          </div>
          <div className="creator-home-metric">
            <span>Visible now</span>
            <strong>{filteredPosts.length}</strong>
          </div>
        </div>
      </div>

      <div className="notif-footer creator-home-footer">
        <a href="/privacy">Privacy</a>
        <span>|</span>
        <a href="/cookies">Cookie Notice</a>
        <span>|</span>
        <a href="/terms">Terms of Service</a>
      </div>
    </div>
  );

  return (
    <MyLayout
      title="Home"
      activeNav="home"
      header={null}
      contentClassName="my-home home-feed-page"
      gridClassName="home-feed-grid"
      aside={aside}
    >
      <div className="home-feed">
        <div className="home-feed__hero">
          <div>
            <div className="home-feed__eyebrow">Creator workspace</div>
            <h2 className="home-feed__hero-title">Your published content and live stories in one place.</h2>
            <p className="home-feed__hero-copy">
              Use this dashboard to verify what fans can see, monitor active stories, and move quickly between content, audience, chats, and payouts.
            </p>
          </div>
          <div className="home-feed__hero-actions">
            <a className="create-post__primary home-feed__hero-button" href="/posts/create">
              Create post
            </a>
            <a className="create-post__ghost home-feed__hero-button" href="/my/collections">
              View audience
            </a>
          </div>
        </div>

        <div className="home-feed__sticky">
          <section className="home-stories">
            <div className="home-stories__title">Home</div>
            {stories.length ? (
              <div
                ref={storiesScrollerRef}
                className="home-stories__scroller"
                onScroll={handleStoriesScroll}
              >
                <div className="home-stories__track">
                  {storyRail.map((story, index) => (
                    <button
                      key={`${story.id}-${index}`}
                      className="home-story"
                      type="button"
                      aria-label={`Open ${story.name} story`}
                      onClick={() => setActiveStory(story)}
                    >
                      <span className="home-story__ring">
                        {story.image ? (
                          <img src={story.image} alt={story.name} />
                        ) : (
                          <span className="home-story__placeholder" aria-hidden="true">
                            {story.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="home-story__name">{story.name}</span>
                      {story.isLive ? <span className="home-story__live">Live</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="home-feed__empty home-feed__empty--stories">
                {loadingContent ? 'Loading stories...' : 'No active stories right now.'}
              </div>
            )}

            <div className="home-feed__filters">
              <button
                className={`home-feed__filter${activeFilter === 'all' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setActiveFilter('all')}
              >
                All
              </button>
              <button
                className={`home-feed__filter${activeFilter === 'photos' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setActiveFilter('photos')}
              >
                Photos
              </button>
              <button
                className={`home-feed__filter${activeFilter === 'videos' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setActiveFilter('videos')}
              >
                Videos
              </button>
              <button
                className={`home-feed__filter${activeFilter === 'texts' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setActiveFilter('texts')}
              >
                Texts
              </button>
            </div>
          </section>
        </div>

        <div className="home-feed__posts">
          {contentError ? <div className="home-feed__error">{contentError}</div> : null}

          {filteredPosts.map((post) => (
            <article key={post.id} className="home-post creator-home-post">
              <header className="home-post__header">
                <div className="home-post__author">
                  {post.avatar ? (
                    <img className="home-post__avatar" src={post.avatar} alt={post.author} />
                  ) : (
                    <div className="home-post__avatar home-post__avatar--placeholder" aria-hidden="true">
                      {post.author.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="home-post__name">
                      {post.author} <VerifiedIcon />
                    </div>
                    <div className="home-post__handle">
                      {post.handle || '@creator'} - {post.time}
                    </div>
                  </div>
                </div>
                <button className="home-post__menu" type="button" aria-label="More options">
                  <MoreVerticalIcon />
                </button>
              </header>

              <p className="home-post__caption">{post.caption}</p>

              {post.type === 'photo' && post.media?.length ? (
                <img className="home-post__media" src={post.media[0]} alt={`${post.author} post`} />
              ) : null}

              {post.type === 'video' && post.video ? (
                <video className="home-post__media" controls preload="metadata" poster={post.video.poster}>
                  <source src={post.video.src} type="video/mp4" />
                </video>
              ) : null}

              <footer className="home-post__footer">
                <span>{post.footerPrimary}</span>
                <span>{post.footerSecondary}</span>
              </footer>
            </article>
          ))}

          {!filteredPosts.length && !contentError ? (
            <div className="home-feed__empty">
              {loadingContent
                ? 'Loading your latest posts...'
                : 'Your published posts will appear here once you create them.'}
            </div>
          ) : null}
        </div>
      </div>

      {activeStory ? (
        <div className="home-story-modal" role="dialog" aria-modal="true">
          <button
            className="home-story-modal__backdrop"
            type="button"
            aria-label="Close story preview"
            onClick={() => setActiveStory(null)}
          />
          <div className="home-story-modal__card">
            <div className="home-story-modal__progress" aria-hidden="true">
              <span className="is-active" />
              <span />
              <span />
            </div>
            <button
              className="home-story-modal__close"
              type="button"
              aria-label="Close story preview"
              onClick={() => setActiveStory(null)}
            >
              <CloseIcon />
            </button>
            <div className="home-story-modal__layout">
              <div className="home-story-modal__stage">
                <div className="home-story-modal__meta">
                  <div className="home-story-modal__identity">
                    <span className="home-story-modal__avatar">
                      {activeStory.image ? (
                        <img src={activeStory.image} alt={activeStory.name} />
                      ) : (
                        <span className="home-story-modal__avatar-fallback" aria-hidden="true">
                          {activeStory.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <div className="home-story-modal__title-group">
                      <div className="home-story-modal__name-row">
                        <div className="home-story-modal__name">{activeStory.name}</div>
                        <span className="home-story-modal__dot" aria-hidden="true" />
                        <div className="home-story-modal__published">{activeStory.publishedLabel}</div>
                      </div>
                      <div className="home-story-modal__handle">{activeStory.handle}</div>
                    </div>
                  </div>
                  <div className="home-story-modal__expires">{activeStory.expiresLabel}</div>
                </div>
                <div className="home-story-modal__media">
                  {activeStory.previewType === 'video' && activeStory.previewUrl ? (
                    <video controls autoPlay muted playsInline preload="metadata">
                      <source src={activeStory.previewUrl} />
                    </video>
                  ) : activeStory.previewType === 'image' && activeStory.previewUrl ? (
                    <img src={activeStory.previewUrl} alt={activeStory.caption} />
                  ) : (
                    <div className="home-story-modal__text">{activeStory.caption}</div>
                  )}
                </div>
              </div>
              <aside className="home-story-modal__details">
                <div className="home-story-modal__eyebrow">Story preview</div>
                <h3 className="home-story-modal__details-title">{activeStory.caption}</h3>
                <p className="home-story-modal__details-copy">
                  Review exactly how this story appears inside your creator workspace before it
                  expires from the rail.
                </p>
                <div className="home-story-modal__badges">
                  <span>{activeStory.visibilityLabel}</span>
                  <span>{activeStory.contentLabel}</span>
                  <span>{activeStory.previewType === 'video' ? 'Video story' : activeStory.previewType === 'image' ? 'Photo story' : 'Text story'}</span>
                </div>
                <div className="home-story-modal__caption">
                  <div className="home-story-modal__caption-label">Caption</div>
                  <p>{activeStory.caption}</p>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </MyLayout>
  );
}
const formatMessageClock = (value: string | null) => {
  if (!value) return 'now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'now';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function ChatAvatar({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className: string;
}) {
  if (src) {
    return <img className={className} src={src} alt={name} />;
  }
  return <div className={`${className} ${className}--fallback`}>{name.slice(0, 1).toUpperCase()}</div>;
}

export function MyChats() {
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [chatableMembers, setChatableMembers] = useState<ChatableMember[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [threadsErrorText, setThreadsErrorText] = useState<string | null>(null);
  const [messageErrorText, setMessageErrorText] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const loadThreads = async (preserveSelection = true) => {
    try {
      setThreadsErrorText(null);
      const [nextThreads, nextMembers] = await Promise.all([
        fetchChatThreads(),
        fetchChatableMembers(),
      ]);
      setThreads(nextThreads);
      setChatableMembers(nextMembers);
      setSelectedThreadId((current) => {
        if (!preserveSelection) {
          return nextThreads[0]?.thread_id ?? null;
        }
        if (selectedMemberId) {
          const matchingThread = nextThreads.find(
            (thread) => thread.member_id === selectedMemberId
          );
          return matchingThread?.thread_id ?? null;
        }
        if (current && nextThreads.some((thread) => thread.thread_id === current)) {
          return current;
        }
        return nextThreads[0]?.thread_id ?? null;
      });
    } catch (error) {
      console.error(error);
      setThreads([]);
      setChatableMembers([]);
      setSelectedThreadId(null);
      if (selectedThreadId || selectedMemberId) {
        setThreadsErrorText(
          error instanceof Error ? error.message : 'Could not load conversations right now.'
        );
      }
    }
  };

  const loadMessages = async (threadId: string) => {
    setMessagesLoading(true);
    try {
      setMessageErrorText(null);
      const nextMessages = await fetchChatMessages(threadId);
      setMessages(nextMessages);
      await markChatThreadRead(threadId);
    } catch (error) {
      console.error(error);
      setMessageErrorText(
        error instanceof Error ? error.message : 'Could not load this conversation.'
      );
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [nextThreads, nextMembers] = await Promise.all([
          fetchChatThreads(),
          fetchChatableMembers(),
        ]);
        if (!mounted) return;
        setThreads(nextThreads);
        setChatableMembers(nextMembers);
        setSelectedThreadId(nextThreads[0]?.thread_id ?? null);
      } catch (error) {
        if (!mounted) return;
        console.error(error);
        setThreads([]);
        setChatableMembers([]);
        setSelectedThreadId(null);
        setThreadsErrorText(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      setMessageErrorText(null);
      return;
    }
    loadMessages(selectedThreadId);
  }, [selectedThreadId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    let unsubscribe = () => {};
    (async () => {
      unsubscribe = await subscribeToCreatorChatThreads(() => {
        loadThreads();
      });
    })();
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedThreadId) return;
    return subscribeToChatMessages(selectedThreadId, () => {
      loadMessages(selectedThreadId);
      loadThreads();
    });
  }, [selectedThreadId]);

  const sortedThreads = [...threads].sort((left, right) => {
    const leftTime = new Date(left.last_message_at ?? left.created_at).getTime();
    const rightTime = new Date(right.last_message_at ?? right.created_at).getTime();
    return sortOrder === 'newest' ? rightTime - leftTime : leftTime - rightTime;
  });

  const filteredChats = sortedThreads.filter((thread) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return [
      thread.peer_name,
      thread.peer_handle,
      thread.last_message_preview ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(term);
  });

  const starterMembers = chatableMembers.filter((member) => {
    const hasExistingThread = threads.some((thread) => thread.member_id === member.member_id);
    if (hasExistingThread) return false;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return [member.display_name ?? '', member.username ?? '']
      .join(' ')
      .toLowerCase()
      .includes(term);
  });

  const selectedThread =
    threads.find((thread) => thread.thread_id === selectedThreadId) ?? null;
  const selectedMember =
    chatableMembers.find((member) => member.member_id === selectedMemberId) ?? null;

  const handleSelectThread = (thread: ChatThreadSummary) => {
    setSelectedThreadId(thread.thread_id);
    setSelectedMemberId(null);
    setComposerOpen(false);
    setMessageErrorText(null);
  };

  const handleSelectMember = (member: ChatableMember) => {
    const existingThread = threads.find((thread) => thread.member_id === member.member_id);
    if (existingThread) {
      handleSelectThread(existingThread);
      return;
    }
    setSelectedMemberId(member.member_id);
    setSelectedThreadId(null);
    setMessages([]);
    setDraft('');
    setComposerOpen(false);
    setMessageErrorText(null);
  };

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    setMessageErrorText(null);
    try {
      const result = await sendChatMessage({
        body: draft,
        threadId: selectedThreadId,
        memberId: selectedMemberId,
      });
      setDraft('');
      await loadThreads(false);
      if (result?.thread_id) {
        setSelectedMemberId(null);
        setSelectedThreadId(result.thread_id);
        await loadMessages(result.thread_id);
      }
    } catch (error) {
      console.error(error);
      setMessageErrorText(
        error instanceof Error ? error.message : 'Could not send your message.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <MyLayout title="Messages" activeNav="messages" header={null} contentClassName="msg-content">
      <div className="msg-shell msg-shell--3col">
        <section className="msg-panel">
          <div className="msg-panel__header">
            <div className="msg-panel__title">
              <button
                className="msg-icon-button"
                type="button"
                aria-label="Go back"
                onClick={() => window.history.back()}
              >
                <ArrowLeftIcon />
              </button>
              <h2>Messages</h2>
            </div>
            <div className="msg-panel__actions">
              <button
                className="msg-icon-button"
                type="button"
                aria-label="Search messages"
                aria-pressed={isSearchOpen}
                onClick={() => setIsSearchOpen((prev) => !prev)}
              >
                <SearchIcon />
              </button>
              <button
                className="msg-icon-button"
                type="button"
                aria-label="New message"
                aria-pressed={composerOpen}
                onClick={() => setComposerOpen((prev) => !prev)}
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          {isSearchOpen ? (
            <div className="msg-panel__search">
              <input
                ref={searchInputRef}
                className="msg-search-input"
                type="search"
                placeholder="Search messages"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          ) : null}

          <div className="msg-panel__controls">
            <span className="muted">Sort</span>
            <button
              className="msg-sort"
              type="button"
              onClick={() =>
                setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))
              }
            >
              {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
            </button>
          </div>

          <div className="msg-panel__hint">
            Direct messages are available with fans who currently have an active subscription.
          </div>

          {threadsErrorText ? <div className="msg-thread__notice">{threadsErrorText}</div> : null}

          {composerOpen ? (
            <div className="msg-starter-list">
              {starterMembers.length ? (
                starterMembers.map((member) => (
                  <button
                    key={member.member_id}
                    className="msg-list__item"
                    type="button"
                    onClick={() => handleSelectMember(member)}
                  >
                    <ChatAvatar
                      className="msg-list__avatar"
                      src={member.avatar_url}
                      name={member.display_name ?? member.username ?? 'Fan'}
                    />
                    <div className="msg-list__meta">
                      <div className="msg-list__name">
                        {member.display_name ?? member.username ?? 'Fan'}
                      </div>
                      <div className="msg-list__handle">
                        {member.username ? ensureHandle(member.username) : 'Active subscriber'}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="msg-empty">No additional active subscribers are ready for a new chat.</div>
              )}
            </div>
          ) : null}

          <div className="msg-list">
            {loading ? (
              <div className="msg-empty">Loading conversations...</div>
            ) : filteredChats.length ? (
              filteredChats.map((thread) => (
                <button
                  key={thread.thread_id}
                  className={`msg-list__item${selectedThread?.thread_id === thread.thread_id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => handleSelectThread(thread)}
                >
                  <ChatAvatar
                    className="msg-list__avatar"
                    src={thread.peer_avatar_url}
                    name={thread.peer_name}
                  />
                  <div className="msg-list__meta">
                    <div className="msg-list__top">
                      <span className="msg-list__name">{thread.peer_name}</span>
                      <span className="msg-list__time">
                        {formatRelativeTime(thread.last_message_at ?? thread.created_at)}
                      </span>
                    </div>
                    <div className="msg-list__handle">
                      {thread.peer_handle ? ensureHandle(thread.peer_handle) : 'Subscriber'}
                    </div>
                    <div className="msg-list__preview">
                      {thread.last_message_preview ?? 'Start the conversation'}
                    </div>
                  </div>
                  {thread.unread_count > 0 ? (
                    <span className="msg-list__badge">{thread.unread_count}</span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="msg-empty">No conversations yet.</div>
            )}
          </div>
        </section>

        <section className="msg-detail dark">
          {selectedThread || selectedMember ? (
            <div className="msg-thread">
              <div className="msg-thread__header">
                <div className="msg-thread__user">
                  <ChatAvatar
                    className="msg-thread__avatar"
                    src={selectedThread?.peer_avatar_url ?? selectedMember?.avatar_url ?? null}
                    name={selectedThread?.peer_name ?? selectedMember?.display_name ?? selectedMember?.username ?? 'Fan'}
                  />
                  <div>
                    <div className="name">
                      {selectedThread?.peer_name ?? selectedMember?.display_name ?? selectedMember?.username}
                    </div>
                    <div className="handle">
                      {selectedThread?.peer_handle
                        ? ensureHandle(selectedThread.peer_handle)
                        : selectedMember?.username
                          ? ensureHandle(selectedMember.username)
                          : 'Active subscriber'}
                    </div>
                  </div>
                </div>
                <div className="msg-thread__status">
                  {selectedThread ? 'Live conversation' : 'New conversation'}
                </div>
              </div>
              <div className="msg-thread__body">
                {messagesLoading ? (
                  <div className="msg-detail__text">Loading messages...</div>
                ) : messages.length ? (
                  messages.map((message) => (
                    <div
                      key={message.message_id}
                      className={`msg-bubble ${message.sender_role === 'creator' ? 'me' : 'other'}`}
                    >
                      <div>{message.body}</div>
                      <div className="my-message-time">{formatMessageClock(message.created_at)}</div>
                    </div>
                  ))
                ) : (
                  <div className="msg-detail__text">
                    Send the first message to start this conversation.
                  </div>
                )}
                <div ref={threadEndRef} />
              </div>
              <div className="msg-thread__composer">
                <input
                  placeholder="Type a message..."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  className="pill primary"
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          ) : (
            <div className="msg-detail__text">Select a fan from the list to start chatting.</div>
          )}
          {selectedThread || selectedMember ? (
            messageErrorText ? <div className="msg-thread__notice">{messageErrorText}</div> : null
          ) : null}
        </section>

        <section className="msg-insights">
          {selectedThread || selectedMember ? (
            <div className="insights-stack">
              <div className="insight-card">
                <div className="card-title">Conversation summary</div>
                <div className="sub-row">
                  <span>Status</span>
                  <span className="pill tiny muted">Active subscriber</span>
                </div>
                <div className="sub-row">
                  <span>Unread messages</span>
                  <span>{selectedThread?.unread_count ?? 0}</span>
                </div>
                <div className="sub-row">
                  <span>Last activity</span>
                  <span>
                    {selectedThread
                      ? formatRelativeTime(selectedThread.last_message_at ?? selectedThread.created_at)
                      : 'Waiting for first message'}
                  </span>
                </div>
              </div>

              <div className="insight-card">
                <div className="card-title">Reply tips</div>
                <div className="msg-insights__copy">
                  Keep replies concise, respectful, and consistent. Fans can only start chats while
                  their subscription is active, which keeps the inbox focused on live supporters.
                </div>
              </div>
            </div>
          ) : (
            <div className="msg-insights__empty">Select a chat to view conversation details.</div>
          )}
        </section>
      </div>
    </MyLayout>
  );
}

export function MyNotifications() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    const loadNotifications = async () => {
      try {
        if (isMounted) {
          setLoading(true);
          setError(null);
        }
        const items = await fetchNotifications();
        if (isMounted) {
          setNotifications(items);
        }
      } catch (loadError) {
        console.error(loadError);
        if (isMounted) {
          setError('Could not load notifications right now.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadNotifications();
    void (async () => {
      unsubscribe = await subscribeToNotifications(() => {
        void loadNotifications();
      });
    })();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') {
      return notifications;
    }
    if (activeTab === 'unread') {
      return notifications.filter((item) => !item.read_at);
    }

    return notifications.filter((item) => getNotificationTabForType(item.type) === activeTab);
  }, [activeTab, notifications]);

  const handleOpenNotification = async (item: AppNotification) => {
    try {
      if (!item.read_at) {
        await markNotificationRead(item.id);
        setNotifications((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, read_at: new Date().toISOString() }
              : entry,
          ),
        );
      }
    } catch (markError) {
      console.error(markError);
    }

    navigate(getCreatorNotificationTarget(item));
  };

  const handleMarkAllRead = async () => {
    try {
      setBusy(true);
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((entry) => ({
          ...entry,
          read_at: entry.read_at ?? new Date().toISOString(),
        })),
      );
    } catch (markError) {
      console.error(markError);
      setError('Could not mark notifications as read.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MyLayout
      title="Notifications"
      subtitle="Review live chats, earnings, subscriptions, and payout updates."
      activeNav="notifications"
      headerActions={
        <button
          className="wallet-action-button wallet-action-button--ghost"
          type="button"
          disabled={!unreadCount || busy}
          onClick={() => void handleMarkAllRead()}
        >
          {busy ? 'Updating...' : 'Mark all read'}
        </button>
      }
      contentClassName="creator-notifications"
    >
      <div className="creator-notifications__tabs">
        {NOTIFICATION_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`creator-notifications__tab${activeTab === tab.key ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.key === 'unread' && unreadCount ? (
              <span className="creator-notifications__tab-badge">{unreadCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? <div className="creator-notifications__error">{error}</div> : null}

      {loading ? (
        <div className="creator-notifications__loading">Loading notifications...</div>
      ) : filteredNotifications.length ? (
        <div className="creator-notifications__list">
          {filteredNotifications.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`creator-notification-card${item.read_at ? '' : ' is-unread'}`}
              onClick={() => void handleOpenNotification(item)}
            >
              <div className="creator-notification-card__icon">
                <BellIcon />
              </div>
              <div className="creator-notification-card__body">
                <div className="creator-notification-card__top">
                  <span className="creator-notification-card__title">
                    {getCreatorNotificationTitle(item)}
                  </span>
                  <span className="creator-notification-card__time">
                    {formatNotificationDate(item.created_at)}
                  </span>
                </div>
                <div className="creator-notification-card__detail">
                  {getCreatorNotificationDetail(item)}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="creator-notifications__empty">
          <div className="creator-notifications__empty-icon">
            <BellIcon />
          </div>
          <strong>No notifications yet</strong>
          <p>
            New chats, tips, subscription activity, payouts, and post activity will show up
            here.
          </p>
        </div>
      )}
    </MyLayout>
  );
}

function useCreatorAudience(status: 'all' | 'active' | 'expired') {
  const [subscribers, setSubscribers] = useState<CreatorSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const next = await fetchCreatorSubscribers(status);
        if (!isMounted) return;
        setSubscribers(next);
      } catch (loadError) {
        console.error(loadError);
        if (isMounted) {
          setError('Could not load your audience right now.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [status]);

  return { subscribers, loading, error };
}

function AudienceListPage({
  title,
  subtitle,
  activeNav,
  status,
}: {
  title: string;
  subtitle: string;
  activeNav: NavKey;
  status: 'active' | 'expired';
}) {
  const { subscribers, loading, error } = useCreatorAudience(status);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');

  const items = useMemo(() => subscribers.map(mapSubscriberToPersonItem), [subscribers]);
  const totalLabel = status === 'active' ? 'Active supporters' : 'Expired supporters';
  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (!trimmed) return true;
      return item.name.toLowerCase().includes(trimmed) || item.handle.toLowerCase().includes(trimmed);
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name);
      }
      return a.order - b.order;
    });
    return sorted;
  }, [items, query, sort]);

  return (
    <MyLayout title={title} subtitle={subtitle} activeNav={activeNav}>
      <section className="audience-hero">
        <div>
          <div className="home-feed__eyebrow">Audience</div>
          <h2 className="audience-hero__title">{title}</h2>
          <p className="audience-hero__copy">{subtitle}</p>
        </div>
        <div className="audience-hero__stats">
          <div className="creator-home-stat">
            <span>{totalLabel}</span>
            <strong>{subscribers.length}</strong>
          </div>
          <div className="creator-home-stat">
            <span>Showing now</span>
            <strong>{visible.length}</strong>
          </div>
        </div>
      </section>

      <div className="my-card audience-toolbar audience-toolbar--elevated">
        <div className="my-row audience-toolbar__row">
          <div className="audience-search-shell">
            <SearchIcon />
            <input
              className="my-input audience-search-input"
              placeholder="Search subscribers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="my-input audience-select"
            value={sort}
            onChange={(event) => setSort(event.target.value as 'recent' | 'name')}
          >
            <option value="recent">Most recent</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {error ? <div className="my-alert">{error}</div> : null}

      <div className="my-list audience-list">
        {loading ? (
          <div className="my-empty audience-empty">Loading audience...</div>
        ) : visible.length ? (
          visible.map((item) => (
            <div key={item.id} className="my-list-item audience-list-item audience-card">
              <div className="audience-list-item__identity">
                {item.avatar ? (
                  <img className="audience-list-item__avatar" src={item.avatar} alt={item.name} />
                ) : (
                  <div className="audience-list-item__avatar audience-list-item__avatar--fallback" aria-hidden="true">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="audience-list-item__name">{item.name}</div>
                  <div className="audience-list-item__handle">{item.handle}</div>
                  <div className="audience-list-item__meta">{item.detail}</div>
                </div>
              </div>
              <div className="my-row audience-card__right">
                <span className="audience-list-item__status">{item.status}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="my-empty audience-empty">
            <strong>No subscribers match your current filters.</strong>
            <span>Try changing the search term or sort order.</span>
          </div>
        )}
      </div>
    </MyLayout>
  );
}

export function MyCollections() {
  const { subscribers, loading, error } = useCreatorAudience('all');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all');

  const activeCount = subscribers.filter(isActiveSubscriber).length;
  const expiredCount = subscribers.filter((item) => !isActiveSubscriber(item)).length;
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return subscribers.filter((item) => {
      const statusMatch =
        filter === 'all' ||
        (filter === 'active' && isActiveSubscriber(item)) ||
        (filter === 'expired' && !isActiveSubscriber(item));
      const textMatch =
        !trimmed ||
        (item.display_name ?? '').toLowerCase().includes(trimmed) ||
        (item.username ?? '').toLowerCase().includes(trimmed);
      return statusMatch && textMatch;
    });
  }, [filter, query, subscribers]);

  return (
    <MyLayout
      title="Audience"
      subtitle="Review active and expired subscribers using real subscription data."
      activeNav="collections"
    >
      <section className="audience-hero">
        <div>
          <div className="home-feed__eyebrow">Audience workspace</div>
          <h2 className="audience-hero__title">Collections and subscriber health in one place.</h2>
          <p className="audience-hero__copy">
            Track who is active, who has churned, and where your audience is trending right now.
          </p>
        </div>
        <div className="audience-hero__actions">
          <a className="create-post__primary home-feed__hero-button" href="/my/collections/user-lists/subscriptions/active">
            View active
          </a>
          <a className="create-post__ghost home-feed__hero-button" href="/my/collections/user-lists/subscriptions/expired">
            View expired
          </a>
        </div>
      </section>

      <div className="creator-home-stats audience-summary-grid">
        <div className="creator-home-stat">
          <span>All subscribers</span>
          <strong>{subscribers.length}</strong>
        </div>
        <div className="creator-home-stat">
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="creator-home-stat">
          <span>Expired</span>
          <strong>{expiredCount}</strong>
        </div>
        <div className="creator-home-stat">
          <span>Retention</span>
          <strong>{subscribers.length ? `${Math.round((activeCount / subscribers.length) * 100)}%` : '0%'}</strong>
        </div>
      </div>

      <div className="my-card audience-toolbar audience-toolbar--elevated">
        <div className="my-row audience-toolbar__row">
          <div className="audience-search-shell">
            <SearchIcon />
            <input
              className="my-input audience-search-input"
              placeholder="Search subscribers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="home-feed__filters audience-toolbar__filters">
            <button
              className={`home-feed__filter audience-filter-pill${filter === 'all' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setFilter('all')}
            >
              All {subscribers.length}
            </button>
            <button
              className={`home-feed__filter audience-filter-pill${filter === 'active' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setFilter('active')}
            >
              Active {activeCount}
            </button>
            <button
              className={`home-feed__filter audience-filter-pill${filter === 'expired' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setFilter('expired')}
            >
              Expired {expiredCount}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="my-alert">{error}</div> : null}

      <div className="my-list audience-list">
        {loading ? (
          <div className="my-empty audience-empty">Loading audience...</div>
        ) : filtered.length ? (
          filtered.map((item) => {
            const mapped = mapSubscriberToPersonItem(item);
            return (
              <div key={item.subscriber_id} className="my-list-item audience-list-item audience-card">
                <div className="audience-list-item__identity">
                  {mapped.avatar ? (
                    <img className="audience-list-item__avatar" src={mapped.avatar} alt={mapped.name} />
                  ) : (
                    <div className="audience-list-item__avatar audience-list-item__avatar--fallback" aria-hidden="true">
                      {mapped.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="audience-list-item__name">{mapped.name}</div>
                    <div className="audience-list-item__handle">{mapped.handle}</div>
                    <div className="audience-list-item__meta">{mapped.detail}</div>
                  </div>
                </div>
                <div className="my-row audience-card__right">
                  <span className="audience-list-item__status">{mapped.status}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="my-empty audience-empty">
            <strong>No audience members match your current filters.</strong>
            <span>Clear the search or switch audience status to find more supporters.</span>
          </div>
        )}
      </div>
    </MyLayout>
  );
}

export function MySubscriptionsActive() {
  return (
    <AudienceListPage
      title="Active subscribers"
      subtitle="Fans with active access to subscriber-only content and chat."
      activeNav="subscriptions"
      status="active"
    />
  );
}

export function MySubscriptionsExpired() {
  return (
    <AudienceListPage
      title="Expired subscribers"
      subtitle="Previous supporters whose access period has ended."
      activeNav="subscriptions"
      status="expired"
    />
  );
}

export function MySubscribersActive() {
  return (
    <AudienceListPage
      title="Audience"
      subtitle="Your currently active supporters."
      activeNav="collections"
      status="active"
    />
  );
}
function LegacyMyPayments() {
  const [filter, setFilter] = useState<'all' | 'in_flight' | 'completed' | 'failed'>('all');
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [transferRows, setTransferRows] = useState<PayoutTransfer[]>([]);
  const [amountMajor, setAmountMajor] = useState('');

  const loadPayments = async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const [nextSummary, nextPayoutAccount, transfers] = await Promise.all([
        fetchPayoutSummary(),
        fetchPayoutAccount(),
        fetchPayoutTransfers(30),
      ]);
      setSummary(nextSummary);
      setPayoutAccount(nextPayoutAccount);
      setTransferRows(transfers);
    } catch (err) {
      console.error(err);
      setErrorText('Could not load payout data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, []);

  const livePayoutAccount = payoutAccount?.provider === 'paypal' ? null : payoutAccount;
  const verificationState = getPayoutVerificationState(livePayoutAccount);
  const amountMinor = parseMajorAmountToMinor(amountMajor);
  const currency = summary?.currency ?? livePayoutAccount?.currency ?? 'KES';
  const canRequestPayout =
    verificationState === 'verified' &&
    amountMinor !== null &&
    amountMinor > 0 &&
    Boolean(summary) &&
    amountMinor <= (summary?.available_amount_minor ?? 0) &&
    !requesting;

  const filtered = useMemo(() => {
    if (filter === 'all') {
      return transferRows;
    }

    if (filter === 'completed') {
      return transferRows.filter((item) => item.status === 'success');
    }

    if (filter === 'failed') {
      return transferRows.filter((item) => item.status === 'failed' || item.status === 'reversed');
    }

    return transferRows.filter((item) => item.status === 'queued' || item.status === 'submitted');
  }, [filter, transferRows]);

  const successfulTransfers = useMemo(
    () => transferRows.filter((transfer) => transfer.status === 'success').length,
    [transferRows],
  );

  const requestDisabledText =
    verificationState === 'unconfigured'
      ? 'Save a payout destination in Banking before requesting a payout.'
      : verificationState === 'pending'
        ? 'Your payout destination is pending manual verification.'
        : verificationState === 'rejected'
          ? 'Your payout destination was rejected. Update it in Banking.'
          : verificationState === 'inactive'
            ? 'Your payout destination is inactive. Update it in Banking.'
            : amountMajor.trim().length === 0
              ? 'Enter the payout amount you want to withdraw.'
              : amountMinor === null || amountMinor <= 0
                ? 'Enter a valid payout amount.'
                : amountMinor > (summary?.available_amount_minor ?? 0)
                  ? 'Requested amount exceeds your available balance.'
                  : null;

  return (
    <MyLayout
      title="Payments"
      subtitle="Request verified payouts and review transfer history."
      activeNav="payments"
      headerActions={
        <div className="wallet-actions wallet-actions--header">
              <a className="wallet-action-button wallet-action-button--ghost" href="/my/payments">
            Banking
          </a>
              <a className="my-button" href="/my/payments">
            Add card
          </a>
        </div>
      }
    >
      <div className="wallet-page wallet-page--payout">
        {payoutAccount?.provider === 'paypal' ? (
          <div className="wallet-notice wallet-notice--warning">
            A previously saved payout method is not supported in the live creator payout workflow.
            Save M-PESA, Bank, or Card to receive payouts.
          </div>
        ) : null}
        {noticeText ? <div className="wallet-notice">{noticeText}</div> : null}
        {errorText ? <div className="wallet-notice wallet-notice--warning">{errorText}</div> : null}

        <section className="wallet-panel wallet-panel--summary">
          <div className="wallet-panel__title-row">
            <div>
              <h2 className="wallet-panel__title">Creator payout workspace</h2>
              <p className="wallet-panel__subtitle">
                Withdraw from your verified creator balance using your approved payout rail.
              </p>
            </div>
            <span className={`wallet-status wallet-status--${verificationState}`}>
              {getPayoutVerificationLabel(verificationState)}
            </span>
          </div>

          <div className="wallet-balance-grid">
            <div className="wallet-balance-card">
              <span className="wallet-balance-card__label">Available balance</span>
              <strong className="wallet-balance-card__value">
                {formatMinorCurrency(summary?.available_amount_minor, currency)}
              </strong>
            </div>
            <div className="wallet-balance-card">
              <span className="wallet-balance-card__label">Pending balance</span>
              <strong className="wallet-balance-card__value">
                {formatMinorCurrency(summary?.pending_amount_minor, currency)}
              </strong>
            </div>
            <div className="wallet-balance-card">
              <span className="wallet-balance-card__label">Completed payouts</span>
              <strong className="wallet-balance-card__value">{successfulTransfers}</strong>
            </div>
          </div>

          <div className="wallet-payout-grid">
            <div className="wallet-payout-card">
              <div className="wallet-payout-card__label">Verified payout destination</div>
              <div className="wallet-payout-card__value">{getPayoutDestinationLabel(livePayoutAccount)}</div>
              <div className="wallet-payout-card__meta">{getPayoutDestinationMeta(livePayoutAccount)}</div>
              <div className="wallet-payout-card__details">
                <span>{getPayoutProviderLabel(livePayoutAccount?.provider)}</span>
                {livePayoutAccount?.verified_at ? (
                  <span>Verified {formatPayoutTransferDate(livePayoutAccount.verified_at)}</span>
                ) : null}
                {livePayoutAccount?.verification_source ? (
                  <span>{livePayoutAccount.verification_source.replace(/_/g, ' ')}</span>
                ) : null}
              </div>
              <div className="wallet-payout-card__actions">
              <a className="wallet-inline-button wallet-inline-button--ghost" href="/my/payments">
                  Update destination
                </a>
              <a className="wallet-inline-button" href="/my/payments">
                  Card payouts
                </a>
              </div>
            </div>

            <div className="wallet-payout-card">
              <div className="wallet-payout-card__label">Request payout</div>
              <label className="wallet-money-field wallet-money-field--large">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountMajor}
                  onChange={(event) => setAmountMajor(event.target.value)}
                  placeholder="0"
                  aria-label="Payout amount"
                />
                <span>{currency === 'KES' ? 'KSh' : currency}</span>
              </label>
              <div className="wallet-payout-card__meta">
                Enter the exact amount to withdraw. Maximum available:{' '}
                {formatMinorCurrency(summary?.available_amount_minor, currency)}.
              </div>
              {requestDisabledText ? (
                <div className="wallet-warning">{requestDisabledText}</div>
              ) : null}
              <button
                className="wallet-action-button"
                type="button"
                disabled={!canRequestPayout}
                onClick={async () => {
                  if (!summary || amountMinor === null || amountMinor <= 0) {
                    setErrorText('Enter a valid payout amount.');
                    return;
                  }
                  if (amountMinor > summary.available_amount_minor) {
                    setErrorText('Requested amount exceeds your available balance.');
                    return;
                  }
                  if (!livePayoutAccount) {
                    setErrorText('Save a payout destination first.');
                    return;
                  }

                  try {
                    setRequesting(true);
                    setNoticeText(null);
                    setErrorText(null);

                    await requestCreatorPayout({
                      amountMinor,
                      reason: 'Creator initiated payout',
                      provider:
                        livePayoutAccount.provider === 'bank'
                          ? 'bank'
                          : livePayoutAccount.provider === 'card'
                            ? 'card'
                            : 'mpesa',
                    });

                    setNoticeText(
                      'Payout request submitted. We will update the transfer once the provider confirms it.',
                    );
                    setAmountMajor('');
                    await loadPayments();
                  } catch (err) {
                    console.error(err);
                    setErrorText(
                      err instanceof Error
                        ? err.message
                        : 'Payout request failed. Confirm payout destination and available balance.',
                    );
                  } finally {
                    setRequesting(false);
                  }
                }}
              >
                {requesting ? 'Requesting...' : 'Request payout'}
              </button>
            </div>
          </div>
        </section>

        <section className="wallet-panel">
          <div className="wallet-panel__title-row">
            <div>
              <h2 className="wallet-panel__title">Payout history</h2>
              <p className="wallet-panel__subtitle">
                Review queued, submitted, successful, and failed transfers.
              </p>
            </div>
            <div className="my-tabs">
              <button
                className={`my-tab${filter === 'all' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                className={`my-tab${filter === 'in_flight' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setFilter('in_flight')}
              >
                In flight
              </button>
              <button
                className={`my-tab${filter === 'completed' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setFilter('completed')}
              >
                Completed
              </button>
              <button
                className={`my-tab${filter === 'failed' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setFilter('failed')}
              >
                Failed
              </button>
            </div>
          </div>

          {loading ? <div className="my-muted">Loading payout data...</div> : null}

          <div className="wallet-history-list">
            {filtered.length ? (
              filtered.map((transfer) => (
                <div key={transfer.id} className="wallet-history-item">
                  <div className="wallet-history-item__meta">
                    <div className="wallet-history-item__title">Payout transfer #{transfer.id}</div>
                    <div className="wallet-history-item__subtext">
                      {formatPayoutTransferDate(transfer.created_at)}
                    </div>
                    {transfer.failure_reason ? (
                      <div className="wallet-history-item__failure">{transfer.failure_reason}</div>
                    ) : null}
                  </div>
                  <div className="wallet-history-item__right">
                    <span className={`wallet-status wallet-status--${transfer.status}`}>
                      {formatPayoutTransferStatus(transfer.status)}
                    </span>
                    <strong>{formatMinorCurrency(transfer.amount_minor, transfer.currency)}</strong>
                  </div>
                </div>
              ))
            ) : (
              !loading && (
                <div className="wallet-card-empty">
                  Your payout history will appear here once you request a transfer.
                </div>
              )
            )}
          </div>
        </section>
      </div>
    </MyLayout>
  );
}

function LegacyMyPaymentsAddCard() {
  return <Navigate to="/my/payments?rail=card-bank&subrail=card&setup=1&panel=method" replace />;
}

export function MyPayments() {
  const navigate = useNavigate();
  const location = useLocation();
  const cardSetupCallbackRef = useRef<string | null>(null);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedRail = normalizePaymentsRail(searchParams.get('rail'));
  const requestedSubrail = normalizeCardBankRail(searchParams.get('subrail'));
  const requestedPanel = normalizePaymentsPanel(searchParams.get('panel'));
  const cardSetupReference = searchParams.get('reference') ?? searchParams.get('trxref');
  const hasCardSetupCallback =
    searchParams.get('paystack_card_setup') === '1' && Boolean(cardSetupReference);
  const [filter, setFilter] = useState<'all' | 'in_flight' | 'completed' | 'failed'>('all');
  const [loading, setLoading] = useState(true);
  const [savingMethod, setSavingMethod] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [linkingCard, setLinkingCard] = useState(false);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [transferRows, setTransferRows] = useState<PayoutTransfer[]>([]);
  const [amountMajor, setAmountMajor] = useState('');
  const [selectedRail, setSelectedRail] = useState<PaymentsRail>('mpesa');
  const [selectedCardBankRail, setSelectedCardBankRail] = useState<CardBankRail>('card');
  const [activePanel, setActivePanel] = useState<PaymentsPanel>('method');
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [mpesaName, setMpesaName] = useState('');
  const [mpesaBankCode, setMpesaBankCode] = useState('MPESA');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const livePayoutAccount = payoutAccount?.provider === 'paypal' ? null : payoutAccount;

  const syncPaymentsRoute = (
    nextRail: PaymentsRail,
    nextSubrail?: CardBankRail,
    setup = true,
    panel: PaymentsPanel = 'method',
  ) => {
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('reference');
    nextParams.delete('trxref');
    nextParams.delete('paystack_card_setup');
    nextParams.set('rail', nextRail);
    if (nextRail === 'card-bank') {
      nextParams.set('subrail', nextSubrail ?? selectedCardBankRail);
    } else {
      nextParams.delete('subrail');
    }
    if (setup) {
      nextParams.set('setup', '1');
    } else {
      nextParams.delete('setup');
    }
    nextParams.set('panel', panel);
    const nextSearch = nextParams.toString();
    navigate(`/my/payments${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  };

  const syncPaymentsPanel = (panel: PaymentsPanel) => {
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('reference');
    nextParams.delete('trxref');
    nextParams.delete('paystack_card_setup');
    nextParams.set('panel', panel);
    const nextSearch = nextParams.toString();
    navigate(`/my/payments${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  };

  const hydrateForm = (account: PayoutAccount | null) => {
    setMpesaNumber(account?.provider === 'mpesa' ? account.msisdn_e164 ?? '' : '');
    setMpesaName(account?.provider === 'mpesa' ? account.account_name ?? '' : '');
    setMpesaBankCode(account?.provider === 'mpesa' ? account.bank_code ?? 'MPESA' : 'MPESA');
    setBankAccountNumber('');
    setBankAccountName(account?.provider === 'bank' ? account.account_name ?? '' : '');
    setBankCode(account?.provider === 'bank' ? account.bank_code ?? '' : '');
    setBankName(account?.provider === 'bank' ? account.bank_name ?? '' : '');
  };

  const loadPayments = async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const [nextSummary, nextPayoutAccount, transfers] = await Promise.all([
        fetchPayoutSummary(),
        fetchPayoutAccount(),
        fetchPayoutTransfers(20),
      ]);
      setSummary(nextSummary);
      setPayoutAccount(nextPayoutAccount);
      setTransferRows(transfers);
      hydrateForm(nextPayoutAccount);
    } catch (error) {
      console.error(error);
      setErrorText('Could not load payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, []);

  useEffect(() => {
    if (requestedRail) {
      setSelectedRail(requestedRail);
      return;
    }
    setSelectedRail(getPaymentsRailFromAccount(livePayoutAccount));
  }, [requestedRail, livePayoutAccount]);

  useEffect(() => {
    if (requestedSubrail) {
      setSelectedCardBankRail(requestedSubrail);
      return;
    }
    setSelectedCardBankRail(getCardBankRailFromAccount(livePayoutAccount));
  }, [requestedSubrail, livePayoutAccount]);

  useEffect(() => {
    if (requestedPanel) {
      setActivePanel(requestedPanel);
      return;
    }
    if (searchParams.get('setup') === '1' || !livePayoutAccount) {
      setActivePanel('method');
      return;
    }
    if (getPayoutVerificationState(livePayoutAccount) === 'verified') {
      setActivePanel('request');
      return;
    }
    setActivePanel('method');
  }, [requestedPanel, livePayoutAccount, searchParams]);

  useEffect(() => {
    if (!hasCardSetupCallback || !cardSetupReference) {
      return;
    }
    if (cardSetupCallbackRef.current === cardSetupReference) {
      return;
    }
    cardSetupCallbackRef.current = cardSetupReference;

    let cancelled = false;

    const finalizeCardSetup = async () => {
      try {
        setLinkingCard(true);
        setErrorText(null);
        setNoticeText('Finishing secure card setup...');
        await completeCreatorCardPayoutSetup({ reference: cardSetupReference });
        if (cancelled) return;
        setNoticeText(
          'Card payout method saved. Verification is still required before payouts can be requested.',
        );
        await loadPayments();
      } catch (error) {
        console.error(error);
        if (cancelled) return;
        setErrorText(
          error instanceof Error ? error.message : 'Could not finish secure card setup.',
        );
      } finally {
        if (!cancelled) {
          const nextParams = new URLSearchParams(location.search);
          nextParams.delete('reference');
          nextParams.delete('trxref');
          nextParams.delete('paystack_card_setup');
          const nextSearch = nextParams.toString();
          navigate(`/my/payments${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
          setLinkingCard(false);
        }
      }
    };

    void finalizeCardSetup();

    return () => {
      cancelled = true;
    };
  }, [cardSetupReference, hasCardSetupCallback, location.search, navigate]);

  const activeSetupProvider: Exclude<PayoutAccount['provider'], 'paypal'> =
    selectedRail === 'card-bank' ? selectedCardBankRail : selectedRail;
  const verificationState = getPayoutVerificationState(livePayoutAccount);
  const currentMethodMatchesSelected = livePayoutAccount?.provider === activeSetupProvider;
  const amountMinor = parseMajorAmountToMinor(amountMajor);
  const currency = summary?.currency ?? livePayoutAccount?.currency ?? 'KES';
  const selectedRailLabel =
    selectedRail === 'card-bank'
      ? selectedCardBankRail === 'card'
        ? 'Card'
        : 'Bank'
      : 'M-PESA';
  const selectedRailDescription =
    activeSetupProvider === 'mpesa'
      ? 'M-PESA payouts run through Paystack once the saved destination is approved.'
      : activeSetupProvider === 'bank'
        ? 'Bank payouts run through Paystack once the saved destination is approved.'
        : 'Paystack will open a secure hosted page and return only masked card details.';

  const filteredTransfers = useMemo(() => {
    if (filter === 'all') {
      return transferRows;
    }
    if (filter === 'completed') {
      return transferRows.filter((item) => item.status === 'success');
    }
    if (filter === 'failed') {
      return transferRows.filter((item) => item.status === 'failed' || item.status === 'reversed');
    }
    return transferRows.filter((item) => item.status === 'queued' || item.status === 'submitted');
  }, [filter, transferRows]);

  const requestDisabledText =
    verificationState === 'unconfigured'
      ? 'Save a payout method first.'
      : verificationState === 'pending'
        ? 'This payout method is waiting for manual review before withdrawals can be requested.'
        : verificationState === 'rejected'
          ? 'This payout method was rejected. Update the details and save it again.'
          : verificationState === 'inactive'
            ? 'This payout method is inactive and cannot receive payouts.'
            : amountMajor.trim().length === 0
              ? 'Enter the amount you want to withdraw.'
              : amountMinor === null || amountMinor <= 0
                ? 'Enter a valid payout amount.'
                : amountMinor > (summary?.available_amount_minor ?? 0)
                  ? 'Requested amount exceeds your available balance.'
                  : null;

  const handleSaveMethod = async () => {
    try {
      setSavingMethod(true);
      setErrorText(null);
      setNoticeText(null);

      if (activeSetupProvider === 'bank') {
        const normalizedAccount = bankAccountNumber.replace(/\D/g, '');
        const normalizedName = bankAccountName.trim();
        const normalizedBankCode = bankCode.trim().toUpperCase();
        if (!normalizedAccount || !normalizedName || !normalizedBankCode) {
          setErrorText('Enter a valid account number, account name, and bank code.');
          return;
        }
        await upsertBankPayoutAccount({
          accountNumber: normalizedAccount,
          accountName: normalizedName,
          bankCode: normalizedBankCode,
          bankName: bankName.trim(),
          currency: 'KES',
        });
        setNoticeText('Bank payout method saved. Verification is pending.');
      } else if (activeSetupProvider === 'mpesa') {
        const normalizedAccount = mpesaNumber.replace(/\D/g, '');
        const normalizedName = mpesaName.trim();
        const normalizedBankCode = mpesaBankCode.trim().toUpperCase() || 'MPESA';
        if (!normalizedAccount || !normalizedName) {
          setErrorText('Enter a valid M-PESA number and account name.');
          return;
        }
        await upsertMpesaPayoutAccount({
          accountNumber: normalizedAccount,
          accountName: normalizedName,
          bankCode: normalizedBankCode,
          currency: 'KES',
        });
        setNoticeText('M-PESA payout method saved. Verification is pending.');
      } else {
        const baseUrl = new URL(import.meta.env.BASE_URL ?? '/creator/', window.location.origin);
        const returnUrl = new URL(
          'my/payments?rail=card-bank&subrail=card&setup=1',
          baseUrl,
        ).toString();
        setLinkingCard(true);
        setNoticeText('Redirecting to Paystack for secure card setup...');
        const setupResult = await startCreatorCardPayoutSetup({ returnUrl });
        if (!setupResult.authorization_url) {
          throw new Error('Could not start secure card setup.');
        }
        window.location.assign(setupResult.authorization_url);
        return;
      }

      await loadPayments();
    } catch (error) {
      console.error(error);
      setErrorText(error instanceof Error ? error.message : 'Could not save payout method.');
    } finally {
      setSavingMethod(false);
      setLinkingCard(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!summary || amountMinor === null || amountMinor <= 0) {
      setErrorText('Enter a valid payout amount.');
      return;
    }
    if (amountMinor > summary.available_amount_minor) {
      setErrorText('Requested amount exceeds your available balance.');
      return;
    }
    if (!livePayoutAccount) {
      setErrorText('Save a payout method first.');
      return;
    }

    try {
      setRequestingPayout(true);
      setErrorText(null);
      setNoticeText(null);

      await requestCreatorPayout({
        amountMinor,
        reason: 'Creator initiated payout',
        provider:
          livePayoutAccount.provider === 'bank'
            ? 'bank'
            : livePayoutAccount.provider === 'card'
              ? 'card'
              : 'mpesa',
      });

      setNoticeText('Payout request submitted. We will update the history as the provider responds.');
      setAmountMajor('');
      await loadPayments();
      setActivePanel('history');
      syncPaymentsPanel('history');
    } catch (error) {
      console.error(error);
      setErrorText(
        error instanceof Error
          ? error.message
          : 'Payout request failed. Confirm your balance and payout method first.',
      );
    } finally {
      setRequestingPayout(false);
    }
  };

  return (
    <MyLayout
      title=""
      activeNav="payments"
      header={null}
    >
      <div className="wallet-page wallet-page--single payments-workspace">
        {payoutAccount?.provider === 'paypal' ? (
          <div className="wallet-notice wallet-notice--warning">
            A previously saved payout method is not supported in the live creator payout workflow.
            Save M-PESA, Bank, or Card in KES to continue.
          </div>
        ) : null}
        {noticeText ? <div className="wallet-notice">{noticeText}</div> : null}
        {errorText ? <div className="wallet-notice wallet-notice--warning">{errorText}</div> : null}

        <section className="wallet-panel wallet-panel--compact payments-summary-strip">
          <div className="wallet-panel__title-row">
            <div className="payments-summary-strip__actions">
              {loading ? <span className="wallet-status">Loading...</span> : null}
              <div className="payments-feature-switch__buttons">
                <button
                  className={`payments-feature-switch__button${activePanel === 'method' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setActivePanel('method');
                    syncPaymentsPanel('method');
                  }}
                >
                  Method
                </button>
                <button
                  className={`payments-feature-switch__button${activePanel === 'request' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setActivePanel('request');
                    syncPaymentsPanel('request');
                  }}
                >
                  Request
                </button>
                <button
                  className={`payments-feature-switch__button${activePanel === 'history' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setActivePanel('history');
                    syncPaymentsPanel('history');
                  }}
                >
                  History
                </button>
              </div>
            </div>
          </div>

          <div className="wallet-balance-grid payments-summary-grid">
            <article className="wallet-balance-card">
              <div className="wallet-balance-card__label">Available balance</div>
              <div className="wallet-balance-card__value">
                {formatMinorCurrency(summary?.available_amount_minor, currency)}
              </div>
            </article>
            <article className="wallet-balance-card">
              <div className="wallet-balance-card__label">Pending balance</div>
              <div className="wallet-balance-card__value">
                {formatMinorCurrency(summary?.pending_amount_minor, currency)}
              </div>
            </article>
          </div>
        </section>

        {activePanel === 'method' ? (
        <section className="wallet-panel wallet-panel--compact payments-method-panel">
          <div className="wallet-panel__title-row">
            <div>
              <h2 className="wallet-panel__title">Set up payout method</h2>
            </div>
            {searchParams.get('setup') === '1' ? <span className="wallet-status">Setup mode</span> : null}
          </div>

          <div className="payments-rail-switch">
            <button
              className={`payments-rail-switch__button${selectedRail === 'mpesa' ? ' is-active' : ''}`}
              type="button"
              onClick={() => {
                setSelectedRail('mpesa');
                syncPaymentsRoute('mpesa');
              }}
            >
              M-PESA
            </button>
            <button
              className={`payments-rail-switch__button${selectedRail === 'card-bank' ? ' is-active' : ''}`}
              type="button"
              onClick={() => {
                setSelectedRail('card-bank');
                syncPaymentsRoute('card-bank', selectedCardBankRail);
              }}
            >
              Card + Bank
            </button>
          </div>

          {selectedRail === 'card-bank' ? (
            <div className="payments-subrail-switch">
              <button
                className={`payments-subrail-switch__button${selectedCardBankRail === 'card' ? ' is-active' : ''}`}
                type="button"
                onClick={() => {
                  setSelectedCardBankRail('card');
                  syncPaymentsRoute('card-bank', 'card');
                }}
              >
                Card
              </button>
              <button
                className={`payments-subrail-switch__button${selectedCardBankRail === 'bank' ? ' is-active' : ''}`}
                type="button"
                onClick={() => {
                  setSelectedCardBankRail('bank');
                  syncPaymentsRoute('card-bank', 'bank');
                }}
              >
                Bank
              </button>
            </div>
          ) : null}

          <div className="payments-setup-grid">
            <div className="payments-setup-form">
              <p className="payments-method-note">{selectedRailDescription}</p>

              {activeSetupProvider === 'mpesa' ? (
                <div className="payments-form-grid">
                  <label className="create-post__field">
                    <span>M-PESA number</span>
                    <input
                      className="my-input"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={mpesaNumber}
                      onChange={(event) => setMpesaNumber(event.target.value)}
                      placeholder="2547XXXXXXXX"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Account name</span>
                    <input
                      className="my-input"
                      autoComplete="name"
                      value={mpesaName}
                      onChange={(event) => setMpesaName(event.target.value)}
                      placeholder="Creator full name"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Bank code</span>
                    <input
                      className="my-input"
                      autoCapitalize="characters"
                      autoComplete="off"
                      value={mpesaBankCode}
                      onChange={(event) => setMpesaBankCode(event.target.value.toUpperCase())}
                      placeholder="MPESA"
                    />
                  </label>
                </div>
              ) : activeSetupProvider === 'bank' ? (
                <div className="payments-form-grid">
                  <label className="create-post__field">
                    <span>Account number</span>
                    <input
                      className="my-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={bankAccountNumber}
                      onChange={(event) => setBankAccountNumber(event.target.value)}
                      placeholder="Account number"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Account name</span>
                    <input
                      className="my-input"
                      autoComplete="name"
                      value={bankAccountName}
                      onChange={(event) => setBankAccountName(event.target.value)}
                      placeholder="Account holder name"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Bank code</span>
                    <input
                      className="my-input"
                      autoCapitalize="characters"
                      autoComplete="off"
                      value={bankCode}
                      onChange={(event) => setBankCode(event.target.value.toUpperCase())}
                      placeholder="BANK CODE"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Bank name (optional)</span>
                    <input
                      className="my-input"
                      autoComplete="organization"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      placeholder="e.g. Equity Bank"
                    />
                  </label>
                </div>
              ) : (
                <div className="payments-card-callout">
                  <strong>Secure card setup</strong>
                  <p>
                    Paystack handles the card on a secure hosted page, then returns only masked card
                    details and payout references.
                  </p>
                  <p>No raw card number or CVV is stored in this app.</p>
                </div>
              )}

              <div className="payments-action-row">
                <button
                  className="wallet-action-button"
                  type="button"
                  disabled={savingMethod || linkingCard}
                  onClick={() => void handleSaveMethod()}
                >
                  {activeSetupProvider === 'card'
                    ? linkingCard
                      ? 'Opening Paystack...'
                      : 'Continue with Paystack'
                    : savingMethod
                      ? 'Saving...'
                      : 'Save payout method'}
                </button>
              </div>
            </div>

            <aside className="payments-method-card">
              <div className="payments-method-card__eyebrow">
                {currentMethodMatchesSelected ? 'Current saved method' : `${selectedRailLabel} setup`}
              </div>
              <h3 className="payments-method-card__title">
                {currentMethodMatchesSelected
                  ? getUnifiedPayoutDestinationLabel(livePayoutAccount)
                  : `${selectedRailLabel} not saved yet`}
              </h3>
              <p className="payments-method-card__meta">
                {currentMethodMatchesSelected
                  ? getUnifiedPayoutDestinationMeta(livePayoutAccount)
                  : 'Save this method to make it your active creator payout destination.'}
              </p>
              <div className="payments-method-card__status">
                <span
                  className={`wallet-status wallet-status--${
                    currentMethodMatchesSelected ? verificationState : 'inactive'
                  }`}
                >
                  {currentMethodMatchesSelected ? getPayoutVerificationLabel(verificationState) : 'Not saved yet'}
                </span>
                <span className="my-muted">
                  {currentMethodMatchesSelected
                    ? `Using ${getPayoutProviderLabel(livePayoutAccount?.provider)} for live payouts`
                    : `Selected rail: ${selectedRailLabel}`}
                </span>
              </div>
            </aside>
          </div>
        </section>

        ) : null}

        {activePanel === 'request' ? (
        <section className="wallet-panel wallet-panel--compact payments-request-panel">
          <div className="wallet-panel__title-row">
            <div>
              <h2 className="wallet-panel__title">Request payout</h2>
            </div>
          </div>

          <div className="payments-request-grid">
            <label className="wallet-money-field wallet-money-field--large">
              <input
                type="text"
                inputMode="decimal"
                value={amountMajor}
                onChange={(event) => setAmountMajor(event.target.value)}
                placeholder="0"
                aria-label="Payout amount"
              />
              <span>{currency === 'KES' ? 'KSh' : currency}</span>
            </label>
            <button
              className="wallet-action-button"
              type="button"
              disabled={Boolean(requestDisabledText) || requestingPayout}
              onClick={() => void handleRequestPayout()}
            >
              {requestingPayout ? 'Requesting...' : 'Request payout'}
            </button>
          </div>

          <div className="payments-request-meta">
            <div>
              <strong>Using:</strong> {getUnifiedPayoutDestinationLabel(livePayoutAccount)}
            </div>
            <div>
              <strong>Available:</strong> {formatMinorCurrency(summary?.available_amount_minor, currency)}
            </div>
          </div>

          {requestDisabledText ? <div className="wallet-warning">{requestDisabledText}</div> : null}
        </section>

        ) : null}

        {activePanel === 'history' ? (
        <section className="wallet-panel wallet-panel--compact payments-history-panel">
          <div className="payments-history-header">
            <div>
              <h2 className="wallet-panel__title">History</h2>
            </div>
            <div className="my-tabs">
              <button
                className={`my-tab${filter === 'all' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                className={`my-tab${filter === 'in_flight' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setFilter('in_flight')}
              >
                Active
              </button>
              <button
                className={`my-tab${filter === 'completed' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setFilter('completed')}
              >
                Completed
              </button>
              <button
                className={`my-tab${filter === 'failed' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setFilter('failed')}
              >
                Failed
              </button>
            </div>
          </div>

          {loading ? <div className="my-muted">Loading payment activity...</div> : null}

          <div className="wallet-history-list">
            {filteredTransfers.length ? (
              filteredTransfers.map((transfer) => (
                <div key={transfer.id} className="wallet-history-item">
                  <div className="wallet-history-item__meta">
                    <div className="wallet-history-item__title">Payout transfer #{transfer.id}</div>
                    <div className="wallet-history-item__subtext">
                      {formatPayoutTransferDate(transfer.created_at)}
                    </div>
                    {transfer.failure_reason ? (
                      <div className="wallet-history-item__failure">{transfer.failure_reason}</div>
                    ) : null}
                  </div>
                  <div className="wallet-history-item__right">
                    <span className={`wallet-status wallet-status--${transfer.status}`}>
                      {formatPayoutTransferStatus(transfer.status)}
                    </span>
                    <strong>{formatMinorCurrency(transfer.amount_minor, transfer.currency)}</strong>
                  </div>
                </div>
              ))
            ) : (
              !loading && (
                <div className="wallet-card-empty">
                  Your payout history will appear here after your first transfer request.
                </div>
              )
            )}
          </div>
        </section>
        ) : null}
      </div>
    </MyLayout>
  );
}

export function MyPaymentsAddCard() {
  return <Navigate to="/my/payments?rail=card-bank&subrail=card&setup=1&panel=method" replace />;
}

export function PostsCreate() {
  const navigate = useNavigate();
  const [composerProfile, setComposerProfile] = useState<CreatorNavProfile>(() =>
    readCachedCreatorProfile()
  );
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState('');
  const [audience, setAudience] = useState<'All fans' | 'Subscribers'>('All fans');
  const [postType, setPostType] = useState<'post' | 'story'>('post');
  const [contentRating, setContentRating] = useState<'sfw' | 'nsfw'>('sfw');
  const [storyDurationHours, setStoryDurationHours] = useState('24');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const remaining = 1000 - content.length;
  const hasContent = content.trim().length > 0 || attachments.length > 0;
  const validPollOptions = pollOptions.map((option) => option.trim()).filter(Boolean);
  const hasDraftData =
    content.trim().length > 0 ||
    attachments.length > 0 ||
    isPaid ||
    price.trim().length > 0 ||
    audience !== DEFAULT_CREATOR_DRAFT.audience ||
    postType !== DEFAULT_CREATOR_DRAFT.postType ||
    contentRating !== DEFAULT_CREATOR_DRAFT.contentRating ||
    storyDurationHours !== DEFAULT_CREATOR_DRAFT.storyDurationHours ||
    isScheduled ||
    scheduleAt.trim().length > 0 ||
    pollEnabled ||
    validPollOptions.some((option) => option.length > 0);
  const canPublish = hasContent && (!isPaid || price.trim().length > 0) && !publishing;
  const creatorDisplayName = composerProfile.name || 'Creator';

  useEffect(() => {
    const restored = readCreatorDraft();
    if (!restored) {
      return;
    }

    setContent(restored.content);
    setAudience(restored.audience);
    setPostType(restored.postType);
    setContentRating(restored.contentRating);
    setStoryDurationHours(restored.storyDurationHours);
    setIsPaid(restored.isPaid);
    setPrice(restored.price);
    setIsScheduled(restored.isScheduled);
    setScheduleAt(restored.scheduleAt);
    setPollEnabled(restored.pollEnabled);
    setPollOptions(restored.pollOptions.length >= 2 ? restored.pollOptions : ['', '']);
  }, []);

  useEffect(() => {
    if (postType !== 'story') {
      return;
    }

    setIsScheduled(false);
    setScheduleAt('');
    setPollEnabled(false);
    setPollOptions(['', '']);
  }, [postType]);

  useEffect(() => {
    let cancelled = false;

    const loadComposerProfile = async () => {
      try {
        const profile = await fetchCurrentCreatorProfile();
        if (cancelled || !profile) {
          return;
        }

        setComposerProfile((prev) => {
          const next = {
            ...prev,
            name: profile.name || prev.name,
            handle: profile.handle,
            avatar: profile.avatar_url ?? '',
            meta: prev.meta,
          };
          persistCachedCreatorProfile(next);
          return next;
        });
      } catch (error) {
        console.error('Could not load composer profile', error);
      }
    };

    void loadComposerProfile();
    const handleProfileUpdated = () => {
      void loadComposerProfile();
    };
    window.addEventListener('creator-profile-updated', handleProfileUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('creator-profile-updated', handleProfileUpdated);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        window.clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) {
      window.clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2400);
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }
    setAttachments((prev) => [...prev, ...files]);
    event.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const resetComposer = () => {
    setContent(DEFAULT_CREATOR_DRAFT.content);
    setAttachments([]);
    setIsPaid(DEFAULT_CREATOR_DRAFT.isPaid);
    setPrice(DEFAULT_CREATOR_DRAFT.price);
    setAudience(DEFAULT_CREATOR_DRAFT.audience);
    setPostType(DEFAULT_CREATOR_DRAFT.postType);
    setContentRating(DEFAULT_CREATOR_DRAFT.contentRating);
    setStoryDurationHours(DEFAULT_CREATOR_DRAFT.storyDurationHours);
    setIsScheduled(DEFAULT_CREATOR_DRAFT.isScheduled);
    setScheduleAt(DEFAULT_CREATOR_DRAFT.scheduleAt);
    setPollEnabled(DEFAULT_CREATOR_DRAFT.pollEnabled);
    setPollOptions(DEFAULT_CREATOR_DRAFT.pollOptions);
    clearCreatorDraft();
  };

  const handleSaveDraft = () => {
    if (!hasDraftData) {
      clearCreatorDraft();
      showNotice('Nothing to save yet.');
      return;
    }

    const draftPayload = {
      content,
      audience,
      postType,
      contentRating,
      storyDurationHours,
      isPaid,
      price,
      isScheduled,
      scheduleAt,
      pollEnabled,
      pollOptions,
    };

    if (
      content.trim().length > 0 ||
      isPaid ||
      price.trim().length > 0 ||
      audience !== DEFAULT_CREATOR_DRAFT.audience ||
      postType !== DEFAULT_CREATOR_DRAFT.postType ||
      contentRating !== DEFAULT_CREATOR_DRAFT.contentRating ||
      storyDurationHours !== DEFAULT_CREATOR_DRAFT.storyDurationHours ||
      isScheduled ||
      scheduleAt.trim().length > 0 ||
      pollEnabled ||
      validPollOptions.some((option) => option.length > 0)
    ) {
      writeCreatorDraft(draftPayload);
    } else {
      clearCreatorDraft();
    }

    showNotice(
      attachments.length
        ? 'Draft saved. Reattach media files before publishing.'
        : 'Draft saved.'
    );
  };

  const handlePublish = async () => {
    if (!canPublish) {
      return;
    }

    const trimmed = content.trim();
    const priceValue = Number(price);
    if (isPaid && (!Number.isFinite(priceValue) || priceValue <= 0)) {
      showNotice('Enter a valid price.');
      return;
    }

    const durationHours = Math.round(Number(storyDurationHours) || 24);
    if (postType === 'story' && (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 72)) {
      showNotice('Story duration must be between 1 and 72 hours.');
      return;
    }
    if (pollEnabled && validPollOptions.length < 2) {
      showNotice('Add at least two poll options.');
      return;
    }
    if (isScheduled) {
      if (!scheduleAt) {
        showNotice('Choose when the post should go live.');
        return;
      }

      const scheduledAt = new Date(scheduleAt).getTime();
      if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
        showNotice('Pick a future publish time.');
        return;
      }

      showNotice('Scheduling is back in the editor. Connect backend scheduling before publishing it live.');
      return;
    }
    if (pollEnabled) {
      showNotice('Poll builder restored. Connect poll storage before publishing it live.');
      return;
    }

    const visibility = isPaid ? 'ppv' : audience === 'Subscribers' ? 'subscribers' : 'public';
    const title = trimmed.slice(0, 80) || (postType === 'story' ? 'New story' : 'New post');
    const expiresAt =
      postType === 'story'
        ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
        : null;

    try {
      setPublishing(true);
      await publishCreatorPost({
        title,
        body: trimmed || null,
        visibility,
        price_cents: isPaid ? Math.round(priceValue * 100) : 0,
        currency: 'KES',
        content_rating: contentRating,
        post_type: postType,
        expires_at: expiresAt,
        files: attachments,
      });

      resetComposer();
      showNotice(postType === 'story' ? 'Story published.' : 'Post published.');
      window.setTimeout(() => navigate('/'), 250);
    } catch (error) {
      console.error(error);
      showNotice(
        error instanceof Error && error.message ? error.message : 'Could not publish content.'
      );
    } finally {
      setPublishing(false);
    }
  };

  const togglePaid = () => {
    setIsPaid((prev) => {
      const next = !prev;
      if (!next) {
        setPrice('');
      }
      return next;
    });
  };

  const toggleSchedule = () => {
    setIsScheduled((prev) => {
      const next = !prev;
      if (!next) {
        setScheduleAt('');
      }
      return next;
    });
  };

  const togglePoll = () => {
    setPollEnabled((prev) => {
      const next = !prev;
      if (!next) {
        setPollOptions(['', '']);
      }
      return next;
    });
  };

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((prev) => prev.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const addPollOption = () => {
    setPollOptions((prev) => [...prev, ''].slice(0, 6));
  };

  return (
    <MyLayout title="Create post" header={null}>
      <div className="create-post">
        <div className="create-post__header">
          <div className="create-post__title">
            <button
              className="create-post__icon-button"
              type="button"
              aria-label="Go back"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon />
            </button>
            <div>
              <h2>Create post</h2>
              <p>Share a new update with your fans.</p>
            </div>
          </div>
          <div className="create-post__actions">
            <button
              className="create-post__ghost"
              type="button"
              onClick={handleSaveDraft}
              disabled={!hasDraftData}
            >
              Save draft
            </button>
            <button
              className="create-post__primary"
              type="button"
              onClick={handlePublish}
              disabled={!canPublish}
            >
              {publishing
                ? postType === 'story'
                  ? 'Publishing story...'
                  : 'Publishing post...'
                : postType === 'story'
                  ? 'Publish story'
                  : 'Publish post'}
            </button>
          </div>
        </div>

        {notice ? <div className="create-post__notice">{notice}</div> : null}

        <div className="create-post__grid">
          <section className="my-card create-post__editor">
            <div className="create-post__author">
              {composerProfile.avatar ? (
                <img className="create-post__avatar-image" src={composerProfile.avatar} alt={creatorDisplayName} />
              ) : (
                <div className="create-post__avatar" aria-hidden="true" />
              )}
              <div>
                <div className="create-post__name">{creatorDisplayName}</div>
                {composerProfile.handle ? (
                  <div className="create-post__handle">{composerProfile.handle}</div>
                ) : null}
              </div>
            </div>

            <textarea
              className="create-post__textarea"
              placeholder="Write a caption..."
              rows={6}
              maxLength={1000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />

            <div className="create-post__toolbar">
              <input
                ref={fileInputRef}
                className="create-post__file-input"
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFiles}
              />
              <button
                className="create-post__tool"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <CameraMiniIcon />
                Add media
              </button>
              {postType === 'post' ? (
                <button
                  className={`create-post__tool${pollEnabled ? ' is-active' : ''}`}
                  type="button"
                  onClick={togglePoll}
                >
                  <PollIcon />
                  Poll
                </button>
              ) : null}
              <span className={`create-post__count${remaining < 50 ? ' is-low' : ''}`}>
                {remaining}
              </span>
            </div>

            {pollEnabled ? (
              <div className="create-post__poll">
                <div className="create-post__poll-title">Poll options</div>
                {pollOptions.map((option, index) => (
                  <input
                    key={`poll-${index}`}
                    className="my-input"
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(event) => updatePollOption(index, event.target.value)}
                  />
                ))}
                {pollOptions.length < 6 ? (
                  <button className="create-post__link" type="button" onClick={addPollOption}>
                    <PlusIcon />
                    Add another option
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="create-post__attachments">
              {attachments.length ? (
                attachments.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="create-post__attachment">
                    <div>
                      <div className="create-post__attachment-name">{file.name}</div>
                      <div className="my-muted">{Math.round(file.size / 1024)} KB</div>
                    </div>
                    <button
                      className="create-post__remove"
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => removeAttachment(index)}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                ))
              ) : (
                <div className="create-post__attachments-empty">No media added yet.</div>
              )}
            </div>
          </section>

          <aside className="create-post__side">
            <div className="my-card create-post__panel">
              <div className="create-post__panel-title">Post settings</div>
              <label className="create-post__field">
                <span>Audience</span>
                <select
                  className="my-input"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value as 'All fans' | 'Subscribers')}
                >
                  <option>All fans</option>
                  <option>Subscribers</option>
                </select>
              </label>

              <label className="create-post__field">
                <span>Post type</span>
                <select
                  className="my-input"
                  value={postType}
                  onChange={(event) => setPostType(event.target.value as 'post' | 'story')}
                >
                  <option value="post">Post</option>
                  <option value="story">Story (expires)</option>
                </select>
              </label>

              {postType === 'story' ? (
                <label className="create-post__field">
                  <span>Story duration (hours)</span>
                  <input
                    className="my-input"
                    type="number"
                    min="1"
                    max="72"
                    value={storyDurationHours}
                    onChange={(event) => setStoryDurationHours(event.target.value)}
                  />
                </label>
              ) : null}

              <label className="create-post__field">
                <span>Content rating</span>
                <select
                  className="my-input"
                  value={contentRating}
                  onChange={(event) => setContentRating(event.target.value as 'sfw' | 'nsfw')}
                >
                  <option value="sfw">SFW</option>
                  <option value="nsfw">NSFW</option>
                </select>
              </label>

              <div className="my-divider" />

              <div className="my-toggle">
                <div>
                  <div className="create-post__toggle-title">Paid post</div>
                  <div className="my-muted">Lock this post behind a price.</div>
                </div>
                <button
                  className={`my-toggle__switch${isPaid ? ' is-on' : ''}`}
                  type="button"
                  aria-pressed={isPaid}
                  onClick={togglePaid}
                />
              </div>

              {isPaid ? (
                <label className="create-post__field">
                  <span>Price (KES)</span>
                  <input
                    className="my-input"
                    type="number"
                    min="1"
                    placeholder="KSh 499"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </label>
              ) : null}

              {postType === 'post' ? (
                <>
                  <div className="my-divider" />

                  <div className="my-toggle">
                    <div>
                      <div className="create-post__toggle-title">Schedule post</div>
                      <div className="my-muted">Pick a time for this post to go live.</div>
                    </div>
                    <button
                      className={`my-toggle__switch${isScheduled ? ' is-on' : ''}`}
                      type="button"
                      aria-pressed={isScheduled}
                      onClick={toggleSchedule}
                    />
                  </div>

                  {isScheduled ? (
                    <label className="create-post__field">
                      <span>Publish at</span>
                      <input
                        className="my-input"
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(event) => setScheduleAt(event.target.value)}
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="my-card create-post__summary">
              <div className="create-post__panel-title">Post summary</div>
              <div className="create-post__summary-row">
                <span>Attachments</span>
                <strong>{attachments.length}</strong>
              </div>
              <div className="create-post__summary-row">
                <span>Audience</span>
                <strong>{audience}</strong>
              </div>
              <div className="create-post__summary-row">
                <span>Visibility</span>
                <strong>
                  {isPaid
                    ? `PPV (${formatMinorCurrency(Math.round((Number(price) || 0) * 100), 'KES')})`
                    : audience === 'Subscribers'
                      ? 'Subscribers only'
                      : 'Public'}
                </strong>
              </div>
              <div className="create-post__summary-row">
                <span>Type</span>
                <strong>{postType === 'story' ? 'Story' : 'Post'}</strong>
              </div>
              <div className="create-post__summary-row">
                <span>Content rating</span>
                <strong>{contentRating.toUpperCase()}</strong>
              </div>
              {pollEnabled ? (
                <div className="create-post__summary-row">
                  <span>Poll options</span>
                  <strong>{validPollOptions.length}</strong>
                </div>
              ) : null}
              {isScheduled ? (
                <div className="create-post__summary-row">
                  <span>Scheduled</span>
                  <strong>{scheduleAt || 'Pick a time'}</strong>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </MyLayout>
  );
}

function LegacyMyBanking() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [bankingError, setBankingError] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [payoutMethod, setPayoutMethod] = useState<'mpesa' | 'bank'>('mpesa');
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [mpesaName, setMpesaName] = useState('');
  const [mpesaBankCode, setMpesaBankCode] = useState('MPESA');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');

  const hydrateForm = (account: PayoutAccount | null) => {
    setPayoutMethod(account?.provider === 'bank' ? 'bank' : 'mpesa');
    setMpesaNumber(account?.provider === 'mpesa' ? account.msisdn_e164 ?? '' : '');
    setMpesaName(account?.provider === 'mpesa' ? account.account_name ?? '' : '');
    setMpesaBankCode(account?.provider === 'mpesa' ? account.bank_code ?? 'MPESA' : 'MPESA');
    setBankAccountNumber('');
    setBankAccountName(account?.provider === 'bank' ? account.account_name ?? '' : '');
    setBankCode(account?.provider === 'bank' ? account.bank_code ?? '' : '');
    setBankName(account?.provider === 'bank' ? account.bank_name ?? '' : '');
  };

  useEffect(() => {
    let active = true;

    const loadBanking = async () => {
      try {
        setLoading(true);
        setBankingError(null);
        const [nextSummary, nextAccount] = await Promise.all([
          fetchPayoutSummary().catch((error) => {
            console.warn('Could not load payout summary', error);
            return null;
          }),
          fetchPayoutAccount().catch((error) => {
            console.warn('Could not load payout account', error);
            return null;
          }),
        ]);

        if (!active) return;
        setSummary(nextSummary);
        setPayoutAccount(nextAccount);
        hydrateForm(nextAccount);
      } catch (error) {
        console.error(error);
        if (!active) return;
        setBankingError('Could not load payout destination settings.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadBanking();

    return () => {
      active = false;
    };
  }, []);

  const livePayoutAccount = payoutAccount?.provider === 'paypal' ? null : payoutAccount;
  const verificationState = getPayoutVerificationState(livePayoutAccount);
  const destinationMeta = getPayoutDestinationMeta(livePayoutAccount);

  const handleSave = async () => {
    try {
      setSavingAccount(true);
      setBankingError(null);
      setNoticeText(null);

      if (payoutMethod === 'bank') {
        const normalizedAccount = bankAccountNumber.replace(/\D/g, '');
        const normalizedName = bankAccountName.trim();
        const normalizedBankCode = bankCode.trim().toUpperCase();
        const normalizedBankName = bankName.trim();
        if (!normalizedAccount || !normalizedName || !normalizedBankCode) {
          setBankingError('Enter a valid bank account number, account name, and bank code.');
          return;
        }
        await upsertBankPayoutAccount({
          accountNumber: normalizedAccount,
          accountName: normalizedName,
          bankCode: normalizedBankCode,
          bankName: normalizedBankName,
          currency: 'KES',
        });
      } else {
        const normalizedAccount = mpesaNumber.replace(/\D/g, '');
        const normalizedName = mpesaName.trim();
        const normalizedBankCode = mpesaBankCode.trim().toUpperCase() || 'MPESA';
        if (!normalizedAccount || !normalizedName) {
          setBankingError('Enter a valid M-PESA number and account name.');
          return;
        }
        await upsertMpesaPayoutAccount({
          accountNumber: normalizedAccount,
          accountName: normalizedName,
          bankCode: normalizedBankCode,
          currency: 'KES',
        });
      }

      const refreshedAccount = await fetchPayoutAccount();
      setPayoutAccount(refreshedAccount);
      hydrateForm(refreshedAccount);
      setNoticeText('Payout destination saved. Manual review is required before payouts can be requested.');
    } catch (error) {
      console.error(error);
      setBankingError(error instanceof Error && error.message ? error.message : 'Could not save payout destination.');
    } finally {
      setSavingAccount(false);
    }
  };

  return (
    <MyLayout
      title="Banking"
      subtitle="Save the payout destination that will receive verified creator transfers."
      activeNav="payments"
      headerActions={
        <div className="wallet-actions wallet-actions--header">
          <button
            className="wallet-action-button wallet-action-button--ghost"
            type="button"
                  onClick={() => navigate('/my/payments')}
          >
            Card payouts
          </button>
          <button className="wallet-action-button" type="button" onClick={() => navigate('/my/payments')}>
            Open payments
          </button>
        </div>
      }
    >
      <div className="wallet-page wallet-page--single">
        {bankingError ? <div className="wallet-notice wallet-notice--warning">{bankingError}</div> : null}
        {noticeText ? <div className="wallet-notice">{noticeText}</div> : null}
        {payoutAccount?.provider === 'paypal' ? (
          <div className="wallet-notice wallet-notice--warning">
            A previously saved payout method is not supported in the live creator payout workflow.
            Save M-PESA, Bank, or Card to receive payouts.
          </div>
        ) : null}

        <section className="wallet-panel">
          <div className="wallet-panel__title-row">
            <div>
              <h2 className="wallet-panel__title">Verification status</h2>
              <p className="wallet-panel__subtitle">
                Payout requests stay blocked until the destination passes manual review.
              </p>
            </div>
            {loading ? <span className="wallet-status">Syncing...</span> : null}
          </div>

          <div className="wallet-balance-grid wallet-balance-grid--banking">
            <article className="wallet-balance-card">
              <div className="wallet-balance-card__label">Status</div>
              <div className="wallet-balance-card__value wallet-balance-card__value--small">
                {getPayoutVerificationLabel(verificationState)}
              </div>
            </article>
            <article className="wallet-balance-card">
              <div className="wallet-balance-card__label">Destination</div>
              <div className="wallet-balance-card__value wallet-balance-card__value--small">
                {getPayoutDestinationLabel(livePayoutAccount)}
              </div>
              <div className="wallet-balance-card__meta">{destinationMeta}</div>
            </article>
            <article className="wallet-balance-card">
              <div className="wallet-balance-card__label">Verified rail</div>
              <div className="wallet-balance-card__value wallet-balance-card__value--small">
                {getPayoutProviderLabel(livePayoutAccount?.provider)}
              </div>
              <div className="wallet-balance-card__meta">
                {livePayoutAccount?.verified_at
                  ? `Verified ${new Date(livePayoutAccount.verified_at).toLocaleDateString()}`
                  : livePayoutAccount?.verification_source === 'manual_review_required'
                    ? 'Manual review required'
                    : 'Waiting for verification'}
              </div>
            </article>
            <article className="wallet-balance-card">
              <div className="wallet-balance-card__label">Available balance</div>
              <div className="wallet-balance-card__value">
                {formatMinorCurrency(summary?.available_amount_minor, summary?.currency)}
              </div>
            </article>
          </div>

          <div className="wallet-warning">
            Saving a destination does not verify it. M-PESA and Bank destinations default to
            pending until they are manually approved server-side.
          </div>
        </section>

        <div className="wallet-banking-main">
          <section className="wallet-panel wallet-panel--compact wallet-banking-main__form">
            <div className="wallet-panel__title-row">
              <div>
                <h2 className="wallet-panel__title">Payout destination</h2>
                <p className="wallet-panel__subtitle">
                  Choose the payout rail you want to use for verified creator withdrawals.
                </p>
              </div>
            </div>

            <div className="wallet-rail-picker">
              <button
                className={`wallet-rail-picker__button${payoutMethod === 'mpesa' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setPayoutMethod('mpesa')}
              >
                M-PESA
              </button>
              <button
                className={`wallet-rail-picker__button${payoutMethod === 'bank' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setPayoutMethod('bank')}
              >
                Bank
              </button>
            </div>

            <div className="wallet-banking-grid">
              {payoutMethod === 'bank' ? (
                <>
                  <label className="create-post__field">
                    <span>Bank account number</span>
                    <input
                      className="my-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={bankAccountNumber}
                      onChange={(event) => setBankAccountNumber(event.target.value)}
                      placeholder="Account number"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Account name</span>
                    <input
                      className="my-input"
                      autoComplete="name"
                      value={bankAccountName}
                      onChange={(event) => setBankAccountName(event.target.value)}
                      placeholder="Account holder name"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Bank code</span>
                    <input
                      className="my-input"
                      autoCapitalize="characters"
                      autoComplete="off"
                      value={bankCode}
                      onChange={(event) => setBankCode(event.target.value.toUpperCase())}
                      placeholder="BANK CODE"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Bank name (optional)</span>
                    <input
                      className="my-input"
                      autoComplete="organization"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      placeholder="e.g. Equity Bank"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="create-post__field">
                    <span>M-PESA number</span>
                    <input
                      className="my-input"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={mpesaNumber}
                      onChange={(event) => setMpesaNumber(event.target.value)}
                      placeholder="2547XXXXXXXX"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Account name</span>
                    <input
                      className="my-input"
                      autoComplete="name"
                      value={mpesaName}
                      onChange={(event) => setMpesaName(event.target.value)}
                      placeholder="Creator full name"
                    />
                  </label>
                  <label className="create-post__field">
                    <span>Bank code</span>
                    <input
                      className="my-input"
                      autoCapitalize="characters"
                      autoComplete="off"
                      value={mpesaBankCode}
                      onChange={(event) => setMpesaBankCode(event.target.value.toUpperCase())}
                      placeholder="MPESA"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="wallet-actions">
              <button
                className="wallet-action-button wallet-action-button--ghost"
                type="button"
                  onClick={() => navigate('/my/payments')}
              >
                Open payments
              </button>
              <button className="wallet-action-button" type="button" disabled={savingAccount} onClick={handleSave}>
                {savingAccount ? 'Saving...' : 'Save destination'}
              </button>
            </div>
          </section>

          <section className="wallet-panel wallet-panel--compact wallet-banking-main__workflow">
            <div className="wallet-panel__title-row">
              <div>
                <h2 className="wallet-panel__title">Verification workflow</h2>
                <p className="wallet-panel__subtitle">
                  Payouts are production-safe only when the destination and the transfer request both pass
                  the backend checks.
                </p>
              </div>
            </div>

            <div className="wallet-support-list">
              <div className="wallet-support-list__item">
                <strong>1. Save destination</strong>
                <span>M-PESA and Bank destinations are stored in pending status by default.</span>
              </div>
              <div className="wallet-support-list__item">
                <strong>2. Manual verification</strong>
                <span>Only verified destinations can request payouts from the Payments page.</span>
              </div>
              <div className="wallet-support-list__item">
                <strong>3. Request payout</strong>
                <span>The payout amount must be explicit and cannot exceed your available balance.</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </MyLayout>
  );
}

export function MyBanking() {
  return <Navigate to="/my/payments?setup=1&panel=method" replace />;
}

void LegacyMyPayments;
void LegacyMyPaymentsAddCard;
void LegacyMyBanking;
void PeopleListPage;
void FilterIcon;
void LayoutIcon;
void ShuffleIcon;
void RefreshIcon;
void ChevronLeftIcon;
void ChevronRightIcon;
void EmptyUsersIcon;
void BookmarkEmptyIcon;
void BookmarkGalleryIcon;
void EmptyPostsIcon;
void StarIcon;
void LogOutIcon;

export function MyTicketsCreate() {
  const [form, setForm] = useState({
    subject: '',
    category: 'Billing',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const isReady = form.subject.trim() && form.message.trim();

  const handleSubmit = () => {
    if (!isReady) {
      return;
    }

    setSubmitted(true);
  };

  return (
    <MyLayout title="Create ticket" subtitle="Tell us how we can help" activeNav="more">
      <div className="my-card">
        <form className="my-form" onSubmit={(event) => event.preventDefault()}>
          <label className="my-muted">Subject</label>
          <input
            className="my-input"
            value={form.subject}
            placeholder="Describe your issue"
            onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
          />
          <label className="my-muted">Category</label>
          <select
            className="my-input"
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
          >
            <option>Billing</option>
            <option>Account</option>
            <option>Content</option>
            <option>Technical</option>
            <option>Other</option>
          </select>
          <label className="my-muted">Message</label>
          <textarea
            className="my-input"
            rows={6}
            value={form.message}
            onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
          />
          <div className="my-row">
            <button className="my-button" type="button" onClick={handleSubmit} disabled={!isReady}>
              Submit ticket
            </button>
            <button
              className="my-button secondary"
              type="button"
              onClick={() => setForm({ subject: '', category: 'Billing', message: '' })}
            >
              Clear
            </button>
          </div>
        </form>
      </div>
      {submitted ? (
        <div className="my-alert">Ticket submitted. We will reply within 24 hours.</div>
      ) : null}
    </MyLayout>
  );
}

function PeopleListPage({
  title,
  subtitle,
  activeNav,
  items,
}: {
  title: string;
  subtitle: string;
  activeNav: NavKey;
  items: PersonItem[];
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');

  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (!trimmed) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(trimmed) ||
        item.handle.toLowerCase().includes(trimmed)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name);
      }
      return a.order - b.order;
    });

    return sorted;
  }, [items, query, sort]);

  return (
    <MyLayout title={title} subtitle={subtitle} activeNav={activeNav}>
      <div className="my-card">
        <div className="my-row">
          <input
            className="my-input"
            style={{ maxWidth: 260 }}
            placeholder="Search people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="my-input"
            style={{ maxWidth: 160 }}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="recent">Most recent</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      <div className="my-list">
        {visible.length ? (
          visible.map((item) => (
            <div key={item.id} className="my-list-item">
              <div>
                <div className="my-chat-name">{item.name}</div>
                <div className="my-muted">{item.handle}</div>
              </div>
              <div className="my-row">
                <span className="my-pill">{item.status}</span>
                <span className="my-muted">{item.detail}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="my-empty">No matches for your search.</div>
        )}
      </div>
    </MyLayout>
  );
}

const NAV_PROFILE = {
  name: 'Creator',
  handle: '',
  avatar: '',
  meta: null as null | { fans: string; followers: string },
};

const readCachedCreatorProfile = (): CreatorNavProfile => {
  if (typeof window === 'undefined') {
    return NAV_PROFILE;
  }

  const runtimeWindow = window as typeof window & {
    __creatorProfileCache?: Partial<CreatorNavProfile>;
  };

  const normalize = (value: Partial<CreatorNavProfile> | null | undefined): CreatorNavProfile => ({
    ...NAV_PROFILE,
    ...(value ?? {}),
    name:
      typeof value?.name === 'string' && value.name.trim().length > 0
        ? value.name.trim()
        : NAV_PROFILE.name,
    handle: typeof value?.handle === 'string' ? value.handle : NAV_PROFILE.handle,
    avatar: typeof value?.avatar === 'string' ? value.avatar : NAV_PROFILE.avatar,
    meta: value?.meta ?? NAV_PROFILE.meta,
  });

  if (runtimeWindow.__creatorProfileCache) {
    return normalize(runtimeWindow.__creatorProfileCache);
  }

  try {
    const raw = window.localStorage.getItem(CREATOR_PROFILE_CACHE_KEY);
    if (!raw) {
      return NAV_PROFILE;
    }
    const parsed = JSON.parse(raw) as Partial<CreatorNavProfile>;
    const next = normalize(parsed);
    runtimeWindow.__creatorProfileCache = next;
    return next;
  } catch {
    return NAV_PROFILE;
  }
};

const persistCachedCreatorProfile = (profile: CreatorNavProfile) => {
  if (typeof window === 'undefined') {
    return;
  }

  const runtimeWindow = window as typeof window & {
    __creatorProfileCache?: CreatorNavProfile;
  };
  runtimeWindow.__creatorProfileCache = profile;

  try {
    window.localStorage.setItem(CREATOR_PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage write failures and keep the in-memory cache.
  }
};

function MyLayout({
  title,
  subtitle,
  activeNav,
  headerActions,
  header,
  aside,
  gridClassName,
  contentClassName,
  children,
}: MyLayoutProps) {
  const [navProfile, setNavProfile] = useState<CreatorNavProfile>(() =>
    readCachedCreatorProfile()
  );
  const [isNavPanelOpen, setIsNavPanelOpen] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [navBalanceLabel, setNavBalanceLabel] = useState('KES 0');

  useEffect(() => {
    document.body.classList.add('react-page');
    document.body.classList.add('of-my-body');
    document.title = title;

    return () => {
      document.body.classList.remove('of-my-body');
      document.body.classList.remove('react-page');
    };
  }, [title]);

  useEffect(() => {
    let cancelled = false;

    const loadNavProfile = async () => {
      try {
        const profile = await fetchCurrentCreatorProfile();
        if (cancelled || !profile) {
          return;
        }

        setNavProfile((prev) => {
          const next = {
            ...prev,
            name: profile.name || prev.name,
            handle: profile.handle,
            avatar: profile.avatar_url ?? '',
            meta: prev.meta,
          };
          persistCachedCreatorProfile(next);
          return next;
        });
      } catch (error) {
        console.error('Could not load creator nav profile', error);
      }
    };

    void loadNavProfile();
    const handleProfileUpdated = () => {
      void loadNavProfile();
    };
    window.addEventListener('creator-profile-updated', handleProfileUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('creator-profile-updated', handleProfileUpdated);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    const loadUnreadCount = async () => {
      try {
        const count = await fetchUnreadNotificationCount();
        if (isMounted) {
          setNotificationUnreadCount(count);
        }
      } catch (error) {
        console.error('Could not load notification unread count', error);
      }
    };

    void loadUnreadCount();
    void (async () => {
      unsubscribe = await subscribeToNotifications(() => {
        void loadUnreadCount();
      });
    })();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadBalanceLabel = async () => {
      try {
        const summary = await fetchPayoutSummary();
        if (!isMounted) return;
        setNavBalanceLabel(formatMinorCurrency(summary?.available_amount_minor ?? 0, summary?.currency ?? 'KES'));
      } catch (error) {
        console.error('Could not load navigation payout summary', error);
      }
    };

    void loadBalanceLabel();
    return () => {
      isMounted = false;
    };
  }, []);

  const navInitial = navProfile.name.trim().charAt(0).toUpperCase() || 'C';
  const closeNavPanel = () => setIsNavPanelOpen(false);

  return (
    <div className="my-shell">
      {isNavPanelOpen ? (
        <button
          className="my-nav-backdrop"
          type="button"
          aria-label="Close creator menu"
          onClick={closeNavPanel}
        />
      ) : null}

      <aside className={`my-nav my-nav--dark${isNavPanelOpen ? ' is-open' : ''}`}>
        <button
          className="my-nav__close"
          type="button"
          aria-label="Close creator menu"
          onClick={closeNavPanel}
        >
          <CloseIcon />
        </button>
        <div className="my-nav__profile">
          {navProfile.avatar ? (
            <img className="my-nav__avatar" src={navProfile.avatar} alt="Profile avatar" />
          ) : (
            <div className="my-nav__avatar my-nav__avatar--placeholder" aria-hidden="true">
              {navInitial}
            </div>
          )}
          <div className="my-nav__identity">
            <div className="name">{navProfile.name}</div>
            {navProfile.handle ? (
              <div className="handle">{navProfile.handle}</div>
            ) : null}
            {navProfile.meta ? (
              <div className="meta">
                <span>{navProfile.meta.fans}</span> - <span>{navProfile.meta.followers}</span>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="my-nav__menu">
          <NavItem
            href="/"
            label="Home"
            icon={<HomeIcon />}
            isActive={activeNav === 'home'}
            onClick={closeNavPanel}
          />
          <NavItem
            href="/my/notifications"
            label="Notifications"
            icon={<BellIcon />}
            badge={notificationUnreadCount > 0 ? String(Math.min(notificationUnreadCount, 99)) : undefined}
            isActive={activeNav === 'notifications'}
            onClick={closeNavPanel}
          />
          <NavItem
            href="/my/chats"
            label="Chats"
            icon={<ChatIcon />}
            isActive={activeNav === 'messages'}
            onClick={closeNavPanel}
          />
          <NavItem
            href="/my/collections"
            label="Collections"
            icon={<GearIcon />}
            isActive={activeNav === 'collections'}
            onClick={closeNavPanel}
          />
          <NavItem
            href="/my/collections/user-lists/subscriptions/active"
            label="Subscriptions"
            icon={<BagIcon />}
            isActive={activeNav === 'subscriptions'}
            onClick={closeNavPanel}
          />
          <NavItem
            href="/my/payments"
            label="Payments"
            icon={<CardIcon />}
            trailing={<span className="wallet-pill">{navBalanceLabel}</span>}
            isActive={activeNav === 'payments'}
            onClick={closeNavPanel}
          />
        </nav>

        <a className="my-nav__cta" href="/posts/create" onClick={closeNavPanel}>
          <span className="my-nav__cta-icon">
            <PlusIcon />
          </span>
          New Post
        </a>

        <div className="my-nav__secondary">
          <NavItem
            href="/my/settings"
            label="Settings"
            icon={<GearIcon />}
            isActive={activeNav === 'more'}
            onClick={closeNavPanel}
          />
        </div>
      </aside>

      <main className="my-main">
        <div className="my-main__toolbar">
          <button
            className="my-nav-toggle"
            type="button"
            aria-label={isNavPanelOpen ? 'Hide creator menu' : 'Show creator menu'}
            aria-expanded={isNavPanelOpen}
            onClick={() => setIsNavPanelOpen((prev) => !prev)}
          >
            <MenuIcon />
            <span>Menu</span>
          </button>
        </div>
        {header === undefined ? (
          <header className="my-main__header">
            <div>
              <h1 className="my-main__title">{title}</h1>
              {subtitle ? <p className="my-main__subtitle">{subtitle}</p> : null}
            </div>
            {headerActions ? (
              <div className="my-main__actions">{headerActions}</div>
            ) : null}
          </header>
        ) : (
          header
        )}

        {aside ? (
          <div className={`my-main__grid${gridClassName ? ` ${gridClassName}` : ''}`}>
            <div
              className={`my-main__content${contentClassName ? ` ${contentClassName}` : ''}`}
            >
              {children}
            </div>
            <aside className="my-main__aside">{aside}</aside>
          </div>
        ) : (
          <div
            className={`my-main__content${contentClassName ? ` ${contentClassName}` : ''}`}
          >
            {children}
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
  isActive,
  badge,
  trailing,
  onClick,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  badge?: string;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <a className={`my-nav-item${isActive ? ' is-active' : ''}`} href={href} onClick={onClick}>
      <span className="my-nav-item__icon">{icon}</span>
      <span className="my-nav-item__label">{label}</span>
      {badge ? <span className="my-nav-item__badge">{badge}</span> : null}
      {trailing ? <span className="my-nav-item__trailing">{trailing}</span> : null}
    </a>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11.5L12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9a6 6 0 0 1 12 0v5l2 2H4l2-2z" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v11H7l-3 3z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <path d="M17 16h3" />
      <path d="M18.5 14.5v3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M10 9v11" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l5 5" />
    </svg>
  );
}

function PollIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12" />
      <path d="M6 12h8" />
      <path d="M6 17h10" />
      <circle cx="4" cy="7" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="17" r="1" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M4.9 4.9l2.2 2.2" />
      <path d="M16.9 16.9l2.2 2.2" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M4.9 19.1l2.2-2.2" />
      <path d="M16.9 7.1l2.2-2.2" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h6l3 3" />
      <path d="M20 7h-3l-2 2" />
      <path d="M4 17h6l3-3" />
      <path d="M20 17h-3l-2-2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function MoreVerticalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5L15.5 9" />
    </svg>
  );
}

function CameraMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M8 7l2-2h4l2 2" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </svg>
  );
}

function EmptyUsersIcon() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <rect x="18" y="32" width="56" height="70" rx="8" />
      <rect x="46" y="18" width="56" height="70" rx="8" />
      <rect x="74" y="34" width="56" height="70" rx="8" />
      <circle cx="118" cy="58" r="18" />
      <path d="M131 71l12 12" />
      <path d="M62 54h20" />
      <path d="M62 64h28" />
      <path d="M89 54h16" />
      <path d="M89 64h20" />
    </svg>
  );
}

function BookmarkEmptyIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M20 10h24a4 4 0 0 1 4 4v40l-16-8-16 8V14a4 4 0 0 1 4-4z" />
    </svg>
  );
}

function BookmarkGalleryIcon() {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true">
      <rect x="18" y="30" width="120" height="84" rx="10" />
      <rect x="108" y="58" width="74" height="54" rx="10" />
      <circle cx="54" cy="60" r="12" />
      <path d="M34 96l22-20 18 16 22-22 30 26" />
      <path d="M128 30h24v30l-12-8-12 8z" />
      <path d="M140 86l16 0" />
    </svg>
  );
}

function EmptyPostsIcon() {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true">
      <rect x="22" y="40" width="80" height="64" rx="8" />
      <rect x="60" y="22" width="86" height="72" rx="8" />
      <path d="M114 22v20h20" />
      <path d="M96 60c0-8 16-8 16 0 0 8-8 8-8 16" />
      <circle cx="104" cy="84" r="2.5" />
      <circle cx="146" cy="72" r="20" />
      <path d="M160 86l16 16" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="16" y="22" width="32" height="28" rx="4" />
      <path d="M24 22v-4a8 8 0 0 1 16 0v4" />
      <circle cx="26" cy="30" r="2" />
      <circle cx="38" cy="30" r="2" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3l2.39 4.84 5.34.78-3.86 3.76.91 5.32L12 15.9l-4.78 2.8.91-5.32L4.27 8.62l5.34-.78L12 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17 5 12l5-5" />
      <path d="M5 12h11" />
    </svg>
  );
}

