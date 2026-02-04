import React, { useEffect, useState } from 'react';
import { supabase, getSession, signInWithMagicLink, signInWithOAuth, signOut } from './supabaseClient';

type GateState = 'loading' | 'unauthenticated' | 'no-creator' | 'ready';

const CONSUMER_APP_URL = import.meta.env.VITE_CONSUMER_APP_URL ?? 'https://app.example.com';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('loading');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creatorHandle, setCreatorHandle] = useState<string | null>(null);

  useEffect(() => {
    let unsub = () => {};

    async function boot() {
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
    const { data, error: fetchError } = await supabase!
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

  async function handleMagicLink() {
    if (!email) return;
    try {
      setError(null);
      await signInWithMagicLink(email);
    } catch (err) {
      console.error(err);
      setError('Could not send magic link. Check the email and try again.');
    }
  }

  if (state === 'loading') {
    return <ScreenShell title="Checking account…">Hold tight while we verify your session.</ScreenShell>;
  }

  if (state === 'unauthenticated') {
    return (
      <ScreenShell title="Sign in to manage your creator account">
        <div className="auth-card">
          <label className="auth-label">
            Work email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <button className="primary-btn" onClick={handleMagicLink}>
            Send magic link
          </button>
          <button className="ghost-btn" onClick={() => signInWithOAuth('google')}>
            Continue with Google
          </button>
          {error && <div className="auth-error">{error}</div>}
          <p className="muted small">
            Need to create a creator profile first? Head to <a href={CONSUMER_APP_URL}>the consumer app</a> and choose
            “Become a creator.”
          </p>
        </div>
      </ScreenShell>
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
        color: 'white',
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
        <a href={consumerUrl} target="_blank" rel="noreferrer" style={{ color: 'white' }}>
          Consumer app
        </a>
        <a href={profileUrl} target="_blank" rel="noreferrer" style={{ color: 'white' }}>
          View public profile
        </a>
        <button onClick={signOut} style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', padding: '6px 12px', borderRadius: 8 }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
