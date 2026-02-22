import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './ProfileAiko.css';

type TabKey = 'posts' | 'media';

const STATUS_OPTIONS = ['Available', 'Away', 'Hidden'] as const;

const PROFILE_TEXT = {
  name: 'Aiko Mitsuri',
  handle: '@aiko.mitsuri',
  status: 'Available',
  intro: 'Osu!, Welcome to my Fanvue',
  bioLead: '* I am Aiko, *',
  bioDetail:
    'I move with quiet confidence, soft curves, and a gaze that lingers. Stay close for cozy vibes, warm smiles, and a little mystery.',
};

export default function ProfileAiko() {
  const [activeTab, setActiveTab] = useState<TabKey>('posts');
  const [showMore, setShowMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [profile, setProfile] = useState(PROFILE_TEXT);
  const [draftProfile, setDraftProfile] = useState(PROFILE_TEXT);
  const [statusOpen, setStatusOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    document.body.classList.add('react-page');
    document.body.classList.add('of-profile-body');
    document.title = profile.name;

    return () => {
      document.body.classList.remove('of-profile-body');
      document.body.classList.remove('react-page');
    };
  }, [profile.name]);

  useEffect(() => {
    if (!isEditOpen) {
      document.body.style.overflow = '';
      return undefined;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isEditOpen]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setStatusOpen(false);
        setIsShareOpen(false);
        setIsEditOpen(false);
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!statusOpen && !isShareOpen) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        statusOpen &&
        statusMenuRef.current &&
        !statusMenuRef.current.contains(target)
      ) {
        setStatusOpen(false);
      }

      if (
        isShareOpen &&
        shareMenuRef.current &&
        !shareMenuRef.current.contains(target) &&
        shareButtonRef.current &&
        !shareButtonRef.current.contains(target)
      ) {
        setIsShareOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isShareOpen, statusOpen]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, 1600);

    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const emptyLabel = useMemo(() => {
    return activeTab === 'posts' ? 'No posts yet' : 'No media yet';
  }, [activeTab]);

  const handleShareAction = async (action: 'copy' | 'share' | 'open') => {
    const url = window.location.href;

    if (action === 'open') {
      window.open(url, '_blank', 'noopener,noreferrer');
      setIsShareOpen(false);
      return;
    }

    if (action === 'share' && navigator.share) {
      try {
        await navigator.share({ title: profile.name, url });
        setIsShareOpen(false);
        return;
      } catch {
        // Ignore share cancellation.
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setToastMessage('Link copied');
        setIsShareOpen(false);
        return;
      } catch {
        // Ignore clipboard failures.
      }
    }

    setToastMessage('Unable to copy link');
  };

  return (
    <div className="profile-shell">
      <aside className="profile-nav">
        <div className="profile-nav__avatar" aria-label="Profile avatar" />
        <nav className="profile-nav__menu">
          <NavItem href="/" label="Home" icon={<HomeIcon />} />
          <NavItem
            href="/my/notifications"
            label="Notifications"
            icon={<BellIcon />}
          />
          <NavItem href="/my/chats" label="Messages" icon={<ChatIcon />} />
          <NavItem href="/my/collections" label="Collections" icon={<GridIcon />} />
          <NavItem
            href="/my/collections/user-lists/subscriptions/active"
            label="Subscriptions"
            icon={<HeartIcon />}
          />
          <NavItem href="/my/payments/add_card" label="Add card" icon={<CardIcon />} />
          <NavItem
            href="/aiko_mitsuri"
            label="My profile"
            icon={<UserIcon />}
            active
          />
          <NavItem href="/my/settings" label="More" icon={<MoreIcon />} />
        </nav>
        <a className="profile-nav__cta" href="/posts/create">
          <span className="profile-nav__cta-icon">
            <PlusIcon />
          </span>
          New post
        </a>
      </aside>

      <main className="profile-main">
        <section className="profile-card">
          <header className="profile-cover">
            <button
              className="icon-button"
              type="button"
              aria-label="Go back"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon />
            </button>
            <div className="profile-cover__title">{PROFILE_TEXT.name}</div>
            <button className="icon-button" type="button" aria-label="More options">
              <DotsIcon />
            </button>
          </header>

          <div className="profile-inner">
            <div className="profile-header">
              <div className="profile-avatar">
                <span className="profile-avatar__online" />
              </div>
              <div className="profile-actions">
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => {
                    setDraftProfile(profile);
                    setIsEditOpen(true);
                  }}
                >
                  <GearIcon />
                  Edit profile
                </button>
                <button
                  className="icon-button outline"
                  type="button"
                  aria-label="Share profile"
                  onClick={() => setIsShareOpen((prev) => !prev)}
                  ref={shareButtonRef}
                >
                  <ShareIcon />
                </button>
                {isShareOpen ? (
                  <div className="share-menu" ref={shareMenuRef}>
                    <button
                      type="button"
                      onClick={() => handleShareAction('copy')}
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareAction('share')}
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareAction('open')}
                    >
                      Open in new tab
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="profile-info">
              <h1>{profile.name}</h1>
              <div className="profile-meta">
                <span>{profile.handle}</span>
                <div className="profile-status">
                  <button
                    className="status-button"
                    type="button"
                    aria-expanded={statusOpen}
                    onClick={() => setStatusOpen((prev) => !prev)}
                  >
                    {profile.status}
                    <ChevronDownIcon />
                  </button>
                  {statusOpen ? (
                    <div className="status-menu" role="menu" ref={statusMenuRef}>
                      {STATUS_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="status-menu__item"
                          onClick={() => {
                            setProfile((prev) => ({ ...prev, status: option }));
                            setStatusOpen(false);
                          }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="profile-text">{profile.intro}</p>
              <p className="profile-text">{profile.bioLead}</p>
              <p className={`profile-text ${showMore ? '' : 'profile-text--fade'}`}>
                {profile.bioDetail}
              </p>
              <button
                className="link-button"
                type="button"
                onClick={() => setShowMore((prev) => !prev)}
              >
                {showMore ? 'Less info' : 'More info'}
              </button>
            </div>
          </div>

          <div className="profile-tabs">
            <button
              type="button"
              className={activeTab === 'posts' ? 'active' : ''}
              onClick={() => setActiveTab('posts')}
            >
              No posts
            </button>
            <button
              type="button"
              className={activeTab === 'media' ? 'active' : ''}
              onClick={() => setActiveTab('media')}
            >
              No media
            </button>
          </div>

          <div className="profile-empty">
            <div className="empty-graphic" aria-hidden="true">
              <div className="empty-card empty-card--left" />
              <div className="empty-card empty-card--center" />
              <div className="empty-card empty-card--right" />
            </div>
            <p>{emptyLabel}</p>
          </div>
        </section>
      </main>

      <aside className="profile-aside">
        <div className="card search-card">
          <label className="search-label" htmlFor="profile-search">
            Search user&apos;s post
          </label>
          <div className="search-input">
            <input
              id="profile-search"
              type="search"
              placeholder="Search user&apos;s post"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchTerm('');
                }
              }}
            />
            <SearchIcon />
          </div>
          {searchTerm.trim().length > 0 ? (
            <div className="search-feedback" role="status" aria-live="polite">
              No results for &quot;{searchTerm.trim()}&quot;
            </div>
          ) : null}
        </div>

        <div className="card spotify-card">
          <div className="spotify-card__header">
            <span>Spotify</span>
            <ChevronUpIcon />
          </div>
          <button className="spotify-button" type="button">
            <span className="spotify-icon">
              <SpotifyIcon />
            </span>
            Sign in with Spotify
          </button>
        </div>

        <div className="profile-footer">
          <a href="/privacy">Privacy</a>
          <span className="dot">·</span>
          <a href="/cookies">Cookie Notice</a>
          <span className="dot">·</span>
          <a href="/terms">Terms of Service</a>
        </div>
      </aside>

      <button className="help-fab" type="button" aria-label="Help">
        ?
      </button>

      {isEditOpen ? (
        <div
          className="modal-overlay"
          onClick={() => setIsEditOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal__header">
              <h2>Edit profile</h2>
              <button
                className="icon-button outline"
                type="button"
                onClick={() => setIsEditOpen(false)}
                aria-label="Close edit profile"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="modal__body">
              <label className="field">
                Display name
                <input
                  type="text"
                  value={draftProfile.name}
                  onChange={(event) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Username
                <input
                  type="text"
                  value={draftProfile.handle}
                  onChange={(event) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      handle: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Status
                <select
                  value={draftProfile.status}
                  onChange={(event) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      status: event.target.value,
                    }))
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Intro
                <input
                  type="text"
                  value={draftProfile.intro}
                  onChange={(event) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      intro: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Bio line
                <input
                  type="text"
                  value={draftProfile.bioLead}
                  onChange={(event) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      bioLead: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Bio detail
                <textarea
                  rows={3}
                  value={draftProfile.bioDetail}
                  onChange={(event) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      bioDetail: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="modal__footer">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setIsEditOpen(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setProfile(draftProfile);
                  setIsEditOpen(false);
                }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? <div className="toast">{toastMessage}</div> : null}
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <a className={`nav-item ${active ? 'active' : ''}`} href={href}>
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

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z" />
      <path d="M4 12l2.1-.6.6-2.1-1.7-1.5 1.9-3.3 2.1.6 1.6-1.6-.6-2.1h3.8l-.6 2.1 1.6 1.6 2.1-.6 1.9 3.3-1.7 1.5.6 2.1L20 12l-2.1.6-.6 2.1 1.7 1.5-1.9 3.3-2.1-.6-1.6 1.6.6 2.1H9.8l.6-2.1-1.6-1.6-2.1.6-1.9-3.3 1.7-1.5-.6-2.1L4 12z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M19 14v5H5V5h5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M7.5 10.5c3-1.2 6.6-1 9.3.4" />
      <path d="M8.5 13c2.5-.8 5.5-.6 7.6.5" />
      <path d="M9.5 15.3c2-.5 4.1-.4 5.6.3" />
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
