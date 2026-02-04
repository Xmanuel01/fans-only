import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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

const NOTIFICATION_TABS: Array<{ key: NotificationTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'tags', label: 'Tags' },
  { key: 'comments', label: 'Comments' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'promotions', label: 'Promotions' },
];

const NOTIFICATION_ITEMS: NotificationItem[] = [];

const SUGGESTIONS: SuggestionCard[] = [
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
];

const DEFAULT_LIST_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'fans', label: 'Fans' },
  { key: 'following', label: 'Following' },
  { key: 'restricted', label: 'Restricted' },
  { key: 'blocked', label: 'Blocked' },
];

const SUBSCRIPTIONS_ACTIVE: PersonItem[] = [
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
];

const SUBSCRIPTIONS_EXPIRED: PersonItem[] = [
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
];

const SUBSCRIBERS_ACTIVE: PersonItem[] = [
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
];

const PAYMENTS: PaymentItem[] = [
  { id: 'p-1', label: 'Weekly payout', date: 'Today', amount: '$1,280.00', status: 'pending' },
  { id: 'p-2', label: 'Weekly payout', date: 'Jan 3', amount: '$1,410.00', status: 'paid' },
  { id: 'p-3', label: 'Tips', date: 'Jan 1', amount: '$215.00', status: 'paid' },
  { id: 'p-4', label: 'Chargeback', date: 'Dec 29', amount: '-$42.00', status: 'failed' },
];

export function MyHome() {
  return (
    <MyLayout title="Home" activeNav="home" contentClassName="my-home">
      <div className="home-hero">
        <div className="home-hero__title">Welcome back, Aiko</div>
        <div className="home-hero__subtitle">Jump into your chats or create a new post.</div>
        <div className="home-hero__actions">
          <a className="pill bright" href="/posts/create">
            New Post
          </a>
          <a className="pill ghost" href="/my/chats">
            Go to Chats
          </a>
        </div>
      </div>
      <div className="home-grid">
        <div className="home-card">
          <div className="card-title">Quick links</div>
          <div className="home-links">
            <a href="/my/notifications">Notifications</a>
            <a href="/my/collections/user-lists/subscriptions/active">Earnings & payouts</a>
            <a href="/my/payments/add_card">Wallet</a>
            <a href="/my/settings">Settings</a>
          </div>
        </div>
        <div className="home-card">
          <div className="card-title">Tips</div>
          <p className="muted">Set up auto-renew offers to keep fans engaged.</p>
        </div>
      </div>
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

const CHAT_LIST: ChatItem[] = [
  {
    id: 'chat-1',
    name: 'Technological Cow',
    handle: '@technological-cow-21',
    preview: 'hello my sweet filip, so nice to see u here again 💗',
    time: 'now',
    avatar: 'https://dummyimage.com/64x64/0f172a/fff&text=TC',
    stats: {
      totalSpent: '$0.00',
      lastSpend: 'N/A',
      ppv: '$0.00',
      tip: '$0.00',
      fanType: 'Expired',
      autoRenew: '—',
      nickname: '🪙',
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
    preview: 'You came back 🥹 my heart is warm',
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
      nickname: '💜 Raven',
      notes: [
        { id: 'n4', text: 'Enjoys cosplay streams', date: 'Jan 03' },
        { id: 'n5', text: 'Likes weekend drops', date: 'Jan 10' },
      ],
    },
  },
];

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
                  yours, mon cher? 😊🌸
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
        <div className="nick-box">{chat.stats.nickname ?? '—'}</div>
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

  const filtered = useMemo(() => {
    if (filter === 'all') {
      return PAYMENTS;
    }

    if (filter === 'paid') {
      return PAYMENTS.filter((item) => item.status === 'paid');
    }

    return PAYMENTS.filter((item) => item.status === 'pending');
  }, [filter]);

  return (
    <MyLayout
      title="Payments"
      subtitle="Track payouts, tips, and statements"
      activeNav="more"
      headerActions={
        <button className="my-button" type="button" onClick={() => setShowRequest(true)}>
          Request payout
        </button>
      }
    >
      <div className="my-stat-grid">
        <div className="my-stat">
          <div className="my-muted">Available balance</div>
          <div className="my-chat-name">$3,420.55</div>
        </div>
        <div className="my-stat">
          <div className="my-muted">Pending payout</div>
          <div className="my-chat-name">$1,280.00</div>
        </div>
        <div className="my-stat">
          <div className="my-muted">Tips this week</div>
          <div className="my-chat-name">$215.00</div>
        </div>
      </div>

      {showRequest ? (
        <div className="my-alert">Payout requested. Processing within 24 hours.</div>
      ) : null}

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
          {filtered.map((item) => (
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
          ))}
        </div>
      </div>
    </MyLayout>
  );
}

export function MyPaymentsAddCard() {
  const [form, setForm] = useState({
    country: 'Kenya',
    state: 'Nairobi City',
    address: '',
    city: 'Nairobi',
    email: 'emmanuelhanningtone59@gmail.com',
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
              We are fully compliant with Payment Card Industry Data Security Standards.
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
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [audience, setAudience] = useState('All fans');
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const remaining = 1000 - content.length;
  const hasContent = content.trim().length > 0 || attachments.length > 0;
  const canPublish = hasContent && (!isPaid || price.trim().length > 0);

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
    noticeTimer.current = window.setTimeout(() => setNotice(''), 1800);
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

  const handleSaveDraft = () => {
    if (!hasContent) {
      return;
    }
    showNotice('Draft saved.');
  };

  const handlePublish = () => {
    if (!canPublish) {
      return;
    }
    showNotice(isScheduled ? 'Post scheduled.' : 'Post ready to publish.');
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
    setPollOptions((prev) => [...prev, '']);
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
              disabled={!hasContent}
            >
              Save draft
            </button>
            <button
              className="create-post__primary"
              type="button"
              onClick={handlePublish}
              disabled={!canPublish}
            >
              Post
            </button>
          </div>
        </div>

        {notice ? <div className="create-post__notice">{notice}</div> : null}

        <div className="create-post__grid">
          <section className="my-card create-post__editor">
            <div className="create-post__author">
              <div className="create-post__avatar" aria-hidden="true" />
              <div>
                <div className="create-post__name">Aiko Mitsuri</div>
                <div className="create-post__handle">@aiko.mitsuri</div>
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
              <button className={`create-post__tool${pollEnabled ? ' is-active' : ''}`} type="button" onClick={togglePoll}>
                <PencilIcon />
                Poll
              </button>
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
                <button className="create-post__link" type="button" onClick={addPollOption}>
                  <PlusIcon />
                  Add another option
                </button>
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
                  onChange={(event) => setAudience(event.target.value)}
                >
                  <option>All fans</option>
                  <option>Subscribers</option>
                  <option>Close friends</option>
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
                  <span>Price</span>
                  <input
                    className="my-input"
                    type="number"
                    min="1"
                    placeholder="$4.99"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </label>
              ) : null}

              <div className="my-divider" />

              <div className="my-toggle">
                <div>
                  <div className="create-post__toggle-title">Schedule</div>
                  <div className="my-muted">Post later with a scheduled time.</div>
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
                <span>Paid post</span>
                <strong>{isPaid ? 'Yes' : 'No'}</strong>
              </div>
              {isScheduled ? (
                <div className="create-post__summary-row">
                  <span>Scheduled</span>
                  <strong>{scheduleAt ? scheduleAt : 'Pick a time'}</strong>
                </div>
              ) : null}
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

  return (
    <MyLayout title="Banking" subtitle="Manage payout destinations" activeNav="more">
      <div className="my-card">
        <div className="my-row">
          <div>
            <div className="my-chat-name">Bank account</div>
            <div className="my-muted">Chase **** 2910</div>
          </div>
          <button className="my-button secondary" type="button">
            Update
          </button>
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
          onClick={() => setTransferRequested(true)}
        >
          Transfer now
        </button>
      </div>
      {transferRequested ? (
        <div className="my-alert">Transfer request sent to your bank.</div>
      ) : null}
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

function MyLayout({
  title,
  subtitle,
  activeNav,
  headerActions,
  header,
  aside,
  contentClassName,
  children,
}: MyLayoutProps) {
  useEffect(() => {
    document.body.classList.add('react-page');
    document.body.classList.add('of-my-body');
    document.title = title;

    return () => {
      document.body.classList.remove('of-my-body');
      document.body.classList.remove('react-page');
    };
  }, [title]);

  return (
    <div className="my-shell">
      <aside className="my-nav my-nav--dark">
        <div className="my-nav__profile">
          <img className="my-nav__avatar" src="https://i.pravatar.cc/120?img=21" alt="Profile avatar" />
          <div className="my-nav__identity">
            <div className="name">Aiko Mitsuri</div>
            <div className="handle">@aiko.mitsuri</div>
            <div className="meta">
              <span>1 fan</span> • <span>4 followers</span>
            </div>
          </div>
        </div>

        <nav className="my-nav__menu">
          <NavItem href="/onlyfans" label="Home" icon={<HomeIcon />} isActive={activeNav === 'home'} />
          <NavItem href="/discover" label="Discover" icon={<SearchIcon />} isActive={false} />
          <NavItem
            href="/my/notifications"
            label="Notifications"
            icon={<BellIcon />}
            badge="4"
            isActive={activeNav === 'notifications'}
          />
          <NavItem href="/my/chats" label="Chats" icon={<ChatIcon />} isActive={activeNav === 'messages'} />
          <NavItem href="/my/collections" label="Collections" icon={<GearIcon />} isActive={activeNav === 'collections'} />
          <NavItem
            href="/my/collections/user-lists/subscriptions/active"
            label="Subscriptions"
            icon={<BagIcon />}
            isActive={activeNav === 'subscriptions'}
          />
          <NavItem
            href="/my/payments/add_card"
            label="Wallet"
            icon={<CardIcon />}
            trailing={<span className="wallet-pill">0.00</span>}
            isActive={activeNav === 'add-card'}
          />
        </nav>

        <a className="my-nav__cta" href="/posts/create">
          <span className="my-nav__cta-icon">
            <PlusIcon />
          </span>
          New Post
        </a>

        <div className="my-nav__secondary">
          <NavItem href="/my/settings" label="Settings" icon={<GearIcon />} isActive={activeNav === 'more'} />
          <NavItem href="/news" label="What’s new" icon={<StarIcon />} badge="1" isActive={false} />
          <NavItem href="/logout" label="Log out" icon={<LogOutIcon />} isActive={false} />
        </div>
      </aside>

      <main className="my-main">
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
          <div className="my-main__grid">
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
}: {
  href: string;
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  badge?: string;
  trailing?: ReactNode;
}) {
  return (
    <a className={`my-nav-item${isActive ? ' is-active' : ''}`} href={href}>
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



