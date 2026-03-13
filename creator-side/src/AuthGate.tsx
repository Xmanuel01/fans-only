import React, { useEffect, useState } from 'react';
import {
  supabase,
  getSession,
  signInWithOAuth,
  signOut,
  signInWithPassword,
  signUpWithPassword,
} from './supabaseClient';
import { env, envStatus, isSupabaseConfigured } from './env';
import './auth.css';

type GateState = 'loading' | 'unauthenticated' | 'no-creator' | 'ready' | 'misconfigured' | 'age-required';

const CONSUMER_APP_URL = env.consumerAppUrl;
const BASE_URL = import.meta.env.BASE_URL ?? '/';
const assetUrl = (path: string) => `${BASE_URL}${path.replace(/^\/+/, '')}`;
const isExternalUrl = (value: string | null) => Boolean(value && /^https?:\/\//i.test(value));
const CONSUMER_IS_EXTERNAL = isExternalUrl(CONSUMER_APP_URL);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing-in' | 'error'>('idle');
  const [creatorHandle, setCreatorHandle] = useState<string | null>(null);

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
        await ensureCreator(session.user.id);
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        if (!nextSession?.user) {
          setState('unauthenticated');
          return;
        }
        await ensureCreator(nextSession.user.id);
      });

      unsub = () => subscription.unsubscribe();
    }

    boot();
    return () => unsub();
  }, []);

  async function ensureCreator(userId: string) {
    if (!supabase) {
      setError('Supabase environment variables are not configured.');
      setState('unauthenticated');
      return;
    }

    const { data: ageRow, error: ageErr } = await supabase
      .from('profiles')
      .select('age_confirmed_at')
      .eq('id', userId)
      .maybeSingle();

    if (ageErr) {
      console.warn(ageErr);
      setError('Could not verify age status.');
      setState('unauthenticated');
      return;
    }

    if (!ageRow?.age_confirmed_at) {
      setState('age-required');
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('creators')
      .select('id, handle')
      .eq('id', userId)
      .maybeSingle();

    if (fetchError) {
      console.warn(fetchError);
      setError('Could not verify creator status.');
      setState('unauthenticated');
      return;
    }

    if (!data) {
      setState('no-creator');
      setCreatorHandle(null);
    } else {
      setCreatorHandle(data.handle ?? null);
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

  if (state === 'no-creator') {
    return (
      <ScreenShell title="Become a creator">
        <p className="muted">
          Your account is signed in but not registered as a creator. Finish onboarding in the consumer app, then return
          here.
        </p>
        <div className="cta-row">
          {CONSUMER_APP_URL ? (
            <a
              className="primary-btn"
              href={CONSUMER_APP_URL}
              target={CONSUMER_IS_EXTERNAL ? '_blank' : undefined}
              rel={CONSUMER_IS_EXTERNAL ? 'noreferrer' : undefined}
            >
              Go to consumer app
            </a>
          ) : (
            <span className="primary-btn" aria-disabled="true">
              Consumer app unavailable
            </span>
          )}
          <button className="ghost-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </ScreenShell>
    );
  }

  if (state === 'age-required') {
    return (
      <ScreenShell title="Age verification required">
        <p className="muted">
          Please confirm your age in the consumer app before accessing the creator dashboard.
        </p>
        <div className="cta-row">
          {CONSUMER_APP_URL ? (
            <a
              className="primary-btn"
              href={CONSUMER_APP_URL}
              target={CONSUMER_IS_EXTERNAL ? '_blank' : undefined}
              rel={CONSUMER_IS_EXTERNAL ? 'noreferrer' : undefined}
            >
              Verify in consumer app
            </a>
          ) : (
            <span className="primary-btn" aria-disabled="true">
              Consumer app unavailable
            </span>
          )}
          <button className="ghost-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <>
      <TopLinks consumerUrl={CONSUMER_APP_URL} handle={creatorHandle} />
      {children}
    </>
  );
}

function ScreenShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
          padding: 24,
          border: '1px solid #e6e8ec',
        }}
      >
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        <div style={{ display: 'grid', gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function TopLinks({ consumerUrl, handle }: { consumerUrl: string | null; handle: string | null }) {
  if (!consumerUrl) {
    return null;
  }

  const profileUrl = handle ? `${consumerUrl.replace(/\/$/, '')}/creator/${handle}` : consumerUrl;
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
        <a href={profileUrl} target="_blank" rel="noreferrer" style={{ color: '#e8edf5' }}>
          View public profile
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

