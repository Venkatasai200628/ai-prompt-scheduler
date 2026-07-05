# Publishing Guide

How to release AI Prompt Scheduler as a proper open-source project.

---

## Step 1 — GitHub (do this first, free)

1. Go to https://github.com/new
2. Repository name: `ai-prompt-scheduler`
3. Description: `Schedule prompts to Claude, ChatGPT, Gemini & Perplexity — automatically, even while you sleep`
4. Set to **Public**
5. Click Create repository

Then upload both folders (extension + backend) to the repo:
```bash
git init
git add .
git commit -m "Initial release v1.0"
git remote add origin https://github.com/YOUR_USERNAME/ai-prompt-scheduler
git push -u origin main
```

Update the README links with your real GitHub username.

---

## Step 2 — Chrome Web Store ($5 one-time, permanent)

### Before submitting, update these files:

**extension/manifest.json** — replace placeholder with your real details:
```json
"name": "AI Prompt Scheduler",
"description": "Schedule prompts to Claude, ChatGPT, Gemini & Perplexity. Works 24/7 with your own free server. 100% free and open source.",
"version": "1.0.0"
```

**extension/popup.js** — make sure all references to `YOUR_BACKEND_DOMAIN` are removed
(they're not needed — each user enters their own server URL)

### Screenshots needed (take these after installing locally):
- 1280×800 or 640×400 PNG
- At least 1, up to 5
- Show: the popup open with Local mode, the Cloud setup screen, a scheduled prompt

### Submit:
1. Go to https://chrome.google.com/webstore/devconsole
2. Pay the $5 one-time developer registration fee
3. Click **+ New Item**
4. Upload a ZIP of just the `extension/` folder
5. Fill in:
   - **Name:** AI Prompt Scheduler
   - **Short description** (132 chars max):
     `Schedule prompts to Claude, ChatGPT & more. Fires automatically — even while you sleep. Free & open source.`
   - **Category:** Productivity
   - **Language:** English
5. Upload screenshots
6. Add privacy policy (see below)
7. Submit for review — takes 1–7 days

---

## Step 3 — Privacy Policy (required by Google)

Create a simple GitHub page or any public URL with this text:

---

**AI Prompt Scheduler — Privacy Policy**

*Last updated: 2026*

**Data collection:** This extension collects no personal data. It does not communicate with any central server.

**Local mode:** All data (scheduled prompts, chat URLs) is stored locally in your browser using Chrome's storage API. Nothing is sent anywhere.

**Cloud mode:** When you use Cloud mode, you set up and connect your own personal server. Your credentials (session cookies or login details) are sent directly to your own server — not to the extension developer. The extension developer has no access to your server or data.

**Third parties:** This extension does not include analytics, advertising, or any third-party tracking.

**Contact:** [your email or GitHub issues link]

---

Host this on GitHub Pages:
1. In your repo → Settings → Pages → Source: main branch → /docs folder
2. Create `docs/privacy.html` with the text above
3. Your privacy policy URL will be: `https://YOUR_USERNAME.github.io/ai-prompt-scheduler/privacy.html`

---

## Step 4 — Railway Template (optional but nice)

Make it one-click for users to deploy:

1. In your GitHub repo, make sure `railway.json` is in the root of the backend folder
2. Go to https://railway.app/new/template
3. Connect your GitHub repo
4. Set required env vars: `ENCRYPTION_SECRET`
5. Get a template URL like `https://railway.app/template/XXXXX`
6. Add the **Deploy on Railway** button to your README (already in the README template)

---

## Summary Checklist

- [ ] GitHub repo created and code pushed
- [ ] README updated with real GitHub username
- [ ] Privacy policy hosted publicly
- [ ] Extension ZIP prepared (just the `extension/` folder)
- [ ] Screenshots taken (1280×800)
- [ ] Chrome Developer account created ($5)
- [ ] Store listing submitted
- [ ] Railway template created (optional)
- [ ] Share on Reddit r/ChatGPT, r/ClaudeAI, r/MachineLearning, Product Hunt
