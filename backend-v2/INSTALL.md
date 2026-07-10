# Installation Guide — AI Prompt Scheduler

Everything you need to set up all three parts: the Chrome extension, your own cloud server,
and the Android app.

---

## Part 1 — Chrome Extension (Local Mode)

1. Unzip the project — find the `extension` folder
2. Open Chrome → go to `chrome://extensions`
3. Toggle **Developer mode** ON (top right)
4. Click **Load unpacked** → select the `extension` folder
5. Pin the ⏰ icon to your toolbar (puzzle piece icon → pin)

**Test it:**
1. Open any Claude.ai / ChatGPT / Gemini chat
2. Click the ⏰ icon → Local tab
3. Click "📋 Tab" to grab the current chat URL
4. Type a prompt, set a time 2 minutes out, click Schedule
5. Wait — it should fire automatically

---

## Part 2 — Cloud Server (works even when laptop is off)

### Choose a provider (all have free tiers except DigitalOcean)

| Provider | Best for | Setup time |
|---|---|---|
| Railway | Easiest, recommended for most people | 5 min |
| Render | Also easy, sleeps when idle on free tier | 5 min |
| Fly.io | More reliable free tier, needs terminal | 10 min |
| DigitalOcean | Most reliable, $5/month | 10 min |
| AWS/GCP/Azure | Full control, advanced users | 30+ min |
| Your own VPS | Cheapest long-term, full control | 20 min |

### Railway (recommended path)

1. Push the `backend-v2` folder to a GitHub repo (see GITHUB_STEPS.md)
2. Go to https://railway.app → sign in with GitHub
3. New Project → Deploy from GitHub repo → select your repo
4. Click **Variables** → **Add Variable**:
   - Name: `ENCRYPTION_SECRET`
   - Value: generate one at https://generate-secret.vercel.app/64
5. Click **Deploy** — wait ~3 minutes
6. Click **Settings** → **Domains** → **Generate Domain**
7. Open that URL in your browser
8. Enter your name → click **Generate My API Key**
9. **Copy and save the key** — shown only once, starts with `aps-`

### Connect the extension to your server

1. Open extension → **Cloud** tab
2. Choose your provider from the grid
3. Paste your server URL and API key
4. Click **Connect**
5. Add your login credentials (session cookie or email/password) for each AI platform
6. Schedule prompts — they now work 24/7 regardless of your laptop

**How to get a session cookie:**
1. Open claude.ai (or chatgpt.com etc.) while logged in
2. Press `F12` → **Application** tab → **Cookies** → click the site domain
3. Find `__Secure-next-auth.session-token` → copy its Value
4. Paste into the extension's credential form

---

## Part 3 — Android App

The `android-app` folder contains a Capacitor project. I cannot compile the final `.apk`
myself (requires Android Studio + Android SDK, not available in this environment), but
building it yourself takes about 10 minutes.

### Requirements
- Node.js (https://nodejs.org)
- Android Studio (https://developer.android.com/studio)

### Steps
```bash
cd android-app
npm install
npx cap add android
npx cap sync android
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to finish
2. **Build** menu → **Build Bundle(s)/APK(s)** → **Build APK(s)**
3. Click **locate** in the notification that appears
4. Find your APK at `android/app/build/outputs/apk/debug/app-debug.apk`
5. Transfer it to your phone and tap to install (allow "unknown sources" if prompted)

**For a shareable release build** (not just personal debug use):
- Android Studio → **Build → Generate Signed Bundle/APK** → follow the wizard to create a keystore
- Output: `android/app/release/app-release.apk`

### Alternative — Kiwi Browser (no build needed, works today)

If you don't want to build an APK right now, install **Kiwi Browser** from the Play Store —
it's a Chrome-based browser that runs Chrome extensions directly:

1. Install Kiwi Browser (free, Play Store)
2. Open Kiwi → `chrome://extensions` → Developer Mode ON
3. Load Unpacked → select the `extension` folder (transfer via Google Drive/USB)
4. Works identically to desktop — schedules fire from your phone

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Extension doesn't fire at scheduled time | Make sure Chrome isn't fully closed — sleeping laptop is fine, powered off is not (Local mode only — use Cloud mode to fix this) |
| "Remove" button doesn't respond | Update to the latest version — earlier versions had a Chrome CSP bug, now fixed |
| Server shows 401 Unauthorized | Double check you copied the full API key, no extra spaces |
| Credentials fail / limit banner appears | Session cookie may have expired — get a fresh one from your browser |
| APK won't install on phone | Enable "Install from unknown sources" in Android settings |

For anything else, open an issue on the GitHub repo.
