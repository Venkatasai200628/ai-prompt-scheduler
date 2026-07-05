// ─── Browser Automation Orchestrator ─────────────────────────────────────────
// Launches Chromium headlessly, logs in, opens the chat, sends the prompt.

const { chromium } = require('playwright');
const logger       = require('../../utils/logger');

// Per-platform automation modules
const PLATFORMS = {
  claude:     require('./claude'),
  chatgpt:    require('./chatgpt'),
  gemini:     require('./gemini'),
  perplexity: require('./perplexity')
};

// Map display name → platform key
const PLATFORM_KEY = {
  'Claude.ai':  'claude',
  'ChatGPT':    'chatgpt',
  'Gemini':     'gemini',
  'Perplexity': 'perplexity'
};

/**
 * Main entry point. Launches a browser, logs in, sends the prompt.
 * @param {object} schedule — the schedule row from DB
 * @param {object} creds    — { auth_type: 'cookie'|'password', data: {...} }
 * @returns {string}        — first 1000 chars of the AI response
 */
async function sendScheduledPrompt(schedule, creds) {
  const platformKey = PLATFORM_KEY[schedule.platform];
  if (!platformKey) throw new Error(`Unknown platform: ${schedule.platform}`);

  const platform = PLATFORMS[platformKey];
  if (!platform)  throw new Error(`No browser module for: ${platformKey}`);

  logger.info('Launching browser', { platform: platformKey });

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',   // Important for Docker
      '--disable-gpu'
    ]
  });

  const context = await browser.newContext({
    viewport:  { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Block images/fonts to speed up loading
  await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}', r => r.abort());

  try {
    // Step 1: Authenticate
    logger.info('Authenticating', { auth_type: creds.auth_type });
    if (creds.auth_type === 'cookie') {
      await platform.loginWithCookie(context, creds.data);
    } else {
      await platform.loginWithPassword(page, creds.data);
    }

    // Step 2: Navigate to the specific chat
    logger.info('Navigating to chat', { url: schedule.chat_url });
    await page.goto(schedule.chat_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000); // Let React mount

    // Step 3: Send the prompt
    logger.info('Sending prompt');
    const response = await platform.sendPrompt(page, schedule.prompt);

    logger.info('Prompt sent successfully', { responseLength: response?.length });
    return response || '(Response captured — check your chat)';

  } finally {
    await browser.close();
  }
}

module.exports = { sendScheduledPrompt };
