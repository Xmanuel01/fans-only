import { useEffect, useState } from 'react'
import {
  FiCompass,
  FiHome,
  FiLock,
  FiMail,
  FiMessageSquare,
  FiMoreHorizontal,
  FiSearch,
  FiSettings,
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
import { env, envStatus } from './env'

type AppPage = 'home' | 'explore' | 'settings' | 'help' | 'features'
type ThemeMode = 'light' | 'dark' | 'system'

const CREATOR_APP_URL = env.creatorAppUrl
const HELP_CENTER_URL = env.helpCenterUrl ?? ''
const SUPPORT_EMAIL = env.supportEmail ?? ''
const EXIT_URL = env.exitUrl ?? ''
const MPESA_STK_ENABLED = env.mpesaStkEnabled
const BASE_URL = import.meta.env.BASE_URL ?? '/'
const assetUrl = (path: string) => `${BASE_URL}${path.replace(/^\/+/, '')}`
const isExternalUrl = (value: string | null) => Boolean(value && /^https?:\/\//i.test(value))
const CREATOR_APP_EXTERNAL = isExternalUrl(CREATOR_APP_URL)
const HAS_HELP_CENTER_URL = Boolean(HELP_CENTER_URL)
const HAS_SUPPORT_EMAIL = Boolean(SUPPORT_EMAIL)

const navItems = [
  { icon: FiHome, label: 'Home', key: 'home' as const },
  { icon: FiCompass, label: 'Explore', key: 'explore' as const },
  { icon: FiSettings, label: 'Settings', key: 'settings' as const },
  { icon: FiMail, label: 'Support', key: 'help' as const },
  { icon: FiMessageSquare, label: 'Features', key: 'features' as const },
]

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

const formatKsh = (amountCents?: number | null) => {
  if (!amountCents || amountCents <= 0) return 'Free'
  const value = Math.round(amountCents) / 100
  return `KSh ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function AuthPrompt({ onAuthSuccess }: { onAuthSuccess: (mode: 'sign_in' | 'sign_up', session: any | null) => void }) {
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
      setError('Could not sign in with email and password.')
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
      setError('Could not create account. Try another email.')
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

      <div className="divider-row">
        <span className="line" />
        <span className="or">or</span>
        <span className="line" />
      </div>

      <label className="auth-label">
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
      </label>
      <label className="auth-label">
        Password
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="********" />
      </label>
      <button className="auth-btn primary" onClick={handleSignIn} disabled={status === 'signing-in'}>
        {status === 'signing-in' ? 'Signing in...' : 'Sign in'}
      </button>
      <button className="auth-btn ghost" onClick={handleSignUp} disabled={status === 'signing-in'}>
        Create account
      </button>
      {error ? <div className="auth-error">{error}</div> : null}
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
        <p>Missing or invalid environment variables. Update deployment config and reload.</p>
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
      <div className="consent-text">We use cookies for sign-in, security, and analytics.</div>
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
        <p>Access is limited to users who are 18+ (or legal age of majority).</p>
        <p className="age-links">
          <a href={assetUrl('pages/terms.html')}>Terms</a> - <a href={assetUrl('pages/privacy.html')}>Privacy</a> -{' '}
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
      </div>
    </div>
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
  const [creators, setCreators] = useState<CreatorCard[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const subscriptionSet = new Set(activeSubscriptions)

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      const data = await fetchRecommendedCreators({ searchTerm, category: filter, limit: 18 })
      setCreators(data)
      setLoading(false)
    })()
  }, [searchTerm, filter])

  return (
    <div className="explore">
      <div className="search-bar">
        <FiSearch size={18} />
        <input placeholder="Search creators or topics" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
      </div>

      <div className="pill-row">
        {filters.map((item) => (
          <button key={item} className={`chip ${item === filter ? 'active' : ''}`} onClick={() => onSelectFilter(item)}>
            {item}
          </button>
        ))}
      </div>

      <section className="explore-section">
        <div className="section-heading">
          <h3>Recommended creators</h3>
        </div>
        <div className="list-grid">
          {loading ? <p className="muted">Loading creators...</p> : null}
          {!loading && !creators.length ? <p className="muted">No creators found yet.</p> : null}
          {!loading
            ? creators.map((creator) => (
                <div key={creator.id} className="square-card">
                  <img src={creator.avatar_url ?? assetUrl('logo.png')} alt={creator.display_name} />
                  <div className="card-name">{creator.display_name}</div>
                  <div className="card-tag">{creator.category ?? creator.handle}</div>
                  <div className="card-tag">{formatKsh(creator.subscription_price_cents ?? 0)}</div>
                  <button
                    className="pill light full"
                    onClick={() => onSubscribe(creator)}
                    disabled={subscriptionSet.has(creator.id)}
                  >
                    {subscriptionSet.has(creator.id) ? 'Subscribed' : 'Subscribe'}
                  </button>
                </div>
              ))
            : null}
        </div>
      </section>
    </div>
  )
}

function HomePage({
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
  onExplore,
}: {
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
  onExplore: () => void
}) {
  const defaultHandle =
    session?.user?.user_metadata?.username ??
    session?.user?.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '') ??
    ''
  const [handle, setHandle] = useState(defaultHandle)
  const subscriptionSet = new Set(activeSubscriptions)
  const ppvSet = new Set(ppvPurchases)
  const displayName = session?.user?.user_metadata?.full_name ?? session?.user?.email?.split('@')[0] ?? 'Your feed'

  const access = (post: FeedPost) => {
    const subscribed = subscriptionSet.has(post.creator.id)
    const unlocked = ppvSet.has(post.id)
    const isSubscriberOnly = post.visibility === 'subscribers'
    const isPpv = post.visibility === 'ppv'
    const locked = (isSubscriberOnly && !subscribed) || (isPpv && !unlocked)
    const showSubscribe = Boolean(post.creator.subscription_price_cents && post.creator.subscription_price_cents > 0 && !subscribed)
    return { locked, isPpv, showSubscribe }
  }

  return (
    <main className="feed">
      <header className="feed-header">
        <div className="feed-user">
          <div>
            <div className="name">{displayName}</div>
            <div className="muted">{posts.length ? 'Latest updates from creators you follow.' : 'Follow creators to see updates.'}</div>
          </div>
        </div>
        <div className="feed-actions">
          <button className="see-all" onClick={onExplore}>Explore creators</button>
          <a className="see-all" href={CREATOR_APP_URL} target={CREATOR_APP_EXTERNAL ? '_blank' : undefined} rel={CREATOR_APP_EXTERNAL ? 'noreferrer' : undefined}>
            Creator dashboard
          </a>
        </div>
      </header>

      <section className="card creator-cta">
        <div className="creator-cta-header">
          <div>
            <div className="muted small">Monetize</div>
            <h3>{creatorProfile ? 'Creator profile ready' : 'Become a creator'}</h3>
            <p className="muted">Claim your handle to unlock the creator dashboard.</p>
          </div>
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
            <button className="primary-btn" onClick={() => onCreateCreator(handle)} disabled={!handle || creatorLoading}>
              {creatorLoading ? 'Saving...' : 'Claim handle'}
            </button>
          </div>
        ) : (
          <div className="creator-cta-body">
            <div className="muted">Handle</div>
            <div className="creator-handle">@{creatorProfile.handle}</div>
          </div>
        )}
      </section>

      {stories.length ? (
        <section className="card">
          <div className="section-heading">
            <h3>Stories</h3>
          </div>
          <div className="card-row">
            {stories.map((story) => {
              const media = story.media[0]
              const isVideo = Boolean(media?.mime_type?.startsWith('video'))
              return (
                <div key={story.id} className="avatar-chip story-chip">
                  <img src={story.creator.avatar_url ?? assetUrl('logo.png')} alt={story.creator.display_name} />
                  <span>{story.creator.display_name}</span>
                  {isVideo ? <span className="story-chip__type">Video</span> : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {posts.length ? posts.map((post) => {
        const state = access(post)
        const media = post.media[0]
        const isVideo = Boolean(media?.mime_type?.startsWith('video'))

        return (
          <section key={post.id} className={`card ${media ? 'media-card' : 'text-card'}`}>
            <div className="card-header">
              <img src={post.creator.avatar_url ?? assetUrl('logo.png')} alt={post.creator.display_name} />
              <div>
                <div className="name">{post.creator.display_name}</div>
                <div className="muted">@{post.creator.handle}</div>
              </div>
              <FiMoreHorizontal className="spacer" />
              {state.showSubscribe ? (
                <button className="pill light" onClick={() => onSubscribe(post.creator)}>
                  Subscribe {formatKsh(post.creator.subscription_price_cents)}
                </button>
              ) : null}
            </div>

            {media ? (
              <div className={`media-wrapper ${state.locked ? 'locked' : ''}`}>
                {media.url ? (
                  isVideo ? (
                    <video controls preload="metadata" playsInline>
                      <source src={media.url} type={media.mime_type ?? 'video/mp4'} />
                    </video>
                  ) : (
                    <img src={media.url} alt={post.title} />
                  )
                ) : (
                  <div className="media-placeholder">Preview unavailable</div>
                )}
                {state.locked ? (
                  <div className="media-lock-overlay">
                    <div className="media-lock-tag">
                      <FiLock size={14} />
                      {state.isPpv ? 'Pay-per-view' : 'Subscribers only'}
                    </div>
                    <div className="lock-title">{state.isPpv ? 'Unlock this post' : 'Subscribe to view'}</div>
                    <div className="lock-subtitle">
                      {state.isPpv ? `Price: ${formatKsh(post.price_cents ?? 0)}` : 'Support the creator to access this content.'}
                    </div>
                    {state.isPpv ? (
                      <button className="primary-btn" onClick={() => onUnlockPost(post)}>
                        Unlock for {formatKsh(post.price_cents ?? 0)}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="card-body">
              <p className="title">{post.title}</p>
              {post.body ? <p className="muted">{post.body}</p> : null}
            </div>
          </section>
        )
      }) : (
        <section className="card">
          <div className="card-body">
            <p className="title">No posts yet</p>
            <p className="muted">Follow creators to see new content in your feed.</p>
          </div>
        </section>
      )}
    </main>
  )
}
function SettingsPage({
  session,
  userProfile,
  walletBalance,
  walletTopupAmount,
  walletTopupPhone,
  onTopupAmountChange,
  onTopupPhoneChange,
  onTopup,
  onOpenHelp,
  onOpenSupportEmail,
  hasHelpCenterUrl,
  hasSupportEmail,
}: {
  session: any
  userProfile: UserProfile | null
  walletBalance: WalletBalance | null
  walletTopupAmount: string
  walletTopupPhone: string
  onTopupAmountChange: (value: string) => void
  onTopupPhoneChange: (value: string) => void
  onTopup: () => void
  onOpenHelp: () => void
  onOpenSupportEmail: () => void
  hasHelpCenterUrl: boolean
  hasSupportEmail: boolean
}) {
  const displayName =
    session?.user?.user_metadata?.full_name ??
    session?.user?.user_metadata?.name ??
    session?.user?.email?.split('@')[0] ??
    ''
  const email = session?.user?.email ?? ''
  const avatar = session?.user?.user_metadata?.avatar_url ?? assetUrl('logo.png')

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      <div className="settings-card">
        <div className="card-title">Account</div>
        <div className="profile-avatar">
          <img src={avatar} alt={displayName || 'Profile'} />
          <div className="lock-pill mini">
            <FiLock size={12} />
          </div>
        </div>
        <label className="input-label">Display name</label>
        <input className="text-input" value={displayName} readOnly />
        <label className="input-label">Username</label>
        <input className="text-input" value={userProfile?.username ?? ''} readOnly />
        <label className="input-label">Email</label>
        <input className="text-input" value={email} readOnly />
      </div>

      <div className="settings-card">
        <div className="card-title">Wallet balance</div>
        <div className="muted small">Use your wallet to unlock PPV content instantly.</div>
        <div className="payment-row" style={{ marginTop: 12 }}>
          <div className="payment-label">Available</div>
          <div className="payment-value">{formatKsh(walletBalance?.available_amount_minor ?? 0)}</div>
        </div>
        <div className="payment-row">
          <div className="payment-label">Pending</div>
          <div className="payment-value">{formatKsh(walletBalance?.pending_amount_minor ?? 0)}</div>
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
        </div>
        <div className="button-right">
          <button className="pill light" onClick={onTopup}>
            {MPESA_STK_ENABLED ? 'Top up via M-PESA' : 'Top up wallet'}
          </button>
        </div>
      </div>

      <div className="settings-card">
        <div className="card-title">Support & legal</div>
        <div className="button-row">
          <button className="pill ghost" disabled={!hasHelpCenterUrl} onClick={onOpenHelp}>Open Help Center</button>
          <button className="pill light" disabled={!hasSupportEmail} onClick={onOpenSupportEmail}>Email support</button>
        </div>
        <div className="footer-links" style={{ marginTop: 12 }}>
          <a href={assetUrl('pages/terms.html')}>Terms</a>
          <a href={assetUrl('pages/privacy.html')}>Privacy</a>
          <a href={assetUrl('pages/cookies.html')}>Cookies</a>
          <a href={assetUrl('pages/acceptable-use-policy.html')}>Acceptable Use</a>
          <a href={assetUrl('pages/usc2257.html')}>2257</a>
        </div>
      </div>
    </div>
  )
}

function HelpPage({
  onOpenHelp,
  onOpenSupportEmail,
  hasHelpCenterUrl,
  hasSupportEmail,
}: {
  onOpenHelp: () => void
  onOpenSupportEmail: () => void
  hasHelpCenterUrl: boolean
  hasSupportEmail: boolean
}) {
  return (
    <div className="settings-page">
      <h2>Help Center</h2>
      <div className="settings-card">
        <p>Find quick answers, report account issues, or contact support directly.</p>
        <div className="button-row">
          <button className="pill light" disabled={!hasHelpCenterUrl} onClick={onOpenHelp}>Open Help Center</button>
          <button className="pill ghost" disabled={!hasSupportEmail} onClick={onOpenSupportEmail}>Email support</button>
        </div>
      </div>
    </div>
  )
}

function FeaturePage({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="settings-page">
      <h2>Feature Requests</h2>
      <div className="settings-card">
        <p>Tell us what to build next. This sends feedback to the team.</p>
        <textarea className="feature-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Describe your idea..." />
        <button
          className="pill light"
          disabled={submitting}
          onClick={async () => {
            if (!value.trim()) return
            setSubmitting(true)
            try {
              await onSubmit()
            } finally {
              setSubmitting(false)
            }
          }}
        >
          {submitting ? 'Submitting...' : 'Submit feedback'}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<AppPage>('home')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [filter, setFilter] = useState(filters[0])
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [featureText, setFeatureText] = useState('')
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null)
  const [creatorLoading, setCreatorLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [storyPosts, setStoryPosts] = useState<FeedPost[]>([])
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([])
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null)
  const [walletTopupAmount, setWalletTopupAmount] = useState('1000')
  const [walletTopupPhone, setWalletTopupPhone] = useState('')
  const [ppvPurchases, setPpvPurchases] = useState<number[]>([])

  const displayName =
    session?.user?.user_metadata?.full_name ??
    session?.user?.user_metadata?.name ??
    session?.user?.email?.split('@')[0] ??
    ''
  const profileAvatar =
    session?.user?.user_metadata?.avatar_url ?? userProfile?.avatar_url ?? assetUrl('logo.png')
  const sidebarName = userProfile?.display_name || userProfile?.username || displayName || 'Member'

  useEffect(() => {
    if (envStatus.hasIssues) {
      setSessionChecked(true)
      return
    }
    ;(async () => {
      const current = await getCurrentSession()
      setSession(current)
      setSessionChecked(true)
    })()
  }, [])

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent')
    if (consent === 'accepted') setConsentAccepted(true)
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') setTheme(storedTheme)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (envStatus.hasIssues || !session?.user?.id) {
      setCreatorProfile(null)
      return
    }
    ;(async () => {
      setCreatorLoading(true)
      const profile = await fetchCreatorProfile(session.user.id)
      setCreatorProfile(profile)
      setCreatorLoading(false)
    })()
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues || !session?.user?.id) {
      setUserProfile(null)
      return
    }
    ;(async () => {
      try {
        const profile = await ensureProfile()
        if (profile) setUserProfile(profile)
      } catch (err) {
        console.error(err)
      }
    })()
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues || !session?.user?.id) {
      setActiveSubscriptions([])
      return
    }
    ;(async () => {
      const subscriptions = await fetchActiveSubscriptions()
      setActiveSubscriptions(subscriptions)
    })()
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues || !session?.user?.id) {
      setWalletBalance(null)
      return
    }
    ;(async () => {
      const balance = await fetchWalletBalance()
      setWalletBalance(balance)
    })()
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues || !session?.user?.id || !ageConfirmed) {
      setPpvPurchases([])
      return
    }
    ;(async () => {
      const purchases = await fetchPpvPurchases()
      setPpvPurchases(purchases)
    })()
  }, [ageConfirmed, session])

  useEffect(() => {
    if (envStatus.hasIssues || !session?.user?.id || !ageConfirmed) {
      setFeedPosts([])
      setStoryPosts([])
      return
    }
    ;(async () => {
      const [posts, stories] = await Promise.all([fetchFeedPosts(), fetchStories()])
      setFeedPosts(posts)
      setStoryPosts(stories)
    })()
  }, [ageConfirmed, session])

  useEffect(() => {
    if (envStatus.hasIssues || ageConfirmed || !session?.user?.id) return
    ;(async () => {
      const remote = await fetchAgeConfirmation()
      if (remote) setAgeConfirmed(true)
    })()
  }, [ageConfirmed, session])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(timer)
  }, [toast])

  const openHelpCenter = () => {
    if (!HAS_HELP_CENTER_URL) {
      setToast('Help center is unavailable right now')
      return
    }
    window.open(HELP_CENTER_URL, '_blank', 'noopener,noreferrer')
  }

  const openSupportEmail = () => {
    if (!HAS_SUPPORT_EMAIL) {
      setToast('Support email is unavailable right now')
      return
    }
    window.location.href = `mailto:${SUPPORT_EMAIL}`
  }

  const openCreatorDashboard = () => {
    if (CREATOR_APP_EXTERNAL) {
      window.open(CREATOR_APP_URL, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.href = CREATOR_APP_URL
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
        const result = await initiateMpesaStkPush({ phone: walletTopupPhone.trim(), amountMajor })
        setToast(result.customerMessage ?? 'M-PESA prompt sent. Complete on your phone.')
        return
      }
      const result = await initiatePaystackPayment({
        email: session.user.email,
        amountMajor,
        currency: 'KES',
        type: 'wallet_topup',
        metadata: { source: 'wallet_topup' },
        channels: ['mobile_money'],
      })
      if (!result.authorization_url) throw new Error('Checkout URL missing')
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
      const result = await initiatePaystackPayment({
        email: session.user.email,
        creatorId: creator.id,
        amountMajor: priceCents / 100,
        currency: creator.subscription_currency ?? 'KES',
        type: 'subscription',
        metadata: { source: 'subscribe' },
        channels: ['mobile_money'],
      })
      if (!result.authorization_url) throw new Error('Checkout URL missing')
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
      if (!result?.purchase_id) return
      setPpvPurchases((prev) => Array.from(new Set([...prev, post.id])))
      if (typeof result.new_balance_minor === 'number') {
        setWalletBalance((prev) =>
          prev
            ? { ...prev, available_amount_minor: result.new_balance_minor }
            : { available_amount_minor: result.new_balance_minor, pending_amount_minor: 0, currency: 'KES' }
        )
      }
      setToast('Post unlocked')
    } catch (err: any) {
      console.error(err)
      const message = err?.message?.includes('insufficient')
        ? 'Insufficient wallet balance. Top up to continue.'
        : 'Could not unlock post.'
      setToast(message)
    }
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

    const creatorDisplayName = session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Creator'

    try {
      setCreatorLoading(true)
      const created = await createCreatorProfile({
        userId: session.user.id,
        handle: normalized,
        displayName: creatorDisplayName,
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

  const handleLogout = async () => {
    await signOut()
    setSession(null)
    setAgeConfirmed(false)
    setUserProfile(null)
    setFeedPosts([])
    setStoryPosts([])
    setActiveSubscriptions([])
    setWalletBalance(null)
    setPpvPurchases([])
    setShowProfileMenu(false)
    setPage('home')
  }

  const envIssues = [
    ...envStatus.missing.map((name) => `Missing ${name}`),
    ...envStatus.invalid.map((name) => `Invalid ${name}`),
  ]

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

  if (!session) {
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
        />
        <AuthHero />
        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    )
  }

  return (
    <div className="app">
      <AgeGate
        open={!ageConfirmed}
        sessionPresent={Boolean(session)}
        onEnter={() => {
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
          {navItems.map((item) => {
            const Icon = item.icon
            const active = page === item.key
            return (
              <button
                key={item.label}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => {
                  setShowProfileMenu(false)
                  setPage(item.key)
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="section">
          <p className="section-title">Creator tools</p>
          <button className="pill full" onClick={openCreatorDashboard}>
            Open creator dashboard
          </button>
        </div>

        <div className="section">
          <p className="section-title">Wallet</p>
          <div className="divider" />
          <div className="muted small">
            Available: <strong>{formatKsh(walletBalance?.available_amount_minor ?? 0)}</strong>
          </div>
        </div>

        <div className="profile">
          <div className="left">
            <img src={profileAvatar} alt={sidebarName} />
            <div>
              <div className="name">{sidebarName}</div>
              <div className="muted">Member</div>
            </div>
          </div>
          <button className="icon-button" onClick={() => setShowProfileMenu((open) => !open)}>
            <FiMoreHorizontal />
          </button>
          {showProfileMenu ? (
            <div className="profile-menu">
              <div className="menu-title">Appearance</div>
              <div className="appearance-row">
                <button className={`chip tiny ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
                  Light
                </button>
                <button className={`chip tiny ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
                  Dark
                </button>
                <button className={`chip tiny ${theme === 'system' ? 'active' : ''}`} onClick={() => setTheme('system')}>
                  System
                </button>
              </div>
              <button className="menu-item" onClick={openCreatorDashboard}>Creator dashboard</button>
              <button className="menu-item" onClick={() => setPage('help')}>Help Center</button>
              <button className="menu-item" onClick={() => setPage('features')}>Feature Requests</button>
              <button className="menu-item" onClick={handleLogout}>Log out</button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="main-area">
        {page === 'home' ? (
          <HomePage
            session={session}
            creatorProfile={creatorProfile}
            onCreateCreator={handleCreateCreator}
            creatorLoading={creatorLoading}
            posts={feedPosts.filter((post) => post.post_type === 'post')}
            stories={storyPosts}
            onSubscribe={handleSubscribe}
            activeSubscriptions={activeSubscriptions}
            ppvPurchases={ppvPurchases}
            onUnlockPost={handleUnlockPost}
            onExplore={() => setPage('explore')}
          />
        ) : null}

        {page === 'explore' ? (
          <ExplorePage
            filter={filter}
            onSelectFilter={setFilter}
            activeSubscriptions={activeSubscriptions}
            onSubscribe={handleSubscribe}
          />
        ) : null}

        {page === 'settings' ? (
          <SettingsPage
            session={session}
            userProfile={userProfile}
            walletBalance={walletBalance}
            walletTopupAmount={walletTopupAmount}
            walletTopupPhone={walletTopupPhone}
            onTopupAmountChange={setWalletTopupAmount}
            onTopupPhoneChange={setWalletTopupPhone}
            onTopup={handleWalletTopup}
            onOpenHelp={openHelpCenter}
            onOpenSupportEmail={openSupportEmail}
            hasHelpCenterUrl={HAS_HELP_CENTER_URL}
            hasSupportEmail={HAS_SUPPORT_EMAIL}
          />
        ) : null}

        {page === 'help' ? (
          <HelpPage
            onOpenHelp={openHelpCenter}
            onOpenSupportEmail={openSupportEmail}
            hasHelpCenterUrl={HAS_HELP_CENTER_URL}
            hasSupportEmail={HAS_SUPPORT_EMAIL}
          />
        ) : null}

        {page === 'features' ? (
          <FeaturePage
            value={featureText}
            onChange={setFeatureText}
            onSubmit={async () => {
              if (!featureText.trim()) {
                setToast('Enter a feature idea first')
                return
              }
              try {
                await submitFeatureRequest(featureText.trim())
                setFeatureText('')
                setToast('Feedback submitted')
              } catch (err) {
                console.error(err)
                setToast('Could not submit request')
              }
            }}
          />
        ) : null}
      </div>

      {!consentAccepted ? (
        <ConsentBanner
          onAccept={() => {
            localStorage.setItem('cookieConsent', 'accepted')
            setConsentAccepted(true)
          }}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
