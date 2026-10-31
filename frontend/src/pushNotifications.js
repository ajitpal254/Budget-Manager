import { apiFetch, getCookie } from './api.js';

// localStorage flag so we only ever ask once (until the user clears it).
const PROMPT_DISMISSED_KEY = 'aura-push-prompt-dismissed';

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode etc. — the prompt just shows again next visit.
  }
}

// True when it makes sense to show the "enable notifications" prompt:
// the browser supports Web Push and the user hasn't decided yet.
export function shouldShowPushPrompt() {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (Notification.permission !== 'default') return false;
  return storageGet(PROMPT_DISMISSED_KEY) !== '1';
}

export function dismissPushPrompt() {
  storageSet(PROMPT_DISMISSED_KEY, '1');
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

// Requests permission, subscribes via the service worker's push manager,
// and saves the subscription on the backend. Resolves { ok, message }
// instead of throwing for the expected user-driven outcomes.
export async function enablePushNotifications() {
  const keyRes = await apiFetch('/api/push/vapid-public-key');
  if (!keyRes.ok) {
    return { ok: false, message: 'Push notifications are not set up on the server yet.' };
  }
  const { publicKey } = await keyRes.json();

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    dismissPushPrompt();
    return { ok: false, message: 'Notifications were not allowed. You can enable them later in your browser settings.' };
  }

  const registration = await navigator.serviceWorker.ready;

  // Don't create a second subscription if one already exists.
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }));

  const res = await apiFetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': getCookie('csrfToken')
    },
    body: JSON.stringify(subscription.toJSON())
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not save the push subscription.');
  }

  dismissPushPrompt();
  return { ok: true, message: 'Budget alerts enabled on this device.' };
}

// Current push state on this device: 'enabled' | 'disabled' | 'unsupported'.
// Never throws — failures resolve to 'disabled' so the settings UI can
// render without special-casing.
export async function getPushStatus() {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window)) return 'unsupported';
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? 'enabled' : 'disabled';
  } catch {
    return 'disabled';
  }
}

// Removes the backend subscription for this device's endpoint and
// unsubscribes locally. Resolves { ok, message } like the enable flow.
export async function disablePushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await apiFetch('/api/push/unsubscribe', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCookie('csrfToken')
        },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }).catch(() => {
        // Backend cleanup is best-effort; the local unsubscribe below is
        // what actually stops notifications on this device.
      });
      await subscription.unsubscribe().catch(() => {});
    }
    return { ok: true, message: 'Push notifications disabled on this device.' };
  } catch (err) {
    console.error('Push opt-out failed:', err);
    return { ok: false, message: 'Could not disable notifications. Please try again.' };
  }
}
