import React, { useState, useRef, useEffect } from 'react'
import {
  FiBell,
  FiCompass,
  FiCreditCard,
  FiGift,
  FiHeart,
  FiHome,
  FiLock,
  FiMessageCircle,
  FiMoreHorizontal,
  FiPlus,
  FiSearch,
  FiSend,
  FiSettings,
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
  fetchChatMessages,
  fetchChatThreads,
  fetchChatableCreators,
  fetchNotifications,
  fetchNotificationPreferences,
  fetchUnreadNotificationCount,
  fetchRecommendedCreators,
  ensureProfile,
  fetchFeedPosts,
  fetchStories,
  fetchActiveSubscriptions,
  fetchSubscriptionHistory,
  fetchWalletBalance,
  fetchWalletHistory,
  fetchPpvPurchases,
  markChatThreadRead,
  markAllNotificationsRead,
  markNotificationRead,
  purchasePpv,
  purchaseSubscription,
  sendChatMessage,
  subscribeToChatMessages,
  subscribeToMemberChatThreads,
  subscribeToNotifications,
  updateNotificationPreferences,
  signInWithPassword,
  signUpWithPassword,
  type AppNotification,
  type ChatMessage,
  type ChatThreadSummary,
  type ChatableCreator,
  type CreatorCard,
  type ExploreSort,
  type SubscriptionHistoryItem,
  type NotificationPreferences,
  type UserProfile,
  type FeedPost,
  type WalletBalance,
  type WalletHistoryItem,
} from './supabaseClient'
import { useMemo } from 'react'
import { env, envStatus, isSupabaseConfigured } from './env'

const HELP_CENTER_URL = env.helpCenterUrl
const RELEASE_NOTES_URL = env.releaseNotesUrl
const SUPPORT_EMAIL = env.supportEmail
const EXIT_URL = env.exitUrl ?? 'about:blank'
const FEATURED_CREATOR_ID = env.giftCreatorId ?? ''
const DEFAULT_GIFT_AMOUNT_MAJOR =
  typeof env.giftAmountMajor === 'number' && env.giftAmountMajor > 0
    ? env.giftAmountMajor
    : 0
const MPESA_STK_ENABLED = env.mpesaStkEnabled
const FEATURE_REQUESTS_ENABLED = env.featureRequestsEnabled
const BASE_URL = import.meta.env.BASE_URL ?? '/'
const assetUrl = (path: string) => `${BASE_URL}${path.replace(/^\/+/, '')}`
const RECENT_CREATORS_STORAGE_KEY = 'fans-only:recent-creators'
const AGE_CONFIRMATION_CACHE_KEY = 'fans-only:age-confirmed-users'
const FAN_CREATORS_STORAGE_KEY = 'fans-only:fan-creators'
const POST_SOCIAL_STORAGE_KEY = 'fans-only:post-social'
const hasGiftCreatorCheckout = Boolean(FEATURED_CREATOR_ID && DEFAULT_GIFT_AMOUNT_MAJOR > 0)
const SUPPORTED_MEDIA_ASPECT_RATIOS: Array<{ css: string; value: number }> = [
  { css: '1 / 1', value: 1 },
  { css: '4 / 5', value: 4 / 5 },
  { css: '3 / 4', value: 3 / 4 },
  { css: '9 / 16', value: 9 / 16 },
]
type PaymentReturnKind = 'wallet_topup' | 'tip' | 'gift'
type PostComment = {
  id: string
  author: string
  body: string
  created_at: string
}
type PostSocialEntry = {
  likedByUserIds: string[]
  comments: PostComment[]
}
type SubscriptionTarget = {
  id: string
  handle?: string | null
  display_name?: string | null
  subscription_price_cents?: number | null
  subscription_currency?: string | null
}
type PurchasePromptAction =
  | {
      kind: 'subscribe'
      creator: SubscriptionTarget
      priceCents: number
      walletBalanceMinor: number
      insufficientBalance: boolean
    }
  | {
      kind: 'unlock'
      post: FeedPost
      priceCents: number
      walletBalanceMinor: number
      insufficientBalance: boolean
    }

const readPaymentReturnFromUrl = (): { kind: PaymentReturnKind | null; hasReference: boolean } => {
  if (typeof window === 'undefined') {
    return { kind: null, hasReference: false }
  }

  const url = new URL(window.location.href)
  const rawKind = url.searchParams.get('payment_return')
  const kind =
    rawKind === 'wallet_topup' || rawKind === 'tip' || rawKind === 'gift' ? rawKind : null

  return {
    kind,
    hasReference: Boolean(url.searchParams.get('reference') || url.searchParams.get('trxref')),
  }
}

const readAgeConfirmationCache = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(AGE_CONFIRMATION_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry: unknown): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

const hasCachedAgeConfirmation = (userId: string) => readAgeConfirmationCache().includes(userId)

const persistAgeConfirmationCache = (userId: string) => {
  if (typeof window === 'undefined') return
  const next = Array.from(new Set([userId, ...readAgeConfirmationCache()])).slice(0, 20)
  window.localStorage.setItem(AGE_CONFIRMATION_CACHE_KEY, JSON.stringify(next))
}

const readFanCreators = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FAN_CREATORS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry: unknown): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

const persistFanCreators = (creatorIds: string[]) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    FAN_CREATORS_STORAGE_KEY,
    JSON.stringify(Array.from(new Set(creatorIds)).slice(0, 100))
  )
}

const normalizePostSocialEntry = (value: unknown): PostSocialEntry => {
  const parsed =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  const likedByUserIds = Array.isArray(parsed.likedByUserIds)
    ? parsed.likedByUserIds.filter((entry): entry is string => typeof entry === 'string')
    : []

  const comments = Array.isArray(parsed.comments)
    ? parsed.comments
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
          const comment = entry as Record<string, unknown>
          if (
            typeof comment.id !== 'string' ||
            typeof comment.author !== 'string' ||
            typeof comment.body !== 'string' ||
            typeof comment.created_at !== 'string'
          ) {
            return null
          }
          return {
            id: comment.id,
            author: comment.author,
            body: comment.body,
            created_at: comment.created_at,
          } satisfies PostComment
        })
        .filter((entry): entry is PostComment => Boolean(entry))
    : []

  return {
    likedByUserIds,
    comments,
  }
}

const readPostSocialState = (): Record<number, PostSocialEntry> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(POST_SOCIAL_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalized: Record<number, PostSocialEntry> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const postId = Number(key)
      if (!Number.isFinite(postId)) continue
      normalized[postId] = normalizePostSocialEntry(value)
    }
    return normalized
  } catch {
    return {}
  }
}

const persistPostSocialState = (state: Record<number, PostSocialEntry>) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(POST_SOCIAL_STORAGE_KEY, JSON.stringify(state))
}

const getBestFitMediaAspectRatio = (media?: FeedPost['media'][number] | null) => {
  const width = media?.width ?? 0
  const height = media?.height ?? 0
  if (width <= 0 || height <= 0) {
    return '3 / 4'
  }

  const actualRatio = width / height
  let closest = SUPPORTED_MEDIA_ASPECT_RATIOS[0]
  let smallestDelta = Math.abs(actualRatio - closest.value)

  for (const candidate of SUPPORTED_MEDIA_ASPECT_RATIOS.slice(1)) {
    const delta = Math.abs(actualRatio - candidate.value)
    if (delta < smallestDelta) {
      closest = candidate
      smallestDelta = delta
    }
  }

  return closest.css
}

const clearPaymentReturnParams = () => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('payment_return')
  url.searchParams.delete('reference')
  url.searchParams.delete('trxref')
  window.history.replaceState({}, document.title, url.toString())
}

const buildFanReturnUrl = (kind: PaymentReturnKind) => {
  if (typeof window === 'undefined') return undefined
  const url = new URL('/user/', window.location.origin)
  url.searchParams.set('payment_return', kind)
  return url.toString()
}

const formatKsh = (amountCents?: number | null) => {
  if (!amountCents || amountCents <= 0) return 'Free'
  const value = Math.round(amountCents) / 100
  return `KSh ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

const formatSubscriptionAmount = (amountCents?: number | null, currency?: string | null) => {
  if (!amountCents || amountCents <= 0) return 'Free'
  const normalizedCurrency = (currency ?? 'KES').toUpperCase()
  if (normalizedCurrency === 'KES') {
    return formatKsh(amountCents)
  }
  const value = Math.round(amountCents) / 100
  return `${normalizedCurrency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

const formatMembershipDate = (value?: string | null) => {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const getMembershipStatusLabel = (status: SubscriptionHistoryItem['status']) => {
  switch (status) {
    case 'active':
      return 'Active'
    case 'canceled':
      return 'Canceled'
    default:
      return 'Expired'
  }
}

const formatWalletDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatCompactCount = (value: number) =>
  new Intl.NumberFormat(undefined, {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)

const getSessionIdentity = (session: any, userProfile?: UserProfile | null) => {
  const userId = typeof session?.user?.id === 'string' ? session.user.id : ''
  const email =
    typeof session?.user?.email === 'string' && session.user.email.trim()
      ? session.user.email.trim()
      : null
  const displayName =
    userProfile?.display_name?.trim() ||
    session?.user?.user_metadata?.full_name?.trim?.() ||
    session?.user?.user_metadata?.name?.trim?.() ||
    (email ? email.split('@')[0] : '') ||
    (userId ? userId.slice(0, 8) : '')

  return {
    userId,
    email,
    displayName,
    shortId: userId ? userId.slice(0, 8) : null,
  }
}

const getWalletEntryLabel = (entry: WalletHistoryItem) => {
  switch (entry.entry_type) {
    case 'credit_topup':
      return 'Top up received'
    case 'debit_ppv':
      return entry.post_title ? `Unlocked ${entry.post_title}` : 'PPV unlock'
    case 'debit_tip':
      return entry.creator ? `Tip sent to ${entry.creator.display_name}` : 'Tip sent'
    case 'debit_subscription':
      return entry.creator ? `Subscribed to ${entry.creator.display_name}` : 'Subscription'
    default:
      return 'Wallet refund'
  }
}

const getWalletEntryTone = (entryType: WalletHistoryItem['entry_type']) =>
  entryType === 'credit_topup' || entryType === 'refund' ? 'credit' : 'debit'

function AuthPrompt({
  onAuthSuccess,
}: {
  onAuthSuccess: (mode: 'sign_in' | 'sign_up', session: any | null) => void
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
  submitting,
  onEnter,
  onExit,
}: {
  open: boolean
  sessionPresent: boolean
  submitting: boolean
  onEnter: () => void
  onExit: () => void
}) {
  if (!open) return null
  return (
    <div className="age-overlay">
      <div className="age-backdrop" />
      <div className="age-modal" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
        <div className="age-kicker">18+ Verification</div>
        <h2 id="age-gate-title">
          This is an <span className="strong">adults only</span> platform
        </h2>
        <div className="age-copy">
          <p>The content on this site may include explicit material.</p>
          <p>
            Access is strictly limited to those who are 18 years of age or older, or the age of
            majority in your jurisdiction, whichever is greater.
          </p>
          <p>
            Please use parental controls and filtering tools to prevent minors from accessing
            age-restricted content. If you are under 18, or if such content is illegal in your
            location, please leave now.
          </p>
        </div>
        <p className="age-links">
          <a href={assetUrl('pages/terms.html')}>Terms</a> -{' '}
          <a href={assetUrl('pages/privacy.html')}>Privacy</a> -{' '}
          <a href={assetUrl('pages/usc2257.html')}>2257</a> -{' '}
          <a href={assetUrl('pages/acceptable-use-policy.html')}>Acceptable Use</a>
        </p>
        <div className="age-actions">
          <button
            className="age-btn age-btn-primary"
            type="button"
            onClick={onEnter}
            disabled={!sessionPresent || submitting}
          >
            {submitting
              ? 'Confirming age...'
              : sessionPresent
                ? "I'm 18 or older - enter"
                : 'Sign in to continue'}
          </button>
          <button
            className="age-btn age-btn-secondary"
            type="button"
            onClick={onExit}
            disabled={submitting}
          >
            I'm under 18 - exit
          </button>
        </div>
        <p className="age-footnote">
          You must be signed in so we can keep an auditable record of age confirmation.
        </p>
      </div>
    </div>
  )
}

function PurchasePrompt({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: PurchasePromptAction | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!action) return null

  const isSubscribe = action.kind === 'subscribe'
  const creatorName =
    action.kind === 'subscribe'
      ? action.creator.display_name ?? action.creator.handle ?? 'this creator'
      : action.post.creator.display_name ?? action.post.creator.handle ?? 'this creator'
  const title = isSubscribe
    ? action.insufficientBalance
      ? 'Top up wallet to subscribe'
      : action.priceCents > 0
        ? 'Confirm subscription'
        : 'Confirm free subscription'
    : action.insufficientBalance
      ? 'Top up wallet to unlock'
      : 'Confirm unlock'
  const body = isSubscribe
    ? action.insufficientBalance
      ? `You need ${formatKsh(action.priceCents)} to subscribe to ${creatorName}. Your wallet balance is ${formatKsh(action.walletBalanceMinor)}.`
      : action.priceCents > 0
        ? `Subscribe to ${creatorName} for ${formatKsh(action.priceCents)}. This amount will be deducted from your wallet balance.`
        : `Subscribe to ${creatorName}. This creator offers a free membership tier.`
    : action.insufficientBalance
      ? `You need ${formatKsh(action.priceCents)} to unlock this post. Your wallet balance is ${formatKsh(action.walletBalanceMinor)}.`
      : `Unlock this post for ${formatKsh(action.priceCents)}. The amount will be deducted from your wallet balance.`
  const confirmLabel = action.insufficientBalance
    ? 'Top up wallet'
    : isSubscribe
      ? action.priceCents > 0
        ? `Pay ${formatKsh(action.priceCents)}`
        : 'Subscribe'
      : `Unlock for ${formatKsh(action.priceCents)}`

  return (
    <div className="purchase-modal-overlay" role="presentation">
      <button
        className="purchase-modal-backdrop"
        type="button"
        aria-label="Close purchase prompt"
        onClick={busy ? undefined : onCancel}
      />
      <div
        className="purchase-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-modal-title"
      >
        <div className="purchase-modal__eyebrow">
          {isSubscribe ? 'Membership checkout' : 'Pay-per-view unlock'}
        </div>
        <h3 id="purchase-modal-title">{title}</h3>
        <p>{body}</p>
        <div className="purchase-modal__summary">
          <div className="purchase-modal__metric">
            <span>Wallet balance</span>
            <strong>{formatKsh(action.walletBalanceMinor)}</strong>
          </div>
          <div className="purchase-modal__metric">
            <span>{isSubscribe ? 'Membership price' : 'Unlock price'}</span>
            <strong>{formatKsh(action.priceCents)}</strong>
          </div>
        </div>
        <div className="purchase-modal__actions">
          <button
            className="purchase-modal__button purchase-modal__button--ghost"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            No
          </button>
          <button
            className="purchase-modal__button purchase-modal__button--primary"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
const sidebarNav = [
  { icon: FiHome, label: 'Home', key: 'home' },
  { icon: FiCompass, label: 'Explore', key: 'explore' },
  { icon: FiMessageCircle, label: 'Chats', key: 'chats' },
  { icon: FiBell, label: 'Notifications', key: 'notifications' },
  { icon: FiCreditCard, label: 'Wallet', key: 'wallet' },
  { icon: FiSettings, label: 'Settings', key: 'settings' },
  { icon: FiGift, label: 'Membership', key: 'membership' },
]

const mobilePrimaryNav = [
  { icon: FiHome, label: 'Home', key: 'home' },
  { icon: FiCompass, label: 'Explore', key: 'explore' },
  { icon: FiMessageCircle, label: 'Chats', key: 'chats' },
  { icon: FiBell, label: 'Alerts', key: 'notifications' },
]

const exploreSortOptions: { value: ExploreSort; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'price_asc', label: 'Price low-high' },
  { value: 'price_desc', label: 'Price high-low' },
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

const filters = ['All', ...topics.map((topic) => topic.label)]

function readRecentCreators(): CreatorCard[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_CREATORS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (value): value is CreatorCard =>
          Boolean(value) &&
          typeof value.id === 'string' &&
          typeof value.handle === 'string' &&
          typeof value.display_name === 'string'
      )
      .slice(0, 6)
  } catch {
    return []
  }
}

function persistRecentCreators(creators: CreatorCard[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RECENT_CREATORS_STORAGE_KEY, JSON.stringify(creators.slice(0, 6)))
}

function PillRow({ active, onSelect }: { active: string; onSelect: (value: string) => void }) {
  return (
    <div className="pill-row" role="toolbar" aria-label="Explore creator categories">
      {filters.map((f) => (
        <button
          key={f}
          className={`chip ${active === f ? 'active' : ''}`}
          onClick={() => onSelect(f)}
          type="button"
          aria-pressed={active === f}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

function AvatarChip({
  name,
  avatar,
  onClick,
}: {
  name: string
  avatar: string
  onClick?: () => void
}) {
  return (
    <button className="avatar-chip" type="button" onClick={onClick}>
      <img src={avatar} alt={name} />
      <span>{name}</span>
    </button>
  )
}

function SquareCard({
  name,
  tag,
  img,
  priceLabel,
  subscribed,
  onSubscribe,
  subscribing,
}: {
  name: string
  tag: string
  img: string
  priceLabel?: string | null
  subscribed?: boolean
  onSubscribe?: () => void
  subscribing?: boolean
}) {
  return (
    <div className="square-card">
      <div className="square-card__media">
        <img src={img} alt={name} />
        <div className="square-card__badge">{tag}</div>
      </div>
      <div className="square-card__body">
        <div className="square-card__head">
          <div className="card-name">{name}</div>
          {priceLabel ? <div className="square-card__price">{priceLabel}</div> : null}
        </div>
        <div className="card-tag">{tag}</div>
      </div>
      {onSubscribe ? (
        <button
          className="pill light full"
          onClick={onSubscribe}
          disabled={subscribed || subscribing}
          type="button"
        >
          {subscribed ? 'Subscribed' : subscribing ? 'Starting checkout...' : 'Subscribe'}
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

function TopicsGrid({
  activeTopic,
  onOpenTopic,
}: {
  activeTopic: string | null
  onOpenTopic: (value: string) => void
}) {
  return (
    <section className="topics">
      <div className="section-heading">
        <h3>Explore topics</h3>
      </div>
      <div className="topics-grid">
        {topics.map((t) => (
          <button
            key={t.label}
            className={`topic-tile ${activeTopic === t.label ? 'active' : ''}`}
            style={{ background: `linear-gradient(135deg, ${t.color[0]}, ${t.color[1]})` }}
            onClick={() => onOpenTopic(t.label)}
            type="button"
            aria-pressed={activeTopic === t.label}
          >
            <span>{t.label}</span>
            <div className="topic-icon">{t.icon}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

function ExplorePage({
  filter,
  onSelectFilter,
  onOpenTopic,
  onOpenCreator,
  activeSubscriptions,
  onSubscribe,
  subscribingCreatorId,
  recentCreators,
}: {
  filter: string
  onSelectFilter: (value: string) => void
  onOpenTopic: (value: string) => void
  onOpenCreator: (creator: CreatorCard) => void
  activeSubscriptions: string[]
  onSubscribe: (creator: CreatorCard) => void
  subscribingCreatorId: string | null
  recentCreators: CreatorCard[]
}) {
  const [recommendedCreators, setRecommendedCreators] = useState<CreatorCard[]>([])
  const [recommendedLoading, setRecommendedLoading] = useState(true)
  const [recommendedError, setRecommendedError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<ExploreSort>('recommended')
  const subscriptionSet = new Set(activeSubscriptions)
  const activeCategory = filter !== 'All' ? filter : null
  const exploreHeading = searchTerm || activeCategory ? 'Matching creators' : 'Popular this week'
  const activeTopic = activeCategory

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(searchInput.trim())
    }, 220)

    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    let isCurrent = true
    setRecommendedLoading(true)
    setRecommendedError(null)
    ;(async () => {
      try {
        const data = await fetchRecommendedCreators({
          searchTerm,
          category: filter,
          sortBy,
          limit: 12,
        })
        if (!isCurrent) return
        setRecommendedCreators(data)
      } catch (err) {
        console.error(err)
        if (!isCurrent) return
        setRecommendedCreators([])
        setRecommendedError('Could not load creators right now.')
      } finally {
        if (isCurrent) {
          setRecommendedLoading(false)
        }
      }
    })()

    return () => {
      isCurrent = false
    }
  }, [searchTerm, filter, sortBy])

  const searchSummary = useMemo(() => {
    const parts = []
    if (searchTerm) {
      parts.push(`"${searchTerm}"`)
    }
    if (activeCategory) {
      parts.push(activeCategory)
    }
    return parts.join(' in ')
  }, [activeCategory, searchTerm])

  return (
    <div className="explore">
      <section className="explore-hero">
        <div className="explore-hero__copy">
          <div className="explore-eyebrow">Discover creators</div>
          <h2>Explore</h2>
          <p>
            Search by niche, refine the feed, and find creators worth subscribing to without
            losing context.
          </p>
        </div>
        <div className="explore-hero__stats">
          <div className="explore-stat">
            <span className="explore-stat__label">Results</span>
            <strong>{recommendedLoading ? '...' : recommendedCreators.length}</strong>
          </div>
          <div className="explore-stat">
            <span className="explore-stat__label">Category</span>
            <strong>{activeCategory ?? 'All'}</strong>
          </div>
          <div className="explore-stat">
            <span className="explore-stat__label">Sort</span>
            <strong>{exploreSortOptions.find((option) => option.value === sortBy)?.label}</strong>
          </div>
        </div>
      </section>

      <div className="explore-controls">
        <div className="explore-toolbar">
          <div className="search-bar">
            <FiSearch size={18} />
            <input
              placeholder="Search creators or topics"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {searchInput ? (
              <button className="search-clear" type="button" onClick={() => setSearchInput('')}>
                Clear
              </button>
            ) : null}
          </div>
          <label className="explore-sort">
            <span>Sort by</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as ExploreSort)}>
              {exploreSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <PillRow active={filter} onSelect={onSelectFilter} />

        <div className="explore-meta">
          <div className="muted">
            {recommendedLoading
              ? 'Refreshing recommendations...'
              : `${recommendedCreators.length} creator${recommendedCreators.length === 1 ? '' : 's'} found`}
            {searchSummary ? ` for ${searchSummary}` : ''}
          </div>
          {(searchTerm || activeCategory || sortBy !== 'recommended') && (
            <button
              className="pill ghost"
              type="button"
              onClick={() => {
                setSearchInput('')
                setSearchTerm('')
                setSortBy('recommended')
                onSelectFilter('All')
              }}
            >
              Reset explore
            </button>
          )}
        </div>
      </div>

      <div className="recent-row">
        <div className="recent-row__head">
          <h3>Recently visited</h3>
          <span className="recent-row__hint">Jump back into creators you opened before.</span>
        </div>
        <div className="recent-chips">
          {recentCreators.length ? (
            recentCreators.map((creator) => (
              <AvatarChip
                key={creator.id}
                name={creator.display_name}
                avatar={creator.avatar_url ?? assetUrl('logo.png')}
                onClick={() => onOpenCreator(creator)}
              />
            ))
          ) : (
            <div className="explore-status">No recent visits yet.</div>
          )}
        </div>
      </div>

      <ExploreSection title={exploreHeading}>
        <div className="list-grid">
          {recommendedLoading && <p className="muted">Loading top creators...</p>}
          {!recommendedLoading && recommendedError && (
            <div className="explore-status explore-status--error">{recommendedError}</div>
          )}
          {!recommendedLoading && !recommendedError && !recommendedCreators.length && (
            <div className="explore-status">
              {searchSummary
                ? `No creators matched ${searchSummary}.`
                : 'No popular creators are available right now.'}
            </div>
          )}
          {!recommendedLoading &&
            !recommendedError &&
            recommendedCreators.map((c) => (
              <SquareCard
                key={c.id}
                name={c.display_name}
                tag={
                  filter !== 'All' &&
                  (c.category === filter || c.categories?.includes(filter))
                    ? filter
                    : c.category ?? c.handle
                }
                img={c.avatar_url ?? assetUrl('logo.png')}
                priceLabel={formatKsh(c.subscription_price_cents ?? 0)}
                subscribed={subscriptionSet.has(c.id)}
                subscribing={subscribingCreatorId === c.id}
                onSubscribe={() => onSubscribe(c)}
              />
            ))}
        </div>
      </ExploreSection>

      <TopicsGrid activeTopic={activeTopic} onOpenTopic={onOpenTopic} />
    </div>
  )
}

const formatChatTimestamp = (value: string | null) => {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / (1000 * 60))
  if (diffMinutes < 1) return 'now'
  if (diffMinutes < 60) return `${diffMinutes}m`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString()
}

function ChatsPage() {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([])
  const [chatableCreators, setChatableCreators] = useState<ChatableCreator[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const threadEndRef = useRef<HTMLDivElement | null>(null)

  const loadThreads = async (preserveSelection = true) => {
    try {
      const [nextThreads, nextCreators] = await Promise.all([
        fetchChatThreads(),
        fetchChatableCreators(),
      ])
      setThreads(nextThreads)
      setChatableCreators(nextCreators)

      if (!preserveSelection) {
        setSelectedThreadId(nextThreads[0]?.thread_id ?? null)
        return
      }

      setSelectedThreadId((current) => {
        if (selectedCreatorId) {
          const matchingThread = nextThreads.find(
            (thread) => thread.creator_id === selectedCreatorId
          )
          return matchingThread?.thread_id ?? null
        }
        if (current && nextThreads.some((thread) => thread.thread_id === current)) {
          return current
        }
        return nextThreads[0]?.thread_id ?? null
      })
    } catch (nextError: any) {
      console.error(nextError)
      setError(nextError?.message ?? 'Could not load your chats.')
    }
  }

  const loadMessages = async (threadId: string) => {
    setMessagesLoading(true)
    try {
      const nextMessages = await fetchChatMessages(threadId)
      setMessages(nextMessages)
      await markChatThreadRead(threadId)
    } catch (nextError: any) {
      console.error(nextError)
      setError(nextError?.message ?? 'Could not load this conversation.')
    } finally {
      setMessagesLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const [nextThreads, nextCreators] = await Promise.all([
          fetchChatThreads(),
          fetchChatableCreators(),
        ])
        if (!mounted) return
        setThreads(nextThreads)
        setChatableCreators(nextCreators)
        setSelectedThreadId(nextThreads[0]?.thread_id ?? null)
      } catch (nextError: any) {
        if (!mounted) return
        console.error(nextError)
        setError(nextError?.message ?? 'Could not load chats.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([])
      return
    }
    loadMessages(selectedThreadId)
  }, [selectedThreadId])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    let unsubscribe = () => {}
    ;(async () => {
      unsubscribe = await subscribeToMemberChatThreads(() => {
        loadThreads()
      })
    })()
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!selectedThreadId) return
    return subscribeToChatMessages(selectedThreadId, () => {
      loadMessages(selectedThreadId)
      loadThreads()
    })
  }, [selectedThreadId])

  const selectedThread =
    threads.find((thread) => thread.thread_id === selectedThreadId) ?? null
  const selectedStarter =
    chatableCreators.find((creator) => creator.creator_id === selectedCreatorId) ?? null

  const filteredThreads = threads.filter((thread) => {
    const haystack = [
      thread.peer_name,
      thread.peer_handle,
      thread.last_message_preview ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(searchTerm.trim().toLowerCase())
  })

  const starterCreators = chatableCreators.filter((creator) => {
    if (!searchTerm.trim()) return !threads.some((thread) => thread.creator_id === creator.creator_id)
    const haystack = [creator.display_name, creator.handle].join(' ').toLowerCase()
    return (
      !threads.some((thread) => thread.creator_id === creator.creator_id) &&
      haystack.includes(searchTerm.trim().toLowerCase())
    )
  })

  const handleSelectThread = (thread: ChatThreadSummary) => {
    setSelectedCreatorId(null)
    setSelectedThreadId(thread.thread_id)
    setShowComposer(false)
    setError(null)
  }

  const handleSelectCreator = (creator: ChatableCreator) => {
    const existingThread = threads.find((thread) => thread.creator_id === creator.creator_id)
    if (existingThread) {
      handleSelectThread(existingThread)
      return
    }

    setSelectedThreadId(null)
    setSelectedCreatorId(creator.creator_id)
    setMessages([])
    setDraft('')
    setShowComposer(false)
    setError(null)
  }

  const handleSend = async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const result = await sendChatMessage({
        body: draft,
        threadId: selectedThreadId,
        creatorId: selectedThread?.creator_id ?? selectedCreatorId,
      })
      setDraft('')
      await loadThreads(false)
      if (result?.thread_id) {
        setSelectedCreatorId(null)
        setSelectedThreadId(result.thread_id)
        await loadMessages(result.thread_id)
      }
    } catch (nextError: any) {
      console.error(nextError)
      setError(nextError?.message ?? 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="chats-page">
      <aside className="chat-list">
        <div className="chat-header">
          <div className="chat-header-copy">
            <h2>Chats</h2>
            <p>Direct messages with creators you support</p>
          </div>
          <div className="chat-actions">
            <div className="chat-count">{threads.length}</div>
            <button
              className="chat-action-btn"
              type="button"
              onClick={() => setShowComposer((prev) => !prev)}
              aria-label="Start a new chat"
            >
              <FiPlus />
            </button>
          </div>
        </div>

        <div className="chat-search">
          <FiSearch size={16} />
          <input
            type="search"
            placeholder="Search creators or messages"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="chat-intro">
          <div className="chat-intro-title">Inbox access</div>
          <div>
            Direct messages are available with creators you actively support.
            {chatableCreators.length ? ` ${chatableCreators.length} creator${chatableCreators.length === 1 ? '' : 's'} available to message.` : ''}
          </div>
        </div>

        {showComposer ? (
          <div className="chat-starters">
            <div className="chat-starters-title">
              Start a new chat
              <span>{starterCreators.length}</span>
            </div>
            {starterCreators.length ? (
              starterCreators.map((creator) => (
                <button
                  key={creator.creator_id}
                  className="chat-card starter"
                  type="button"
                  onClick={() => handleSelectCreator(creator)}
                >
                  <img
                    src={creator.avatar_url ?? assetUrl('logo.png')}
                    alt={creator.display_name}
                  />
                  <div className="chat-meta">
                    <div className="chat-name">{creator.display_name}</div>
                    <div className="chat-sub">@{creator.handle}</div>
                  </div>
                </button>
              ))
            ) : (
              <div className="muted">
                Subscribe to a creator first, or start from an existing conversation.
              </div>
            )}
          </div>
        ) : null}

        <div className="chat-cards">
          {loading ? (
            <div className="muted">Loading chats...</div>
          ) : filteredThreads.length ? (
            filteredThreads.map((thread) => (
              <button
                key={thread.thread_id}
                className={`chat-card ${selectedThreadId === thread.thread_id ? 'active' : ''}`}
                type="button"
                onClick={() => handleSelectThread(thread)}
              >
                <img
                  src={thread.peer_avatar_url ?? assetUrl('logo.png')}
                  alt={thread.peer_name}
                />
                <div className="chat-meta">
                  <div className="chat-card-top">
                    <div className="chat-name">{thread.peer_name}</div>
                    <div className="chat-time">{formatChatTimestamp(thread.last_message_at)}</div>
                  </div>
                  <div className="chat-sub">
                    {thread.peer_handle ? `@${thread.peer_handle}` : 'Creator'}
                  </div>
                  <div className="chat-preview">
                    {thread.last_message_preview ?? 'Start the conversation'}
                  </div>
                </div>
                {thread.unread_count > 0 ? (
                  <span className="chat-dot">{Math.min(thread.unread_count, 99)}</span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="chat-list-empty">
              <div className="chat-list-empty__title">No direct messages yet</div>
              <div className="chat-list-empty__copy">
                Start a new chat from your subscribed creators when you are ready.
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="chat-main">
        {selectedThread || selectedStarter ? (
          <>
            <div className="chat-topbar">
              <div className="chat-peer">
                <img
                  src={
                    selectedThread?.peer_avatar_url ??
                    selectedStarter?.avatar_url ??
                    assetUrl('logo.png')
                  }
                  alt={selectedThread?.peer_name ?? selectedStarter?.display_name ?? 'Chat'}
                />
                <div>
                  <div className="chat-peer-name">
                    {selectedThread?.peer_name ?? selectedStarter?.display_name}
                  </div>
                  <div className="chat-peer-handle">
                    {selectedThread?.peer_handle
                      ? `@${selectedThread.peer_handle}`
                      : selectedStarter?.handle
                        ? `@${selectedStarter.handle}`
                        : 'Subscribed creator'}
                  </div>
                </div>
              </div>
              <div className="chat-topbar-badge">
                {selectedThread ? 'Live conversation' : 'New conversation'}
              </div>
            </div>

            <div className="chat-thread-body">
              {messagesLoading ? (
                <div className="chat-empty-state">Loading messages...</div>
              ) : messages.length ? (
                messages.map((message) => (
                  <div
                    key={message.message_id}
                    className={`chat-bubble ${message.sender_role === 'member' ? 'me' : 'other'}`}
                  >
                    <div className="chat-bubble-text">{message.body}</div>
                    <div className="chat-bubble-time">
                      {formatChatTimestamp(message.created_at)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="chat-empty-state">
                  <div className="chat-empty-state__title">Say hello</div>
                  <div className="chat-empty-state__copy">
                    Send the first message to start this conversation.
                  </div>
                </div>
              )}
              <div ref={threadEndRef} />
            </div>

            <div className="chat-composer">
              <textarea
                placeholder="Type a message..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
              />
              <button
                className="send-btn"
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
              >
                <FiSend size={16} />
                <span>{sending ? 'Sending...' : 'Send'}</span>
              </button>
            </div>
          </>
        ) : (
          <div className="chat-guidelines">
            <div className="chat-guidelines-card">
              <div className="chat-guidelines-icon">
                <FiMessageCircle size={26} />
              </div>
              <h3>No chat selected</h3>
              <p>
                Choose an existing conversation or start a new direct message with a creator you are
                actively subscribed to.
              </p>
            </div>
          </div>
        )}
        {error ? <div className="chat-error">{error}</div> : null}
      </main>
    </div>
  )
}

type NotificationFilter = 'all' | 'unread' | 'messages' | 'payments' | 'subscriptions' | 'content'

function formatNotificationTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Just now'

  const diffMs = Date.now() - timestamp
  const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)))
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return new Date(value).toLocaleDateString()
}

function getNotificationFilter(type: string): Exclude<NotificationFilter, 'all' | 'unread'> {
  if (type === 'chat_message') return 'messages'
  if (
    [
      'wallet_topup_succeeded',
      'wallet_topup_failed',
      'tip_sent',
      'ppv_unlocked',
      'payout_requested',
      'payout_submitted',
      'payout_success',
      'payout_failed',
      'payout_reversed',
    ].includes(type)
  ) {
    return 'payments'
  }
  if (['subscription_active', 'subscription_renewed', 'new_subscription'].includes(type)) {
    return 'subscriptions'
  }
  return 'content'
}

function getNotificationTitle(item: AppNotification) {
  const payload = item.payload ?? {}
  if (item.type === 'chat_message') return `New message from ${payload.from_name ?? 'someone'}`
  if (item.type === 'creator_post_published') return `${payload.creator_name ?? 'A creator'} posted new content`
  if (item.type === 'wallet_topup_succeeded') return 'Wallet top-up successful'
  if (item.type === 'wallet_topup_failed') return 'Wallet top-up failed'
  if (item.type === 'subscription_active') return `Subscribed to ${payload.creator_name ?? 'a creator'}`
  if (item.type === 'subscription_renewed') return 'Subscription renewed'
  if (item.type === 'tip_sent') return `Tip sent to ${payload.creator_name ?? 'a creator'}`
  if (item.type === 'ppv_unlocked') return `Unlocked ${payload.post_title ?? 'a post'}`
  return 'New activity'
}

function getNotificationDetail(item: AppNotification) {
  const payload = item.payload ?? {}
  if (item.type === 'chat_message') return payload.preview ?? 'Open chats to read the latest message.'
  if (item.type === 'creator_post_published') {
    return payload.post_title
      ? `${payload.post_title} is now available in your feed.`
      : 'Open Home to view the latest creator content.'
  }
  if (item.type === 'wallet_topup_succeeded') {
    return `Your wallet was credited with ${formatKsh(payload.amount_cents ?? 0)}.`
  }
  if (item.type === 'wallet_topup_failed') {
    return payload.result_desc ?? 'Your top-up could not be completed. Try again.'
  }
  if (item.type === 'subscription_active' || item.type === 'subscription_renewed') {
    return payload.current_period_end
      ? `Access is active until ${new Date(payload.current_period_end).toLocaleDateString()}.`
      : 'Your membership access is active.'
  }
  if (item.type === 'tip_sent') {
    return `Amount: ${formatKsh(payload.amount_cents ?? 0)}.`
  }
  if (item.type === 'ppv_unlocked') {
    return `Amount: ${formatKsh(payload.amount_cents ?? 0)}.`
  }
  return 'Open the app to see the latest activity.'
}

function getNotificationTargetPage(
  item: AppNotification
):
  | 'home'
  | 'explore'
  | 'chats'
  | 'notifications'
  | 'wallet'
  | 'settings'
  | 'membership'
  | 'features' {
  if (item.type === 'chat_message') return 'chats'
  if (['wallet_topup_succeeded', 'wallet_topup_failed', 'tip_sent', 'ppv_unlocked'].includes(item.type)) {
    return 'wallet'
  }
  if (['subscription_active', 'subscription_renewed'].includes(item.type)) {
    return 'membership'
  }
  return 'home'
}

function NotificationsPage({
  onNavigate,
}: {
  onNavigate: (
    page:
      | 'home'
      | 'explore'
      | 'chats'
      | 'notifications'
      | 'wallet'
      | 'settings'
      | 'membership'
      | 'features'
  ) => void
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    let unsubscribe = () => {}

    const loadNotifications = async () => {
      try {
        if (isMounted) {
          setLoading(true)
          setError(null)
        }
        const items = await fetchNotifications()
        if (isMounted) setNotifications(items)
      } catch (err) {
        console.error(err)
        if (isMounted) setError('Could not load notifications right now.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void loadNotifications()
    void (async () => {
      unsubscribe = await subscribeToNotifications(() => {
        void loadNotifications()
      })
    })()

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications
    if (filter === 'unread') return notifications.filter((item) => !item.read_at)
    return notifications.filter((item) => getNotificationFilter(item.type) === filter)
  }, [filter, notifications])

  const unreadCount = notifications.filter((item) => !item.read_at).length

  const openNotification = async (item: AppNotification) => {
    try {
      if (!item.read_at) {
        await markNotificationRead(item.id)
        setNotifications((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry
          )
        )
      }
    } catch (err) {
      console.error(err)
    }
    onNavigate(getNotificationTargetPage(item))
  }

  const handleMarkAllRead = async () => {
    try {
      setBusy(true)
      await markAllNotificationsRead()
      setNotifications((prev) =>
        prev.map((entry) => ({ ...entry, read_at: entry.read_at ?? new Date().toISOString() }))
      )
    } catch (err) {
      console.error(err)
      setError('Could not mark notifications as read.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <div>
          <h2>Notifications</h2>
          <p className="notif-subtitle">Stay on top of chats, payments, subscriptions, and new creator content.</p>
        </div>
        <button
          className="pill ghost"
          onClick={handleMarkAllRead}
          disabled={!unreadCount || busy}
        >
          {busy ? 'Updating...' : 'Mark all read'}
        </button>
      </div>

      <div className="notif-filters">
        {[
          ['all', 'All'],
          ['unread', 'Unread'],
          ['messages', 'Messages'],
          ['payments', 'Payments'],
          ['subscriptions', 'Subscriptions'],
          ['content', 'Content'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`notif-filter-pill ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key as NotificationFilter)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="chat-error notifications-error">{error}</div> : null}

      {loading ? (
        <div className="notifications-loading">Loading notifications...</div>
      ) : filteredNotifications.length ? (
        <div className="notifications-list">
          {filteredNotifications.map((item: AppNotification) => (
            <button
              key={item.id}
              type="button"
              className={`notification-card ${item.read_at ? '' : 'is-unread'}`}
              onClick={() => void openNotification(item)}
            >
              <div className="notification-card__icon">
                <FiBell size={18} />
              </div>
              <div className="notification-card__body">
                <div className="notification-card__top">
                  <span className="notification-card__title">{getNotificationTitle(item)}</span>
                  <span className="notification-card__time">{formatNotificationTime(item.created_at)}</span>
                </div>
                <div className="notification-card__detail">{getNotificationDetail(item)}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="notifications-empty">
          <div className="notif-icon">
            <FiBell size={24} />
          </div>
          <div className="notif-title">No notifications yet</div>
          <div className="notif-sub">
            You'll see chats, creator updates, wallet top-ups, and membership activity here.
          </div>
        </div>
      )}
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

const settingsTabDescriptions: Record<string, string> = {
  Basics: 'Profile identity and verified account details.',
  Account: 'Security, login provider, and support access.',
  'Email notifications': 'Choose which alerts reach you in-app, email, and SMS.',
  Memberships: 'Track active creator support and recurring subscriptions.',
  'Billing history': 'Review wallet funds and recent payment activity.',
  More: 'Open wallet tools, support channels, and compliance links.',
}

function SettingsTabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <div className="settings-tabs">
      {settingsTabs.map((t) => (
        <button
          key={t}
          className={`settings-tab ${active === t ? 'active' : ''}`}
          onClick={() => onChange(t)}
          type="button"
        >
          <span className="settings-tab-label">{t}</span>
          {active === t ? <span className="settings-tab-dot" /> : null}
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

  const identity = getSessionIdentity(session, userProfile)
  const displayName = identity.displayName || 'Account'
  const email = identity.email
  const username = userProfile?.username?.trim() || null
  const avatar = session.user.user_metadata?.avatar_url ?? assetUrl('logo.png')
  const joinDate = session.user.created_at
    ? new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(
        new Date(session.user.created_at)
      )
    : null

  return (
    <div className="settings-card">
      <div className="settings-profile-hero">
        <div className="profile-avatar">
          <img src={avatar} alt={displayName || 'Profile'} />
          <div className="lock-pill mini">
            <FiLock size={12} />
          </div>
        </div>
        <div className="settings-profile-copy">
          <div className="settings-card-kicker">Profile overview</div>
          <div className="settings-profile-name">{displayName}</div>
          <div className="settings-profile-meta">
            {username ? <span>@{username}</span> : null}
            {email ? <span>{email}</span> : null}
          </div>
          <div className="settings-profile-pills">
            <span className="pill ghost">Private account controls</span>
            {joinDate ? <span className="pill ghost">Member since {joinDate}</span> : null}
          </div>
        </div>
      </div>
      <div className="settings-form-grid">
        <div className="settings-field">
          <label className="input-label">Display name</label>
          <input className="text-input" value={displayName} readOnly />
        </div>
        {username ? (
          <div className="settings-field">
            <label className="input-label">Username</label>
            <input className="text-input" value={username} readOnly />
          </div>
        ) : null}
        {email ? (
          <div className="settings-field settings-field--full">
            <label className="input-label">Email</label>
            <input className="text-input" value={email} readOnly />
          </div>
        ) : null}
      </div>
      <div className="settings-card-footer">
        <div className="muted small">
          Profile details are read from your verified account session and creator records.
        </div>
      </div>
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
  const providerLabel = provider ? `Signed in with ${provider}` : 'Authenticated session'
  const providerMark = provider ? provider.slice(0, 1).toUpperCase() : null
  const identity = getSessionIdentity(session)
  const email = identity.email
  const userId = identity.userId

  return (
    <div className="settings-stack">
      <div className="settings-card">
        <div className="card-title">Login</div>
        <div className="notice brown">
          Authentication, password recovery, and session verification are handled by your sign-in
          provider.
        </div>
        <div className="login-row">
          <div className="login-provider">
            {providerMark ? (
              <span role="img" aria-label="provider">
                {providerMark}
              </span>
            ) : null}
            <div>
              <div className="name">{providerLabel}</div>
              {email ? <div className="muted">{email}</div> : null}
            </div>
          </div>
        </div>
      </div>

      {(email || userId) && (
        <div className="settings-card">
          <div className="card-title">Account identity</div>
          <div className="field-grid two">
            {email ? (
              <div>
                <label className="input-label">Current email</label>
                <input className="text-input" value={email} readOnly />
              </div>
            ) : null}
            {userId ? (
              <div>
                <label className="input-label">User ID</label>
                <input className="text-input" value={userId} readOnly />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {HELP_CENTER_URL || SUPPORT_EMAIL ? (
        <div className="settings-card">
          <div className="card-title">Support</div>
          <div className="muted">
            Use official support channels for billing, access, and account recovery questions.
          </div>
          <div className="button-row">
            {HELP_CENTER_URL ? (
              <button
                className="pill ghost"
                type="button"
                onClick={() => window.open(HELP_CENTER_URL, '_blank', 'noopener,noreferrer')}
              >
                Help Center
              </button>
            ) : null}
            {SUPPORT_EMAIL ? (
              <button
                className="pill ghost"
                type="button"
                onClick={() => {
                  window.location.href = `mailto:${SUPPORT_EMAIL}`
                }}
              >
                Email support
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EmailNotificationsCard() {
  const [form, setForm] = useState<NotificationPreferences>({
    push: true,
    email: true,
    sms: false,
    messages: true,
    payments: true,
    subscriptions: true,
    content: true,
  })
  const [saved, setSaved] = useState<NotificationPreferences>(form)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadPreferences = async () => {
      try {
        const prefs = await fetchNotificationPreferences()
        if (!isMounted) return
        setForm(prefs)
        setSaved(prefs)
      } catch (err) {
        console.error(err)
        if (isMounted) setError('Could not load notification preferences right now.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void loadPreferences()

    return () => {
      isMounted = false
    }
  }, [])

  const hasChanges = useMemo(() => {
    return Object.keys(form).some(
      (key) => form[key as keyof NotificationPreferences] !== saved[key as keyof NotificationPreferences]
    )
  }, [form, saved])

  const updateToggle = (key: keyof NotificationPreferences) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      const next = await updateNotificationPreferences(form)
      setForm(next)
      setSaved(next)
    } catch (err) {
      console.error(err)
      setError('Could not save notification preferences right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-stack">
      <div className="settings-card">
        <div className="card-title">Notification preferences</div>
        <div className="muted small">Control which in-app alerts appear in your notifications feed.</div>
        {error ? <div className="alert-error">{error}</div> : null}
        <div className="toggle-group">
          {[
            ['push', 'In-app notifications', 'Show notifications inside the app'],
            ['email', 'Email alerts', 'Save email preferences for account updates'],
            ['sms', 'SMS alerts', 'Save SMS preferences for urgent notices'],
            ['messages', 'Messages', 'Notify me about new chat messages'],
            ['payments', 'Payments', 'Notify me about wallet, tips, and purchases'],
            ['subscriptions', 'Subscriptions', 'Notify me when memberships start or renew'],
            ['content', 'Creator content', 'Notify me when creators publish new posts or stories'],
          ].map(([key, label, description]) => (
            <div key={key} className="toggle-row">
              <div>
                <div className="name">{label}</div>
                <div className="muted small">{description}</div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={form[key as keyof NotificationPreferences]}
                  onChange={() => updateToggle(key as keyof NotificationPreferences)}
                  disabled={loading || saving}
                />
                <span className="slider" />
              </label>
            </div>
          ))}
        </div>
        <div className="button-right">
          <button className="pill light" onClick={() => void handleSave()} disabled={loading || saving || !hasChanges}>
            {saving ? 'Saving...' : 'Save preferences'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MembershipsCard({
  history,
  onOpenCreator,
}: {
  history: SubscriptionHistoryItem[]
  onOpenCreator: (creator: CreatorCard) => void
}) {
  const primaryMembership = history[0]
  return (
    <div className="settings-card horizontal">
      {primaryMembership ? (
        <>
          <button
            className="brand-block brand-block--button"
            type="button"
            onClick={() => onOpenCreator(primaryMembership.creator)}
          >
            <img
              src={primaryMembership.creator.avatar_url ?? assetUrl('logo.png')}
              alt={primaryMembership.creator.display_name}
            />
            <div>
              <div className="name">{primaryMembership.creator.display_name}</div>
              <div className="muted">
                {formatSubscriptionAmount(
                  primaryMembership.amount_cents,
                  primaryMembership.currency
                )}
              </div>
            </div>
          </button>
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
  walletHistory,
  walletTopupAmount,
  walletTopupPhone,
  topupPending,
  onTopupAmountChange,
  onTopupPhoneChange,
  onTopup,
}: {
  walletBalance: WalletBalance | null
  walletHistory: WalletHistoryItem[]
  walletTopupAmount: string
  walletTopupPhone: string
  topupPending: boolean
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
          <button
            className="pill light wallet-action-btn"
            onClick={onTopup}
            type="button"
            disabled={topupPending}
          >
            {topupPending
              ? MPESA_STK_ENABLED
                ? 'Sending M-PESA prompt...'
                : 'Starting top up...'
              : MPESA_STK_ENABLED
                ? 'Top up via M-PESA'
                : 'Top up wallet'}
          </button>
        </div>
      </div>
      <div className="divider" style={{ margin: '16px 0' }} />
      {walletHistory.length ? (
        <div className="settings-stack">
          {walletHistory.slice(0, 5).map((entry) => (
            <div key={entry.id} className="payment-row">
              <div>
                <div className="name">{getWalletEntryLabel(entry)}</div>
                <div className="muted small">{formatWalletDate(entry.created_at)}</div>
              </div>
              <div className={`payment-value ${getWalletEntryTone(entry.entry_type)}`}>
                {entry.entry_type === 'credit_topup' || entry.entry_type === 'refund' ? '+' : '-'}
                {formatKsh(entry.amount_minor)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted small">No payment history to display yet.</div>
      )}
    </div>
  )
}

function SettingsPage({
  tab,
  onTabChange,
  paymentRef,
  onPaymentClick,
  session,
  userProfile,
  walletBalance,
  walletHistory,
  walletTopupAmount,
  walletTopupPhone,
  topupPending,
  onTopupAmountChange,
  onTopupPhoneChange,
  onTopup,
  subscriptionHistory,
  onOpenCreator,
}: {
  tab: string
  onTabChange: (t: string) => void
  paymentRef: React.RefObject<HTMLDivElement | null>
  onPaymentClick: () => void
  session: any
  userProfile: UserProfile | null
  walletBalance: WalletBalance | null
  walletHistory: WalletHistoryItem[]
  walletTopupAmount: string
  walletTopupPhone: string
  topupPending: boolean
  onTopupAmountChange: (value: string) => void
  onTopupPhoneChange: (value: string) => void
  onTopup: () => void
  subscriptionHistory: SubscriptionHistoryItem[]
  onOpenCreator: (creator: CreatorCard) => void
}) {
  const [localTab, setLocalTab] = useState(tab)

  useEffect(() => setLocalTab(tab), [tab])

  const changeTab = (t: string) => {
    setLocalTab(t)
    onTabChange(t)
  }
  const activeDescription = settingsTabDescriptions[localTab] ?? 'Manage your account preferences.'

  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <div className="settings-eyebrow">Fan account</div>
          <h2>Settings</h2>
          <p className="settings-subtitle">{activeDescription}</p>
        </div>
        <div className="settings-hero-metrics">
          <div className="settings-metric">
            <span className="settings-metric-label">Wallet</span>
            <strong>{formatKsh(walletBalance?.available_amount_minor ?? 0)}</strong>
          </div>
          <div className="settings-metric">
            <span className="settings-metric-label">Memberships</span>
            <strong>{subscriptionHistory.length}</strong>
          </div>
          <div className="settings-metric">
            <span className="settings-metric-label">Active tab</span>
            <strong>{localTab}</strong>
          </div>
        </div>
      </div>
      <SettingsTabs active={localTab} onChange={changeTab} />
      <div className="settings-panel">
        {localTab === 'Basics' && <BasicsCard session={session} userProfile={userProfile} />}
        {localTab === 'Account' && <AccountCard session={session} />}
        {localTab === 'Email notifications' && <EmailNotificationsCard />}
        {localTab === 'Memberships' && (
          <MembershipsCard history={subscriptionHistory} onOpenCreator={onOpenCreator} />
        )}
        {localTab === 'Billing history' && (
          <BillingHistoryCard
            walletBalance={walletBalance}
            walletHistory={walletHistory}
            walletTopupAmount={walletTopupAmount}
            walletTopupPhone={walletTopupPhone}
            topupPending={topupPending}
            onTopupAmountChange={onTopupAmountChange}
            onTopupPhoneChange={onTopupPhoneChange}
            onTopup={onTopup}
          />
        )}
        {localTab === 'More' && (
          <div className="settings-stack">
            <div className="settings-card" ref={paymentRef}>
              <div className="card-title">Wallet & payments</div>
              <button className="pill ghost" onClick={onPaymentClick} type="button">
                Open wallet
              </button>
              <div className="muted small">
                Review balance, history, and top-up options in the wallet page.
              </div>
            </div>
            {(HELP_CENTER_URL || SUPPORT_EMAIL) && (
              <div className="settings-card">
                <div className="card-title">Support</div>
                <div className="button-row">
                  {HELP_CENTER_URL ? (
                    <button
                      className="pill ghost"
                      type="button"
                      onClick={() => window.open(HELP_CENTER_URL, '_blank', 'noopener,noreferrer')}
                    >
                      Help Center
                    </button>
                  ) : null}
                  {SUPPORT_EMAIL ? (
                    <button
                      className="pill ghost"
                      type="button"
                      onClick={() => {
                        window.location.href = `mailto:${SUPPORT_EMAIL}`
                      }}
                    >
                      Email support
                    </button>
                  ) : null}
                </div>
              </div>
            )}
            <div className="settings-card">
              <div className="card-title">Session & privacy</div>
              <div className="muted">
                This account uses signed sessions, verified age access, and policy links shown below.
              </div>
            </div>
            <div className="settings-card">
              <div className="card-title">Policies & Compliance</div>
              <div className="footer-links">
                <a href={assetUrl('pages/terms.html')}>Terms</a>
                <a href={assetUrl('pages/privacy.html')}>Privacy</a>
                <a href={assetUrl('pages/cookies.html')}>Cookies</a>
                <a href={assetUrl('pages/acceptable-use-policy.html')}>Acceptable Use</a>
                <a href={assetUrl('pages/usc2257.html')}>2257</a>
              </div>
              <div className="footer-note">Age verification required. Adults 18+ only.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MembershipPage({
  tab,
  onTabChange,
  giftRef,
  onGoPayment,
  paymentPending,
  showGiftCreator,
  history,
  onOpenCreator,
}: {
  tab: 'Membership' | 'Gift Creator'
  onTabChange: (t: 'Membership' | 'Gift Creator') => void
  giftRef: React.RefObject<HTMLDivElement | null>
  onGoPayment: () => void
  paymentPending: boolean
  showGiftCreator: boolean
  history: SubscriptionHistoryItem[]
  onOpenCreator: (creator: CreatorCard) => void
}) {
  return (
    <div className="membership-page">
      <div className="membership-header">
        <div>
          <h2>Memberships</h2>
          <p className="muted">Track all creator subscriptions, amounts paid, and expiry dates in one place.</p>
        </div>
        <div className="membership-tab-row">
          <button
            className={`chip ${tab === 'Membership' ? 'active' : ''}`}
            type="button"
            onClick={() => onTabChange('Membership')}
          >
            Subscription history
          </button>
          {showGiftCreator ? (
            <button
              className={`chip ${tab === 'Gift Creator' ? 'active' : ''}`}
              type="button"
              onClick={() => onTabChange('Gift Creator')}
            >
              Gift creator
            </button>
          ) : null}
        </div>
      </div>

      {tab === 'Membership' || !showGiftCreator ? (
        <section className="membership-history-card">
          <div className="membership-history-card__head">
            <div>
              <h3>All subscriptions</h3>
              <p className="muted">
                Tap any creator name to open their page and review their public content.
              </p>
            </div>
            <div className="membership-history-count">
              {history.length} {history.length === 1 ? 'subscription' : 'subscriptions'}
            </div>
          </div>
          {history.length ? (
            <div className="membership-history-list">
              {history.map((item) => (
                <article key={item.payment_id} className="membership-history-item">
                  <div className="membership-history-item__creator">
                    <img
                      src={item.creator.avatar_url ?? assetUrl('logo.png')}
                      alt={item.creator.display_name}
                    />
                    <div>
                      <button
                        className="membership-history-item__name"
                        type="button"
                        onClick={() => onOpenCreator(item.creator)}
                      >
                        {item.creator.display_name}
                      </button>
                      <div className="muted">@{item.creator.handle}</div>
                    </div>
                  </div>
                  <div className="membership-history-item__meta">
                    <span className="muted small">Amount</span>
                    <strong>{formatSubscriptionAmount(item.amount_cents, item.currency)}</strong>
                  </div>
                  <div className="membership-history-item__meta">
                    <span className="muted small">Started</span>
                    <strong>{formatMembershipDate(item.subscribed_at)}</strong>
                  </div>
                  <div className="membership-history-item__meta">
                    <span className="muted small">Expires</span>
                    <strong>{formatMembershipDate(item.expires_at)}</strong>
                  </div>
                  <div className="membership-history-item__status">
                    <span className={`status-pill ${item.status}`}>
                      {getMembershipStatusLabel(item.status)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="membership-history-empty">
              <h3>No subscriptions yet</h3>
              <p className="muted">
                Once you subscribe to a creator, the payment amount and expiry date will appear here.
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="membership-history-card" ref={giftRef}>
          <div className="membership-history-card__head">
            <div>
              <h3>Gift creator</h3>
              <p className="muted">Support a featured creator through secure checkout.</p>
            </div>
          </div>
          <div className="gift-creator gift-creator--simple">
            <div>
              <div className="name">Send a creator gift</div>
              <p className="muted">
                We’ll take you to payment and create a secure gift checkout for the featured creator.
              </p>
            </div>
            <button className="primary-btn" onClick={onGoPayment} type="button" disabled={paymentPending}>
              {paymentPending ? 'Preparing checkout...' : 'Go to payment'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

type WalletTab = 'overview' | 'send' | 'receive' | 'history'

function WalletPage({
  session,
  activeTab,
  onTabChange,
  walletBalance,
  walletHistory,
  walletTopupAmount,
  walletTopupPhone,
  topupPending,
  preferredCreator,
  onTopupAmountChange,
  onTopupPhoneChange,
  onTopup,
  subscriptionHistory,
  onOpenCreator,
  onSendTip,
}: {
  session: any
  activeTab: WalletTab
  onTabChange: (tab: WalletTab) => void
  walletBalance: WalletBalance | null
  walletHistory: WalletHistoryItem[]
  walletTopupAmount: string
  walletTopupPhone: string
  topupPending: boolean
  preferredCreator: CreatorCard | null
  onTopupAmountChange: (value: string) => void
  onTopupPhoneChange: (value: string) => void
  onTopup: () => void
  subscriptionHistory: SubscriptionHistoryItem[]
  onOpenCreator: (creator: CreatorCard) => void
  onSendTip: (creator: CreatorCard, amountMajor: number) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<CreatorCard[]>([])
  const [selectedCreator, setSelectedCreator] = useState<CreatorCard | null>(null)
  const [sendAmount, setSendAmount] = useState('500')
  const [sending, setSending] = useState(false)

  const walletTabs: Array<{ key: WalletTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'send', label: 'Send' },
    { key: 'receive', label: 'Receive / Top up' },
    { key: 'history', label: 'History' },
  ]

  const quickCreators = useMemo(() => {
    const byId = new Map<string, CreatorCard>()
    for (const item of subscriptionHistory) {
      if (!byId.has(item.creator.id)) {
        byId.set(item.creator.id, item.creator)
      }
    }
    return Array.from(byId.values()).slice(0, 6)
  }, [subscriptionHistory])

  useEffect(() => {
    if (!selectedCreator && quickCreators.length > 0) {
      setSelectedCreator(quickCreators[0])
    }
  }, [quickCreators, selectedCreator])

  useEffect(() => {
    if (preferredCreator) {
      setSelectedCreator(preferredCreator)
      if (activeTab !== 'send') {
        onTabChange('send')
      }
    }
  }, [activeTab, onTabChange, preferredCreator])

  useEffect(() => {
    let cancelled = false
    const normalizedSearch = search.trim()
    if (!normalizedSearch) {
      setSearchResults([])
      return () => {
        cancelled = true
      }
    }

    ;(async () => {
      const results = await fetchRecommendedCreators({
        searchTerm: normalizedSearch,
        limit: 8,
      })
      if (!cancelled) {
        setSearchResults(results)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [search])

  const availableAmount = walletBalance?.available_amount_minor ?? 0
  const pendingAmount = walletBalance?.pending_amount_minor ?? 0
  const walletCurrency = walletBalance?.currency ?? 'KES'
  const creatorOptions = search.trim() ? searchResults : quickCreators
  const identity = getSessionIdentity(session)
  const walletAccountLabel = identity.email ?? identity.shortId ?? 'Authenticated account'

  const handleSend = async () => {
    if (!selectedCreator) return
    const amountMajor = Number(sendAmount)
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) return
    try {
      setSending(true)
      await onSendTip(selectedCreator, amountMajor)
    } finally {
      setSending(false)
    }
  }

  const recentHistory = walletHistory.slice(0, 4)

  return (
    <div className="wallet-page">
      <div className="wallet-page__header">
        <div>
          <h2>Wallet</h2>
          <p>Manage your balance, top up safely, and support creators from one place.</p>
        </div>
        <div className="wallet-tabs">
          {walletTabs.map((tab) => (
            <button
              key={tab.key}
              className={`chip ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => onTabChange(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <section className="wallet-summary-grid">
        <div className="wallet-summary-card">
          <span className="wallet-summary-card__label">Available balance</span>
          <strong>{formatSubscriptionAmount(availableAmount, walletCurrency)}</strong>
          <p>Ready for PPV unlocks and future wallet actions.</p>
        </div>
        <div className="wallet-summary-card">
          <span className="wallet-summary-card__label">Pending</span>
          <strong>{formatSubscriptionAmount(pendingAmount, walletCurrency)}</strong>
          <p>Incoming credits appear here until the provider confirms them.</p>
        </div>
        <div className="wallet-summary-card wallet-summary-card--actions">
          <span className="wallet-summary-card__label">Quick actions</span>
          <div className="wallet-quick-actions">
            <button className="pill light wallet-action-btn" type="button" onClick={() => onTabChange('receive')}>
              Top up now
            </button>
            <button className="pill ghost" type="button" onClick={() => onTabChange('send')}>
              Send support
            </button>
          </div>
        </div>
      </section>

      {activeTab === 'overview' && (
        <div className="wallet-main-grid">
          <section className="wallet-card">
            <div className="wallet-card__head">
              <div>
                <h3>Top up & receive</h3>
                <p>Add money to your fan wallet and use it instantly after confirmation.</p>
              </div>
            </div>
            <div className="wallet-receive-note">
              <strong>Account</strong>
              <span>{walletAccountLabel}</span>
            </div>
            <div className="wallet-receive-note">
              <strong>Currency</strong>
              <span>{walletCurrency}</span>
            </div>
            <div className="wallet-card__actions">
              <button className="pill light wallet-action-btn" type="button" onClick={() => onTabChange('receive')}>
                Open top up
              </button>
            </div>
          </section>

          <section className="wallet-card">
            <div className="wallet-card__head">
              <div>
                <h3>Recent activity</h3>
                <p>Your latest wallet entries appear here.</p>
              </div>
              <button className="wallet-link-button" type="button" onClick={() => onTabChange('history')}>
                View all
              </button>
            </div>
            {recentHistory.length ? (
              <div className="wallet-history-list">
                {recentHistory.map((entry) => (
                  <div className="wallet-history-item" key={entry.id}>
                    <div>
                      <div className="wallet-history-item__title">{getWalletEntryLabel(entry)}</div>
                      <div className="wallet-history-item__meta">{formatWalletDate(entry.created_at)}</div>
                    </div>
                    <div className={`wallet-history-item__amount ${getWalletEntryTone(entry.entry_type)}`}>
                      {getWalletEntryTone(entry.entry_type) === 'credit' ? '+' : '-'}
                      {formatSubscriptionAmount(entry.amount_minor, entry.currency)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="wallet-empty">Your wallet activity will appear here after your first top up or unlock.</div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'send' && (
        <section className="wallet-card wallet-card--full">
          <div className="wallet-card__head">
            <div>
              <h3>Send support</h3>
              <p>Send a secure tip to a creator. We only launch real creator tip checkout here.</p>
            </div>
          </div>

          <div className="wallet-send-layout">
            <div className="wallet-send-panel">
              <label className="input-label">Find creator</label>
              <input
                className="text-input"
                type="text"
                placeholder="Search creators by name or handle"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <div className="wallet-creator-grid">
                {creatorOptions.length ? (
                  creatorOptions.map((creator) => (
                    <button
                      key={creator.id}
                      type="button"
                      className={`wallet-creator-option ${selectedCreator?.id === creator.id ? 'active' : ''}`}
                      onClick={() => setSelectedCreator(creator)}
                    >
                      <img src={creator.avatar_url ?? assetUrl('logo.png')} alt={creator.display_name} />
                      <div>
                        <strong>{creator.display_name}</strong>
                        <span>@{creator.handle}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="wallet-empty">
                    {quickCreators.length
                      ? 'Start typing to search for more creators.'
                      : 'Subscribe to creators or search by name to start sending support.'}
                  </div>
                )}
              </div>
            </div>

            <div className="wallet-send-panel">
              <label className="input-label">Tip amount (KES)</label>
              <input
                className="text-input"
                type="number"
                min="1"
                value={sendAmount}
                onChange={(event) => setSendAmount(event.target.value)}
              />

              {selectedCreator ? (
                <button
                  type="button"
                  className="wallet-selected-creator"
                  onClick={() => onOpenCreator(selectedCreator)}
                >
                  <img
                    src={selectedCreator.avatar_url ?? assetUrl('logo.png')}
                    alt={selectedCreator.display_name}
                  />
                  <div>
                    <strong>{selectedCreator.display_name}</strong>
                    <span>Open creator page</span>
                  </div>
                </button>
              ) : (
                <div className="wallet-empty">Select a creator first.</div>
              )}

              <div className="wallet-card__actions">
                <button
                  className="pill light wallet-action-btn"
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !selectedCreator || Number(sendAmount) <= 0}
                >
                  {sending ? 'Launching checkout...' : 'Send tip'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'receive' && (
        <section className="wallet-card wallet-card--full">
          <div className="wallet-card__head">
            <div>
              <h3>Receive / top up</h3>
              <p>Use a secure checkout to add funds. The balance updates after provider confirmation.</p>
            </div>
          </div>

          <div className="wallet-receive-layout">
            <div className="wallet-send-panel">
              <label className="input-label">Top up amount (KES)</label>
              <input
                className="text-input"
                type="number"
                min="1"
                value={walletTopupAmount}
                onChange={(event) => onTopupAmountChange(event.target.value)}
              />
              {MPESA_STK_ENABLED ? (
                <>
                  <label className="input-label">M-PESA phone</label>
                  <input
                    className="text-input"
                    type="tel"
                    inputMode="numeric"
                    placeholder="2547XXXXXXXX"
                    value={walletTopupPhone}
                    onChange={(event) => onTopupPhoneChange(event.target.value)}
                  />
                </>
              ) : null}
              <div className="wallet-card__actions">
                <button
                  className="pill light wallet-action-btn"
                  type="button"
                  onClick={onTopup}
                  disabled={topupPending}
                >
                  {topupPending
                    ? MPESA_STK_ENABLED
                      ? 'Sending M-PESA prompt...'
                      : 'Starting top up...'
                    : MPESA_STK_ENABLED
                      ? 'Top up via M-PESA'
                      : 'Top up wallet'}
                </button>
              </div>
            </div>

            <div className="wallet-send-panel">
              <div className="wallet-receive-note">
                <strong>How it works</strong>
                <span>1. Enter an amount.</span>
                <span>2. Confirm on M-PESA or secure checkout.</span>
                <span>3. Your balance moves into Available after confirmation.</span>
              </div>
              <div className="wallet-receive-note">
                <strong>Receipts sent to</strong>
                <span>{walletAccountLabel}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="wallet-card wallet-card--full">
          <div className="wallet-card__head">
            <div>
              <h3>History</h3>
              <p>Review top ups, wallet unlocks, and future refund entries.</p>
            </div>
          </div>

          {walletHistory.length ? (
            <div className="wallet-history-table">
              {walletHistory.map((entry) => (
                (() => {
                  const linkedCreator = entry.creator
                  return (
                    <div className="wallet-history-row" key={entry.id}>
                      <div className="wallet-history-row__main">
                        <strong>{getWalletEntryLabel(entry)}</strong>
                        <span>{formatWalletDate(entry.created_at)}</span>
                      </div>
                      <div className="wallet-history-row__detail">
                        {linkedCreator ? (
                          <button
                            type="button"
                            className="wallet-history-link"
                            onClick={() => onOpenCreator(linkedCreator)}
                          >
                            {linkedCreator.display_name}
                          </button>
                        ) : (
                          <span>{entry.post_title ?? 'Wallet activity'}</span>
                        )}
                      </div>
                      <div className={`wallet-history-row__amount ${getWalletEntryTone(entry.entry_type)}`}>
                        {getWalletEntryTone(entry.entry_type) === 'credit' ? '+' : '-'}
                        {formatSubscriptionAmount(entry.amount_minor, entry.currency)}
                      </div>
                    </div>
                  )
                })()
              ))}
            </div>
          ) : (
            <div className="wallet-empty">No wallet transactions yet.</div>
          )}
        </section>
      )}
    </div>
  )
}

function CreatorPage({
  creator,
  posts,
  stories,
  activeSubscriptions,
  isFan,
  onBack,
  onBecomeFan,
  onSubscribe,
  onMessageCreator,
  onGiftCreator,
  onUnlockPost,
  ppvPurchases,
}: {
  creator: CreatorCard
  posts: FeedPost[]
  stories: FeedPost[]
  activeSubscriptions: string[]
  isFan: boolean
  onBack: () => void
  onBecomeFan: (creator: CreatorCard) => void
  onSubscribe: (creator: CreatorCard) => void
  onMessageCreator: (creator: CreatorCard, isSubscribed: boolean) => void
  onGiftCreator: (creator: CreatorCard) => void
  onUnlockPost: (post: FeedPost) => void
  ppvPurchases: number[]
}) {
  const creatorPosts = posts.filter((post) => post.creator.id === creator.id)
  const creatorStories = stories.filter((story) => story.creator.id === creator.id)
  const isSubscribed = activeSubscriptions.includes(creator.id)
  const ppvPurchaseSet = new Set(ppvPurchases)

  return (
    <div className="creator-page">
      <div className="creator-page__header">
        <button className="pill ghost" type="button" onClick={onBack}>
          <FiChevronLeft />
          Back
        </button>
      </div>

      <section className="creator-page__hero">
        <img
          className="creator-page__avatar"
          src={creator.avatar_url ?? assetUrl('logo.png')}
          alt={creator.display_name}
        />
        <div className="creator-page__hero-copy">
          <div className="creator-page__name-row">
            <h2>{creator.display_name}</h2>
            <span className="creator-page__handle">@{creator.handle}</span>
          </div>
          <div className="creator-page__tags">
            {creator.categories?.length
              ? creator.categories.map((category) => (
                  <span key={category} className="chip active">
                    {category}
                  </span>
                ))
              : creator.category && <span className="chip active">{creator.category}</span>}
          </div>
          <div className="creator-page__actions">
            <span className="pill ghost">
              {formatKsh(creator.subscription_price_cents ?? 0)}
            </span>
            {!isFan ? (
              <button className="pill light creator-page__action-button" type="button" onClick={() => onBecomeFan(creator)}>
                Become a fan
              </button>
            ) : (
              <>
                {!isSubscribed && (creator.subscription_price_cents ?? 0) > 0 ? (
                  <button className="pill light creator-page__action-button" type="button" onClick={() => onSubscribe(creator)}>
                    Subscribe
                  </button>
                ) : (
                  <span className="pill">Subscribed</span>
                )}
                <button
                  className={`pill ghost creator-page__action-button${!isSubscribed ? ' is-disabled' : ''}`}
                  type="button"
                  onClick={() => onMessageCreator(creator, isSubscribed)}
                >
                  Message
                </button>
                <button
                  className="pill ghost creator-page__action-button"
                  type="button"
                  onClick={() => onGiftCreator(creator)}
                >
                  Gift
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {creatorStories.length ? (
        <section className="creator-page__section">
          <div className="section-heading">
            <h3>Stories</h3>
          </div>
          <div className="creator-page__story-row">
            {creatorStories.map((story) => (
              <div key={story.id} className="creator-page__story-card">
                <img
                  src={story.media[0]?.url ?? creator.avatar_url ?? assetUrl('logo.png')}
                  alt={story.title}
                />
                <div className="creator-page__story-copy">
                  <div className="name">{story.title}</div>
                  <div className="muted small">Expires {formatMembershipDate(story.expires_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="creator-page__section">
        <div className="section-heading">
          <h3>Posts</h3>
        </div>
        {creatorPosts.length ? (
          <div className="creator-page__post-list">
            {creatorPosts.map((post) => {
              const isLocked =
                (post.visibility === 'subscribers' && !isSubscribed) ||
                (post.visibility === 'ppv' && !ppvPurchaseSet.has(post.id))
              const primaryMedia = post.media[0] ?? null
              const primaryIsVideo = Boolean(primaryMedia?.mime_type?.startsWith('video'))
              return (
                <article key={post.id} className="creator-page__post-card">
                  <div
                    className={`creator-page__post-media${isLocked ? ' is-locked' : ''}`}
                    style={{ aspectRatio: getBestFitMediaAspectRatio(primaryMedia) }}
                  >
                    {primaryMedia?.url ? (
                      primaryIsVideo ? (
                        <video muted playsInline preload="metadata">
                          <source src={primaryMedia.url} type={primaryMedia.mime_type ?? 'video/mp4'} />
                        </video>
                      ) : (
                        <img src={primaryMedia.url} alt={post.title} />
                      )
                    ) : (
                      <div className="creator-page__post-empty">Text</div>
                    )}
                    <div className="creator-page__post-badges">
                      <span className="pill ghost creator-page__post-visibility">
                        {post.visibility === 'ppv'
                          ? `PPV ${formatKsh(post.price_cents ?? 0)}`
                          : post.visibility === 'subscribers'
                            ? 'Subscribers'
                            : 'Public'}
                      </span>
                      {primaryIsVideo ? (
                        <span className="pill ghost creator-page__post-visibility">Video</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="creator-page__post-copy">
                    <div className="creator-page__post-top">
                      <h4>{post.title}</h4>
                      <span className="muted small">{formatMembershipDate(post.created_at)}</span>
                    </div>
                    {post.body ? <p className="muted">{post.body}</p> : null}
                    <div className="creator-page__post-actions">
                      {post.visibility === 'ppv' && isLocked ? (
                        <button className="pill light" type="button" onClick={() => onUnlockPost(post)}>
                          Unlock
                        </button>
                      ) : post.visibility === 'subscribers' && !isSubscribed ? (
                        <button className="pill light" type="button" onClick={() => onSubscribe(creator)}>
                          Subscribe
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="membership-history-empty">
            <h3>No public content yet</h3>
            <p className="muted">This creator has not published any visible content yet.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function HomePage({
  activeTopicFilter,
  onClearTopicFilter,
  posts,
  stories,
  onSubscribe,
  onOpenCreator,
  activeSubscriptions,
  recentCreators,
  ppvPurchases,
  onUnlockPost,
  postSocialById,
  currentUserId,
  currentUserDisplayName,
  onTogglePostLike,
  onAddPostComment,
}: {
  activeTopicFilter: string | null
  onClearTopicFilter: () => void
  posts: FeedPost[]
  stories: FeedPost[]
  onSubscribe: (creator: CreatorCard) => void
  onOpenCreator: (creator: CreatorCard) => void
  activeSubscriptions: string[]
  recentCreators: CreatorCard[]
  ppvPurchases: number[]
  onUnlockPost: (post: FeedPost) => void
  postSocialById: Record<number, PostSocialEntry>
  currentUserId: string | null
  currentUserDisplayName: string
  onTogglePostLike: (postId: number) => void
  onAddPostComment: (postId: number, body: string) => void
}) {
  const subscriptionSet = new Set(activeSubscriptions)
  const ppvPurchaseSet = new Set(ppvPurchases)
  const [activeFilter, setActiveFilter] = useState<'all' | 'photos' | 'videos' | 'texts'>('all')
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null)
  const [activeStoryMediaIndex, setActiveStoryMediaIndex] = useState(0)
  const [postMediaIndexById, setPostMediaIndexById] = useState<Record<number, number>>({})
  const [activePostId, setActivePostId] = useState<number | null>(null)
  const [activePostMediaIndex, setActivePostMediaIndex] = useState(0)
  const [commentDraftsById, setCommentDraftsById] = useState<Record<number, string>>({})
  const [expandedCommentsById, setExpandedCommentsById] = useState<Record<number, boolean>>({})
  const activeStory =
    activeStoryIndex === null || activeStoryIndex < 0 || activeStoryIndex >= stories.length
      ? null
      : stories[activeStoryIndex]
  const activePost = activePostId === null ? null : posts.find((post) => post.id === activePostId) ?? null

  const getPostSocial = (postId: number): PostSocialEntry =>
    postSocialById[postId] ?? { likedByUserIds: [], comments: [] }

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

  const getPostDisplayType = (post: FeedPost) => {
    if (!post.media.length) return 'text'
    if (post.media.some((media) => media.mime_type?.startsWith('video'))) return 'video'
    return 'photo'
  }

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (activeFilter === 'all') return true
      const type = getPostDisplayType(post)
      if (activeFilter === 'photos') return type === 'photo'
      if (activeFilter === 'videos') return type === 'video'
      return type === 'text'
    })
  }, [posts, activeFilter])

  const railCreators = useMemo(() => {
    const byId = new Map<
      string,
      {
        creator: CreatorCard
        bannerUrl: string | null
        bannerIsVideo: boolean
        hasActiveStory: boolean
      }
    >()

    for (const item of [...stories, ...posts]) {
      const existing = byId.get(item.creator.id)
      const previewMedia = item.media[0] ?? null
      const bannerUrl = previewMedia?.url ?? existing?.bannerUrl ?? item.creator.avatar_url ?? null
      const bannerIsVideo =
        previewMedia?.mime_type?.startsWith('video') ?? existing?.bannerIsVideo ?? false

      byId.set(item.creator.id, {
        creator: item.creator,
        bannerUrl,
        bannerIsVideo,
        hasActiveStory: existing?.hasActiveStory ?? item.post_type === 'story',
      })
    }

    return Array.from(byId.values())
  }, [posts, stories])

  const recommendedCreators = useMemo(
    () => railCreators.filter(({ creator }) => !subscriptionSet.has(creator.id)).slice(0, 4),
    [railCreators, subscriptionSet]
  )

  const freeCreators = useMemo(
    () =>
      railCreators
        .filter(
          ({ creator }) =>
            !subscriptionSet.has(creator.id) && (creator.subscription_price_cents ?? 0) <= 0
        )
        .slice(0, 4),
    [railCreators, subscriptionSet]
  )

  const freshCreators = useMemo(
    () =>
      railCreators
        .filter(({ creator }) => !recentCreators.some((recent) => recent.id === creator.id))
        .slice(0, 4),
    [railCreators, recentCreators]
  )

  const onlineCreators = useMemo(
    () => railCreators.filter(({ creator, hasActiveStory }) => hasActiveStory && !subscriptionSet.has(creator.id)).slice(0, 4),
    [railCreators, subscriptionSet]
  )

  useEffect(() => {
    if (activeStoryIndex === null && activePostId === null) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [activeStoryIndex, activePostId])

  useEffect(() => {
    if (activeStoryIndex === null) {
      setActiveStoryMediaIndex(0)
    }
  }, [activeStoryIndex])

  useEffect(() => {
    if (activePostId === null) {
      setActivePostMediaIndex(0)
    }
  }, [activePostId])

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
    if (!activePost) {
      return
    }

    if (!activePost.media.length) {
      setActivePostMediaIndex(0)
      return
    }

    if (activePostMediaIndex >= activePost.media.length) {
      setActivePostMediaIndex(0)
    }
  }, [activePost, activePostMediaIndex])

  useEffect(() => {
    if (activeStoryIndex === null && activePostId === null) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveStoryIndex(null)
        setActivePostId(null)
        return
      }

      if (activePostId !== null) {
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
  }, [activeStoryIndex, activePostId, stories.length])

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
        <div className="home-feed-layout">
          <section className="home-feed home-feed--wide">
            <section className="home-stories">
              {stories.length ? (
                <div className="home-stories__scroller">
                  <div className="home-stories__track">
                    {stories.map((story, index) => {
                      const previewMedia = story.media[0] ?? null
                      const previewIsVideo = Boolean(previewMedia?.mime_type?.startsWith('video'))

                      return (
                        <button
                          key={story.id}
                          className="home-story"
                          type="button"
                          aria-label={`Open ${story.creator.display_name} story`}
                          onClick={() => {
                            setActiveStoryIndex(index)
                            setActiveStoryMediaIndex(0)
                          }}
                        >
                          <span className="home-story__preview" aria-hidden="true">
                            {previewMedia?.url ? (
                              previewIsVideo ? (
                                <video muted playsInline preload="metadata">
                                  <source src={previewMedia.url} type={previewMedia.mime_type ?? 'video/mp4'} />
                                </video>
                              ) : (
                                <img src={previewMedia.url} alt="" />
                              )
                            ) : (
                              <span className="home-story__fallback-surface" />
                            )}
                          </span>
                          <span className="home-story__shade" aria-hidden="true" />
                          <span className="home-story__avatar">
                            <span className="home-story__ring">
                              {story.creator.avatar_url ? (
                                <img src={story.creator.avatar_url} alt={story.creator.display_name} />
                              ) : (
                                <span className="home-story__placeholder" aria-hidden="true">
                                  {story.creator.display_name.charAt(0).toUpperCase()}
                                </span>
                              )}
                            </span>
                          </span>
                          {previewIsVideo ? <span className="home-story__media-badge">Video</span> : null}
                          <span className="home-story__name">{story.creator.display_name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="home-feed__empty home-feed__empty--stories">
                  No active stories right now.
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
                {activeTopicFilter ? (
                  <button className="home-feed__filter" type="button" onClick={onClearTopicFilter}>
                    Clear topic
                  </button>
                ) : null}
              </div>
            </section>
          </section>

          <div className="home-feed-main">
            <div className="home-feed home-feed--posts">
              <div className="home-feed__posts">
                {filteredPosts.length ? (
                  filteredPosts.map((post) => {
                    const { isSubscribed, isPpv, isLocked, showSubscribe } = getAccessState(post)
                    const mediaCount = post.media.length
                    const mediaIndex = Math.max(
                      0,
                      Math.min(postMediaIndexById[post.id] ?? 0, Math.max(mediaCount - 1, 0))
                    )
                    const media = mediaCount ? post.media[mediaIndex] : null
                    const isVideo = media?.mime_type?.startsWith('video')
                    const social = getPostSocial(post.id)
                    const isLiked = Boolean(currentUserId && social.likedByUserIds.includes(currentUserId))
                    const likeCount = social.likedByUserIds.length
                    const commentCount = social.comments.length
                    const commentsExpanded = expandedCommentsById[post.id] ?? false
                    const commentDraft = commentDraftsById[post.id] ?? ''

                    return (
                      <article key={post.id} className="home-post">
                        <header className="home-post__header">
                          <button
                            type="button"
                            className="home-post__author"
                            onClick={() => onOpenCreator(post.creator)}
                          >
                            {post.creator.avatar_url ? (
                              <img
                                className="home-post__avatar"
                                src={post.creator.avatar_url}
                                alt={post.creator.display_name}
                              />
                            ) : (
                              <div className="home-post__avatar home-post__avatar--placeholder" aria-hidden="true">
                                {post.creator.display_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="home-post__name">{post.creator.display_name}</div>
                              <div className="home-post__handle">@{post.creator.handle}</div>
                            </div>
                          </button>
                          {showSubscribe ? (
                            <button className="pill light" onClick={() => onSubscribe(post.creator)}>
                              Subscribe {formatKsh(post.creator.subscription_price_cents)}
                            </button>
                          ) : isSubscribed ? (
                            <span className="muted small">Subscribed</span>
                          ) : null}
                        </header>

                        <button
                          type="button"
                          className="home-post__body"
                          onClick={() => {
                            setActivePostId(post.id)
                            setActivePostMediaIndex(mediaIndex)
                          }}
                        >
                          <p className="home-post__caption">{post.title}</p>
                          {post.body ? <p className="home-post__copy">{post.body}</p> : null}
                        </button>

                        {media ? (
                          <div
                            className={`media-wrapper home-post__media-frame ${isLocked ? 'locked' : ''}`}
                            style={{ aspectRatio: getBestFitMediaAspectRatio(media) }}
                          >
                            {media.url ? (
                              isVideo ? (
                                <video className="media-hero" controls preload="metadata" playsInline>
                                  <source src={media.url} type={media.mime_type ?? 'video/mp4'} />
                                </video>
                              ) : (
                                <img src={media.url} alt={post.title} />
                              )
                            ) : null}
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

                        {!isLocked ? (
                          <>
                            <div className="home-post__social">
                              <button
                                className={`home-post__social-btn${isLiked ? ' is-active' : ''}`}
                                type="button"
                                onClick={() => onTogglePostLike(post.id)}
                                aria-pressed={isLiked}
                              >
                                <FiHeart size={22} />
                                <span>{formatCompactCount(likeCount)}</span>
                              </button>
                              <button
                                className="home-post__social-btn"
                                type="button"
                                onClick={() =>
                                  setExpandedCommentsById((prev) => ({
                                    ...prev,
                                    [post.id]: !commentsExpanded,
                                  }))
                                }
                                aria-expanded={commentsExpanded}
                              >
                                <FiMessageCircle size={22} />
                                <span>{formatCompactCount(commentCount)}</span>
                              </button>
                            </div>

                            {(commentsExpanded || commentCount > 0) && (
                              <div className="home-post__comments">
                                {social.comments.length ? (
                                  <div className="home-post__comment-list">
                                    {social.comments.slice(-3).map((comment) => (
                                      <div key={comment.id} className="home-post__comment">
                                        <strong>{comment.author}</strong>
                                        <span>{comment.body}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                <form
                                  className="home-post__comment-form"
                                  onSubmit={(event) => {
                                    event.preventDefault()
                                    const next = commentDraft.trim()
                                    if (!next) return
                                    onAddPostComment(post.id, next)
                                    setCommentDraftsById((prev) => ({ ...prev, [post.id]: '' }))
                                    setExpandedCommentsById((prev) => ({ ...prev, [post.id]: true }))
                                  }}
                                >
                                  <input
                                    className="home-post__comment-input"
                                    type="text"
                                    placeholder={`Comment as ${currentUserDisplayName}`}
                                    value={commentDraft}
                                    onChange={(event) =>
                                      setCommentDraftsById((prev) => ({
                                        ...prev,
                                        [post.id]: event.target.value,
                                      }))
                                    }
                                  />
                                  <button className="home-post__comment-submit" type="submit">
                                    Post
                                  </button>
                                </form>
                              </div>
                            )}
                          </>
                        ) : null}

                        <footer className="home-post__footer">
                          <span>{formatMembershipDate(post.created_at)}</span>
                          <span>
                            {isPpv
                              ? `PPV · ${formatKsh(post.price_cents ?? 0)}`
                              : post.visibility === 'subscribers'
                                ? 'Subscribers'
                                : 'Public'}
                          </span>
                        </footer>
                      </article>
                    )
                  })
                ) : (
                  <div className="home-feed__empty">
                    {activeTopicFilter
                      ? `No ${activeTopicFilter} posts yet.`
                      : 'Follow creators to see new content in your feed.'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="home-feed-rail">
            <section className="home-rail-card">
              <div className="home-rail-card__head">
                <h3>Recommended</h3>
                <span>{recommendedCreators.length}</span>
              </div>
              <div className="home-rail-list">
                {recommendedCreators.length ? (
                  recommendedCreators.map(({ creator, bannerUrl, bannerIsVideo, hasActiveStory }) => (
                    <button
                      key={creator.id}
                      className="home-rail-banner"
                      type="button"
                      onClick={() => onOpenCreator(creator)}
                    >
                      <span className="home-rail-banner__media" aria-hidden="true">
                        {bannerUrl ? <img src={bannerUrl} alt="" /> : <span className="home-rail-banner__fallback" />}
                      </span>
                      <span className="home-rail-banner__shade" aria-hidden="true" />
                      <span className="home-rail-banner__avatar">
                        <img src={creator.avatar_url ?? assetUrl('logo.png')} alt={creator.display_name} />
                      </span>
                      <div className="home-rail-banner__copy">
                        <strong>{creator.display_name}</strong>
                        <span>@{creator.handle}</span>
                      </div>
                      <div className="home-rail-banner__badges">
                        {hasActiveStory ? <span className="home-rail-banner__badge online">Online</span> : null}
                        {bannerIsVideo ? <span className="home-rail-banner__badge">Video</span> : null}
                      </div>
                      {(creator.subscription_price_cents ?? 0) > 0 ? (
                        <span className="home-rail-banner__price">
                          {formatKsh(creator.subscription_price_cents ?? 0)}
                        </span>
                      ) : (
                        <span className="home-rail-banner__price free">Free</span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="home-rail-empty">No recommendations yet.</div>
                )}
              </div>
            </section>

            <section className="home-rail-card">
              <div className="home-rail-card__head">
                <h3>Online now</h3>
                <span>{onlineCreators.length}</span>
              </div>
              <div className="home-rail-list">
                {onlineCreators.length ? (
                  onlineCreators.map(({ creator, bannerUrl }) => (
                    <button
                      key={creator.id}
                      className="home-rail-banner compact"
                      type="button"
                      onClick={() => onOpenCreator(creator)}
                    >
                      <span className="home-rail-banner__media" aria-hidden="true">
                        {bannerUrl ? <img src={bannerUrl} alt="" /> : <span className="home-rail-banner__fallback" />}
                      </span>
                      <span className="home-rail-banner__shade" aria-hidden="true" />
                      <span className="home-rail-banner__avatar">
                        <img src={creator.avatar_url ?? assetUrl('logo.png')} alt={creator.display_name} />
                      </span>
                      <div className="home-rail-banner__copy">
                        <strong>{creator.display_name}</strong>
                        <span>@{creator.handle}</span>
                      </div>
                      <div className="home-rail-banner__badges">
                        <span className="home-rail-banner__badge online">Online</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="home-rail-empty">No creators are live in this feed right now.</div>
                )}
              </div>
            </section>

            <section className="home-rail-card">
              <div className="home-rail-card__head">
                <h3>Fresh creators</h3>
                <span>{freshCreators.length}</span>
              </div>
              <div className="home-rail-list">
                {(freshCreators.length ? freshCreators : railCreators.slice(0, 4)).map(({ creator }) => (
                  <div key={creator.id} className="home-rail-promo">
                    <button type="button" className="home-rail-promo__open" onClick={() => onOpenCreator(creator)}>
                      <img src={creator.avatar_url ?? assetUrl('logo.png')} alt={creator.display_name} />
                      <div>
                        <strong>{creator.display_name}</strong>
                        <span>@{creator.handle}</span>
                      </div>
                    </button>
                    {!subscriptionSet.has(creator.id) && (creator.subscription_price_cents ?? 0) > 0 ? (
                      <button className="pill light home-rail-promo__cta" type="button" onClick={() => onSubscribe(creator)}>
                        Subscribe
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="home-rail-card">
              <div className="home-rail-card__head">
                <h3>Free creators</h3>
                <span>{freeCreators.length}</span>
              </div>
              <div className="home-rail-tags">
                {freeCreators.length ? (
                  freeCreators.map(({ creator, bannerUrl }) => (
                    <button
                      key={creator.id}
                      className="avatar-chip avatar-chip--rich"
                      type="button"
                      onClick={() => onOpenCreator(creator)}
                      style={
                        bannerUrl
                          ? {
                              backgroundImage: `linear-gradient(180deg, rgba(8, 14, 24, 0.18), rgba(8, 14, 24, 0.78)), url(${bannerUrl})`,
                            }
                          : undefined
                      }
                    >
                      <img src={creator.avatar_url ?? assetUrl('logo.png')} alt={creator.display_name} />
                      <span>{creator.display_name}</span>
                    </button>
                  ))
                ) : (
                  <div className="home-rail-empty">No free creator profiles in this feed yet.</div>
                )}
              </div>
            </section>

            {recentCreators.length ? (
              <section className="home-rail-card">
                <div className="home-rail-card__head">
                  <h3>Recently visited</h3>
                  <span>{recentCreators.length}</span>
                </div>
                <div className="home-rail-tags">
                  {recentCreators.slice(0, 4).map((creator) => (
                    <button
                      key={creator.id}
                      className="avatar-chip"
                      type="button"
                      onClick={() => onOpenCreator(creator)}
                    >
                      <img src={creator.avatar_url ?? assetUrl('logo.png')} alt={creator.display_name} />
                      <span>{creator.display_name}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </main>

      {activeStory ? (
        <div className="home-story-modal" role="dialog" aria-modal="true">
          <button
            className="home-story-modal__backdrop"
            type="button"
            aria-label="Close story"
            onClick={() => setActiveStoryIndex(null)}
          />
          <div className="home-story-modal__card">
            <button
              className="home-story-modal__close"
              type="button"
              aria-label="Close story"
              onClick={() => setActiveStoryIndex(null)}
            >
              <FiX size={20} />
            </button>
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
                <div className="home-story-modal__stage">
                  <div className="home-story-modal__progress" aria-hidden="true">
                    {(mediaCount ? activeStory.media : [null]).map((_, index) => (
                      <span
                        key={`story-progress-${index}`}
                        className={index === mediaIndex ? 'is-active' : undefined}
                      />
                    ))}
                  </div>
                  <div className="home-story-modal__meta">
                    <div className="home-story-modal__creator">
                      <img
                        src={activeStory.creator.avatar_url ?? assetUrl('logo.png')}
                        alt={activeStory.creator.display_name}
                      />
                      <div>
                        <div className="home-story-modal__name">{activeStory.creator.display_name}</div>
                        <div className="home-story-modal__stamp">
                          {activeStory.expires_at
                            ? `Ends ${formatMembershipDate(activeStory.expires_at)}`
                            : 'Active story'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`media-wrapper home-story-modal__media ${isLocked ? 'locked' : ''}`}
                    style={{ aspectRatio: getBestFitMediaAspectRatio(media) }}
                  >
                    {media ? (
                      media.url ? (
                        isVideo ? (
                          <video className="media-hero" controls preload="metadata" playsInline autoPlay>
                            <source src={media.url} type={media.mime_type ?? 'video/mp4'} />
                          </video>
                        ) : (
                          <img src={media.url} alt={activeStory.title || 'Story'} />
                        )
                      ) : null
                    ) : null}
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
                            <button className="pill light" onClick={() => onSubscribe(activeStory.creator)}>
                              Subscribe {formatKsh(activeStory.creator.subscription_price_cents)}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="home-story-modal__caption">
                    <div className="title">{activeStory.title}</div>
                    {activeStory.body ? <p className="muted">{activeStory.body}</p> : null}
                    <div className="story-modal__switchers">
                      <button className="pill ghost" type="button" onClick={() => onOpenCreator(activeStory.creator)}>
                        Open creator page
                      </button>
                      {stories.length > 1 ? (
                        <>
                          <button className="pill ghost" type="button" onClick={() => moveStory(-1)}>
                            Previous story
                          </button>
                          <button className="pill ghost" type="button" onClick={() => moveStory(1)}>
                            Next story
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      ) : null}

      {activePost ? (
        <div className="home-post-modal" role="dialog" aria-modal="true">
          <button
            className="home-post-modal__backdrop"
            type="button"
            aria-label="Close post"
            onClick={() => setActivePostId(null)}
          />
          <div className="home-post-modal__card">
            <header className="home-post-modal__header">
              <button
                type="button"
                className="home-post__author"
                onClick={() => onOpenCreator(activePost.creator)}
              >
                {activePost.creator.avatar_url ? (
                  <img
                    className="home-post__avatar"
                    src={activePost.creator.avatar_url}
                    alt={activePost.creator.display_name}
                  />
                ) : (
                  <div className="home-post__avatar home-post__avatar--placeholder" aria-hidden="true">
                    {activePost.creator.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="home-post__name">{activePost.creator.display_name}</div>
                  <div className="home-post__handle">@{activePost.creator.handle}</div>
                </div>
              </button>
              <button
                className="home-story-modal__close"
                type="button"
                aria-label="Close post"
                onClick={() => setActivePostId(null)}
              >
                <FiX size={20} />
              </button>
            </header>

            {(() => {
              const { isPpv, isLocked, showSubscribe } = getAccessState(activePost)
              const mediaCount = activePost.media.length
              const mediaIndex = Math.max(
                0,
                Math.min(activePostMediaIndex, Math.max(mediaCount - 1, 0))
              )
              const media = mediaCount ? activePost.media[mediaIndex] : null
              const isVideo = media?.mime_type?.startsWith('video')
              return (
                <div
                  className={`media-wrapper home-post-modal__media ${isLocked ? 'locked' : ''}`}
                  style={{ aspectRatio: getBestFitMediaAspectRatio(media) }}
                >
                  {media ? (
                    media.url ? (
                      isVideo ? (
                        <video className="media-hero" controls preload="metadata" playsInline autoPlay>
                          <source src={media.url} type={media.mime_type ?? 'video/mp4'} />
                        </video>
                      ) : (
                        <img src={media.url} alt={activePost.title || 'Post'} />
                      )
                    ) : null
                  ) : null}
                  {mediaCount > 1 ? (
                    <>
                      <button
                        className="media-nav media-nav--prev"
                        type="button"
                        aria-label="Previous post media"
                        onClick={() =>
                          setActivePostMediaIndex((prev) => (prev - 1 + mediaCount) % mediaCount)
                        }
                      >
                        <FiChevronLeft />
                      </button>
                      <button
                        className="media-nav media-nav--next"
                        type="button"
                        aria-label="Next post media"
                        onClick={() =>
                          setActivePostMediaIndex((prev) => (prev + 1) % mediaCount)
                        }
                      >
                        <FiChevronRight />
                      </button>
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
                          ? `Price: ${formatKsh(activePost.price_cents ?? 0)}`
                          : 'Support the creator to access this post.'}
                      </div>
                      <div className="media-lock-actions">
                        {isPpv ? (
                          <button className="primary-btn" onClick={() => onUnlockPost(activePost)}>
                            Unlock for {formatKsh(activePost.price_cents ?? 0)}
                          </button>
                        ) : showSubscribe ? (
                          <button className="pill light" onClick={() => onSubscribe(activePost.creator)}>
                            Subscribe {formatKsh(activePost.creator.subscription_price_cents)}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })()}

            {(() => {
              const { isLocked } = getAccessState(activePost)
              return (
            <footer className="home-post-modal__footer">
              <div className="title">{activePost.title}</div>
              {activePost.body ? <p className="muted">{activePost.body}</p> : null}
              {!isLocked ? (
                <div className="home-post__social home-post__social--modal">
                  {(() => {
                    const social = getPostSocial(activePost.id)
                    const isLiked = Boolean(
                      currentUserId && social.likedByUserIds.includes(currentUserId)
                    )
                    return (
                      <>
                        <button
                          className={`home-post__social-btn${isLiked ? ' is-active' : ''}`}
                          type="button"
                          onClick={() => onTogglePostLike(activePost.id)}
                          aria-pressed={isLiked}
                        >
                          <FiHeart size={22} />
                          <span>{formatCompactCount(social.likedByUserIds.length)}</span>
                        </button>
                        <button
                          className="home-post__social-btn"
                          type="button"
                          onClick={() =>
                            setExpandedCommentsById((prev) => ({
                              ...prev,
                              [activePost.id]: !(prev[activePost.id] ?? false),
                            }))
                          }
                          aria-expanded={expandedCommentsById[activePost.id] ?? false}
                        >
                          <FiMessageCircle size={22} />
                          <span>{formatCompactCount(social.comments.length)}</span>
                        </button>
                      </>
                    )
                  })()}
                </div>
              ) : null}
              {!isLocked && ((expandedCommentsById[activePost.id] ?? false) || getPostSocial(activePost.id).comments.length > 0) ? (
                <div className="home-post__comments home-post__comments--modal">
                  {getPostSocial(activePost.id).comments.length ? (
                    <div className="home-post__comment-list">
                      {getPostSocial(activePost.id).comments.slice(-4).map((comment) => (
                        <div key={comment.id} className="home-post__comment">
                          <strong>{comment.author}</strong>
                          <span>{comment.body}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <form
                    className="home-post__comment-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const next = (commentDraftsById[activePost.id] ?? '').trim()
                      if (!next) return
                      onAddPostComment(activePost.id, next)
                      setCommentDraftsById((prev) => ({ ...prev, [activePost.id]: '' }))
                      setExpandedCommentsById((prev) => ({ ...prev, [activePost.id]: true }))
                    }}
                  >
                    <input
                      className="home-post__comment-input"
                      type="text"
                      placeholder={`Comment as ${currentUserDisplayName}`}
                      value={commentDraftsById[activePost.id] ?? ''}
                      onChange={(event) =>
                        setCommentDraftsById((prev) => ({
                          ...prev,
                          [activePost.id]: event.target.value,
                        }))
                      }
                    />
                    <button className="home-post__comment-submit" type="submit">
                      Post
                    </button>
                  </form>
                </div>
              ) : null}
              <div className="story-modal__switchers">
                <button className="pill ghost" type="button" onClick={() => onOpenCreator(activePost.creator)}>
                  Open creator page
                </button>
              </div>
            </footer>
              )
            })()}
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
    | 'wallet'
    | 'settings'
    | 'membership'
    | 'creator'
    | 'features'
  >('home')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [ageCheckComplete, setAgeCheckComplete] = useState(false)
  const [ageConfirming, setAgeConfirming] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [filter, setFilter] = useState(filters[0])
  const [homeTopicFilter, setHomeTopicFilter] = useState<string | null>(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [settingsTab, setSettingsTab] = useState('Basics')
  const [membershipTab, setMembershipTab] = useState<'Membership' | 'Gift Creator'>('Membership')
  const [walletTab, setWalletTab] = useState<WalletTab>('overview')
  const [toast, setToast] = useState<string | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark')
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [featureText, setFeatureText] = useState('')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [storyPosts, setStoryPosts] = useState<FeedPost[]>([])
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([])
  const [subscriptionHistory, setSubscriptionHistory] = useState<SubscriptionHistoryItem[]>([])
  const [selectedCreator, setSelectedCreator] = useState<CreatorCard | null>(null)
  const [creatorReturnPage, setCreatorReturnPage] = useState<
    'home' | 'explore' | 'chats' | 'notifications' | 'wallet' | 'settings' | 'membership'
  >('home')
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null)
  const [walletHistory, setWalletHistory] = useState<WalletHistoryItem[]>([])
  const [walletTopupAmount, setWalletTopupAmount] = useState('1000')
  const [walletTopupPhone, setWalletTopupPhone] = useState('')
  const [ppvPurchases, setPpvPurchases] = useState<number[]>([])
  const [postSocialById, setPostSocialById] = useState<Record<number, PostSocialEntry>>({})
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0)
  const [subscribingCreatorId, setSubscribingCreatorId] = useState<string | null>(null)
  const [purchasePrompt, setPurchasePrompt] = useState<PurchasePromptAction | null>(null)
  const [purchasePromptBusy, setPurchasePromptBusy] = useState(false)
  const [recentCreators, setRecentCreators] = useState<CreatorCard[]>([])
  const [fanCreatorIds, setFanCreatorIds] = useState<string[]>([])
  const [walletTopupInFlight, setWalletTopupInFlight] = useState(false)
  const [giftCheckoutInFlight, setGiftCheckoutInFlight] = useState(false)
  const [preferredGiftCreator, setPreferredGiftCreator] = useState<CreatorCard | null>(null)
  const [paymentReturn] = useState(() => readPaymentReturnFromUrl())
  const isAuthed = Boolean(session)
  const displayName =
    userProfile?.display_name ??
    session?.user?.user_metadata?.full_name ??
    session?.user?.user_metadata?.name ??
    session?.user?.email?.split('@')[0] ??
    'Fan'
  const profileAvatar =
    session?.user?.user_metadata?.avatar_url ?? userProfile?.avatar_url ?? assetUrl('logo.png')
  const sidebarName = userProfile?.display_name || displayName || 'Fan'
  const sidebarProfile = isAuthed
    ? {
        name: sidebarName,
        role: 'Fan',
        avatar: profileAvatar,
      }
    : null
  const envIssues = [
    ...envStatus.missing.map((name) => `Missing ${name}`),
    ...envStatus.invalid.map((name) => `Invalid ${name}`),
  ]
  const sessionIdentity = getSessionIdentity(session, userProfile)

  const paymentRef = useRef<HTMLDivElement | null>(null)
  const giftRef = useRef<HTMLDivElement | null>(null)
  const resolvedTheme = theme === 'system' ? systemTheme : theme
  const hasReleaseNotes = Boolean(RELEASE_NOTES_URL)
  const hasHelpSupport = Boolean(HELP_CENTER_URL || SUPPORT_EMAIL)
  const hasFeatureRequests = Boolean(FEATURE_REQUESTS_ENABLED && isSupabaseConfigured)

  useEffect(() => {
    setPostSocialById(readPostSocialState())
  }, [])

  useEffect(() => {
    persistPostSocialState(postSocialById)
  }, [postSocialById])

  const refreshPaymentState = async (options?: { ifMounted?: () => boolean }) => {
    const [subs, history, balance, walletEntries] = await Promise.all([
      fetchActiveSubscriptions(),
      fetchSubscriptionHistory(),
      fetchWalletBalance(),
      fetchWalletHistory(),
    ])
    if (options?.ifMounted && !options.ifMounted()) return
    setActiveSubscriptions(subs)
    setSubscriptionHistory(history)
    setWalletBalance(balance)
    setWalletHistory(walletEntries)
  }

  const handleTogglePostLike = (postId: number) => {
    if (!sessionIdentity.userId) {
      setToast('Sign in to like posts')
      return
    }

    setPostSocialById((prev) => {
      const current = prev[postId] ?? { likedByUserIds: [], comments: [] }
      const liked = current.likedByUserIds.includes(sessionIdentity.userId)
      const likedByUserIds = liked
        ? current.likedByUserIds.filter((id) => id !== sessionIdentity.userId)
        : [...current.likedByUserIds, sessionIdentity.userId]

      return {
        ...prev,
        [postId]: {
          ...current,
          likedByUserIds,
        },
      }
    })
  }

  const handleAddPostComment = (postId: number, body: string) => {
    const trimmed = body.trim()
    if (!trimmed) return
    if (!sessionIdentity.userId) {
      setToast('Sign in to comment on posts')
      return
    }

    const author = sessionIdentity.displayName || 'Fan'
    setPostSocialById((prev) => {
      const current = prev[postId] ?? { likedByUserIds: [], comments: [] }
      return {
        ...prev,
        [postId]: {
          ...current,
          comments: [
            ...current.comments,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              author,
              body: trimmed,
              created_at: new Date().toISOString(),
            },
          ],
        },
      }
    })
  }

  const refreshAccessState = async () => {
    const [subs, history, balance, walletEntries, purchases, posts, stories] = await Promise.all([
      fetchActiveSubscriptions(),
      fetchSubscriptionHistory(),
      fetchWalletBalance(),
      fetchWalletHistory(),
      fetchPpvPurchases(),
      fetchFeedPosts(),
      fetchStories(),
    ])

    setActiveSubscriptions(subs)
    setSubscriptionHistory(history)
    setWalletBalance(balance)
    setWalletHistory(walletEntries)
    setPpvPurchases(purchases)
    setFeedPosts(posts)
    setStoryPosts(stories)
  }

  useEffect(() => {
    if (!paymentReturn.kind && !paymentReturn.hasReference) return

    if (paymentReturn.kind === 'wallet_topup' || paymentReturn.kind === 'tip') {
      setPage('wallet')
      setWalletTab('history')
    } else if (paymentReturn.kind === 'gift') {
      setPage('membership')
      setMembershipTab('Gift Creator')
    }

    if (paymentReturn.hasReference) {
      setToast('Returning from secure checkout. We are confirming your payment.')
    }

    clearPaymentReturnParams()
  }, [paymentReturn.hasReference, paymentReturn.kind])

  useEffect(() => {
    if (!hasGiftCreatorCheckout && membershipTab === 'Gift Creator') {
      setMembershipTab('Membership')
    }
  }, [hasGiftCreatorCheckout, membershipTab])

  useEffect(() => {
    if (envStatus.hasIssues) {
      setSessionChecked(true)
      return
    }
    ;(async () => {
      const s = await getCurrentSession()
      setSession(s)
      setSessionChecked(true)
    })()
  }, [])

  useEffect(() => {
    if (envStatus.hasIssues) return
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
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues) return
    if (!session?.user?.id) {
      setActiveSubscriptions([])
      setSubscriptionHistory([])
      return
    }
    let isMounted = true
    const loadSubscriptions = async () => {
      const [subs, history] = await Promise.all([
        fetchActiveSubscriptions(),
        fetchSubscriptionHistory(),
      ])
      if (!isMounted) return
      setActiveSubscriptions(subs)
      setSubscriptionHistory(history)
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
      setWalletHistory([])
      return
    }
    ;(async () => {
      const [balance, history] = await Promise.all([fetchWalletBalance(), fetchWalletHistory()])
      setWalletBalance(balance)
      setWalletHistory(history)
    })()
  }, [session])

  useEffect(() => {
    if (envStatus.hasIssues) return
    if (!session?.user?.id) return
    if (!paymentReturn.kind && !paymentReturn.hasReference) return

    let isMounted = true
    const refresh = async () => {
      try {
        await refreshPaymentState({ ifMounted: () => isMounted })
      } catch (err) {
        console.error(err)
      }
    }

    void refresh()
    const timer = window.setTimeout(() => {
      void refresh()
    }, 3500)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [envStatus.hasIssues, paymentReturn.hasReference, paymentReturn.kind, session])

  useEffect(() => {
    if (envStatus.hasIssues) return
    if (!session?.user?.id) return
    if (page !== 'wallet') return
    ;(async () => {
      const [balance, history] = await Promise.all([fetchWalletBalance(), fetchWalletHistory()])
      setWalletBalance(balance)
      setWalletHistory(history)
    })()
  }, [page, session])

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
    if (envStatus.hasIssues) return
    if (!session?.user?.id) {
      setNotificationUnreadCount(0)
      return
    }

    let isMounted = true
    let unsubscribe = () => {}

    const loadUnreadCount = async () => {
      try {
        const count = await fetchUnreadNotificationCount()
        if (isMounted) setNotificationUnreadCount(count)
      } catch (err) {
        console.error(err)
      }
    }

    void loadUnreadCount()
    void (async () => {
      unsubscribe = await subscribeToNotifications(() => {
        void loadUnreadCount()
      })
    })()

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [session])

  useEffect(() => {
    setRecentCreators(readRecentCreators())
  }, [])

  useEffect(() => {
    setFanCreatorIds(readFanCreators())
  }, [])

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent')
    if (consent === 'accepted') setConsentAccepted(true)
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system')
      setTheme(storedTheme)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const updateTheme = () => setSystemTheme(media.matches ? 'light' : 'dark')
    updateTheme()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', updateTheme)
      return () => media.removeEventListener('change', updateTheme)
    }

    media.addListener(updateTheme)
    return () => media.removeListener(updateTheme)
  }, [])

  useEffect(() => {
    if (envStatus.hasIssues) {
      setAgeCheckComplete(true)
      return
    }
    if (!session?.user?.id) {
      setAgeConfirmed(false)
      setAgeCheckComplete(true)
      return
    }

    const userId = session.user.id
    const hasCachedConfirmation = hasCachedAgeConfirmation(userId)
    let isMounted = true
    setAgeConfirmed(hasCachedConfirmation)
    setAgeCheckComplete(hasCachedConfirmation)
    setAgeConfirming(false)

    ;(async () => {
      const remote = await fetchAgeConfirmation()
      if (!isMounted) return
      const confirmed = remote === true || hasCachedConfirmation
      setAgeConfirmed(confirmed)
      setAgeCheckComplete(true)
    })()

    return () => {
      isMounted = false
    }
  }, [envStatus.hasIssues, session?.user?.id])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    document.documentElement.setAttribute('data-theme-preference', theme)
    localStorage.setItem('theme', theme)
  }, [resolvedTheme, theme])

  const matchesCategoryFilter = (post: FeedPost, category: string | null) => {
    if (!category || category === 'All') return true
    return (
      post.creator.category === category ||
      Boolean(post.creator.categories?.includes(category))
    )
  }

  const filteredHomePosts = feedPosts.filter(
    (post) => post.post_type === 'post' && matchesCategoryFilter(post, homeTopicFilter)
  )
  const filteredHomeStories = storyPosts.filter((post) => matchesCategoryFilter(post, homeTopicFilter))

  const rememberRecentCreator = (creator: CreatorCard) => {
    setRecentCreators((prev) => {
      const next = [creator, ...prev.filter((entry) => entry.id !== creator.id)].slice(0, 6)
      persistRecentCreators(next)
      return next
    })
  }

  const openExternal = (url: string | null, label: string) => {
    if (!url) {
      setToast(`${label} is unavailable right now.`)
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openSupportEmail = () => {
    if (!SUPPORT_EMAIL) {
      setToast('Support email is unavailable right now.')
      return
    }
    window.location.href = `mailto:${SUPPORT_EMAIL}`
  }

  const handlePaymentMethods = () => {
    if (!isAuthed) return setToast('Sign in to manage payment methods')
    setPage('wallet')
    setWalletTab('receive')
    setToast('Opening your wallet')
  }

  const handleGiftCheckout = async () => {
    if (!session?.user?.email) {
      setToast('Sign in to continue to payment')
      return
    }
    if (giftCheckoutInFlight) return
    if (!hasGiftCreatorCheckout) {
      setToast('This checkout is unavailable right now.')
      return
    }

    try {
      setGiftCheckoutInFlight(true)
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
        callbackUrl: buildFanReturnUrl('gift'),
      })
      if (!result.authorization_url) {
        throw new Error('Checkout URL missing')
      }
      window.location.href = result.authorization_url
    } catch (err) {
      console.error(err)
      setToast('Could not start payment. Try again in a moment.')
      setGiftCheckoutInFlight(false)
    }
  }

  const handleWalletTopup = async () => {
    if (!session?.user?.email) {
      setToast('Sign in to top up your wallet')
      return
    }
    if (walletTopupInFlight) return
    const amountMajor = Number(walletTopupAmount)
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      setToast('Enter a valid top up amount')
      return
    }
    try {
      setWalletTopupInFlight(true)
      if (MPESA_STK_ENABLED) {
        if (!walletTopupPhone.trim()) {
          setToast('Enter your M-PESA phone number')
          setWalletTopupInFlight(false)
          return
        }
        setToast('Sending M-PESA prompt...')
        const result = await initiateMpesaStkPush({
          phone: walletTopupPhone.trim(),
          amountMajor,
        })
        setToast(result.customerMessage ?? 'M-PESA prompt sent. Complete on your phone.')
        setWalletTopupInFlight(false)
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
        callbackUrl: buildFanReturnUrl('wallet_topup'),
      })
      if (!result.authorization_url) {
        throw new Error('Checkout URL missing')
      }
      window.location.href = result.authorization_url
    } catch (err) {
      console.error(err)
      setToast('Could not start wallet top up.')
      setWalletTopupInFlight(false)
    }
  }

  const handleSendWalletTip = async (creator: CreatorCard, amountMajor: number) => {
    if (!session?.user?.email) {
      setToast('Sign in to send support')
      return
    }
    if (!creator.id) {
      setToast('Choose a creator first')
      return
    }
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      setToast('Enter a valid amount')
      return
    }
    try {
      setToast(`Redirecting to secure checkout for ${creator.display_name}...`)
      const result = await initiatePaystackPayment({
        email: session.user.email,
        creatorId: creator.id,
        amountMajor,
        currency: 'KES',
        type: 'tip',
        metadata: { source: 'fan_wallet_send' },
        channels: ['mobile_money', 'card'],
        callbackUrl: buildFanReturnUrl('tip'),
      })
      if (!result.authorization_url) {
        throw new Error('Checkout URL missing')
      }
      window.location.href = result.authorization_url
    } catch (err) {
      console.error(err)
      setToast('Could not start the support payment.')
    }
  }

  const executeSubscribe = async (creator: {
    id: string
    handle?: string | null
    display_name?: string | null
    subscription_price_cents?: number | null
    subscription_currency?: string | null
  }) => {
    if (!session?.user?.id) {
      setToast('Sign in to subscribe')
      return
    }
    if (!creator.id) {
      setToast('This creator is not available for subscription right now.')
      return
    }
    if (session?.user?.id && creator.id === session.user.id) {
      setToast('You cannot subscribe to your own creator account.')
      return
    }
    if (activeSubscriptions.includes(creator.id)) {
      setToast('You are already subscribed to this creator.')
      return
    }
    if (subscribingCreatorId === creator.id) {
      return
    }
    const priceCents = creator.subscription_price_cents ?? 0
    const creatorName = creator.display_name ?? creator.handle ?? 'this creator'

    try {
      setSubscribingCreatorId(creator.id)
      const result = await purchaseSubscription(creator.id)
      if (result) {
        setActiveSubscriptions((prev) => Array.from(new Set([...prev, creator.id])))
        await refreshAccessState()
      }
      setToast(
        priceCents > 0
          ? `Subscribed to ${creatorName}. ${formatKsh(priceCents)} deducted from your wallet.`
          : `Subscribed to ${creatorName}.`
      )
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error && err.message ? err.message.toLowerCase() : 'could not complete subscription'
      if (message.includes('insufficient wallet balance')) {
        setPage('wallet')
        setWalletTab('receive')
        setToast('Top up your wallet to complete this subscription.')
      } else {
        setToast(
          err instanceof Error && err.message ? err.message : 'Could not complete subscription.'
        )
      }
    } finally {
      setSubscribingCreatorId(null)
    }
  }

  const handleSubscribe = async (creator: {
    id: string
    handle?: string | null
    display_name?: string | null
    subscription_price_cents?: number | null
    subscription_currency?: string | null
  }) => {
    if (!session?.user?.id) {
      setToast('Sign in to subscribe')
      return
    }
    if (!creator.id) {
      setToast('This creator is not available for subscription right now.')
      return
    }
    if (session?.user?.id && creator.id === session.user.id) {
      setToast('You cannot subscribe to your own creator account.')
      return
    }
    if (activeSubscriptions.includes(creator.id)) {
      setToast('You are already subscribed to this creator.')
      return
    }
    if (subscribingCreatorId === creator.id || purchasePromptBusy) {
      return
    }

    const priceCents = creator.subscription_price_cents ?? 0
    const walletBalanceMinor = walletBalance?.available_amount_minor ?? 0
    setPurchasePrompt({
      kind: 'subscribe',
      creator,
      priceCents,
      walletBalanceMinor,
      insufficientBalance: priceCents > 0 && walletBalanceMinor < priceCents,
    })
  }

  const executeUnlockPost = async (post: FeedPost) => {
    if (!session?.user?.id) {
      setToast('Sign in to unlock this post')
      return
    }
    const priceCents = post.price_cents ?? 0
    if (priceCents <= 0) {
      setToast('This post is not priced')
      return
    }
    try {
      const result = await purchasePpv(post.id)
      if (result?.purchase_id) {
        setPpvPurchases((prev) => Array.from(new Set([...prev, post.id])))
        await refreshAccessState()
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
    if (purchasePromptBusy) {
      return
    }

    const walletBalanceMinor = walletBalance?.available_amount_minor ?? 0
    setPurchasePrompt({
      kind: 'unlock',
      post,
      priceCents,
      walletBalanceMinor,
      insufficientBalance: walletBalanceMinor < priceCents,
    })
  }

  const handlePurchasePromptConfirm = async () => {
    if (!purchasePrompt || purchasePromptBusy) {
      return
    }

    if (purchasePrompt.insufficientBalance) {
      setPurchasePrompt(null)
      setPage('wallet')
      setWalletTab('receive')
      setToast(
        purchasePrompt.kind === 'subscribe'
          ? `Top up your wallet to subscribe to ${purchasePrompt.creator.display_name ?? purchasePrompt.creator.handle ?? 'this creator'}.`
          : 'Top up your wallet to unlock this post.'
      )
      return
    }

    try {
      setPurchasePromptBusy(true)
      if (purchasePrompt.kind === 'subscribe') {
        await executeSubscribe(purchasePrompt.creator)
      } else {
        await executeUnlockPost(purchasePrompt.post)
      }
      setPurchasePrompt(null)
    } finally {
      setPurchasePromptBusy(false)
    }
  }

  const handleOpenCreatorPage = (creator: CreatorCard) => {
    if (page !== 'creator' && page !== 'features') {
      setCreatorReturnPage(page)
    }
    setShowMobileNav(false)
    setShowProfileMenu(false)
    rememberRecentCreator(creator)
    setSelectedCreator(creator)
    setPage('creator')
    setToast(`Opening ${creator.display_name}`)
  }

  const handleBecomeFan = (creator: CreatorCard) => {
    if (!session?.user?.id) {
      setToast('Sign in to become a fan')
      return
    }
    if (fanCreatorIds.includes(creator.id)) {
      return
    }
    const next = [creator.id, ...fanCreatorIds.filter((id) => id !== creator.id)]
    setFanCreatorIds(next)
    persistFanCreators(next)
    setToast(`You are now a fan of ${creator.display_name}.`)
  }

  const handleMessageCreator = (creator: CreatorCard, isSubscribed: boolean) => {
    if (!session?.user?.id) {
      setToast('Sign in to send messages')
      return
    }
    if (!isSubscribed) {
      setToast(`Subscribe to ${creator.display_name} before messaging.`)
      return
    }
    setShowMobileNav(false)
    setShowProfileMenu(false)
    setPage('chats')
    setToast(`Opening chats for ${creator.display_name}.`)
  }

  const handleGiftCreator = (creator: CreatorCard) => {
    if (!session?.user?.id) {
      setToast('Sign in to send support')
      return
    }
    setPreferredGiftCreator(creator)
    setShowMobileNav(false)
    setShowProfileMenu(false)
    setWalletTab('send')
    setPage('wallet')
    setToast(`Choose an amount to gift ${creator.display_name}.`)
  }

  const navigateToPage = (
    nextPage: 'home' | 'explore' | 'chats' | 'notifications' | 'wallet' | 'settings' | 'membership'
  ) => {
    const gated = !isAuthed && ['chats', 'notifications', 'wallet', 'settings', 'membership'].includes(nextPage)
    if (gated) {
      setToast('Sign in to access this section')
      return
    }
    setShowMobileNav(false)
    setShowProfileMenu(false)
    if (nextPage === 'wallet') {
      setPreferredGiftCreator(null)
      setWalletTab('overview')
    }
    setPage(nextPage)
  }

  const openMembershipsPage = (message = 'Opening memberships') => {
    if (!isAuthed) return setToast('Sign in to view memberships')
    setShowMobileNav(false)
    setPage('membership')
    setMembershipTab('Membership')
    setToast(message)
  }

  const handleOpenTopicFeed = (topic: string) => {
    setFilter(topic)
    setHomeTopicFilter(topic)
    setPage('home')
    setToast(`Showing ${topic} content`)
  }

  const sidebarMemberships =
    subscriptionHistory.slice(0, 4).map((item) => ({
      name: item.creator.display_name,
      avatar: item.creator.avatar_url ?? assetUrl('logo.png'),
      creator: item.creator,
    }))

  const handleClearHomeTopicFilter = () => {
    setHomeTopicFilter(null)
    setFilter('All')
    setToast('Showing all creator content')
  }

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
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  if (!ageCheckComplete) {
    return (
      <div className="age-check-shell">
        <div className="age-check-card" role="status" aria-live="polite">
          <div className="age-kicker">18+ Verification</div>
          <h2>Checking your access</h2>
          <p>We are verifying your age-confirmation record before loading the app.</p>
          <div className="age-check-bar" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <AgeGate
        open={!ageConfirmed}
        sessionPresent={Boolean(session)}
        submitting={ageConfirming}
        onEnter={async () => {
          if (!session) {
            setToast('Sign in to confirm age')
            return
          }
          if (ageConfirming) return

          setAgeConfirming(true)
          const didConfirm = await markAgeConfirmed()
          if (!didConfirm) {
            setAgeConfirming(false)
            setToast('Could not confirm age right now. Try again.')
            return
          }

          persistAgeConfirmationCache(session.user.id)
          setAgeConfirmed(true)
          setAgeCheckComplete(true)
          setAgeConfirming(false)
          void logAgeEvent('enter')
        }}
        onExit={() => {
          void logAgeExit()
          window.location.replace(EXIT_URL)
        }}
      />
      <PurchasePrompt
        action={purchasePrompt}
        busy={purchasePromptBusy}
        onCancel={() => {
          if (purchasePromptBusy) return
          setPurchasePrompt(null)
        }}
        onConfirm={() => {
          void handlePurchasePromptConfirm()
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
            const gated = !isAuthed && ['chats', 'notifications', 'wallet', 'settings', 'membership'].includes(item.key)
            return (
              <button
                key={item.label}
                className={`nav-item ${active ? 'active' : ''} ${gated ? 'disabled' : ''}`}
                disabled={gated}
                onClick={() =>
                  navigateToPage(
                    item.key as 'home' | 'explore' | 'chats' | 'notifications' | 'wallet' | 'settings' | 'membership'
                  )
                }
                title={gated ? 'Sign in to access' : undefined}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.key === 'notifications' && notificationUnreadCount > 0 ? (
                  <span className="nav-item__badge">{Math.min(notificationUnreadCount, 99)}</span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="section">
          <div className="section-header">
            <p className="section-title">Memberships</p>
            <button className="section-link" type="button" onClick={() => openMembershipsPage()}>
              Open
            </button>
          </div>
          <div className="divider" />
          {sidebarMemberships.length ? (
            sidebarMemberships.map((m) => (
              <div
                key={m.name}
                className="user-row"
                onClick={() => handleOpenCreatorPage(m.creator)}
              >
                <img src={m.avatar} alt={m.name} />
                <span>{m.name}</span>
              </div>
            ))
          ) : (
            <button
              className="sidebar-empty-action"
              type="button"
              onClick={() => openMembershipsPage('Open memberships to track your creator support')}
            >
              No memberships yet.
            </button>
          )}
        </div>

        <div className="section">
          <p className="section-title">Recently Visited</p>
          <div className="divider" />
          {recentCreators.length ? (
            recentCreators.map((creator) => (
              <div
                key={creator.id}
                className="user-row"
                onClick={() => handleOpenCreatorPage(creator)}
              >
                <img src={creator.avatar_url ?? assetUrl('logo.png')} alt={creator.display_name} />
                <span>{creator.display_name}</span>
              </div>
            ))
          ) : (
            <div className="muted small">No recent visits yet.</div>
          )}
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
                    type="button"
                    aria-pressed={theme === 'light'}
                  >
                    Light
                  </button>
                  <button
                    className={`chip tiny ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => setTheme('dark')}
                    type="button"
                    aria-pressed={theme === 'dark'}
                  >
                    Dark
                  </button>
                  <button
                    className={`chip tiny ${theme === 'system' ? 'active' : ''}`}
                    onClick={() => setTheme('system')}
                    type="button"
                    aria-pressed={theme === 'system'}
                  >
                    System
                  </button>
                </div>
                {hasReleaseNotes ? (
                  <button
                    className="menu-item"
                    type="button"
                    onClick={() => openExternal(RELEASE_NOTES_URL, 'Release notes')}
                  >
                    News
                  </button>
                ) : null}
                {hasHelpSupport ? (
                  <button
                    className="menu-item"
                    type="button"
                    onClick={() => {
                      if (HELP_CENTER_URL) {
                        openExternal(HELP_CENTER_URL, 'Help center')
                        return
                      }
                      openSupportEmail()
                    }}
                  >
                    Help Center & FAQ
                  </button>
                ) : null}
                {hasFeatureRequests ? (
                  <button className="menu-item" type="button" onClick={() => setPage('features')}>
                    Feature Requests
                  </button>
                ) : null}
                <button
                  className="menu-item"
                  type="button"
                  onClick={() =>
                    window.open(assetUrl('pages/terms.html'), '_blank', 'noopener,noreferrer')
                  }
                >
                  Terms of Use
                </button>
                <button
                  className="menu-item"
                  type="button"
                  onClick={() =>
                    window.open(assetUrl('pages/privacy.html'), '_blank', 'noopener,noreferrer')
                  }
                >
                  Privacy Policy
                </button>
                <button
                  className="menu-item"
                  type="button"
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
                <button className="menu-item danger" type="button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : null}
      </aside>

      <div className="mobile-nav-shell">
        <div
          className={`mobile-nav-backdrop ${showMobileNav ? 'open' : ''}`}
          onClick={() => setShowMobileNav(false)}
        />
        <div className="mobile-nav-bar" role="navigation" aria-label="Mobile navigation">
          {mobilePrimaryNav.map((item) => {
            const Icon = item.icon
            const active = page === item.key
            const gated = !isAuthed && ['chats', 'notifications'].includes(item.key)
            return (
              <button
                key={item.key}
                className={`mobile-nav-item ${active ? 'active' : ''}`}
                type="button"
                onClick={() =>
                  navigateToPage(item.key as 'home' | 'explore' | 'chats' | 'notifications')
                }
                disabled={gated}
                aria-label={item.label}
                aria-pressed={active}
              >
                <span className="mobile-nav-item__icon-wrap">
                  <Icon size={20} />
                  {item.key === 'notifications' && notificationUnreadCount > 0 ? (
                    <span className="mobile-nav-item__badge">
                      {Math.min(notificationUnreadCount, 99)}
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </button>
            )
          })}
          <button
            className={`mobile-nav-item ${showMobileNav ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setShowMobileNav((current) => !current)
              setShowProfileMenu(false)
            }}
            aria-label="More sections"
            aria-expanded={showMobileNav}
          >
            <span className="mobile-nav-item__icon-wrap">
              {showMobileNav ? <FiX size={20} /> : <FiMoreHorizontal size={20} />}
            </span>
            <span>More</span>
          </button>
        </div>

        <div className={`mobile-nav-sheet ${showMobileNav ? 'open' : ''}`}>
          {sidebarProfile ? (
            <div className="mobile-nav-sheet__profile">
              <img src={sidebarProfile.avatar} alt={sidebarProfile.name} />
              <div>
                <div className="name">{sidebarProfile.name}</div>
                <div className="muted">{sidebarProfile.role}</div>
              </div>
            </div>
          ) : null}

          <div className="mobile-nav-sheet__grid">
            <button className="mobile-nav-sheet__action" type="button" onClick={() => navigateToPage('wallet')}>
              <FiCreditCard size={18} />
              <span>Wallet</span>
            </button>
            <button className="mobile-nav-sheet__action" type="button" onClick={() => openMembershipsPage()}>
              <FiGift size={18} />
              <span>Membership</span>
            </button>
            <button className="mobile-nav-sheet__action" type="button" onClick={() => navigateToPage('settings')}>
              <FiSettings size={18} />
              <span>Settings</span>
            </button>
            {hasFeatureRequests ? (
              <button
                className="mobile-nav-sheet__action"
                type="button"
                onClick={() => {
                  if (!isSupabaseConfigured) {
                    setToast('Feature requests are unavailable right now.')
                    return
                  }
                  setShowMobileNav(false)
                  setPage('features')
                }}
              >
                <FiPlus size={18} />
                <span>Features</span>
              </button>
            ) : null}
          </div>

          <div className="mobile-nav-sheet__section">
            <div className="menu-title">Appearance</div>
            <div className="appearance-row">
              <button
                className={`chip tiny ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
                type="button"
                aria-pressed={theme === 'light'}
              >
                Light
              </button>
              <button
                className={`chip tiny ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
                type="button"
                aria-pressed={theme === 'dark'}
              >
                Dark
              </button>
              <button
                className={`chip tiny ${theme === 'system' ? 'active' : ''}`}
                onClick={() => setTheme('system')}
                type="button"
                aria-pressed={theme === 'system'}
              >
                System
              </button>
            </div>
          </div>

          <div className="mobile-nav-sheet__section">
            {hasReleaseNotes ? (
              <button
                className="menu-item"
                type="button"
                onClick={() => openExternal(RELEASE_NOTES_URL, 'Release notes')}
              >
                News
              </button>
            ) : null}
            {hasHelpSupport ? (
              <button
                className="menu-item"
                type="button"
                onClick={() => {
                  if (HELP_CENTER_URL) {
                    openExternal(HELP_CENTER_URL, 'Help center')
                    return
                  }
                  openSupportEmail()
                }}
              >
                Help Center & FAQ
              </button>
            ) : null}
            <button
              className="menu-item"
              type="button"
              onClick={() => window.open(assetUrl('pages/terms.html'), '_blank', 'noopener,noreferrer')}
            >
              Terms of Use
            </button>
            <button
              className="menu-item"
              type="button"
              onClick={() => window.open(assetUrl('pages/privacy.html'), '_blank', 'noopener,noreferrer')}
            >
              Privacy Policy
            </button>
          </div>

          {isAuthed ? (
            <div className="mobile-nav-sheet__section">
              <button className="menu-item danger" type="button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="main-area">
        {page === 'home' && (
          <HomePage
            activeTopicFilter={homeTopicFilter}
            onClearTopicFilter={handleClearHomeTopicFilter}
            posts={filteredHomePosts}
            stories={filteredHomeStories}
            onSubscribe={(creator) => handleSubscribe(creator)}
            onOpenCreator={handleOpenCreatorPage}
            activeSubscriptions={activeSubscriptions}
            recentCreators={recentCreators}
            ppvPurchases={ppvPurchases}
            onUnlockPost={handleUnlockPost}
            postSocialById={postSocialById}
            currentUserId={sessionIdentity.userId || null}
            currentUserDisplayName={sessionIdentity.displayName || 'Fan'}
            onTogglePostLike={handleTogglePostLike}
            onAddPostComment={handleAddPostComment}
          />
        )}
        {page === 'explore' && (
          <ExplorePage
            filter={filter}
            onSelectFilter={setFilter}
            onOpenTopic={handleOpenTopicFeed}
            onOpenCreator={handleOpenCreatorPage}
            activeSubscriptions={activeSubscriptions}
            onSubscribe={handleSubscribe}
            subscribingCreatorId={subscribingCreatorId}
            recentCreators={recentCreators}
          />
        )}
        {page === 'chats' && <ChatsPage />}
        {page === 'notifications' && <NotificationsPage onNavigate={setPage} />}
        {page === 'wallet' && (
          <WalletPage
            session={session}
            activeTab={walletTab}
            onTabChange={setWalletTab}
            walletBalance={walletBalance}
            walletHistory={walletHistory}
            walletTopupAmount={walletTopupAmount}
            walletTopupPhone={walletTopupPhone}
            topupPending={walletTopupInFlight}
            preferredCreator={preferredGiftCreator}
            onTopupAmountChange={setWalletTopupAmount}
            onTopupPhoneChange={setWalletTopupPhone}
            onTopup={handleWalletTopup}
            subscriptionHistory={subscriptionHistory}
            onOpenCreator={handleOpenCreatorPage}
            onSendTip={handleSendWalletTip}
          />
        )}
        {page === 'features' && hasFeatureRequests && (
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
                if (!isSupabaseConfigured) return setToast('Feature requests are unavailable right now.')
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
            onPaymentClick={handlePaymentMethods}
            session={session}
            userProfile={userProfile}
            walletBalance={walletBalance}
            walletHistory={walletHistory}
            walletTopupAmount={walletTopupAmount}
            walletTopupPhone={walletTopupPhone}
            topupPending={walletTopupInFlight}
            onTopupAmountChange={setWalletTopupAmount}
            onTopupPhoneChange={setWalletTopupPhone}
            onTopup={handleWalletTopup}
            subscriptionHistory={subscriptionHistory}
            onOpenCreator={handleOpenCreatorPage}
          />
        )}
        {page === 'membership' && (
          <MembershipPage
            tab={membershipTab}
            onTabChange={setMembershipTab}
            giftRef={giftRef}
            onGoPayment={handleGiftCheckout}
            paymentPending={giftCheckoutInFlight}
            showGiftCreator={hasGiftCreatorCheckout}
            history={subscriptionHistory}
            onOpenCreator={handleOpenCreatorPage}
          />
        )}
        {page === 'creator' && selectedCreator && (
          <CreatorPage
            creator={selectedCreator}
            posts={feedPosts}
            stories={storyPosts}
            activeSubscriptions={activeSubscriptions}
            isFan={fanCreatorIds.includes(selectedCreator.id)}
            onBack={() => setPage(creatorReturnPage)}
            onBecomeFan={handleBecomeFan}
            onSubscribe={handleSubscribe}
            onMessageCreator={handleMessageCreator}
            onGiftCreator={handleGiftCreator}
            onUnlockPost={handleUnlockPost}
            ppvPurchases={ppvPurchases}
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
