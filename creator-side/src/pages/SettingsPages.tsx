import { useEffect, useMemo, useState } from 'react';
import { fetchCreatorPricing, updateCreatorPricing } from '../supabaseClient';
import SettingsShell from './SettingsShell';
import './SettingsPages.css';

const USE_SAMPLE_DATA =
  !import.meta.env.PROD && import.meta.env.VITE_ENABLE_SAMPLE_DATA === 'true';
const SAMPLE_HANDLE = '@aiko.mitsuri';
const SAMPLE_EMAIL = 'creator@example.com';
const SAMPLE_DISPLAY_NAME = 'Aiko Mitsuri';
const SAMPLE_SUBSCRIPTION_PRICE = 'KSh 1299 / month';

const USER_HANDLE = USE_SAMPLE_DATA ? SAMPLE_HANDLE : '';
const ACCOUNT_EMAIL = USE_SAMPLE_DATA ? SAMPLE_EMAIL : '';
const DISPLAY_NAME = USE_SAMPLE_DATA ? SAMPLE_DISPLAY_NAME : 'Creator';
const SUBSCRIPTION_PRICE = USE_SAMPLE_DATA ? SAMPLE_SUBSCRIPTION_PRICE : 'Not set';

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

export function SettingsHome() {
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [autoSaveDrafts, setAutoSaveDrafts] = useState(true);
  const [contentProtection, setContentProtection] = useState(false);

  return (
    <SettingsShell userHandle={USER_HANDLE}>
      <div className="settings-content__header">
        <h2>Settings</h2>
        <a className="save-button" href="/my/settings/profile">
          Edit profile
        </a>
      </div>
      <div className="settings-panels">
        <div className="settings-panel">
          <div className="settings-panel__title">Quick controls</div>
          <ToggleRow
            label="Show online status"
            description="Let fans see when you are active"
            value={onlineStatus}
            onToggle={() => setOnlineStatus((prev) => !prev)}
          />
          <ToggleRow
            label="Auto-save drafts"
            description="Keep new posts safe while you write"
            value={autoSaveDrafts}
            onToggle={() => setAutoSaveDrafts((prev) => !prev)}
          />
          <ToggleRow
            label="Content protection"
            description="Discourage reuploads with watermark"
            value={contentProtection}
            onToggle={() => setContentProtection((prev) => !prev)}
          />
        </div>

        <div className="settings-panel">
          <div className="settings-panel__title">Account overview</div>
          <div className="settings-row">
            <div>
              <div className="settings-row__label">Display name</div>
              <div className="settings-row__meta">{DISPLAY_NAME}</div>
            </div>
            <span className="settings-chip">Verified</span>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row__label">Subscription price</div>
              <div className="settings-row__meta">{SUBSCRIPTION_PRICE}</div>
            </div>
            <a className="save-button" href="/my/settings/subscription">
              Manage
            </a>
          </div>
          <div className="settings-banner">
            Tip: Keep your bio updated to improve conversions.
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsAccount() {
  return (
    <SettingsShell activeItem="account" userHandle={USER_HANDLE}>
      <div className="settings-content__header">
        <h2>Account</h2>
      </div>
      <div className="settings-account">
        <div className="settings-account__group">
          <div className="settings-account__section-title">Account info</div>
          <AccountRow label="Username" meta={USER_HANDLE || undefined} />
          <AccountRow label="Email" meta={ACCOUNT_EMAIL || undefined} />
          <AccountRow label="Phone number" />
        </div>

        <div className="settings-account__group">
          <div className="settings-account__section-title">Linked accounts</div>
          <AccountRow label="X account" />
          <AccountRow label="Google account" meta={ACCOUNT_EMAIL || undefined} />
        </div>

        <div className="settings-account__group">
          <div className="settings-account__section-title">Connected accounts</div>
          <AccountRow label="Connect another SpicyX account" />
        </div>

        <div className="settings-account__group">
          <div className="settings-account__section-title">Security</div>
          <AccountRow label="Password" />
          <AccountRow label="Login sessions" />
          <AccountRow label="Two Step Authentication" />
          <AccountRow label="Passwordless sign in" />
        </div>

        <div className="settings-account__group">
          <div className="settings-account__section-title">Account management</div>
          <AccountRow label="Delete account" />
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsNotifications() {
  const [form, setForm] = useState({
    email: true,
    push: true,
    sms: false,
    tips: true,
    mentions: true,
    subscriptions: true,
  });
  const [saved, setSaved] = useState(form);

  const hasChanges = useMemo(() => {
    return Object.keys(form).some(
      (key) => form[key as keyof typeof form] !== saved[key as keyof typeof saved]
    );
  }, [form, saved]);

  return (
    <SettingsShell activeItem="notifications" userHandle={USER_HANDLE}>
      <div className="settings-content__header">
        <h2>Notifications</h2>
        <button
          className="save-button"
          type="button"
          disabled={!hasChanges}
          onClick={() => setSaved(form)}
        >
          Save
        </button>
      </div>
      <div className="settings-panels">
        <div className="settings-panel">
          <div className="settings-panel__title">Delivery</div>
          <ToggleRow
            label="Email alerts"
            description="Weekly highlights and payouts"
            value={form.email}
            onToggle={() => setForm((prev) => ({ ...prev, email: !prev.email }))}
          />
          <ToggleRow
            label="Push alerts"
            description="In-app notifications"
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
            label="New tips"
            description="When a fan tips you"
            value={form.tips}
            onToggle={() => setForm((prev) => ({ ...prev, tips: !prev.tips }))}
          />
          <ToggleRow
            label="Mentions"
            description="Tags in posts and comments"
            value={form.mentions}
            onToggle={() =>
              setForm((prev) => ({ ...prev, mentions: !prev.mentions }))
            }
          />
          <ToggleRow
            label="Subscriptions"
            description="New and renewed subscribers"
            value={form.subscriptions}
            onToggle={() =>
              setForm((prev) => ({ ...prev, subscriptions: !prev.subscriptions }))
            }
          />
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsPrivacy() {
  const [form, setForm] = useState({
    showStatus: true,
    allowDm: true,
    allowTips: true,
    hideLikes: false,
  });
  const [saved, setSaved] = useState(form);

  const hasChanges = useMemo(() => {
    return Object.keys(form).some(
      (key) => form[key as keyof typeof form] !== saved[key as keyof typeof saved]
    );
  }, [form, saved]);

  return (
    <SettingsShell activeItem="privacy" userHandle={USER_HANDLE}>
      <div className="settings-content__header">
        <h2>Privacy and safety</h2>
        <button
          className="save-button"
          type="button"
          disabled={!hasChanges}
          onClick={() => setSaved(form)}
        >
          Save
        </button>
      </div>
      <div className="settings-panels">
        <div className="settings-panel">
          <div className="settings-panel__title">Visibility</div>
          <ToggleRow
            label="Show online status"
            description="Display your availability"
            value={form.showStatus}
            onToggle={() =>
              setForm((prev) => ({ ...prev, showStatus: !prev.showStatus }))
            }
          />
          <ToggleRow
            label="Allow direct messages"
            description="Let fans message you"
            value={form.allowDm}
            onToggle={() =>
              setForm((prev) => ({ ...prev, allowDm: !prev.allowDm }))
            }
          />
          <ToggleRow
            label="Allow tips"
            description="Enable tipping on content"
            value={form.allowTips}
            onToggle={() =>
              setForm((prev) => ({ ...prev, allowTips: !prev.allowTips }))
            }
          />
        </div>

        <div className="settings-panel">
          <div className="settings-panel__title">Engagement</div>
          <ToggleRow
            label="Hide like counts"
            description="Keep engagement private"
            value={form.hideLikes}
            onToggle={() =>
              setForm((prev) => ({ ...prev, hideLikes: !prev.hideLikes }))
            }
          />
          <div className="settings-banner">
            You can always mute or block individual users from their profile.
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}

export function SettingsSubscription() {
  const [price, setPrice] = useState('');
  const [savedPrice, setSavedPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'trial' | 'tracking'>(
    'profile'
  );
  const [trialView, setTrialView] = useState<'yours' | 'shared'>('yours');

  const hasChanges = price !== savedPrice;

  useEffect(() => {
    if (USE_SAMPLE_DATA) {
      setPrice('12.99');
      setSavedPrice('12.99');
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const pricing = await fetchCreatorPricing();
        const cents = pricing?.subscription_price_cents ?? 0;
        const major = cents > 0 ? (cents / 100).toFixed(2) : '';
        setPrice(major);
        setSavedPrice(major);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SettingsShell activeItem="subscription" userHandle={USER_HANDLE}>
      <div className="settings-content__header settings-content__header--subscription">
        <h2>Subscription and promotions</h2>
        <button className="subscription-header__icon" type="button" aria-label="Media">
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
          <div className="subscription-hint">Minimum KSh 500 or free</div>
          <div className="subscription-hint">
            You must{' '}
            <a href="/my/banking" className="subscription-link">
              Add a Bank Account or Payment Information
            </a>{' '}
            before you can set your price or accept tips.
          </div>
        </div>

        <div className="subscription-actions">
          <button
            className="subscription-button ghost"
            type="button"
            disabled={!hasChanges}
            onClick={() => setPrice(savedPrice)}
          >
            Cancel
          </button>
          <button
            className="subscription-button primary"
            type="button"
            disabled={!hasChanges}
            onClick={async () => {
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
            }}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
        {saveError ? <div className="subscription-hint">{saveError}</div> : null}

        <div className="subscription-tabs">
          <button
            className={`subscription-tab${activeTab === 'profile' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('profile')}
          >
            Profile promotions
          </button>
          <button
            className={`subscription-tab${activeTab === 'trial' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('trial')}
          >
            Free trial links
          </button>
          <button
            className={`subscription-tab${activeTab === 'tracking' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('tracking')}
          >
            Tracking links
          </button>
        </div>

        {activeTab === 'profile' ? (
          <>
            <div className="subscription-section">
              <div className="subscription-section__title">Profile promotion campaign</div>
              <div className="subscription-section__meta">
                Offer a free trial or a discounted subscription on your profile for a limited
                number of new or already expired subscribers.
              </div>
              <button className="subscription-outline" type="button" disabled>
                Start promotion campaign
              </button>
            </div>

            <div className="subscription-section">
              <div className="subscription-section__title">Subscription bundles</div>
              <div className="subscription-section__meta">
                Offer several months of subscription as a discounted bundle.
              </div>
              <button className="subscription-outline" type="button" disabled>
                Add bundle
              </button>
            </div>
          </>
        ) : activeTab === 'trial' ? (
          <>
            <div className="subscription-trial">
              <div className="subscription-trial__intro">
                Set subscription price to create and share separate links with free trial
                subscription.
              </div>
              <button className="subscription-outline" type="button" disabled>
                Create new free trial link
              </button>
            </div>

            <div className="subscription-trial__recent">
              <span>Recent</span>
              <button className="subscription-icon-button" type="button" aria-label="Filter">
                <SubscriptionFilterIcon />
              </button>
            </div>

            <div className="subscription-pills">
              <button
                className={`subscription-pill${trialView === 'yours' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setTrialView('yours')}
              >
                Your links
              </button>
              <button
                className={`subscription-pill${trialView === 'shared' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setTrialView('shared')}
              >
                Shared with you
              </button>
            </div>

            <div className="subscription-empty">
              <FreeTrialEmptyIcon />
              <div>No free trial links yet</div>
            </div>
          </>
        ) : (
          <>
            <div className="subscription-trial">
              <div className="subscription-trial__intro">
                Create and share separate Tracking links for your profile.
              </div>
              <button className="subscription-outline" type="button" disabled>
                Create new tracking link
              </button>
            </div>

            <div className="subscription-trial__recent">
              <span>Recent</span>
              <button className="subscription-icon-button" type="button" aria-label="Filter">
                <SubscriptionFilterIcon />
              </button>
            </div>

            <div className="subscription-pills">
              <button
                className={`subscription-pill${trialView === 'yours' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setTrialView('yours')}
              >
                Your links
              </button>
              <button
                className={`subscription-pill${trialView === 'shared' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setTrialView('shared')}
              >
                Shared with you
              </button>
            </div>

            <div className="subscription-empty">
              <FreeTrialEmptyIcon />
              <div>No tracking links yet</div>
            </div>
          </>
        )}
      </div>
    </SettingsShell>
  );
}

export function SettingsDisplay() {
  const [theme, setTheme] = useState<'light' | 'dim' | 'dark'>('light');
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
    <SettingsShell activeItem="display" userHandle={USER_HANDLE}>
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
    <SettingsShell activeItem="display" userHandle={USER_HANDLE}>
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

function AccountRow({ label, meta }: { label: string; meta?: string }) {
  return (
    <button className="settings-account__row" type="button">
      <span className="settings-account__info">
        <span className="settings-account__label">{label}</span>
        {meta ? <span className="settings-account__meta">{meta}</span> : null}
      </span>
      <ChevronRightIcon />
    </button>
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

function SubscriptionFilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function FreeTrialEmptyIcon() {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true">
      <rect x="24" y="38" width="96" height="64" rx="8" />
      <rect x="24" y="38" width="96" height="12" rx="6" />
      <circle cx="40" cy="44" r="2" />
      <circle cx="48" cy="44" r="2" />
      <circle cx="56" cy="44" r="2" />
      <circle cx="140" cy="72" r="26" />
      <path d="M132 72h16" />
      <path d="M140 64v16" />
      <path d="M124 100l-10 10" />
      <path d="M114 100l10 10" />
      <path d="M166 100l8 8" />
    </svg>
  );
}






