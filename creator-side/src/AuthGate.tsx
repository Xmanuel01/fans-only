import React, { useEffect, useState } from 'react';
import {
  supabase,
  getSession,
  signInWithOAuth,
  signOut,
  signInWithPassword,
  signUpWithPassword,
  upsertCreatorProfileSetup,
} from './supabaseClient';
import { env, envStatus, isSupabaseConfigured } from './env';
import './auth.css';

type GateState = 'loading' | 'unauthenticated' | 'ready' | 'misconfigured';
type OnboardingStep =
  | 'post-signup-intro'
  | 'post-signup-referrals'
  | 'post-signup-country'
  | 'post-signup-content'
  | 'post-signup-display-name-handle'
  | 'post-signup-subscription-price'
  | 'post-signup-verify-identity'
  | 'post-signup-profile-setup';
type CreatorContentType = 'adult' | 'general';
type CreatorUserMetadata = Record<string, unknown> & {
  display_name?: string;
  full_name?: string;
  name?: string;
  preferred_username?: string;
  user_name?: string;
};
type CreatorAuthUser = {
  id: string;
  created_at?: string | null;
  email?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: CreatorUserMetadata | null;
};

const CONSUMER_APP_URL = env.consumerAppUrl;
const BASE_URL = import.meta.env.BASE_URL ?? '/';
const assetUrl = (path: string) => `${BASE_URL}${path.replace(/^\/+/, '')}`;
const isExternalUrl = (value: string | null) => Boolean(value && /^https?:\/\//i.test(value));
const CONSUMER_IS_EXTERNAL = isExternalUrl(CONSUMER_APP_URL);
const ONBOARDING_INTRO_WINDOW_MS = 10 * 60 * 1000;
const MIN_SUBSCRIPTION_PRICE_KES = 50;
const DEFAULT_SUBSCRIPTION_PRICE_KES = '500';
const COUNTRY_OPTIONS = [
  { code: 'KE', label: 'Kenya' },
  { code: 'NG', label: 'Nigeria' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'UG', label: 'Uganda' },
  { code: 'TZ', label: 'Tanzania' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
];
const CONTENT_OPTIONS: Array<{
  value: CreatorContentType;
  title: string;
  description: string;
}> = [
  {
    value: 'adult',
    title: '18+ Content',
    description: 'Your content includes nudity, adult themes, or is for mature audiences.',
  },
  {
    value: 'general',
    title: 'General Content',
    description: 'Your content will be suitable for all audiences of all ages.',
  },
];
const CREATOR_PROFILE_CATEGORIES = [
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
];
const POST_SIGNUP_STEPS: ReadonlyArray<OnboardingStep> = [
  'post-signup-intro',
  'post-signup-referrals',
  'post-signup-country',
  'post-signup-content',
  'post-signup-display-name-handle',
  'post-signup-subscription-price',
  'post-signup-verify-identity',
  'post-signup-profile-setup',
];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState | OnboardingStep>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing-in' | 'error'>('idle');
  const [referralCode, setReferralCode] = useState('');
  const [countryCode, setCountryCode] = useState('KE');
  const [contentType, setContentType] = useState<CreatorContentType>('adult');
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [handleDraft, setHandleDraft] = useState('');
  const [subscriptionPriceDraft, setSubscriptionPriceDraft] = useState(DEFAULT_SUBSCRIPTION_PRICE_KES);
  const [profileCategoryDraft, setProfileCategoryDraft] = useState('');

  useEffect(() => {
    let unsub = () => {};

    async function boot() {
      if (envStatus.hasIssues) {
        setState('misconfigured');
        return;
      }

      if (!isSupabaseConfigured || !supabase) {
        setError('Supabase environment variables are not configured.');
        setState('misconfigured');
        return;
      }

      const session = await getSession();
      if (!session?.user) {
        setState('unauthenticated');
      } else {
        if (shouldShowPostSignupOnboarding(session.user as CreatorAuthUser)) {
          hydratePostSignupDraft(
            session.user as CreatorAuthUser,
            setReferralCode,
            setCountryCode,
            setContentType,
            setDisplayNameDraft,
            setHandleDraft,
            setSubscriptionPriceDraft,
            setProfileCategoryDraft,
          );
          setState(resolvePostSignupStep(session.user.id));
          return;
        }
        await ensureCreator(session.user as CreatorAuthUser);
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        if (!nextSession?.user) {
          setState('unauthenticated');
          return;
        }
        if (shouldShowPostSignupOnboarding(nextSession.user as CreatorAuthUser)) {
          hydratePostSignupDraft(
            nextSession.user as CreatorAuthUser,
            setReferralCode,
            setCountryCode,
            setContentType,
            setDisplayNameDraft,
            setHandleDraft,
            setSubscriptionPriceDraft,
            setProfileCategoryDraft,
          );
          setState(resolvePostSignupStep(nextSession.user.id));
          return;
        }
        await ensureCreator(nextSession.user as CreatorAuthUser);
      });

      unsub = () => subscription.unsubscribe();
    }

    boot();
    return () => unsub();
  }, []);

  async function ensureCreator(user: CreatorAuthUser) {
    if (!supabase) {
      setError('Supabase environment variables are not configured.');
      setState('unauthenticated');
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('creators')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.warn(fetchError);
      setError('Could not verify creator status.');
      setState('unauthenticated');
      return;
    }

    if (!data) {
      hydratePostSignupDraft(
        user,
        setReferralCode,
        setCountryCode,
        setContentType,
        setDisplayNameDraft,
        setHandleDraft,
        setSubscriptionPriceDraft,
        setProfileCategoryDraft,
      );
      setState(resolvePostSignupStep(user.id));
    } else {
      setState('ready');
    }
  }

  if (state === 'loading') {
    return <ScreenShell title="Checking account...">Hold tight while we verify your session.</ScreenShell>;
  }

  if (state === 'misconfigured') {
    const issues = [
      ...envStatus.missing.map((item) => `Missing ${item}`),
      ...envStatus.invalid.map((item) => `Invalid ${item}`),
    ];

    return (
      <ScreenShell title="Configuration required">
        <p className="muted">
          This deployment is missing required environment variables. Update the configuration and
          redeploy the app.
        </p>
        {issues.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </ScreenShell>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="auth-brand">
            <div className="brand-stack">
              <span className="brand-wordmark">SpicyX</span>
              <span className="brand-tagline">Lace and pleasure Haven</span>
            </div>
          </div>

          <h1>Welcome back</h1>
          <p className="auth-lede">Sign in to your account</p>

          <div className="auth-card">
            <div className="oauth-group">
              <button className="oauth-btn" onClick={() => signInWithOAuth('google')}>
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
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" />
            </label>
            <label className="auth-label">
              Password
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="********" type="password" />
            </label>
            <div className="auth-actions">
              <button
                className="primary-btn"
                onClick={async () => {
                  if (!email || !password) return;
                  setStatus('signing-in');
                  setError(null);
                  try {
                    await signInWithPassword(email, password);
                  } catch (err) {
                    console.error(err);
                    setError('Could not sign in. Check your credentials.');
                    setStatus('error');
                  } finally {
                    setStatus('idle');
                  }
                }}
                disabled={status === 'signing-in'}
              >
                {status === 'signing-in' ? 'Signing in...' : 'Sign in'}
              </button>
              <button
                className="ghost-btn"
                onClick={async () => {
                  if (!email || !password) return;
                  setStatus('signing-in');
                  setError(null);
                  try {
                    await signUpWithPassword(email, password);
                  } catch (err) {
                    console.error(err);
                    setError('Could not create account. Try different credentials.');
                    setStatus('error');
                  } finally {
                    setStatus('idle');
                  }
                }}
                disabled={status === 'signing-in'}
              >
                Create account
              </button>
            </div>
            {error && <div className="auth-error">{error}</div>}
            <p className="auth-lede">
              Use your email and password to access your account. Need a profile first? Go to{' '}
              {CONSUMER_APP_URL ? (
                <a
                  href={CONSUMER_APP_URL}
                  target={CONSUMER_IS_EXTERNAL ? '_blank' : undefined}
                  rel={CONSUMER_IS_EXTERNAL ? 'noreferrer' : undefined}
                >
                  the consumer app
                </a>
              ) : (
                <span>the consumer app</span>
              )}{' '}
              and choose "Become a creator."
            </p>
          </div>
        </div>
        <div className="auth-hero">
          <img src={assetUrl('logo.png')} alt="SpicyX" className="hero-logo" />
        </div>
      </div>
    );
  }

  if (state === 'post-signup-intro') {
    return (
      <CreatorOnboardingIntro
        onContinue={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-referrals');
          setState('post-signup-referrals');
        }}
      />
    );
  }

  if (state === 'post-signup-referrals') {
    return (
      <CreatorOnboardingReferrals
        value={referralCode}
        onChange={async (value) => {
          setReferralCode(value);
          const session = await getSession();
          if (session?.user?.id) {
            storePostSignupReferralCode(session.user.id, value);
          }
        }}
        onBack={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-intro');
          setState('post-signup-intro');
        }}
        onClose={async () => {
          await signOut();
          setReferralCode('');
          setState('unauthenticated');
        }}
        onContinue={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-country');
          setState('post-signup-country');
        }}
      />
    );
  }

  if (state === 'post-signup-country') {
    return (
      <CreatorOnboardingCountry
        value={countryCode}
        onChange={async (value) => {
          setCountryCode(value);
          const session = await getSession();
          if (session?.user?.id) {
            storePostSignupCountryCode(session.user.id, value);
          }
        }}
        onBack={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-referrals');
          setState('post-signup-referrals');
        }}
        onClose={async () => {
          await signOut();
          setState('unauthenticated');
        }}
        onContinue={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-content');
          setState('post-signup-content');
        }}
      />
    );
  }

  if (state === 'post-signup-content') {
    return (
      <CreatorOnboardingContent
        value={contentType}
        onChange={async (value) => {
          setContentType(value);
          const session = await getSession();
          if (session?.user?.id) {
            storePostSignupContentType(session.user.id, value);
          }
        }}
        onBack={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-country');
          setState('post-signup-country');
        }}
        onClose={async () => {
          await signOut();
          setState('unauthenticated');
        }}
        onContinue={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-display-name-handle');
          setState('post-signup-display-name-handle');
        }}
      />
    );
  }

  if (state === 'post-signup-display-name-handle') {
    return (
      <CreatorOnboardingDisplayNameHandle
        displayName={displayNameDraft}
        handle={handleDraft}
        onChangeDisplayName={async (value) => {
          setDisplayNameDraft(value);
          const session = await getSession();
          if (session?.user?.id) {
            storePostSignupDisplayName(session.user.id, value);
          }
        }}
        onChangeHandle={async (value) => {
          const normalized = sanitizeHandleInput(value);
          setHandleDraft(normalized);
          const session = await getSession();
          if (session?.user?.id) {
            storePostSignupHandle(session.user.id, normalized);
          }
        }}
        onBack={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-content');
          setState('post-signup-content');
        }}
        onClose={async () => {
          await signOut();
          setState('unauthenticated');
        }}
        onContinue={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-subscription-price');
          setState('post-signup-subscription-price');
        }}
        onSkip={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-subscription-price');
          setState('post-signup-subscription-price');
        }}
      />
    );
  }

  if (state === 'post-signup-subscription-price') {
    return (
      <CreatorOnboardingSubscriptionPrice
        value={subscriptionPriceDraft}
        onChange={async (value) => {
          const normalized = sanitizeKesAmountInput(value);
          setSubscriptionPriceDraft(normalized);
          const session = await getSession();
          if (session?.user?.id) {
            storePostSignupSubscriptionPrice(session.user.id, normalized);
          }
        }}
        onBack={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-display-name-handle');
          setState('post-signup-display-name-handle');
        }}
        onClose={async () => {
          await signOut();
          setState('unauthenticated');
        }}
        onContinue={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-verify-identity');
          setState('post-signup-verify-identity');
        }}
        onSkip={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-verify-identity');
          setState('post-signup-verify-identity');
        }}
      />
    );
  }

  if (state === 'post-signup-verify-identity') {
    return (
      <CreatorOnboardingVerifyIdentity
        onBack={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-subscription-price');
          setState('post-signup-subscription-price');
        }}
        onClose={async () => {
          await signOut();
          setState('unauthenticated');
        }}
        onContinue={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-profile-setup');
          setState('post-signup-profile-setup');
        }}
        onSkip={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-profile-setup');
          setState('post-signup-profile-setup');
        }}
      />
    );
  }

  if (state === 'post-signup-profile-setup') {
    return (
      <CreatorOnboardingProfileSetup
        category={profileCategoryDraft}
        onCategoryChange={async (value) => {
          setProfileCategoryDraft(value);
          const session = await getSession();
          if (session?.user?.id) {
            storePostSignupProfileCategory(session.user.id, value);
          }
        }}
        onBack={async () => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          setStoredPostSignupStep(userId, 'post-signup-verify-identity');
          setState('post-signup-verify-identity');
        }}
        onClose={async () => {
          await signOut();
          setState('unauthenticated');
        }}
        onContinue={async ({ avatarFile, bannerFile }) => {
          const session = await getSession();
          const userId = session?.user?.id;
          if (!userId) {
            setState('unauthenticated');
            return;
          }
          const amount = Number(subscriptionPriceDraft);
          if (!Number.isFinite(amount) || amount < MIN_SUBSCRIPTION_PRICE_KES) {
            throw new Error(`Set a subscription price of at least KSh ${MIN_SUBSCRIPTION_PRICE_KES}.`);
          }
          if (!profileCategoryDraft.trim()) {
            throw new Error('Choose a content category.');
          }

          await upsertCreatorProfileSetup({
            handle: handleDraft,
            display_name: displayNameDraft,
            category: profileCategoryDraft,
            subscription_price_cents: Math.round(amount * 100),
            subscription_currency: 'KES',
            avatarFile,
            bannerFile,
          });

          markPostSignupOnboardingSeen(userId);
          clearStoredPostSignupStep(userId);
          await ensureCreator(session.user as CreatorAuthUser);
        }}
      />
    );
  }

  return (
    <>
      <TopLinks consumerUrl={CONSUMER_APP_URL} />
      {children}
    </>
  );
}

function ScreenShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(circle at 10% 20%, #0f172a, #080b12)',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: '#20242f',
          borderRadius: 16,
          boxShadow: '0 20px 48px rgba(0,0,0,0.38)',
          padding: 24,
          border: '1px solid #32394d',
          color: '#e8edf5',
        }}
      >
        <h1 style={{ marginTop: 0, color: '#ffffff' }}>{title}</h1>
        <div style={{ display: 'grid', gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function TopLinks({ consumerUrl }: { consumerUrl: string | null }) {
  if (!consumerUrl) {
    return null;
  }
  return (
    <div
      style={{
        width: '100%',
        background: '#0f172a',
        color: '#e8edf5',
        padding: '10px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 14,
        boxSizing: 'border-box',
      }}
    >
      <span>Creator dashboard</span>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <a href={consumerUrl} target="_blank" rel="noreferrer" style={{ color: '#e8edf5' }}>
          Consumer app
        </a>
        <button
          onClick={signOut}
          style={{
            background: '#12263a',
            color: '#e8edf5',
            border: '1px solid #3e63ff',
            padding: '6px 12px',
            borderRadius: 8,
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function CreatorOnboardingIntro({ onContinue }: { onContinue: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const legalBase = CONSUMER_APP_URL ? CONSUMER_APP_URL.replace(/\/$/, '') : '/user';

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-nav onboarding-nav-prev" aria-hidden="true">
          <span>&lsaquo;</span>
        </div>
        <div className="onboarding-nav onboarding-nav-next" aria-hidden="true">
          <span>&rsaquo;</span>
        </div>

        <div className="onboarding-globe" aria-hidden="true">
          <span className="onboarding-globe__continent onboarding-globe__continent--one" />
          <span className="onboarding-globe__continent onboarding-globe__continent--two" />
          <span className="onboarding-globe__continent onboarding-globe__continent--three" />
        </div>

        <h1 className="onboarding-title">
          SpicyX is a place for <span className="onboarding-title__accent">ALL</span> creators to
          generate income
        </h1>

        <button
          className="onboarding-cta"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            try {
              await onContinue();
            } finally {
              setSubmitting(false);
            }
          }}
          type="button"
        >
          {submitting ? 'Loading...' : 'Start earning'}
        </button>

        <p className="onboarding-legal">
          By becoming a creator on SpicyX you reconfirm your agreement to our{' '}
          <a href={`${legalBase}/pages/terms.html`} target="_blank" rel="noreferrer">
            Terms &amp; Conditions
          </a>
          ,{' '}
          <a href={`${legalBase}/pages/acceptable-use-policy.html`} target="_blank" rel="noreferrer">
            Acceptable Use Policy
          </a>
          , and{' '}
          <a href={`${legalBase}/pages/privacy.html`} target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function CreatorOnboardingReferrals({
  value,
  onChange,
  onBack,
  onClose,
  onContinue,
}: {
  value: string;
  onChange: (value: string) => Promise<void>;
  onBack: () => Promise<void>;
  onClose: () => Promise<void>;
  onContinue: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="onboarding-shell">
      <div className="onboarding-flow">
        <div className="onboarding-flow__topbar">
          <button
            className="onboarding-top-btn"
            onClick={() => void onBack()}
            type="button"
          >
            &lsaquo;
          </button>

          <div className="onboarding-progress">
            <div className="onboarding-progress__label">Referrals</div>
            <div className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  className={`onboarding-dot${index === 0 ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>

          <button
            className="onboarding-top-btn"
            onClick={() => void onClose()}
            type="button"
          >
            &times;
          </button>
        </div>

        <div className="onboarding-screen onboarding-screen--referrals">
          <h1 className="onboarding-screen__title">Were you referred?</h1>

          <label className="onboarding-field">
            <span className="onboarding-field__label">
              (Optional) Please enter the code you were provided.
            </span>
            <input
              className="onboarding-input"
              onChange={(event) => void onChange(event.target.value)}
              placeholder="e.g. CGD-765"
              type="text"
              value={value}
            />
          </label>
        </div>

        <button
          className="onboarding-cta onboarding-cta--bottom"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            try {
              await onContinue();
            } finally {
              setSubmitting(false);
            }
          }}
          type="button"
        >
          {submitting ? 'Loading...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function CreatorOnboardingCountry({
  value,
  onChange,
  onBack,
  onClose,
  onContinue,
}: {
  value: string;
  onChange: (value: string) => Promise<void>;
  onBack: () => Promise<void>;
  onClose: () => Promise<void>;
  onContinue: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="onboarding-shell">
      <div className="onboarding-flow">
        <div className="onboarding-flow__topbar">
          <button className="onboarding-top-btn" onClick={() => void onBack()} type="button">
            &lsaquo;
          </button>

          <div className="onboarding-progress">
            <div className="onboarding-progress__label">Country</div>
            <div className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  className={`onboarding-dot${index === 1 ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>

          <button className="onboarding-top-btn" onClick={() => void onClose()} type="button">
            &times;
          </button>
        </div>

        <div className="onboarding-screen onboarding-screen--country">
          <h1 className="onboarding-screen__title onboarding-screen__title--country">
            What is your country of residency?
          </h1>

          <label className="onboarding-field">
            <span className="onboarding-field__label">Country</span>
            <div className="onboarding-select-wrap">
              <select
                className="onboarding-select"
                onChange={(event) => void onChange(event.target.value)}
                value={value}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code} {option.label}
                  </option>
                ))}
              </select>
              <span className="onboarding-select-chevron" aria-hidden="true">
                &#709;
              </span>
            </div>
            <span className="onboarding-field__note">
              Please note that you will not be able to change this later.
            </span>
          </label>
        </div>

        <button
          className="onboarding-cta onboarding-cta--bottom"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            try {
              await onContinue();
            } finally {
              setSubmitting(false);
            }
          }}
          type="button"
        >
          {submitting ? 'Loading...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function CreatorOnboardingContent({
  value,
  onChange,
  onBack,
  onClose,
  onContinue,
}: {
  value: CreatorContentType;
  onChange: (value: CreatorContentType) => Promise<void>;
  onBack: () => Promise<void>;
  onClose: () => Promise<void>;
  onContinue: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="onboarding-shell">
      <div className="onboarding-flow">
        <div className="onboarding-flow__topbar">
          <button className="onboarding-top-btn" onClick={() => void onBack()} type="button">
            &lsaquo;
          </button>

          <div className="onboarding-progress">
            <div className="onboarding-progress__label">Content</div>
            <div className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  className={`onboarding-dot${index === 2 ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>

          <button className="onboarding-top-btn" onClick={() => void onClose()} type="button">
            &times;
          </button>
        </div>

        <div className="onboarding-screen onboarding-screen--content">
          <h1 className="onboarding-screen__title onboarding-screen__title--content">
            What kind of content will you be creating?
          </h1>

          <p className="onboarding-copy">
            We&apos;ll tailor your onboarding based on your content type. There&apos;s no wrong
            choice - just pick what fits you best.
          </p>

          <div className="onboarding-choice-grid">
            {CONTENT_OPTIONS.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  className={`onboarding-choice-card${active ? ' active' : ''}`}
                  onClick={() => void onChange(option.value)}
                  type="button"
                >
                  <span className="onboarding-choice-card__title">{option.title}</span>
                  <span className="onboarding-choice-card__description">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          className="onboarding-cta onboarding-cta--bottom"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            try {
              await onContinue();
            } finally {
              setSubmitting(false);
            }
          }}
          type="button"
        >
          {submitting ? 'Loading...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function CreatorOnboardingDisplayNameHandle({
  displayName,
  handle,
  onChangeDisplayName,
  onChangeHandle,
  onBack,
  onClose,
  onContinue,
  onSkip,
}: {
  displayName: string;
  handle: string;
  onChangeDisplayName: (value: string) => Promise<void>;
  onChangeHandle: (value: string) => Promise<void>;
  onBack: () => Promise<void>;
  onClose: () => Promise<void>;
  onContinue: () => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const canContinue = Boolean(displayName.trim() && handle.trim());

  return (
    <div className="onboarding-shell">
      <div className="onboarding-flow">
        <div className="onboarding-flow__topbar">
          <button className="onboarding-top-btn" onClick={() => void onBack()} type="button">
            &lsaquo;
          </button>

          <div className="onboarding-progress">
            <div className="onboarding-progress__label">Display name &amp; handle</div>
            <div className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  className={`onboarding-dot${index === 3 ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>

          <button className="onboarding-top-btn" onClick={() => void onClose()} type="button">
            &times;
          </button>
        </div>

        <div className="onboarding-screen onboarding-screen--identity">
          <h1 className="onboarding-screen__title onboarding-screen__title--identity">
            Create your name &amp; handle
          </h1>

          <label className="onboarding-field">
            <span className="onboarding-field__label">Display name</span>
            <input
              autoCapitalize="words"
              autoComplete="name"
              className="onboarding-input"
              onChange={(event) => void onChangeDisplayName(event.target.value)}
              type="text"
              value={displayName}
            />
            <span className="onboarding-field__note">
              The name shown on your profile and in messages.
            </span>
          </label>

          <label className="onboarding-field">
            <span className="onboarding-field__label">Handle</span>
            <input
              autoCapitalize="none"
              autoComplete="nickname"
              className="onboarding-input"
              onChange={(event) => void onChangeHandle(event.target.value)}
              spellCheck={false}
              type="text"
              value={handle}
            />
            <span className="onboarding-field__note">Your unique @username</span>
          </label>
        </div>

        <div className="onboarding-actions-stack">
          <button
            className="onboarding-cta onboarding-cta--bottom"
            disabled={submitting || !canContinue}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onContinue();
              } finally {
                setSubmitting(false);
              }
            }}
            type="button"
          >
            {submitting ? 'Loading...' : 'Continue'}
          </button>

          <button
            className="onboarding-skip-btn"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSkip();
              } finally {
                setSubmitting(false);
              }
            }}
            type="button"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatorOnboardingSubscriptionPrice({
  value,
  onChange,
  onBack,
  onClose,
  onContinue,
  onSkip,
}: {
  value: string;
  onChange: (value: string) => Promise<void>;
  onBack: () => Promise<void>;
  onClose: () => Promise<void>;
  onContinue: () => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const amount = Number(value);
  const canContinue = Number.isFinite(amount) && amount >= MIN_SUBSCRIPTION_PRICE_KES;

  return (
    <div className="onboarding-shell">
      <div className="onboarding-flow">
        <div className="onboarding-flow__topbar">
          <button className="onboarding-top-btn" onClick={() => void onBack()} type="button">
            &lsaquo;
          </button>

          <div className="onboarding-progress">
            <div className="onboarding-progress__label">Subscription price</div>
            <div className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  className={`onboarding-dot${index === 4 ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>

          <button className="onboarding-top-btn" onClick={() => void onClose()} type="button">
            &times;
          </button>
        </div>

        <div className="onboarding-screen onboarding-screen--subscription-price">
          <h1 className="onboarding-screen__title onboarding-screen__title--subscription-price">
            Set your subscription price
          </h1>

          <p className="onboarding-copy onboarding-copy--subscription-price">
            Set your monthly subscription price for fans. You&apos;ll be able to change it later.
          </p>

          <label className="onboarding-field">
            <span className="onboarding-field__label sr-only">Monthly subscription price in KSh</span>
            <div className="onboarding-money-field">
              <span className="onboarding-money-field__prefix">KSh</span>
              <input
                className="onboarding-input onboarding-input--money"
                inputMode="numeric"
                onChange={(event) => void onChange(event.target.value)}
                placeholder={DEFAULT_SUBSCRIPTION_PRICE_KES}
                type="text"
                value={value}
              />
            </div>
            <span className="onboarding-field__note">Minimum KSh 50.</span>
          </label>
        </div>

        <div className="onboarding-actions-stack">
          <button
            className="onboarding-cta onboarding-cta--bottom"
            disabled={submitting || !canContinue}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onContinue();
              } finally {
                setSubmitting(false);
              }
            }}
            type="button"
          >
            {submitting ? 'Loading...' : 'Continue'}
          </button>

          <button
            className="onboarding-skip-btn"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSkip();
              } finally {
                setSubmitting(false);
              }
            }}
            type="button"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatorOnboardingVerifyIdentity({
  onBack,
  onClose,
  onContinue,
  onSkip,
}: {
  onBack: () => Promise<void>;
  onClose: () => Promise<void>;
  onContinue: () => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="onboarding-shell">
      <div className="onboarding-flow">
        <div className="onboarding-flow__topbar">
          <button className="onboarding-top-btn" onClick={() => void onBack()} type="button">
            &lsaquo;
          </button>

          <div className="onboarding-progress">
            <div className="onboarding-progress__label">Verify identity</div>
            <div className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  className={`onboarding-dot${index === 5 ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>

          <button className="onboarding-top-btn" onClick={() => void onClose()} type="button">
            &times;
          </button>
        </div>

        <div className="onboarding-screen onboarding-screen--verify-identity">
          <h1 className="onboarding-screen__title onboarding-screen__title--verify-identity">
            Verify your identity
          </h1>

          <div className="onboarding-copy-stack">
            <p className="onboarding-copy onboarding-copy--verify-identity">
              Our verification is super quick, so you&apos;ll be ready to earn right away.
            </p>
            <p className="onboarding-copy onboarding-copy--verify-identity">
              Rest assured, your personal info is safe with us. We follow trusted industry
              standards to handle and protect your data.
            </p>
          </div>

          <div className="identity-preview" aria-hidden="true">
            <span className="identity-preview__glow identity-preview__glow--left" />
            <span className="identity-preview__glow identity-preview__glow--right" />
            <div className="identity-preview__photo">
              <div className="identity-preview__head" />
              <div className="identity-preview__body" />
              <div className="identity-preview__laptop" />
              <div className="identity-preview__id-card">
                <span className="identity-preview__id-line" />
                <span className="identity-preview__id-line identity-preview__id-line--short" />
              </div>
            </div>
          </div>

          <p className="onboarding-copy onboarding-copy--verify-note">
            Please have your passport, driver&apos;s licence or identity card ready.
          </p>
        </div>

        <div className="onboarding-actions-stack">
          <button
            className="onboarding-cta onboarding-cta--bottom"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onContinue();
              } finally {
                setSubmitting(false);
              }
            }}
            type="button"
          >
            {submitting ? 'Loading...' : 'Verify and start earning'}
          </button>

          <button
            className="onboarding-skip-btn"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSkip();
              } finally {
                setSubmitting(false);
              }
            }}
            type="button"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatorOnboardingProfileSetup({
  category,
  onCategoryChange,
  onBack,
  onClose,
  onContinue,
}: {
  category: string;
  onCategoryChange: (value: string) => Promise<void>;
  onBack: () => Promise<void>;
  onClose: () => Promise<void>;
  onContinue: (payload: { avatarFile: File; bannerFile: File }) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewType, setBannerPreviewType] = useState<'image' | 'video' | null>(null);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(bannerPreviewUrl);
      }
    };
  }, [bannerPreviewUrl]);

  const canContinue = Boolean(category.trim() && avatarFile && bannerFile);

  return (
    <div className="onboarding-shell">
      <div className="onboarding-flow">
        <div className="onboarding-flow__topbar">
          <button className="onboarding-top-btn" onClick={() => void onBack()} type="button">
            &lsaquo;
          </button>

          <div className="onboarding-progress">
            <div className="onboarding-progress__label">Profile setup</div>
            <div className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  className={`onboarding-dot${index === 6 ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>

          <button className="onboarding-top-btn" onClick={() => void onClose()} type="button">
            &times;
          </button>
        </div>

        <div className="onboarding-screen onboarding-screen--profile-setup">
          <h1 className="onboarding-screen__title onboarding-screen__title--profile-setup">
            Set up your profile
          </h1>

          <p className="onboarding-copy onboarding-copy--profile-setup">
            Add your profile image, banner image or video, and choose the content category that
            best matches how fans should discover you.
          </p>

          <div className="onboarding-upload-grid">
            <label className="onboarding-upload-card onboarding-upload-card--avatar">
              <input
                accept="image/*"
                className="onboarding-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) return;
                  setAvatarFile(file);
                  setAvatarPreviewUrl((previous) => {
                    if (previous?.startsWith('blob:')) {
                      URL.revokeObjectURL(previous);
                    }
                    return URL.createObjectURL(file);
                  });
                }}
                type="file"
              />

              <span className="onboarding-upload-card__label">Profile image</span>

              <span className="onboarding-upload-card__surface onboarding-upload-card__surface--avatar">
                {avatarPreviewUrl ? (
                  <img className="onboarding-avatar-preview" src={avatarPreviewUrl} alt="" />
                ) : (
                  <span className="onboarding-avatar-placeholder" aria-hidden="true">
                    <span className="onboarding-avatar-placeholder__circle" />
                    <span className="onboarding-avatar-placeholder__line" />
                  </span>
                )}
              </span>

              <span className="onboarding-upload-card__hint">
                {avatarFile ? avatarFile.name : 'Upload a square image'}
              </span>
            </label>

            <label className="onboarding-upload-card onboarding-upload-card--banner">
              <input
                accept="image/*,video/*"
                className="onboarding-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) return;
                  setBannerFile(file);
                  setBannerPreviewType(file.type.startsWith('video/') ? 'video' : 'image');
                  setBannerPreviewUrl((previous) => {
                    if (previous?.startsWith('blob:')) {
                      URL.revokeObjectURL(previous);
                    }
                    return URL.createObjectURL(file);
                  });
                }}
                type="file"
              />

              <span className="onboarding-upload-card__label">Banner image or video</span>

              <span className="onboarding-upload-card__surface onboarding-upload-card__surface--banner">
                {bannerPreviewUrl ? (
                  bannerPreviewType === 'video' ? (
                    <video
                      className="onboarding-banner-preview"
                      src={bannerPreviewUrl}
                      muted
                      playsInline
                    />
                  ) : (
                    <img className="onboarding-banner-preview" src={bannerPreviewUrl} alt="" />
                  )
                ) : (
                  <span className="onboarding-banner-placeholder" aria-hidden="true">
                    <span className="onboarding-banner-placeholder__media" />
                    <span className="onboarding-banner-placeholder__line" />
                  </span>
                )}
              </span>

              <span className="onboarding-upload-card__hint">
                {bannerFile ? bannerFile.name : 'Upload a wide image or short video'}
              </span>
            </label>
          </div>

          <div className="onboarding-field">
            <span className="onboarding-field__label">Content category</span>
            <div className="onboarding-category-grid">
              {CREATOR_PROFILE_CATEGORIES.map((option) => {
                const active = option === category;
                return (
                  <button
                    key={option}
                    className={`onboarding-category-pill${active ? ' active' : ''}`}
                    onClick={() => void onCategoryChange(option)}
                    type="button"
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? <p className="onboarding-error">{error}</p> : null}
        </div>

        <button
          className="onboarding-cta onboarding-cta--bottom"
          disabled={submitting || !canContinue}
          onClick={async () => {
            if (!avatarFile || !bannerFile) {
              setError('Add both a profile image and a banner asset.');
              return;
            }

            setSubmitting(true);
            setError(null);
            try {
              await onContinue({ avatarFile, bannerFile });
            } catch (nextError: any) {
              setError(nextError?.message ?? 'Could not save your profile setup.');
            } finally {
              setSubmitting(false);
            }
          }}
          type="button"
        >
          {submitting ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function shouldShowPostSignupOnboarding(user: CreatorAuthUser | null | undefined) {
  if (!user?.id) return false;
  if (hasCompletedPostSignupOnboarding(user.id)) return false;
  if (!user.created_at || !user.last_sign_in_at) return false;

  const createdAt = Date.parse(user.created_at);
  const lastSignInAt = Date.parse(user.last_sign_in_at);
  if (!Number.isFinite(createdAt) || !Number.isFinite(lastSignInAt)) return false;

  return Math.abs(lastSignInAt - createdAt) <= ONBOARDING_INTRO_WINDOW_MS;
}

function hasCompletedPostSignupOnboarding(userId: string) {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(postSignupOnboardingSeenKey(userId)) === 'true';
}

function markPostSignupOnboardingSeen(userId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupOnboardingSeenKey(userId), 'true');
}

function resolvePostSignupStep(userId: string): OnboardingStep {
  if (typeof window === 'undefined') return 'post-signup-intro';
  const stored = window.sessionStorage.getItem(postSignupStepKey(userId));
  return POST_SIGNUP_STEPS.includes(stored as OnboardingStep)
    ? (stored as OnboardingStep)
    : 'post-signup-intro';
}

function setStoredPostSignupStep(userId: string, step: OnboardingStep) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupStepKey(userId), step);
}

function clearStoredPostSignupStep(userId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(postSignupStepKey(userId));
}

function hydratePostSignupDraft(
  user: CreatorAuthUser,
  setReferral: (value: string) => void,
  setCountry: (value: string) => void,
  setContent: (value: CreatorContentType) => void,
  setDisplayName: (value: string) => void,
  setHandle: (value: string) => void,
  setSubscriptionPrice: (value: string) => void,
  setProfileCategory: (value: string) => void,
) {
  if (typeof window === 'undefined') return;
  const userId = user.id;
  setReferral(window.sessionStorage.getItem(postSignupReferralKey(userId)) ?? '');
  setCountry(window.sessionStorage.getItem(postSignupCountryKey(userId)) ?? 'KE');
  setContent((window.sessionStorage.getItem(postSignupContentKey(userId)) as CreatorContentType) ?? 'adult');
  const storedDisplayName = window.sessionStorage.getItem(postSignupDisplayNameKey(userId));
  const storedHandle = window.sessionStorage.getItem(postSignupHandleKey(userId));
  const displayName = storedDisplayName ?? seedPostSignupDisplayName(user);
  const handle = storedHandle ?? seedPostSignupHandle(user, displayName);
  setDisplayName(displayName);
  setHandle(handle);
  if (storedDisplayName === null) {
    window.sessionStorage.setItem(postSignupDisplayNameKey(userId), displayName);
  }
  if (storedHandle === null) {
    window.sessionStorage.setItem(postSignupHandleKey(userId), handle);
  }
  const storedSubscriptionPrice = window.sessionStorage.getItem(postSignupSubscriptionPriceKey(userId));
  const subscriptionPrice = storedSubscriptionPrice ?? DEFAULT_SUBSCRIPTION_PRICE_KES;
  setSubscriptionPrice(subscriptionPrice);
  if (storedSubscriptionPrice === null) {
    window.sessionStorage.setItem(postSignupSubscriptionPriceKey(userId), subscriptionPrice);
  }
  setProfileCategory(window.sessionStorage.getItem(postSignupProfileCategoryKey(userId)) ?? '');
}

function storePostSignupReferralCode(userId: string, value: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupReferralKey(userId), value);
}

function storePostSignupCountryCode(userId: string, value: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupCountryKey(userId), value);
}

function storePostSignupContentType(userId: string, value: CreatorContentType) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupContentKey(userId), value);
}

function storePostSignupDisplayName(userId: string, value: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupDisplayNameKey(userId), value);
}

function storePostSignupHandle(userId: string, value: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupHandleKey(userId), value);
}

function storePostSignupSubscriptionPrice(userId: string, value: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupSubscriptionPriceKey(userId), value);
}

function storePostSignupProfileCategory(userId: string, value: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(postSignupProfileCategoryKey(userId), value);
}

function postSignupOnboardingSeenKey(userId: string) {
  return `creator:onboarding:complete:${userId}`;
}

function postSignupStepKey(userId: string) {
  return `creator:onboarding:step:${userId}`;
}

function postSignupReferralKey(userId: string) {
  return `creator:onboarding:referral:${userId}`;
}

function postSignupCountryKey(userId: string) {
  return `creator:onboarding:country:${userId}`;
}

function postSignupContentKey(userId: string) {
  return `creator:onboarding:content:${userId}`;
}

function postSignupDisplayNameKey(userId: string) {
  return `creator:onboarding:display-name:${userId}`;
}

function postSignupHandleKey(userId: string) {
  return `creator:onboarding:handle:${userId}`;
}

function postSignupSubscriptionPriceKey(userId: string) {
  return `creator:onboarding:subscription-price:${userId}`;
}

function postSignupProfileCategoryKey(userId: string) {
  return `creator:onboarding:profile-category:${userId}`;
}

function seedPostSignupDisplayName(user: CreatorAuthUser) {
  const metadataName =
    getMetadataString(user, 'display_name') ??
    getMetadataString(user, 'full_name') ??
    getMetadataString(user, 'name') ??
    getMetadataString(user, 'user_name') ??
    getMetadataString(user, 'preferred_username') ??
    emailLocalPart(user.email) ??
    'Creator';
  return formatDisplayNameSeed(metadataName);
}

function seedPostSignupHandle(user: CreatorAuthUser, displayName: string) {
  const base =
    sanitizeHandleInput(
      getMetadataString(user, 'preferred_username') ??
        getMetadataString(user, 'user_name') ??
        displayName ??
        emailLocalPart(user.email) ??
        'creator',
    ) || 'creator';
  const suffix = String(handleSeedFromUserId(user.id));
  const trimmedBase = base.slice(0, Math.max(1, 32 - suffix.length - 1));
  return `${trimmedBase}-${suffix}`;
}

function getMetadataString(user: CreatorAuthUser, key: keyof CreatorUserMetadata) {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function emailLocalPart(email?: string | null) {
  if (!email) return null;
  const [localPart] = email.split('@');
  return localPart?.trim() || null;
}

function formatDisplayNameSeed(value: string) {
  const cleaned = value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Creator';
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
    .slice(0, 40);
}

function sanitizeHandleInput(value: string) {
  return value
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9\s-_]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 32);
}

function sanitizeKesAmountInput(value: string) {
  return value.replace(/\D+/g, '').slice(0, 6);
}

function handleSeedFromUserId(userId: string) {
  return (Array.from(userId).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 900) + 100;
}
