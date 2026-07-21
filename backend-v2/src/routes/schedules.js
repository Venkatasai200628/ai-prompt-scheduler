const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const { registerJob, cancelJob } = require('../services/scheduler');
const router = express.Router();
const VALID_PLATFORMS = ['Claude.ai', 'ChatGPT', 'Gemini', 'Perplexity'];

router.get('/', requireApiKey, (req, res) => {
  const rows = db.prepare('SELECT id, platform, chat_url, prompt, scheduled_time, status, response_text, error_message, created_at FROM schedules ORDER BY scheduled_time DESC LIMIT 50').all();
  res.json({ schedules: rows });
});

router.post('/', requireApiKey, (req, res) => {
  const platform = req.body.platform, chatUrl = req.body.chat_url, prompt = req.body.prompt, scheduledTime = req.body.scheduled_time;
  if (VALID_PLATFORMS.indexOf(platform) === -1) return res.status(400).json({ error: 'Invalid platform' });
  if (!chatUrl || chatUrl.indexOf('http') !== 0) return res.status(400).json({ error: 'Valid chat_url required' });
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt required' });
  if (!scheduledTime || scheduledTime <= Date.now()) return res.status(400).json({ error: 'scheduled_time must be a future timestamp (ms)' });

  const id = uuidv4();
  db.prepare('INSERT INTO schedules (id, platform, chat_url, prompt, scheduled_time) VALUES (?, ?, ?, ?, ?)').run(id, platform, chatUrl, prompt.trim(), scheduledTime);
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  registerJob(schedule);
  res.status(201).json({ schedule: schedule });
});

router.delete('/:id', requireApiKey, (req, res) => {
  const result = db.prepare("UPDATE schedules SET status = 'cancelled', updated_at = unixepoch() WHERE id = ? AND status = 'pending'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Schedule not found or already processed' });
  cancelJob(req.params.id);
  res.json({ message: 'Cancelled' });
});

module.exports = router;
