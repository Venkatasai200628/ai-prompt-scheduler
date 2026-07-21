const crypto = require('crypto');
const SECRET = process.env.ENCRYPTION_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('ENCRYPTION_SECRET must be at least 32 characters. Set it in your .env file.');
}
const ENCRYPTION_KEY = crypto.scryptSync(SECRET, 'ai-scheduler-salt', 32);
const ALGO = 'aes-256-gcm';

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, ENCRYPTION_KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}
function decrypt(blob) {
  const parts = blob.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const data = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ALGO, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
function hashApiKey(key) { return crypto.createHash('sha256').update(key).digest('hex'); }
function generateApiKey() { return 'aps-' + crypto.randomBytes(32).toString('hex'); }
module.exports = { encrypt, decrypt, hashApiKey, generateApiKey };
