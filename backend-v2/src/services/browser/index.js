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
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}', function (r) { r.abort(); });

  try {
    if (creds.auth_type === 'cookie') await platform.loginWithCookie(context, creds.data);
    else await platform.loginWithPassword(page, creds.data);

    await page.goto(schedule.chat_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const response = await platform.sendPrompt(page, schedule.prompt);
    return response || '(Response captured — check your chat)';
  } finally {
    await browser.close();
  }
}
module.exports = { sendScheduledPrompt: sendScheduledPrompt };
