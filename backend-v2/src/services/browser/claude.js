async function loginWithCookie(context, data) {
  const cookies = [{ name: '__Secure-next-auth.session-token', value: data.cookie.trim(), domain: 'claude.ai', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }];
  await context.addCookies(cookies);
}
async function loginWithPassword(page, data) {
  await page.goto('https://claude.ai/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', data.email);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  await page.fill('input[type="password"]', data.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/chat**', { timeout: 15000 });
  await page.waitForTimeout(2000);
}
async function sendPrompt(page, promptText) {
  const inputSelectors = ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'];
  let input = null;
  for (const sel of inputSelectors) {
    try { await page.waitForSelector(sel, { timeout: 8000 }); const el = page.locator(sel).first(); if (await el.isVisible()) { input = el; break; } } catch {}
  }
  if (!input) throw new Error('Claude.ai: Could not find the message input box');
  await input.click(); await input.fill('');
  await page.keyboard.type(promptText, { delay: 20 });
  await page.waitForTimeout(500);
  try { await page.click('button[aria-label="Send message"]', { timeout: 3000 }); } catch { await page.keyboard.press('Enter'); }
  try {
    await page.waitForSelector('button[aria-label="Stop generating"]', { timeout: 5000 });
    await page.waitForSelector('button[aria-label="Stop generating"]', { state: 'detached', timeout: 120000 });
  } catch {}
  await page.waitForTimeout(1500);
  try { return await page.locator('.font-claude-message').last().innerText({ timeout: 5000 }); }
  catch { return '(Response captured — check your chat)'; }
}
module.exports = { loginWithCookie, loginWithPassword, sendPrompt };
