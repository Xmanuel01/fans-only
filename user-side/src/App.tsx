import React, { useState, useRef, useEffect } from 'react'
import {
  FiBell,
  FiCompass,
  FiFilter,
  FiGift,
  FiHeart,
  FiHome,
  FiLock,
  FiMessageCircle,
  FiMoreHorizontal,
  FiSearch,
  FiSettings,
  FiShare,
  FiChevronRight,
  FiChevronLeft,
  FiChevronDown,
  FiX,
} from 'react-icons/fi'
import {
  fetchAgeConfirmation,
  markAgeConfirmed,
  logAgeExit,
  logAgeEvent,
  getCurrentSession,
  signOut,
  signInWithProvider,
  submitFeatureRequest,
  initiatePaystackPayment,
  initiateMpesaStkPush,
  fetchRecommendedCreators,
  ensureProfile,
  fetchFeedPosts,
  fetchStories,
  fetchActiveSubscriptions,
  fetchWalletBalance,
  fetchPpvPurchases,
  purchasePpv,
  fetchCreatorProfile,
  createCreatorProfile,
  signInWithPassword,
  signUpWithPassword,
  type CreatorProfile,
  type CreatorCard,
  type UserProfile,
  type FeedPost,
  type WalletBalance,
} from './supabaseClient'
import { env, envStatus, isSupabaseConfigured } from './env'

const CREATOR_APP_URL = env.creatorAppUrl
const isExternalUrl = (value: string | null) => Boolean(value && /^https?:\/\//i.test(value))
const CREATOR_APP_EXTERNAL = isExternalUrl(CREATOR_APP_URL)
const HELP_CENTER_URL = env.helpCenterUrl
const RELEASE_NOTES_URL = env.releaseNotesUrl
const APP_DOWNLOAD_URL = env.appDownloadUrl
const SUPPORT_EMAIL = env.supportEmail
const EXIT_URL = env.exitUrl ?? 'about:blank'
const FEATURED_CREATOR_ID = env.giftCreatorId ?? ''
const DEFAULT_GIFT_AMOUNT_MAJOR =
  typeof env.giftAmountMajor === 'number' && env.giftAmountMajor > 0
    ? env.giftAmountMajor
    : 0
const DEMO_MODE_ENABLED = env.enableDemoMode
const USE_SAMPLE_DATA = env.enableSampleData
const MPESA_STK_ENABLED = env.mpesaStkEnabled
const BASE_URL = import.meta.env.BASE_URL ?? '/'
const assetUrl = (path: string) => `${BASE_URL}${path.replace(/^\/+/, '')}`

const formatKsh = (amountCents?: number | null) => {
  if (!amountCents || amountCents <= 0) return 'Free'
  const value = Math.round(amountCents) / 100
  return `KSh ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
function AuthPrompt({
  onAuthSuccess,
  onDemo,
}: {
  onAuthSuccess: (mode: 'sign_in' | 'sign_up', session: any | null) => void
  onDemo: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'signing-in' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    if (!email || !password) return
    setStatus('signing-in')
    setError(null)
    try {
      const data = await signInWithPassword(email, password)
      onAuthSuccess('sign_in', data?.session ?? null)
      setStatus('idle')
    } catch (err) {
      console.error(err)
      setError('Could not sign in with email and password. Check your credentials.')
      setStatus('error')
    }
  }

  const handleSignUp = async () => {
    if (!email || !password) return
    setStatus('signing-in')
    setError(null)
    try {
      const data = await signUpWithPassword(email, password)
      onAuthSuccess('sign_up', data?.session ?? null)
      setStatus('idle')
    } catch (err) {
      console.error(err)
      setError('Could not create account. Try a different email or password.')
      setStatus('error')
    }
  }

  return (
    <div className="auth-panel">
      <div className="auth-brand">
        <div className="brand-stack">
          <span className="brand-wordmark">SpicyX</span>
          <span className="brand-tagline">Lace and pleasure Haven</span>
        </div>
      </div>
      <h1>Welcome back</h1>
      <p className="auth-lede">Sign in to your account</p>

      <div className="oauth-group">
        <button
          className="oauth-btn"
          onClick={async () => {
            try {
              await signInWithProvider('google')
            } catch (err) {
              console.error(err)
              setError('Google sign-in failed')
            }
          }}
        >
          Continue with Google
        </button>
      </div>

      {DEMO_MODE_ENABLED && (
        <button
          className="auth-btn ghost"
          onClick={() => {
            localStorage.setItem('demoMode', 'true')
            onDemo()
          }}
        >
          Continue as demo (no sign-up)
        </button>
      )}

      <div className="divider-row">
        <span className="line" />
        <span className="or">or</span>
        <span className="line" />
      </div>

      <label className="auth-label">
        Email
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com"
        />
      </label>
      <label className="auth-label">
        Password
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="********"
        />
      </label>
      <button className="auth-btn primary" onClick={handleSignIn} disabled={status === 'signing-in'}>
        {status === 'signing-in' ? 'Signing in...' : 'Sign in'}
      </button>
      <button className="auth-btn ghost" onClick={handleSignUp} disabled={status === 'signing-in'}>
        Create account
      </button>
      {error && <div className="auth-error">{error}</div>}

      <ul className="auth-notes">
        <li>Use your email and password to access your account.</li>
        <li>After sign-in, return here to view content.</li>
      </ul>
    </div>
  )
}

function AuthHero() {
  return (
    <div className="auth-hero">
      <img src={assetUrl('logo.png')} alt="SpicyX" className="hero-logo" />
    </div>
  )
}

function ConfigRequired({ issues }: { issues: string[] }) {
  return (
    <div className="auth-shell">
      <div className="auth-panel single">
        <h2>Configuration required</h2>
        <p>Missing or invalid environment variables. Update the deployment config and reload.</p>
        {issues.length ? (
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

function ConsentBanner({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="consent-banner">
      <div className="consent-text">
        We use cookies for sign-in, security, and analytics. See our Cookies and Privacy policies.
      </div>
      <div className="consent-actions">
        <a href={assetUrl('pages/cookies.html')}>Cookies</a>
        <a href={assetUrl('pages/privacy.html')}>Privacy</a>
        <button onClick={onAccept}>Accept</button>
      </div>
    </div>
  )
}

function AgeGate({
  open,
  sessionPresent,
  onEnter,
  onExit,
}: {
  open: boolean
  sessionPresent: boolean
  onEnter: () => void
  onExit: () => void
}) {
  if (!open) return null
  return (
    <div className="age-overlay">
      <div className="age-backdrop" />
      <div className="age-modal">
        <h2>
          This is an <span className="strong">adults only</span> platform
        </h2>
        <p>The content on this site may include explicit material.</p>
        <p>
          Access is strictly limited to those who are 18 years of age or older, or the age of
          majority in your jurisdiction (whichever is greater).
        </p>
        <p>
          Please use parental controls and filtering tools to prevent minors from accessing
          age-restricted content. If you are under 18, or if such content is illegal in your
          location, please leave now.
        </p>
        <p className="age-links">
          <a href={assetUrl('pages/terms.html')}>Terms</a> -{' '}
          <a href={assetUrl('pages/privacy.html')}>Privacy</a> -{' '}
          <a href={assetUrl('pages/usc2257.html')}>2257</a> -{' '}
          <a href={assetUrl('pages/acceptable-use-policy.html')}>Acceptable Use</a>
        </p>
        <div className="age-actions">
          <button className="pill light full" onClick={onEnter} disabled={!sessionPresent}>
            {sessionPresent ? "I'm 18 or older - enter" : 'Sign in to continue'}
          </button>
          <button className="pill ghost full" onClick={onExit}>
            I'm under 18 - exit
          </button>
        </div>
        <p className="muted small">
          You must be signed in so we can keep an auditable record of age confirmation.
        </p>
      </div>
    </div>
  )
}
const sidebarNav = [
  { icon: FiHome, label: 'Home', key: 'home' },
  { icon: FiCompass, label: 'Explore', key: 'explore' },
  { icon: FiMessageCircle, label: 'Chats', key: 'chats' },
  { icon: FiBell, label: 'Notifications', key: 'notifications' },
  { icon: FiSettings, label: 'Settings', key: 'settings' },
  { icon: FiGift, label: 'Membership', key: 'membership' },
]

const memberships = USE_SAMPLE_DATA
  ? [{ name: 'Brandulate AI', avatar: 'https://i.pravatar.cc/64?img=14' }]
  : []

const visited = USE_SAMPLE_DATA
  ? [
      { name: "Boyo's Medicine", avatar: 'https://i.pravatar.cc/64?img=47' },
      { name: 'Aranaktu', avatar: 'https://i.pravatar.cc/64?img=36' },
    ]
  : []

const sampleProfile = USE_SAMPLE_DATA
  ? {
      name: 'J Koina',
      role: 'Member',
      avatar: 'https://i.pravatar.cc/64?img=21',
    }
  : null

const filters = [
  'All',
  'Anime & cosplay',
  'Gamer girl',
  'Gym baddie',
  'Soft girlfriend aesthetic',
  'Luxury / high-class muse',
  'Beach babe',
  'Yoga/stretch goddess',
  'Shy innocent',
  'AI influencer',
  'ASMR',
  'Girlfriend Experience',
  'POV content',
]

const topics = [
  { label: 'Anime & cosplay', color: ['#6a11cb', '#2575fc'], icon: 'AC' },
  { label: 'Gamer girl', color: ['#1f4037', '#99f2c8'], icon: 'GG' },
  { label: 'Gym baddie', color: ['#f953c6', '#b91d73'], icon: 'GB' },
  { label: 'Soft girlfriend aesthetic', color: ['#ffafbd', '#ffc3a0'], icon: 'SG' },
  { label: 'Luxury / high-class muse', color: ['#5f2c82', '#49a09d'], icon: 'LX' },
  { label: 'Beach babe', color: ['#36d1dc', '#5b86e5'], icon: 'BB' },
  { label: 'Yoga/stretch goddess', color: ['#11998e', '#38ef7d'], icon: 'YG' },
  { label: 'Shy innocent', color: ['#8360c3', '#2ebf91'], icon: 'SH' },
  { label: 'AI influencer', color: ['#0f2027', '#203a43'], icon: 'AI' },
  { label: 'ASMR', color: ['#42275a', '#734b6d'], icon: 'AS' },
  { label: 'Girlfriend Experience', color: ['#ff7e5f', '#feb47b'], icon: 'GFE' },
  { label: 'POV content', color: ['#654ea3', '#eaafc8'], icon: 'POV' },
]

const exploreCreators = USE_SAMPLE_DATA
  ? [
  {
    name: 'ZHX F',
    tag: 'creating VaM plugins, and other...',
    img: 'https://i.pravatar.cc/200?img=12',
  },
  {
    name: 'Nonmom Figures',
    tag: 'Creates Fullsize, Chibi, Bust &...',
    img: 'https://i.pravatar.cc/200?img=65',
  },
  {
    name: 'Shaky AI',
    tag: 'You like what you see? Go ahead...',
    img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Quant Mods',
    tag: 'Creating shaders',
    img: 'https://dummyimage.com/600x600/000/fff&text=quant+V',
  },
  {
    name: 'Gofile',
    tag: 'Creating an innovative cloud...',
    img: 'https://dummyimage.com/600x600/f6c94c/000&text=Gofile',
  },
  {
    name: 'Sonic Ether',
    tag: 'Creating Minecraft Shaders',
    img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
  },
    ]
  : []

const newOnChic = USE_SAMPLE_DATA
  ? [
  {
    name: 'CirqueDuSirois',
    tag: 'The Throbbing Pulse of DFW ...',
    img: 'https://dummyimage.com/400x400/f68c1f/fff&text=Cirque',
  },
  {
    name: 'What Chaos!',
    tag: 'Hockey & pop culture podcast.',
    img: 'https://dummyimage.com/400x400/00a0e9/fff&text=Chaos',
  },
  { name: 'Silky', tag: 'Reactions', img: 'https://dummyimage.com/400x400/d71f26/fff&text=Silky' },
  {
    name: 'FischTank Productions',
    tag: 'Reaction Videos and Live Music...',
    img: 'https://dummyimage.com/400x400/00c087/fff&text=Fish',
  },
  {
    name: 'The Purple Populist Show',
    tag: 'The Purple Populist Show',
    img: 'https://dummyimage.com/400x400/6c3b7c/fff&text=Purple',
  },
  {
    name: 'Political Reality Podcast',
    tag: 'A weekly podcast on politics',
    img: 'https://dummyimage.com/400x400/9c7a30/fff&text=PRP',
  },
    ]
  : []

const topCreatorsBlocks = USE_SAMPLE_DATA
  ? [
  {
    title: 'Wellness',
    creators: [
      {
        name: 'Maintenance Phase',
        tag: 'Creating podcasts!',
        img: 'https://dummyimage.com/360x360/f36ba0/fff&text=??',
      },
      {
        name: 'Zero to Finals',
        tag: 'Medical Education Content',
        img: 'https://dummyimage.com/360x360/0b4b8f/fff&text=Zero',
      },
      {
        name: 'Kya & Co',
        tag: 'Art, Mental Health & Dissociative...',
        img: 'https://dummyimage.com/360x360/71c5e8/fff&text=KYA',
      },
      {
        name: 'Lindsay Braman',
        tag: 'Doodling mental health...',
        img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
      },
      {
        name: 'BracedLife',
        tag: 'Creating medical videos featured...',
        img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      },
      {
        name: 'The Curbsiders Internal Medicine Podcast',
        tag: 'Knowledge Food for your Brain...',
        img: 'https://dummyimage.com/360x360/ffffff/111&text=Curbsiders',
      },
    ],
  },
  {
    title: 'Soccer',
    creators: [
      {
        name: 'Aranaktu',
        tag: 'Creating modding tools for...',
        img: 'https://i.pravatar.cc/360?img=36',
      },
      {
        name: 'FIFER',
        tag: 'Creating The FC26 Realism Mod',
        img: 'https://dummyimage.com/360x360/5234bf/fff&text=FIFER',
      },
      {
        name: "Anth James' EAFC Gameplay Overhaul",
        tag: 'All things gameplay',
        img: 'https://dummyimage.com/360x360/c3002f/fff&text=AJ',
      },
      {
        name: 'KIARIKA',
        tag: 'Improving FIFA/FC and other...',
        img: 'https://dummyimage.com/360x360/000/fff&text=KA',
      },
      {
        name: 'Ultimate Master League',
        tag: 'Best PES 2021 Master League...',
        img: 'https://dummyimage.com/360x360/0042a1/fff&text=UML',
      },
      {
        name: 'Dream Patch',
        tag: 'creando Parches, Mods y Add...',
        img: 'https://dummyimage.com/360x360/8da31c/fff&text=DP',
      },
    ],
  },
    ]
  : []

function PillRow({ active, onSelect }: { active: string; onSelect: (value: string) => void }) {
  return (
    <div className="pill-row">
      {filters.map((f) => (
        <button
          key={f}
          className={`chip ${active === f ? 'active' : ''}`}
          onClick={() => onSelect(f)}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

function AvatarChip({ name, avatar }: { name: string; avatar: string }) {
  return (
    <div className="avatar-chip">
      <img src={avatar} alt={name} />
      <span>{name}</span>
    </div>
  )
}

function SquareCard({
  name,
  tag,
  img,
  priceLabel,
  subscribed,
  onSubscribe,
}: {
  name: string
  tag: string
  img: string
  priceLabel?: string | null
  subscribed?: boolean
  onSubscribe?: () => void
}) {
  return (
    <div className="square-card">
      <img src={img} alt={name} />
      <div className="card-name">{name}</div>
      <div className="card-tag">{tag}</div>
      {priceLabel ? <div className="card-tag">{priceLabel}</div> : null}
      {onSubscribe ? (
        <button className="pill light full" onClick={onSubscribe} disabled={subscribed}>
          {subscribed ? 'Subscribed' : 'Subscribe'}
        </button>
      ) : null}
    </div>
  )
}

function ExploreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="explore-section">
      <div className="section-heading">
        <h3>{title}</h3>
        <div className="section-arrows">
          <FiChevronLeft />
          <FiChevronRight />
        </div>
      </div>
      {children}
    </section>
  )
}

function TopicsGrid() {
  return (
    <section className="topics">
      <div className="section-heading">
        <h3>Explore topics</h3>
      </div>
      <div className="topics-grid">
        {topics.map((t) => (
          <div
            key={t.label}
            className="topic-tile"
            style={{ background: `linear-gradient(135deg, ${t.color[0]}, ${t.color[1]})` }}
          >
            <span>{t.label}</span>
            <div className="topic-icon">{t.icon}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ExplorePage({
  filter,
  onSelectFilter,
  activeSubscriptions,
  onSubscribe,
}: {
  filter: string
  onSelectFilter: (value: string) => void
  activeSubscriptions: string[]
  onSubscribe: (creator: CreatorCard) => void
}) {
  const [recommendedCreators, setRecommendedCreators] = useState<CreatorCard[]>([])
  const [recommendedLoading, setRecommendedLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const subscriptionSet = new Set(activeSubscriptions)

  useEffect(() => {
    setRecommendedLoading(true)
    ;(async () => {
      const data = await fetchRecommendedCreators({
        searchTerm,
        category: filter,
        limit: 12,
      })
      setRecommendedCreators(data)
      setRecommendedLoading(false)
    })()
  }, [searchTerm, filter])
  return (
    <div className="explore">
      <div className="search-bar">
        <FiSearch size={18} />
        <input
          placeholder="Search creators or topics"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <PillRow active={filter} onSelect={onSelectFilter} />

      <div className="recent-row">
        <h3>Recently visited</h3>
        <div className="recent-chips">
          {visited.length ? (
            visited.map((v) => (
              <AvatarChip key={v.name} name={v.name} avatar={v.avatar} />
            ))
          ) : (
            <div className="muted">No recent visits yet.</div>
          )}
        </div>
      </div>

      {exploreCreators.length ? (
        <ExploreSection title="Creators for you">
          <div className="card-row">
            {exploreCreators.map((c) => (
              <SquareCard key={c.name} {...c} />
            ))}
          </div>
        </ExploreSection>
      ) : null}

      <ExploreSection title="Popular this week">
        <div className="list-grid">
          {recommendedLoading && <p className="muted">Loading top creators...</p>}
          {!recommendedLoading && !recommendedCreators.length && (
            <p className="muted">No popular creators yet.</p>
          )}
          {!recommendedLoading &&
            recommendedCreators.map((c) => (
              <SquareCard
                key={c.id}
                name={c.display_name}
                tag={c.category ?? c.handle}
                img={c.avatar_url ?? assetUrl('logo.png')}
                priceLabel={formatKsh(c.subscription_price_cents ?? 0)}
                subscribed={subscriptionSet.has(c.id)}
                onSubscribe={() => onSubscribe(c)}
              />
            ))}
        </div>
      </ExploreSection>

      <TopicsGrid />

      {newOnChic.length ? (
        <ExploreSection title="New on SpicyX">
          <div className="card-row">
            {newOnChic.map((c) => (
              <SquareCard key={c.name} {...c} />
            ))}
          </div>
        </ExploreSection>
      ) : null}

      {topCreatorsBlocks.map((block) => (
        <ExploreSection key={block.title} title={`Top creators  ${block.title}`}>
          <div className="card-row">
            {block.creators.map((c) => (
              <SquareCard key={c.name} {...c} />
            ))}
          </div>
        </ExploreSection>
      ))}
    </div>
  )
}

const chatRooms = USE_SAMPLE_DATA
  ? [
      {
        name: 'Chat Room for Free Members',
        subtitle: 'Agree to guidelines to join',
        avatar: 'https://i.pravatar.cc/80?img=18',
        unread: true,
      },
      {
        name: 'Brandulate Lab',
        subtitle: 'New drops today',
        avatar: 'https://i.pravatar.cc/80?img=14',
        unread: false,
      },
    ]
  : []

function ChatsPage() {
  const [tab, onTabChange] = useState<'direct' | 'group'>('group')
  return (
    <div className="chats-page">
      <aside className="chat-list">
        <div className="chat-header">
          <h2>Chats</h2>
          <div className="chat-actions">
            <FiFilter />
            <FiMoreHorizontal />
          </div>
        </div>

        <div className="chat-tabs">
          <button
            className={`chat-tab ${tab === 'direct' ? 'active' : ''}`}
            onClick={() => onTabChange('direct')}
          >
            Direct messages
          </button>
          <button
            className={`chat-tab ${tab === 'group' ? 'active' : ''}`}
            onClick={() => onTabChange('group')}
          >
            Group chats
          </button>
        </div>

        <div className="chat-cards">
          {chatRooms.length ? (
            chatRooms.map((room) => (
              <div key={room.name} className="chat-card">
                <img src={room.avatar} alt={room.name} />
                <div className="chat-meta">
                  <div className="chat-name">{room.name}</div>
                  <div className="chat-sub">{room.subtitle}</div>
                </div>
                {room.unread && <span className="chat-dot" />}
              </div>
            ))
          ) : (
            <div className="muted">No chats yet.</div>
          )}
        </div>
      </aside>

      <main className="chat-main">
        {chatRooms.length ? (
          <>
            <div className="chat-topbar">
              <div className="chat-breadcrumb">
                <span className="muted">{chatRooms[0]?.name}</span>
                <span className="muted">-</span>
                <span className="muted">View Chat Details</span>
              </div>
              <div className="chat-avatars">
                {chatRooms.slice(0, 2).map((room) => (
                  <img key={room.name} src={room.avatar} alt={room.name} />
                ))}
              </div>
            </div>

            <div className="chat-guidelines">
              <h3>Chat guidelines</h3>
              <p>
                Welcome to community chats, a place where creators and members can chat and
                connect. Anyone who joins a chat can see the full history and whenever you join any
                chat, others with access will be able to see that you've joined.
              </p>
              <p>
                SpicyX's <span className="link-like">Community Guidelines</span> apply to all
                community spaces. To keep chats safe and friendly, please:
              </p>
              <ul>
                <li>Be kind and welcoming</li>
                <li>Always be respectful</li>
                <li>Don't spam</li>
                <li>Don't share private or personal info</li>
              </ul>
              <button className="agree-btn">I agree</button>
            </div>
          </>
        ) : (
          <div className="chat-guidelines">
            <h3>No chats yet</h3>
            <p>When you join a creator chat or start a conversation, it will show up here.</p>
          </div>
        )}
      </main>
    </div>
  )
}

function NotificationsPage() {
  return (
    <div className="notifications-page">
      <h2>Notifications</h2>
      <div className="notifications-empty">
        <div className="notif-icon">
          <FiBell size={24} />
        </div>
        <div className="notif-title">No notifications yet</div>
        <div className="notif-sub">
          You'll get updates when people join your community, interact with your posts, and more.
        </div>
      </div>
    </div>
  )
}

const settingsTabs = [
  'Basics',
  'Account',
  'Email notifications',
  'Memberships',
  'Billing history',
  'More',
]

function SettingsTabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <div className="settings-tabs">
      {settingsTabs.map((t) => (
        <button
          key={t}
          className={`settings-tab ${active === t ? 'active' : ''}`}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
      <div className="settings-more-caret">
        <FiChevronDown />
      </div>
    </div>
  )
}

function BasicsCard({ session, userProfile }: { session: any; userProfile: UserProfile | null }) {
  if (!session) {
    return (
      <div className="settings-card">
        <div className="muted">Sign in to manage your profile details.</div>
      </div>
    )
  }

  const displayName =
    session.user.user_metadata?.full_name ??
    session.user.user_metadata?.name ??
    session.user.email?.split('@')[0] ??
    ''
  const email = session.user.email ?? ''
  const avatar = session.user.user_metadata?.avatar_url ?? assetUrl('logo.png')

  return (
    <div className="settings-card">
      <div className="profile-avatar">
        <img src={avatar} alt={displayName || 'Profile'} />
        <div className="lock-pill mini">
          <FiLock size={12} />
        </div>
      </div>
      <label className="input-label">Display name</label>
      <input className="text-input" value={displayName} placeholder="Your name" readOnly />
      <label className="input-label">Username</label>
      <input
        className="text-input"
        value={userProfile?.username ?? ''}
        placeholder="Not set"
        readOnly
      />
      <label className="input-label">Email</label>
      <input className="text-input" value={email} placeholder="you@example.com" readOnly />
      <label className="input-label">Country of Residence</label>
      <div className="select-input">
        <span>Select your country...</span>
        <FiChevronDown />
      </div>
      <button className="primary-btn">Save</button>
    </div>
  )
}

function AccountCard({ session }: { session: any }) {
  if (!session) {
    return (
      <div className="settings-card">
        <div className="muted">Sign in to manage account security settings.</div>
      </div>
    )
  }

  const provider = session.user.app_metadata?.provider ?? ''
  const providerLabel = provider ? `Signed in with ${provider}` : 'Sign-in provider'
  const providerMark = provider ? provider.slice(0, 1).toUpperCase() : '?'

  return (
    <div className="settings-stack">
      <div className="settings-card">
        <div className="card-title">Login</div>
        <div className="notice brown">
          Manage your sign-in methods and password from account security settings.
        </div>
        <div className="login-row">
          <div className="login-provider">
            <span role="img" aria-label="provider">
              {providerMark}
            </span>
            <div>
              <div className="name">{providerLabel}</div>
              <div className="muted">Manage providers in your account settings.</div>
            </div>
          </div>
          <button className="link-like" disabled title="Manage providers in account settings">
            Manage
          </button>
        </div>
        <div className="twofactor">
          <span>Two-factor authentication</span>
          <span className="muted">i</span>
        </div>
        <div className="button-row">
          <button className="pill dark">Use text message</button>
          <button className="pill dark">Use authenticator app</button>
        </div>
      </div>

      <div className="settings-card">
        <div className="card-title">Shipping address</div>
        <div className="field-grid two">
          <div>
            <label className="input-label">Country</label>
            <div className="select-input">
              <span>Select a country...</span>
              <FiChevronDown />
            </div>
          </div>
        </div>
        <label className="input-label">Full Name</label>
        <input className="text-input" placeholder="Full Name" />
        <div className="field-grid two">
          <div>
            <label className="input-label">Address</label>
            <input className="text-input" />
          </div>
          <div>
            <label className="input-label">Apt, suite, etc...</label>
            <input className="text-input" />
          </div>
        </div>
        <div className="field-grid two">
          <div>
            <label className="input-label">City</label>
            <input className="text-input" />
          </div>
          <div>
            <label className="input-label">Postal Code</label>
            <input className="text-input" />
          </div>
        </div>
        <div className="field-grid two">
          <div>
            <label className="input-label">State</label>
            <div className="select-input">
              <span>Select a state...</span>
              <FiChevronDown />
            </div>
          </div>
          <div />
        </div>
        <div className="button-right">
          <button className="pill dark">Add address</button>
        </div>
      </div>

      <div className="settings-card">
        <div className="card-title">Social links</div>
        {['YouTube', 'Instagram', 'Twitter', 'Facebook', 'Twitch', 'TikTok'].map((s) => (
          <div key={s} className="social-row">
            <span>{s}</span>
            <button className="pill light">Connect</button>
          </div>
        ))}
      </div>

      <div className="settings-card">
        <div className="card-title">Language preference</div>
        <div className="select-input wide">
          <span>English (United States)</span>
          <FiChevronDown />
        </div>
      </div>

      <div className="settings-card">
        <div className="card-title">Currency preference</div>
        <div className="pill ghost">Currency: not set</div>
      </div>

      <div className="settings-card">
        <div className="card-title">Privacy</div>
        <div className="privacy-row">
          <div>
            <div className="name">Full public profile</div>
            <div className="muted">
              Your public profile always includes your name, photo, the date you joined SpicyX, and
              any social links or other information you add.
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" />
            <span className="slider" />
          </label>
        </div>
        <div className="privacy-row">
          <div>
            <div className="name">Community profile</div>
            <div className="muted">
              Shows more information than your public profile and is visible to people in
              communities you're both part of.
            </div>
          </div>
          <label className="switch checked">
            <input type="checkbox" defaultChecked />
            <span className="slider" />
          </label>
        </div>
      </div>
    </div>
  )
}

function EmailNotificationsCard() {
  const toggles = [
    'Comment replies and reactions',
    'Posts and Quips from creators you may like',
    'Product updates and community announcements',
    'Member newsletter',
    'Special offers and promotions',
    'General creator updates',
  ]
  const primaryMembership = memberships[0]
  return (
    <div className="settings-stack">
      <div className="settings-card">
        <div className="card-title">General</div>
        <div className="toggle-group">
          {toggles.map((t) => (
            <div key={t} className="toggle-row">
              <span>{t}</span>
              <label className="switch checked">
                <input type="checkbox" defaultChecked />
                <span className="slider" />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-card horizontal">
        {primaryMembership ? (
          <>
            <div className="brand-block">
              <img src={primaryMembership.avatar} alt={primaryMembership.name} />
              <div>
                <div className="name">{primaryMembership.name}</div>
                <div className="muted">Membership</div>
              </div>
            </div>
            <FiChevronRight />
          </>
        ) : (
          <div className="muted">No memberships yet.</div>
        )}
      </div>
    </div>
  )
}

function MembershipsCard() {
  const primaryMembership = memberships[0]
  return (
    <div className="settings-card horizontal">
      {primaryMembership ? (
        <>
          <div className="brand-block">
            <img src={primaryMembership.avatar} alt={primaryMembership.name} />
            <div>
              <div className="name">{primaryMembership.name}</div>
              <div className="muted">Membership</div>
            </div>
          </div>
          <FiMoreHorizontal />
        </>
      ) : (
        <div className="muted">No memberships yet.</div>
      )}
    </div>
  )
}

function BillingHistoryCard({
  walletBalance,
  walletTopupAmount,
  walletTopupPhone,
  onTopupAmountChange,
  onTopupPhoneChange,
  onTopup,
}: {
  walletBalance: WalletBalance | null
  walletTopupAmount: string
  walletTopupPhone: string
  onTopupAmountChange: (value: string) => void
  onTopupPhoneChange: (value: string) => void
  onTopup: () => void
}) {
  return (
    <div className="settings-card">
      <div className="card-title">Wallet balance</div>
      <div className="muted small">Use your wallet to unlock PPV content instantly.</div>
      <div className="payment-row" style={{ marginTop: 12 }}>
        <div className="payment-label">Available</div>
        <div className="payment-value">
          {formatKsh(walletBalance?.available_amount_minor ?? 0)}
        </div>
      </div>
      <div className="field-grid two" style={{ marginTop: 12 }}>
        <div>
          <label className="input-label">Top up amount (KES)</label>
          <input
            className="text-input"
            type="number"
            min="1"
            value={walletTopupAmount}
            onChange={(event) => onTopupAmountChange(event.target.value)}
          />
        </div>
        {MPESA_STK_ENABLED ? (
          <div>
            <label className="input-label">M-PESA phone</label>
            <input
              className="text-input"
              type="tel"
              inputMode="numeric"
              placeholder="2547XXXXXXXX"
              value={walletTopupPhone}
              onChange={(event) => onTopupPhoneChange(event.target.value)}
            />
          </div>
        ) : null}
        <div className="button-right">
          <button className="pill light" onClick={onTopup}>
            {MPESA_STK_ENABLED ? 'Top up via M-PESA' : 'Top up wallet'}
          </button>
        </div>
      </div>
      <div className="divider" style={{ margin: '16px 0' }} />
      <div className="muted small">No payment history to display yet.</div>
    </div>
  )
}

function SettingsPage({
  tab,
  onTabChange,
  paymentRef,
  connectedRef,
  onPaymentClick,
  onConnectClick,
  session,
  userProfile,
  walletBalance,
  walletTopupAmount,
  walletTopupPhone,
  onTopupAmountChange,
  onTopupPhoneChange,
  onTopup,
}: {
  tab: string
  onTabChange: (t: string) => void
  paymentRef: React.RefObject<HTMLDivElement | null>
  connectedRef: React.RefObject<HTMLDivElement | null>
  onPaymentClick: () => void
  onConnectClick: (app: string) => void
  session: any
  userProfile: UserProfile | null
  walletBalance: WalletBalance | null
  walletTopupAmount: string
  walletTopupPhone: string
  onTopupAmountChange: (value: string) => void
  onTopupPhoneChange: (value: string) => void
  onTopup: () => void
}) {
  const [localTab, setLocalTab] = useState(tab)

  useEffect(() => setLocalTab(tab), [tab])

  const changeTab = (t: string) => {
    setLocalTab(t)
    onTabChange(t)
  }
  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <SettingsTabs active={localTab} onChange={changeTab} />
      {localTab === 'Basics' && <BasicsCard session={session} userProfile={userProfile} />}
      {localTab === 'Account' && <AccountCard session={session} />}
      {localTab === 'Email notifications' && <EmailNotificationsCard />}
      {localTab === 'Memberships' && <MembershipsCard />}
      {localTab === 'Billing history' && (
        <BillingHistoryCard
          walletBalance={walletBalance}
          walletTopupAmount={walletTopupAmount}
          walletTopupPhone={walletTopupPhone}
          onTopupAmountChange={onTopupAmountChange}
          onTopupPhoneChange={onTopupPhoneChange}
          onTopup={onTopup}
        />
      )}
      {localTab === 'More' && (
        <div className="settings-stack">
          <div className="settings-card" ref={paymentRef}>
            <div className="card-title">Payment methods</div>
            <button className="pill ghost" onClick={onPaymentClick}>
              Add Payment Method
            </button>
            <div className="muted small">You do not currently have any payment methods.</div>
          </div>
          <div className="settings-card" ref={connectedRef}>
            <div className="card-title">Connected apps</div>
            {['Discord', 'Vimeo', 'Spotify'].map((app) => (
              <div key={app} className="connect-row">
                <div>
                  <div className="name">{app}</div>
                  <div className="muted">Connect to {app} for extra perks.</div>
                </div>
                <button className="pill light" onClick={() => onConnectClick(app)}>
                  Connect
                </button>
              </div>
            ))}
          </div>
          <div className="settings-card">
            <div className="card-title">Blocked users</div>
            <div className="muted">You haven't blocked any users.</div>
          </div>
          <div className="settings-card">
            <div className="card-title">Policies & Compliance</div>
            <div className="footer-links">
              <a href={assetUrl('pages/terms.html')}>Terms</a>
              <a href={assetUrl('pages/privacy.html')}>Privacy</a>
              <a href={assetUrl('pages/cookies.html')}>Cookies</a>
              <a href={assetUrl('pages/dmca.html')}>DMCA</a>
              <a href={assetUrl('pages/acceptable-use-policy.html')}>Acceptable Use</a>
              <a href={assetUrl('pages/usc2257.html')}>2257</a>
            </div>
            <div className="footer-note">Age verification required. Adults 18+ only.</div>
          </div>
        </div>
      )}
    </div>
  )
}

const coverImages = USE_SAMPLE_DATA
  ? [
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
    ]
  : []

const membershipProfile = USE_SAMPLE_DATA
  ? {
      name: 'Brandulate AI',
      tagline: 'AI-Powered Artistry',
      avatar: 'https://i.pravatar.cc/200?img=14',
    }
  : null

const membershipPost = USE_SAMPLE_DATA
  ? {
      title: '2601_ZIT_BSY_Q4 + Q5 (C60)',
      date: 'January 14',
      likes: 0,
      comments: 0,
      image:
        'https://images.unsplash.com/photo-1601758124206-0c3c5eff8cd5?auto=format&fit=crop&w=1400&q=80',
    }
  : null

const membershipCardImg = USE_SAMPLE_DATA
  ? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=600&q=80'
  : ''

const tiers = USE_SAMPLE_DATA
  ? [
      {
        name: 'Creative Access',
        price: 'KSh 500 / month',
        perks: [
          'Thriving community of AI artists',
          'Premium resources: LoRAs, workflows, tutorials',
          'Exclusive tips & tricks for AI automation',
          'Early previews of upcoming models',
        ],
      },
      {
        name: 'Checkpoint Access',
        price: 'KSh 800 / month',
        recommended: true,
        perks: [
          'Instant access to premium AI checkpoints',
          'Full Discord access to discuss and collaborate',
          'Exclusive tips & automation techniques',
          'Behind-the-scenes updates & early previews',
        ],
      },
    ]
  : []

function MembershipPage({
  tab,
  onTabChange,
  upgradeRef,
  tiersRef,
  giftRef,
  onUpgrade,
  onGift,
  onGoPayment,
}: {
  tab: 'Membership' | 'Gift Creator'
  onTabChange: (t: 'Membership' | 'Gift Creator') => void
  upgradeRef: React.RefObject<HTMLDivElement | null>
  tiersRef: React.RefObject<HTMLDivElement | null>
  giftRef: React.RefObject<HTMLDivElement | null>
  onUpgrade: () => void
  onGift: () => void
  onGoPayment: () => void
}) {
  if (!membershipProfile || !membershipPost) {
    return (
      <div className="membership-page">
        <div className="card">
          <h3>Memberships coming soon</h3>
          <p className="muted">Set up creators and tiers to enable memberships.</p>
        </div>
      </div>
    )
  }
  const primaryTier = tiers.find((tier) => tier.recommended) ?? tiers[0] ?? null

  return (
    <div className="membership-page">
      {coverImages.length ? (
        <div className="cover-grid">
          {coverImages.map((src, i) => (
            <img key={i} src={src} alt="" />
          ))}
        </div>
      ) : null}

      <div className="profile-bar">
        <img
          className="profile-avatar-lg"
          src={membershipProfile.avatar}
          alt={membershipProfile.name}
        />
        <div className="profile-text">
          <div className="profile-name-lg">{membershipProfile.name}</div>
          <div className="muted">{membershipProfile.tagline}</div>
        </div>
        <div className="profile-actions">
          <button className="pill light">Upgrade</button>
          <button className="pill ghost">
            <FiShare />
          </button>
        </div>
      </div>

      <div className="profile-tabs">
        {['Home', 'Posts', 'Collections', 'Chats', 'Gift Creator', 'Membership', 'About'].map(
          (t) => (
            <button
              key={t}
              className={`profile-tab ${
                (tab === 'Membership' && t === 'Membership') ||
                (tab === 'Gift Creator' && t === 'Gift Creator')
                  ? 'active'
                  : ''
              }`}
              onClick={() => onTabChange(t === 'Gift Creator' ? 'Gift Creator' : 'Membership')}
            >
              {t}
            </button>
          )
        )}
      </div>

      {tab === 'Membership' && (
        <>
          <div className="upgrade-card" ref={upgradeRef}>
            <div className="offer-pill">Offer ends Jan 27</div>
            <div className="upgrade-body">
              <div>
                <div className="upgrade-title">
                  Upgrade your membership with 50% off your first month
                </div>
                <div className="muted small">Memberships start at KSh 500/month. Terms apply.</div>
              </div>
              <button className="pill light" onClick={onUpgrade}>
                Upgrade
              </button>
            </div>
          </div>

          <div className="latest-post">
            <div className="section-heading">
              <h3>Latest post</h3>
            </div>
            <div className="latest-card">
              <img src={membershipPost.image} alt={membershipPost.title} />
              <div className="latest-info">
                <div className="name">{membershipPost.title}</div>
                <div className="muted">{membershipPost.date}</div>
                <div className="inline-actions">
                  <FiHeart /> <span>{membershipPost.likes}</span>
                  <FiMessageCircle /> <span>{membershipPost.comments}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="your-membership">
            <h3>Your membership</h3>
            <div className="membership-card">
              <div>
                <div className="name">Free</div>
                <div className="muted">Get updates on new public and free exclusive posts.</div>
              </div>
              {membershipCardImg ? <img src={membershipCardImg} alt="Membership card" /> : null}
              <div className="membership-actions">
                <div className="muted small">
                  Upgrade your membership to get access to your membership card.
                </div>
                <button className="pill light">Upgrade</button>
              </div>
            </div>
          </div>

          <div className="gift-section">
            <div className="section-heading">
              <h3>Gift membership</h3>
            </div>
            <div className="gift-card">
              <div>
                <div className="name">Share the gift of membership</div>
                <div className="muted">Give friends & family access to exclusive work.</div>
              </div>
              <img src={membershipPost.image} alt="Gift" />
              <button className="pill light" onClick={onGift}>
                Gift
              </button>
            </div>
          </div>

          <div className="upgrade-membership">
            <div className="section-heading">
              <h3>Upgrade your membership</h3>
            </div>
            <div className="tiers-grid" ref={tiersRef}>
              {tiers.length ? (
                tiers.map((tier) => (
                  <div key={tier.name} className="tier-card">
                    {tier.recommended && <div className="badge">Recommended by creator</div>}
                    <div className="name">{tier.name}</div>
                    <div className="price">{tier.price}</div>
                    <button className="pill light full" onClick={onUpgrade}>
                      Upgrade
                    </button>
                    <ul>
                      {tier.perks.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <div className="muted">No tiers available yet.</div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'Gift Creator' && (
        <div className="gift-creator" ref={giftRef}>
          <div className="gift-left">
            <img src={membershipPost.image} alt="Gift preview" />
            <button className="link" type="button">
              Add custom message (optional)
            </button>
          </div>
          <div className="gift-right">
            <div className="gift-title">
              <FiGift />
              <div>
                <div className="name">Create a gift</div>
                <div className="muted">
                  Give anyone access to {membershipProfile.name}&apos;s exclusive work and community
                  by gifting them a membership.
                </div>
              </div>
            </div>

            <div className="gift-section-box">
              <div className="muted small">Tier selection</div>
              <div className="select-input">
                <span>
                  {primaryTier
                    ? `${primaryTier.name} (${primaryTier.price})`
                    : 'No tiers available'}
                </span>
                <FiChevronDown />
              </div>
            </div>

            <div className="gift-section-box">
              <div className="muted small">Membership duration</div>
              <div className="duration-option active">
                <span>1 year</span>
                <div className="pill ghost">save 25%</div>
                <div className="muted">KSh 7,200</div>
              </div>
              <div className="duration-option">
                <span>1 month</span>
                <div className="muted">KSh 800</div>
              </div>
              <div className="duration-option">
                <span>Custom months</span>
                <div className="custom-months">
                  <input className="text-input small-input" value="3" readOnly />
                </div>
              </div>
            </div>

            <div className="gift-section-box">
              <div className="muted small">Quantity</div>
              <input className="text-input" value="1" readOnly />
            </div>

            <div className="muted small">
              After payment, you&apos;ll get a shareable gift link. Activate the membership before it
              expires.
            </div>

            <button className="primary-btn full" onClick={onGoPayment}>
              Go to payment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function HomePage({
  onSeeAll,
  session,
  creatorProfile,
  onCreateCreator,
  creatorLoading,
  posts,
  stories,
  onSubscribe,
  activeSubscriptions,
  ppvPurchases,
  onUnlockPost,
}: {
  onSeeAll: () => void
  session: any
  creatorProfile: CreatorProfile | null
  onCreateCreator: (handle: string) => void
  creatorLoading: boolean
  posts: FeedPost[]
  stories: FeedPost[]
  onSubscribe: (creator: FeedPost['creator']) => void
  activeSubscriptions: string[]
  ppvPurchases: number[]
  onUnlockPost: (post: FeedPost) => void
}) {
  const defaultHandle =
    session?.user?.user_metadata?.username ??
    session?.user?.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '') ??
    ''
  const [handle, setHandle] = useState(defaultHandle)
  const displayName =
    session?.user?.user_metadata?.full_name ??
    session?.user?.user_metadata?.name ??
    session?.user?.email?.split('@')[0] ??
    'Your feed'
  const subscriptionSet = new Set(activeSubscriptions)
  const ppvPurchaseSet = new Set(ppvPurchases)
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null)
  const [activeStoryMediaIndex, setActiveStoryMediaIndex] = useState(0)
  const [postMediaIndexById, setPostMediaIndexById] = useState<Record<number, number>>({})
  const activeStory =
    activeStoryIndex === null || activeStoryIndex < 0 || activeStoryIndex >= stories.length
      ? null
      : stories[activeStoryIndex]

  const getAccessState = (post: FeedPost) => {
    const isSubscribed = subscriptionSet.has(post.creator.id)
    const hasPpvAccess = ppvPurchaseSet.has(post.id)
    const isSubscriberOnly = post.visibility === 'subscribers'
    const isPpv = post.visibility === 'ppv'
    const isLocked = (isSubscriberOnly && !isSubscribed) || (isPpv && !hasPpvAccess)
    const showSubscribe =
      post.creator.subscription_price_cents &&
      post.creator.subscription_price_cents > 0 &&
      !isSubscribed
    return {
      isSubscribed,
      isPpv,
      isLocked,
      showSubscribe,
    }
  }

  useEffect(() => {
    if (activeStoryIndex === null) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [activeStoryIndex])

  useEffect(() => {
    if (activeStoryIndex === null) {
      setActiveStoryMediaIndex(0)
    }
  }, [activeStoryIndex])

  useEffect(() => {
    if (activeStoryIndex === null || !stories.length) {
      return
    }

    if (activeStoryIndex >= stories.length) {
      setActiveStoryIndex(stories.length - 1)
      setActiveStoryMediaIndex(0)
    }
  }, [activeStoryIndex, stories.length])

  useEffect(() => {
    if (!activeStory) {
      return
    }

    if (!activeStory.media.length) {
      setActiveStoryMediaIndex(0)
      return
    }

    if (activeStoryMediaIndex >= activeStory.media.length) {
      setActiveStoryMediaIndex(0)
    }
  }, [activeStory, activeStoryMediaIndex])

  useEffect(() => {
    if (activeStoryIndex === null) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveStoryIndex(null)
        return
      }

      if (event.key === 'ArrowRight') {
        setActiveStoryIndex((prev) => {
          if (prev === null || !stories.length) {
            return prev
          }
          return (prev + 1) % stories.length
        })
        setActiveStoryMediaIndex(0)
        return
      }

      if (event.key === 'ArrowLeft') {
        setActiveStoryIndex((prev) => {
          if (prev === null || !stories.length) {
            return prev
          }
          return (prev - 1 + stories.length) % stories.length
        })
        setActiveStoryMediaIndex(0)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeStoryIndex, stories.length])

  const moveStory = (direction: 1 | -1) => {
    setActiveStoryIndex((prev) => {
      if (prev === null || !stories.length) {
        return prev
      }
      return (prev + direction + stories.length) % stories.length
    })
    setActiveStoryMediaIndex(0)
  }

  return (
    <>
      <main className="feed">
        <header className="feed-header">
          <div className="feed-user">
            <div>
              <div className="name">{displayName}</div>
              <div className="muted">
                {posts.length
                  ? 'Latest updates from creators you follow.'
                  : 'Follow creators to see updates.'}
              </div>
            </div>
          </div>
          <div className="feed-actions">
            <button className="see-all" onClick={onSeeAll}>
              See all
            </button>
            <a
              className="see-all"
              href={CREATOR_APP_URL}
              target={CREATOR_APP_EXTERNAL ? '_blank' : undefined}
              rel={CREATOR_APP_EXTERNAL ? 'noreferrer' : undefined}
            >
              Creator dashboard
            </a>
          </div>
        </header>

        {stories.length ? (
          <section className="card">
            <div className="section-heading">
              <h3>Stories</h3>
            </div>
            <div className="card-row">
              {stories.map((story, index) => {
                const storyMedia = story.media[0]
                const hasVideo = Boolean(
                  storyMedia && storyMedia.mime_type?.startsWith('video')
                )
                return (
                  <button
                    key={story.id}
                    type="button"
                    className="avatar-chip story-chip"
                    onClick={() => {
                      setActiveStoryIndex(index)
                      setActiveStoryMediaIndex(0)
                    }}
                    aria-label={`Open ${story.creator.display_name} story`}
                  >
                    <img src={story.creator.avatar_url ?? assetUrl('logo.png')} alt={story.creator.display_name} />
                    <span>{story.creator.display_name}</span>
                    {hasVideo ? <span className="story-chip__type">Video</span> : null}
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}

        {session && (
          <section className="card creator-cta">
            <div className="creator-cta-header">
              <div>
                <div className="muted small">Monetize</div>
                <h3>{creatorProfile ? 'Creator profile ready' : 'Become a creator'}</h3>
                <p className="muted">
                  Claim your handle to unlock the creator dashboard. You can update details later.
                </p>
              </div>
              <a
                className="pill ghost"
                href={CREATOR_APP_URL}
                target={CREATOR_APP_EXTERNAL ? '_blank' : undefined}
                rel={CREATOR_APP_EXTERNAL ? 'noreferrer' : undefined}
              >
                Open dashboard
              </a>
            </div>
            {!creatorProfile ? (
              <div className="creator-cta-body">
                <label className="creator-label">
                  Handle
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase())}
                    placeholder="your-handle"
                    maxLength={30}
                    pattern="^[a-z0-9_]+$"
                  />
                </label>
                <button
                  className="primary-btn"
                  onClick={() => onCreateCreator(handle)}
                  disabled={!handle || creatorLoading}
                >
                  {creatorLoading ? 'Saving...' : 'Claim handle'}
                </button>
              </div>
            ) : (
              <div className="creator-cta-body">
                <div className="muted">Handle</div>
                <div className="creator-handle">@{creatorProfile.handle}</div>
                <div className="creator-links">
                  <a
                    className="primary-btn"
                    href={CREATOR_APP_URL}
                    target={CREATOR_APP_EXTERNAL ? '_blank' : undefined}
                    rel={CREATOR_APP_EXTERNAL ? 'noreferrer' : undefined}
                  >
                    Open dashboard
                  </a>
                  <a
                    className="ghost-btn"
                    href={`/creator/${creatorProfile.handle}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View public profile
                  </a>
                </div>
              </div>
            )}
          </section>
        )}

        {posts.length ? (
          posts.map((post) => {
            const { isSubscribed, isPpv, isLocked, showSubscribe } = getAccessState(post)
            const mediaCount = post.media.length
            const mediaIndex = Math.max(
              0,
              Math.min(postMediaIndexById[post.id] ?? 0, Math.max(mediaCount - 1, 0))
            )
            const media = mediaCount ? post.media[mediaIndex] : null
            const isVideo = media?.mime_type?.startsWith('video')

            return (
              <section key={post.id} className={`card ${media ? 'media-card' : 'text-card'}`}>
                <div className="card-header">
                  <img
                    src={post.creator.avatar_url ?? assetUrl('logo.png')}
                    alt={post.creator.display_name}
                  />
                  <div>
                    <div className="name">{post.creator.display_name}</div>
                    <div className="muted">@{post.creator.handle}</div>
                  </div>
                  <FiMoreHorizontal className="spacer" />
                  {showSubscribe ? (
                    <button className="pill light" onClick={() => onSubscribe(post.creator)}>
                      Subscribe {formatKsh(post.creator.subscription_price_cents)}
                    </button>
                  ) : isSubscribed ? (
                    <span className="muted small">Subscribed</span>
                  ) : null}
                </div>

                {media ? (
                  <div className={`media-wrapper ${isLocked ? 'locked' : ''}`}>
                    {media.url ? (
                      isVideo ? (
                        <video className="media-hero" controls preload="metadata" playsInline>
                          <source src={media.url} type={media.mime_type ?? 'video/mp4'} />
                        </video>
                      ) : (
                        <img src={media.url} alt={post.title} />
                      )
                    ) : (
                      <div className="media-placeholder">Preview unavailable</div>
                    )}
                    {mediaCount > 1 ? (
                      <>
                        <button
                          className="media-nav media-nav--prev"
                          type="button"
                          aria-label="Previous media"
                          onClick={() =>
                            setPostMediaIndexById((prev) => ({
                              ...prev,
                              [post.id]: (mediaIndex - 1 + mediaCount) % mediaCount,
                            }))
                          }
                        >
                          <FiChevronLeft />
                        </button>
                        <button
                          className="media-nav media-nav--next"
                          type="button"
                          aria-label="Next media"
                          onClick={() =>
                            setPostMediaIndexById((prev) => ({
                              ...prev,
                              [post.id]: (mediaIndex + 1) % mediaCount,
                            }))
                          }
                        >
                          <FiChevronRight />
                        </button>
                        <div className="media-count">
                          {mediaIndex + 1}/{mediaCount}
                        </div>
                      </>
                    ) : null}
                    {isLocked ? (
                      <div className="media-lock-overlay">
                        <div className="media-lock-tag">
                          <FiLock size={14} />
                          {isPpv ? 'Pay-per-view' : 'Subscribers only'}
                        </div>
                        <div className="lock-title">
                          {isPpv ? 'Unlock this post' : 'Subscribe to view'}
                        </div>
                        <div className="lock-subtitle">
                          {isPpv
                            ? `Price: ${formatKsh(post.price_cents ?? 0)}`
                            : 'Support the creator to access this content.'}
                        </div>
                        <div className="media-lock-actions">
                          {isPpv ? (
                            <button className="primary-btn" onClick={() => onUnlockPost(post)}>
                              Unlock for {formatKsh(post.price_cents ?? 0)}
                            </button>
                          ) : showSubscribe ? (
                            <button className="pill light" onClick={() => onSubscribe(post.creator)}>
                              Subscribe {formatKsh(post.creator.subscription_price_cents)}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : isLocked ? (
                  <div className="media-wrapper locked">
                    <div className="media-placeholder">
                      <div className="media-lock-tag">
                        <FiLock size={14} />
                        {post.visibility === 'ppv' ? 'Pay-per-view' : 'Subscribers only'}
                      </div>
                      <div className="lock-title">Content locked</div>
                      <div className="lock-subtitle">
                        {post.visibility === 'ppv'
                          ? `Price: ${formatKsh(post.price_cents ?? 0)}`
                          : 'Subscribe to unlock.'}
                      </div>
                      {post.visibility === 'ppv' ? (
                        <button className="primary-btn" onClick={() => onUnlockPost(post)}>
                          Unlock for {formatKsh(post.price_cents ?? 0)}
                        </button>
                      ) : showSubscribe ? (
                        <button className="pill light" onClick={() => onSubscribe(post.creator)}>
                          Subscribe {formatKsh(post.creator.subscription_price_cents)}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="card-body">
                  <p className="title">{post.title}</p>
                  {post.body ? <p className="muted">{post.body}</p> : null}
                </div>
              </section>
            )
          })
        ) : (
          <section className="card">
            <div className="card-body">
              <p className="title">No posts yet</p>
              <p className="muted">Follow creators to see new content in your feed.</p>
            </div>
          </section>
        )}
      </main>

      {activeStory ? (
        <div
          className="story-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeStory.creator.display_name} story`}
          onClick={() => setActiveStoryIndex(null)}
        >
          <div className="story-modal__panel" onClick={(event) => event.stopPropagation()}>
            <header className="story-modal__header">
              <div>
                <div className="name">{activeStory.creator.display_name}</div>
                <div className="muted">@{activeStory.creator.handle}</div>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close story"
                onClick={() => setActiveStoryIndex(null)}
              >
                <FiX size={20} />
              </button>
            </header>

            {(() => {
              const { isPpv, isLocked, showSubscribe } = getAccessState(activeStory)
              const mediaCount = activeStory.media.length
              const mediaIndex = Math.max(
                0,
                Math.min(activeStoryMediaIndex, Math.max(mediaCount - 1, 0))
              )
              const media = mediaCount ? activeStory.media[mediaIndex] : null
              const isVideo = media?.mime_type?.startsWith('video')
              return (
                <div className={`media-wrapper story-modal__media ${isLocked ? 'locked' : ''}`}>
                  {media ? (
                    media.url ? (
                      isVideo ? (
                        <video className="media-hero" controls preload="metadata" playsInline autoPlay>
                          <source src={media.url} type={media.mime_type ?? 'video/mp4'} />
                        </video>
                      ) : (
                        <img src={media.url} alt={activeStory.title || 'Story'} />
                      )
                    ) : (
                      <div className="media-placeholder">Story unavailable</div>
                    )
                  ) : (
                    <div className="media-placeholder">No story media</div>
                  )}
                  {mediaCount > 1 ? (
                    <>
                      <button
                        className="media-nav media-nav--prev"
                        type="button"
                        aria-label="Previous story media"
                        onClick={() =>
                          setActiveStoryMediaIndex((prev) => (prev - 1 + mediaCount) % mediaCount)
                        }
                      >
                        <FiChevronLeft />
                      </button>
                      <button
                        className="media-nav media-nav--next"
                        type="button"
                        aria-label="Next story media"
                        onClick={() =>
                          setActiveStoryMediaIndex((prev) => (prev + 1) % mediaCount)
                        }
                      >
                        <FiChevronRight />
                      </button>
                      <div className="media-count">
                        {mediaIndex + 1}/{mediaCount}
                      </div>
                    </>
                  ) : null}
                  {isLocked ? (
                    <div className="media-lock-overlay">
                      <div className="media-lock-tag">
                        <FiLock size={14} />
                        {isPpv ? 'Pay-per-view' : 'Subscribers only'}
                      </div>
                      <div className="lock-title">
                        {isPpv ? 'Unlock this story' : 'Subscribe to view'}
                      </div>
                      <div className="lock-subtitle">
                        {isPpv
                          ? `Price: ${formatKsh(activeStory.price_cents ?? 0)}`
                          : 'Support the creator to access this story.'}
                      </div>
                      <div className="media-lock-actions">
                        {isPpv ? (
                          <button className="primary-btn" onClick={() => onUnlockPost(activeStory)}>
                            Unlock for {formatKsh(activeStory.price_cents ?? 0)}
                          </button>
                        ) : showSubscribe ? (
                          <button
                            className="pill light"
                            onClick={() => onSubscribe(activeStory.creator)}
                          >
                            Subscribe {formatKsh(activeStory.creator.subscription_price_cents)}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })()}

            <footer className="story-modal__footer">
              <div className="title">{activeStory.title}</div>
              {activeStory.body ? <p className="muted">{activeStory.body}</p> : null}
              {stories.length > 1 ? (
                <div className="story-modal__switchers">
                  <button className="pill ghost" type="button" onClick={() => moveStory(-1)}>
                    Previous story
                  </button>
                  <button className="pill ghost" type="button" onClick={() => moveStory(1)}>
                    Next story
                  </button>
                </div>
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function App() {
  const [page, setPage] = useState<
    | 'home'
    | 'explore'
    | 'chats'
    | 'notifications'
    | 'settings'
    | 'membership'
    | 'news'
    | 'help'
    | 'features'
  >('explore')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [filter, setFilter] = useState(filters[0])
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [settingsTab, setSettingsTab] = useState('Basics')
  const [membershipTab, setMembershipTab] = useState<'Membership' | 'Gift Creator'>('Membership')
  const [toast, setToast] = useState<string | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark')
  const [featureText, setFeatureText] = useState('')
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null)
  const [creatorLoading, setCreatorLoading] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [storyPosts, setStoryPosts] = useState<FeedPost[]>([])
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([])
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null)
  const [walletTopupAmount, setWalletTopupAmount] = useState('1000')
  const [walletTopupPhone, setWalletTopupPhone] = useState('')
  const [ppvPurchases, setPpvPurchases] = useState<number[]>([])
  const isAuthed = demoMode || Boolean(session)
  const displayName =
    session?.user?.user_metadata?.full_name ??
    session?.user?.user_metadata?.name ??
    session?.user?.email?.split('@')[0] ??
    ''
  const profileAvatar =
    session?.user?.user_metadata?.avatar_url ?? userProfile?.avatar_url ?? assetUrl('logo.png')
  const sidebarName = userProfile?.display_name || userProfile?.username || displayName || 'Member'
  const sidebarProfile = isAuthed
    ? {
        name: sidebarName,
        role: demoMode ? 'Demo' : 'Member',
        avatar: profileAvatar,
      }
    : sampleProfile
  const envIssues = [
    ...envStatus.missing.map((name) => `Missing ${name}`),
    ...envStatus.invalid.map((name) => `Invalid ${name}`),
  ]

  const paymentRef = useRef<HTMLDivElement | null>(null)
  const connectedRef = useRef<HTMLDivElement | null>(null)
  const upgradeRef = useRef<HTMLDivElement | null>(null)
  const tiersRef = useRef<HTMLDivElement | null>(null)
  const giftRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (envStatus.hasIssues) {
      setSessionChecked(true)
      return
    }
    const demo = DEMO_MODE_ENABLED && localStorage.getItem('demoMode') === 'true'
    if (demo) {
      setDemoMode(true)
      setSessionChecked(true)
      setAgeConfirmed(true)
      return
    }
    localStorage.removeItem('demoMode')
    ;(async () => {
      const s = await getCurrentSession()
      setSession(s)
      setSessionChecked(true)
    })()
  }, [])

  useEffect(() => {
    if (envStatus.hasIssues) return
    if (!session?.user?.id) {
      setCreatorProfile(null)
      return
    }
    ;(async () => {
      setCreatorLoading(true)
      const prof = await fetchCreatorProfile(session.user.id)
      setCreatorProfile(prof)
      setCreatorLoading(false)
    })()
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues || demoMode) return
    if (!session?.user?.id) {
      setUserProfile(null)
      return
    }
    ;(async () => {
      try {
        const prof = await ensureProfile()
        if (prof) setUserProfile(prof)
      } catch (err) {
        console.error(err)
      }
    })()
  }, [session, demoMode])

  useEffect(() => {
    if (envStatus.hasIssues) return
    if (!session?.user?.id) {
      setActiveSubscriptions([])
      return
    }
    let isMounted = true
    const loadSubscriptions = async () => {
      const subs = await fetchActiveSubscriptions()
      if (isMounted) setActiveSubscriptions(subs)
    }
    loadSubscriptions()
    const interval = window.setInterval(loadSubscriptions, 30_000)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues) return
    if (!session?.user?.id) {
      setWalletBalance(null)
      return
    }
    ;(async () => {
      const balance = await fetchWalletBalance()
      setWalletBalance(balance)
    })()
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues) return
    if (!session?.user?.id || !ageConfirmed) {
      setPpvPurchases([])
      return
    }
    ;(async () => {
      const purchases = await fetchPpvPurchases()
      setPpvPurchases(purchases)
    })()
  }, [session, ageConfirmed])

  useEffect(() => {
    if (envStatus.hasIssues) return
    if (!session?.user?.id || !ageConfirmed) {
      setFeedPosts([])
      setStoryPosts([])
      return
    }
    ;(async () => {
      const [posts, stories] = await Promise.all([fetchFeedPosts(), fetchStories()])
      setFeedPosts(posts)
      setStoryPosts(stories)
    })()
  }, [session, ageConfirmed])

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent')
    if (consent === 'accepted') setConsentAccepted(true)
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system')
      setTheme(storedTheme)
  }, [])

  useEffect(() => {
    if (envStatus.hasIssues || ageConfirmed || (!session && !demoMode)) return
    ;(async () => {
      const remote = await fetchAgeConfirmation()
      if (remote) {
        setAgeConfirmed(true)
      }
    })()
  }, [ageConfirmed, session])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])


  const scrollToRef = (ref: React.RefObject<HTMLElement | null>) => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const openExternal = (url: string | null, label: string) => {
    if (!url) {
      setToast(`${label} is not configured`)
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openSupportEmail = () => {
    if (!SUPPORT_EMAIL) {
      setToast('Support email is not configured')
      return
    }
    window.location.href = `mailto:${SUPPORT_EMAIL}`
  }

  const handleUpgradeClick = () => {
    if (!isAuthed) return setToast('Sign in to manage memberships')
    setPage('membership')
    setMembershipTab('Membership')
    setToast('Opening upgrade options')
    scrollToRef(upgradeRef)
  }

  const handleGiftClick = () => {
    if (!isAuthed) return setToast('Sign in to send gifts')
    setPage('membership')
    setMembershipTab('Gift Creator')
    setToast('Opening gift creator')
    scrollToRef(giftRef)
  }

  const handlePaymentMethods = () => {
    if (!isAuthed) return setToast('Sign in to manage payment methods')
    setPage('settings')
    setSettingsTab('More')
    setToast('Opening payment methods')
    scrollToRef(paymentRef)
  }

  const handleGiftCheckout = async () => {
    if (!session?.user?.email) {
      setToast('Sign in to continue to payment')
      return
    }
    if (!FEATURED_CREATOR_ID) {
      setToast('Payment is not configured: missing creator id')
      return
    }
    if (!DEFAULT_GIFT_AMOUNT_MAJOR || DEFAULT_GIFT_AMOUNT_MAJOR <= 0) {
      setToast('Payment is not configured: missing amount')
      return
    }

    try {
      setToast('Preparing secure checkout...')
      const result = await initiatePaystackPayment({
        email: session.user.email,
        creatorId: FEATURED_CREATOR_ID,
        amountMajor: DEFAULT_GIFT_AMOUNT_MAJOR,
        currency: 'KES',
        type: 'tip',
        metadata: {
          source: 'gift_creator',
        },
        channels: ['mobile_money'],
      })
      if (!result.authorization_url) {
        throw new Error('Checkout URL missing')
      }
      window.location.href = result.authorization_url
    } catch (err) {
      console.error(err)
      setToast('Could not start payment. Try again in a moment.')
    }
  }

  const handleWalletTopup = async () => {
    if (!session?.user?.email) {
      setToast('Sign in to top up your wallet')
      return
    }
    const amountMajor = Number(walletTopupAmount)
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      setToast('Enter a valid top up amount')
      return
    }
    try {
      if (MPESA_STK_ENABLED) {
        if (!walletTopupPhone.trim()) {
          setToast('Enter your M-PESA phone number')
          return
        }
        setToast('Sending M-PESA prompt...')
        const result = await initiateMpesaStkPush({
          phone: walletTopupPhone.trim(),
          amountMajor,
        })
        setToast(result.customerMessage ?? 'M-PESA prompt sent. Complete on your phone.')
        return
      }
      setToast('Redirecting to secure wallet top up...')
      const result = await initiatePaystackPayment({
        email: session.user.email,
        amountMajor,
        currency: 'KES',
        type: 'wallet_topup',
        metadata: { source: 'wallet_topup' },
        channels: ['mobile_money'],
      })
      if (!result.authorization_url) {
        throw new Error('Checkout URL missing')
      }
      window.location.href = result.authorization_url
    } catch (err) {
      console.error(err)
      setToast('Could not start wallet top up.')
    }
  }

  const handleSubscribe = async (creator: {
    id: string
    subscription_price_cents?: number | null
    subscription_currency?: string | null
  }) => {
    if (!session?.user?.email) {
      setToast('Sign in to subscribe')
      return
    }
    const priceCents = creator.subscription_price_cents ?? 0
    if (priceCents <= 0) {
      setToast('This creator is free to follow')
      return
    }
    try {
      setToast('Redirecting to secure checkout...')
      const result = await initiatePaystackPayment({
        email: session.user.email,
        creatorId: creator.id,
        amountMajor: priceCents / 100,
        currency: creator.subscription_currency ?? 'KES',
        type: 'subscription',
        metadata: { source: 'subscribe' },
        channels: ['mobile_money'],
      })
      if (!result.authorization_url) {
        throw new Error('Checkout URL missing')
      }
      window.location.href = result.authorization_url
    } catch (err) {
      console.error(err)
      setToast('Could not start subscription checkout.')
    }
  }

  const handleUnlockPost = async (post: FeedPost) => {
    if (!session?.user?.id) {
      setToast('Sign in to unlock this post')
      return
    }
    const priceCents = post.price_cents ?? 0
    if (priceCents <= 0) {
      setToast('This post is not priced')
      return
    }
    const currentBalance = walletBalance?.available_amount_minor ?? 0
    if (currentBalance < priceCents) {
      setToast('Insufficient wallet balance. Top up to continue.')
      return
    }
    try {
      const result = await purchasePpv(post.id)
      if (result?.purchase_id) {
        setPpvPurchases((prev) => Array.from(new Set([...prev, post.id])))
        if (typeof result.new_balance_minor === 'number') {
          setWalletBalance((prev) =>
            prev
              ? { ...prev, available_amount_minor: result.new_balance_minor }
              : { available_amount_minor: result.new_balance_minor, pending_amount_minor: 0, currency: 'KES' }
          )
        }
        setToast('Post unlocked')
      }
    } catch (err: any) {
      console.error(err)
      const message = err?.message?.includes('insufficient')
        ? 'Insufficient wallet balance. Top up to continue.'
        : 'Could not unlock post.'
      setToast(message)
    }
  }

  const handleConnectedApp = (app: string) => {
    if (!isAuthed) return setToast('Sign in to connect apps')
    setPage('settings')
    setSettingsTab('More')
    setToast(`Opening ${app} connect`)
    scrollToRef(connectedRef)
  }

  const handleMembershipEntry = () => {
    if (!isAuthed) return setToast('Sign in to view memberships')
    setPage('membership')
    setMembershipTab('Membership')
    scrollToRef(upgradeRef)
    setToast('Opening memberships')
  }

  const handleCreateCreator = async (handle: string) => {
    if (!session?.user?.id) {
      setToast('Sign in first')
      return
    }
    const normalized = handle.trim().toLowerCase()
    if (!normalized) {
      setToast('Enter a handle to continue')
      return
    }
    if (!/^[a-z0-9_]+$/.test(normalized)) {
      setToast('Handle can only use letters, numbers, and underscores')
      return
    }
    if (normalized.length > 30) {
      setToast('Handle must be 30 characters or less')
      return
    }
    const displayName =
      session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Creator'
    try {
      setCreatorLoading(true)
      const created = await createCreatorProfile({
        userId: session.user.id,
        handle: normalized,
        displayName,
      })
      setCreatorProfile(created)
      setToast('Creator profile created. Open dashboard to continue.')
    } catch (err) {
      console.error(err)
      setToast('Handle already taken or invalid. Try another.')
    } finally {
      setCreatorLoading(false)
    }
  }

  const handleVisitedClick = (name: string) => {
    if (!session) return setToast('Sign in to view creator details')
    setPage('membership')
    setToast(`Opening ${name}`)
    scrollToRef(upgradeRef)
  }

  const handleGetApp = () => openExternal(APP_DOWNLOAD_URL, 'App download link')
  const handleLogout = async () => {
    await signOut()
    setSession(null)
    setAgeConfirmed(false)
    setUserProfile(null)
    setFeedPosts([])
    setStoryPosts([])
    setActiveSubscriptions([])
  }

  if (envStatus.hasIssues) {
    return <ConfigRequired issues={envIssues} />
  }

  if (!sessionChecked) {
    return (
      <div className="auth-shell">
        <div className="auth-panel single">
          <p>Checking session...</p>
        </div>
      </div>
    )
  }

  if (!session && !demoMode) {
    return (
      <div className="auth-shell">
        <AuthPrompt
          onAuthSuccess={(mode, authSession) => {
            if (authSession) {
              setSession(authSession)
              setSessionChecked(true)
              setToast('Signed in successfully')
              return
            }
            if (mode === 'sign_up') {
              setToast('Check your email to confirm your account')
              return
            }
            setToast('Sign-in complete. Refresh if your session does not appear.')
          }}
          onDemo={() => {
            if (!DEMO_MODE_ENABLED) return
            localStorage.setItem('demoMode', 'true')
            setDemoMode(true)
            setAgeConfirmed(true)
            setSessionChecked(true)
          }}
        />
        <AuthHero />
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  return (
    <div className="app">
      <AgeGate
        open={!ageConfirmed}
        sessionPresent={Boolean(session)}
        onEnter={() => {
          if (!session) {
            setToast('Sign in to confirm age')
            return
          }
          setAgeConfirmed(true)
          markAgeConfirmed()
          logAgeEvent('enter')
        }}
        onExit={() => {
          logAgeExit()
          window.location.replace(EXIT_URL)
        }}
      />
      <aside className="sidebar">
        <div className="logo-mark">
          <img src={assetUrl('logo.png')} alt="Logo" />
        </div>
        <nav className="nav">
          {sidebarNav.map((item) => {
            const Icon = item.icon
            const active = page === item.key
            const gated = !isAuthed && ['chats', 'notifications', 'settings', 'membership'].includes(item.key)
            return (
              <button
                key={item.label}
                className={`nav-item ${active ? 'active' : ''} ${gated ? 'disabled' : ''}`}
                disabled={gated}
                onClick={() => {
                  if (gated) {
                    setToast('Sign in to access this section')
                    return
                  }
                  setShowProfileMenu(false)
                  setPage(item.key as typeof page)
                }}
                title={gated ? 'Sign in to access' : undefined}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="section">
          <p className="section-title">Memberships</p>
          <button className="pill" onClick={handleMembershipEntry}>
            All memberships
          </button>
          <div className="divider" />
          {memberships.length ? (
            memberships.map((m) => (
              <div key={m.name} className="user-row" onClick={() => handleVisitedClick(m.name)}>
                <img src={m.avatar} alt={m.name} />
                <span>{m.name}</span>
              </div>
            ))
          ) : (
            <div className="muted small">No memberships yet.</div>
          )}
        </div>

        <div className="section">
          <p className="section-title">Recently Visited</p>
          <div className="divider" />
          {visited.length ? (
            visited.map((m) => (
              <div key={m.name} className="user-row" onClick={() => handleVisitedClick(m.name)}>
                <img src={m.avatar} alt={m.name} />
                <span>{m.name}</span>
              </div>
            ))
          ) : (
            <div className="muted small">No recent visits yet.</div>
          )}
        </div>

        <div className="get-app">
          <button className="pill full" onClick={handleGetApp}>
            Get app
          </button>
        </div>

        {sidebarProfile ? (
          <div className="profile">
            <div className="left">
              <img src={sidebarProfile.avatar} alt={sidebarProfile.name} />
              <div>
                <div className="name">{sidebarProfile.name}</div>
                <div className="muted">{sidebarProfile.role}</div>
              </div>
            </div>
            <button className="icon-button" onClick={() => setShowProfileMenu((s) => !s)}>
              <FiMoreHorizontal />
            </button>
            {showProfileMenu && (
              <div className="profile-menu">
                <div className="menu-title">Appearance</div>
                <div className="appearance-row">
                  <button
                    className={`chip tiny ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    Light
                  </button>
                  <button
                    className={`chip tiny ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    Dark
                  </button>
                  <button
                    className={`chip tiny ${theme === 'system' ? 'active' : ''}`}
                    onClick={() => setTheme('system')}
                  >
                    System
                  </button>
                </div>
                <button className="menu-item" onClick={() => setPage('news')}>
                  News
                </button>
                <button
                  className="menu-item"
                  onClick={() => openExternal(CREATOR_APP_URL, 'Creator dashboard')}
                >
                  Creator dashboard
                </button>
                <button className="menu-item" onClick={() => setPage('help')}>
                  Help Center & FAQ
                </button>
                <button className="menu-item" onClick={() => setPage('features')}>
                  Feature Requests
                </button>
                <button
                  className="menu-item"
                  onClick={() =>
                    window.open(assetUrl('pages/terms.html'), '_blank', 'noopener,noreferrer')
                  }
                >
                  Terms of Use
                </button>
                <button
                  className="menu-item"
                  onClick={() =>
                    window.open(assetUrl('pages/privacy.html'), '_blank', 'noopener,noreferrer')
                  }
                >
                  Privacy Policy
                </button>
                <button
                  className="menu-item"
                  onClick={() =>
                    window.open(
                      assetUrl('pages/acceptable-use-policy.html'),
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  Community Policies
                </button>
                <button className="menu-item danger" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : null}
      </aside>

      <div className="main-area">
        {page === 'home' && (
          <HomePage
            onSeeAll={() => setPage('explore')}
            session={session}
            creatorProfile={creatorProfile}
            onCreateCreator={handleCreateCreator}
            creatorLoading={creatorLoading}
            posts={feedPosts.filter((post) => post.post_type === 'post')}
            stories={storyPosts}
            onSubscribe={(creator) => handleSubscribe(creator)}
            activeSubscriptions={activeSubscriptions}
            ppvPurchases={ppvPurchases}
            onUnlockPost={handleUnlockPost}
          />
        )}
        {page === 'explore' && (
          <ExplorePage
            filter={filter}
            onSelectFilter={setFilter}
            activeSubscriptions={activeSubscriptions}
            onSubscribe={handleSubscribe}
          />
        )}
        {page === 'chats' && <ChatsPage />}
        {page === 'notifications' && <NotificationsPage />}
        {page === 'news' && (
          <div className="info-page">
            <h2>Product News</h2>
            <p>Read the latest release notes and compliance updates.</p>
            <button
              className="pill"
              onClick={() => openExternal(RELEASE_NOTES_URL, 'Release notes')}
            >
              Open release notes
            </button>
          </div>
        )}
        {page === 'help' && (
          <div className="info-page">
            <h2>Help Center</h2>
            <p>Find quick answers or contact support.</p>
            <button className="pill" onClick={() => openExternal(HELP_CENTER_URL, 'Help center')}>
              Open Help Center
            </button>
            <button className="pill ghost" onClick={openSupportEmail}>
              Email support
            </button>
          </div>
        )}
        {page === 'features' && (
          <div className="info-page">
            <h2>Feature Requests</h2>
            <p>Tell us what to build next. This sends feedback to the team.</p>
            <textarea
              className="feature-input"
              value={featureText}
              onChange={(e) => setFeatureText(e.target.value)}
              placeholder="Describe your idea..."
            />
            <button
              className="pill"
              onClick={async () => {
                if (!featureText.trim()) return setToast('Enter a feature idea first')
                if (!isSupabaseConfigured) return setToast('Feature requests are not configured')
                try {
                  await submitFeatureRequest(featureText.trim())
                  setFeatureText('')
                  setToast('Feedback submitted')
                } catch (err) {
                  console.error(err)
                  setToast('Could not submit request')
                }
              }}
            >
              Submit feedback
            </button>
          </div>
        )}
        {page === 'settings' && (
          <SettingsPage
            tab={settingsTab}
            onTabChange={setSettingsTab}
            paymentRef={paymentRef}
            connectedRef={connectedRef}
            onPaymentClick={handlePaymentMethods}
            onConnectClick={handleConnectedApp}
            session={session}
            userProfile={userProfile}
            walletBalance={walletBalance}
            walletTopupAmount={walletTopupAmount}
            walletTopupPhone={walletTopupPhone}
            onTopupAmountChange={setWalletTopupAmount}
            onTopupPhoneChange={setWalletTopupPhone}
            onTopup={handleWalletTopup}
          />
        )}
        {page === 'membership' && (
          <MembershipPage
            tab={membershipTab}
            onTabChange={setMembershipTab}
            upgradeRef={upgradeRef}
            tiersRef={tiersRef}
            giftRef={giftRef}
            onUpgrade={handleUpgradeClick}
            onGift={handleGiftClick}
            onGoPayment={handleGiftCheckout}
          />
        )}
      </div>
      {!consentAccepted && (
        <ConsentBanner
          onAccept={() => {
            localStorage.setItem('cookieConsent', 'accepted')
            setConsentAccepted(true)
          }}
        />
      )}
      {/* Guest mode removed: sign-in required for content */}
    </div>
  )
}

