// AI Prompt Scheduler — Popup
var ALARM_PREFIX = 'aps-';
var mode = 'local';
var confirmedTime = null; // holds the actual locked-in timestamp once confirmed

document.addEventListener('DOMContentLoaded', function () {
  loadDark();
  setDefaultTime();
  loadCloudSettings();
  setupListeners();
  renderLocalList();
});

function loadDark() {
  chrome.storage.local.get('darkMode', function (d) {
    if (d.darkMode) {
      document.body.classList.add('dark');
      document.getElementById('darkToggle').textContent = '☀️';
    }
  });
}

function setupListeners() {
  document.getElementById('darkToggle').addEventListener('click', function () {
    var isDark = document.body.classList.toggle('dark');
    document.getElementById('darkToggle').textContent = isDark ? '☀️' : '🌙';
    chrome.storage.local.set({ darkMode: isDark });
  });

  var tabs = document.querySelectorAll('.mode-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function (e) {
      mode = e.currentTarget.getAttribute('data-mode');
      for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
      e.currentTarget.classList.add('active');
      document.getElementById('modeDesc').textContent =
        mode === 'local' ? 'Fires from Chrome when laptop is on.' : 'Works via your own server, 24/7.';
      document.getElementById('panel-local').classList.toggle('hidden', mode !== 'local');
      document.getElementById('panel-cloud').classList.toggle('hidden', mode !== 'cloud');
    });
  }

  document.getElementById('l-tabBtn').addEventListener('click', grabCurrentTab);
  document.getElementById('l-addBtn').addEventListener('click', addLocalSchedule);

  // ── THE ACTUAL FIX for "picker won't close" ──────────────────────────────
  // Clicking Confirm forces the native picker to close (.blur()) and shows
  // a clear line of text stating exactly what time got locked in. This
  // removes all ambiguity — you know for certain the time is set once you
  // see the green confirmation line appear.
  document.getElementById('l-confirmTimeBtn').addEventListener('click', function () {
    var input = document.getElementById('l-time');
    input.blur(); // force-closes the picker if it's stuck open
    if (!input.value) {
      showTimeConfirm('Please pick a date and time first.', true);
      return;
    }
    var ts = new Date(input.value).getTime();
    if (ts <= Date.now()) {
      showTimeConfirm('That time has already passed — pick a future time.', true);
      return;
    }
    confirmedTime = ts;
    showTimeConfirm('Set for: ' + formatDate(ts), false);
  });

  // Quick-select buttons — a faster alternative that skips the native picker
  // entirely for common cases, so you don't have to fight with it at all.
  var quickBtns = document.querySelectorAll('.quick-btn');
  for (var q = 0; q < quickBtns.length; q++) {
    quickBtns[q].addEventListener('click', function (e) {
      var hours = e.currentTarget.getAttribute('data-hours');
      var tomorrow = e.currentTarget.getAttribute('data-tomorrow');
      var ts;
      if (hours) {
        ts = Date.now() + parseInt(hours, 10) * 3600000;
      } else if (tomorrow) {
        var d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(parseInt(tomorrow, 10), 0, 0, 0);
        ts = d.getTime();
      }
      confirmedTime = ts;
      document.getElementById('l-time').value = toLocalInputValue(new Date(ts));
      showTimeConfirm('Set for: ' + formatDate(ts), false);
    });
  }

  document.getElementById('c-connectBtn').addEventListener('click', connectCloud);

  document.getElementById('localList').addEventListener('click', function (e) {
    var btn = e.target.closest('.js-delete-local');
    if (btn) deleteLocalSchedule(btn.getAttribute('data-id'));
  });
}

function showTimeConfirm(msg, isError) {
  var el = document.getElementById('l-timeConfirm');
  el.textContent = msg;
  el.style.background = isError ? 'var(--error-bg)' : 'var(--success-bg)';
  el.style.color = isError ? 'var(--error-text)' : 'var(--success-text)';
  el.classList.remove('hidden');
}

function grabCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url) {
      document.getElementById('l-url').value = tabs[0].url;
      var url = tabs[0].url;
      var map = { 'claude.ai': 'Claude.ai', 'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'gemini.google.com': 'Gemini', 'perplexity.ai': 'Perplexity' };
      for (var domain in map) {
        if (url.indexOf(domain) !== -1) { document.getElementById('l-platform').value = map[domain]; break; }
      }
    }
  });
}

function addLocalSchedule() {
  var url = document.getElementById('l-url').value.trim();
  var prompt = document.getElementById('l-prompt').value.trim();
  var errEl = document.getElementById('l-err');
  errEl.classList.add('hidden');

  if (!url) return showErr(errEl, 'Paste the chat URL first.');
  if (!prompt) return showErr(errEl, 'Enter a prompt.');
  if (!confirmedTime) return showErr(errEl, 'Pick a time, then tap "Confirm ✓" (or use a quick-select button) before scheduling.');
  if (confirmedTime <= Date.now()) return showErr(errEl, 'That time has already passed.');

  chrome.storage.local.get('local_schedules', function (d) {
    var list = d.local_schedules || [];
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    list.push({
      id: id, platform: document.getElementById('l-platform').value,
      chatUrl: url, prompt: prompt, scheduledTime: confirmedTime, status: 'pending', createdAt: Date.now()
    });
    chrome.storage.local.set({ local_schedules: list }, function () {
      chrome.alarms.create(ALARM_PREFIX + id, { when: confirmedTime });
      document.getElementById('l-prompt').value = '';
      document.getElementById('l-timeConfirm').classList.add('hidden');
      confirmedTime = null;
      setDefaultTime();
      renderLocalList();
    });
  });
}

function renderLocalList() {
  chrome.storage.local.get('local_schedules', function (d) {
    var list = d.local_schedules || [];
    var box = document.getElementById('localList');
    if (list.length === 0) { box.innerHTML = '<p class="empty-note">No prompts scheduled yet.</p>'; return; }

    list.sort(function (a, b) { return a.scheduledTime - b.scheduledTime; });
    var labels = { pending: 'Pending', running: 'Sending', sent: 'Sent', failed: 'Failed', waiting_limit: 'Waiting (limit)' };
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var statusClass = s.status === 'sent' ? 'sent' : (s.status === 'failed' ? 'failed' : '');
      html += '<div class="schedule-item">';
      html += '<div class="item-top"><span class="item-platform">' + escapeHtml(s.platform) + '</span>';
      html += '<span class="item-status ' + statusClass + '">' + (labels[s.status] || s.status) + '</span></div>';
      html += '<div class="item-time">' + formatDate(s.scheduledTime) + '</div>';
      html += '<div class="item-prompt">' + escapeHtml(s.prompt.slice(0, 120)) + '</div>';
      if (s.status === 'pending') {
        html += '<div class="item-bottom"><button class="btn-delete js-delete-local" data-id="' + s.id + '">Remove</button></div>';
      }
      html += '</div>';
    }
    box.innerHTML = html;
  });
}

function deleteLocalSchedule(id) {
  chrome.storage.local.get('local_schedules', function (d) {
    var list = (d.local_schedules || []).filter(function (s) { return s.id !== id; });
    chrome.storage.local.set({ local_schedules: list }, function () {
      chrome.alarms.clear(ALARM_PREFIX + id);
      renderLocalList();
    });
  });
}

function loadCloudSettings() {
  chrome.storage.local.get(['cloudUrl', 'cloudKey'], function (d) {
    if (d.cloudUrl) document.getElementById('c-serverUrl').value = d.cloudUrl;
    if (d.cloudKey) document.getElementById('c-apiKey').value = d.cloudKey;
    if (d.cloudUrl) {
      var link = document.getElementById('c-dashLink');
      link.href = d.cloudUrl + '/dashboard';
      link.classList.remove('hidden');
    }
  });
}

function connectCloud() {
  var url = document.getElementById('c-serverUrl').value.trim();
  var key = document.getElementById('c-apiKey').value.trim();
  var statusEl = document.getElementById('c-status');
  if (!url || !key) return showStatus(statusEl, 'Enter both server URL and API key.', 'error');

  showStatus(statusEl, 'Connecting...', '');
  fetch(url + '/health', { headers: { 'X-API-Key': key } })
    .then(function (res) {
      if (res.status === 401) { showStatus(statusEl, 'Wrong API key.', 'error'); return; }
      if (!res.ok) { showStatus(statusEl, 'Server error.', 'error'); return; }
      chrome.storage.local.set({ cloudUrl: url, cloudKey: key }, function () {
        showStatus(statusEl, 'Connected!', 'success');
        var link = document.getElementById('c-dashLink');
        link.href = url + '/dashboard';
        link.classList.remove('hidden');
      });
    })
    .catch(function () { showStatus(statusEl, 'Could not reach server.', 'error'); });
}

function setDefaultTime() {
  var el = document.getElementById('l-time');
  var suggested = new Date(Date.now() + 8 * 3600000);
  el.min = toLocalInputValue(new Date(Date.now() + 60000));
  el.value = toLocalInputValue(suggested);
}
function toLocalInputValue(date) {
  var offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function formatDate(ts) {
  var d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function showErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function showStatus(el, msg, type) { el.textContent = msg; el.className = 'status-msg ' + type; el.classList.remove('hidden'); }
function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
