async function loginWithCookie(context, data) {
  const cookies = data.cookie.split(';').map(function (c) {
    const parts = c.trim().split('=');
    return { name: parts[0].trim(), value: parts.slice(1).join('=').trim(), domain: 'chatgpt.com', path: '/', secure: true };
  }).filter(function (c) { return c.name && c.value; });
  if (cookies.length === 0) throw new Error('ChatGPT: No valid cookies found in what was pasted.');
  await context.addCookies(cookies);
}
async function loginWithPassword(page, data) {
  await page.goto('https://chatgpt.com/auth/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
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
  try { await page.locator('button[data-testid="send-button"]').first().click({ timeout: 3000 }); } catch { await page.keyboard.press('Enter'); }
  try {
    await page.waitForSelector('[data-testid="stop-button"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="stop-button"]', { state: 'detached', timeout: 120000 });
  } catch {}
  await page.waitForTimeout(1500);
  try { return await page.locator('[data-message-author-role="assistant"]').last().innerText({ timeout: 5000 }); }
  catch { return '(Response captured — check your chat)'; }
}
module.exports = { loginWithCookie, loginWithPassword, sendPrompt };
