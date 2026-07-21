const express = require('express');
const db = require('../db');
const { hashApiKey, generateApiKey } = require('../services/encryption');
const router = express.Router();

router.get('/', (req, res) => {
  const isSetup = !!db.prepare("SELECT value FROM config WHERE key = 'api_key_hash'").get();
  if (isSetup) {
    return res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AI Scheduler Server</title>' +
      '<style>body{font-family:-apple-system,sans-serif;max-width:500px;margin:60px auto;padding:20px}h1{color:#0f766e}.ok{color:#059669;font-weight:bold}.box{background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin-top:20px}a{color:#0f766e}</style>' +
      '</head><body><h1>AI Prompt Scheduler</h1><p class="ok">Server is running and set up correctly.</p>' +
      '<div class="box"><p>Visit <a href="/dashboard">/dashboard</a> on your phone or computer to schedule prompts.</p>' +
      '<p>Add this server URL in the Chrome extension under Cloud mode, or bookmark /dashboard on your phone.</p></div></body></html>');
  }
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Setup</title>' +
    '<style>*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;background:#f0fdfa}' +
    'h1{color:#0f766e}.card{background:#fff;border-radius:12px;padding:24px;border:1px solid #99f6e4}' +
    'input{width:100%;padding:10px;border:1.5px solid #99f6e4;border-radius:8px;font-size:14px;margin-bottom:12px}' +
    'button{width:100%;padding:12px;background:#0f766e;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}' +
    '#result{display:none;margin-top:20px;background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:16px}' +
    '#apiKey{font-family:monospace;font-size:12px;word-break:break-all;background:#fff;padding:10px;border-radius:6px}</style></head><body>' +
    '<h1>AI Prompt Scheduler — Setup</h1><div class="card"><input type="text" id="name" placeholder="Your name">' +
    '<button onclick="setup()">Generate My API Key</button></div>' +
    '<div id="result"><h3>Setup complete! Copy your API key:</h3><div id="apiKey"></div>' +
    '<p style="font-size:12px;color:#b45309;margin-top:8px">Save this — it will not be shown again.</p></div>' +
    '<script>async function setup(){const name=document.getElementById("name").value||"User";' +
    'const res=await fetch("/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});' +
    'const data=await res.json();if(data.api_key){document.getElementById("result").style.display="block";' +
    'document.getElementById("apiKey").textContent=data.api_key;}}</script></body></html>');
});

router.post('/setup', express.json(), (req, res) => {
  const existing = db.prepare("SELECT value FROM config WHERE key = 'api_key_hash'").get();
  if (existing) return res.status(400).json({ error: 'Server already set up' });
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const name = ((req.body && req.body.name) || 'User').slice(0, 50);
  db.prepare("INSERT INTO config (key, value) VALUES ('api_key_hash', ?)").run(keyHash);
  db.prepare("INSERT INTO config (key, value) VALUES ('owner_name', ?)").run(name);
  res.json({ api_key: apiKey, message: 'Save this key — it will not be shown again.' });
});

module.exports = router;
