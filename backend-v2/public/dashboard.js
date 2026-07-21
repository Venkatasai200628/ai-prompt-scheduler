// AI Prompt Scheduler — Mobile Dashboard
// Served directly by your own backend server. No app to install, no separate
// server address to type — you're already on the server, just visiting it
// like any website. Works on iPhone and Android identically.

var apiKey = '';

document.addEventListener('DOMContentLoaded', function () {
  loadDarkMode();
  apiKey = localStorage.getItem('aps_dashboard_key') || '';
  if (apiKey) {
    showMainContent();
    renderList();
  }
  setDefaultTime();
  setupListeners();
});

function loadDarkMode() {
  if (localStorage.getItem('aps_darkMode') === 'true') {
    document.body.classList.add('dark');
    document.getElementById('darkToggle').textContent = '☀️';
  }
}

function setupListeners() {
  document.getElementById('darkToggle').addEventListener('click', function () {
    var isDark = document.body.classList.toggle('dark');
    document.getElementById('darkToggle').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('aps_darkMode', isDark ? 'true' : 'false');
  });

  document.getElementById('toggleKeyBtn').addEventListener('click', function () {
    var el = document.getElementById('apiKeyInput');
    var btn = document.getElementById('toggleKeyBtn');
    if (el.type === 'password') { el.type = 'text'; btn.textContent = 'Hide'; }
    else { el.type = 'password'; btn.textContent = 'Show'; }
  });

  document.getElementById('loginBtn').addEventListener('click', unlock);
  document.getElementById('addBtn').addEventListener('click', addSchedule);
  document.getElementById('logoutBtn').addEventListener('click', forgetKey);

  document.getElementById('schedList').addEventListener('click', function (e) {
    var btn = e.target.closest('.js-delete');
    if (btn) deleteSchedule(btn.getAttribute('data-id'));
  });
}

function unlock() {
  var key = document.getElementById('apiKeyInput').value.trim();
  var statusEl = document.getElementById('loginStatus');
  if (!key) { showStatus(statusEl, 'Enter your API key.', 'error'); return; }

  showStatus(statusEl, 'Checking...', '');

  fetch('/health', { headers: { 'X-API-Key': key } })
    .then(function (res) {
      if (res.status === 401) { showStatus(statusEl, 'Wrong API key.', 'error'); return; }
      if (!res.ok) { showStatus(statusEl, 'Server error.', 'error'); return; }
      apiKey = key;
      localStorage.setItem('aps_dashboard_key', key);
      showMainContent();
      renderList();
    })
    .catch(function () {
      showStatus(statusEl, 'Could not check the key. Try again.', 'error');
    });
}

function forgetKey() {
  localStorage.removeItem('aps_dashboard_key');
  apiKey = '';
  document.getElementById('mainContent').classList.add('hidden');
  document.getElementById('loginCard').classList.remove('hidden');
  document.getElementById('apiKeyInput').value = '';
}

function showMainContent() {
  document.getElementById('loginCard').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');
}

function addSchedule() {
  var platform = document.getElementById('platform').value;
  var url = document.getElementById('chatUrl').value.trim();
  var prompt = document.getElementById('prompt').value.trim();
  var timeVal = document.getElementById('sendTime').value;
  var statusEl = document.getElementById('addStatus');

  if (!url) { showStatus(statusEl, 'Enter the chat URL.', 'error'); return; }
  if (!prompt) { showStatus(statusEl, 'Enter a prompt.', 'error'); return; }
  if (!timeVal) { showStatus(statusEl, 'Set a time.', 'error'); return; }

  var ts = new Date(timeVal).getTime();
  if (ts <= Date.now()) { showStatus(statusEl, 'Time must be in the future.', 'error'); return; }

  apiCall('POST', '/schedules', { platform: platform, chat_url: url, prompt: prompt, scheduled_time: ts })
    .then(function () {
      document.getElementById('prompt').value = '';
      setDefaultTime();
      showStatus(statusEl, 'Scheduled!', 'success');
      renderList();
    })
    .catch(function (err) { showStatus(statusEl, err.message, 'error'); });
}

function renderList() {
  var box = document.getElementById('schedList');
  var badge = document.getElementById('badge');

  apiCall('GET', '/schedules')
    .then(function (data) {
      var items = data.schedules || [];
      var pending = items.filter(function (s) { return s.status === 'pending' || s.status === 'running'; });
      badge.textContent = pending.length;
      if (pending.length > 0) badge.classList.remove('hidden'); else badge.classList.add('hidden');

      if (items.length === 0) {
        box.innerHTML = '<p style="font-size:12px;color:var(--muted)">No prompts scheduled yet.</p>';
        return;
      }

      var labels = { pending: 'Pending', running: 'Sending', sent: 'Sent', failed: 'Failed' };
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var s = items[i];
        html += '<div class="schedule-item">';
        html += '<div class="item-top"><span class="item-platform">' + escapeHtml(s.platform) + '</span>';
        html += '<span class="item-status">' + (labels[s.status] || s.status) + '</span></div>';
        html += '<div class="item-time">' + new Date(s.scheduled_time).toLocaleString() + '</div>';
        html += '<div class="item-prompt">' + escapeHtml((s.prompt || '').slice(0, 150)) + '</div>';
        if (s.status === 'pending') {
          html += '<div class="item-bottom"><button class="btn-delete js-delete" data-id="' + s.id + '">Remove</button></div>';
        }
        html += '</div>';
      }
      box.innerHTML = html;
    })
    .catch(function () {
      box.innerHTML = '<p style="font-size:12px;color:var(--error-text)">Could not load schedules.</p>';
    });
}

function deleteSchedule(id) {
  apiCall('DELETE', '/schedules/' + id).then(renderList).catch(function () {});
}

function apiCall(method, path, body) {
  var options = { method: method, headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey } };
  if (body) options.body = JSON.stringify(body);

  // Relative path — this page IS the server, so no separate URL is ever needed
  return fetch(path, options).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
      return data;
    });
  });
}

function setDefaultTime() {
  var el = document.getElementById('sendTime');
  var now = new Date(Date.now() + 60000);
  var later = new Date(Date.now() + 8 * 3600000);
  el.min = toLocalInputValue(now);
  el.value = toLocalInputValue(later);
}
function toLocalInputValue(date) {
  var offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status-msg ' + type;
  el.classList.remove('hidden');
}
function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
