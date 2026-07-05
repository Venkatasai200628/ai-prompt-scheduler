const express          = require('express');
const db               = require('../db');
const { hashApiKey, generateApiKey } = require('../services/encryption');

const router = express.Router();

// ─── GET / — Show setup page or status page ───────────────────────────────────
router.get('/', (req, res) => {
  const isSetup = !!db.prepare("SELECT value FROM config WHERE key = 'api_key_hash'").get();

  if (isSetup) {
    return res.send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>AI Scheduler Server</title>
      <style>
        body { font-family: -apple-system, sans-serif; max-width: 500px; margin: 60px auto; padding: 20px; }
        h1 { color: #7c3aed; } .ok { color: #059669; font-weight: bold; }
        .box { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 16px; margin-top: 20px; }
      </style></head><body>
      <h1>⏰ AI Prompt Scheduler</h1>
      <p class="ok">✅ Server is running and set up correctly.</p>
      <div class="box">
        <p>Your server is ready. Add this server URL in the Chrome extension under Cloud mode.</p>
        <p>If you lost your API key, redeploy the server with a fresh <code>ENCRYPTION_SECRET</code>.</p>
      </div>
      </body></html>
    `);
  }

  // Not set up — show setup form
  res.send(`
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Setup — AI Scheduler</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, sans-serif; max-width: 480px; margin: 60px auto; padding: 20px; background: #f5f3ff; }
      h1 { color: #7c3aed; margin-bottom: 4px; }
      p  { color: #6d28d9; font-size: 14px; }
      .card { background: white; border-radius: 12px; padding: 24px; border: 1px solid #ddd6fe; }
      .field { margin-bottom: 16px; }
      label { display: block; font-size: 13px; font-weight: 600; color: #4c1d95; margin-bottom: 5px; }
      input { width: 100%; padding: 10px; border: 1.5px solid #ddd6fe; border-radius: 8px; font-size: 13px; outline: none; }
      input:focus { border-color: #7c3aed; }
      button { width: 100%; padding: 12px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
      .hint { font-size: 11px; color: #a78bfa; margin-top: 4px; }
      #result { display: none; margin-top: 20px; background: #d1fae5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 16px; }
      #result h3 { color: #065f46; margin: 0 0 8px; }
      #apiKey { font-family: monospace; font-size: 12px; word-break: break-all; background: white; padding: 10px; border-radius: 6px; border: 1px solid #6ee7b7; }
      .warn { color: #b45309; font-size: 12px; margin-top: 8px; }
    </style>
    </head><body>
    <h1>⏰ AI Prompt Scheduler</h1>
    <p>First-time setup — takes 30 seconds.</p>
    <div class="card">
      <div class="field">
        <label>Your Name (just for display)</label>
        <input type="text" id="name" placeholder="e.g. Alex">
      </div>
      <button onclick="setup()">Generate My API Key →</button>
    </div>
    <div id="result">
      <h3>✅ Setup complete! Copy your API key:</h3>
      <div id="apiKey"></div>
      <p class="warn">⚠️ Save this key somewhere safe — it won't be shown again.</p>
      <p style="font-size:12px;color:#065f46;margin-top:12px;">
        Now open the Chrome extension → Cloud Mode → paste your server URL and this API key.
      </p>
    </div>
    <script>
      async function setup() {
        const name = document.getElementById('name').value || 'User';
        const res  = await fetch('/setup', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.api_key) {
          document.getElementById('result').style.display = 'block';
          document.getElementById('apiKey').textContent   = data.api_key;
        }
      }
    </script>
    </body></html>
  `);
});

// ─── POST /setup — Generate and store API key ─────────────────────────────────
router.post('/setup', express.json(), (req, res) => {
  // Only allow if not already set up
  const existing = db.prepare("SELECT value FROM config WHERE key = 'api_key_hash'").get();
  if (existing) {
    return res.status(400).json({ error: 'Server already set up' });
  }

  const apiKey    = generateApiKey();
  const keyHash   = hashApiKey(apiKey);
  const name      = (req.body?.name || 'User').slice(0, 50);

  db.prepare("INSERT INTO config (key, value) VALUES ('api_key_hash', ?)").run(keyHash);
  db.prepare("INSERT INTO config (key, value) VALUES ('owner_name', ?)").run(name);
  db.prepare("INSERT INTO config (key, value) VALUES ('setup_at', ?)").run(Date.now().toString());

  // Return the raw key ONCE — never stored, only the hash is kept
  res.json({ api_key: apiKey, message: 'Save this key — it will not be shown again.' });
});

module.exports = router;
