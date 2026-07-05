// ─── AI Prompt Scheduler — Background Service Worker ───────────────────────
// Handles: alarm firing, opening chat tabs, injecting prompts, notifications

const ALARM_PREFIX = 'aps-';
const INJECT_DELAY_MS = 4500; // Wait for React/page JS to initialize

// ─── Alarm Handler ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  const scheduleId = alarm.name.replace(ALARM_PREFIX, '');
  console.log(`[APS] Alarm fired for schedule: ${scheduleId}`);

  try {
    const { schedules = [] } = await chrome.storage.local.get('schedules');
    const schedule = schedules.find(s => s.id === scheduleId);

    if (!schedule) {
      console.warn('[APS] Schedule not found:', scheduleId);
      return;
    }

    if (schedule.status !== 'pending') {
      console.warn('[APS] Schedule not pending, skipping:', scheduleId);
      return;
    }

    // Mark as "running" so duplicate alarms don't double-fire
    await updateScheduleStatus(scheduleId, 'running');

    // Open the specific chat URL
    const tab = await chrome.tabs.create({
      url: schedule.chatUrl,
      active: false // Don't steal focus while user is sleeping
    });

    console.log(`[APS] Opened tab ${tab.id} for ${schedule.platform}`);

    // Wait for the tab to fully load, then inject
    waitForTabLoad(tab.id, async () => {
      // Extra delay for React/framework to mount
      setTimeout(async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: injectAndSendPrompt,
            args: [schedule.prompt, schedule.platform]
          });

          await updateScheduleStatus(scheduleId, 'sent');
          notify('✅ Prompt Sent!', `Your saved prompt was sent to ${schedule.platform}.`);
          console.log(`[APS] Prompt sent successfully for ${scheduleId}`);

        } catch (err) {
          console.error('[APS] Injection failed:', err);
          await updateScheduleStatus(scheduleId, 'failed');
          notify(
            '❌ Prompt Failed',
            `Could not send to ${schedule.platform}. Make sure you're logged in.`
          );
        }
      }, INJECT_DELAY_MS);
    });

  } catch (err) {
    console.error('[APS] handleAlarm error:', err);
    await updateScheduleStatus(scheduleId, 'failed');
  }
});

// ─── Tab Load Listener ────────────────────────────────────────────────────────

function waitForTabLoad(tabId, callback) {
  // Timeout safety: if tab never reaches 'complete', still try after 15s
  const fallbackTimer = setTimeout(() => {
    chrome.tabs.onUpdated.removeListener(listener);
    callback();
  }, 15000);

  function listener(changedTabId, changeInfo) {
    if (changedTabId !== tabId || changeInfo.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(listener);
    clearTimeout(fallbackTimer);
    callback();
  }

  chrome.tabs.onUpdated.addListener(listener);
}

// ─── Prompt Injection (runs inside the chatbot page) ─────────────────────────
// NOTE: This function is serialized and executed in the page context.
// It must be entirely self-contained — no references to outer scope.

function injectAndSendPrompt(promptText, platform) {
  // Selectors for each platform's input and submit button
  const PLATFORMS = {
    'Claude.ai': {
      inputs: [
        'div[contenteditable="true"].ProseMirror',
        '.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][data-placeholder]',
        'div[contenteditable="true"]'
      ],
      submits: [
        'button[aria-label="Send message"]',
        'button[aria-label="Send Message"]',
        'button[data-testid="send-button"]'
      ]
    },
    'ChatGPT': {
      inputs: [
        '#prompt-textarea',
        'div[contenteditable="true"][id="prompt-textarea"]',
        'div[contenteditable="true"]',
        'textarea[data-id="root"]'
      ],
      submits: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]'
      ]
    },
    'Gemini': {
      inputs: [
        'div.ql-editor[contenteditable="true"]',
        'rich-textarea div[contenteditable="true"]',
        'div[contenteditable="true"]'
      ],
      submits: [
        'button.send-button',
        'button[aria-label="Send message"]',
        'button[aria-label="Submit"]',
        'button[mattooltip="Send message"]'
      ]
    },
    'Perplexity': {
      inputs: [
        'textarea[placeholder]',
        'div[contenteditable="true"]'
      ],
      submits: [
        'button[aria-label="Submit"]',
        'button[type="submit"]'
      ]
    }
  };

  const config = PLATFORMS[platform] || PLATFORMS['Claude.ai'];
  let attempts = 0;
  const MAX_ATTEMPTS = 12;

  function tryFindAndType() {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      console.error('[APS] Could not find input after', MAX_ATTEMPTS, 'attempts');
      return;
    }

    // Find input element
    let inputEl = null;
    for (const sel of config.inputs) {
      try {
        const el = document.querySelector(sel);
        if (el) { inputEl = el; break; }
      } catch (e) {}
    }

    if (!inputEl) {
      console.log(`[APS] Input not found, retry ${attempts}/${MAX_ATTEMPTS}`);
      setTimeout(tryFindAndType, 1000);
      return;
    }

    console.log('[APS] Found input element:', inputEl.tagName, inputEl.className);

    // Focus the input
    inputEl.focus();
    inputEl.click();

    // Clear any existing content
    if (inputEl.tagName === 'TEXTAREA') {
      typeIntoTextarea(inputEl, promptText);
    } else {
      typeIntoContentEditable(inputEl, promptText);
    }

    // Submit after a short delay
    setTimeout(() => {
      trySubmit(inputEl);
    }, 800);
  }

  function typeIntoContentEditable(el, text) {
    // Method 1: execCommand (works in Chrome, even though "deprecated")
    try {
      el.focus();
      // Select all and delete first
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      const result = document.execCommand('insertText', false, text);
      if (result && el.textContent.trim()) {
        console.log('[APS] execCommand insertText succeeded');
        return;
      }
    } catch (e) {
      console.warn('[APS] execCommand failed:', e);
    }

    // Method 2: InputEvent with data
    try {
      el.innerHTML = '';
      el.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true, cancelable: true,
        inputType: 'insertText', data: text
      }));
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true, inputType: 'insertText', data: text
      }));
      if (el.textContent.trim()) {
        console.log('[APS] InputEvent method succeeded');
        return;
      }
    } catch (e) {
      console.warn('[APS] InputEvent method failed:', e);
    }

    // Method 3: Direct set + mutation
    try {
      el.innerHTML = `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('[APS] Direct innerHTML method used');
    } catch (e) {
      console.warn('[APS] All methods failed:', e);
    }
  }

  function typeIntoTextarea(el, text) {
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, 'value'
      ).set;
      nativeSetter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[APS] Textarea native setter succeeded');
    } catch (e) {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function trySubmit(inputEl) {
    // Try each submit button selector
    for (const sel of config.submits) {
      try {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) {
          console.log('[APS] Clicking submit button:', sel);
          btn.click();
          return;
        }
      } catch (e) {}
    }

    // Fallback: simulate Enter key on the input
    console.log('[APS] No submit button found, trying Enter key');
    inputEl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13,
      bubbles: true, cancelable: true
    }));
  }

  // Start the process
  tryFindAndType();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateScheduleStatus(id, status) {
  try {
    const { schedules = [] } = await chrome.storage.local.get('schedules');
    const idx = schedules.findIndex(s => s.id === id);
    if (idx !== -1) {
      schedules[idx].status = status;
      schedules[idx].updatedAt = Date.now();
      await chrome.storage.local.set({ schedules });
    }
  } catch (err) {
    console.error('[APS] updateScheduleStatus error:', err);
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title,
    message
  });
}
