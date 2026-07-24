# Get Session Tool

This replaces hunting through browser DevTools for cookie names — which turned
out to be unreliable since sites like Claude.ai use a mix of cookies and
browser storage that's hard to copy by hand correctly.

Instead, this tool uses Playwright's own official mechanism for exactly this
situation: it opens a real browser window, lets you log in normally, then
saves your complete session to a file.

## Setup (one time)

```bash
cd get-session
npm install
npx playwright install chromium
```

## Run it (once per platform you want to use)

```bash
node get-session.js claude
```

(or `chatgpt`, `gemini`, `perplexity`)

A real browser window will open. Log in exactly like you normally would.
Once you can see your chat list, go back to your terminal and press ENTER.

A file will be created, e.g. `claude-session.json`. Open that file in any
text editor, select all, copy everything.

## Use it

Go to your server's dashboard (`your-server-url/dashboard`), under Login
Credentials:
1. Pick the platform
2. Choose "Session Cookie"
3. Paste the **entire contents of the JSON file** (not just a piece of it)
4. Save

Your server will now use this complete captured session instead of trying
to reconstruct one from a manually-copied cookie string — much more reliable.

## Important

This file contains your actual login session — treat it like a password.
Don't share it, don't commit it to a public GitHub repo. Delete the local
`.json` file after you've pasted its contents into your dashboard, if you
want to be extra careful.
