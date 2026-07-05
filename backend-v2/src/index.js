require('dotenv').config();

const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const rateLimit = require('express-rate-limit');
const { initScheduler } = require('./services/scheduler');
const logger   = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors()); // User's own server, open to their extension
app.use(express.json({ limit: '50kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// Routes
app.use('/',             require('./routes/setup'));
app.use('/credentials',  require('./routes/credentials'));
app.use('/schedules',    require('./routes/schedules'));

// Health check (no auth — used by extension to test connection)
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
  initScheduler();
});
