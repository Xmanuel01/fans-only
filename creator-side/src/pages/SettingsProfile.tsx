import { useEffect, useMemo, useRef, useState } from 'react';
import { env } from '../env';
import {
  fetchCreatorProfileSettings,
  updateCreatorProfileSettings,
  type CreatorProfileSettings,
} from '../supabaseClient';
import SettingsShell from './SettingsShell';

type ProfileForm = {
  username: string;
  displayName: string;
  bio: string;
};

const EMPTY_PROFILE: CreatorProfileSettings = {
  username: '',
  displayName: '',
  bio: '',
  avatarUrl: null,
  bannerUrl: null,
  bannerMediaType: null,
};

function toForm(profile: CreatorProfileSettings): ProfileForm {
  return {
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
  };
}

function readFilePreview(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not load preview.'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not load preview.'));
    };
    reader.readAsDataURL(file);
  });
}

export default function SettingsProfile() {
  const [form, setForm] = useState<ProfileForm>(toForm(EMPTY_PROFILE));
  const [saved, setSaved] = useState<ProfileForm>(toForm(EMPTY_PROFILE));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerMediaType, setBannerMediaType] = useState<'image' | 'video' | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const profile = await fetchCreatorProfileSettings();
        if (cancelled) {
          return;
        }

        const resolved = profile ?? EMPTY_PROFILE;
        setForm(toForm(resolved));
        setSaved(toForm(resolved));
        setAvatarUrl(resolved.avatarUrl);
        setBannerUrl(resolved.bannerUrl);
        setBannerMediaType(resolved.bannerMediaType);
      } catch (nextError) {
        console.error(nextError);
        if (!cancelled) {
          setError(
            nextError instanceof Error && nextError.message
              ? nextError.message
              : 'Could not load your profile settings.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const displayCount = form.displayName.length;
  const bioCount = form.bio.length;
  const currentAvatarSrc = removeAvatar ? null : avatarPreviewUrl ?? avatarUrl;
  const currentBannerSrc = removeBanner ? null : bannerPreviewUrl ?? bannerUrl;
  const currentBannerType =
    bannerPreviewUrl && bannerFile
      ? bannerFile.type.startsWith('video/')
        ? 'video'
        : 'image'
      : removeBanner
        ? null
        : bannerMediaType;
  const hasChanges = useMemo(() => {
    return (
      form.username !== saved.username ||
      form.displayName !== saved.displayName ||
      form.bio !== saved.bio ||
      Boolean(avatarFile) ||
      Boolean(bannerFile) ||
      removeAvatar ||
      removeBanner
    );
  }, [avatarFile, bannerFile, form, removeAvatar, removeBanner, saved]);

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

  const handleAvatarChange = async (file: File | null) => {
    if (!file) return;
    setError('');
    try {
      const preview = await readFilePreview(file);
      setAvatarFile(file);
      setAvatarPreviewUrl(preview);
      setRemoveAvatar(false);
    } catch (nextError) {
      console.error(nextError);
      setError(nextError instanceof Error ? nextError.message : 'Could not load avatar preview.');
    }
  };

  const handleBannerChange = async (file: File | null) => {
    if (!file) return;
    setError('');
    try {
      const preview = await readFilePreview(file);
      setBannerFile(file);
      setBannerPreviewUrl(preview);
      setBannerMediaType(file.type.startsWith('video/') ? 'video' : 'image');
      setRemoveBanner(false);
    } catch (nextError) {
      console.error(nextError);
      setError(nextError instanceof Error ? nextError.message : 'Could not load banner preview.');
    }
  };

  const handleSave = async () => {
    if (!hasChanges || saving) {
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const updated = await updateCreatorProfileSettings({
        username: form.username,
        displayName: form.displayName,
        bio: form.bio,
        avatarFile,
        removeAvatar,
        bannerFile,
        removeBanner,
      });

      const nextForm = toForm(updated);
      setForm(nextForm);
      setSaved(nextForm);
      setAvatarUrl(updated.avatarUrl);
      setBannerUrl(updated.bannerUrl);
      setBannerMediaType(updated.bannerMediaType);
      setAvatarFile(null);
      setBannerFile(null);
      setAvatarPreviewUrl(null);
      setBannerPreviewUrl(null);
      setRemoveAvatar(false);
      setRemoveBanner(false);
      setNotice('Profile updated.');
    } catch (nextError) {
      console.error(nextError);
      setError(
        nextError instanceof Error && nextError.message
          ? nextError.message
          : 'Could not save your profile settings.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsShell activeItem="profile" userHandle={form.username}>
      <div className="settings-content__header">
        <h2>Edit Profile</h2>
        <button className="save-button" type="button" disabled={!hasChanges || saving || loading} onClick={handleSave}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {error ? <div className="settings-feedback settings-feedback--error">{error}</div> : null}
      {notice ? <div className="settings-feedback settings-feedback--success">{notice}</div> : null}

      <div className="settings-card">
        <input
          ref={bannerInputRef}
          className="settings-hidden-input"
          type="file"
          accept="image/*,video/*"
          onChange={(event) => void handleBannerChange(event.target.files?.[0] ?? null)}
        />
        <input
          ref={avatarInputRef}
          className="settings-hidden-input"
          type="file"
          accept="image/*"
          onChange={(event) => void handleAvatarChange(event.target.files?.[0] ?? null)}
        />

        <div
          className={`cover${currentBannerSrc ? ' has-media' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Change banner"
          onClick={() => bannerInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              bannerInputRef.current?.click();
            }
          }}
        >
          {currentBannerSrc ? (
            currentBannerType === 'video' ? (
              <video className="cover-media" src={currentBannerSrc} muted playsInline autoPlay loop />
            ) : (
              <img className="cover-media" src={currentBannerSrc} alt="Banner preview" />
            )
          ) : (
            <div className="cover-placeholder">
              <span>Upload banner</span>
              <small>Images or short videos</small>
            </div>
          )}
          <div className="cover-actions">
            <button
              className="cover-action"
              type="button"
              aria-label="Change cover"
              onClick={(event) => {
                event.stopPropagation();
                bannerInputRef.current?.click();
              }}
            >
              <CameraIcon />
            </button>
          </div>
        </div>

        <div className="avatar-row">
          <div
            className={`avatar${currentAvatarSrc ? ' has-media' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Change avatar"
            onClick={() => avatarInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                avatarInputRef.current?.click();
              }
            }}
          >
            {currentAvatarSrc ? (
              <img className="avatar-media" src={currentAvatarSrc} alt="Profile avatar" />
            ) : (
              <span className="avatar-placeholder" aria-hidden="true">
                {(form.displayName.trim().charAt(0) || 'C').toUpperCase()}
              </span>
            )}
            <button
              className="avatar-action"
              type="button"
              aria-label="Change avatar"
              onClick={(event) => {
                event.stopPropagation();
                avatarInputRef.current?.click();
              }}
            >
              <CameraIcon />
            </button>
          </div>
        </div>

        <form className="settings-form" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            <span>Username</span>
            <div className="field-control">
              <input
                type="text"
                value={form.username}
                placeholder="@creator-name"
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
              maxLength={40}
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
                maxLength={1000}
                value={form.bio}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, bio: event.target.value }))
                }
              />
              <div className="textarea-icon">Aa</div>
            </div>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
