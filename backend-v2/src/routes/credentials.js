const express          = require('express');
const db               = require('../db');
const { encrypt, decrypt } = require('../services/encryption');
const { requireApiKey }    = require('../middleware/apiKeyAuth');

const router = express.Router();

const PLATFORMS = ['claude', 'chatgpt', 'gemini', 'perplexity'];

// ─── GET /credentials — List which platforms have credentials saved ────────────
router.get('/', requireApiKey, (req, res) => {
  const rows = db.prepare(
    'SELECT platform, auth_type, created_at FROM credentials'
  ).all();
  // Never return encrypted_data — only metadata
  res.json({ credentials: rows });
});

// ─── POST /credentials — Save credentials for a platform ─────────────────────
router.post('/', requireApiKey, (req, res) => {
  const { platform, auth_type, data } = req.body;

  if (!PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${PLATFORMS.join(', ')}` });
  }
  if (!['cookie', 'password'].includes(auth_type)) {
    return res.status(400).json({ error: 'auth_type must be "cookie" or "password"' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'data object is required' });
  }

  // Validate required fields
  if (auth_type === 'cookie' && !data.cookie) {
    return res.status(400).json({ error: 'cookie field is required for auth_type "cookie"' });
  }
  if (auth_type === 'password' && (!data.email || !data.password)) {
    return res.status(400).json({ error: 'email and password fields required for auth_type "password"' });
  }

  // Encrypt the credential data as a JSON blob
  const encryptedData = encrypt(JSON.stringify(data));
  const now           = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO credentials (platform, auth_type, encrypted_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (platform) DO UPDATE SET
      auth_type      = excluded.auth_type,
      encrypted_data = excluded.encrypted_data,
      updated_at     = excluded.updated_at
  `).run(platform, auth_type, encryptedData, now, now);

  res.json({ message: `Credentials saved for ${platform}` });
});

// ─── DELETE /credentials/:platform — Remove credentials ──────────────────────
router.delete('/:platform', requireApiKey, (req, res) => {
  const { platform } = req.params;
  if (!PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  const result = db.prepare('DELETE FROM credentials WHERE platform = ?').run(platform);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'No credentials found for this platform' });
  }

  res.json({ message: `Credentials removed for ${platform}` });
});

// ─── Internal helper: get decrypted credentials for a platform ────────────────
function getCredentials(platform) {
  const row = db.prepare('SELECT auth_type, encrypted_data FROM credentials WHERE platform = ?').get(platform);
  if (!row) return null;

  const data = JSON.parse(decrypt(row.encrypted_data));
  return { auth_type: row.auth_type, data };
}

module.exports = router;
module.exports.getCredentials = getCredentials;
