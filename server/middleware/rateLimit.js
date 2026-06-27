/**
 * Basic in-memory rate limiter per IP.
 * Replace with Redis-backed limiter for production multi-instance deployments.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - bucket.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
    });
  }

  next();
}
