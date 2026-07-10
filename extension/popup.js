// ─── AI Prompt Scheduler v6 ───────────────────────────────────────────────────
// Fix: all click handling now uses addEventListener + event delegation.
// Chrome MV3 blocks inline onclick="..." via CSP — that was the real bug.

const ALARM_PREFIX = 'aps-';
let mode = 'local', serverUrl = '', apiKey = '', isConnected = false;
let selectedProvider = '', attachedFiles = [];
let editingId = null; // if set, we're editing this schedule instead of creating new

const MAX_FILES = 3;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB per file (chrome.storage limits)

const MODE_DESC = {
  local: 'Fires from Chrome when laptop is on — or immediately when you next open Chrome if missed.',
  cloud: 'Your own server sends prompts 24/7 — even when laptop and phone are completely off.',
  phone: 'Install our Android app — runs independently on your phone.'
};

const PROVIDER_STEPS = {
  railway: { url:'https://railway.app/new/template', btn:'🚂 Deploy to Railway', note:'Free tier · Easiest · No config needed',
    steps:['Click Deploy to Railway and sign in with GitHub','Variables → Add Variable → <code>ENCRYPTION_SECRET</code> = 32+ char random string','Click Deploy, wait ~3 min','Settings → Domains → Generate Domain','Open URL in browser → Generate My API Key → copy it'] },
  render: { url:'https://render.com', btn:'🎨 Go to Render', note:'Free tier (sleeps when idle — $7/mo for 24/7)',
    steps:['New → Web Service → connect GitHub repo','Environment: Docker','Env var: <code>ENCRYPTION_SECRET</code>','Add Disk at <code>/app/data</code> size 1GB','Deploy → open URL → generate API key'] },
  flyio: { url:'https://fly.io/docs/hands-on/install-flyctl/', btn:'✈️ Fly.io Setup', note:'Free tier · Reliable · Needs terminal',
    steps:['<code>curl -L https://fly.io/install.sh | sh</code>','<code>fly auth login</code>','<code>fly launch</code>','<code>fly secrets set ENCRYPTION_SECRET=your_secret</code>','<code>fly volumes create data --size 1</code>','<code>fly deploy</code> → open URL → get API key'] },
  digitalocean: { url:'https://cloud.digitalocean.com/apps/new', btn:'🌊 Open DigitalOcean', note:'$5/month · Very reliable',
    steps:['App Platform → New App → connect repo','Dockerfile path: <code>backend-v2/Dockerfile</code>','Env var: <code>ENCRYPTION_SECRET</code>','Add volume at <code>/app/data</code>','Deploy → generate API key'] },
  aws: { url:'', btn:'📖 See cloud-giants.md', note:'Advanced — AWS/GCP/Azure via Docker',
    steps:['Build: <code>docker build -t ai-scheduler .</code>','Push to ECR/GCR/ACR','Create service with <code>ENCRYPTION_SECRET</code> env var','Mount storage to <code>/app/data</code>','Enable HTTPS → generate API key'] },
  vps: { url:'', btn:'🖥️ VPS Instructions', note:'Your own Linux server',
    steps:['SSH into server','<code>curl -fsSL https://get.docker.com | sh</code>','Copy backend-v2 folder over','.env: <code>ENCRYPTION_SECRET=your_secret</code>','<code>docker-compose up -d</code>','nginx + HTTPS → generate API key'] }
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadDarkMode();
  setDateTime('l-time');
  setDateTime('c-time');
  await loadCloud();
  setupListeners();
  await renderList();
});

// ─── Dark mode ────────────────────────────────────────────────────────────────
async function loadDarkMode() {
  const { darkMode } = await stor(['darkMode']);
  applyDark(!!darkMode);
}
function applyDark(on) {
  document.body.classList.toggle('dark', on);
  $('darkToggle').textContent = on ? '☀️' : '🌙';
  const sw = $('darkToggleSwitch'); if (sw) sw.checked = on;
}

async function loadCloud() {
  const d = await stor(['cloudUrl','cloudKey','cloudProvider']);
  serverUrl = d.cloudUrl || ''; apiKey = d.cloudKey || ''; selectedProvider = d.cloudProvider || '';
  if (serverUrl) $('c-serverUrl').value = serverUrl;
  if (apiKey)    $('c-apiKey').value    = apiKey;
  if (selectedProvider) { highlightProvider(selectedProvider); showDeployCard(selectedProvider); $('c-connectCard').classList.remove('hidden'); }
  if (serverUrl && apiKey) { isConnected = true; showCloudSections(true); loadCreds(); }
}

// ─── Event listeners (all via addEventListener — CSP safe) ───────────────────
function setupListeners() {
  $('darkToggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('dark');
    applyDark(on);
    chrome.storage.local.set({ darkMode: on });
  });
  $('darkToggleSwitch')?.addEventListener('change', e => {
    applyDark(e.target.checked);
    chrome.storage.local.set({ darkMode: e.target.checked });
  });

  $('settingsBtn').addEventListener('click', () => $('settingsPanel').classList.toggle('hidden'));

  $('clearDataBtn').addEventListener('click', async () => {
    if (!confirm('This will delete ALL scheduled prompts. Are you sure?')) return;
    await chrome.storage.local.remove('local_schedules');
    await chrome.alarms.clearAll();
    showSt($('clearStatus'), '✅ All prompts cleared.', 'success');
    await renderList();
  });

  document.querySelectorAll('.mode-tab').forEach(t => t.addEventListener('click', () => {
    mode = t.dataset.mode;
    document.querySelectorAll('.mode-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('modeDesc').textContent = MODE_DESC[mode];
    document.querySelectorAll('[id^="panel-"]').forEach(p => p.classList.add('hidden'));
    $('panel-' + mode).classList.remove('hidden');
    cancelEdit();
    renderList();
  }));

  document.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedProvider = card.dataset.provider;
      highlightProvider(selectedProvider);
      showDeployCard(selectedProvider);
      $('c-connectCard').classList.remove('hidden');
      chrome.storage.local.set({ cloudProvider: selectedProvider });
    });
  });

  $('l-tabBtn').addEventListener('click', () => grabTab('l-url', 'l-platform'));
  $('l-url').addEventListener('input',    e => detect(e.target.value, 'l-platform'));
  $('l-prompt').addEventListener('input', e => { $('l-chars').textContent = e.target.value.length; });
  $('l-addBtn').addEventListener('click', addOrUpdateLocal);
  $('l-cancelEditBtn').addEventListener('click', cancelEdit);

  $('l-file').addEventListener('change', handleFileSelect);
  $('l-exportBtn').addEventListener('click', exportCurrentChat);

  $('c-testBtn').addEventListener('click',    testServer);
  $('c-connectBtn').addEventListener('click', connectServer);
  $('c-toggleKey').addEventListener('click',  () => toggleEye('c-apiKey'));
  $('c-tabBtn').addEventListener('click',     () => grabTab('c-url', 'c-platform'));
  $('c-addBtn').addEventListener('click',     addCloud);
  $('c-saveCredBtn').addEventListener('click', saveCred);

  document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('c-cookieForm').classList.toggle('hidden', t.dataset.type !== 'cookie');
    $('c-pwForm').classList.toggle('hidden',     t.dataset.type !== 'password');
  }));

  // ── Event delegation for dynamically rendered lists (fixes Remove bug) ──────
  $('schedList').addEventListener('click', (e) => {
    const delBtn  = e.target.closest('.js-delete-schedule');
    const editBtn = e.target.closest('.js-edit-schedule');
    if (delBtn)  { delSchedule(delBtn.dataset.id, delBtn.dataset.mode); }
    if (editBtn) { startEdit(editBtn.dataset.id, editBtn.dataset.mode); }
  });

  $('c-savedCreds').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.js-delete-cred');
    if (delBtn) delCred(delBtn.dataset.platform);
  });
}

// ─── File attachments (multiple, up to MAX_FILES) ────────────────────────────
function handleFileSelect(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (attachedFiles.length >= MAX_FILES) {
      alert(`Maximum ${MAX_FILES} files allowed.`);
      break;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(`"${file.name}" is too large (max 4MB per file).`);
      continue;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      attachedFiles.push({ name: file.name, type: file.type, size: file.size, data: ev.target.result });
      renderFileChips();
    };
    reader.readAsDataURL(file);
  }
  $('l-file').value = '';
}

function renderFileChips() {
  const box = $('l-fileList');
  if (!attachedFiles.length) { box.innerHTML = ''; return; }
  box.innerHTML = attachedFiles.map((f, i) => `
    <div class="file-chip">
      ${f.type.startsWith('image/') ? `<img src="${f.data}">` : '📄'}
      <span class="file-chip-name">${esc(f.name)}</span>
      <button class="file-chip-remove" data-idx="${i}">✕</button>
    </div>`).join('');
  box.querySelectorAll('.file-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      attachedFiles.splice(Number(btn.dataset.idx), 1);
      renderFileChips();
    });
  });
}

// ─── LOCAL mode: add or update (edit) ─────────────────────────────────────────
async function addOrUpdateLocal() {
  const url = $('l-url').value.trim(), prompt = $('l-prompt').value.trim(), t = $('l-time').value;
  const err = $('l-err');
  err.classList.add('hidden');
  if (!url)             return showSt(err, 'Paste the chat URL first.', 'error');
  if (!prompt)          return showSt(err, 'Enter a prompt.', 'error');
  if (!t)               return showSt(err, 'Set a send time.', 'error');
  const ts = new Date(t).getTime();
  if (ts <= Date.now()) return showSt(err, 'Time must be in the future.', 'error');

  const list = await getLocal();

  if (editingId) {
    // Update existing schedule
    const idx = list.findIndex(s => s.id === editingId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], platform: $('l-platform').value, chatUrl: url, prompt, scheduledTime: ts, attachments: attachedFiles };
      await chrome.storage.local.set({ local_schedules: list });
      await chrome.alarms.clear(ALARM_PREFIX + editingId);
      await chrome.alarms.create(ALARM_PREFIX + editingId, { when: ts });
    }
    cancelEdit();
  } else {
    const s = { id: uid(), mode:'local', platform: $('l-platform').value, chatUrl: url, prompt, scheduledTime: ts, status:'pending', createdAt: Date.now(), attachments: attachedFiles };
    list.push(s);
    await chrome.storage.local.set({ local_schedules: list });
    await chrome.alarms.create(ALARM_PREFIX + s.id, { when: ts });
  }

  $('l-prompt').value = ''; $('l-chars').textContent = '0'; setDateTime('l-time');
  attachedFiles = []; renderFileChips();
  await renderList();
}

function startEdit(id, m) {
  if (m !== 'local') { alert('Editing is currently only available for Local mode schedules.'); return; }
  getLocal().then(list => {
    const s = list.find(x => x.id === id);
    if (!s || s.status !== 'pending') return;

    editingId = id;
    $('l-platform').value = s.platform;
    $('l-url').value = s.chatUrl;
    $('l-prompt').value = s.prompt;
    $('l-chars').textContent = s.prompt.length;
    const dt = new Date(s.scheduledTime);
    $('l-time').value = new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
    attachedFiles = s.attachments || [];
    renderFileChips();

    $('l-addBtn').innerHTML = '<i class="ti ti-device-floppy"></i> Update Prompt';
    $('l-cancelEditBtn').classList.remove('hidden');
    $('l-editBanner').classList.remove('hidden');
    document.getElementById('panel-local').scrollIntoView({ behavior: 'smooth' });
  });
}

function cancelEdit() {
  editingId = null;
  $('l-addBtn').innerHTML = '<i class="ti ti-clock"></i> Schedule Prompt';
  $('l-cancelEditBtn').classList.add('hidden');
  $('l-editBanner').classList.add('hidden');
  $('l-prompt').value = ''; $('l-chars').textContent = '0';
  attachedFiles = []; renderFileChips();
  setDateTime('l-time');
}

// ─── CLOUD mode ───────────────────────────────────────────────────────────────
function highlightProvider(p) {
  document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`.provider-card[data-provider="${p}"]`)?.classList.add('selected');
}
function showDeployCard(provider) {
  const info = PROVIDER_STEPS[provider]; if (!info) return;
  $('c-deployCard').classList.remove('hidden');
  const stepsHtml = info.steps.map(s => `<li>${s.replace(/<code>(.*?)<\/code>/g, '<span class="inline-code">$1</span>')}</li>`).join('');
  $('c-deployInstructions').innerHTML = `
    <div class="deploy-note">${info.note}</div>
    ${info.url ? `<a href="${info.url}" target="_blank" class="btn-deploy">${info.btn}</a>` : `<div class="hint-box">${info.btn}</div>`}
    <ol class="deploy-steps">${stepsHtml}</ol>`;
}
function showCloudSections(show) {
  $('c-credCard').classList.toggle('hidden',  !show);
  $('c-schedCard').classList.toggle('hidden', !show);
  $('c-connected').classList.toggle('hidden', !show);
}
async function testServer() {
  const url = $('c-serverUrl').value.trim(), st = $('c-serverStatus');
  if (!url) return;
  showSt(st, '⏳ Testing...', '');
  try {
    const r = await fetch(url + '/health', { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    showSt(st, d.setup ? '✅ Server is running' : '⚠️ Not set up yet — open URL in browser', d.setup ? 'success' : 'warn');
  } catch { showSt(st, '❌ Cannot reach server.', 'error'); }
}
async function connectServer() {
  const url = $('c-serverUrl').value.trim(), key = $('c-apiKey').value.trim(), st = $('c-serverStatus');
  if (!url || !key) return showSt(st, 'Enter both server URL and API key.', 'error');
  showSt(st, '⏳ Connecting...', '');
  try {
    const r = await fetch(url + '/health', { headers: {'X-API-Key': key}, signal: AbortSignal.timeout(8000) });
    if (r.status === 401) return showSt(st, '❌ Wrong API key.', 'error');
    if (!r.ok)            return showSt(st, '❌ Server error.', 'error');
    serverUrl = url; apiKey = key; isConnected = true;
    await chrome.storage.local.set({ cloudUrl: url, cloudKey: key });
    showSt(st, '✅ Connected!', 'success');
    showCloudSections(true); loadCreds();
  } catch { showSt(st, '❌ Could not connect.', 'error'); }
}
async function loadCreds() {
  if (!isConnected) return;
  try {
    const d = await cfetch('GET', '/credentials');
    const box = $('c-savedCreds');
    if (!d.credentials?.length) { box.innerHTML = '<p class="no-creds">No credentials saved yet.</p>'; return; }
    box.innerHTML = d.credentials.map(c => `
      <div class="saved-cred-row">
        <span class="cred-name">${c.platform}</span>
        <span class="cred-type">${c.auth_type === 'cookie' ? '🍪 Cookie' : '🔐 Password'}</span>
        <button class="btn-delete js-delete-cred" data-platform="${c.platform}">🗑</button>
      </div>`).join('');
  } catch {}
}
async function saveCred() {
  const platform = $('c-credPlatform').value;
  const authType = document.querySelector('.auth-tab.active').dataset.type;
  const st = $('c-credStatus');
  let data = {};
  if (authType === 'cookie') {
    data.cookie = $('c-cookie').value.trim();
    if (!data.cookie) return showSt(st, 'Paste your session cookie.', 'error');
  } else {
    data.email = $('c-email').value.trim(); data.password = $('c-password').value;
    if (!data.email || !data.password) return showSt(st, 'Enter email and password.', 'error');
  }
  showSt(st, '⏳ Encrypting and saving...', '');
  try {
    const r = await cfetch('POST', '/credentials', { platform, auth_type: authType, data });
    showSt(st, `✅ ${r.message}`, 'success');
    $('c-cookie').value=''; $('c-email').value=''; $('c-password').value='';
    loadCreds();
  } catch (e) { showSt(st, `❌ ${e.message}`, 'error'); }
}
async function delCred(platform) { try { await cfetch('DELETE', `/credentials/${platform}`); loadCreds(); } catch {} }

async function addCloud() {
  const url = $('c-url').value.trim(), prompt = $('c-prompt').value.trim(), t = $('c-time').value;
  const err = $('c-err');
  err.classList.add('hidden');
  if (!url)             return showSt(err, 'Paste the chat URL.', 'error');
  if (!prompt)          return showSt(err, 'Enter a prompt.', 'error');
  if (!t)               return showSt(err, 'Set a time.', 'error');
  const ts = new Date(t).getTime();
  if (ts <= Date.now()) return showSt(err, 'Time must be in the future.', 'error');
  try {
    await cfetch('POST', '/schedules', { platform: $('c-platform').value, chat_url: url, prompt, scheduled_time: ts });
    $('c-prompt').value=''; setDateTime('c-time'); await renderList();
  } catch (e) { showSt(err, e.message, 'error'); }
}

// ─── Schedule list ────────────────────────────────────────────────────────────
async function renderList() {
  const box = $('schedList'), badge = $('badge');
  let items = [];

  if (mode === 'phone') {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">📱</div><p>Install the companion Android app to manage phone schedules.</p></div>';
    badge.classList.add('hidden');
    return;
  }
  if (mode === 'local') items = await getLocal();
  else if (mode === 'cloud' && isConnected) { try { items = (await cfetch('GET','/schedules')).schedules || []; } catch {} }

  const pending = items.filter(s => ['pending','running'].includes(s.status));
  badge.textContent = pending.length;
  pending.length ? badge.classList.remove('hidden') : badge.classList.add('hidden');

  if (!items.length) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No prompts scheduled yet.</p></div>';
    return;
  }

  box.innerHTML = [...items].sort((a,b) => (a.scheduled_time||a.scheduledTime) - (b.scheduled_time||b.scheduledTime)).map(s => {
    const ts = s.scheduled_time || s.scheduledTime;
    const slbl = { pending:'⏳ Pending', running:'🔄 Sending…', sent:'✅ Sent', failed:'❌ Failed', cancelled:'🚫 Done' }[s.status] || s.status;
    const files = s.attachments || [];
    const smode = s.mode || mode;
    return `
      <div class="schedule-item status-${s.status}">
        <div class="item-top">
          <span class="item-platform">${s.platform}</span>
          <span class="item-status">${slbl}</span>
        </div>
        <div class="item-time">🕐 ${fmt(ts)}</div>
        ${files.length ? `<div class="item-file">📎 ${files.map(f=>esc(f.name)).join(', ')}</div>` : ''}
        <div class="item-prompt">${esc(s.prompt||'')}</div>
        ${s.response_text ? `<div class="item-response">💬 ${esc(s.response_text.slice(0,150))}…</div>` : ''}
        ${(s.error_message||s.errorMsg) ? `<div class="item-error">⚠️ ${esc(s.error_message||s.errorMsg)}</div>` : ''}
        ${s.status === 'pending' ? `
          <div class="item-bottom">
            <button class="btn-edit js-edit-schedule" data-id="${s.id}" data-mode="${smode}">✏️ Edit</button>
            <button class="btn-delete js-delete-schedule" data-id="${s.id}" data-mode="${smode}">🗑 Remove</button>
          </div>` : ''}
      </div>`;
  }).join('');
}

async function delSchedule(id, m) {
  if (m === 'local') {
    const l = (await getLocal()).filter(s => s.id !== id);
    await chrome.storage.local.set({ local_schedules: l });
    await chrome.alarms.clear(ALARM_PREFIX + id);
  } else {
    try { await cfetch('DELETE', `/schedules/${id}`); } catch (e) { alert(e.message); return; }
  }
  await renderList();
}

// ─── Deterministic transcript cleaner ─────────────────────────────────────────
// Runs entirely in plain JS, no AI call, no manual writing — a real repeatable
// feature. Strips known UI noise (button labels, timestamps, "Show more") and
// removes duplicate "preview" lines that some chat UIs render just before the
// full message (e.g. Claude.ai showing "You said: <short preview>" right above
// the actual full message).
function cleanTranscript(rawText) {
  const NOISE_PATTERNS = [
    /^load (earlier|later) messages$/i,
    /^show (more|less)$/i,
    /^(zip|download)$/i,
    /^ran a command.*$/i,
    /^edited( \d+)? files?.*$/i,
    /^\d{1,2}:\d{2}\s?(am|pm)$/i,
    /^you said:?\s*$/i,
    /^claude responded:?\s*$/i
  ];

  let lines = rawText.split('\n').map(l => l.trim());
  lines = lines.filter(l => l && !NOISE_PATTERNS.some(p => p.test(l)));

  const isPreviewOf = (short, long) => {
    if (!short || !long || short.length >= long.length) return false;
    const strip = s => s.toLowerCase().replace(/^(you said:|claude responded:|chatgpt responded:)\s*/i, '');
    const shortCore = strip(short).slice(0, 35);
    if (shortCore.length < 8) return false; // too short to reliably match
    return strip(long).includes(shortCore);
  };

  const cleaned = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i], next = lines[i+1] || '', next2 = lines[i+2] || '';
    if (isPreviewOf(cur, next) || isPreviewOf(cur, next2)) continue; // drop short preview, keep real text
    if (cleaned.length && cleaned[cleaned.length - 1] === cur) continue; // drop exact repeat
    cleaned.push(cur);
  }
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Manual export of the currently open chat tab ────────────────────────────
async function exportCurrentChat() {
  const st = $('l-exportStatus');
  showSt(st, '⏳ Capturing chat...', '');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return showSt(st, 'No active tab found.', 'error');

    const platform = detectPlatformFromUrl(tab.url);
    if (!tab.url || !/claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|perplexity\.ai/.test(tab.url)) {
      return showSt(st, `⚠️ Switch to the actual chat tab first, then click Export again.`, 'warn');
    }

    const USER_SELECTOR = {
      'Claude.ai':  '[data-testid="user-message"]',
      'ChatGPT':    '[data-message-author-role="user"]',
      'Gemini':     'user-query',
      'Perplexity': '[data-testid="user-message"]'
    }[platform] || '[data-testid="user-message"]';

    // Simplified: capture ONE clean text block of the whole conversation container
    // rather than iterating children (which was double-counting nested elements
    // and producing duplicated/garbled text).
    showSt(st, '⏳ Loading full chat history (this may take a few seconds)...', '');
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (userSel) => {
        // ── Step 1: Auto-click "Load earlier messages" until it's gone ─────────
        async function loadAllHistory() {
          for (let i = 0; i < 40; i++) {
            const candidates = Array.from(document.querySelectorAll('button, div[role="button"], a'));
            const loadBtn = candidates.find(el => /load earlier|load more|show earlier|show more messages/i.test(el.innerText || ''));
            if (!loadBtn) break;
            loadBtn.click();
            await new Promise(r => setTimeout(r, 1200));
          }
        }

        // ── Step 2: Also try scrolling the conversation container to the very top ──
        // (some UIs lazy-load on scroll instead of / in addition to a button)
        async function scrollToTop() {
          const scrollable = document.querySelector('[class*="scroll"], main, [role="main"]') || document.scrollingElement;
          let lastHeight = -1;
          for (let i = 0; i < 25; i++) {
            scrollable.scrollTop = 0;
            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 700));
            const h = scrollable.scrollHeight;
            if (h === lastHeight) break; // no new content loaded, stop
            lastHeight = h;
          }
        }

        await loadAllHistory();
        await scrollToTop();
        await loadAllHistory(); // one more pass in case scrolling revealed a new button

        // ── Step 3: Now capture everything ──────────────────────────────────────
        const userNodes = Array.from(document.querySelectorAll(userSel));
        if (userNodes.length === 0) return { text: '', debug: 'No messages found — is the conversation loaded?' };

        let container = userNodes[0];
        let hops = 0;
        while (container && hops < 10) {
          if (userNodes.every(n => container.contains(n)) && container.children.length > 1) break;
          container = container.parentElement;
          hops++;
        }
        if (!container) return { text: '', debug: 'Could not locate conversation container.' };

        const raw = container.innerText || '';
        const cleaned = raw.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n');
        return { text: cleaned.trim(), debug: 'ok', userMessageCount: userNodes.length };
      },
      args: [USER_SELECTOR]
    });

    const rawText = result?.result?.text || '';
    if (!rawText) return showSt(st, `⚠️ ${result?.result?.debug || 'No conversation text found.'}`, 'warn');

    // ── Real feature, runs every time, no AI call, no manual writing ──────────
    const text = cleanTranscript(rawText);

    const md = `# Chat Export — ${platform}\n**Exported:** ${new Date().toLocaleString()}\n\n---\n\n${text}`;

    // Use a Blob + object URL instead of a data: URL — Chrome flags data: URL
    // downloads as potentially unsafe and shows a warning banner; Blob URLs don't.
    const blob = new Blob([md], { type: 'text/markdown' });
    const blobUrl = URL.createObjectURL(blob);
    const filename = `ai-scheduler/manual-export_${platform.replace(/[^a-z0-9]/gi,'_')}_${Date.now()}.md`;

    chrome.downloads.download({ url: blobUrl, filename, saveAs: false }, () => {
      URL.revokeObjectURL(blobUrl);
      if (chrome.runtime.lastError) showSt(st, `Error: ${chrome.runtime.lastError.message}`, 'error');
      else showSt(st, `✅ Exported full conversation (${result?.result?.userMessageCount || '?'} of your messages found, ${text.length} chars total).`, 'success');
    });
  } catch (e) {
    showSt(st, `❌ ${e.message}`, 'error');
  }
}
function detectPlatformFromUrl(url) {
  const m = {'claude.ai':'Claude.ai','chatgpt.com':'ChatGPT','chat.openai.com':'ChatGPT','gemini.google.com':'Gemini','perplexity.ai':'Perplexity'};
  for (const [d,p] of Object.entries(m)) if (url?.includes(d)) return p;
  return 'Claude.ai';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function cfetch(method, path, body) {
  const r = await fetch(serverUrl + path, {
    method, signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type':'application/json', 'X-API-Key': apiKey },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}
async function grabTab(urlId, pId) {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (t?.url) { $(urlId).value = t.url; detect(t.url, pId); }
}
function detect(url, id) {
  const m = {'claude.ai':'Claude.ai','chatgpt.com':'ChatGPT','chat.openai.com':'ChatGPT','gemini.google.com':'Gemini','perplexity.ai':'Perplexity'};
  for (const [d,p] of Object.entries(m)) if (url.includes(d)) { $(id).value = p; break; }
}
function setDateTime(id) {
  const el = $(id), d = new Date(Date.now() + 8*3600000);
  el.min = new Date(Date.now() + 60000).toISOString().slice(0,16);
  el.value = d.toISOString().slice(0,16);
}
function toggleEye(id) { const el=$(id); el.type = el.type==='password'?'text':'password'; }
function getLocal()  { return new Promise(r => chrome.storage.local.get('local_schedules', d => r(d.local_schedules||[]))); }
function stor(k)     { return new Promise(r => chrome.storage.local.get(k, r)); }
function showSt(el, msg, type) { el.textContent=msg; el.className=`status-msg ${type}`; el.classList.remove('hidden'); }
function $(id)       { return document.getElementById(id); }
function uid()       { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function fmt(ts)     { const d=new Date(ts); return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' at '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }
function esc(s)      { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
