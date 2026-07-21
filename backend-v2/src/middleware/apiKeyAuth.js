const db = require('../db');
const { hashApiKey } = require('../services/encryption');
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'Missing X-API-Key header' });
  const stored = db.prepare("SELECT value FROM config WHERE key = 'api_key_hash'").get();
  if (!stored) return res.status(503).json({ error: 'Server not set up yet. Open the server URL to complete setup.' });
  if (hashApiKey(key) !== stored.value) return res.status(401).json({ error: 'Invalid API key' });
  next();
}
module.exports = { requireApiKey };
