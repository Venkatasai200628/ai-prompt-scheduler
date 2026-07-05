# ⏰ AI Prompt Scheduler

**Schedule prompts to Claude, ChatGPT, Gemini, and Perplexity — automatically, even while you sleep.**

Built for developers and power users who hit AI usage limits mid-task and don't want to wait until morning to continue.

---

## The Problem This Solves

You're working on a deep learning project at night. You ask Claude to fix an error in your code. The response uses up your remaining limit. Now you have to wait 5 hours for the limit to reset — and if it resets at 3am while you're asleep, you lose hours of potential iteration time.

**AI Prompt Scheduler fixes this.** Set the prompt now, go to sleep, and the response is waiting for you in the morning.

---

## How It Works

| Mode | When it fires | What you need |
|---|---|---|
| 💻 **Local** | Chrome is open, laptop is on | Nothing — just the extension |
| ☁️ **Cloud** | Any time, 24/7, even laptop off | Your own free server (5 min setup) |
| 📱 **Phone** | *(Coming soon)* | Android companion app |

**100% free. No accounts. No subscriptions. No data sent to anyone except the AI you're talking to.**

---

## Quick Start

### Local Mode (simplest — 1 minute)

1. **Install the extension** — [Chrome Web Store link] or load it manually (see below)
2. Open your AI chat (Claude, ChatGPT, etc.)
3. Click the ⏰ icon in your toolbar
4. Paste the chat URL → type your prompt → set the time
5. Done. Chrome fires it at that time automatically.

> ⚠️ Laptop must stay on (can be sleeping). If you shut it down, the prompt won't fire.

---

### Cloud Mode (works even when laptop is off)

Cloud mode runs a tiny server **on your own free Railway account** that stays on 24/7. Your credentials never leave your server.

#### Step 1 — Deploy your server (2 minutes)

Click this button to deploy to Railway for free:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

When prompted, set one environment variable:

```
ENCRYPTION_SECRET = any long random string (at least 32 characters)
```

Generate one here: https://generate-secret.vercel.app/64

#### Step 2 — Get your API key

Once deployed, open your Railway server URL in a browser. You'll see a setup page. Click **"Generate My API Key"** and **save the key** — it's only shown once.

#### Step 3 — Connect the extension

1. Open the extension → click **☁️ Cloud** tab
2. Paste your Railway server URL
3. Paste your API key
4. Click **Connect** — you'll see ✅ Connected

#### Step 4 — Add your login credentials

Your server needs to log into the AI platform on your behalf. In the extension under Cloud mode:

1. Select the platform (Claude.ai, ChatGPT, etc.)
2. Choose **Cookie** or **Email + Password**
3. Save — credentials are AES-256 encrypted on your server

**How to get your session cookie:**
- Open the AI site (e.g. claude.ai)
- Press `F12` → Application tab → Cookies → find your domain
- Copy the value of `__Secure-next-auth.session-token`
- Paste it in the extension

#### Step 5 — Schedule prompts

Now use Cloud mode exactly like Local mode — paste the chat URL, type the prompt, set the time. Your server handles the rest.

---

## Self-Hosting the Backend

If you don't want to use Railway, you can run the backend anywhere.

### Requirements
- Node.js 18+
- Docker (if using the Dockerfile)

### Local development

```bash
git clone https://github.com/YOUR_USERNAME/ai-prompt-scheduler
cd backend

cp .env.example .env
# Edit .env and set ENCRYPTION_SECRET

npm install
npx playwright install chromium --with-deps
npm start
```

Server runs on `http://localhost:3000`. Open it in your browser to complete setup.

### Docker

```bash
docker build -t ai-scheduler .
docker run -p 3000:3000 \
  -e ENCRYPTION_SECRET=your_secret_here \
  -v $(pwd)/data:/app/data \
  ai-scheduler
```

### Other hosting options (all free tier available)
- [Railway](https://railway.app) — easiest, one-click deploy
- [Render](https://render.com) — free tier, sleeps after 15min idle (use paid for reliability)
- [Fly.io](https://fly.io) — free tier with `fly launch`
- Any VPS (DigitalOcean, Linode, Hetzner)

---

## Installing the Extension Manually (Developer Mode)

1. Download the extension ZIP from [Releases](https://github.com/YOUR_USERNAME/ai-prompt-scheduler/releases)
2. Unzip it anywhere on your computer
3. Open Chrome → go to `chrome://extensions/`
4. Toggle **Developer mode** ON (top right)
5. Click **Load unpacked** → select the `extension` folder
6. The ⏰ icon appears in your toolbar. Pin it.

---

## Security

Your credentials are protected at every step:

| What | How it's protected |
|---|---|
| Session cookies / passwords | AES-256-GCM encrypted before being stored |
| Encryption key | Derived from your `ENCRYPTION_SECRET` — only you know it |
| API key (extension ↔ server) | SHA-256 hashed in the database — raw key never stored |
| Data in transit | HTTPS only (Railway provides this automatically) |
| Logs | Credentials are never written to logs |

**The server is yours.** No one else has access to it — not even the developers of this project.

---

## Project Structure

```
ai-prompt-scheduler/
├── extension/                  # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js           # Local mode alarm scheduler
│   ├── popup.html / .js / .css # Extension UI
│   └── icons/
│
└── backend/                    # Self-hosted server
    ├── Dockerfile
    ├── railway.json
    ├── src/
    │   ├── index.js            # Express server
    │   ├── db/index.js         # SQLite (no separate DB needed)
    │   ├── routes/
    │   │   ├── setup.js        # First-time setup page
    │   │   ├── schedules.js    # Schedule CRUD
    │   │   └── credentials.js  # Encrypted credential storage
    │   └── services/
    │       ├── encryption.js   # AES-256-GCM
    │       ├── scheduler.js    # node-schedule job manager
    │       └── browser/        # Playwright automation per platform
    │           ├── index.js
    │           ├── claude.js
    │           ├── chatgpt.js
    │           ├── gemini.js
    │           └── perplexity.js
    └── .env.example
```

---

## Supported Platforms

| Platform | Local Mode | Cloud Mode | Cookie Auth | Password Auth |
|---|---|---|---|---|
| Claude.ai | ✅ | ✅ | ✅ | ✅ |
| ChatGPT | ✅ | ✅ | ✅ | ✅ |
| Gemini | ✅ | ✅ | ✅ | ✅ |
| Perplexity | ✅ | ✅ | ✅ | ⚠️ (may need cookie) |

---

## Contributing

PRs welcome. Things that would be great to add:
- Android companion app (Phone mode)
- Firefox extension support
- Better response capture (full text, not just preview)
- Support for more AI platforms
- Dark mode UI

---

## FAQ

**Does this violate the AI platform's Terms of Service?**
This is a personal automation tool for your own account, similar to browser automation tools like Selenium. Use it responsibly and only for your own account.

**What happens if my session cookie expires?**
The prompt will fail and you'll see an error. Just update the cookie in the extension settings.

**Can I schedule multiple prompts?**
Yes — queue as many as you want. They'll fire in order.

**What if the AI platform changes their UI?**
The selectors used to find the input box may break. Open a GitHub issue and we'll update the browser automation scripts.

**Is my data safe?**
Your data lives on your own server. The extension developers never see it.

---

## License

MIT — free to use, modify, and distribute. See [LICENSE](LICENSE).
