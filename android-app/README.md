# AI Prompt Scheduler — Android App

## What this app does, in plain terms

This app is a **remote control** for your own server (the one you set up on
Railway, Render, etc.). It does not type into Claude/ChatGPT on your phone
itself — that part happens on your server, 24/7, whether your phone is
nearby or not.

Your phone app's only jobs:
1. Let you type a prompt and pick a time
2. Send that information to your server
3. Show you the list of what's scheduled and whether it's been sent yet

## What you need before building

1. **Node.js** — https://nodejs.org (only needed on your computer, once, to build the app)
2. **Java JDK 17** — https://adoptium.net/temurin/releases/?version=17
3. Your Cloud server already deployed (see `backend-v2/INSTALL.md`) with its
   URL and API key ready

## How to build the actual installable APK file

Open a terminal in this `android-app` folder and run these commands one at a time:

```bash
npm install
npx cap add android
npx cap sync android
cd android
```

**Windows:**
```powershell
.\gradlew assembleDebug
```

**Mac/Linux:**
```bash
./gradlew assembleDebug
```

The first run downloads some files and takes 5-10 minutes. After that it's fast.

**Your APK will be here:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

Copy that file to your phone (USB cable, email, Google Drive — any way you like)
and tap it to install. Your phone may ask you to allow "install from unknown
sources" — that's normal for apps not from the Play Store, allow it.

## How to use the app once installed

1. Open the app
2. Paste your server URL (e.g. `https://your-app.railway.app`)
3. Paste your API key (starts with `aps-`)
4. Tap **Connect to My Server**
5. Once connected, fill in the schedule form and tap **Schedule Prompt**
6. Check the **Scheduled** list to see status: Pending → Sending → Sent

That's it. Your server does the rest, exactly like the Chrome extension's
Cloud mode does.

## If something doesn't work

| Problem | Likely cause |
|---|---|
| "Wrong API key" | Double-check you copied the whole key, no missing characters |
| "Could not reach the server" | Check your server URL is correct and your phone has internet |
| Schedule stuck on "Pending" forever | Check your server logs — it may be waiting on a usage limit, or your login credentials may need refreshing (see `backend-v2/SECURITY.md`) |
