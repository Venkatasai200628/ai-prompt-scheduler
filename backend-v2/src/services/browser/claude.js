async function loginWithCookie(context, data) {
  // Parses the FULL cookie string (however many cookies the site uses) rather
  // than assuming one exact cookie name. This is more reliable — the specific
  // session cookie name a site uses can change or vary, but "copy the whole
  // cookie header" always works regardless of what it's actually called.
  const cookies = data.cookie.split(';').map(function (c) {
    const parts = c.trim().split('=');
    const name = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    return { name: name, value: value, domain: 'claude.ai', path: '/', secure: true };
  }).filter(function (c) { return c.name && c.value; });

  if (cookies.length === 0) throw new Error('Claude.ai: No valid cookies found in what was pasted.');
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
