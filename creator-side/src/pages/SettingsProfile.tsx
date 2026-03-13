import { useMemo, useState } from 'react';
import { env } from '../env';
import SettingsShell from './SettingsShell';

type ProfileForm = {
  username: string;
  displayName: string;
  bio: string;
  location: string;
};

const USE_SAMPLE_DATA = !import.meta.env.PROD && import.meta.env.VITE_ENABLE_SAMPLE_DATA === 'true';

const INITIAL_FORM: ProfileForm = USE_SAMPLE_DATA
  ? {
      username: '@aiko.mitsuri',
      displayName: 'Aiko Mitsuri',
      bio:
        'Osu!, Welcome to my Fanvue\n' +
        '* I am Aiko, *\n' +
        'I move with quiet confidence, soft curves, and a gaze that lingers longer than expected. ' +
        'My world is built on beauty, lifestyle, fashion, fitness, and sensual aesthetics, captured ' +
        'in high-quality visuals meant to feel close, warm, and irresistibly personal. I create ' +
        'moments that invite you in from cozy, intimate indoor scenes to polished, magazine-worthy looks. ' +
        'Expect exclusive refined glamour, confident',
      location: '',
    }
  : {
      username: '',
      displayName: '',
      bio: '',
      location: '',
    };

export default function SettingsProfile() {
  const [form, setForm] = useState<ProfileForm>(INITIAL_FORM);
  const [saved, setSaved] = useState<ProfileForm>(INITIAL_FORM);

  const displayCount = form.displayName.length;
  const bioCount = form.bio.length;

  const hasChanges = useMemo(() => {
    return (
      form.username !== saved.username ||
      form.displayName !== saved.displayName ||
      form.bio !== saved.bio ||
      form.location !== saved.location
    );
  }, [form, saved]);

  const profileUrl = useMemo(() => {
    const trimmed = form.username.trim();
    if (!trimmed || !env.consumerAppUrl) {
      return '';
    }
    const handle = trimmed.replace(/^@/, '');
    if (!handle) {
      return '';
    }
    return `${env.consumerAppUrl.replace(/\/$/, '')}/creator/${handle}`;
  }, [form.username]);

  return (
    <SettingsShell activeItem="profile" userHandle={form.username}>
      <div className="settings-content__header">
        <h2>Edit Profile</h2>
        <button
          className="save-button"
          type="button"
          disabled={!hasChanges}
          onClick={() => setSaved(form)}
        >
          Save
        </button>
      </div>

      <div className="settings-card">
        <div className="cover">
          <button className="cover-action" type="button" aria-label="Change cover">
            <CameraIcon />
          </button>
          <button className="cover-action remove" type="button" aria-label="Remove cover">
            <CloseIcon />
          </button>
        </div>
        <div className="avatar-row">
          <div className="avatar">
            <button className="avatar-action" type="button" aria-label="Change avatar">
              <CameraIcon />
            </button>
            <button className="avatar-action remove" type="button" aria-label="Remove avatar">
              <CloseIcon />
            </button>
          </div>
        </div>

        <form className="settings-form">
          <label className="field">
            <span>Username</span>
            <div className="field-control">
              <input
                type="text"
                value={form.username}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, username: event.target.value }))
                }
              />
              <span className="field-check">
                <CheckIcon />
              </span>
            </div>
            {profileUrl ? <small>{profileUrl}</small> : null}
          </label>

          <label className="field">
            <div className="field-row">
              <span>Display name</span>
              <span className="count">{displayCount}/40</span>
            </div>
            <input
              type="text"
              value={form.displayName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, displayName: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <div className="field-row">
              <span>Bio</span>
              <span className="count">{bioCount}/1000</span>
            </div>
            <div className="textarea-wrapper">
              <textarea
                rows={6}
                value={form.bio}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, bio: event.target.value }))
                }
              />
              <div className="textarea-icon">Aa</div>
            </div>
          </label>

          <label className="field">
            <span>Location</span>
            <input
              type="text"
              value={form.location}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, location: event.target.value }))
              }
            />
          </label>
        </form>
      </div>
    </SettingsShell>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h16v10H4z" />
      <path d="M8 8l2-2h4l2 2" />
      <circle cx="12" cy="13" r="3" />
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

