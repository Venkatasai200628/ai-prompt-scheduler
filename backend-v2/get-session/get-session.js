// ─── Session Capture Tool ─────────────────────────────────────────────────────
// Run this on YOUR OWN computer (not on your server). It opens a real,
// visible browser window, lets you log in exactly like you normally would,
// then saves your complete session (cookies + local storage + everything
// Playwright needs) to a file — no hunting through DevTools for cookie
// names required.
//
// Usage:
//   node get-session.js claude
//   node get-session.js chatgpt
//   node get-session.js gemini
//   node get-session.js perplexity

const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');

const PLATFORM_URLS = {
  claude: 'https://claude.ai',
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://gemini.google.com',
  perplexity: 'https://www.perplexity.ai'
};

const platform = process.argv[2];

if (!platform || !PLATFORM_URLS[platform]) {
  console.log('\nUsage: node get-session.js <platform>');
  console.log('Where <platform> is one of: claude, chatgpt, gemini, perplexity\n');
  process.exit(1);
}

function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => { rl.close(); resolve(); });
  });
}

(async () => {
  console.log('\nOpening a real browser window for ' + platform + '...');
  console.log('Log in normally, exactly like you always do.');
  console.log('Once you can see your chats/conversation list, come back to this terminal.\n');

  const browser = await chromium.launch({ headless: false }); // visible window on purpose
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(PLATFORM_URLS[platform]);

  await waitForEnter('Press ENTER here once you are fully logged in and can see your chats... ');

  // This is Playwright's own built-in, official way to capture a complete
  // session — cookies AND local storage together, exactly as the real site
  // set them. No guessing about specific cookie names needed at all.
  const sessionState = await context.storageState();

  const filename = platform + '-session.json';
  fs.writeFileSync(filename, JSON.stringify(sessionState, null, 2));

  console.log('\nDone! Saved to: ' + filename);
  console.log('Open that file, copy ALL of its contents, and paste the whole thing');
  console.log('into your dashboard\'s "Session Cookie" box for ' + platform + '.\n');

  await browser.close();
  process.exit(0);
})();
