/**
 * Shared helpers for the serverless functions.
 *
 * Every /api endpoint is unauthenticated and either spends money (LLM calls)
 * or sends email to a caller-chosen address. Each one therefore needs the
 * same three defenses — rate limiting, input validation, and HTML escaping —
 * and this repo's history shows what happens when the same code is pasted
 * into three files: it gets fixed in one and rots in the others. One copy.
 */

// ── Rate limiting ──────────────────────────────────────────────────────────
// Per-instance memory, so it is a speed bump rather than a lock — Vercel may
// run several instances and evicts this on cold start. It stops casual abuse
// at zero cost and with no new dependency. If an endpoint gets seriously
// targeted, move to Upstash Redis.
const buckets = new Map();

function rateLimited(key, { windowMs = 60_000, max = 12 } = {}) {
  const now = Date.now();
  const seen = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  seen.push(now);
  buckets.set(key, seen);

  // Keep the map from growing without bound across a warm instance's life.
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) {
      if (!times.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }

  return seen.length > max;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim() || 'unknown';
}

// ── Input handling ─────────────────────────────────────────────────────────

/**
 * Escape a value for interpolation into email/notification HTML.
 * The contact and enroll emails used to inline raw form input, so a message
 * containing markup would render as markup in the owner's inbox.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Trim to a string with a hard length cap; never throws on odd input. */
function cleanText(value, maxLen = 500) {
  return String(value ?? '').trim().slice(0, maxLen);
}

module.exports = { rateLimited, clientIp, escapeHtml, isEmail, cleanText };
