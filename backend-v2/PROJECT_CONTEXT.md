# AI Prompt Scheduler — Project Context

**Purpose of this document:** Give any AI assistant (or human) full context on this project
without needing the original chat history. Paste this whole file at the start of a new
conversation and the AI will understand exactly what exists, what works, and what doesn't.

---

## What This Project Is

A Chrome extension (+ optional self-hosted server, + optional Android app) that lets a user
schedule a text prompt to be automatically typed and sent into an AI chat (Claude.ai, ChatGPT,
Gemini, or Perplexity) at a specific future time — even if the user isn't at their computer
when it fires.

**The original problem it solves:** AI chat services have rolling usage limits (e.g. a 5-hour
window). If a limit resets overnight while the user is asleep, they lose potential usage time
until they manually return and send a new message. This tool lets them pre-load a prompt
(e.g. "here's the error, please fix it") that fires automatically the moment they choose,
so work continues without the user needing to be present.

---

## Architecture — Three Modes

| Mode | How it works | Requires |
|---|---|---|
| **Local** | Chrome's `alarms` API fires at the set time; a background script opens the chat tab and types+sends the prompt via DOM injection | Nothing — works out of the box, laptop must be on (or sleeping, not shut down) |
| **Cloud** | User deploys their own backend server (Railway/Render/Fly.io/DigitalOcean/AWS/VPS — user's choice) running Playwright headless browser automation; server logs into the AI platform using a saved session cookie or email/password, and fires prompts 24/7 | User's own server + their own login credentials for the AI platform |
| **Phone** | Two options: (a) install Kiwi Browser (Chromium-based, supports Chrome extensions) and load this same extension, or (b) a Capacitor-based Android app scaffold was built (source only, user must compile the APK themselves via Android Studio or Gradle CLI) | Kiwi Browser (easy) or self-built APK (see android-app/README.md) |

**Deliberate design decision:** This is explicitly an **open-source, self-hosted, free tool**
— not a SaaS product. The developer (person building this) does not run any central server,
does not see any user's data or credentials, and does not charge money. Each user who wants
Cloud mode deploys their own copy of the backend and provides their own AI platform login.
This was a conscious pivot away from an earlier "developer runs one central paid server"
design, specifically because the user wanted a free, privacy-respecting, open-source tool.

---

## Repo / Folder Structure

```
extension/          ← Chrome extension (Manifest V3)
  manifest.json      ← permissions: alarms, storage, tabs, scripting, notifications, downloads
  background.js      ← service worker: fires alarms, injects prompts into AI chat pages,
                        detects "usage limit reached" banners and auto-retries,
                        captures full AI response and auto-exports it as a downloadable .md file
  popup.html/js/css   ← the extension's UI: 3 mode tabs (Local/Cloud/Phone), schedule form,
                        schedule list with Edit/Remove, settings panel (dark mode toggle,
                        clear-all-data button), manual "Export Current Tab's Chat" feature

backend-v2/          ← Self-hosted Node.js server (user deploys their own instance)
  src/
    index.js          ← Express app entry point
    db/index.js        ← SQLite (file-based, no external DB service needed)
    services/
      encryption.js     ← AES-256-GCM encrypts saved login credentials at rest
      scheduler.js      ← node-schedule: loads pending jobs on boot, fires at scheduled time
      browser/          ← Playwright automation, one file per platform (claude.js, chatgpt.js,
                          gemini.js, perplexity.js) — logs in via cookie or password, navigates
                          to the chat, types+sends the prompt, waits for response, returns text
    routes/
      setup.js          ← first-run setup page (generates the server's own API key)
      credentials.js    ← save/delete encrypted login credentials per platform
      schedules.js      ← CRUD for scheduled prompts
  deploy/              ← ready-made configs for Railway, Render, Fly.io, Docker Compose, and
                          written instructions for AWS/GCP/Azure
  README.md, INSTALL.md, SECURITY.md, PUBLISH.md  ← full documentation

android-app/         ← Capacitor project scaffold (source only — NOT a compiled APK)
  www/                ← same UI as the extension, adapted with a "native-bridge.js" that
                        maps chrome.* extension APIs to localStorage/Capacitor equivalents
  README.md            ← exact commands to compile the APK yourself (Gradle CLI, no
                        Android Studio required — just `cd android && ./gradlew assembleDebug`)
```

---

## Authentication / Security Model (Cloud Mode)

- No Google/OAuth login — deliberately, since each server is single-user
- The extension holds an **API key** (`aps-xxxx`) that the user generates once on their own
  server's setup page; this key is hashed (SHA-256) server-side, never stored in plaintext
- The user's AI-platform login (session cookie or email/password) is encrypted with
  **AES-256-GCM** using a secret (`ENCRYPTION_SECRET`) the user sets themselves when deploying
- Full honest threat model is documented in `backend-v2/SECURITY.md` — includes what IS and
  is NOT protected (e.g., if someone steals the `ENCRYPTION_SECRET`, they can decrypt
  everything; this is acknowledged, not hidden)

---

## Known Bugs Fixed So Far (chronological)

1. **Chrome extension permissions require a full remove+reload**, not just clicking the
   refresh icon, whenever `manifest.json` permissions change (this caused a `downloads`
   API "undefined" error until the user did a clean reload)
2. **Inline `onclick="..."` handlers silently fail** in Manifest V3 due to Chrome's default
   Content Security Policy — this caused the "Remove" and "Edit" buttons on schedule list
   items to do nothing. Fixed by switching to `addEventListener` + event delegation.
3. **External CDN icon font failed to load** inside the extension popup (network request
   showed `(failed)` in DevTools) — removed the CDN dependency entirely, replaced with
   inline emoji, making the UI fully self-contained with zero external network calls.
4. **Chat export initially captured only the user's own messages**, not the AI's replies —
   root cause was a fragile CSS-class-name guess for the AI response elements. Fixed by
   using a stable `data-testid="user-message"` selector to locate user turns, then treating
   everything else in the shared parent container as the AI's reply (no guessing needed
   for the AI's side).
5. **That fix caused duplicated/garbled text** ("now i got this / now i got this / 9:30 AM")
   — caused by iterating a container's children individually, which double-counted nested
   elements. Fixed by taking one single `.innerText` read of the whole container instead.
6. **Chrome showed a download-blocked warning banner** — caused by using `data:` URLs for
   `chrome.downloads.download()`, which Chrome's Safe Browsing flags by default. Fixed by
   switching to `Blob` + `URL.createObjectURL()`, the standard safe method.
7. **Export only captured recently-visible messages**, missing older history hidden behind
   a "Load earlier messages" button (Claude.ai lazy-loads older messages). Fixed by having
   the export script auto-click that button repeatedly (and also try scrolling to top) until
   no more historical content loads, before capturing anything.

---

## Known Current Limitations (Honest, Not Yet Fixed)

- **File/image attachments are saved with the schedule but NOT actually uploaded into the AI
  chat** — the browser automation does not yet interact with the platform's file-upload
  button. This is a real, acknowledged gap, not a regression.
- **The chat-export feature scrapes visible page text**, which means it can pick up minor
  UI cruft (button labels like "Show more", auto-generated one-line summaries Claude.ai
  displays above its own full responses). It is reliable for getting the actual conversation
  content, but not pixel-perfect about excluding every UI element.
- **The Android app is a source scaffold only** — the person building this does not have
  Android Studio/SDK access in their working environment, so the final `.apk` has never
  been compiled or tested; instructions are provided for the user to do this themselves.
- **Browser-automation selectors (Playwright, in `backend-v2/src/services/browser/*.js`)
  are best-effort guesses** based on typical patterns for each platform's UI, not verified
  against live pages by the developer. They may need adjustment if login flows fail.

---

## What "Done" Looks Like / Next Possible Steps

- Actually uploading attached files into the AI chat's native file-upload UI (not yet built)
- Verifying/fixing the Playwright selectors in `backend-v2/src/services/browser/*.js`
  against live Claude/ChatGPT/Gemini/Perplexity pages
- Compiling and testing the Android APK
- Optional: re-add speaker labels ("You:" / "Claude:") to the chat-export feature now that
  the underlying capture is stable, if that's still wanted
- Publishing the extension to the Chrome Web Store (steps documented in `PUBLISH.md`)
