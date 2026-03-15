import { useEffect, type ReactNode } from 'react';
import './MyPages.css';
import './SettingsProfile.css';
import { useState } from 'react';
import { fetchCurrentCreatorProfile } from '../supabaseClient';

type SettingsItemKey =
  | 'profile'
  | 'account'
  | 'privacy'
  | 'subscription'
  | 'notifications'
  | 'display';

type SettingsItem = {
  key: SettingsItemKey;
  label: string;
  href: string;
};

const USE_SAMPLE_DATA =
  !import.meta.env.PROD && import.meta.env.VITE_ENABLE_SAMPLE_DATA === 'true';

const PRIMARY_SETTINGS: SettingsItem[] = [
  { key: 'profile', label: 'Profile', href: '/my/settings/profile' },
  { key: 'account', label: 'Account', href: '/my/settings/account' },
  { key: 'privacy', label: 'Privacy and safety', href: '/my/settings/privacy' },
  {
    key: 'subscription',
    label: 'Subscription price',
    href: '/my/settings/subscription',
  },
  { key: 'notifications', label: 'Notifications', href: '/my/settings/notifications' },
];

const GENERAL_SETTINGS: SettingsItem[] = [
  { key: 'display', label: 'Display', href: '/my/settings/display' },
];

const NAV_PROFILE = USE_SAMPLE_DATA
  ? {
      name: 'Aiko Mitsuri',
      handle: '@aiko.mitsuri',
      avatar: 'https://i.pravatar.cc/120?img=21',
      meta: { fans: '1 fan', followers: '4 followers' },
    }
  : {
      name: 'Creator',
      handle: '',
      avatar: '',
      meta: null as null | { fans: string; followers: string },
    };

type SettingsShellProps = {
  activeItem?: SettingsItemKey;
  children: ReactNode;
  userHandle?: string;
};

export default function SettingsShell({
  activeItem,
  children,
  userHandle = USE_SAMPLE_DATA ? NAV_PROFILE.handle : '',
}: SettingsShellProps) {
  const [navProfile, setNavProfile] = useState(NAV_PROFILE);
  const [isNavPanelOpen, setIsNavPanelOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add('react-page');
    document.body.classList.add('of-settings-body');

    const activeLabel =
      PRIMARY_SETTINGS.find((item) => item.key === activeItem)?.label ??
      GENERAL_SETTINGS.find((item) => item.key === activeItem)?.label ??
      null;

    document.title = activeLabel ? `Settings - ${activeLabel}` : 'Settings';

    return () => {
      document.body.classList.remove('of-settings-body');
      document.body.classList.remove('react-page');
    };
  }, [activeItem]);

  useEffect(() => {
    if (USE_SAMPLE_DATA) {
      setNavProfile(NAV_PROFILE);
      return;
    }

    let cancelled = false;

    const loadNavProfile = async () => {
      try {
        const profile = await fetchCurrentCreatorProfile();
        if (cancelled || !profile) {
          return;
        }

        setNavProfile((prev) => ({
          ...prev,
          name: profile.name || prev.name,
          handle: profile.handle,
          avatar: profile.avatar_url ?? '',
          meta: prev.meta,
        }));
      } catch (error) {
        console.error('Could not load creator nav profile', error);
      }
    };

    void loadNavProfile();
    const handleProfileUpdated = () => {
      void loadNavProfile();
    };
    window.addEventListener('creator-profile-updated', handleProfileUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('creator-profile-updated', handleProfileUpdated);
    };
  }, []);

  const navInitial = navProfile.name.trim().charAt(0).toUpperCase() || 'C';
  const effectiveHandle = userHandle || navProfile.handle;
  const closeNavPanel = () => setIsNavPanelOpen(false);

  return (
    <div className="settings-shell">
      {isNavPanelOpen ? (
        <button
          className="my-nav-backdrop"
          type="button"
          aria-label="Close creator menu"
          onClick={closeNavPanel}
        />
      ) : null}

      <aside className={`my-nav my-nav--dark${isNavPanelOpen ? ' is-open' : ''}`}>
        <button
          className="my-nav__close"
          type="button"
          aria-label="Close creator menu"
          onClick={closeNavPanel}
        >
          <CloseIcon />
        </button>
        <div className="my-nav__profile">
          {navProfile.avatar ? (
            <img className="my-nav__avatar" src={navProfile.avatar} alt="Profile avatar" />
          ) : (
            <div className="my-nav__avatar my-nav__avatar--placeholder" aria-hidden="true">
              {navInitial}
            </div>
          )}
          <div className="my-nav__identity">
            <div className="name">{navProfile.name}</div>
            {effectiveHandle ? <div className="handle">{effectiveHandle}</div> : null}
            {navProfile.meta ? (
              <div className="meta">
                <span>{navProfile.meta.fans}</span> - <span>{navProfile.meta.followers}</span>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="my-nav__menu">
          <NavItem href="/" label="Home" icon={<HomeIcon />} onClick={closeNavPanel} />
          <NavItem
            href="/my/notifications"
            label="Notifications"
            icon={<BellIcon />}
            badge="4"
            onClick={closeNavPanel}
          />
          <NavItem href="/my/chats" label="Chats" icon={<ChatIcon />} onClick={closeNavPanel} />
          <NavItem
            href="/my/collections"
            label="Collections"
            icon={<GearIcon />}
            onClick={closeNavPanel}
          />
          <NavItem
            href="/my/collections/user-lists/subscriptions/active"
            label="Subscriptions"
            icon={<BagIcon />}
            onClick={closeNavPanel}
          />
          <NavItem
            href="/my/payments/add_card"
            label="Wallet"
            icon={<CardIcon />}
            trailing={<span className="wallet-pill">0.00</span>}
            onClick={closeNavPanel}
          />
        </nav>

        <a className="my-nav__cta" href="/posts/create" onClick={closeNavPanel}>
          <span className="my-nav__cta-icon">
            <PlusIcon />
          </span>
          New Post
        </a>

        <div className="my-nav__secondary">
          <NavItem href="/my/settings" label="Settings" icon={<GearIcon />} isActive onClick={closeNavPanel} />
          {USE_SAMPLE_DATA ? (
            <>
              <NavItem href="/news" label="What's new" icon={<StarIcon />} badge="1" onClick={closeNavPanel} />
              <NavItem href="/logout" label="Log out" icon={<LogOutIcon />} onClick={closeNavPanel} />
            </>
          ) : null}
        </div>
      </aside>

      <section className="settings-menu">
        <div className="settings-menu__header">
          <button
            className="icon-button"
            type="button"
            aria-label="Go back"
            onClick={() => window.history.back()}
          >
            <ArrowLeftIcon />
          </button>
          <h2>Settings</h2>
        </div>
        {effectiveHandle ? <div className="settings-menu__user">{effectiveHandle}</div> : null}
        <div className="settings-menu__list">
          {PRIMARY_SETTINGS.map((item) => (
            <a
              key={item.key}
              className={`settings-item${activeItem === item.key ? ' active' : ''}`}
              href={item.href}
              aria-current={activeItem === item.key ? 'page' : undefined}
            >
              {item.label}
              <ChevronRightIcon />
            </a>
          ))}
          <div className="settings-section">General</div>
          {GENERAL_SETTINGS.map((item) => (
            <a
              key={item.key}
              className={`settings-item${activeItem === item.key ? ' active' : ''}`}
              href={item.href}
              aria-current={activeItem === item.key ? 'page' : undefined}
            >
              {item.label}
              <ChevronRightIcon />
            </a>
          ))}
        </div>
      </section>

      <main className="settings-content">
        <div className="settings-mobile-toolbar">
          <button
            className="my-nav-toggle"
            type="button"
            aria-label={isNavPanelOpen ? 'Hide creator menu' : 'Show creator menu'}
            aria-expanded={isNavPanelOpen}
            onClick={() => setIsNavPanelOpen((prev) => !prev)}
          >
            <MenuIcon />
            <span>Menu</span>
          </button>
        </div>
        {children}
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
  onClick,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  badge?: string;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <a className={`my-nav-item${isActive ? ' is-active' : ''}`} href={href} title={label} onClick={onClick}>
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

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
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

function ArrowLeftIcon() {
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
