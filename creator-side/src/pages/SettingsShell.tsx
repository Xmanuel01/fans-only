import { useEffect, type ReactNode } from 'react';
import './SettingsProfile.css';

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

type SettingsShellProps = {
  activeItem?: SettingsItemKey;
  children: ReactNode;
  userHandle?: string;
};

export default function SettingsShell({
  activeItem,
  children,
  userHandle = '@aiko.mitsuri',
}: SettingsShellProps) {
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

  return (
    <div className="settings-shell">
      <aside className="settings-nav">
        <div className="settings-nav__avatar" aria-label="Profile avatar" />
        <nav className="settings-nav__menu">
          <NavItem href="/onlyfans" label="Home" icon={<HomeIcon />} />
          <NavItem href="/my/notifications" label="Notifications" icon={<BellIcon />} />
          <NavItem href="/my/chats" label="Messages" icon={<ChatIcon />} />
          <NavItem href="/my/collections" label="Collections" icon={<GridIcon />} />
          <NavItem
            href="/my/collections/user-lists/subscriptions/active"
            label="Subscriptions"
            icon={<HeartIcon />}
          />
          <NavItem href="/my/payments/add_card" label="Add card" icon={<CardIcon />} />
          <NavItem href="/aiko_mitsuri" label="My profile" icon={<UserIcon />} />
          <NavItem href="/my/settings" label="More" icon={<MoreIcon />} />
        </nav>
        <a className="settings-nav__cta" href="/posts/create">
          <span className="settings-nav__cta-icon">
            <PlusIcon />
          </span>
          New post
        </a>
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
        <div className="settings-menu__user">{userHandle}</div>
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

      <main className="settings-content">{children}</main>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <a className="nav-item" href={href}>
      <span className="nav-item__icon">{icon}</span>
      <span className="nav-item__label">{label}</span>
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

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20s-7-4.35-7-9.2A4.3 4.3 0 0 1 9.2 6c1.1 0 2.2.45 2.8 1.2A3.7 3.7 0 0 1 14.8 6 4.3 4.3 0 0 1 19 10.8C19 15.65 12 20 12 20z" />
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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
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

