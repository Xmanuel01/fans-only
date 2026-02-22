import React, { useEffect, useState } from 'react';
import {
  supabase,
  getSession,
  signInWithOAuth,
  signOut,
  signInWithPassword,
  signUpWithPassword,
} from './supabaseClient';
import { env } from './env';
import './auth.css';

type GateState = 'loading' | 'unauthenticated' | 'no-creator' | 'ready';

const CONSUMER_APP_URL = env.consumerAppUrl;
const DEMO_MODE_ENABLED = env.enableDemoMode;
const FORCE_AUTH_SCREEN_ON_DEV_BOOT = env.forceAuthScreenOnDevBoot;

const safeStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage write errors (private mode, quota, etc).
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage removal errors.
    }
  },
};

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
      if (FORCE_AUTH_SCREEN_ON_DEV_BOOT) {
        safeStorage.removeItem('demoModeCreator');

        if (supabase) {
          try {
            await signOut();
          } catch {
            // Ignore sign-out errors while forcing auth screen in dev.
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

        setState('unauthenticated');
        return;
      }

      const demo = DEMO_MODE_ENABLED && safeStorage.getItem('demoModeCreator') === 'true';
      if (demo) {
        setState('ready');
        return;
      }
      safeStorage.removeItem('demoModeCreator');

      if (!supabase) {
        setError('Supabase environment variables are not configured.');
        setState('unauthenticated');
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

  if (state === 'unauthenticated') {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="auth-brand">
            <div className="brand-stack">
              <span className="brand-wordmark">The Bold Chic</span>
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
              {DEMO_MODE_ENABLED && (
                <button
                  className="ghost-btn"
                  onClick={() => {
                    safeStorage.setItem('demoModeCreator', 'true');
                    setState('ready');
                  }}
                >
                  Continue as demo
                </button>
              )}
            </div>
            {error && <div className="auth-error">{error}</div>}
            <p className="auth-lede">
              Use your email and password to access your account. Need a profile first? Go to{' '}
              <a href={CONSUMER_APP_URL}>the consumer app</a> and choose "Become a creator."
            </p>
          </div>
        </div>
        <div className="auth-hero">
          <img src="/logo.png" alt="The Bold Chic" className="hero-logo" />
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
          <a className="primary-btn" href={CONSUMER_APP_URL} target="_blank" rel="noreferrer">
            Go to consumer app
          </a>
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

function TopLinks({ consumerUrl, handle }: { consumerUrl: string; handle: string | null }) {
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

