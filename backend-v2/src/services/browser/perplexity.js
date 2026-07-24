async function loginWithCookie(context, data) {
  const cookies = data.cookie.split(';').map(function (c) {
    const parts = c.trim().split('=');
    return { name: parts[0].trim(), value: parts.slice(1).join('=').trim(), domain: 'www.perplexity.ai', path: '/', secure: true };
  }).filter(function (c) { return c.name && c.value; });
  if (cookies.length === 0) throw new Error('Perplexity: No valid cookies found in what was pasted.');
  await context.addCookies(cookies);
}
async function loginWithPassword(page, data) {
  await page.goto('https://www.perplexity.ai/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Sign in")', { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', data.email);
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(1500);
  await page.fill('input[type="password"]', data.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}
async function sendPrompt(page, promptText) {
  const inputSel = 'textarea[placeholder], div[contenteditable="true"]';
  await page.waitForSelector(inputSel, { timeout: 10000 });
  const input = page.locator(inputSel).first();
  await input.click();
  await page.keyboard.type(promptText, { delay: 20 });
  await page.waitForTimeout(500);
  try { await page.click('button[aria-label="Submit"], button[type="submit"]', { timeout: 3000 }); } catch { await page.keyboard.press('Enter'); }
  try {
    await page.waitForSelector('[data-testid="stop-button"], .loading', { timeout: 8000 });
    await page.waitForSelector('[data-testid="stop-button"], .loading', { state: 'detached', timeout: 120000 });
  } catch {}
  await page.waitForTimeout(2000);
  try { return await page.locator('.prose, [data-testid="answer"]').last().innerText({ timeout: 5000 }); }
  catch { return '(Response captured — check your chat)'; }
}
module.exports = { loginWithCookie, loginWithPassword, sendPrompt };
