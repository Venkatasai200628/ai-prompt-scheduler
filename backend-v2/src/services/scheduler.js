const nodeSchedule  = require('node-schedule');
const db            = require('../db');
const { sendScheduledPrompt } = require('./browser');
const { getCredentials }      = require('../routes/credentials');
const logger        = require('../utils/logger');

const PLATFORM_KEY  = {
  'Claude.ai':  'claude',
  'ChatGPT':    'chatgpt',
  'Gemini':     'gemini',
  'Perplexity': 'perplexity'
};

const activeJobs = new Map();

/** Call this on server start to reload all pending schedules */
function initScheduler() {
  const pending = db.prepare(
    "SELECT * FROM schedules WHERE status = 'pending' AND scheduled_time > ?"
  ).all(Date.now());

  logger.info(`Scheduler: loading ${pending.length} pending schedules`);
  pending.forEach(registerJob);
}

function registerJob(schedule) {
  cancelJob(schedule.id);

  const fireAt = new Date(schedule.scheduled_time);
  if (fireAt <= new Date()) return;

  const job = nodeSchedule.scheduleJob(schedule.id, fireAt, () => {
    executeSchedule(schedule.id);
    activeJobs.delete(schedule.id);
  });

  if (job) activeJobs.set(schedule.id, job);
}

function cancelJob(id) {
  const job = activeJobs.get(id);
  if (job) { job.cancel(); activeJobs.delete(id); }
}

async function executeSchedule(scheduleId) {
  logger.info('Executing schedule', { scheduleId });

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
  if (!schedule || schedule.status !== 'pending') return;

  // Mark running immediately
  db.prepare("UPDATE schedules SET status = 'running', updated_at = unixepoch() WHERE id = ?")
    .run(scheduleId);

  try {
    const platformKey = PLATFORM_KEY[schedule.platform];
    const creds       = getCredentials(platformKey);

    if (!creds) throw new Error(`No credentials saved for ${schedule.platform}. Add them in the extension.`);

    const responseText = await sendScheduledPrompt(schedule, creds);

    db.prepare(`
      UPDATE schedules
      SET status = 'sent', response_text = ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(responseText.slice(0, 1000), scheduleId);

    logger.info('Schedule completed', { scheduleId });

  } catch (err) {
    logger.error('Schedule failed', { scheduleId, error: err.message });
    db.prepare(`
      UPDATE schedules
      SET status = 'failed', error_message = ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(err.message, scheduleId);
  }
}

module.exports = { initScheduler, registerJob, cancelJob };
