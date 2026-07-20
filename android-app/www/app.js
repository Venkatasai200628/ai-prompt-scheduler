// ─── AI Prompt Scheduler — Android App ────────────────────────────────────────
// This app is a native client for YOUR OWN Cloud server. It does not try to
// automate anything on the phone itself — it just makes API calls to the
// server (the same one the Chrome extension's Cloud mode talks to). That
// server does the real work with Playwright, 24/7, regardless of phone state.

let serverUrl = '', apiKey = '', connected = false;

document.addEventListener('DOMContentLoaded', async () => {
  await loadDark();
  await loadConnection();
  setDefaultTime();
  setupListeners();
});

async function loadDark() {
  const v = localStorage.getItem('aps_darkMode');
  if (v === 'true') { document.body.classList.add('dark'); $('darkToggle').textContent = '☀️'; }
}

async function loadConnection() {
  serverUrl = localStorage.getItem('aps_serverUrl') || '';
  apiKey = localStorage.getItem('aps_apiKey') || '';
  if (serverUrl) $('serverUrl').value = serverUrl;
  if (apiKey) $('apiKey').value = apiKey;
  if (serverUrl && apiKey) {
    connected = true;
    showConnected();
    await renderList();
  }
}

function setupListeners() {
  $('darkToggle').addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    $('darkToggle').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('aps_darkMode', isDark);
  });
  $('connectBtn').addEventListener('click', connect);
  $('toggleKey').addEventListener('click', () => {
    const el = $('apiKey'); el.type = el.type === 'password' ? 'text' : 'password';
  });
  $('addBtn').addEventListener('click', addSchedule);
  $('schedList').addEventListener('click', (e) => {
    const btn = e.target.closest('.js-delete');
    if (btn) deleteSchedule(btn.dataset.id);
  });
}

async function connect() {
  const url = $('serverUrl').value.trim(), key = $('apiKey').value.trim();
  const st = $('connectStatus');
  if (!url || !key) return showSt(st, 'Enter both your server URL and API key.', 'error');
  showSt(st, '⏳ Connecting...', '');
  try {
    const r = await fetch(url + '/health', { headers: { 'X-API-Key': key } });
    if (r.status === 401) return showSt(st, '❌ Wrong API key.', 'error');
    if (!r.ok) return showSt(st, '❌ Server error.', 'error');
    serverUrl = url; apiKey = key; connected = true;
    localStorage.setItem('aps_serverUrl', url);
    localStorage.setItem('aps_apiKey', key);
    showSt(st, '✅ Connected!', 'success');
    showConnected();
    await renderList();
  } catch {
    showSt(st, '❌ Could not reach server. Check the URL and your internet connection.', 'error');
  }
}

function showConnected() {
  $('connected').classList.remove('hidden');
  $('scheduleCard').classList.remove('hidden');
  $('listCard').classList.remove('hidden');
}

async function addSchedule() {
  const platform = $('platform').value, url = $('chatUrl').value.trim();
  const prompt = $('prompt').value.trim(), t = $('sendTime').value;
  const st = $('addStatus');
  if (!url) return showSt(st, 'Enter the chat URL.', 'error');
  if (!prompt) return showSt(st, 'Enter a prompt.', 'error');
  if (!t) return showSt(st, 'Set a time.', 'error');
  const ts = new Date(t).getTime();
  if (ts <= Date.now()) return showSt(st, 'Time must be in the future.', 'error');

  try {
    await apiCall('POST', '/schedules', { platform, chat_url: url, prompt, scheduled_time: ts });
    $('prompt').value = ''; setDefaultTime();
    showSt(st, '✅ Scheduled! Your server will send it.', 'success');
    await renderList();
  } catch (e) { showSt(st, `❌ ${e.message}`, 'error'); }
}

async function renderList() {
  const box = $('schedList'), badge = $('badge');
  try {
    const data = await apiCall('GET', '/schedules');
    const items = data.schedules || [];
    const pending = items.filter(s => ['pending', 'running'].includes(s.status));
    badge.textContent = pending.length;
    pending.length ? badge.classList.remove('hidden') : badge.classList.add('hidden');

    if (!items.length) { box.innerHTML = '<p style="font-size:12px;color:var(--muted)">No prompts scheduled yet.</p>'; return; }

    box.innerHTML = items.map(s => {
      const lbl = { pending:'⏳ Pending', running:'🔄 Sending', sent:'✅ Sent', failed:'❌ Failed' }[s.status] || s.status;
      return `
        <div class="schedule-item">
          <div class="item-top">
            <span class="item-platform">${s.platform}</span>
            <span class="item-status" style="background:var(--primary-lt);color:var(--primary)">${lbl}</span>
          </div>
          <div class="item-time">🕐 ${new Date(s.scheduled_time).toLocaleString()}</div>
          <div class="item-prompt">${esc((s.prompt||'').slice(0,150))}</div>
          ${s.status === 'pending' ? `<div class="item-bottom"><button class="btn-delete js-delete" data-id="${s.id}">🗑 Remove</button></div>` : ''}
        </div>`;
    }).join('');
  } catch {}
}

async function deleteSchedule(id) {
  try { await apiCall('DELETE', `/schedules/${id}`); await renderList(); } catch {}
}

async function apiCall(method, path, body) {
  const r = await fetch(serverUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

function setDefaultTime() {
  const el = $('sendTime');
  el.min = new Date(Date.now() + 60000).toISOString().slice(0,16);
  el.value = new Date(Date.now() + 8*3600000).toISOString().slice(0,16);
}
function $(id) { return document.getElementById(id); }
function showSt(el, msg, type) { el.textContent = msg; el.className = `status-msg ${type}`; el.classList.remove('hidden'); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
