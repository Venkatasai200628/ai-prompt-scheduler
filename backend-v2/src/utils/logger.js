function log(level, message, meta = {}) {
  // Strip any values that look like credentials before logging
  const safe = JSON.stringify(meta).replace(/(password|cookie|token|key)["']?\s*:\s*["'][^"']{4,}/gi, '$1": "[REDACTED]"');
  console[level === 'error' ? 'error' : 'log'](`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`, safe === '{}' ? '' : safe);
}

module.exports = {
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta)
};
