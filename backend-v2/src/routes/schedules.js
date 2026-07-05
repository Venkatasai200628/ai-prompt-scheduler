const express       = require('express');
const { v4: uuidv4} = require('uuid');
const db            = require('../db');
const { requireApiKey }  = require('../middleware/apiKeyAuth');
const { registerJob, cancelJob } = require('../services/scheduler');

const router = express.Router();

const VALID_PLATFORMS = ['Claude.ai', 'ChatGPT', 'Gemini', 'Perplexity'];

router.get('/', requireApiKey, (req, res) => {
  const rows = db.prepare(`
    SELECT id, platform, chat_url, prompt, scheduled_time,
           status, response_text, error_message, created_at
    FROM schedules ORDER BY scheduled_time DESC LIMIT 50
  `).all();
  res.json({ schedules: rows });
});

router.post('/', requireApiKey, (req, res) => {
  const { platform, chat_url, prompt, scheduled_time } = req.body;

  if (!VALID_PLATFORMS.includes(platform))
    return res.status(400).json({ error: 'Invalid platform' });
  if (!chat_url || !chat_url.startsWith('http'))
    return res.status(400).json({ error: 'Valid chat_url required' });
  if (!prompt?.trim())
    return res.status(400).json({ error: 'prompt required' });
  if (!scheduled_time || scheduled_time <= Date.now())
    return res.status(400).json({ error: 'scheduled_time must be a future timestamp (ms)' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO schedules (id, platform, chat_url, prompt, scheduled_time)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, platform, chat_url, prompt.trim(), scheduled_time);

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  registerJob(schedule);

  res.status(201).json({ schedule });
});

router.delete('/:id', requireApiKey, (req, res) => {
  const result = db.prepare(
    "UPDATE schedules SET status = 'cancelled', updated_at = unixepoch() WHERE id = ? AND status = 'pending'"
  ).run(req.params.id);

  if (result.changes === 0)
    return res.status(404).json({ error: 'Schedule not found or already processed' });

  cancelJob(req.params.id);
  res.json({ message: 'Cancelled' });
});

module.exports = router;
