// ─── AI Prompt Scheduler — Background Service Worker ─────────────────────────
const ALARM_PREFIX   = 'aps-';
const INJECT_DELAY   = 4500;
const RETRY_DELAY_MS = 10 * 60 * 1000;
const MAX_RETRIES    = 6;
const RESPONSE_WAIT_TIMEOUT = 120000; // max 2 min to wait for AI response to finish

chrome.runtime.onStartup.addListener(handleStartup);
chrome.runtime.onInstalled.addListener(handleStartup);

async function handleStartup() {
  const { local_schedules: schedules = [] } = await chrome.storage.local.get('local_schedules');
  const now = Date.now();
  for (const s of schedules) {
    if (s.status !== 'pending') continue;
    if (s.scheduledTime <= now) {
      console.log('[APS] Missed schedule, firing now:', s.id);
      fireSchedule(s.id);
    } else {
      chrome.alarms.create(ALARM_PREFIX + s.id, { when: s.scheduledTime });
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  await fireSchedule(alarm.name.replace(ALARM_PREFIX, ''));
});

async function fireSchedule(scheduleId, retryCount = 0) {
  const { local_schedules: schedules = [] } = await chrome.storage.local.get('local_schedules');
  const schedule = schedules.find(s => s.id === scheduleId);
  if (!schedule) return;
  if (!['pending', 'waiting_limit'].includes(schedule.status)) return;

  await updateStatus(scheduleId, 'running');

  try {
    const tab = await chrome.tabs.create({ url: schedule.chatUrl, active: true });
    await waitForTabLoad(tab.id);
    await sleep(INJECT_DELAY);

    const limitCheck = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: checkUsageLimit });
    if (limitCheck?.[0]?.result) {
      await chrome.tabs.remove(tab.id).catch(() => {});
      if (retryCount < MAX_RETRIES) {
        await updateStatus(scheduleId, 'waiting_limit', `Limit active — retry ${retryCount + 1}/${MAX_RETRIES}`);
        notify('⏳ Limit Reached', `${schedule.platform} limit active. Retrying in 10 min.`);
        setTimeout(() => fireSchedule(scheduleId, retryCount + 1), RETRY_DELAY_MS);
      } else {
        await updateStatus(scheduleId, 'failed', 'Gave up after repeated limit errors.');
        notify('❌ Still Limited', `${schedule.platform} limit never cleared.`);
      }
      return;
    }

    // Send the prompt
    await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: injectAndSendPrompt,
      args: [schedule.prompt, schedule.platform]
    });

    await updateStatus(scheduleId, 'sent');
    notify('✅ Prompt Sent!', `Sent to ${schedule.platform} — capturing response...`);

    // ── Wait for the AI response to finish, then capture + export full text ────
    const respResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: waitAndCaptureResponse,
      args: [schedule.platform]
    });
    const fullResponse = respResult?.[0]?.result || '';

    if (fullResponse) {
      await saveResponseAndExport(scheduleId, schedule, fullResponse);
      notify('📄 Response Saved', `Full response exported as a file for ${schedule.platform}.`);
    }

  } catch (err) {
    console.error('[APS] Error:', err.message);
    await updateStatus(scheduleId, 'failed', err.message);
    notify('❌ Prompt Failed', `${schedule.platform}: ${err.message}`);
  }
}

function checkUsageLimit() {
  const t = document.body.innerText.toLowerCase();
  return ['usage limit','message limit',"you've reached",'reached your limit','try again later','limit reached','come back later','resets at','daily limit','rate limit','upgrade to continue'].some(p => t.includes(p));
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const fb = setTimeout(resolve, 15000);
    chrome.tabs.onUpdated.addListener(function l(id, info) {
      if (id !== tabId || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(l); clearTimeout(fb); resolve();
    });
  });
}

function injectAndSendPrompt(promptText, platform) {
  const CONFIG = {
    'Claude.ai':  { inputs:['div.ProseMirror[contenteditable="true"]','div[contenteditable="true"]'], submits:['button[aria-label="Send message"]','button[aria-label="Send Message"]'] },
    'ChatGPT':    { inputs:['#prompt-textarea','div[contenteditable="true"]'], submits:['button[data-testid="send-button"]','button[aria-label="Send prompt"]'] },
    'Gemini':     { inputs:['div.ql-editor[contenteditable="true"]','div[contenteditable="true"]'], submits:['button.send-button','button[aria-label="Send message"]'] },
    'Perplexity': { inputs:['textarea[placeholder]','div[contenteditable="true"]'], submits:['button[aria-label="Submit"]','button[type="submit"]'] }
  };
  const cfg = CONFIG[platform] || CONFIG['Claude.ai'];
  let attempts = 0;
  function tryInject() {
    if (++attempts > 15) return;
    let el = null;
    for (const sel of cfg.inputs) { try { el = document.querySelector(sel); if (el) break; } catch {} }
    if (!el) { setTimeout(tryInject, 1000); return; }
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, promptText);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerHTML = '';
      try { document.execCommand('selectAll',false,null); document.execCommand('delete',false,null); document.execCommand('insertText',false,promptText); }
      catch { el.textContent = promptText; el.dispatchEvent(new InputEvent('input',{bubbles:true,data:promptText})); }
    }
    setTimeout(() => {
      let sent = false;
      for (const sel of cfg.submits) { try { const b=document.querySelector(sel); if (b && !b.disabled) { b.click(); sent=true; break; } } catch {} }
      if (!sent) el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));
    }, 800);
  }
  tryInject();
}

// ── Injected: wait for AI to finish streaming, return full response text ──────
function waitAndCaptureResponse(platform) {
  const STOP_BTN = {
    'Claude.ai':  'button[aria-label="Stop generating"]',
    'ChatGPT':    '[data-testid="stop-button"]',
    'Gemini':     '[aria-label="Stop generating"], .loading-indicator',
    'Perplexity': '[data-testid="stop-button"], .loading'
  }[platform] || 'button[aria-label="Stop generating"]';

  const MSG_SELECTOR = {
    'Claude.ai':  '.font-claude-message',
    'ChatGPT':    '[data-message-author-role="assistant"]',
    'Gemini':     'model-response, .model-response-text',
    'Perplexity': '.prose, [data-testid="answer"]'
  }[platform] || '.font-claude-message';

  return new Promise((resolve) => {
    const startTime = Date.now();
    const MAX_WAIT = 120000;

    function poll() {
      const stopBtn = document.querySelector(STOP_BTN);
      const elapsed = Date.now() - startTime;

      if (!stopBtn && elapsed > 3000) {
        // Generation finished (or never started within grace period)
        setTimeout(() => {
          const msgs = document.querySelectorAll(MSG_SELECTOR);
          const last = msgs[msgs.length - 1];
          resolve(last ? last.innerText : '');
        }, 1000);
        return;
      }
      if (elapsed > MAX_WAIT) {
        const msgs = document.querySelectorAll(MSG_SELECTOR);
        const last = msgs[msgs.length - 1];
        resolve(last ? last.innerText : '(Response timed out while capturing)');
        return;
      }
      setTimeout(poll, 1500);
    }
    poll();
  });
}

// ── Deterministic transcript cleaner (same logic as popup.js, no AI call) ─────
function cleanTranscript(rawText) {
  const NOISE_PATTERNS = [
    /^load (earlier|later) messages$/i, /^show (more|less)$/i, /^(zip|download)$/i,
    /^ran a command.*$/i, /^edited( \d+)? files?.*$/i, /^\d{1,2}:\d{2}\s?(am|pm)$/i,
    /^you said:?\s*$/i, /^claude responded:?\s*$/i
  ];
  let lines = rawText.split('\n').map(l => l.trim());
  lines = lines.filter(l => l && !NOISE_PATTERNS.some(p => p.test(l)));
  const isPreviewOf = (short, long) => {
    if (!short || !long || short.length >= long.length) return false;
    const strip = s => s.toLowerCase().replace(/^(you said:|claude responded:|chatgpt responded:)\s*/i, '');
    const shortCore = strip(short).slice(0, 35);
    if (shortCore.length < 8) return false;
    return strip(long).includes(shortCore);
  };
  const cleaned = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i], next = lines[i+1] || '', next2 = lines[i+2] || '';
    if (isPreviewOf(cur, next) || isPreviewOf(cur, next2)) continue;
    if (cleaned.length && cleaned[cleaned.length - 1] === cur) continue;
    cleaned.push(cur);
  }
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Save response preview in storage + export full text as downloadable file ──
async function saveResponseAndExport(scheduleId, schedule, fullResponse) {
  const { local_schedules: list = [] } = await chrome.storage.local.get('local_schedules');
  const idx = list.findIndex(s => s.id === scheduleId);
  const cleanedResponse = cleanTranscript(fullResponse);
  if (idx !== -1) {
    list[idx].response_text = cleanedResponse.slice(0, 500);
    await chrome.storage.local.set({ local_schedules: list });
  }

  // No raw URL included — some AI tools can't follow links and it just adds noise.
  const md = [
    `# AI Prompt Scheduler — Export`,
    ``,
    `**Platform:** ${schedule.platform}`,
    `**Sent at:** ${new Date().toLocaleString()}`,
    ``,
    `**You:**`,
    schedule.prompt,
    ``,
    `---`,
    ``,
    `**${schedule.platform}:**`,
    cleanedResponse
  ].join('\n');

  const blob = new Blob([md], { type: 'text/markdown' });
  const blobUrl = URL.createObjectURL(blob);
  const filename = `ai-scheduler/${schedule.platform.replace(/[^a-z0-9]/gi,'_')}_${Date.now()}.md`;

  chrome.downloads.download({ url: blobUrl, filename, saveAs: false }, () => {
    URL.revokeObjectURL(blobUrl);
    if (chrome.runtime.lastError) console.error('[APS] Download error:', chrome.runtime.lastError.message);
  });
}

async function updateStatus(id, status, errorMsg) {
  const { local_schedules: list = [] } = await chrome.storage.local.get('local_schedules');
  const idx = list.findIndex(s => s.id === id);
  if (idx !== -1) {
    list[idx].status = status; list[idx].updatedAt = Date.now();
    if (errorMsg) list[idx].errorMsg = errorMsg;
    await chrome.storage.local.set({ local_schedules: list });
  }
}
function notify(title, message) { chrome.notifications.create({ type:'basic', iconUrl:'icons/icon48.png', title, message }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
