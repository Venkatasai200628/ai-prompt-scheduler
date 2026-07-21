const express = require('express');
const db = require('../db');
const { encrypt, decrypt } = require('../services/encryption');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const router = express.Router();
const PLATFORMS = ['claude', 'chatgpt', 'gemini', 'perplexity'];

router.get('/', requireApiKey, (req, res) => {
  const rows = db.prepare('SELECT platform, auth_type, created_at FROM credentials').all();
  res.json({ credentials: rows });
});

router.post('/', requireApiKey, (req, res) => {
  const platform = req.body.platform, authType = req.body.auth_type, data = req.body.data;
  if (PLATFORMS.indexOf(platform) === -1) return res.status(400).json({ error: 'platform must be one of: ' + PLATFORMS.join(', ') });
  if (['cookie', 'password'].indexOf(authType) === -1) return res.status(400).json({ error: 'auth_type must be "cookie" or "password"' });
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object is required' });
  if (authType === 'cookie' && !data.cookie) return res.status(400).json({ error: 'cookie field is required' });
  if (authType === 'password' && (!data.email || !data.password)) return res.status(400).json({ error: 'email and password required' });

  const encryptedData = encrypt(JSON.stringify(data));
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO credentials (platform, auth_type, encrypted_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT (platform) DO UPDATE SET auth_type=excluded.auth_type, encrypted_data=excluded.encrypted_data, updated_at=excluded.updated_at')
    .run(platform, authType, encryptedData, now, now);
  res.json({ message: 'Credentials saved for ' + platform });
});

router.delete('/:platform', requireApiKey, (req, res) => {
  const platform = req.params.platform;
  if (PLATFORMS.indexOf(platform) === -1) return res.status(400).json({ error: 'Invalid platform' });
  const result = db.prepare('DELETE FROM credentials WHERE platform = ?').run(platform);
  if (result.changes === 0) return res.status(404).json({ error: 'No credentials found' });
  res.json({ message: 'Credentials removed for ' + platform });
});

function getCredentials(platform) {
  const row = db.prepare('SELECT auth_type, encrypted_data FROM credentials WHERE platform = ?').get(platform);
  if (!row) return null;
  return { auth_type: row.auth_type, data: JSON.parse(decrypt(row.encrypted_data)) };
}

module.exports = router;
module.exports.getCredentials = getCredentials;
