// ─── ChatGPT Browser Automation ──────────────────────────────────────────────

async function loginWithCookie(context, data) {
  await context.addCookies([
    {
      name:     '__Secure-next-auth.session-token',
      value:    data.cookie.trim(),
      domain:   'chatgpt.com',
      path:     '/',
      secure:   true,
      httpOnly: true,
      sameSite: 'Lax'
    }
  ]);
}

async function loginWithPassword(page, data) {
  await page.goto('https://chatgpt.com/auth/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.click('text=Log in');
  await page.waitForTimeout(1000);

  await page.fill('input[name="username"], input[type="email"]', data.email);
  await page.click('button[type="submit"], button:has-text("Continue")');
  await page.waitForTimeout(1500);

  await page.fill('input[type="password"]', data.password);
  await page.click('button[type="submit"], button:has-text("Continue")');

  await page.waitForURL('https://chatgpt.com/**', { timeout: 15000 });
  await page.waitForTimeout(2000);
}

async function sendPrompt(page, promptText) {
  const inputSel = '#prompt-textarea, div[contenteditable="true"]';

  await page.waitForSelector(inputSel, { timeout: 10000 });
  const input = page.locator(inputSel).first();
  await input.click();
  await page.keyboard.type(promptText, { delay: 20 });
  await page.waitForTimeout(500);

  // Send button
  const sendBtn = page.locator('button[data-testid="send-button"], button[aria-label="Send prompt"]').first();
  try {
    await sendBtn.click({ timeout: 3000 });
  } catch {
    await page.keyboard.press('Enter');
  }

  return await waitForResponse(page);
}

async function waitForResponse(page) {
  // Wait for streaming to start then finish
  try {
    await page.waitForSelector('[data-testid="stop-button"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="stop-button"]', { state: 'detached', timeout: 120000 });
  } catch {}

  await page.waitForTimeout(1500);

  // Get last assistant message
  try {
    const msgs = page.locator('[data-message-author-role="assistant"]');
    const last  = msgs.last();
    return await last.innerText({ timeout: 5000 });
  } catch {
    return '(Response captured — check your chat)';
  }
}

module.exports = { loginWithCookie, loginWithPassword, sendPrompt };
