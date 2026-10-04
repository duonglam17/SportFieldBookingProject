const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_FAILURES = 10;

function createLoginRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  maxFailures = DEFAULT_MAX_FAILURES,
  now = Date.now,
} = {}) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error('LOGIN_RATE_LIMIT_WINDOW_MS phải là số nguyên dương.');
  }
  if (!Number.isInteger(maxFailures) || maxFailures <= 0) {
    throw new Error('LOGIN_RATE_LIMIT_MAX_FAILURES phải là số nguyên dương.');
  }

  const failuresByAddress = new Map();

  return function loginRateLimit(req, res, next) {
    const address = req.socket?.remoteAddress || req.ip || 'unknown';
    const cutoff = now() - windowMs;
    if (failuresByAddress.size >= 10000 && !failuresByAddress.has(address)) {
      for (const [knownAddress, timestamps] of failuresByAddress) {
        if (timestamps.every((timestamp) => timestamp <= cutoff)) {
          failuresByAddress.delete(knownAddress);
        }
      }
      if (failuresByAddress.size >= 10000) {
        failuresByAddress.delete(failuresByAddress.keys().next().value);
      }
    }
    const recentFailures = (failuresByAddress.get(address) || []).filter(
      (timestamp) => timestamp > cutoff,
    );

    if (recentFailures.length >= maxFailures) {
      failuresByAddress.set(address, recentFailures);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((recentFailures[0] + windowMs - now()) / 1000),
      );
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        ok: false,
        error: 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.',
      });
      return;
    }

    failuresByAddress.set(address, recentFailures);
    res.once('finish', () => {
      if (res.statusCode === 401) {
        const failures = (failuresByAddress.get(address) || []).filter(
          (timestamp) => timestamp > now() - windowMs,
        );
        failures.push(now());
        failuresByAddress.set(address, failures);
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        failuresByAddress.delete(address);
      }
    });

    next();
  };
}

module.exports = createLoginRateLimiter;
