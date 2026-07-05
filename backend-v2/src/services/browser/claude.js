// ─── Claude.ai Browser Automation ────────────────────────────────────────────

const INPUT_SELECTORS = [
  'div[contenteditable="true"].ProseMirror',
  '.ProseMirror[contenteditable="true"]',
  'div[contenteditable="true"]'
];

const SEND_SELECTORS = [
  'button[aria-label="Send message"]',
  'button[aria-label="Send Message"]',
  'button[data-testid="send-button"]'
];

/** Inject session cookies so Claude recognises the user as logged in */
async function loginWithCookie(context, data) {
  const cookies = [
    {
      name:     '__Secure-next-auth.session-token',
      value:    data.cookie.trim(),
      domain:   'claude.ai',
      path:     '/',
      secure:   true,
      httpOnly: true,
      sameSite: 'Lax'
    }
  ];

  // If user provided extra cookies (optional), add them too
  if (data.extra_cookies) {
    for (const [name, value] of Object.entries(data.extra_cookies)) {
      cookies.push({ name, value, domain: 'claude.ai', path: '/', secure: true });
    }
  }

  await context.addCookies(cookies);
}

/** Log in using email + password */
async function loginWithPassword(page, data) {
  await page.goto('https://claude.ai/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Click "Continue with email" or type directly
  try {
    await page.click('text=Continue with email', { timeout: 5000 });
  } catch { /* button might not exist, continue */ }

  await page.fill('input[type="email"]', data.email);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  await page.fill('input[type="password"]', data.password);
  await page.click('button[type="submit"]');

  // Wait for redirect to chat
  await page.waitForURL('**/chat**', { timeout: 15000 });
  await page.waitForTimeout(2000);
}

/** Type the prompt and click send, return AI response text */
async function sendPrompt(page, promptText) {
  // Find the input
  let input = null;
  for (const sel of INPUT_SELECTORS) {
    try {
      await page.waitForSelector(sel, { timeout: 8000 });
      input = page.locator(sel).first();
      if (await input.isVisible()) break;
    } catch { input = null; }
  }

  if (!input) throw new Error('Claude.ai: Could not find the message input box');

  // Type the prompt
  await input.click();
  await input.fill(''); // Clear any existing text
  await page.keyboard.type(promptText, { delay: 20 });
  await page.waitForTimeout(500);

  // Click send
  let sent = false;
  for (const sel of SEND_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }) && await btn.isEnabled()) {
        await btn.click();
        sent = true;
        break;
      }
    } catch { /* try next */ }
  }

  if (!sent) {
    // Fallback: press Enter
    await page.keyboard.press('Enter');
  }

  // Wait for response
  return await waitForResponse(page);
}

/** Poll until AI stops generating, then return the response text */
async function waitForResponse(page) {
  // Wait for the "Stop generating" button to disappear (means response is complete)
  try {
    await page.waitForSelector('button[aria-label="Stop generating"]', { timeout: 5000 });
    await page.waitForSelector('button[aria-label="Stop generating"]', { state: 'detached', timeout: 120000 });
  } catch { /* might not appear for short responses */ }

  await page.waitForTimeout(1500);

  // Grab last response content
  const responseEl = page.locator('.font-claude-message').last();
  try {
    return await responseEl.innerText({ timeout: 5000 });
  } catch {
    return '(Response captured — check your chat)';
  }
}

module.exports = { loginWithCookie, loginWithPassword, sendPrompt };
