import React, { useState, useEffect } from 'react';
import { apiFetch, getCookie } from '../api.js';
import {
  getPushStatus,
  enablePushNotifications,
  disablePushNotifications
} from '../pushNotifications.js';

// Profile & settings tab: edit display name, change password, tune the
// budget-alert thresholds, toggle push notifications, and sign out other
// devices. All mutations go through apiFetch (credentials + CSRF header).
export default function Profile({
  user,
  settings,
  onNameSaved,
  onSettingsSaved,
  pushToast,
  askConfirm,
  formatDate
}) {
  // --- Name (inline edit) ---
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);

  const startNameEdit = () => {
    setNameDraft(user?.name || '');
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      pushToast('error', 'Name cannot be empty.');
      return;
    }
    if (trimmed.length > 100) {
      pushToast('error', 'Name cannot exceed 100 characters.');
      return;
    }
    if (trimmed === user?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCookie('csrfToken')
        },
        body: JSON.stringify({ name: trimmed })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditingName(false);
        onNameSaved(data.name || trimmed);
        pushToast('success', 'Profile updated.');
      } else {
        pushToast('error', data.error || 'Could not update profile.');
      }
    } catch (err) {
      console.error('Profile update failed:', err);
      pushToast('error', 'Could not update profile. Check your connection.');
    } finally {
      setSavingName(false);
    }
  };

  // --- Change password ---
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (savingPw) return;
    if (pwNew.length < 12) {
      pushToast('error', 'New password must be at least 12 characters long.');
      return;
    }
    if (pwNew !== pwConfirm) {
      pushToast('error', 'New passwords do not match.');
      return;
    }
    setSavingPw(true);
    try {
      const res = await apiFetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCookie('csrfToken')
        },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPwCurrent('');
        setPwNew('');
        setPwConfirm('');
        pushToast('success', 'Password changed. Other devices were signed out.');
      } else {
        pushToast('error', data.error || 'Could not change password.');
      }
    } catch (err) {
      console.error('Password change failed:', err);
      pushToast('error', 'Could not change password. Check your connection.');
    } finally {
      setSavingPw(false);
    }
  };

  // --- Alert thresholds ---
  const [warningPct, setWarningPct] = useState(settings?.budgetWarningPct ?? 80);
  const [dangerPct, setDangerPct] = useState(settings?.budgetDangerPct ?? 100);
  const [savingSettings, setSavingSettings] = useState(false);

  // Sync local inputs once the settings arrive from the server.
  useEffect(() => {
    if (settings) {
      setWarningPct(settings.budgetWarningPct ?? 80);
      setDangerPct(settings.budgetDangerPct ?? 100);
    }
  }, [settings]);

  const saveSettings = async () => {
    const w = Number(warningPct);
    const d = Number(dangerPct);
    if (!Number.isFinite(w) || !Number.isFinite(d) || w < 1 || w > 100 || d < 1 || d > 100) {
      pushToast('error', 'Thresholds must be numbers between 1 and 100.');
      return;
    }
    if (!(w < d)) {
      pushToast('error', 'Warning threshold must be less than the danger threshold.');
      return;
    }
    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/user/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCookie('csrfToken')
        },
        body: JSON.stringify({ budgetWarningPct: w, budgetDangerPct: d })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onSettingsSaved({ budgetWarningPct: w, budgetDangerPct: d });
        pushToast('success', 'Alert thresholds saved.');
      } else {
        pushToast('error', data.error || 'Could not save settings.');
      }
    } catch (err) {
      console.error('Settings save failed:', err);
      pushToast('error', 'Could not save settings. Check your connection.');
    } finally {
      setSavingSettings(false);
    }
  };

  // --- Push notifications ---
  const [pushStatus, setPushStatus] = useState('unknown');
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPushStatus = async () => {
    setPushStatus(await getPushStatus());
  };

  useEffect(() => {
    refreshPushStatus();
  }, []);

  const handlePushToggle = async () => {
    if (pushBusy || pushStatus === 'unsupported') return;
    setPushBusy(true);
    try {
      const result = pushStatus === 'enabled'
        ? await disablePushNotifications()
        : await enablePushNotifications();
      pushToast(result.ok ? 'success' : 'error', result.message);
      await refreshPushStatus();
    } finally {
      setPushBusy(false);
    }
  };

  // --- Sign out other devices ---
  const logoutAll = () => {
    askConfirm({
      title: 'Sign out other devices?',
      message: 'This will end your sessions on every other device and browser. This device stays signed in.',
      confirmLabel: 'Sign out others',
      onConfirm: async () => {
        try {
          const res = await apiFetch('/api/user/logout-all', {
            method: 'POST',
            headers: { 'x-csrf-token': getCookie('csrfToken') }
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            const n = data.sessionsClosed ?? 0;
            pushToast('success', n > 0
              ? `Signed out ${n} other session${n === 1 ? '' : 's'}.`
              : 'No other sessions to sign out.');
          } else {
            pushToast('error', data.error || 'Could not sign out other devices.');
          }
        } catch (err) {
          console.error('Logout-all failed:', err);
          pushToast('error', 'Could not sign out other devices. Check your connection.');
        }
      }
    });
  };

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="tab-view active">
      <div className="profile-grid">
        {/* Profile card */}
        <section className="card glass-card" aria-label="Profile">
          <h2 className="tab-section-title">Profile</h2>
          <div className="profile-top">
            <div className="profile-avatar" aria-hidden="true">{initial}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {editingName ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={nameDraft}
                    maxLength={100}
                    onChange={(e) => setNameDraft(e.target.value)}
                    aria-label="Display name"
                    style={{ flex: 1, minWidth: 0 }}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-sm" onClick={saveName} disabled={savingName}>
                    {savingName ? 'Saving…' : 'Save'}
                  </button>
                  <button className="btn btn-text" onClick={() => setEditingName(false)} disabled={savingName}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <p className="profile-name">{user?.name}</p>
                  <button className="btn btn-text" onClick={startNameEdit} style={{ fontSize: '0.85rem' }}>
                    Edit
                  </button>
                </div>
              )}
              <p className="profile-email">{user?.email}</p>
              {user?.createdAt && (
                <p className="profile-meta">Member since {formatDate(user.createdAt)}</p>
              )}
            </div>
          </div>
        </section>

        {/* Change password */}
        <section className="card glass-card" aria-label="Change password">
          <h2 className="tab-section-title">Change password</h2>
          <form onSubmit={changePassword}>
            <div className="form-group">
              <label>Current password</label>
              <input
                type="password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>New password</label>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                />
              </div>
              <div className="form-group">
                <label>Confirm new password</label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingPw}>
              {savingPw ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </section>

        {/* Settings */}
        <h2 className="tab-section-title" style={{ marginBottom: 0 }}>Settings</h2>

        <section className="card glass-card" aria-label="Budget alert thresholds">
          <h3 className="settings-card-title">Budget alert thresholds</h3>
          <p className="settings-hint">
            Get notified when a category&apos;s spending crosses these percentages of its budget limit.
          </p>
          <div className="form-row">
            <div className="form-group">
              <label>Warning at (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={warningPct}
                onChange={(e) => setWarningPct(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Danger at (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={dangerPct}
                onChange={(e) => setDangerPct(e.target.value)}
              />
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? 'Saving…' : 'Save thresholds'}
          </button>
        </section>

        <section className="card glass-card" aria-label="Push notifications">
          <h3 className="settings-card-title">Push notifications</h3>
          <div className="settings-row">
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>Budget alerts on this device</p>
              <p className="settings-hint" style={{ margin: '0.25rem 0 0' }}>
                {pushStatus === 'unsupported'
                  ? 'This browser does not support push notifications.'
                  : pushStatus === 'enabled'
                    ? 'This device is subscribed to budget alerts.'
                    : 'Get notified when a budget threshold is crossed.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
              <span className={`status-pill status-${pushStatus}`}>
                {pushStatus === 'unknown' ? 'Checking…'
                  : pushStatus === 'enabled' ? 'Enabled'
                  : pushStatus === 'disabled' ? 'Disabled'
                  : 'Not supported'}
              </span>
              <button
                className="btn btn-secondary"
                onClick={handlePushToggle}
                disabled={pushBusy || pushStatus === 'unsupported' || pushStatus === 'unknown'}
              >
                {pushBusy ? 'Working…' : pushStatus === 'enabled' ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </section>

        {/* Sessions */}
        <section className="card glass-card" aria-label="Sessions">
          <h3 className="settings-card-title">Sessions</h3>
          <div className="settings-row">
            <p className="settings-hint" style={{ margin: 0 }}>
              Signed in somewhere you don&apos;t recognize? End every other session at once.
            </p>
            <button className="btn btn-secondary" onClick={logoutAll} style={{ flexShrink: 0 }}>
              Sign out other devices
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
