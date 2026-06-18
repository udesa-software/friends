const { logger } = require('./logger');

const SKIP_PATHS = new Set(['/health', '/healthcheck', '/favicon.ico']);

function httpLogger(req, res, next) {
  if (SKIP_PATHS.has(req.path)) return next();

  const start = Date.now();

  req.log = logger.child({
    request_id: req.headers['x-request-id'] ?? undefined,
  });

  res.on('finish', () => {
    const duration_ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    req.log[level](
      {
        method: req.method,
        path: req.route?.path ?? req.path,
        status: res.statusCode,
        duration_ms,
      },
      `${res.statusCode} ${req.method} ${req.path}`,
    );
  });

  next();
}

module.exports = { httpLogger };
