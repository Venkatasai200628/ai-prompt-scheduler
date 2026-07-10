# AI Prompt Scheduler — Android App

This folder contains a **Capacitor** project that wraps the extension logic into a real Android app.

⚠️ **Important — read this first:** I cannot compile the final `.apk` file for you — that requires
Android Studio with the Android SDK installed, which isn't available in this environment.
What I've built is the **complete source project**. Building the APK yourself takes about
10 minutes with free tools. Steps below.

---

## What You Need (all free)

1. **Node.js** — https://nodejs.org (LTS version)
2. **Android Studio** — https://developer.android.com/studio

---

## Build Steps

### 1. Install dependencies
```bash
cd android-app
npm install
```

### 2. Add the Android platform
```bash
npx cap add android
```

### 3. Sync the web code into the Android project
```bash
npx cap sync android
```

### 4. Open in Android Studio
```bash
npx cap open android
```
This launches Android Studio with your project already loaded.

### 5. Build the APK
In Android Studio:
- Wait for Gradle sync to finish (bottom status bar)
- Click **Build** menu → **Build Bundle(s) / APK(s)** → **Build APK(s)**
- When done, click **locate** in the popup notification
- Your APK is at: `android/app/build/outputs/apk/debug/app-debug.apk`

### 6. Install on your phone
- Transfer the APK to your phone (USB, email, Google Drive)
- Tap the file to install (allow "Install from unknown sources" if asked)

---

## What This App Does

Same functionality as the Chrome extension:
- Schedule prompts to Claude, ChatGPT, Gemini, Perplexity
- Fires automatically at the set time — works even if Chrome isn't open
- Uses Android's `AlarmManager` (native scheduling) so it survives phone restarts
- Same dark mode, same data storage approach — nothing leaves your phone in Local mode

## For a signed/release APK (to share with others)

Debug APKs work fine for personal use but show a security warning to others.
For a proper release build:
1. In Android Studio: **Build → Generate Signed Bundle / APK**
2. Create a new keystore (follow the wizard — save the keystore file somewhere safe)
3. Select **APK** → **release** → Finish
4. Output: `android/app/release/app-release.apk`

---

## Build APK WITHOUT Android Studio (command line only)

If you got "Unable to launch Android Studio. Is it installed?" — you don't actually need
Android Studio at all. `npx cap add android` already generated a Gradle wrapper. Just run:

### Windows (PowerShell)
```powershell
cd android
.\gradlew assembleDebug
```

### Mac/Linux
```bash
cd android
./gradlew assembleDebug
```

**Requirement:** Java JDK 17 must be installed first.
- Check if you have it: `java -version`
- If not, download from: https://adoptium.net/temurin/releases/?version=17

First run downloads Gradle dependencies (~5-10 min, one time only). After that it's fast.

**Your APK will be at:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

Transfer that file to your phone and tap to install.

### About the npm warnings you saw
The `tar@6.2.1`, `glob@9.3.5` deprecation warnings and "2 high severity vulnerabilities"
are from Capacitor CLI's own build dependencies (dev-time only tools) — not from your app's
code, and not something an end user of your APK is ever exposed to. Safe to ignore for this
project. Do **not** run `npm audit fix --force` — it can break Capacitor's version pinning.
