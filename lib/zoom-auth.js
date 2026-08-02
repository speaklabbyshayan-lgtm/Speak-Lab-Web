/**
 * Zoom credentials for the /api endpoints.
 *
 * Two separate Zoom apps are in play and they are easy to confuse:
 *
 *   • Server-to-Server OAuth (ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID /
 *     ZOOM_CLIENT_SECRET) — reads the account's cloud recordings.
 *   • Meeting SDK (ZOOM_SDK_KEY / ZOOM_SDK_SECRET) — signs the JWT that lets a
 *     student join a meeting inside live-class.html instead of being bounced
 *     out to zoom.us.
 *
 * Neither secret may reach the browser, which is the whole reason these live
 * behind serverless functions.
 */

const crypto = require('crypto');

// ── Server-to-Server OAuth ────────────────────────────────────────────────
// api/zoom-recordings.js used to mint a fresh token on every single page load.
// Zoom rate-limits the token endpoint, and the tokens are valid for an hour, so
// a warm instance re-using one is both faster and safer. Per-instance memory,
// like the rate limiter in lib/api-utils.js — worst case is a few extra mints.
let cached = null; // { token, expiresAt }

async function getZoomAccessToken() {
  const accountId    = process.env.ZOOM_ACCOUNT_ID;
  const clientId     = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  const missing = [];
  if (!accountId)    missing.push('ZOOM_ACCOUNT_ID');
  if (!clientId)     missing.push('ZOOM_CLIENT_ID');
  if (!clientSecret) missing.push('ZOOM_CLIENT_SECRET');
  if (missing.length) {
    throw new Error(`Missing Zoom credentials: ${missing.join(', ')}. Set them in the Vercel environment variables.`);
  }

  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const text = await res.text();
  if (!res.ok) {
    // The response body can echo request details, so report the reason only.
    let reason = `HTTP ${res.status}`;
    try { reason = JSON.parse(text)?.reason || JSON.parse(text)?.message || reason; } catch {}
    throw new Error(`Zoom OAuth failed: ${reason}`);
  }

  const data = JSON.parse(text);
  if (!data.access_token) throw new Error('Zoom returned no access_token.');

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return cached.token;
}

// ── Meeting SDK signature ─────────────────────────────────────────────────

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * The HS256 JWT the Meeting SDK exchanges for a seat in the meeting.
 *
 * Hand-rolled rather than pulling in `jsonwebtoken`: it is a fixed header, a
 * fixed payload shape and one HMAC, and this project ships exactly two runtime
 * dependencies.
 *
 * role 0 = attendee. Students never start the meeting — starting one through
 * the SDK needs the host's ZAK token, and the teacher opens it from the Zoom
 * app anyway. An attendee who arrives first simply waits for the host.
 */
function meetingSdkSignature({ meetingNumber, role = 0, expiresInSeconds = 7200 }) {
  const sdkKey    = process.env.ZOOM_SDK_KEY;
  const sdkSecret = process.env.ZOOM_SDK_SECRET;

  const missing = [];
  if (!sdkKey)    missing.push('ZOOM_SDK_KEY');
  if (!sdkSecret) missing.push('ZOOM_SDK_SECRET');
  if (missing.length) {
    throw new Error(`Missing Zoom Meeting SDK credentials: ${missing.join(', ')}. Set them in the Vercel environment variables.`);
  }

  // Backdated 30s so a small clock skew on this instance cannot produce a
  // token Zoom considers issued in the future.
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + expiresInSeconds;

  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    appKey:   sdkKey,
    sdkKey,
    mn:       String(meetingNumber),
    role,
    iat,
    exp,
    tokenExp: exp,
  }));

  const signature = crypto
    .createHmac('sha256', sdkSecret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return { signature: `${header}.${payload}.${signature}`, sdkKey };
}

module.exports = { getZoomAccessToken, meetingSdkSignature };
