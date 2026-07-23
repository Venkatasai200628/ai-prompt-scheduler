// AI Prompt Scheduler — Background Service Worker
var ALARM_PREFIX = 'aps-';
var RETRY_ALARM_PREFIX = 'aps-retry-';
var INJECT_DELAY = 4500;
var RETRY_DELAY_MIN = 10;
var MAX_RETRIES = 6;

chrome.runtime.onStartup.addListener(handleStartup);
chrome.runtime.onInstalled.addListener(handleStartup);

function handleStartup() {
  chrome.storage.local.get('local_schedules', function (d) {
    var schedules = d.local_schedules || [];
    var now = Date.now();
    schedules.forEach(function (s) {
      if (['pending', 'waiting_limit'].indexOf(s.status) === -1) return;
      if (s.scheduledTime <= now) {
        fireSchedule(s.id);
      } else if (s.status === 'pending') {
        chrome.alarms.create(ALARM_PREFIX + s.id, { when: s.scheduledTime });
      }
    });
  });
}

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name.indexOf(RETRY_ALARM_PREFIX) === 0) {
    fireSchedule(alarm.name.replace(RETRY_ALARM_PREFIX, ''));
  } else if (alarm.name.indexOf(ALARM_PREFIX) === 0) {
    fireSchedule(alarm.name.replace(ALARM_PREFIX, ''));
  }
});

function fireSchedule(scheduleId) {
  chrome.storage.local.get('local_schedules', function (d) {
    var schedules = d.local_schedules || [];
    var schedule = null;
    for (var i = 0; i < schedules.length; i++) if (schedules[i].id === scheduleId) schedule = schedules[i];
    if (!schedule) return;
    if (['pending', 'waiting_limit'].indexOf(schedule.status) === -1) return;

    var retryCount = schedule.retryCount || 0;
    updateStatus(scheduleId, 'running', null, undefined, function () {
      chrome.tabs.create({ url: schedule.chatUrl, active: true }, function (tab) {
        waitForTabLoad(tab.id, function () {
          setTimeout(function () {
            chrome.scripting.executeScript({ target: { tabId: tab.id }, func: checkUsageLimit }, function (limitResult) {
              var limitHit = limitResult && limitResult[0] && limitResult[0].result;
              if (limitHit) {
                chrome.tabs.remove(tab.id);
                if (retryCount < MAX_RETRIES) {
                  updateStatus(scheduleId, 'waiting_limit', 'Limit active — retry ' + (retryCount + 1) + '/' + MAX_RETRIES, retryCount + 1, function () {
                    notify('Limit Reached', schedule.platform + ' limit active. Retrying in ' + RETRY_DELAY_MIN + ' min.');
                    chrome.alarms.create(RETRY_ALARM_PREFIX + scheduleId, { delayInMinutes: RETRY_DELAY_MIN });
                  });
                } else {
                  updateStatus(scheduleId, 'failed', 'Gave up after repeated limit errors.');
                  notify('Still Limited', schedule.platform + ' limit never cleared.');
                }
                return;
              }
              chrome.scripting.executeScript({ target: { tabId: tab.id }, func: injectAndSendPrompt, args: [schedule.prompt, schedule.platform] }, function () {
                updateStatus(scheduleId, 'sent');
                notify('Prompt Sent!', 'Sent to ' + schedule.platform + '.');
              });
            });
          }, INJECT_DELAY);
        });
      });
    });
  });
}

function checkUsageLimit() {
  var t = document.body.innerText.toLowerCase();
  var phrases = ['usage limit', 'message limit', "you've reached", 'reached your limit', 'try again later', 'limit reached', 'come back later', 'resets at', 'daily limit', 'rate limit'];
  return phrases.some(function (p) { return t.indexOf(p) !== -1; });
}

function waitForTabLoad(tabId, callback) {
  var fired = false;
  var fallback = setTimeout(function () { if (!fired) { fired = true; callback(); } }, 15000);
  function listener(id, info) {
    if (id !== tabId || info.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(listener);
    if (!fired) { fired = true; clearTimeout(fallback); callback(); }
  }
  chrome.tabs.onUpdated.addListener(listener);
}

function injectAndSendPrompt(promptText, platform) {
  var CONFIG = {
    'Claude.ai': { inputs: ['div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"]'], submits: ['button[aria-label="Send message"]'] },
    'ChatGPT': { inputs: ['#prompt-textarea', 'div[contenteditable="true"]'], submits: ['button[data-testid="send-button"]'] },
    'Gemini': { inputs: ['div.ql-editor[contenteditable="true"]', 'div[contenteditable="true"]'], submits: ['button.send-button'] },
    'Perplexity': { inputs: ['textarea[placeholder]', 'div[contenteditable="true"]'], submits: ['button[aria-label="Submit"]'] }
  };
  var cfg = CONFIG[platform] || CONFIG['Claude.ai'];
  var attempts = 0;
  function tryInject() {
    if (++attempts > 15) return;
    var el = null;
    for (var i = 0; i < cfg.inputs.length; i++) { try { el = document.querySelector(cfg.inputs[i]); if (el) break; } catch (e) {} }
    if (!el) { setTimeout(tryInject, 1000); return; }
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, promptText);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerHTML = '';
      try { document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); document.execCommand('insertText', false, promptText); }
      catch (e) { el.textContent = promptText; el.dispatchEvent(new InputEvent('input', { bubbles: true, data: promptText })); }
    }
    setTimeout(function () {
      var sent = false;
      for (var j = 0; j < cfg.submits.length; j++) {
        try { var b = document.querySelector(cfg.submits[j]); if (b && !b.disabled) { b.click(); sent = true; break; } } catch (e) {}
      }
      if (!sent) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }, 800);
  }
  tryInject();
}

function updateStatus(id, status, errorMsg, retryCount, callback) {
  chrome.storage.local.get('local_schedules', function (d) {
    var list = d.local_schedules || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].status = status;
        list[i].updatedAt = Date.now();
        if (errorMsg) list[i].errorMsg = errorMsg;
        if (retryCount !== undefined) list[i].retryCount = retryCount;
      }
    }
    chrome.storage.local.set({ local_schedules: list }, function () { if (callback) callback(); });
  });
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: title, message: message });
}
