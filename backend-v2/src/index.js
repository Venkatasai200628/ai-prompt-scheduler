require('dotenv').config();

const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const path     = require('path');
const rateLimit = require('express-rate-limit');
const { initScheduler } = require('./services/scheduler');
const logger   = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false // dashboard page needs to run its own inline-free JS/CSS from same origin; keep simple for a personal single-user server
}));
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// ── Mobile dashboard — visit this on any phone's browser, no app needed ──────
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
app.use('/dashboard', express.static(path.join(__dirname, '../public')));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/',             require('./routes/setup'));       // first-time setup page (root URL)
app.use('/credentials',  require('./routes/credentials'));
app.use('/schedules',    require('./routes/schedules'));

app.get('/health', (req, res) => {
  const isSetup = require('./db').prepare("SELECT value FROM config WHERE key = 'api_key_hash'").get();
  res.json({ status: 'ok', setup: !!isSetup, timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { message: err.message });
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, async () => {
  logger.info(`Server started on port ${PORT}`);
  logger.info(`Mobile dashboard available at: (your server URL)/dashboard`);
  initScheduler();
});
