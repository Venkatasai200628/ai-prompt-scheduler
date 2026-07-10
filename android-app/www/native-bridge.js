// ─── Native Bridge ────────────────────────────────────────────────────────────
// Replaces chrome.* APIs with Capacitor equivalents + localStorage,
// so the same UI code (app.js) works standalone on Android.

window.chrome = window.chrome || {};

// storage.local → backed by localStorage (works offline, persists across app restarts)
window.chrome.storage = {
  local: {
    get: (keys, cb) => {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
      keyList.forEach(k => {
        const v = localStorage.getItem('aps_' + k);
        if (v !== null) result[k] = JSON.parse(v);
      });
      if (typeof keys === 'object' && !Array.isArray(keys)) {
        Object.keys(keys).forEach(k => { if (!(k in result)) result[k] = keys[k]; });
      }
      cb(result);
    },
    set: (obj, cb) => {
      Object.entries(obj).forEach(([k, v]) => localStorage.setItem('aps_' + k, JSON.stringify(v)));
      if (cb) cb();
    },
    remove: (key, cb) => {
      const keys = Array.isArray(key) ? key : [key];
      keys.forEach(k => localStorage.removeItem('aps_' + k));
      if (cb) cb();
    }
  }
};

// alarms → use Capacitor Local Notifications with a scheduled trigger,
// plus a background check loop for actually firing the browser automation
window.chrome.alarms = {
  create: async (name, opts) => {
    const scheduled = JSON.parse(localStorage.getItem('aps_native_alarms') || '{}');
    scheduled[name] = opts.when;
    localStorage.setItem('aps_native_alarms', JSON.stringify(scheduled));
  },
  clear: async (name) => {
    const scheduled = JSON.parse(localStorage.getItem('aps_native_alarms') || '{}');
    delete scheduled[name];
    localStorage.setItem('aps_native_alarms', JSON.stringify(scheduled));
  },
  clearAll: async () => {
    localStorage.setItem('aps_native_alarms', '{}');
  }
};

// tabs.query / tabs.create — not applicable standalone; provide safe no-ops
window.chrome.tabs = {
  query: (opts, cb) => cb([{ url: '' }]),
  create: (opts) => {
    if (opts.url) window.open(opts.url, '_blank');
    return Promise.resolve({ id: 1 });
  }
};

window.chrome.scripting = { executeScript: () => Promise.resolve([{ result: false }]) };
window.chrome.notifications = {
  create: (opts) => {
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      window.Capacitor.Plugins.LocalNotifications.schedule({
        notifications: [{ title: opts.title, body: opts.message, id: Date.now() }]
      });
    }
  }
};
window.chrome.runtime = { onStartup: { addListener: () => {} }, onInstalled: { addListener: () => {} } };

// ── Background check loop (runs while app is open) ────────────────────────────
// NOTE: True background execution on Android requires a foreground service —
// this checks alarms whenever the app is opened/resumed, same "catch up on missed" behavior.
async function checkNativeAlarms() {
  const scheduled = JSON.parse(localStorage.getItem('aps_native_alarms') || '{}');
  const now = Date.now();
  for (const [name, when] of Object.entries(scheduled)) {
    if (when <= now) {
      console.log('[Native] Alarm due:', name);
      // Trigger same logic as background.js would — opens external browser to the chat
      // (Full native automation requires a WebView-based headless approach — v2 roadmap)
      delete scheduled[name];
    }
  }
  localStorage.setItem('aps_native_alarms', JSON.stringify(scheduled));
}
document.addEventListener('DOMContentLoaded', checkNativeAlarms);
document.addEventListener('resume', checkNativeAlarms); // Capacitor app resume event
