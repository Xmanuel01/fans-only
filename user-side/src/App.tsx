import React, { useState, useRef, useEffect } from 'react'
import {
  FiBell,
  FiCompass,
  FiFilter,
  FiGift,
  FiHeart,
  FiHome,
  FiLock,
  FiMessageCircle,
  FiMoreHorizontal,
  FiSearch,
  FiSettings,
  FiShare,
  FiChevronRight,
  FiChevronLeft,
  FiChevronDown,
} from 'react-icons/fi'
import { TbMessageDots } from 'react-icons/tb'
import {
  fetchAgeConfirmation,
  markAgeConfirmed,
  logAgeExit,
  logAgeEvent,
  getCurrentSession,
  sendMagicLink,
  signOut,
  signInWithProvider,
  submitFeatureRequest,
} from './supabaseClient'

function AuthPrompt({ onLinkSent }: { onLinkSent: () => void }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    if (!email) return
    setStatus('sending')
    setError(null)
    try {
      await sendMagicLink(email)
      setStatus('sent')
      onLinkSent()
    } catch (err) {
      console.error(err)
      setError('Could not send sign-in link. Try again.')
      setStatus('error')
    }
  }

  return (
    <div className="auth-block">
      <div className="auth-card">
        <h2>Sign in to continue</h2>
        <p>This content is only available to signed-in users. Please log in or create an account.</p>
        <label className="auth-label">
          Email for magic link
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
          />
        </label>
        <button className="auth-btn" onClick={handleSend} disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Link sent!' : 'Send magic link'}
        </button>
        {error && <div className="auth-error">{error}</div>}
        <ul>
          <li>Use the Supabase-hosted auth page or your embedded login flow.</li>
          <li>After sign-in, return here to view content.</li>
        </ul>
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
        <a href="/pages/cookies.html">Cookies</a>
        <a href="/pages/privacy.html">Privacy</a>
        <button onClick={onAccept}>Accept</button>
      </div>
    </div>
  )
}

function AgeGate({
  open,
  onEnter,
  onExit,
}: {
  open: boolean
  onEnter: () => void
  onExit: () => void
}) {
  if (!open) return null
  return (
    <div className="age-overlay">
      <div className="age-backdrop" />
      <div className="age-modal">
        <h2>
          This is an <span className="strong">adults only</span> platform
        </h2>
        <p>The content on this site may include explicit material.</p>
        <p>
          Access is strictly limited to those who are 18 years of age or older, or the age of
          majority in your jurisdiction (whichever is greater).
        </p>
        <p>
          Please use parental controls and filtering tools to prevent minors from accessing
          age-restricted content. If you are under 18, or if such content is illegal in your
          location, please leave now.
        </p>
        <p className="age-links">
          <a href="/pages/terms.html">Terms</a> · <a href="/pages/privacy.html">Privacy</a> ·{' '}
          <a href="/pages/usc2257.html">2257</a> ·{' '}
          <a href="/pages/acceptable-use-policy.html">Acceptable Use</a>
        </p>
        <div className="age-actions">
          <button className="pill light full" onClick={onEnter}>
            I’m 18 or older — enter
          </button>
          <button className="pill ghost full" onClick={onExit}>
            I’m under 18 — exit
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
  { icon: FiSettings, label: 'Settings', key: 'settings' },
  { icon: FiGift, label: 'Membership', key: 'membership' },
]

const memberships = [{ name: 'Brandulate AI', avatar: 'https://i.pravatar.cc/64?img=14' }]

const visited = [
  { name: "Boyo's Medicine", avatar: 'https://i.pravatar.cc/64?img=47' },
  { name: 'Aranaktu', avatar: 'https://i.pravatar.cc/64?img=36' },
]

const profile = {
  name: 'J Koina',
  role: 'Member',
  avatar: 'https://i.pravatar.cc/64?img=21',
}

const textPost = {
  user: { name: 'Brandulate AI', avatar: 'https://i.pravatar.cc/64?img=14' },
  date: 'Dec 15, 2025',
  title: "Ayo fam, here's a little something straight from the lab ????????",
  body: "This is an experimental build of Z-Image Turbo, (free for all) It's still a WIP, still",
  likes: 2,
  comments: 0,
  tips: 1,
}

const mediaPost = {
  user: { name: 'Brandulate AI', avatar: 'https://i.pravatar.cc/64?img=14' },
  title: '2601_ZIT_BSY_Q4 + Q5 (C60)',
  date: 'January 14',
  image:
    'https://images.unsplash.com/photo-1601758124206-0c3c5eff8cd5?auto=format&fit=crop&w=1400&q=80',
}

const filters = [
  'All',
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

const exploreCreators = [
  {
    name: 'ZHX F',
    tag: 'creating VaM plugins, and other…',
    img: 'https://i.pravatar.cc/200?img=12',
  },
  {
    name: 'Nonmom Figures',
    tag: 'Creates Fullsize, Chibi, Bust &…',
    img: 'https://i.pravatar.cc/200?img=65',
  },
  {
    name: 'Shaky AI',
    tag: 'You like what you see? Go ahead…',
    img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Quant Mods',
    tag: 'Creating shaders',
    img: 'https://dummyimage.com/600x600/000/fff&text=quant+V',
  },
  {
    name: 'Gofile',
    tag: 'Creating an innovative cloud…',
    img: 'https://dummyimage.com/600x600/f6c94c/000&text=Gofile',
  },
  {
    name: 'Sonic Ether',
    tag: 'Creating Minecraft Shaders',
    img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
  },
]

const popularThisWeek = [
  {
    name: 'Kali Lowry',
    tag: 'Welcome to the exclusive community for all things',
    img: 'https://i.pravatar.cc/120?img=33',
  },
  {
    name: 'Quazii',
    tag: 'I create epic content & videos for World of Warcraft.',
    img: 'https://i.pravatar.cc/120?img=16',
  },
  {
    name: 'The Cutting Room Floor',
    tag: 'Creating podcasts',
    img: 'https://dummyimage.com/300x300/1aaf2b/fff&text=TCRF',
  },
  {
    name: 'Fear&',
    tag: 'a podcast hosted by Hasan, Will, QT & Austin',
    img: 'https://dummyimage.com/300x300/111/fff&text=Fear&',
  },
  {
    name: 'Smarter Every Day',
    tag: 'Creating Science Videos',
    img: 'https://dummyimage.com/300x300/f33/fff&text=SED',
  },
  {
    name: 'Watch What Crappens',
    tag: 'Creating Podcast!',
    img: 'https://dummyimage.com/300x300/1990ff/fff&text=Crappens',
  },
  { name: 'Eoin Reardon', tag: 'Woodworking Content', img: 'https://i.pravatar.cc/120?img=22' },
  {
    name: 'Second Thought',
    tag: 'Creating Socialist Educational Videos',
    img: 'https://dummyimage.com/300x300/e23d53/fff&text=Second+Thought',
  },
  {
    name: 'Zane and Heath: UNFILTERED',
    tag: 'creating UNFILTERED Podcasts, Bonus Episodes, Vlogs, and Shows',
    img: 'https://dummyimage.com/300x300/2c2c2c/fff&text=Z&H',
  },
]

const newOnPatreon = [
  {
    name: 'CirqueDuSirois',
    tag: 'The Throbbing Pulse of DFW …',
    img: 'https://dummyimage.com/400x400/f68c1f/fff&text=Cirque',
  },
  {
    name: 'What Chaos!',
    tag: 'Hockey & pop culture podcast.',
    img: 'https://dummyimage.com/400x400/00a0e9/fff&text=Chaos',
  },
  { name: 'Silky', tag: 'Reactions', img: 'https://dummyimage.com/400x400/d71f26/fff&text=Silky' },
  {
    name: 'FischTank Productions',
    tag: 'Reaction Videos and Live Music…',
    img: 'https://dummyimage.com/400x400/00c087/fff&text=Fish',
  },
  {
    name: 'The Purple Populist Show',
    tag: 'The Purple Populist Show',
    img: 'https://dummyimage.com/400x400/6c3b7c/fff&text=Purple',
  },
  {
    name: 'Political Reality Podcast',
    tag: 'A weekly podcast on politics',
    img: 'https://dummyimage.com/400x400/9c7a30/fff&text=PRP',
  },
]

const topCreatorsBlocks = [
  {
    title: 'Wellness',
    creators: [
      {
        name: 'Maintenance Phase',
        tag: 'Creating podcasts!',
        img: 'https://dummyimage.com/360x360/f36ba0/fff&text=??',
      },
      {
        name: 'Zero to Finals',
        tag: 'Medical Education Content',
        img: 'https://dummyimage.com/360x360/0b4b8f/fff&text=Zero',
      },
      {
        name: 'Kya & Co',
        tag: 'Art, Mental Health & Dissociative…',
        img: 'https://dummyimage.com/360x360/71c5e8/fff&text=KYA',
      },
      {
        name: 'Lindsay Braman',
        tag: 'Doodling mental health…',
        img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
      },
      {
        name: 'BracedLife',
        tag: 'Creating Medical videos featuret…',
        img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      },
      {
        name: 'The Curbsiders Internal Medicine Podcast',
        tag: 'Knowledge Food for your Brain…',
        img: 'https://dummyimage.com/360x360/ffffff/111&text=Curbsiders',
      },
    ],
  },
  {
    title: 'Soccer',
    creators: [
      {
        name: 'Aranaktu',
        tag: 'Creating modding tools for…',
        img: 'https://i.pravatar.cc/360?img=36',
      },
      {
        name: 'FIFER',
        tag: 'Creating The FC26 Realism Mod',
        img: 'https://dummyimage.com/360x360/5234bf/fff&text=FIFER',
      },
      {
        name: "Anth James' EAFC Gameplay Overhaul",
        tag: 'All things gameplay',
        img: 'https://dummyimage.com/360x360/c3002f/fff&text=AJ',
      },
      {
        name: 'KIARIKA',
        tag: 'Improving FIFA/FC and other…',
        img: 'https://dummyimage.com/360x360/000/fff&text=KA',
      },
      {
        name: 'Ultimate Master League',
        tag: 'Best PES 2021 Master League…',
        img: 'https://dummyimage.com/360x360/0042a1/fff&text=UML',
      },
      {
        name: 'Dream Patch',
        tag: 'creando Parches, Mods y Add…',
        img: 'https://dummyimage.com/360x360/8da31c/fff&text=DP',
      },
    ],
  },
]

function PillRow({ active, onSelect }: { active: string; onSelect: (value: string) => void }) {
  return (
    <div className="pill-row">
      {filters.map((f) => (
        <button
          key={f}
          className={`chip ${active === f ? 'active' : ''}`}
          onClick={() => onSelect(f)}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

function AvatarChip({ name, avatar }: { name: string; avatar: string }) {
  return (
    <div className="avatar-chip">
      <img src={avatar} alt={name} />
      <span>{name}</span>
    </div>
  )
}

function SquareCard({ name, tag, img }: { name: string; tag: string; img: string }) {
  return (
    <div className="square-card">
      <img src={img} alt={name} />
      <div className="card-name">{name}</div>
      <div className="card-tag">{tag}</div>
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

function TopicsGrid() {
  return (
    <section className="topics">
      <div className="section-heading">
        <h3>Explore topics</h3>
      </div>
      <div className="topics-grid">
        {topics.map((t) => (
          <div
            key={t.label}
            className="topic-tile"
            style={{ background: `linear-gradient(135deg, ${t.color[0]}, ${t.color[1]})` }}
          >
            <span>{t.label}</span>
            <div className="topic-icon">{t.icon}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ExplorePage({
  filter,
  onSelectFilter,
}: {
  filter: string
  onSelectFilter: (value: string) => void
}) {
  return (
    <div className="explore">
      <div className="search-bar">
        <FiSearch size={18} />
        <input placeholder="Search creators or topics" />
      </div>

      <PillRow active={filter} onSelect={onSelectFilter} />

      <div className="recent-row">
        <h3>Recently visited</h3>
        <div className="recent-chips">
          {visited.map((v) => (
            <AvatarChip key={v.name} name={v.name} avatar={v.avatar} />
          ))}
        </div>
      </div>

      <ExploreSection title="Creators for you">
        <div className="card-row">
          {exploreCreators.map((c) => (
            <SquareCard key={c.name} {...c} />
          ))}
        </div>
      </ExploreSection>

      <ExploreSection title="Popular this week">
        <div className="list-grid">
          {popularThisWeek.map((c) => (
            <SquareCard key={c.name} {...c} />
          ))}
        </div>
      </ExploreSection>

      <TopicsGrid />

      <ExploreSection title="New on Patreon">
        <div className="card-row">
          {newOnPatreon.map((c) => (
            <SquareCard key={c.name} {...c} />
          ))}
        </div>
      </ExploreSection>

      {topCreatorsBlocks.map((block) => (
        <ExploreSection key={block.title} title={`Top creators  ${block.title}`}>
          <div className="card-row">
            {block.creators.map((c) => (
              <SquareCard key={c.name} {...c} />
            ))}
          </div>
        </ExploreSection>
      ))}
    </div>
  )
}

const chatRooms = [
  {
    name: 'Chat Room for Free Members',
    subtitle: 'Agree to guidelines to join',
    avatar: 'https://i.pravatar.cc/80?img=18',
    unread: true,
  },
  {
    name: 'Brandulate Lab',
    subtitle: 'New drops today',
    avatar: 'https://i.pravatar.cc/80?img=14',
    unread: false,
  },
]

function ChatsPage() {
  const [tab, onTabChange] = useState<'direct' | 'group'>('group')
  return (
    <div className="chats-page">
      <aside className="chat-list">
        <div className="chat-header">
          <h2>Chats</h2>
          <div className="chat-actions">
            <FiFilter />
            <FiMoreHorizontal />
          </div>
        </div>

        <div className="chat-tabs">
          <button
            className={`chat-tab ${tab === 'direct' ? 'active' : ''}`}
            onClick={() => onTabChange('direct')}
          >
            Direct messages
          </button>
          <button
            className={`chat-tab ${tab === 'group' ? 'active' : ''}`}
            onClick={() => onTabChange('group')}
          >
            Group chats
          </button>
        </div>

        <div className="chat-cards">
          {chatRooms.map((room) => (
            <div key={room.name} className="chat-card">
              <img src={room.avatar} alt={room.name} />
              <div className="chat-meta">
                <div className="chat-name">{room.name}</div>
                <div className="chat-sub">{room.subtitle}</div>
              </div>
              {room.unread && <span className="chat-dot" />}
            </div>
          ))}
        </div>
      </aside>

      <main className="chat-main">
        <div className="chat-topbar">
          <div className="chat-breadcrumb">
            <span className="muted">Chat Room for Free Members</span>
            <span className="muted">•</span>
            <span className="muted">View Chat Details</span>
          </div>
          <div className="chat-avatars">
            <img src="https://i.pravatar.cc/64?img=14" alt="avatar" />
            <img src="https://i.pravatar.cc/64?img=32" alt="avatar" />
          </div>
        </div>

        <div className="chat-guidelines">
          <h3>Chat guidelines</h3>
          <p>
            Welcome to community chats, a place where creators and members can chat and connect.
            Anyone who joins a chat can see the full history and whenever you join any chat, others
            with access will be able to see that you've joined.
          </p>
          <p>
            Patreon's <span className="link-like">Community Guidelines</span> apply to all community
            spaces. To keep chats safe and friendly, please:
          </p>
          <ul>
            <li>Be kind and welcoming</li>
            <li>Always be respectful</li>
            <li>Don't spam</li>
            <li>Don't share private or personal info</li>
          </ul>
          <button className="agree-btn">I agree</button>
        </div>
      </main>
    </div>
  )
}

function NotificationsPage() {
  return (
    <div className="notifications-page">
      <h2>Notifications</h2>
      <div className="notifications-empty">
        <div className="notif-icon">
          <FiBell size={24} />
        </div>
        <div className="notif-title">No notifications yet</div>
        <div className="notif-sub">
          You'll get updates when people join your community, interact with your posts, and more.
        </div>
      </div>
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

function SettingsTabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <div className="settings-tabs">
      {settingsTabs.map((t) => (
        <button
          key={t}
          className={`settings-tab ${active === t ? 'active' : ''}`}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
      <div className="settings-more-caret">
        <FiChevronDown />
      </div>
    </div>
  )
}

function BasicsCard() {
  return (
    <div className="settings-card">
      <div className="alert-error">Please enter a valid country of residence</div>
      <div className="profile-avatar">
        <img src="https://i.pravatar.cc/160?img=21" alt="avatar" />
        <div className="lock-pill mini">
          <FiLock size={12} />
        </div>
      </div>
      <label className="input-label">Display name</label>
      <input className="text-input" value="J Koina" readOnly />
      <label className="input-label">Email</label>
      <input className="text-input" value="emmanuelhanningtone59@gmail.com" readOnly />
      <label className="input-label">Country of Residence</label>
      <div className="select-input">
        <span>Please select a country...</span>
        <FiChevronDown />
      </div>
      <button className="primary-btn">Save</button>
    </div>
  )
}

function AccountCard() {
  return (
    <div className="settings-stack">
      <div className="settings-card">
        <div className="card-title">Login</div>
        <div className="notice brown">You haven't set a password for your account.</div>
        <div className="login-row">
          <div className="login-provider">
            <span role="img" aria-label="google">
              ??
            </span>
            <div>
              <div className="name">Log in with Google</div>
              <div className="muted">
                You must have a password before disconnecting your Google account.
              </div>
            </div>
          </div>
          <button className="link-like">Disconnect</button>
        </div>
        <div className="twofactor">
          <span>Two-factor authentication</span>
          <span className="muted">i</span>
        </div>
        <div className="button-row">
          <button className="pill dark">Use text message</button>
          <button className="pill dark">Use authenticator app</button>
        </div>
      </div>

      <div className="settings-card">
        <div className="card-title">Shipping address</div>
        <div className="field-grid two">
          <div>
            <label className="input-label">Country</label>
            <div className="select-input">
              <span>United States</span>
              <FiChevronDown />
            </div>
          </div>
        </div>
        <label className="input-label">Full Name</label>
        <input className="text-input" placeholder="Full Name" />
        <div className="field-grid two">
          <div>
            <label className="input-label">Address</label>
            <input className="text-input" />
          </div>
          <div>
            <label className="input-label">Apt, suite, etc...</label>
            <input className="text-input" />
          </div>
        </div>
        <div className="field-grid two">
          <div>
            <label className="input-label">City</label>
            <input className="text-input" />
          </div>
          <div>
            <label className="input-label">Postal Code</label>
            <input className="text-input" />
          </div>
        </div>
        <div className="field-grid two">
          <div>
            <label className="input-label">State</label>
            <div className="select-input">
              <span>California</span>
              <FiChevronDown />
            </div>
          </div>
          <div />
        </div>
        <div className="button-right">
          <button className="pill dark">Add address</button>
        </div>
      </div>

      <div className="settings-card">
        <div className="card-title">Social links</div>
        {['YouTube', 'Instagram', 'Twitter', 'Facebook', 'Twitch', 'TikTok'].map((s) => (
          <div key={s} className="social-row">
            <span>{s}</span>
            <button className="pill light">Connect</button>
          </div>
        ))}
      </div>

      <div className="settings-card">
        <div className="card-title">Language preference</div>
        <div className="select-input wide">
          <span>English (United States)</span>
          <FiChevronDown />
        </div>
      </div>

      <div className="settings-card">
        <div className="card-title">Currency preference</div>
        <div className="pill ghost">Currency: USD</div>
      </div>

      <div className="settings-card">
        <div className="card-title">Privacy</div>
        <div className="privacy-row">
          <div>
            <div className="name">Full public profile</div>
            <div className="muted">
              Your public profile always includes your name, photo, the date you joined Patreon, and
              any social links or other information you add.
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" />
            <span className="slider" />
          </label>
        </div>
        <div className="privacy-row">
          <div>
            <div className="name">Community profile</div>
            <div className="muted">
              Shows more information than your public profile and is visible to people in
              communities you're both part of.
            </div>
          </div>
          <label className="switch checked">
            <input type="checkbox" defaultChecked />
            <span className="slider" />
          </label>
        </div>
      </div>
    </div>
  )
}

function EmailNotificationsCard() {
  const toggles = [
    'Comment replies and reactions',
    'Posts and Quips from creators you may like',
    'Product updates and community announcements',
    'Member newsletter',
    'Special offers and promotions',
    'General creator updates',
  ]
  return (
    <div className="settings-stack">
      <div className="settings-card">
        <div className="card-title">General</div>
        <div className="toggle-group">
          {toggles.map((t) => (
            <div key={t} className="toggle-row">
              <span>{t}</span>
              <label className="switch checked">
                <input type="checkbox" defaultChecked />
                <span className="slider" />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-card horizontal">
        <div className="brand-block">
          <img src="https://i.pravatar.cc/96?img=14" alt="Brandulate AI" />
          <div>
            <div className="name">Brandulate AI</div>
            <div className="muted">Free</div>
          </div>
        </div>
        <FiChevronRight />
      </div>
    </div>
  )
}

function MembershipsCard() {
  return (
    <div className="settings-card horizontal">
      <div className="brand-block">
        <img src="https://i.pravatar.cc/96?img=14" alt="Brandulate AI" />
        <div>
          <div className="name">Brandulate AI</div>
          <div className="muted">Free</div>
        </div>
      </div>
      <FiMoreHorizontal />
    </div>
  )
}

function BillingHistoryCard() {
  return (
    <div className="settings-card">
      There is currently no payment history to display for this member.
    </div>
  )
}

function SettingsPage({
  tab,
  onTabChange,
  paymentRef,
  connectedRef,
  onPaymentClick,
  onConnectClick,
}: {
  tab: string
  onTabChange: (t: string) => void
  paymentRef: React.RefObject<HTMLDivElement | null>
  connectedRef: React.RefObject<HTMLDivElement | null>
  onPaymentClick: () => void
  onConnectClick: (app: string) => void
}) {
  const [localTab, setLocalTab] = useState(tab)

  useEffect(() => setLocalTab(tab), [tab])

  const changeTab = (t: string) => {
    setLocalTab(t)
    onTabChange(t)
  }
  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <SettingsTabs active={localTab} onChange={changeTab} />
      {localTab === 'Basics' && <BasicsCard />}
      {localTab === 'Account' && <AccountCard />}
      {localTab === 'Email notifications' && <EmailNotificationsCard />}
      {localTab === 'Memberships' && <MembershipsCard />}
      {localTab === 'Billing history' && <BillingHistoryCard />}
      {localTab === 'More' && (
        <div className="settings-stack">
          <div className="settings-card" ref={paymentRef}>
            <div className="card-title">Payment methods</div>
            <button className="pill ghost" onClick={onPaymentClick}>
              Add Payment Method
            </button>
            <div className="muted small">You do not currently have any payment methods.</div>
          </div>
          <div className="settings-card" ref={connectedRef}>
            <div className="card-title">Connected apps</div>
            {['Discord', 'Vimeo', 'Spotify'].map((app) => (
              <div key={app} className="connect-row">
                <div>
                  <div className="name">{app}</div>
                  <div className="muted">Connect to {app} for extra perks.</div>
                </div>
                <button className="pill light" onClick={() => onConnectClick(app)}>
                  Connect
                </button>
              </div>
            ))}
          </div>
          <div className="settings-card">
            <div className="card-title">Blocked users</div>
            <div className="muted">You haven't blocked any users.</div>
          </div>
        </div>
      )}
    </div>
  )
}

const coverImages = [
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80',
]

const membershipProfile = {
  name: 'Brandulate AI',
  tagline: 'AI-Powered Artistry',
  avatar: 'https://i.pravatar.cc/200?img=14',
}

const membershipPost = {
  title: '2601_ZIT_BSY_Q4 + Q5 (C60)',
  date: 'January 14',
  likes: 0,
  comments: 0,
  image:
    'https://images.unsplash.com/photo-1601758124206-0c3c5eff8cd5?auto=format&fit=crop&w=1400&q=80',
}

const membershipCardImg =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=600&q=80'

const tiers = [
  {
    name: 'Creative Access',
    price: '$5 / month',
    perks: [
      'Thriving community of AI artists',
      'Premium resources: LoRAs, workflows, tutorials',
      'Exclusive tips & tricks for AI automation',
      'Early previews of upcoming models',
    ],
  },
  {
    name: 'Checkpoint Access',
    price: '$8 / month',
    recommended: true,
    perks: [
      'Instant access to premium AI checkpoints',
      'Full Discord access to discuss and collaborate',
      'Exclusive tips & automation techniques',
      'Behind-the-scenes updates & early previews',
    ],
  },
]

function MembershipPage({
  tab,
  onTabChange,
  upgradeRef,
  tiersRef,
  giftRef,
  onUpgrade,
  onGift,
  onGoPayment,
}: {
  tab: 'Membership' | 'Gift Creator'
  onTabChange: (t: 'Membership' | 'Gift Creator') => void
  upgradeRef: React.RefObject<HTMLDivElement | null>
  tiersRef: React.RefObject<HTMLDivElement | null>
  giftRef: React.RefObject<HTMLDivElement | null>
  onUpgrade: () => void
  onGift: () => void
  onGoPayment: () => void
}) {
  return (
    <div className="membership-page">
      <div className="cover-grid">
        {coverImages.map((src, i) => (
          <img key={i} src={src} alt="" />
        ))}
      </div>

      <div className="profile-bar">
        <img
          className="profile-avatar-lg"
          src={membershipProfile.avatar}
          alt={membershipProfile.name}
        />
        <div className="profile-text">
          <div className="profile-name-lg">{membershipProfile.name}</div>
          <div className="muted">{membershipProfile.tagline}</div>
        </div>
        <div className="profile-actions">
          <button className="pill light">Upgrade</button>
          <button className="pill ghost">
            <FiShare />
          </button>
        </div>
      </div>

      <div className="profile-tabs">
        {['Home', 'Posts', 'Collections', 'Chats', 'Gift Creator', 'Membership', 'About'].map(
          (t) => (
            <button
              key={t}
              className={`profile-tab ${
                (tab === 'Membership' && t === 'Membership') ||
                (tab === 'Gift Creator' && t === 'Gift Creator')
                  ? 'active'
                  : ''
              }`}
              onClick={() => onTabChange(t === 'Gift Creator' ? 'Gift Creator' : 'Membership')}
            >
              {t}
            </button>
          )
        )}
      </div>

      {tab === 'Membership' && (
        <>
          <div className="upgrade-card" ref={upgradeRef}>
            <div className="offer-pill">Offer ends Jan 27</div>
            <div className="upgrade-body">
              <div>
                <div className="upgrade-title">
                  Upgrade your membership with 50% off your first month
                </div>
                <div className="muted small">Memberships start at $5/month. Terms apply.</div>
              </div>
              <button className="pill light" onClick={onUpgrade}>
                Upgrade
              </button>
            </div>
          </div>

          <div className="latest-post">
            <div className="section-heading">
              <h3>Latest post</h3>
            </div>
            <div className="latest-card">
              <img src={membershipPost.image} alt={membershipPost.title} />
              <div className="latest-info">
                <div className="name">{membershipPost.title}</div>
                <div className="muted">{membershipPost.date}</div>
                <div className="inline-actions">
                  <FiHeart /> <span>{membershipPost.likes}</span>
                  <FiMessageCircle /> <span>{membershipPost.comments}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="your-membership">
            <h3>Your membership</h3>
            <div className="membership-card">
              <div>
                <div className="name">Free</div>
                <div className="muted">Get updates on new public and free exclusive posts.</div>
              </div>
              <img src={membershipCardImg} alt="Membership card" />
              <div className="membership-actions">
                <div className="muted small">
                  Upgrade your membership to get access to your membership card.
                </div>
                <button className="pill light">Upgrade</button>
              </div>
            </div>
          </div>

          <div className="gift-section">
            <div className="section-heading">
              <h3>Gift membership</h3>
            </div>
            <div className="gift-card">
              <div>
                <div className="name">Share the gift of membership</div>
                <div className="muted">Give friends & family access to exclusive work.</div>
              </div>
              <img src={membershipPost.image} alt="Gift" />
              <button className="pill light" onClick={onGift}>
                Gift
              </button>
            </div>
          </div>

          <div className="upgrade-membership">
            <div className="section-heading">
              <h3>Upgrade your membership</h3>
            </div>
            <div className="tiers-grid" ref={tiersRef}>
              {tiers.map((tier) => (
                <div key={tier.name} className="tier-card">
                  {tier.recommended && <div className="badge">Recommended by creator</div>}
                  <div className="name">{tier.name}</div>
                  <div className="price">{tier.price}</div>
                  <button className="pill light full" onClick={onUpgrade}>
                    Upgrade
                  </button>
                  <ul>
                    {tier.perks.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'Gift Creator' && (
        <div className="gift-creator" ref={giftRef}>
          <div className="gift-left">
            <img src={membershipPost.image} alt="Gift preview" />
            <a className="link" href="#">
              Add custom message (optional)
            </a>
          </div>
          <div className="gift-right">
            <div className="gift-title">
              <FiGift />
              <div>
                <div className="name">Create a gift</div>
                <div className="muted">
                  Give anyone access to Brandulate AI&apos;s exclusive work and community by gifting
                  them a membership.
                </div>
              </div>
            </div>

            <div className="gift-section-box">
              <div className="muted small">Tier selection</div>
              <div className="select-input">
                <span>Checkpoint Access ?????????? ($8/month)</span>
                <FiChevronDown />
              </div>
            </div>

            <div className="gift-section-box">
              <div className="muted small">Membership duration</div>
              <div className="duration-option active">
                <span>1 year</span>
                <div className="pill ghost">save 25%</div>
                <div className="muted">$72</div>
              </div>
              <div className="duration-option">
                <span>1 month</span>
                <div className="muted">$8</div>
              </div>
              <div className="duration-option">
                <span>Custom months</span>
                <div className="custom-months">
                  <input className="text-input small-input" value="3" readOnly />
                </div>
              </div>
            </div>

            <div className="gift-section-box">
              <div className="muted small">Quantity</div>
              <input className="text-input" value="1" readOnly />
            </div>

            <div className="muted small">
              After payment, you&apos;ll get a shareable gift link. The membership must be activated
              before Apr 24, 2026 or it will expire. Learn more
            </div>

            <button className="primary-btn full" onClick={onGoPayment}>
              Go to payment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function HomePage({ onSeeAll }: { onSeeAll: () => void }) {
  return (
    <main className="feed">
      <header className="feed-header">
        <div className="feed-user">
          <img src={textPost.user.avatar} alt={textPost.user.name} />
          <div>
            <div className="name">{textPost.user.name}</div>
            <div className="muted">{textPost.date}</div>
          </div>
        </div>
        <button className="see-all" onClick={onSeeAll}>
          See all
        </button>
      </header>

      <section className="card text-card">
        <div className="card-header">
          <img src={textPost.user.avatar} alt={textPost.user.name} />
          <div>
            <div className="name">{textPost.user.name}</div>
            <div className="muted">{textPost.date}</div>
          </div>
        </div>
        <div className="card-body">
          <p className="title">{textPost.title}</p>
          <p className="muted">{textPost.body}</p>
          <button className="link">Show more</button>
        </div>
        <div className="card-actions">
          <div className="action">
            <FiHeart /> <span>{textPost.likes}</span>
          </div>
          <div className="action">
            <TbMessageDots /> <span>{textPost.comments}</span>
          </div>
          <div className="action">
            <FiGift /> <span>{textPost.tips}</span>
          </div>
          <div className="action share">
            <FiShare /> <span>Share</span>
          </div>
        </div>
      </section>

      <section className="card media-card">
        <div className="card-header">
          <img src={mediaPost.user.avatar} alt={mediaPost.user.name} />
          <div>
            <div className="name">{mediaPost.user.name}</div>
            <div className="muted">{textPost.date}</div>
          </div>
          <FiMoreHorizontal className="spacer" />
        </div>
        <div className="media-wrapper">
          <img src={mediaPost.image} alt={mediaPost.title} />
          <div className="lock-pill">
            <FiLock size={14} />
            <span>Locked</span>
          </div>
        </div>
        <div className="media-footer">
          <div>
            <h3>{mediaPost.title}</h3>
            <p className="muted">{mediaPost.date}</p>
          </div>
          <div className="inline-actions">
            <FiHeart />
            <FiMessageCircle />
            <FiGift />
          </div>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const [page, setPage] = useState<
    | 'home'
    | 'explore'
    | 'chats'
    | 'notifications'
    | 'settings'
    | 'membership'
    | 'news'
    | 'help'
    | 'features'
  >('explore')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [filter, setFilter] = useState(filters[0])
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [settingsTab, setSettingsTab] = useState('Basics')
  const [membershipTab, setMembershipTab] = useState<'Membership' | 'Gift Creator'>('Membership')
  const [toast, setToast] = useState<string | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark')
  const [featureText, setFeatureText] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  const paymentRef = useRef<HTMLDivElement | null>(null)
  const connectedRef = useRef<HTMLDivElement | null>(null)
  const upgradeRef = useRef<HTMLDivElement | null>(null)
  const tiersRef = useRef<HTMLDivElement | null>(null)
  const giftRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    ;(async () => {
      const s = await getCurrentSession()
      setSession(s)
      setSessionChecked(true)
    })()
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('ageConfirmed')
    if (stored === 'true') setAgeConfirmed(true)
  }, [])

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent')
    if (consent === 'accepted') setConsentAccepted(true)
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system')
      setTheme(storedTheme)
  }, [])

  useEffect(() => {
    if (ageConfirmed || !session) return
    ;(async () => {
      const remote = await fetchAgeConfirmation()
      if (remote) {
        setAgeConfirmed(true)
        localStorage.setItem('ageConfirmed', 'true')
      }
    })()
  }, [ageConfirmed, session])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const scrollToRef = (ref: React.RefObject<HTMLElement | null>) => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const handleUpgradeClick = () => {
    setPage('membership')
    setMembershipTab('Membership')
    setToast('Opening upgrade options')
    scrollToRef(upgradeRef)
  }

  const handleGiftClick = () => {
    setPage('membership')
    setMembershipTab('Gift Creator')
    setToast('Opening gift creator')
    scrollToRef(giftRef)
  }

  const handlePaymentMethods = () => {
    setPage('settings')
    setSettingsTab('More')
    setToast('Opening payment methods')
    scrollToRef(paymentRef)
  }

  const handleConnectedApp = (app: string) => {
    setPage('settings')
    setSettingsTab('More')
    setToast(`Opening ${app} connect`)
    scrollToRef(connectedRef)
  }

  const handleMembershipEntry = () => {
    setPage('membership')
    setMembershipTab('Membership')
    scrollToRef(upgradeRef)
    setToast('Opening memberships')
  }

  const handleVisitedClick = (name: string) => {
    setPage('membership')
    setToast(`Opening ${name}`)
    scrollToRef(upgradeRef)
  }

  const handleGetApp = () => setToast('Opening app download')

  const handleCreatorCTA = () => handleUpgradeClick()

  const handleLogout = async () => {
    await signOut()
    setSession(null)
    setAgeConfirmed(false)
  }

  if (!sessionChecked) {
    return (
      <div className="app">
        <div className="auth-block">
          <div className="auth-card">
            <p>Checking session…</p>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app">
        <AuthPrompt onLinkSent={() => setToast('Check your email for a sign-in link')} />
        <div className="oauth-buttons">
          <button
            className="pill full"
            onClick={async () => {
              try {
                await signInWithProvider('google')
              } catch (err) {
                console.error(err)
                setAuthError('Google sign-in failed')
              }
            }}
          >
            Continue with Google
          </button>
          <button
            className="pill full"
            onClick={async () => {
              try {
                await signInWithProvider('github')
              } catch (err) {
                console.error(err)
                setAuthError('GitHub sign-in failed')
              }
            }}
          >
            Continue with GitHub
          </button>
        </div>
        {authError && <div className="auth-error">{authError}</div>}
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  return (
    <div className="app">
      <AgeGate
        open={!ageConfirmed}
        onEnter={() => {
          setAgeConfirmed(true)
          localStorage.setItem('ageConfirmed', 'true')
          markAgeConfirmed()
          logAgeEvent('enter')
        }}
        onExit={() => {
          logAgeExit()
          window.location.href = 'https://www.google.com'
        }}
      />
      <aside className="sidebar">
        <div className="logo-mark" />
        <nav className="nav">
          {sidebarNav.map((item) => {
            const Icon = item.icon
            const active = page === item.key
            return (
              <button
                key={item.label}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => {
                  setShowProfileMenu(false)
                  setPage(item.key as typeof page)
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="section">
          <p className="section-title">Memberships</p>
          <button className="pill" onClick={handleMembershipEntry}>
            All memberships
          </button>
          <div className="divider" />
          {memberships.map((m) => (
            <div key={m.name} className="user-row" onClick={() => handleVisitedClick(m.name)}>
              <img src={m.avatar} alt={m.name} />
              <span>{m.name}</span>
            </div>
          ))}
        </div>

        <div className="section">
          <p className="section-title">Recently Visited</p>
          <div className="divider" />
          {visited.map((m) => (
            <div key={m.name} className="user-row" onClick={() => handleVisitedClick(m.name)}>
              <img src={m.avatar} alt={m.name} />
              <span>{m.name}</span>
            </div>
          ))}
        </div>

        <div className="get-app">
          <button className="pill full" onClick={handleGetApp}>
            Get app
          </button>
        </div>

        <div className="creator-cta" onClick={handleCreatorCTA}>
          <div className="cta-header">
            <span>Become a creator</span>
            <FiMoreHorizontal />
          </div>
          <p>Build a membership for your fans and get paid to create on your own terms.</p>
          <button onClick={() => setPage('membership')}>Get started</button>
        </div>

        <div className="profile">
          <div className="left">
            <img src={profile.avatar} alt={profile.name} />
            <div>
              <div className="name">{profile.name}</div>
              <div className="muted">{profile.role}</div>
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
            >
              Light
            </button>
            <button
              className={`chip tiny ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
            <button
              className={`chip tiny ${theme === 'system' ? 'active' : ''}`}
              onClick={() => setTheme('system')}
            >
              System
            </button>
          </div>
          <button className="menu-item" onClick={() => setPage('news')}>
            News
          </button>
          <button className="menu-item" onClick={() => window.open('https://www.patreon.com/', '_blank')}>
            Patreon for Creators
          </button>
          <button className="menu-item" onClick={() => setPage('help')}>
            Help Center & FAQ
          </button>
          <button className="menu-item" onClick={() => setPage('features')}>
            Feature Requests
          </button>
          <button className="menu-item" onClick={() => window.open('/pages/terms.html', '_blank')}>
            Terms of Use
          </button>
          <button
            className="menu-item"
            onClick={() => window.open('/pages/privacy.html', '_blank')}
          >
            Privacy Policy
          </button>
          <button
            className="menu-item"
            onClick={() => window.open('/pages/acceptable-use-policy.html', '_blank')}
          >
            Community Policies
          </button>
          <button className="menu-item danger" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
        </div>
      </aside>

      <div className="main-area">
        {page === 'home' && <HomePage onSeeAll={() => setPage('explore')} />}
        {page === 'explore' && <ExplorePage filter={filter} onSelectFilter={setFilter} />}
        {page === 'chats' && <ChatsPage />}
        {page === 'notifications' && <NotificationsPage />}
        {page === 'news' && (
          <div className="info-page">
            <h2>Product News</h2>
            <p>Read the latest release notes and compliance updates.</p>
            <button
              className="pill"
              onClick={() => window.open('https://yourdomain.com/docs/releasenotes', '_blank')}
            >
              Open release notes
            </button>
          </div>
        )}
        {page === 'help' && (
          <div className="info-page">
            <h2>Help Center</h2>
            <p>Find quick answers or contact support.</p>
            <button
              className="pill"
              onClick={() => window.open('https://yourdomain.com/support', '_blank')}
            >
              Open Help Center
            </button>
            <button
              className="pill ghost"
              onClick={() => window.open('mailto:support@yourdomain.com')}
            >
              Email support
            </button>
          </div>
        )}
        {page === 'features' && (
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
            connectedRef={connectedRef}
            onPaymentClick={handlePaymentMethods}
            onConnectClick={handleConnectedApp}
          />
        )}
        {page === 'membership' && (
          <MembershipPage
            tab={membershipTab}
            onTabChange={setMembershipTab}
            upgradeRef={upgradeRef}
            tiersRef={tiersRef}
            giftRef={giftRef}
            onUpgrade={handleUpgradeClick}
            onGift={handleGiftClick}
            onGoPayment={handlePaymentMethods}
          />
        )}
      </div>
      <footer className="footer">
        <div className="footer-links">
          <a href="/pages/terms.html">Terms</a>
          <a href="/pages/privacy.html">Privacy</a>
          <a href="/pages/cookies.html">Cookies</a>
          <a href="/pages/dmca.html">DMCA</a>
          <a href="/pages/acceptable-use-policy.html">Acceptable Use</a>
          <a href="/pages/usc2257.html">2257</a>
        </div>
        <div className="footer-note">Age verification required. Adults 18+ only.</div>
      </footer>
      {!consentAccepted && (
        <ConsentBanner
          onAccept={() => {
            localStorage.setItem('cookieConsent', 'accepted')
            setConsentAccepted(true)
          }}
        />
      )}
    </div>
  )
}
