// Offline outbox for transaction mutations.
//
// When a POST/PUT/DELETE to /api/transactions* fails at the network level
// (offline, server unreachable), the request is persisted to a localStorage
// outbox instead of being lost. The queue replays in order on the 'online'
// event and on app startup. No service-worker involvement — plain
// localStorage, capped at 100 entries.

import { apiFetch } from './api';

const OUTBOX_KEY = 'bm-offline-outbox';
const MAX_QUEUE = 100;
const OUTBOX_EVENT = 'bm-outbox-changed';

const readQueue = () => {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue) => {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable — the in-memory caller already failed;
    // don't throw a second error on top of the network one.
  }
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT));
};

export const getPendingCount = () => readQueue().length;

export const onOutboxChange = (listener) => {
  window.addEventListener(OUTBOX_EVENT, listener);
  return () => window.removeEventListener(OUTBOX_EVENT, listener);
};

const isTxMutation = (url, options) => {
  const method = (options.method || 'GET').toUpperCase();
  return method !== 'GET' && typeof url === 'string' && url.startsWith('/api/transactions');
};

// Drop-in replacement for apiFetch for transaction mutations. Resolves to
// { queued: true } when the request was stored offline, or
// { queued: false, res } with the live response otherwise.
export const queuedApiFetch = async (url, options = {}) => {
  if (!isTxMutation(url, options)) {
    return { queued: false, res: await apiFetch(url, options) };
  }
  const stash = () => {
    const queue = readQueue();
    if (queue.length >= MAX_QUEUE) {
      throw new Error('Offline queue is full (100). Reconnect to sync.');
    }
    queue.push({
      method: (options.method || 'POST').toUpperCase(),
      url,
      body: options.body || null,
      queuedAt: Date.now()
    });
    writeQueue(queue);
    return { queued: true };
  };
  // Fast path: definitely offline, don't waste time on a doomed request.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return stash();
  }
  try {
    const res = await apiFetch(url, options);
    return { queued: false, res };
  } catch {
    // Network-level failure only (fetch throws); HTTP error statuses still
    // return a response and are handled by the caller as usual.
    return stash();
  }
};

// Replay the outbox in FIFO order. Stops at the first entry that fails so
// ordering is preserved (a later edit may depend on an earlier create).
// Returns the number of entries successfully synced.
export const replayOutbox = async () => {
  const queue = readQueue();
  let synced = 0;
  for (const entry of queue) {
    try {
      const res = await apiFetch(entry.url, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        body: entry.body
      });
      if (!res.ok) break;
      synced += 1;
    } catch {
      break; // still offline — keep the rest for next time
    }
  }
  if (synced > 0) {
    writeQueue(queue.slice(synced));
  }
  return synced;
};
