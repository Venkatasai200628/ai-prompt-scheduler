// AI Prompt Scheduler — Android App
// This app is a remote control for YOUR OWN server. It does not automate
// anything on the phone itself — it sends requests to your server (the same
// backend that the Chrome extension's Cloud mode uses), and your server does
// the actual work of opening the AI chat and sending the prompt.

var serverUrl = '';
var apiKey = '';
var connected = false;

document.addEventListener('DOMContentLoaded', function () {
  loadDarkMode();
  loadSavedConnection();
  setDefaultTime();
  setupListeners();
});

function loadDarkMode() {
  var v = localStorage.getItem('aps_darkMode');
  if (v === 'true') {
    document.body.classList.add('dark');
    document.getElementById('darkToggle').textContent = '☀️';
  }
}

function loadSavedConnection() {
  serverUrl = localStorage.getItem('aps_serverUrl') || '';
  apiKey = localStorage.getItem('aps_apiKey') || '';
  if (serverUrl) document.getElementById('serverUrl').value = serverUrl;
  if (apiKey) document.getElementById('apiKey').value = apiKey;
  if (serverUrl && apiKey) {
    connected = true;
    showConnectedSections();
    renderList();
  }
}

function setupListeners() {
  document.getElementById('darkToggle').addEventListener('click', function () {
    var isDark = document.body.classList.toggle('dark');
    document.getElementById('darkToggle').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('aps_darkMode', isDark ? 'true' : 'false');
  });

  document.getElementById('connectBtn').addEventListener('click', connectToServer);

  document.getElementById('toggleKey').addEventListener('click', function () {
    var el = document.getElementById('apiKey');
    var btn = document.getElementById('toggleKey');
    if (el.type === 'password') { el.type = 'text'; btn.textContent = 'Hide'; }
    else { el.type = 'password'; btn.textContent = 'Show'; }
  });

  document.getElementById('addBtn').addEventListener('click', addSchedule);

  document.getElementById('schedList').addEventListener('click', function (e) {
    var btn = e.target.closest('.js-delete');
    if (btn) deleteSchedule(btn.getAttribute('data-id'));
  });
}

function connectToServer() {
  var url = document.getElementById('serverUrl').value.trim();
  var key = document.getElementById('apiKey').value.trim();
  var statusEl = document.getElementById('connectStatus');

  if (!url || !key) { showStatus(statusEl, 'Enter both your server URL and API key.', 'error'); return; }

  showStatus(statusEl, 'Connecting...', '');

  fetch(url + '/health', { headers: { 'X-API-Key': key } })
    .then(function (res) {
      if (res.status === 401) { showStatus(statusEl, 'Wrong API key.', 'error'); return null; }
      if (!res.ok) { showStatus(statusEl, 'Server returned an error.', 'error'); return null; }
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      serverUrl = url;
      apiKey = key;
      connected = true;
      localStorage.setItem('aps_serverUrl', url);
      localStorage.setItem('aps_apiKey', key);
      showStatus(statusEl, 'Connected!', 'success');
      showConnectedSections();
      renderList();
    })
    .catch(function () {
      showStatus(statusEl, 'Could not reach the server. Check the URL and your internet connection.', 'error');
    });
}

function showConnectedSections() {
  document.getElementById('connected').classList.remove('hidden');
  document.getElementById('scheduleCard').classList.remove('hidden');
  document.getElementById('listCard').classList.remove('hidden');
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
      showStatus(statusEl, 'Scheduled! Your server will send it.', 'success');
      renderList();
    })
    .catch(function (err) {
      showStatus(statusEl, err.message, 'error');
    });
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
        var label = labels[s.status] || s.status;
        var promptPreview = escapeHtml((s.prompt || '').slice(0, 150));
        var timeStr = new Date(s.scheduled_time).toLocaleString();

        html += '<div class="schedule-item">';
        html += '<div class="item-top"><span class="item-platform">' + escapeHtml(s.platform) + '</span>';
        html += '<span class="item-status">' + label + '</span></div>';
        html += '<div class="item-time">' + timeStr + '</div>';
        html += '<div class="item-prompt">' + promptPreview + '</div>';
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
  apiCall('DELETE', '/schedules/' + id)
    .then(function () { renderList(); })
    .catch(function () {});
}

function apiCall(method, path, body) {
  var options = {
    method: method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }
  };
  if (body) options.body = JSON.stringify(body);

  return fetch(serverUrl + path, options).then(function (res) {
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
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
