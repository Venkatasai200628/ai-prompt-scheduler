function log(level, message, meta) {
  meta = meta || {};
  const safe = JSON.stringify(meta).replace(/(password|cookie|token|key)["']?\s*:\s*["'][^"']{4,}/gi, '$1":"[REDACTED]"');
  console[level === 'error' ? 'error' : 'log']('[' + new Date().toISOString() + '] [' + level.toUpperCase() + '] ' + message, safe === '{}' ? '' : safe);
}
module.exports = {
  info: function (msg, meta) { log('info', msg, meta); },
  warn: function (msg, meta) { log('warn', msg, meta); },
  error: function (msg, meta) { log('error', msg, meta); }
};
