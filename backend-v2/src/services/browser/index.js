const { chromium } = require('playwright');
const logger = require('../../utils/logger');
const PLATFORMS = {
  claude: require('./claude'),
  chatgpt: require('./chatgpt'),
  gemini: require('./gemini'),
  perplexity: require('./perplexity')
};
const PLATFORM_KEY = { 'Claude.ai': 'claude', 'ChatGPT': 'chatgpt', 'Gemini': 'gemini', 'Perplexity': 'perplexity' };

async function sendScheduledPrompt(schedule, creds) {
  const platformKey = PLATFORM_KEY[schedule.platform];
  const platform = PLATFORMS[platformKey];
  if (!platform) throw new Error('No browser module for: ' + platformKey);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });

  // ── Preferred path: a full Playwright storageState JSON, captured by the
  // get-session tool. This carries cookies AND local storage together,
  // exactly as the real logged-in browser had them — far more reliable than
  // reconstructing a session from a manually copied cookie string.
  let context;
  let usedStorageState = false;
  if (creds.auth_type === 'cookie') {
    try {
      const parsed = JSON.parse(creds.data.cookie);
      if (parsed && (parsed.cookies || parsed.origins)) {
        context = await browser.newContext({
          storageState: parsed,
          viewport: { width: 1280, height: 800 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
        });
        usedStorageState = true;
      }
    } catch (e) {
      // Not valid JSON — fall through to the legacy plain-cookie-string method below.
    }
  }

  if (!context) {
    context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' });
  }

  const page = await context.newPage();
  await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}', function (r) { r.abort(); });

  try {
    // Only run the old login step if we DIDN'T already load a full session above.
    if (!usedStorageState) {
      if (creds.auth_type === 'cookie') await platform.loginWithCookie(context, creds.data);
      else await platform.loginWithPassword(page, creds.data);
    }

    await page.goto(schedule.chat_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check for a "usage limit reached" banner BEFORE trying to send anything.
    // If found, throw a specific error the scheduler recognizes, so it can
    // wait and retry automatically instead of just marking this as failed.
    const pageText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    const limitPhrases = ['usage limit', 'message limit', "you've reached", 'reached your limit',
      'try again later', 'limit reached', 'come back later', 'resets at', 'daily limit', 'rate limit'];
    if (limitPhrases.some(function (p) { return pageText.indexOf(p) !== -1; })) {
      throw new Error('USAGE_LIMIT_ACTIVE');
    }

    const response = await platform.sendPrompt(page, schedule.prompt);
    return response || '(Response captured — check your chat)';
  } finally {
    await browser.close();
  }
}
module.exports = { sendScheduledPrompt: sendScheduledPrompt };
