// ─── Backend API Client ───────────────────────────────────────────────────────
// All communication with the backend goes through here.
// Automatically refreshes expired access tokens.

const BACKEND_URL = 'https://YOUR_BACKEND_DOMAIN.com'; // Replace before publishing

async function getTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['access_token', 'refresh_token', 'user'], (data) => {
      resolve(data);
    });
  });
}

async function saveTokens(tokens) {
  return new Promise((resolve) => {
    chrome.storage.local.set(tokens, resolve);
  });
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refresh_token: refreshToken })
  });

  if (!res.ok) throw new Error('Token refresh failed — user must re-login');

  const data = await res.json();
  await saveTokens({ access_token: data.access_token });
  return data.access_token;
}

/**
 * Authenticated fetch — automatically handles token refresh.
 */
async function apiFetch(path, options = {}) {
  let { access_token, refresh_token } = await getTokens();

  if (!access_token) throw new Error('NOT_LOGGED_IN');

  const makeRequest = (token) => fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  let res = await makeRequest(access_token);

  // If token expired, refresh and retry once
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (data.code === 'TOKEN_EXPIRED' && refresh_token) {
      try {
        const newToken = await refreshAccessToken(refresh_token);
        res = await makeRequest(newToken);
      } catch {
        // Refresh failed — clear session, user must re-login
        await saveTokens({ access_token: null, refresh_token: null, user: null });
        throw new Error('SESSION_EXPIRED');
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ─── Public API methods ───────────────────────────────────────────────────────

const api = {
  // Schedules
  getSchedules:    ()       => apiFetch('/api/schedules'),
  createSchedule:  (data)   => apiFetch('/api/schedules', { method: 'POST', body: JSON.stringify(data) }),
  deleteSchedule:  (id)     => apiFetch(`/api/schedules/${id}`, { method: 'DELETE' }),
  getResponse:     (id)     => apiFetch(`/api/schedules/${id}/response`),

  // API Keys
  getApiKeys:      ()       => apiFetch('/api/keys'),
  saveApiKey:      (data)   => apiFetch('/api/keys', { method: 'POST', body: JSON.stringify(data) }),
  deleteApiKey:    (prov)   => apiFetch(`/api/keys/${prov}`, { method: 'DELETE' }),
  verifyApiKey:    (p, key) => apiFetch(`/api/keys/verify/${p}`, { method: 'POST', body: JSON.stringify({ api_key: key }) }),

  // Payments
  getPaymentStatus: ()      => apiFetch('/api/payments/status'),
  createCheckout:   ()      => apiFetch('/api/payments/create-checkout', { method: 'POST' }),
  cancelSubscription: ()    => apiFetch('/api/payments/cancel', { method: 'POST' }),

  // Auth
  logout: async () => {
    const { refresh_token } = await getTokens();
    await fetch(`${BACKEND_URL}/auth/logout`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token })
    }).catch(() => {});
    await saveTokens({ access_token: null, refresh_token: null, user: null });
  },

  BACKEND_URL
};

// Export for use in popup.js and background.js
if (typeof module !== 'undefined') module.exports = api;
