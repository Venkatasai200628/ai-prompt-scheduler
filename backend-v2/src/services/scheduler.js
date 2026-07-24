const nodeSchedule = require('node-schedule');
const db = require('../db');
const { sendScheduledPrompt } = require('./browser');
const { getCredentials } = require('../routes/credentials');
const logger = require('../utils/logger');

const PLATFORM_KEY = { 'Claude.ai': 'claude', 'ChatGPT': 'chatgpt', 'Gemini': 'gemini', 'Perplexity': 'perplexity' };
const activeJobs = new Map();

function initScheduler() {
  const pending = db.prepare("SELECT * FROM schedules WHERE status = 'pending' AND scheduled_time > ?").all(Date.now());
  logger.info('Scheduler: loading ' + pending.length + ' pending schedules');
  pending.forEach(registerJob);
}

function registerJob(schedule) {
  cancelJob(schedule.id);
  const fireAt = new Date(schedule.scheduled_time);
  if (fireAt <= new Date()) return;
  const job = nodeSchedule.scheduleJob(schedule.id, fireAt, function () {
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
  logger.info('Executing schedule', { scheduleId: scheduleId });
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
  if (!schedule) return;
  if (schedule.status !== 'pending' && schedule.status !== 'waiting_limit') return;
  db.prepare("UPDATE schedules SET status = 'running', updated_at = unixepoch() WHERE id = ?").run(scheduleId);

  const RETRY_DELAY_MIN = 10;
  const MAX_RETRIES = 6;
  const retryCount = schedule.retry_count || 0;

  try {
    const platformKey = PLATFORM_KEY[schedule.platform];
    const creds = getCredentials(platformKey);
    if (!creds) throw new Error('No credentials saved for ' + schedule.platform + '. Add them via the dashboard.');
    const responseText = await sendScheduledPrompt(schedule, creds);
    db.prepare("UPDATE schedules SET status = 'sent', response_text = ?, updated_at = unixepoch() WHERE id = ?").run(responseText.slice(0, 1000), scheduleId);
    logger.info('Schedule completed', { scheduleId: scheduleId });

  } catch (err) {
    // Usage limit hit — same behavior as the Chrome extension's Local mode:
    // wait 10 minutes and retry automatically, up to 6 times (~1 hour total),
    // before giving up. This was previously ONLY implemented in the extension,
    // not here — that's the gap that's now fixed.
    if (err.message === 'USAGE_LIMIT_ACTIVE') {
      if (retryCount < MAX_RETRIES) {
        const nextRetryCount = retryCount + 1;
        db.prepare("UPDATE schedules SET status = 'waiting_limit', error_message = ?, retry_count = ?, updated_at = unixepoch() WHERE id = ?")
          .run('Limit active — retry ' + nextRetryCount + '/' + MAX_RETRIES, nextRetryCount, scheduleId);
        logger.info('Limit active, scheduling retry', { scheduleId: scheduleId, retry: nextRetryCount });

        const retryTime = new Date(Date.now() + RETRY_DELAY_MIN * 60000);
        nodeSchedule.scheduleJob(scheduleId + '-retry-' + nextRetryCount, retryTime, function () {
          executeSchedule(scheduleId);
        });
      } else {
        db.prepare("UPDATE schedules SET status = 'failed', error_message = ?, updated_at = unixepoch() WHERE id = ?")
          .run('Gave up after ' + MAX_RETRIES + ' retries — limit never cleared.', scheduleId);
        logger.error('Gave up after max retries', { scheduleId: scheduleId });
      }
      return;
    }

    logger.error('Schedule failed', { scheduleId: scheduleId, error: err.message });
    db.prepare("UPDATE schedules SET status = 'failed', error_message = ?, updated_at = unixepoch() WHERE id = ?").run(err.message, scheduleId);
  }
}

module.exports = { initScheduler: initScheduler, registerJob: registerJob, cancelJob: cancelJob };
