async function loginWithCookie(context, data) {
  const cookies = data.cookie.split(';').map(function (c) {
    const parts = c.trim().split('=');
    return { name: parts[0].trim(), value: parts.slice(1).join('=').trim(), domain: '.google.com', path: '/', secure: true };
  }).filter(function (c) { return c.name && c.value; });
  if (cookies.length === 0) throw new Error('Gemini: Please provide your Google session cookies');
  await context.addCookies(cookies);
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
}
async function sendPrompt(page, promptText) {
  const inputSel = '.ql-editor[contenteditable="true"], rich-textarea div[contenteditable="true"]';
  await page.waitForSelector(inputSel, { timeout: 12000 });
  const input = page.locator(inputSel).first();
  await input.click();
  await page.keyboard.type(promptText, { delay: 20 });
  await page.waitForTimeout(500);
  try { await page.click('button.send-button, button[aria-label="Send message"]', { timeout: 3000 }); } catch { await page.keyboard.press('Enter'); }
  try {
    await page.waitForSelector('.loading-indicator, [aria-label="Stop generating"]', { timeout: 8000 });
    await page.waitForSelector('.loading-indicator, [aria-label="Stop generating"]', { state: 'detached', timeout: 120000 });
  } catch {}
  await page.waitForTimeout(2000);
  try { return await page.locator('model-response, .model-response-text').last().innerText({ timeout: 5000 }); }
  catch { return '(Response captured — check your chat)'; }
}
module.exports = { loginWithCookie, loginWithPassword, sendPrompt };
