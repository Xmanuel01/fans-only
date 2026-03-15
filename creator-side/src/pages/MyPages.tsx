import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCurrentCreatorProfile,
  fetchCreatorFeedPosts,
  fetchPayoutAccount,
  fetchPayoutSummary,
  fetchPayoutTransfers,
  fetchCreatorStories,
  publishCreatorPost,
  requestCreatorPayout,
  requestPaypalPayout,
  type CreatorContentItem,
  upsertBankPayoutAccount,
  upsertMpesaPayoutAccount,
  upsertPaypalPayoutAccount,
} from '../supabaseClient';
import './MyPages.css';

type NavKey =
  | 'home'
  | 'notifications'
  | 'messages'
  | 'collections'
  | 'subscriptions'
  | 'add-card'
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
  | 'tags'
  | 'comments'
  | 'mentions'
  | 'subscriptions'
  | 'promotions';

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  category: Exclude<NotificationTab, 'all'>;
};

type SuggestionCard = {
  id: string;
  name: string;
  handle: string;
  gradient: string;
  badge?: string;
};

type PersonItem = {
  id: string;
  name: string;
  handle: string;
  detail: string;
  status: string;
  order: number;
};

type PaymentItem = {
  id: string;
  label: string;
  date: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
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
  image: string;
  previewUrl: string;
  previewType: 'image' | 'video' | 'text';
  caption: string;
  expiresLabel: string;
  isLive?: boolean;
};

const USE_SAMPLE_DATA =
  !import.meta.env.PROD && import.meta.env.VITE_ENABLE_SAMPLE_DATA === 'true';
const CREATOR_DRAFT_STORAGE_KEY = 'creator-post-draft-v1';

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
  const primaryMedia = post.media[0];
  const isVideo = Boolean(primaryMedia?.mime_type?.startsWith('video/'));
  const author = post.creator?.display_name?.trim() || 'You';

  return {
    id: String(post.id),
    author,
    handle: ensureHandle(post.creator?.handle),
    avatar: post.creator?.avatar_url ?? '',
    time: formatRelativeTime(post.created_at),
    caption: post.body?.trim() || post.title || 'Untitled post',
    type: primaryMedia ? (isVideo ? 'video' : 'photo') : 'text',
    media: !isVideo && primaryMedia?.url ? [primaryMedia.url] : undefined,
    video: isVideo && primaryMedia?.url ? { src: primaryMedia.url, poster: '' } : undefined,
    footerPrimary: describeVisibility(post),
    footerSecondary: `${post.content_rating.toUpperCase()} · ${formatRelativeTime(post.created_at)}`,
  };
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
    image: story.creator?.avatar_url ?? primaryMedia?.url ?? '',
    previewUrl: primaryMedia?.url ?? '',
    previewType,
    caption: story.body?.trim() || story.title || 'Story',
    expiresLabel: formatExpiryLabel(story.expires_at),
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
};

const DEFAULT_CREATOR_DRAFT: CreatorPostDraft = {
  content: '',
  audience: 'All fans',
  postType: 'post',
  contentRating: 'sfw',
  storyDurationHours: '24',
  isPaid: false,
  price: '',
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

const NOTIFICATION_TABS: Array<{ key: NotificationTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'tags', label: 'Tags' },
  { key: 'comments', label: 'Comments' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'promotions', label: 'Promotions' },
];

const NOTIFICATION_ITEMS: NotificationItem[] = [];

const SUGGESTIONS: SuggestionCard[] = USE_SAMPLE_DATA
  ? [
      {
        id: 's-1',
        name: 'Mia Nowak',
        handle: '@liospark',
        gradient:
          'linear-gradient(120deg, rgba(4, 120, 166, 0.9), rgba(4, 74, 123, 0.6)), linear-gradient(120deg, #12a4d9, #0c4f7a)',
        badge: 'Free',
      },
      {
        id: 's-2',
        name: 'Saya Moon',
        handle: '@saya_moon',
        gradient:
          'linear-gradient(120deg, rgba(10, 10, 10, 0.5), rgba(116, 116, 116, 0.6)), linear-gradient(120deg, #1f1f1f, #a0a0a0)',
        badge: 'Free',
      },
      {
        id: 's-3',
        name: 'Fitness Barbie',
        handle: '@fitnessbarbiex',
        gradient:
          'linear-gradient(120deg, rgba(60, 60, 60, 0.55), rgba(18, 18, 18, 0.7)), linear-gradient(120deg, #4b4b4b, #1c1c1c)',
        badge: 'Free',
      },
    ]
  : [];

const DEFAULT_LIST_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'fans', label: 'Fans' },
  { key: 'following', label: 'Following' },
  { key: 'restricted', label: 'Restricted' },
  { key: 'blocked', label: 'Blocked' },
];

const SUBSCRIPTIONS_ACTIVE: PersonItem[] = USE_SAMPLE_DATA
  ? [
      {
        id: 'sa-1',
        name: 'Aria Rose',
        handle: '@ariarose',
        detail: '$12.99 / mo',
        status: 'Auto-renew',
        order: 1,
      },
      {
        id: 'sa-2',
        name: 'Skyline',
        handle: '@skyline',
        detail: '$9.99 / mo',
        status: 'Renews in 5 days',
        order: 2,
      },
      {
        id: 'sa-3',
        name: 'Maya Chen',
        handle: '@mayachen',
        detail: '$12.99 / mo',
        status: 'Auto-renew',
        order: 3,
      },
    ]
  : [];

const SUBSCRIPTIONS_EXPIRED: PersonItem[] = USE_SAMPLE_DATA
  ? [
      {
        id: 'se-1',
        name: 'Rowan',
        handle: '@rowan',
        detail: 'Expired 3 days ago',
        status: 'Offer 10% back',
        order: 1,
      },
      {
        id: 'se-2',
        name: 'Zara Hope',
        handle: '@zarahope',
        detail: 'Expired last week',
        status: 'Send reminder',
        order: 2,
      },
    ]
  : [];

const SUBSCRIBERS_ACTIVE: PersonItem[] = USE_SAMPLE_DATA
  ? [
      {
        id: 'sb-1',
        name: 'Kai Rivers',
        handle: '@kairivers',
        detail: 'Subscribed 6 months',
        status: 'Top fan',
        order: 1,
      },
      {
        id: 'sb-2',
        name: 'Nova Lane',
        handle: '@novalane',
        detail: 'Subscribed 3 months',
        status: 'VIP',
        order: 2,
      },
      {
        id: 'sb-3',
        name: 'Eli Stone',
        handle: '@elistone',
        detail: 'Subscribed 1 month',
        status: 'New',
        order: 3,
      },
    ]
  : [];

const PAYMENTS: PaymentItem[] = USE_SAMPLE_DATA
  ? [
      { id: 'p-1', label: 'Weekly payout', date: 'Today', amount: '$1,280.00', status: 'pending' },
      { id: 'p-2', label: 'Weekly payout', date: 'Jan 3', amount: '$1,410.00', status: 'paid' },
      { id: 'p-3', label: 'Tips', date: 'Jan 1', amount: '$215.00', status: 'paid' },
      { id: 'p-4', label: 'Chargeback', date: 'Dec 29', amount: '-$42.00', status: 'failed' },
    ]
  : [];

const HOME_POSTS: HomePost[] = USE_SAMPLE_DATA
  ? [
      {
        id: 'hp-1',
        author: 'SpicyX',
        handle: '@SpicyX',
        avatar: 'https://i.pravatar.cc/80?img=32',
        time: '3 hours ago',
        caption:
          'Weekend trip diary from Puerto Vallarta. New sunset set just dropped for subscribers.',
        type: 'photo',
        media: ['https://dummyimage.com/1080x680/1a2b44/e8edf5&text=Puerto+Vallarta+Set'],
        footerPrimary: '1,842 likes',
        footerSecondary: '221 comments',
      },
      {
        id: 'hp-2',
        author: 'Emily Frame',
        handle: '@emily_frame',
        avatar: 'https://i.pravatar.cc/80?img=47',
        time: '6 hours ago',
        caption:
          'Quick behind-the-scenes clip before tonight live stream. Full video is in my vault.',
        type: 'video',
        video: {
          src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          poster: 'https://dummyimage.com/1080x680/2a1838/e8edf5&text=Behind+The+Scenes',
        },
        footerPrimary: '1,290 likes',
        footerSecondary: '104 comments',
      },
      {
        id: 'hp-3',
        author: 'Cherry',
        handle: '@urcherryx',
        avatar: 'https://i.pravatar.cc/80?img=12',
        time: 'yesterday',
        caption:
          'Late night thoughts: consistency beats motivation. Posting schedule is now Mon, Wed, Fri.',
        type: 'text',
        footerPrimary: '932 likes',
        footerSecondary: '88 comments',
      },
      {
        id: 'hp-4',
        author: 'Mia Nowak',
        handle: '@liospark',
        avatar: 'https://i.pravatar.cc/80?img=20',
        time: '2 days ago',
        caption: 'Fresh photoset from the neon studio. Which look should I expand next?',
        type: 'photo',
        media: ['https://dummyimage.com/1080x680/22314a/e8edf5&text=Neon+Studio+Set'],
        footerPrimary: '1,544 likes',
        footerSecondary: '197 comments',
      },
    ]
  : [];

const HOME_STORIES: StoryItem[] = USE_SAMPLE_DATA
  ? [
      {
        id: 'st-1',
        name: 'Aiko',
        image: 'https://i.pravatar.cc/96?img=21',
        previewUrl: 'https://dummyimage.com/1080x1920/1d2430/e8edf5&text=Aiko+Story',
        previewType: 'image',
        caption: 'Quick story preview from the studio.',
        expiresLabel: 'Expires in 24h',
        isLive: true,
      },
      {
        id: 'st-2',
        name: 'Emily',
        image: 'https://i.pravatar.cc/96?img=47',
        previewUrl: 'https://dummyimage.com/1080x1920/202a3a/e8edf5&text=Emily+Story',
        previewType: 'image',
        caption: 'Morning update for subscribers.',
        expiresLabel: 'Expires in 20h',
      },
      {
        id: 'st-3',
        name: 'Cherry',
        image: 'https://i.pravatar.cc/96?img=12',
        previewUrl: 'https://dummyimage.com/1080x1920/2e1d2a/e8edf5&text=Cherry+Story',
        previewType: 'image',
        caption: 'Cherry story drop.',
        expiresLabel: 'Expires in 18h',
      },
      {
        id: 'st-4',
        name: 'Mia',
        image: 'https://i.pravatar.cc/96?img=20',
        previewUrl: 'https://dummyimage.com/1080x1920/243043/e8edf5&text=Mia+Story',
        previewType: 'image',
        caption: 'Mia backstage moment.',
        expiresLabel: 'Expires in 16h',
      },
      {
        id: 'st-5',
        name: 'Saya',
        image: 'https://i.pravatar.cc/96?img=14',
        previewUrl: 'https://dummyimage.com/1080x1920/2b213c/e8edf5&text=Saya+Story',
        previewType: 'image',
        caption: 'Saya evening update.',
        expiresLabel: 'Expires in 12h',
      },
      {
        id: 'st-6',
        name: 'Fitness',
        image: 'https://i.pravatar.cc/96?img=26',
        previewUrl: 'https://dummyimage.com/1080x1920/233629/e8edf5&text=Fitness+Story',
        previewType: 'image',
        caption: 'Workout recap.',
        expiresLabel: 'Expires in 10h',
      },
      {
        id: 'st-7',
        name: 'Nora',
        image: 'https://i.pravatar.cc/96?img=39',
        previewUrl: 'https://dummyimage.com/1080x1920/372a24/e8edf5&text=Nora+Story',
        previewType: 'image',
        caption: 'Nora check-in.',
        expiresLabel: 'Expires in 8h',
      },
      {
        id: 'st-8',
        name: 'Alex',
        image: 'https://i.pravatar.cc/96?img=33',
        previewUrl: 'https://dummyimage.com/1080x1920/202020/e8edf5&text=Alex+Story',
        previewType: 'image',
        caption: 'Alex preview story.',
        expiresLabel: 'Expires in 6h',
      },
    ]
  : [];

export function MyHome() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'photos' | 'videos' | 'texts'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestions, setSuggestions] = useState(SUGGESTIONS);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [feedPosts, setFeedPosts] = useState<HomePost[]>(HOME_POSTS);
  const [stories, setStories] = useState<StoryItem[]>(HOME_STORIES);
  const [loadingContent, setLoadingContent] = useState(!USE_SAMPLE_DATA);
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
    if (USE_SAMPLE_DATA) {
      return;
    }

    let cancelled = false;

    const loadCreatorContent = async () => {
      setLoadingContent(true);
      setContentError('');

      try {
        const [postsData, storiesData] = await Promise.all([
          fetchCreatorFeedPosts(24),
          fetchCreatorStories(18),
        ]);

        if (cancelled) {
          return;
        }

        setFeedPosts(
          postsData.map(mapCreatorPostToHomePost).map((post) => ({
            ...post,
            footerPrimary: post.footerPrimary.replace('Â·', '-'),
            footerSecondary: post.footerSecondary.replace('Â·', '-'),
          }))
        );
        setStories(storiesData.map(mapCreatorStoryToStoryItem));
      } catch (error) {
        console.error(error);
        if (cancelled) {
          return;
        }
        setFeedPosts([]);
        setStories([]);
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
    if (!node) {
      return;
    }

    if (storyRail.length <= 1) {
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

  const filteredSuggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return suggestions;
    }
    return suggestions.filter(
      (item) =>
        item.name.toLowerCase().includes(term) || item.handle.toLowerCase().includes(term)
    );
  }, [searchTerm, suggestions]);

  const dotCount = 12;

  const shuffleSuggestions = () => {
    setSuggestions((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setSuggestionIndex(0);
  };

  const resetSuggestions = () => {
    setSearchTerm('');
    setSuggestions(SUGGESTIONS);
    setSuggestionIndex(0);
  };

  const cycleSuggestions = (direction: 'next' | 'prev') => {
    setSuggestions((prev) => {
      if (!prev.length) {
        return prev;
      }
      const next = [...prev];
      if (direction === 'next') {
        const first = next.shift();
        if (first) {
          next.push(first);
        }
      } else {
        const last = next.pop();
        if (last) {
          next.unshift(last);
        }
      }
      return next;
    });

    setSuggestionIndex((prev) => {
      if (direction === 'next') {
        return (prev + 1) % dotCount;
      }
      return (prev - 1 + dotCount) % dotCount;
    });
  };

  const toggleFollow = (id: string) => {
    setFollowedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const aside = (
    <div className="notif-sidebar">
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

      <div className="notif-suggestions">
        <div className="notif-suggestions__header">
          <span>Suggestions</span>
          <div className="notif-suggestions__actions">
            <button
              className="notif-icon-button small"
              type="button"
              aria-label="Shuffle suggestions"
              onClick={shuffleSuggestions}
            >
              <ShuffleIcon />
            </button>
            <button
              className="notif-icon-button small"
              type="button"
              aria-label="Refresh suggestions"
              onClick={resetSuggestions}
            >
              <RefreshIcon />
            </button>
            <button
              className="notif-icon-button small"
              type="button"
              aria-label="Previous suggestions"
              onClick={() => cycleSuggestions('prev')}
            >
              <ChevronLeftIcon />
            </button>
            <button
              className="notif-icon-button small"
              type="button"
              aria-label="Next suggestions"
              onClick={() => cycleSuggestions('next')}
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>
        <div className="notif-suggestions__list">
          {filteredSuggestions.map((item) => {
            const isFollowing = followedIds.includes(item.id);
            return (
              <button
                key={item.id}
                className={`suggestion-card${isFollowing ? ' is-following' : ''}`}
                type="button"
                style={{ backgroundImage: item.gradient }}
                onClick={() => toggleFollow(item.id)}
              >
                {item.badge ? (
                  <span className="suggestion-card__badge">{item.badge}</span>
                ) : null}
                <span className="suggestion-card__menu">
                  <MoreVerticalIcon />
                </span>
                {isFollowing ? (
                  <span className="suggestion-card__follow">Following</span>
                ) : null}
                <div className="suggestion-card__avatar" aria-hidden="true" />
                <div className="suggestion-card__meta">
                  <div className="suggestion-card__name">
                    {item.name}
                    <VerifiedIcon />
                  </div>
                  <div className="suggestion-card__handle">{item.handle}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="suggestion-dots" aria-hidden="true">
          {Array.from({ length: dotCount }).map((_, index) => (
            <span
              key={`home-dot-${index}`}
              className={`suggestion-dot${index === suggestionIndex ? ' is-active' : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="notif-footer">
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
            <article key={post.id} className="home-post">
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
            <button
              className="home-story-modal__close"
              type="button"
              aria-label="Close story preview"
              onClick={() => setActiveStory(null)}
            >
              <CloseIcon />
            </button>
            <div className="home-story-modal__meta">
              <div className="home-story-modal__name">{activeStory.name}</div>
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
            <div className="home-story-modal__caption">{activeStory.caption}</div>
          </div>
        </div>
      ) : null}
    </MyLayout>
  );
}

type ChatItem = {
  id: string;
  name: string;
  handle: string;
  preview: string;
  time: string;
  avatar: string;
  stats: {
    totalSpent: string;
    lastSpend: string;
    ppv: string;
    tip: string;
    fanType: string;
    cost?: string;
    duration?: string;
    autoRenew?: string;
    nickname?: string;
    notes: Array<{ id: string; text: string; date: string }>;
  };
};

const CHAT_LIST: ChatItem[] = USE_SAMPLE_DATA ? [
  {
    id: 'chat-1',
    name: 'Technological Cow',
    handle: '@technological-cow-21',
    preview: 'hello my sweet filip, so nice to see u here again',
    time: 'now',
    avatar: 'https://dummyimage.com/64x64/0f172a/fff&text=TC',
    stats: {
      totalSpent: '$0.00',
      lastSpend: 'N/A',
      ppv: '$0.00',
      tip: '$0.00',
      fanType: 'Expired',
      autoRenew: '-',
      nickname: '',
      notes: [
        { id: 'n1', text: 'User is often alone at home', date: 'Jan 07' },
        { id: 'n2', text: 'User watches anime like Gate and Berserk', date: 'Jan 07' },
        { id: 'n3', text: 'User practices handicrafts with wood and metal', date: 'Jan 07' },
      ],
    },
  },
  {
    id: 'chat-2',
    name: 'Raven',
    handle: '@raven',
    preview: 'You came back, my heart is warm',
    time: '13:13',
    avatar: 'https://dummyimage.com/64x64/111/fff&text=R',
    stats: {
      totalSpent: '$24.00',
      lastSpend: 'Jan 12',
      ppv: '$12.00',
      tip: '$12.00',
      fanType: 'Active',
      cost: '$12/mo',
      duration: '3 months',
      autoRenew: 'On',
      nickname: 'Raven',
      notes: [
        { id: 'n4', text: 'Enjoys cosplay streams', date: 'Jan 03' },
        { id: 'n5', text: 'Likes weekend drops', date: 'Jan 10' },
      ],
    },
  },
] : [];

export function MyChats() {
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const filteredChats = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return CHAT_LIST;
    return CHAT_LIST.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.handle.toLowerCase().includes(term) ||
        c.preview.toLowerCase().includes(term)
    );
  }, [searchTerm]);

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

          <div className="msg-list">
            {filteredChats.map((chat) => (
              <button
                key={chat.id}
                className={`msg-list__item${selectedChat?.id === chat.id ? ' is-active' : ''}`}
                onClick={() => setSelectedChat(chat)}
              >
                <img className="msg-list__avatar" src={chat.avatar} alt={chat.name} />
                <div className="msg-list__meta">
                  <div className="msg-list__top">
                    <span className="msg-list__name">{chat.name}</span>
                    <span className="msg-list__time">{chat.time}</span>
                  </div>
                  <div className="msg-list__handle">{chat.handle}</div>
                  <div className="msg-list__preview">{chat.preview}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="msg-detail dark">
          {selectedChat ? (
            <div className="msg-thread">
              <div className="msg-thread__header">
                <div className="msg-thread__user">
                  <img src={selectedChat.avatar} alt={selectedChat.name} />
                  <div>
                    <div className="name">{selectedChat.name}</div>
                    <div className="handle">{selectedChat.handle}</div>
                  </div>
                </div>
                <div className="msg-thread__tabs">
                  <button className="is-active">Messages</button>
                  <button>Media</button>
                </div>
              </div>
              <div className="msg-thread__body">
                <div className="msg-bubble other">Hello sweet Mitsuri, how was your weekend?</div>
                <div className="msg-bubble me">
                  weekend was calm, yoga, coffee, cuddles with mochi and some reading... how was
                  yours, mon cher?
                </div>
              </div>
              <div className="msg-thread__composer">
                <button className="pill ghost">Generate message with AI</button>
                <input placeholder="Type a message..." />
              </div>
            </div>
          ) : (
            <div className="msg-detail__text">Select a contact from the list to start chatting.</div>
          )}
        </section>

        <section className="msg-insights">
          {selectedChat ? (
            <ChatInsights chat={selectedChat} />
          ) : (
            <div className="msg-insights__empty">Select a chat to view fan insights.</div>
          )}
        </section>
      </div>
    </MyLayout>
  );
}

function ChatInsights({ chat }: { chat: ChatItem }) {
  return (
    <div className="insights-stack">
      <div className="insight-card">
        <div className="card-title">Spending behavior</div>
        <div className="spend-grid">
          <div className="spend-box">
            <div className="muted small">Total spent</div>
            <div className="spend-amount">{chat.stats.totalSpent}</div>
            <div className="muted tiny">Since Jan 2026</div>
          </div>
          <div className="spend-box">
            <div className="muted small">Last spend</div>
            <div className="spend-amount">{chat.stats.lastSpend}</div>
            <div className="muted tiny">Total PPV</div>
          </div>
        </div>
        <div className="spend-row">
          <span>Total PPV</span>
          <span>{chat.stats.ppv}</span>
        </div>
        <div className="spend-row">
          <span>Total Tip</span>
          <span>{chat.stats.tip}</span>
        </div>
      </div>

      <div className="insight-card">
        <div className="card-title">Subscription</div>
        <div className="sub-row">
          <span>Fan type</span>
          <span className="pill tiny muted">{chat.stats.fanType}</span>
        </div>
        <div className="sub-row">
          <span>Cost</span>
          <span>{chat.stats.cost ?? '-'}</span>
        </div>
        <div className="sub-row">
          <span>Duration</span>
          <span>{chat.stats.duration ?? '-'}</span>
        </div>
        <div className="sub-row">
          <span>Auto-renewal</span>
          <span>{chat.stats.autoRenew ?? '-'}</span>
        </div>
      </div>

      <div className="insight-card">
        <div className="card-title">Nickname</div>
        <div className="nick-box">{chat.stats.nickname ?? '--'}</div>
      </div>

      <div className="insight-card">
        <div className="card-title">Notes</div>
        <div className="note-chips">
          <button className="chip tiny is-active">All</button>
          <button className="chip tiny">Must know</button>
          <button className="chip tiny">Top facts</button>
        </div>
        <div className="note-list">
          {chat.stats.notes.map((note) => (
            <div key={note.id} className="note-card">
              <div className="muted tiny">{note.date}</div>
              <div className="note-text">{note.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MyNotifications() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(3);
  const [suggestions, setSuggestions] = useState(SUGGESTIONS);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [searchPulse, setSearchPulse] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pulseTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pulseTimer.current) {
        window.clearTimeout(pulseTimer.current);
      }
    };
  }, []);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') {
      return NOTIFICATION_ITEMS;
    }

    return NOTIFICATION_ITEMS.filter((item) => item.category === activeTab);
  }, [activeTab]);

  const filteredSuggestions = useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase();
    const source = suggestions;

    if (!trimmed) {
      return source;
    }

    return source.filter((item) => {
      return (
        item.name.toLowerCase().includes(trimmed) ||
        item.handle.toLowerCase().includes(trimmed)
      );
    });
  }, [searchTerm, suggestions]);

  const dotCount = 12;

  const shuffleSuggestions = () => {
    setSuggestions((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setSuggestionIndex(0);
  };

  const resetSuggestions = () => {
    setSearchTerm('');
    setSuggestions(SUGGESTIONS);
    setSuggestionIndex(0);
  };

  const rotateSuggestions = (direction: 'next' | 'prev') => {
    setSuggestions((prev) => {
      if (!prev.length) {
        return prev;
      }
      const next = [...prev];
      if (direction === 'next') {
        const first = next.shift();
        if (first) {
          next.push(first);
        }
      } else {
        const last = next.pop();
        if (last) {
          next.unshift(last);
        }
      }
      return next;
    });
  };

  const cycleDots = (direction: 'next' | 'prev') => {
    setSuggestionIndex((prev) => {
      if (direction === 'next') {
        return (prev + 1) % dotCount;
      }
      return (prev - 1 + dotCount) % dotCount;
    });
    rotateSuggestions(direction);
  };

  const handleSearchIcon = () => {
    searchInputRef.current?.focus();
    if (pulseTimer.current) {
      window.clearTimeout(pulseTimer.current);
    }
    setSearchPulse(true);
    pulseTimer.current = window.setTimeout(() => setSearchPulse(false), 450);
  };

  const toggleFollow = (id: string) => {
    setFollowedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const aside = (
    <div className="notif-sidebar">
      <div className="notif-search-card">
        <div className={`notif-search${searchPulse ? ' is-pulse' : ''}`}>
          <input
            ref={searchInputRef}
            className="notif-search-input"
            type="search"
            placeholder="Search posts"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onFocus={() => setSearchPulse(false)}
          />
          <span className="notif-search-icon">
            <SearchIcon />
          </span>
        </div>
      </div>

      <div className="notif-suggestions">
        <div className="notif-suggestions__header">
          <span>Suggestions</span>
          <div className="notif-suggestions__actions">
            <button
              className="notif-icon-button small"
              type="button"
              aria-label="Shuffle suggestions"
              onClick={shuffleSuggestions}
            >
              <ShuffleIcon />
            </button>
            <button
              className="notif-icon-button small"
              type="button"
              aria-label="Refresh suggestions"
              onClick={resetSuggestions}
            >
              <RefreshIcon />
            </button>
            <button
              className="notif-icon-button small"
              type="button"
              aria-label="Previous suggestions"
              onClick={() => cycleDots('prev')}
            >
              <ChevronLeftIcon />
            </button>
            <button
              className="notif-icon-button small"
              type="button"
              aria-label="Next suggestions"
              onClick={() => cycleDots('next')}
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>
        <div className="notif-suggestions__list">
          {filteredSuggestions.map((item) => {
            const isFollowing = followedIds.includes(item.id);
            return (
              <button
                key={item.id}
                className={`suggestion-card${isFollowing ? ' is-following' : ''}`}
                type="button"
                style={{ backgroundImage: item.gradient }}
                onClick={() => toggleFollow(item.id)}
              >
                {item.badge ? (
                  <span className="suggestion-card__badge">{item.badge}</span>
                ) : null}
                <span className="suggestion-card__menu">
                  <MoreVerticalIcon />
                </span>
                {isFollowing ? (
                  <span className="suggestion-card__follow">Following</span>
                ) : null}
                <div className="suggestion-card__avatar" aria-hidden="true" />
                <div className="suggestion-card__meta">
                  <div className="suggestion-card__name">
                    {item.name}
                    <VerifiedIcon />
                  </div>
                  <div className="suggestion-card__handle">{item.handle}</div>
                </div>
              </button>
            );
          })}
          {!filteredSuggestions.length ? (
            <div className="notif-empty">No suggestions match your search.</div>
          ) : null}
        </div>
        <div className="suggestion-dots" aria-hidden="true">
          {Array.from({ length: dotCount }).map((_, index) => (
            <span
              key={`dot-${index}`}
              className={`suggestion-dot${index === suggestionIndex ? ' is-active' : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="notif-footer">
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
      title="Notifications"
      activeNav="notifications"
      header={null}
      contentClassName="notif-content"
      aside={aside}
    >
      <div className="notif-panel">
        <div className="notif-header">
          <div className="notif-header__left">
            <button
              className="notif-icon-button"
              type="button"
              aria-label="Go back"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon />
            </button>
            <h2 className="notif-header__title">Notifications</h2>
          </div>
          <div className="notif-header__actions">
            <button
              className="notif-icon-button"
              type="button"
              aria-label="Search"
              onClick={handleSearchIcon}
            >
              <SearchIcon />
            </button>
            <button
              className="notif-icon-button"
              type="button"
              aria-label="Settings"
              onClick={() => navigate('/my/settings/notifications')}
            >
              <GearIcon />
            </button>
          </div>
        </div>

        <div className={`notif-tabs${isEditing ? ' is-editing' : ''}`}>
          <div className="notif-tabs__list">
            {NOTIFICATION_TABS.map((tab) => (
              <button
                key={tab.key}
                className={`notif-tab${activeTab === tab.key ? ' is-active' : ''}`}
                type="button"
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            className="notif-icon-button small"
            type="button"
            aria-label="Edit filters"
            aria-pressed={isEditing}
            onClick={() => setIsEditing((prev) => !prev)}
          >
            <PencilIcon />
          </button>
        </div>

        <div className={`notif-body${filteredNotifications.length ? ' has-items' : ''}`}>
          {filteredNotifications.length ? (
            <div className="my-list">
              {filteredNotifications.map((item) => (
                <div key={item.id} className="my-list-item">
                  <div>
                    <div className="my-chat-name">{item.title}</div>
                    <div className="my-muted">{item.detail}</div>
                  </div>
                  <div className="my-chat-time">{item.time}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="notif-empty">No notifications currently!</div>
          )}
        </div>
      </div>
    </MyLayout>
  );
}

export function MyCollections() {
  const [leftTab, setLeftTab] = useState<'lists' | 'bookmarks'>('lists');
  const [rightTab, setRightTab] = useState<'users' | 'posts'>('users');
  const [listItems, setListItems] = useState<Array<{ key: string; label: string }>>(
    DEFAULT_LIST_ITEMS
  );
  const [activeList, setActiveList] = useState<string>('fans');
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'active' | 'expired' | 'restricted' | 'blocked'
  >('active');
  const [postFilter, setPostFilter] = useState<
    'all' | 'photos' | 'videos' | 'audio' | 'other' | 'locked'
  >('all');
  const [bookmarkFilter, setBookmarkFilter] = useState<
    'all' | 'photos' | 'videos' | 'audio' | 'other' | 'locked'
  >('all');
  const [bookmarkSearchActive, setBookmarkSearchActive] = useState(false);
  const [bookmarkLayoutActive, setBookmarkLayoutActive] = useState(false);
  const [bookmarkFilterMenuOpen, setBookmarkFilterMenuOpen] = useState(false);
  const [postLayoutActive, setPostLayoutActive] = useState(false);
  const [postFilterMenuOpen, setPostFilterMenuOpen] = useState(false);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const listInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isCreateListOpen) {
      return;
    }

    listInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCreateListOpen(false);
        setNewListName('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCreateListOpen]);

  const filters = [
    { key: 'all', label: 'All 0' },
    { key: 'active', label: 'Active 0' },
    { key: 'expired', label: 'Expired 0' },
    { key: 'restricted', label: 'Restricted 0' },
    { key: 'blocked', label: 'Blocked 0' },
  ] as const;

  const bookmarkFilters = [
    { key: 'all', label: 'All' },
    { key: 'photos', label: 'Photos' },
    { key: 'videos', label: 'Videos' },
    { key: 'audio', label: 'Audio' },
    { key: 'other', label: 'Other' },
    { key: 'locked', label: 'Locked' },
  ] as const;

  const postFilters = [
    { key: 'all', label: 'All' },
    { key: 'photos', label: 'Photos' },
    { key: 'videos', label: 'Videos' },
    { key: 'audio', label: 'Audio' },
    { key: 'other', label: 'Other' },
    { key: 'locked', label: 'Locked' },
  ] as const;

  const isBookmarks = leftTab === 'bookmarks';
  const isPosts = rightTab === 'posts';
  const activeListLabel =
    listItems.find((item) => item.key === activeList)?.label ?? 'Fans';
  const rightHeader = isBookmarks ? 'All bookmarks' : activeListLabel;
  const saveDisabled = !newListName.trim();

  const closeCreateList = () => {
    setIsCreateListOpen(false);
    setNewListName('');
  };

  const handleCreateListClick = () => {
    if (leftTab !== 'lists') {
      setLeftTab('lists');
    }
    setIsCreateListOpen(true);
  };

  const handleSaveList = () => {
    const trimmed = newListName.trim();
    if (!trimmed) {
      return;
    }

    const key = `list-${trimmed.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

    setListItems((prev) => [...prev, { key, label: trimmed }]);
    setActiveList(key);
    closeCreateList();
  };

  return (
    <MyLayout
      title="Collections"
      activeNav="collections"
      header={null}
      contentClassName="collections-content"
    >
      <div className="collections-shell">
        <section className="collections-panel collections-left">
          <div className="collections-panel__header">
            <div className="collections-panel__title">
              <button
                className="collections-icon-button"
                type="button"
                aria-label="Go back"
                onClick={() => window.history.back()}
              >
                <ArrowLeftIcon />
              </button>
              <h2>Collections</h2>
            </div>
            <div className="collections-panel__actions">
              <button className="collections-icon-button" type="button" aria-label="Search">
                <SearchIcon />
              </button>
              <button
                className="collections-icon-button"
                type="button"
                aria-label="Create list"
                aria-haspopup="dialog"
                onClick={handleCreateListClick}
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          <div className="collections-tabs collections-tabs--split">
            <button
              className={`collections-tab${leftTab === 'lists' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setLeftTab('lists')}
            >
              User lists
            </button>
            <button
              className={`collections-tab${leftTab === 'bookmarks' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setLeftTab('bookmarks')}
            >
              Bookmarks
            </button>
          </div>

          {leftTab === 'lists' ? (
            <>
              <div className="collections-subheader">
                <span>Custom order</span>
                <button className="collections-icon-button small" type="button" aria-label="Sort">
                  <FilterIcon />
                </button>
              </div>

              <div className="collections-list">
                {listItems.map((item) => (
                  <button
                    key={item.key}
                    className={`collections-item${activeList === item.key ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setActiveList(item.key)}
                  >
                    <span className="collections-item__title">{item.label}</span>
                    <span className="collections-item__meta">empty</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="collections-subheader">
                <span>Recent</span>
                <button className="collections-icon-button small" type="button" aria-label="Sort">
                  <FilterIcon />
                </button>
              </div>
              <div className="collections-bookmarks">
                <BookmarkEmptyIcon />
                <div>No bookmarks yet</div>
              </div>
            </>
          )}
        </section>

        <section className="collections-panel collections-right">
          <div className="collections-panel__header">
            <h2>{rightHeader}</h2>
          </div>

          {isBookmarks ? (
            <>
              <div className="collections-subheader">
                <span>Recent</span>
                <div className="collections-subheader__actions">
                  <button
                    className={`collections-icon-button small${
                      bookmarkSearchActive ? ' is-active' : ''
                    }`}
                    type="button"
                    aria-label="Search bookmarks"
                    aria-pressed={bookmarkSearchActive}
                    onClick={() => setBookmarkSearchActive((prev) => !prev)}
                  >
                    <SearchIcon />
                  </button>
                  <button
                    className={`collections-icon-button small${
                      bookmarkLayoutActive ? ' is-active' : ''
                    }`}
                    type="button"
                    aria-label="Layout options"
                    aria-pressed={bookmarkLayoutActive}
                    onClick={() => setBookmarkLayoutActive((prev) => !prev)}
                  >
                    <LayoutIcon />
                  </button>
                  <button
                    className={`collections-icon-button small${
                      bookmarkFilterMenuOpen ? ' is-active' : ''
                    }`}
                    type="button"
                    aria-label="Filter bookmarks"
                    aria-pressed={bookmarkFilterMenuOpen}
                    onClick={() => setBookmarkFilterMenuOpen((prev) => !prev)}
                  >
                    <FilterIcon />
                  </button>
                </div>
              </div>

              <div className="collections-filters">
                {bookmarkFilters.map((item) => (
                  <button
                    key={item.key}
                    className={`collections-pill${
                      bookmarkFilter === item.key ? ' is-active' : ''
                    }`}
                    type="button"
                    onClick={() => setBookmarkFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="collections-empty collections-empty--bookmarks">
                <BookmarkGalleryIcon />
                <div>No bookmarks yet</div>
              </div>
            </>
          ) : (
            <>
              <div className="collections-tabs collections-tabs--split">
                <button
                  className={`collections-tab${rightTab === 'users' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setRightTab('users')}
                >
                  Users
                </button>
                <button
                  className={`collections-tab${rightTab === 'posts' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setRightTab('posts')}
                >
                  Posts
                </button>
              </div>

              <div className="collections-subheader">
                <span>Recent</span>
                <div className="collections-subheader__actions">
                  {isPosts ? (
                    <>
                      <button
                        className={`collections-icon-button small${
                          postLayoutActive ? ' is-active' : ''
                        }`}
                        type="button"
                        aria-label="Layout options"
                        aria-pressed={postLayoutActive}
                        onClick={() => setPostLayoutActive((prev) => !prev)}
                      >
                        <LayoutIcon />
                      </button>
                      <button
                        className={`collections-icon-button small${
                          postFilterMenuOpen ? ' is-active' : ''
                        }`}
                        type="button"
                        aria-label="Filter posts"
                        aria-pressed={postFilterMenuOpen}
                        onClick={() => setPostFilterMenuOpen((prev) => !prev)}
                      >
                        <FilterIcon />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="collections-icon-button small"
                        type="button"
                        aria-label="Search"
                      >
                        <SearchIcon />
                      </button>
                      <button
                        className="collections-icon-button small"
                        type="button"
                        aria-label="Filter"
                      >
                        <FilterIcon />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="collections-filters">
                {isPosts
                  ? postFilters.map((item) => (
                      <button
                        key={item.key}
                        className={`collections-pill${
                          postFilter === item.key ? ' is-active' : ''
                        }`}
                        type="button"
                        onClick={() => setPostFilter(item.key)}
                      >
                        {item.label}
                      </button>
                    ))
                  : filters.map((item) => (
                      <button
                        key={item.key}
                        className={`collections-pill${
                          activeFilter === item.key ? ' is-active' : ''
                        }`}
                        type="button"
                        onClick={() => setActiveFilter(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
              </div>

              {isPosts ? (
                <div className="collections-empty collections-empty--posts">
                  <EmptyPostsIcon />
                  <div>Nothing found</div>
                </div>
              ) : (
                <div className="collections-empty">
                  <EmptyUsersIcon />
                  <div>No users yet</div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {isCreateListOpen ? (
        <div
          className="collections-modal-backdrop"
          role="presentation"
          onClick={closeCreateList}
        >
          <div
            className="collections-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-list-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="create-list-title">Create new list</h3>
            <div className="collections-field">
              <fieldset className="collections-fieldset">
                <legend>List name</legend>
                <input
                  ref={listInputRef}
                  type="text"
                  maxLength={64}
                  value={newListName}
                  onChange={(event) => setNewListName(event.target.value)}
                />
              </fieldset>
              <div className="collections-count">{newListName.length}/64</div>
            </div>
            <div className="collections-modal__actions">
              <button
                className="collections-modal__button cancel"
                type="button"
                onClick={closeCreateList}
              >
                Cancel
              </button>
              <button
                className="collections-modal__button save"
                type="button"
                disabled={saveDisabled}
                onClick={handleSaveList}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </MyLayout>
  );
}

export function MySubscriptionsActive() {
  return (
    <PeopleListPage
      title="Active subscriptions"
      subtitle="Your current subscribers"
      activeNav="subscriptions"
      items={SUBSCRIPTIONS_ACTIVE}
    />
  );
}

export function MySubscriptionsExpired() {
  return (
    <PeopleListPage
      title="Expired subscriptions"
      subtitle="Follow up with previous subscribers"
      activeNav="subscriptions"
      items={SUBSCRIPTIONS_EXPIRED}
    />
  );
}

export function MySubscribersActive() {
  return (
    <PeopleListPage
      title="Active subscribers"
      subtitle="Your top supporters"
      activeNav="collections"
      items={SUBSCRIBERS_ACTIVE}
    />
  );
}

export function MyPayments() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [showRequest, setShowRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    currency: string;
    available_amount_minor: number;
    pending_amount_minor: number;
  } | null>(null);
  const [transferRows, setTransferRows] = useState<PaymentItem[]>([]);

  const formatMoney = (amountMinor: number, currency: string) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100);

  const loadPayments = async () => {
    try {
      setLoading(true);
      setErrorText(null);
      const [nextSummary, transfers] = await Promise.all([
        fetchPayoutSummary(),
        fetchPayoutTransfers(30),
      ]);
      setSummary(nextSummary);
      setTransferRows(
        transfers.map((transfer) => ({
          id: `t-${transfer.id}`,
          label: 'Payout transfer',
          date: new Date(transfer.created_at).toLocaleDateString(),
          amount: formatMoney(transfer.amount_minor, transfer.currency),
          status:
            transfer.status === 'success'
              ? 'paid'
              : transfer.status === 'failed' || transfer.status === 'reversed'
                ? 'failed'
                : 'pending',
        })),
      );
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

  const filtered = useMemo(() => {
    if (filter === 'all') {
      return transferRows.length ? transferRows : PAYMENTS;
    }

    if (filter === 'paid') {
      return (transferRows.length ? transferRows : PAYMENTS).filter((item) => item.status === 'paid');
    }

    return (transferRows.length ? transferRows : PAYMENTS).filter((item) => item.status === 'pending');
  }, [filter, transferRows]);

  return (
    <MyLayout
      title="Payments"
      subtitle="Track payouts, tips, and statements"
      activeNav="more"
      headerActions={
        <button
          className="my-button"
          type="button"
          disabled={requesting}
          onClick={async () => {
            try {
              setRequesting(true);
              setErrorText(null);
              const amountInput = window.prompt('Enter payout amount in major units (leave blank for full balance):');
              const normalized = amountInput?.trim() ?? '';
              const amountMinor =
                normalized.length > 0 ? Math.round(Number(normalized) * 100) : undefined;
              if (normalized.length > 0 && (!Number.isFinite(amountMinor) || amountMinor! <= 0)) {
                setErrorText('Invalid payout amount');
                return;
              }
              await requestCreatorPayout({
                amountMinor,
                reason: 'Creator initiated payout',
              });
              setShowRequest(true);
              await loadPayments();
            } catch (err) {
              console.error(err);
              setErrorText('Payout request failed. Confirm payout destination and available balance.');
            } finally {
              setRequesting(false);
            }
          }}
        >
          Request payout
        </button>
      }
    >
      <div className="my-stat-grid">
        <div className="my-stat">
          <div className="my-muted">Available balance</div>
          <div className="my-chat-name">
            {summary ? formatMoney(summary.available_amount_minor, summary.currency) : '$0.00'}
          </div>
        </div>
        <div className="my-stat">
          <div className="my-muted">Pending payout</div>
          <div className="my-chat-name">
            {summary ? formatMoney(summary.pending_amount_minor, summary.currency) : '$0.00'}
          </div>
        </div>
        <div className="my-stat">
          <div className="my-muted">Transfer count</div>
          <div className="my-chat-name">{transferRows.length}</div>
        </div>
      </div>

      {showRequest ? (
        <div className="my-alert">Payout requested. Processing within 24 hours.</div>
      ) : null}
      {errorText ? <div className="my-alert">{errorText}</div> : null}
      {loading ? <div className="my-muted">Loading payout data...</div> : null}

      <div className="my-card">
        <div className="my-row">
          <div className="my-tabs">
            <button
              className={`my-tab${filter === 'all' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`my-tab${filter === 'pending' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setFilter('pending')}
            >
              Pending
            </button>
            <button
              className={`my-tab${filter === 'paid' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setFilter('paid')}
            >
              Paid
            </button>
          </div>
          <a className="my-button secondary" href="/my/payments/add_card">
            Add card
          </a>
        </div>
        <div className="my-divider" />
        <div className="my-list">
          {filtered.length
            ? filtered.map((item) => (
                <div key={item.id} className="my-list-item">
                  <div>
                    <div className="my-chat-name">{item.label}</div>
                    <div className="my-muted">{item.date}</div>
                  </div>
                  <div className="my-row">
                    <span className="my-pill">{item.status}</span>
                    <strong>{item.amount}</strong>
                  </div>
                </div>
              ))
            : !loading
              ? <div className="my-empty">No payouts yet.</div>
              : null}
        </div>
      </div>
    </MyLayout>
  );
}

export function MyPaymentsAddCard() {
  if (!USE_SAMPLE_DATA) {
    return (
      <MyLayout title="Add card" activeNav="add-card" header={null}>
        <div className="my-card">
          <div className="my-chat-name">Paystack setup required</div>
          <p className="my-muted" style={{ margin: 0 }}>
            Card payments are handled by Paystack. Configure the Paystack inline checkout flow
            before enabling card collection in production.
          </p>
        </div>
      </MyLayout>
    );
  }

  const [form, setForm] = useState({
    country: 'Kenya',
    state: 'Nairobi City',
    address: '',
    city: 'Nairobi',
    email: '',
    cardName: '',
    cardNumber: '',
    expiry: '',
    cvc: '',
    confirmAge: false,
  });
  const [walletPrimary, setWalletPrimary] = useState(false);

  const isComplete =
    form.country.trim() &&
    form.state.trim() &&
    form.address.trim() &&
    form.city.trim() &&
    form.email.trim() &&
    form.cardName.trim() &&
    form.cardNumber.trim() &&
    form.expiry.trim() &&
    form.cvc.trim() &&
    form.confirmAge;

  const aside = (
    <div className="add-card-aside">
      <div className="add-card-card add-card-card--wallet">
        <div className="add-card-wallet">
          <div className="add-card-wallet__amount">$0</div>
          <div className="add-card-wallet__label">Wallet credits</div>
        </div>
        <div className="add-card-wallet__divider" />
        <div className="add-card-wallet__section">
          <div className="add-card-section-title">Add funds to your wallet</div>
          <button className="add-card-wallet-button" type="button">
            Add a payment card
          </button>
          <div className="add-card-toggle">
            <span>Make wallet primary method for rebills</span>
            <button
              className={`add-card-toggle__switch${walletPrimary ? ' is-on' : ''}`}
              type="button"
              aria-pressed={walletPrimary}
              onClick={() => setWalletPrimary((prev) => !prev)}
            />
          </div>
        </div>
      </div>

      <div className="add-card-card">
        <div className="add-card-section-title">Latest transactions</div>
        <div className="add-card-empty">
          <BagIcon />
          <div>No Payments done yet.</div>
        </div>
      </div>
    </div>
  );

  return (
    <MyLayout title="Add card" activeNav="add-card" header={null} aside={aside} contentClassName="add-card-content">
      <div className="add-card-panel">
        <div className="add-card-header">
          <div className="add-card-header__left">
            <button
              className="add-card-icon-button"
              type="button"
              aria-label="Go back"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon />
            </button>
            <h2>Add card</h2>
          </div>
          <button className="add-card-verify" type="button">
            Verify
          </button>
        </div>

        <form className="add-card-body" onSubmit={(event) => event.preventDefault()}>
          <div className="add-card-section">
            <div className="add-card-section-title">Billing details</div>
            <p className="add-card-note">
              Live card payments are processed via Paystack checkout.
            </p>

            <div className="add-card-grid">
              <div className="add-card-field">
                <fieldset className="add-card-fieldset add-card-fieldset--select">
                  <legend>Country</legend>
                  <div className="add-card-select">
                    <span className="add-card-flag" aria-hidden="true" />
                    <select
                      value={form.country}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, country: event.target.value }))
                      }
                    >
                      <option>Kenya</option>
                      <option>South Africa</option>
                      <option>United States</option>
                    </select>
                    <ChevronDownIcon />
                  </div>
                </fieldset>
              </div>
              <div className="add-card-field">
                <fieldset className="add-card-fieldset add-card-fieldset--select">
                  <legend>State / Province</legend>
                  <div className="add-card-select">
                    <select
                      value={form.state}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, state: event.target.value }))
                      }
                    >
                      <option>Nairobi City</option>
                      <option>Mombasa</option>
                      <option>Kisumu</option>
                    </select>
                    <ChevronDownIcon />
                  </div>
                </fieldset>
              </div>
            </div>

            <fieldset className="add-card-fieldset">
              <legend>Address</legend>
              <input
                type="text"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </fieldset>

            <div className="add-card-grid add-card-grid--single">
              <fieldset className="add-card-fieldset">
                <legend>City</legend>
                <input
                  type="text"
                  value={form.city}
                  onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                />
              </fieldset>
            </div>
          </div>

          <div className="add-card-section">
            <div className="add-card-section-title">Card details</div>
            <div className="add-card-grid">
              <fieldset className="add-card-fieldset">
                <legend>E-mail</legend>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </fieldset>
              <fieldset className="add-card-fieldset">
                <legend>Name on the card</legend>
                <input
                  type="text"
                  value={form.cardName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, cardName: event.target.value }))
                  }
                />
              </fieldset>
            </div>

            <fieldset className="add-card-fieldset add-card-fieldset--icon">
              <legend>Card Number</legend>
              <input
                type="text"
                value={form.cardNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cardNumber: event.target.value }))
                }
              />
              <span className="add-card-fieldset__icon" aria-hidden="true">
                <CameraMiniIcon />
              </span>
            </fieldset>
            <a className="add-card-help" href="/my/payments/add_card">
              My card number is longer
            </a>

            <div className="add-card-grid">
              <fieldset className="add-card-fieldset">
                <legend>Expiration</legend>
                <input
                  type="text"
                  placeholder="MM / YY"
                  value={form.expiry}
                  onChange={(event) => setForm((prev) => ({ ...prev, expiry: event.target.value }))}
                />
              </fieldset>
              <fieldset className="add-card-fieldset">
                <legend>CVC</legend>
                <input
                  type="text"
                  value={form.cvc}
                  onChange={(event) => setForm((prev) => ({ ...prev, cvc: event.target.value }))}
                />
              </fieldset>
            </div>
          </div>

          <label className="add-card-checkbox">
            <input
              type="checkbox"
              checked={form.confirmAge}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, confirmAge: event.target.checked }))
              }
            />
            <span>
              Tick here to confirm that you are at least 18 years old and the age of
              majority in your place of residence
            </span>
          </label>

          <div className="add-card-submit-row">
            <button className="add-card-submit" type="button" disabled={!isComplete}>
              Submit
            </button>
          </div>

          <div className="add-card-brands">
            <span className="add-card-brand">Visa</span>
            <span className="add-card-brand">Mastercard</span>
            <span className="add-card-brand">Maestro</span>
            <span className="add-card-brand">Diners Club</span>
            <span className="add-card-brand">Discover</span>
            <span className="add-card-brand">JCB</span>
          </div>
          <div className="add-card-footer">
            Fenix International Limited, 9th Floor, 107 Cheapside, London, EC2V 6DN
            <br />
            Fenix Internet LLC, 1000 N.West Street, Suite 1200, Wilmington, Delaware,
            19801 USA
          </div>
        </form>
      </div>
    </MyLayout>
  );
}

export function PostsCreate() {
  const navigate = useNavigate();
  const [composerProfile, setComposerProfile] = useState(NAV_PROFILE);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState('');
  const [audience, setAudience] = useState<'All fans' | 'Subscribers'>('All fans');
  const [postType, setPostType] = useState<'post' | 'story'>('post');
  const [contentRating, setContentRating] = useState<'sfw' | 'nsfw'>('sfw');
  const [storyDurationHours, setStoryDurationHours] = useState('24');
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const remaining = 1000 - content.length;
  const hasContent = content.trim().length > 0 || attachments.length > 0;
  const hasDraftData =
    content.trim().length > 0 ||
    attachments.length > 0 ||
    isPaid ||
    price.trim().length > 0 ||
    audience !== DEFAULT_CREATOR_DRAFT.audience ||
    postType !== DEFAULT_CREATOR_DRAFT.postType ||
    contentRating !== DEFAULT_CREATOR_DRAFT.contentRating ||
    storyDurationHours !== DEFAULT_CREATOR_DRAFT.storyDurationHours;
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
  }, []);

  useEffect(() => {
    if (USE_SAMPLE_DATA) {
      setComposerProfile(NAV_PROFILE);
      return;
    }

    let cancelled = false;

    const loadComposerProfile = async () => {
      try {
        const profile = await fetchCurrentCreatorProfile();
        if (cancelled || !profile) {
          return;
        }

        setComposerProfile((prev) => ({
          ...prev,
          name: profile.name || prev.name,
          handle: profile.handle,
          avatar: profile.avatar_url ?? '',
          meta: prev.meta,
        }));
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
    };

    if (
      content.trim().length > 0 ||
      isPaid ||
      price.trim().length > 0 ||
      audience !== DEFAULT_CREATOR_DRAFT.audience ||
      postType !== DEFAULT_CREATOR_DRAFT.postType ||
      contentRating !== DEFAULT_CREATOR_DRAFT.contentRating ||
      storyDurationHours !== DEFAULT_CREATOR_DRAFT.storyDurationHours
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
              <span className={`create-post__count${remaining < 50 ? ' is-low' : ''}`}>
                {remaining}
              </span>
            </div>

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

              <div className="my-divider" />

              <div className="create-post__status-note">
                {postType === 'story'
                  ? 'Stories publish immediately and expire automatically after the selected duration.'
                  : 'Posts publish immediately. Scheduling and polls are disabled until the backend workflow is ready.'}
              </div>
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
            </div>
          </aside>
        </div>
      </div>
    </MyLayout>
  );
}

export function MyBanking() {
  const [autoPayout, setAutoPayout] = useState(true);
  const [schedule, setSchedule] = useState('weekly');
  const [transferRequested, setTransferRequested] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'mpesa' | 'bank' | 'paypal'>('mpesa');
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [mpesaName, setMpesaName] = useState('');
  const [mpesaBankCode, setMpesaBankCode] = useState('MPESA');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [bankingError, setBankingError] = useState<string | null>(null);
  const [savedDestination, setSavedDestination] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const account = await fetchPayoutAccount();
        if (!account) return;
        setPayoutMethod(account.provider ?? 'mpesa');
        setSavedDestination(
          account.provider === 'paypal'
            ? account.paypal_email ?? null
            : account.account_number_last4
              ? `****${account.account_number_last4}`
              : null
        );
        if (account.provider === 'paypal') {
          setPaypalEmail(account.paypal_email ?? '');
        } else if (account.provider === 'bank') {
          setBankAccountName(account.account_name ?? '');
          setBankCode(account.bank_code ?? '');
          setBankName(account.bank_name ?? '');
        } else {
          setMpesaName(account.account_name ?? '');
          setMpesaBankCode(account.bank_code ?? 'MPESA');
          setMpesaNumber(account.msisdn_e164 ?? '');
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return (
    <MyLayout title="Banking" subtitle="Manage payout destinations" activeNav="more">
      <div className="my-card">
        <div className="my-row">
          <div>
            <div className="my-chat-name">Payout destination</div>
            <div className="my-muted">
              {savedDestination ? `Active destination ${savedDestination}` : 'No payout destination set'}
            </div>
          </div>
          <button
            className="my-button secondary"
            type="button"
            disabled={savingAccount}
            onClick={async () => {
              try {
                setSavingAccount(true);
                setBankingError(null);
                if (payoutMethod === 'paypal') {
                  const email = paypalEmail.trim().toLowerCase();
                  if (!email) {
                    setBankingError('Enter a valid PayPal email');
                    return;
                  }
                  await upsertPaypalPayoutAccount({ paypalEmail: email, currency: 'KES' });
                  setSavedDestination(email);
                } else if (payoutMethod === 'bank') {
                  const normalizedAccount = bankAccountNumber.replace(/\D/g, '');
                  const normalizedName = bankAccountName.trim();
                  const normalizedBankCode = bankCode.trim().toUpperCase();
                  const normalizedBankName = bankName.trim();
                  if (!normalizedAccount || !normalizedName || !normalizedBankCode) {
                    setBankingError('Enter a valid bank account, name, and bank code');
                    return;
                  }
                  const response = await upsertBankPayoutAccount({
                    accountNumber: normalizedAccount,
                    accountName: normalizedName,
                    bankCode: normalizedBankCode,
                    bankName: normalizedBankName,
                    currency: 'KES',
                  });
                  const masked =
                    response?.payoutAccount?.accountNumberMasked ??
                    `****${normalizedAccount.slice(-4)}`;
                  setSavedDestination(masked);
                } else {
                  const normalizedAccount = mpesaNumber.replace(/\D/g, '');
                  const normalizedName = mpesaName.trim();
                  const normalizedBankCode = mpesaBankCode.trim().toUpperCase() || 'MPESA';
                  if (!normalizedAccount || !normalizedName) {
                    setBankingError('Enter a valid M-PESA number and account name');
                    return;
                  }
                  const response = await upsertMpesaPayoutAccount({
                    accountNumber: normalizedAccount,
                    accountName: normalizedName,
                    bankCode: normalizedBankCode,
                    currency: 'KES',
                  });
                  const masked =
                    response?.payoutAccount?.accountNumberMasked ??
                    `****${normalizedAccount.slice(-4)}`;
                  setSavedDestination(masked);
                }
                setTransferRequested(false);
              } catch (err) {
                console.error(err);
                setBankingError('Could not save payout destination.');
              } finally {
                setSavingAccount(false);
              }
            }}
          >
            {savingAccount ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="my-divider" />
        <div className="my-form">
          <div className="my-row my-row--start">
            <div>
              <div className="my-chat-name">Payout method</div>
              <div className="my-muted">Choose where payouts should be sent.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className={`my-button ${payoutMethod === 'mpesa' ? '' : 'secondary'}`}
                type="button"
                onClick={() => setPayoutMethod('mpesa')}
              >
                M-PESA
              </button>
              <button
                className={`my-button ${payoutMethod === 'bank' ? '' : 'secondary'}`}
                type="button"
                onClick={() => setPayoutMethod('bank')}
              >
                Bank
              </button>
              <button
                className={`my-button ${payoutMethod === 'paypal' ? '' : 'secondary'}`}
                type="button"
                onClick={() => setPayoutMethod('paypal')}
              >
                PayPal
              </button>
            </div>
          </div>
          {payoutMethod === 'paypal' ? (
            <>
              <label className="my-muted">PayPal email</label>
              <input
                className="my-input"
                type="email"
                autoComplete="email"
                value={paypalEmail}
                onChange={(event) => setPaypalEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <div className="my-muted">Payouts follow your balance currency.</div>
            </>
          ) : payoutMethod === 'bank' ? (
            <>
              <label className="my-muted">Bank account number</label>
              <input
                className="my-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={bankAccountNumber}
                onChange={(event) => setBankAccountNumber(event.target.value)}
                placeholder="Account number"
              />
              <label className="my-muted">Account name</label>
              <input
                className="my-input"
                autoComplete="name"
                value={bankAccountName}
                onChange={(event) => setBankAccountName(event.target.value)}
                placeholder="Account holder name"
              />
              <label className="my-muted">Bank code</label>
              <input
                className="my-input"
                autoCapitalize="characters"
                autoComplete="off"
                value={bankCode}
                onChange={(event) => setBankCode(event.target.value.toUpperCase())}
                placeholder="BANK CODE"
              />
              <label className="my-muted">Bank name (optional)</label>
              <input
                className="my-input"
                autoComplete="organization"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                placeholder="e.g. Equity Bank"
              />
            </>
          ) : (
            <>
              <label className="my-muted">M-PESA number</label>
              <input
                className="my-input"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="tel"
                value={mpesaNumber}
                onChange={(event) => setMpesaNumber(event.target.value)}
                placeholder="2547XXXXXXXX"
              />
              <label className="my-muted">Account name</label>
              <input
                className="my-input"
                autoComplete="name"
                value={mpesaName}
                onChange={(event) => setMpesaName(event.target.value)}
                placeholder="Creator full name"
              />
              <label className="my-muted">Bank code</label>
              <input
                className="my-input"
                autoCapitalize="characters"
                autoComplete="off"
                value={mpesaBankCode}
                onChange={(event) => setMpesaBankCode(event.target.value.toUpperCase())}
                placeholder="MPESA"
              />
            </>
          )}
        </div>
        <div className="my-divider" />
        <div className="my-row">
          <div>
            <div className="my-chat-name">Auto payout</div>
            <div className="my-muted">Send balance on a schedule.</div>
          </div>
          <button
            className={`my-toggle__switch${autoPayout ? ' is-on' : ''}`}
            type="button"
            aria-pressed={autoPayout}
            onClick={() => setAutoPayout((prev) => !prev)}
          />
        </div>
        <div className="my-row">
          <div>
            <div className="my-chat-name">Payout schedule</div>
            <div className="my-muted">Choose your cadence.</div>
          </div>
          <select
            className="my-input"
            style={{ maxWidth: 180 }}
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="my-divider" />
        <button
          className="my-button"
          type="button"
          onClick={async () => {
            try {
              setBankingError(null);
              if (payoutMethod === 'paypal') {
                await requestPaypalPayout({ reason: 'Manual transfer now' });
              } else {
                await requestCreatorPayout({
                  reason: 'Manual transfer now',
                  provider: payoutMethod === 'bank' ? 'bank' : 'mpesa',
                });
              }
              setTransferRequested(true);
            } catch (err) {
              console.error(err);
              setBankingError('Transfer request failed.');
            }
          }}
        >
          Transfer now
        </button>
      </div>
      {transferRequested ? (
        <div className="my-alert">Transfer request sent.</div>
      ) : null}
      {bankingError ? <div className="my-alert">{bankingError}</div> : null}
    </MyLayout>
  );
}

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

const NAV_PROFILE = USE_SAMPLE_DATA
  ? {
      name: 'Aiko Mitsuri',
      handle: '@aiko.mitsuri',
      avatar: 'https://i.pravatar.cc/120?img=21',
      meta: { fans: '1 fan', followers: '4 followers' },
    }
  : {
      name: 'Creator',
      handle: '',
      avatar: '',
      meta: null as null | { fans: string; followers: string },
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
  const [navProfile, setNavProfile] = useState(NAV_PROFILE);
  const [isNavPanelOpen, setIsNavPanelOpen] = useState(false);

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
    if (USE_SAMPLE_DATA) {
      setNavProfile(NAV_PROFILE);
      return;
    }

    let cancelled = false;

    const loadNavProfile = async () => {
      try {
        const profile = await fetchCurrentCreatorProfile();
        if (cancelled || !profile) {
          return;
        }

        setNavProfile((prev) => ({
          ...prev,
          name: profile.name || prev.name,
          handle: profile.handle,
          avatar: profile.avatar_url ?? '',
          meta: prev.meta,
        }));
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
            badge="4"
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
            href="/my/payments/add_card"
            label="Wallet"
            icon={<CardIcon />}
            trailing={<span className="wallet-pill">0.00</span>}
            isActive={activeNav === 'add-card'}
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
          {USE_SAMPLE_DATA ? (
            <>
              <NavItem
                href="/news"
                label="What's new"
                icon={<StarIcon />}
                badge="1"
                isActive={false}
                onClick={closeNavPanel}
              />
              <NavItem
                href="/logout"
                label="Log out"
                icon={<LogOutIcon />}
                isActive={false}
                onClick={closeNavPanel}
              />
            </>
          ) : null}
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16l8-8 4 4-8 8H4z" />
      <path d="M14 4l4 4" />
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

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
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
