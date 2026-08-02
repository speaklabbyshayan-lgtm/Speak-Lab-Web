/**
 * Server-side Supabase session checks for the /api endpoints.
 *
 * Lifted out of api/zoom-recordings.js, which was the only endpoint that had
 * any authentication at all — and it only asked "is this a real Supabase
 * user?", so a brand-new signup with no enrollment could read every paid
 * recording. Two endpoints need the check now, and the paid test is the part
 * that must not rot in one copy while being fixed in the other.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gwyowayzhdnmueferjpn.supabase.co';
// Same anon key the browser already downloads in supabase-config.js — it leaks
// nothing new and lets these endpoints validate sessions with no extra env
// setup. Every query below is sent with the caller's own token on top, so RLS
// still applies exactly as it does in the browser.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eW93YXl6aGRubXVlZmVyanBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjg1OTEsImV4cCI6MjA5ODc0NDU5MX0.mnGOG4aINIEToivKCcNWXlSlKaI9WzaOQBBBukNc5E0';

function bearerToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

/**
 * Resolve the caller's Supabase user, or null if the token is missing/invalid.
 * The token is returned alongside so callers can make follow-up queries *as
 * that user* rather than as the service role — RLS then does the authorisation
 * work instead of hand-written filters.
 */
async function getUser(req) {
  const token = bearerToken(req);
  if (!token) return null;

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;

    const user = await r.json();
    if (!user?.id) return null;

    return {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      token,
    };
  } catch (e) {
    console.error('[auth] Session check failed:', e.message);
    return null;
  }
}

/** PostgREST call made as the caller, so their RLS policies apply. */
async function supabaseRest(path, { token, method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;

  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Gate for paid course content — live classes and recordings.
 *
 * Returns { ok: true, user } or { ok: false, status, message }; callers turn
 * that straight into a response. 401 and 403 are kept distinct on purpose: the
 * page redirects to login on 401, but showing an unpaid student the login
 * screen again would be a loop, so 403 has to say "enrol" instead.
 */
async function requirePaidStudent(req) {
  const user = await getUser(req);
  if (!user) {
    return { ok: false, status: 401, message: 'Please sign in to access your classes.' };
  }

  try {
    // enrollments_select_own (supabase-enrollment-upgrade.sql) already limits
    // this to the caller's own rows; the filter is belt-and-braces.
    const r = await supabaseRest(
      `enrollments?student_id=eq.${user.id}&select=payment_status`,
      { token: user.token }
    );

    if (!r.ok) {
      console.error('[auth] Enrollment lookup failed:', r.status, await r.text());
      return { ok: false, status: 503, message: 'Could not verify your enrollment. Please try again.' };
    }

    const rows = await r.json();
    const paid = Array.isArray(rows) && rows.some((row) => row.payment_status === 'paid' || row.payment_status === 'partial');

    if (!paid) {
      return {
        ok: false,
        status: 403,
        message: 'Live classes and recordings are for enrolled students. Complete your enrollment to get access.',
      };
    }

    return { ok: true, user };
  } catch (e) {
    console.error('[auth] Paid check failed:', e.message);
    return { ok: false, status: 503, message: 'Could not verify your enrollment. Please try again.' };
  }
}

module.exports = { SUPABASE_URL, SUPABASE_ANON_KEY, bearerToken, getUser, supabaseRest, requirePaidStudent };
