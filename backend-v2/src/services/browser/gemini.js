// ─── Gemini Browser Automation ────────────────────────────────────────────────

async function loginWithCookie(context, data) {
  // Gemini uses multiple Google cookies
  const googleCookies = data.cookie.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=');
    return { name: name.trim(), value: rest.join('=').trim(), domain: '.google.com', path: '/', secure: true };
  }).filter(c => c.name && c.value);

  if (googleCookies.length === 0) {
    throw new Error('Gemini: Please provide your Google session cookies (copy all cookies from google.com)');
  }
  await context.addCookies(googleCookies);
}

async function loginWithPassword(page, data) {
  await page.goto('https://accounts.google.com/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await page.fill('input[type="email"]', data.email);
  await page.click('#identifierNext, button:has-text("Next")');
  await page.waitForTimeout(2000);

  await page.fill('input[type="password"]', data.password);
  await page.click('#passwordNext, button:has-text("Next")');

  await page.waitForURL('https://myaccount.google.com/**', { timeout: 20000 });
  await page.waitForTimeout(1000);
}

async function sendPrompt(page, promptText) {
  const inputSel = '.ql-editor[contenteditable="true"], rich-textarea div[contenteditable="true"]';

  await page.waitForSelector(inputSel, { timeout: 12000 });
  const input = page.locator(inputSel).first();
  await input.click();
  await page.keyboard.type(promptText, { delay: 20 });
  await page.waitForTimeout(500);

  // Send button
  try {
    await page.click('button.send-button, button[aria-label="Send message"]', { timeout: 3000 });
  } catch {
    await page.keyboard.press('Enter');
  }

  return await waitForResponse(page);
}

async function waitForResponse(page) {
  try {
    await page.waitForSelector('.loading-indicator, [aria-label="Stop generating"]', { timeout: 8000 });
    await page.waitForSelector('.loading-indicator, [aria-label="Stop generating"]', { state: 'detached', timeout: 120000 });
  } catch {}
  await page.waitForTimeout(2000);

  try {
    const msgs = page.locator('model-response, .model-response-text');
    return await msgs.last().innerText({ timeout: 5000 });
  } catch {
    return '(Response captured — check your chat)';
  }
}

module.exports = { loginWithCookie, loginWithPassword, sendPrompt };
