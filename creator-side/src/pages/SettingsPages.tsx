import { useEffect, useMemo, useState } from 'react';
import {
  fetchCreatorPricing,
  fetchCurrentCreatorProfile,
  fetchNotificationPreferences,
  supabase,
  updateCreatorPricing,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../supabaseClient';
import SettingsShell from './SettingsShell';
import './SettingsPages.css';

const LANGUAGE_OPTIONS = [
  'English',
  'ChineseSimplified',
  'ChineseTraditional',
  'Portuguese',
  'Swahili',
  'Spanish',
  'Japanese',
  'Korean',
  'Hindi',
  'French',
  'German',
  'Italian',
  'Romanian',
  'Arabic',
  'Ukrainian',
  'Russian',
] as const;

const LANGUAGE_STORAGE_KEY = 'of_language';
const LANGUAGE_CHANGE_EVENT = 'of-language-change';

type LanguageValue = (typeof LANGUAGE_OPTIONS)[number];

type CreatorAccountIdentity = {
  displayName: string;
  handle: string;
  email: string;
  userId: string;
};

const getStoredLanguage = () => {
  const win = window as typeof window & { __ofLanguage?: string };
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // Ignore storage access issues and fall back to in-memory value.
  }

  return win.__ofLanguage ?? 'English';
};

const setStoredLanguage = (value: LanguageValue) => {
  const win = window as typeof window & { __ofLanguage?: string };
  win.__ofLanguage = value;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
  } catch {
    // Ignore storage access issues.
  }
  document.documentElement.lang = value;
  window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: value }));
};

function useCreatorAccountIdentity() {
  const [identity, setIdentity] = useState<CreatorAccountIdentity | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadIdentity = async () => {
      try {
        const [profile, auth] = await Promise.all([
          fetchCurrentCreatorProfile(),
          supabase?.auth.getUser(),
        ]);
        if (!isMounted) return;
        const user = auth?.data?.user;
        if (!user) return;

        setIdentity({
          displayName:
            profile?.name ||
            (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
            (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '') ||
            'Creator',
          handle: profile?.handle ?? '',
          email: user.email ?? '',
          userId: user.id,
        });
      } catch (error) {
        console.error('Could not load creator account identity', error);
      }
    };

    void loadIdentity();

    return () => {
      isMounted = false;
    };
  }, []);

  return identity;
}

export function SettingsHome() {
  const identity = useCreatorAccountIdentity();
  const [pricingLabel, setPricingLabel] = useState('Loading...');

  useEffect(() => {
    let isMounted = true;

    const loadPricing = async () => {
      try {
        const pricing = await fetchCreatorPricing();
        if (!isMounted) return;
        const cents = pricing?.subscription_price_cents ?? 0;
        setPricingLabel(cents > 0 ? `KSh ${(cents / 100).toLocaleString()}/month` : 'Free');
      } catch (error) {
        console.error('Could not load creator pricing summary', error);
        if (isMounted) {
          setPricingLabel('Unavailable');
        }
      }
    };

    void loadPricing();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SettingsShell userHandle={identity?.handle ?? ''}>
      <div className="settings-content__header">
        <h2>Settings</h2>
        <a className="save-button" href="/my/settings/profile">
          Edit profile
        </a>
      </div>
      <div className="settings-panels">
        <div className="settings-panel">
          <div className="settings-panel__title">Creator workspace</div>
          <div className="settings-row">
            <div>
              <div className="settings-row__label">Profile</div>
              <div className="settings-row__meta">Update your public name, bio, avatar, and banner.</div>
            </div>
            <a className="save-button" href="/my/settings/profile">
              Open
            </a>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row__label">Subscription price</div>
              <div className="settings-row__meta">Current price: {pricingLabel}</div>
            </div>
            <a className="save-button" href="/my/settings/subscription">
              Manage
            </a>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row__label">Notifications</div>
              <div className="settings-row__meta">Choose where creator alerts are delivered.</div>
            </div>
            <a className="save-button" href="/my/settings/notifications">
              Review
            </a>
          </div>
        </div>

        <div className="settings-panel">
          <div className="settings-panel__title">Account overview</div>
          {identity?.displayName ? (
            <div className="settings-row">
              <div>
                <div className="settings-row__label">Display name</div>
                <div className="settings-row__meta">{identity.displayName}</div>
              </div>
              <span className="settings-chip">Live</span>
            </div>
          ) : null}
          {identity?.handle ? (
            <div className="settings-row">
              <div>
                <div className="settings-row__label">Creator handle</div>
                <div className="settings-row__meta">{identity.handle}</div>
              </div>
            </div>
          ) : null}
          {identity?.email ? (
            <div className="settings-banner">Primary account email: {identity.email}</div>
          ) : null}
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsAccount() {
  const identity = useCreatorAccountIdentity();

  return (
    <SettingsShell activeItem="account" userHandle={identity?.handle ?? ''}>
      <div className="settings-content__header">
        <h2>Account</h2>
      </div>
      <div className="settings-account">
        <div className="settings-account__group">
          <div className="settings-account__section-title">Account info</div>
          {identity?.displayName ? <AccountRow label="Display name" meta={identity.displayName} /> : null}
          {identity?.handle ? <AccountRow label="Username" meta={identity.handle} /> : null}
          {identity?.email ? <AccountRow label="Email" meta={identity.email} /> : null}
          {identity?.userId ? <AccountRow label="Creator ID" meta={identity.userId} mono /> : null}
        </div>

        <div className="settings-account__group">
          <div className="settings-account__section-title">Security</div>
          <div className="settings-banner">
            Authentication security is managed through your signed-in auth provider and Supabase session controls.
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsNotifications() {
  const identity = useCreatorAccountIdentity();
  const [form, setForm] = useState<NotificationPreferences>({
    push: true,
    email: true,
    sms: false,
    messages: true,
    payments: true,
    subscriptions: true,
    content: true,
  });
  const [saved, setSaved] = useState<NotificationPreferences>(form);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPreferences = async () => {
      try {
        const prefs = await fetchNotificationPreferences();
        if (!isMounted) return;
        setForm(prefs);
        setSaved(prefs);
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setError('Could not load notification preferences right now.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasChanges = useMemo(() => {
    return Object.keys(form).some(
      (key) => form[key as keyof typeof form] !== saved[key as keyof typeof saved]
    );
  }, [form, saved]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const next = await updateNotificationPreferences(form);
      setForm(next);
      setSaved(next);
    } catch (err) {
      console.error(err);
      setError('Could not save notification preferences right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsShell activeItem="notifications" userHandle={identity?.handle ?? ''}>
      <div className="settings-content__header">
        <h2>Notifications</h2>
        <button
          className="save-button"
          type="button"
          disabled={!hasChanges || saving || loading}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="settings-panels">
        <div className="settings-panel">
          <div className="settings-panel__title">Delivery</div>
          {error ? <div className="settings-banner">{error}</div> : null}
          <ToggleRow
            label="Email alerts"
            description="Save email delivery preferences for account updates"
            value={form.email}
            onToggle={() => setForm((prev) => ({ ...prev, email: !prev.email }))}
          />
          <ToggleRow
            label="Push alerts"
            description="Show notifications inside your creator workspace"
            value={form.push}
            onToggle={() => setForm((prev) => ({ ...prev, push: !prev.push }))}
          />
          <ToggleRow
            label="SMS alerts"
            description="Urgent account updates"
            value={form.sms}
            onToggle={() => setForm((prev) => ({ ...prev, sms: !prev.sms }))}
          />
        </div>

        <div className="settings-panel">
          <div className="settings-panel__title">Activity alerts</div>
          <ToggleRow
            label="Messages"
            description="When a fan sends a new direct message"
            value={form.messages}
            onToggle={() => setForm((prev) => ({ ...prev, messages: !prev.messages }))}
          />
          <ToggleRow
            label="Payments"
            description="Tips, PPV unlocks, and payout updates"
            value={form.payments}
            onToggle={() => setForm((prev) => ({ ...prev, payments: !prev.payments }))}
          />
          <ToggleRow
            label="Subscriptions"
            description="New and renewed subscribers"
            value={form.subscriptions}
            onToggle={() =>
              setForm((prev) => ({ ...prev, subscriptions: !prev.subscriptions }))
            }
          />
          <ToggleRow
            label="Content delivery"
            description="Notifications when your posts or stories go live to fans"
            value={form.content}
            onToggle={() => setForm((prev) => ({ ...prev, content: !prev.content }))}
          />
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsSubscription() {
  const identity = useCreatorAccountIdentity();
  const [price, setPrice] = useState('');
  const [savedPrice, setSavedPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasChanges = price !== savedPrice;

  useEffect(() => {
    let isMounted = true;

    const loadPricing = async () => {
      setLoading(true);
      try {
        const pricing = await fetchCreatorPricing();
        if (!isMounted) return;
        const cents = pricing?.subscription_price_cents ?? 0;
        const major = cents > 0 ? (cents / 100).toFixed(2) : '';
        setPrice(major);
        setSavedPrice(major);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadPricing();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async () => {
    const raw = price.trim();
    const numeric = raw ? Number(raw) : 0;
    if (!Number.isFinite(numeric) || numeric < 0) {
      setSaveError('Enter a valid price.');
      return;
    }

    try {
      setLoading(true);
      setSaveError(null);
      await updateCreatorPricing({
        subscription_price_cents: Math.round(numeric * 100),
        subscription_currency: 'KES',
      });
      setSavedPrice(raw);
    } catch (err) {
      console.error(err);
      setSaveError('Could not save price.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsShell activeItem="subscription" userHandle={identity?.handle ?? ''}>
      <div className="settings-content__header settings-content__header--subscription">
        <h2>Subscription price</h2>
        <button className="subscription-header__icon" type="button" aria-label="Pricing">
          <SubscriptionImageIcon />
        </button>
      </div>

      <div className="subscription-body">
        <div className="subscription-price">
          <label className="subscription-field">
            <span>Price per month</span>
            <div className="subscription-field__input">
              <span className="subscription-field__currency">KSh</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                disabled={loading}
              />
            </div>
          </label>
          <div className="subscription-hint">Set a monthly price for fan subscriptions. Use 0 for free subscriptions.</div>
          <div className="subscription-hint">
            Fans with an active subscription can access subscriber-only posts and stories. PPV posts are charged separately from wallet balance.
          </div>
        </div>

        <div className="subscription-actions">
          <button
            className="subscription-button ghost"
            type="button"
            disabled={!hasChanges || loading}
            onClick={() => setPrice(savedPrice)}
          >
            Cancel
          </button>
          <button
            className="subscription-button primary"
            type="button"
            disabled={!hasChanges || loading}
            onClick={() => void handleSave()}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
        {saveError ? <div className="subscription-hint">{saveError}</div> : null}

        <div className="subscription-section">
          <div className="subscription-section__title">Access contract</div>
          <div className="subscription-section__meta">
            Public content is visible to everyone. Subscriber-only content requires an active subscription. PPV content is unlocked per post from the fan wallet.
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsDisplay() {
  const identity = useCreatorAccountIdentity();
  const [theme, setTheme] = useState<'light' | 'dim' | 'dark'>('dark');
  const [compactMode, setCompactMode] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [language, setLanguage] = useState('English');

  useEffect(() => {
    const stored = getStoredLanguage();
    if (stored) {
      setLanguage(stored);
      document.documentElement.lang = stored;
    }

    const handleLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) {
        setLanguage(detail);
        document.documentElement.lang = detail;
        return;
      }

      const fallback = getStoredLanguage();
      setLanguage(fallback);
      document.documentElement.lang = fallback;
    };

    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);

    return () => {
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    };
  }, []);

  return (
    <SettingsShell activeItem="display" userHandle={identity?.handle ?? ''}>
      <div className="settings-content__header">
        <h2>Display</h2>
        <div className="settings-chip">Auto-saved</div>
      </div>
      <div className="settings-panels">
        <div className="settings-panel">
          <div className="settings-panel__title">Theme</div>
          <div className="settings-tags">
            <button
              className={`settings-tag${theme === 'light' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setTheme('light')}
            >
              Light
            </button>
            <button
              className={`settings-tag${theme === 'dim' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setTheme('dim')}
            >
              Dim
            </button>
            <button
              className={`settings-tag${theme === 'dark' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
          </div>
        </div>

        <div className="settings-panel">
          <div className="settings-panel__title">Accessibility</div>
          <ToggleRow
            label="Compact mode"
            description="Reduce spacing in lists"
            value={compactMode}
            onToggle={() => setCompactMode((prev) => !prev)}
          />
          <ToggleRow
            label="Reduce motion"
            description="Disable most animations"
            value={reduceMotion}
            onToggle={() => setReduceMotion((prev) => !prev)}
          />
        </div>

        <div className="settings-panel">
          <div className="settings-panel__title">Language</div>
          <a className="settings-row settings-row--link" href="/my/settings/language">
            <div>
              <div className="settings-row__label">Language</div>
              <div className="settings-row__meta">{language}</div>
            </div>
            <ChevronRightIcon />
          </a>
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsLanguage() {
  const identity = useCreatorAccountIdentity();
  const [selected, setSelected] = useState('English');

  useEffect(() => {
    const stored = getStoredLanguage();
    if (stored) {
      setSelected(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  const handleSelect = (value: LanguageValue) => {
    setSelected(value);
    setStoredLanguage(value);
  };

  return (
    <SettingsShell activeItem="display" userHandle={identity?.handle ?? ''}>
      <div className="settings-content__header settings-content__header--language">
        <button
          className="settings-language-back"
          type="button"
          aria-label="Go back"
          onClick={() => window.history.back()}
        >
          <ArrowLeftIcon />
        </button>
        <h2>Language</h2>
      </div>
      <div className="settings-language-list" role="radiogroup" aria-label="Language">
        {LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option}
            className={`settings-language-row${selected === option ? ' is-active' : ''}`}
            type="button"
            role="radio"
            aria-checked={selected === option}
            onClick={() => handleSelect(option)}
          >
            <span className="settings-language-radio" aria-hidden="true" />
            <span className="settings-language-label">{option}</span>
          </button>
        ))}
      </div>
    </SettingsShell>
  );
}

type ToggleRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onToggle: () => void;
};

function ToggleRow({ label, description, value, onToggle }: ToggleRowProps) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row__label">{label}</div>
        {description ? <div className="settings-row__meta">{description}</div> : null}
      </div>
      <button
        className={`settings-toggle${value ? ' is-on' : ''}`}
        type="button"
        aria-pressed={value}
        onClick={onToggle}
      />
    </div>
  );
}

function AccountRow({ label, meta, mono }: { label: string; meta?: string; mono?: boolean }) {
  return (
    <div className="settings-account__row settings-account__row--static">
      <span className="settings-account__info">
        <span className="settings-account__label">{label}</span>
        {meta ? <span className={`settings-account__meta${mono ? ' settings-account__meta--mono' : ''}`}>{meta}</span> : null}
      </span>
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function SubscriptionImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 12l3-3 4 4 3-2 2 2" />
      <circle cx="9" cy="9" r="1.5" />
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
