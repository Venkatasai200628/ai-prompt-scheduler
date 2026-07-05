// ─── AI Prompt Scheduler — Popup v3 ──────────────────────────────────────────
const ALARM_PREFIX = 'aps-';
let currentMode    = 'local';
let cloudServerUrl = '';
let cloudApiKey    = '';
let isCloudConnected = false;

const MODE_DESC = {
  local: 'Fires from Chrome. Laptop must be on. No account needed.',
  cloud: 'Your own server sends the prompt 24/7 — even when laptop is off.',
  phone: 'Android app sends prompt automatically when phone is on.'
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setMinDateTime('local-time');
  setMinDateTime('cloud-time');
  await loadCloudSettings();
  setupListeners();
  await renderSchedules();
});

async function loadCloudSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['cloudServerUrl', 'cloudApiKey'], d => {
      cloudServerUrl   = d.cloudServerUrl || '';
      cloudApiKey      = d.cloudApiKey    || '';
      if (cloudServerUrl) document.getElementById('cloud-serverUrl').value = cloudServerUrl;
      if (cloudApiKey)    document.getElementById('cloud-apiKey').value    = cloudApiKey;
      if (cloudServerUrl && cloudApiKey) {
        isCloudConnected = true;
        showCloudSections(true);
        loadSavedCreds();
        renderSchedules();
      }
      resolve();
    });
  });
}

// ─── Listeners ────────────────────────────────────────────────────────────────
function setupListeners() {
  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.addEventListener('click', () => {
      currentMode = t.dataset.mode;
      document.querySelectorAll('.mode-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('modeDesc').textContent = MODE_DESC[currentMode];
      document.querySelectorAll('[id^="panel-"]').forEach(p => p.classList.add('hidden'));
      document.getElementById('panel-' + currentMode).classList.remove('hidden');
      renderSchedules();
    });
  });

  // Local mode
  document.getElementById('useCurrentTab').addEventListener('click', () => getCurrentTabUrl('local-chatUrl', 'local-platform'));
  document.getElementById('local-chatUrl').addEventListener('input', e => autoDetect(e.target.value, 'local-platform'));
  document.getElementById('local-prompt').addEventListener('input', e => { document.getElementById('local-charCount').textContent = e.target.value.length; });
  document.getElementById('local-addBtn').addEventListener('click', addLocalSchedule);

  // Cloud — server connect
  document.getElementById('cloud-testBtn').addEventListener('click', testCloudConnection);
  document.getElementById('cloud-connectBtn').addEventListener('click', connectCloud);
  document.getElementById('cloud-toggleKey').addEventListener('click', () => toggleVisibility('cloud-apiKey'));
  document.getElementById('cloud-useTab').addEventListener('click', () => getCurrentTabUrl('cloud-chatUrl', 'cloud-platform'));
  document.getElementById('cloud-addBtn').addEventListener('click', addCloudSchedule);

  // Cloud — credentials
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const type = t.dataset.type;
      document.getElementById('cookie-form').classList.toggle('hidden',   type !== 'cookie');
      document.getElementById('password-form').classList.toggle('hidden', type !== 'password');
    });
  });
  document.getElementById('cloud-saveCredBtn').addEventListener('click', saveCredentials);
}

// ─── LOCAL MODE ───────────────────────────────────────────────────────────────
async function addLocalSchedule() {
  const platform = document.getElementById('local-platform').value;
  const chatUrl  = document.getElementById('local-chatUrl').value.trim();
  const prompt   = document.getElementById('local-prompt').value.trim();
  const timeStr  = document.getElementById('local-time').value;
  const errEl    = document.getElementById('local-error');
  errEl.classList.add('hidden');

  if (!chatUrl)   return showErr(errEl, 'Paste the chat URL first.');
  if (!prompt)    return showErr(errEl, 'Enter a prompt.');
  if (!timeStr)   return showErr(errEl, 'Set a time.');
  const ts = new Date(timeStr).getTime();
  if (ts <= Date.now()) return showErr(errEl, 'Time must be in the future.');

  const id = genId();
  const schedules = await getLocalSchedules();
  schedules.push({ id, platform, chatUrl, prompt, scheduledTime: ts, status: 'pending', mode: 'local', createdAt: Date.now() });
  await chrome.storage.local.set({ local_schedules: schedules });
  await chrome.alarms.create(ALARM_PREFIX + id, { when: ts });

  document.getElementById('local-prompt').value = '';
  document.getElementById('local-charCount').textContent = '0';
  setMinDateTime('local-time');
  await renderSchedules();
}

// ─── CLOUD MODE ───────────────────────────────────────────────────────────────
async function testCloudConnection() {
  const url    = document.getElementById('cloud-serverUrl').value.trim();
  const statusEl = document.getElementById('cloud-serverStatus');
  if (!url) return;

  showStatus(statusEl, '⏳ Testing...', '');
  try {
    const res  = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.status === 'ok') {
      showStatus(statusEl, data.setup ? '✅ Server is running and set up' : '⚠️ Server running but not set up yet — open the URL in a browser to finish setup', data.setup ? 'success' : 'warn');
    } else {
      showStatus(statusEl, '❌ Server responded but looks wrong', 'error');
    }
  } catch {
    showStatus(statusEl, '❌ Could not reach server. Check the URL.', 'error');
  }
}

async function connectCloud() {
  const url    = document.getElementById('cloud-serverUrl').value.trim();
  const key    = document.getElementById('cloud-apiKey').value.trim();
  const statusEl = document.getElementById('cloud-connectStatus');

  if (!url || !key) return showStatus(statusEl, 'Enter both server URL and API key.', 'error');

  showStatus(statusEl, '⏳ Connecting...', '');
  try {
    const res  = await fetch(`${url}/health`, {
      headers: { 'X-API-Key': key },
      signal:  AbortSignal.timeout(8000)
    });

    if (res.status === 401) return showStatus(statusEl, '❌ Wrong API key.', 'error');
    if (!res.ok)            return showStatus(statusEl, '❌ Server error.', 'error');

    cloudServerUrl   = url;
    cloudApiKey      = key;
    isCloudConnected = true;
    await chrome.storage.local.set({ cloudServerUrl: url, cloudApiKey: key });

    showStatus(statusEl, '✅ Connected! You can now save credentials and schedule prompts.', 'success');
    showCloudSections(true);
    loadSavedCreds();
  } catch {
    showStatus(statusEl, '❌ Could not reach server.', 'error');
  }
}

function showCloudSections(show) {
  document.getElementById('cloud-credSection').classList.toggle('hidden', !show);
  document.getElementById('cloud-scheduleSection').classList.toggle('hidden', !show);
}

async function saveCredentials() {
  const platform  = document.getElementById('cred-platform').value;
  const activeTab = document.querySelector('.auth-tab.active');
  const authType  = activeTab?.dataset.type || 'cookie';
  const statusEl  = document.getElementById('cred-status');

  let data = {};
  if (authType === 'cookie') {
    data.cookie = document.getElementById('cred-cookie').value.trim();
    if (!data.cookie) return showStatus(statusEl, 'Paste your session cookie.', 'error');
  } else {
    data.email    = document.getElementById('cred-email').value.trim();
    data.password = document.getElementById('cred-password').value;
    if (!data.email || !data.password) return showStatus(statusEl, 'Enter email and password.', 'error');
  }

  showStatus(statusEl, '⏳ Saving...', '');
  try {
    const res = await cloudFetch('POST', '/credentials', { platform, auth_type: authType, data });
    showStatus(statusEl, `✅ ${res.message}`, 'success');
    document.getElementById('cred-cookie').value   = '';
    document.getElementById('cred-email').value    = '';
    document.getElementById('cred-password').value = '';
    loadSavedCreds();
  } catch (err) {
    showStatus(statusEl, `❌ ${err.message}`, 'error');
  }
}

async function loadSavedCreds() {
  if (!isCloudConnected) return;
  try {
    const data      = await cloudFetch('GET', '/credentials');
    const container = document.getElementById('cloud-savedCreds');
    if (!data.credentials?.length) { container.innerHTML = ''; return; }

    container.innerHTML = `<p style="font-size:11px;font-weight:600;color:#7c3aed;margin-bottom:6px;">Saved credentials:</p>` +
      data.credentials.map(c => `
        <div class="saved-key-row">
          <span class="key-provider">${c.platform}</span>
          <span class="key-preview">${c.auth_type === 'cookie' ? '🍪 Cookie' : '🔐 Password'}</span>
          <button class="btn-delete" onclick="deleteCred('${c.platform}')">🗑</button>
        </div>`).join('');
  } catch {}
}

async function deleteCred(platform) {
  try {
    await cloudFetch('DELETE', `/credentials/${platform}`);
    loadSavedCreds();
  } catch {}
}

async function addCloudSchedule() {
  const platform = document.getElementById('cloud-platform').value;
  const chatUrl  = document.getElementById('cloud-chatUrl').value.trim();
  const prompt   = document.getElementById('cloud-prompt').value.trim();
  const timeStr  = document.getElementById('cloud-time').value;
  const errEl    = document.getElementById('cloud-error');
  errEl.classList.add('hidden');

  if (!chatUrl) return showErr(errEl, 'Paste the chat URL.');
  if (!prompt)  return showErr(errEl, 'Enter a prompt.');
  if (!timeStr) return showErr(errEl, 'Set a time.');
  const ts = new Date(timeStr).getTime();
  if (ts <= Date.now()) return showErr(errEl, 'Time must be in the future.');

  try {
    await cloudFetch('POST', '/schedules', { platform, chat_url: chatUrl, prompt, scheduled_time: ts });
    document.getElementById('cloud-prompt').value = '';
    setMinDateTime('cloud-time');
    await renderSchedules();
  } catch (err) {
    showErr(errEl, err.message);
  }
}

// ─── Schedule List ────────────────────────────────────────────────────────────
async function renderSchedules() {
  const container = document.getElementById('scheduleList');
  const badge     = document.getElementById('pendingBadge');
  let   schedules = [];

  if (currentMode === 'local') {
    schedules = await getLocalSchedules();
  } else if (currentMode === 'cloud' && isCloudConnected) {
    try {
      const data = await cloudFetch('GET', '/schedules');
      schedules  = data.schedules || [];
    } catch { schedules = []; }
  }

  const pending = schedules.filter(s => s.status === 'pending' || s.status === 'running');
  badge.textContent = pending.length;
  pending.length ? badge.classList.remove('hidden') : badge.classList.add('hidden');

  if (!schedules.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No prompts scheduled yet.</p></div>`;
    return;
  }

  container.innerHTML = schedules.map(s => {
    const ts = s.scheduled_time || s.scheduledTime;
    const statusLabel = { pending:'⏳ Pending', running:'🔄 Sending…', sent:'✅ Sent', failed:'❌ Failed', cancelled:'🚫 Cancelled' }[s.status] || s.status;
    const preview = (s.prompt || '').slice(0, 110) + ((s.prompt||'').length > 110 ? '…' : '');
    const respHtml = s.response_text ? `<div class="item-response">💬 ${esc(s.response_text.slice(0, 150))}…</div>` : '';
    const errHtml  = s.error_message ? `<div class="item-response" style="background:#fef2f2;border-color:#fecaca;color:#dc2626">⚠️ ${esc(s.error_message)}</div>` : '';
    return `
      <div class="schedule-item status-${s.status}">
        <div class="item-top">
          <span class="item-platform">${s.platform}</span>
          <span class="item-status">${statusLabel}</span>
        </div>
        <div class="item-time">🕐 ${fmtDate(new Date(ts).getTime())}</div>
        <div class="item-prompt">${esc(preview)}</div>
        ${respHtml}${errHtml}
        <div class="item-bottom">
          ${s.status === 'pending' ? `<button class="btn-delete" onclick="deleteSchedule('${s.id}','${s.mode||currentMode}')">🗑 Remove</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function deleteSchedule(id, mode) {
  if (mode === 'local') {
    const list = (await getLocalSchedules()).filter(s => s.id !== id);
    await chrome.storage.local.set({ local_schedules: list });
    await chrome.alarms.clear(ALARM_PREFIX + id);
  } else {
    try { await cloudFetch('DELETE', `/schedules/${id}`); } catch {}
  }
  renderSchedules();
}

// ─── Cloud fetch helper ───────────────────────────────────────────────────────
async function cloudFetch(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': cloudApiKey },
    signal: AbortSignal.timeout(10000)
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(cloudServerUrl + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getCurrentTabUrl(urlId, platformId) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) { document.getElementById(urlId).value = tab.url; autoDetect(tab.url, platformId); }
}

function autoDetect(url, platformId) {
  const map = { 'claude.ai':'Claude.ai', 'chatgpt.com':'ChatGPT', 'chat.openai.com':'ChatGPT', 'gemini.google.com':'Gemini', 'perplexity.ai':'Perplexity' };
  for (const [d,p] of Object.entries(map)) if (url.includes(d)) { document.getElementById(platformId).value = p; break; }
}
function toggleVisibility(id) { const el = document.getElementById(id); el.type = el.type === 'password' ? 'text' : 'password'; }
function setMinDateTime(id) { const inp = document.getElementById(id); const v = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0,16); inp.min = new Date(Date.now() + 60000).toISOString().slice(0,16); inp.value = v; }
function getLocalSchedules() { return new Promise(r => chrome.storage.local.get('local_schedules', d => r(d.local_schedules || []))); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function showErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function showStatus(el, msg, type) { el.textContent = msg; el.className = `status-msg ${type}`; el.classList.remove('hidden'); }
function fmtDate(ts) { const d = new Date(ts); return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}) + ' at ' + d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
