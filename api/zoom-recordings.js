const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gwyowayzhdnmueferjpn.supabase.co';
// Same anon key the browser already downloads in supabase-config.js — it leaks
// nothing new and lets this endpoint validate sessions with no extra env setup.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eW93YXl6aGRubXVlZmVyanBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjg1OTEsImV4cCI6MjA5ODc0NDU5MX0.mnGOG4aINIEToivKCcNWXlSlKaI9WzaOQBBBukNc5E0';

/**
 * Recordings are paid course content, so the caller must present a valid
 * Supabase session token. Verified server-side — the page gate alone would be
 * decoration, since anyone could call this endpoint directly.
 */
async function isValidStudent(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return false;

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    return r.ok;
  } catch (e) {
    console.error('[Zoom] Session check failed:', e.message);
    return false;
  }
}

export default async function handler(req, res) {
  // Same-origin only — the old wildcard CORS invited any site to embed the
  // recordings feed.
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!(await isValidStudent(req))) {
    return res.status(401).json({ success: false, message: 'Please sign in to view class recordings.' });
  }

  // ── 1. Validate environment variables ─────────────────────────────────────
  const zoomAccountId    = process.env.ZOOM_ACCOUNT_ID;
  const zoomClientId     = process.env.ZOOM_CLIENT_ID;
  const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;

  console.log('[Zoom] Env check:', {
    hasAccountId:    !!zoomAccountId,
    accountIdLength: zoomAccountId?.length,
    hasClientId:     !!zoomClientId,
    clientIdLength:  zoomClientId?.length,
    hasSecret:       !!zoomClientSecret,
    secretLength:    zoomClientSecret?.length,
  });

  if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
    const missing = [];
    if (!zoomAccountId)    missing.push('ZOOM_ACCOUNT_ID');
    if (!zoomClientId)     missing.push('ZOOM_CLIENT_ID');
    if (!zoomClientSecret) missing.push('ZOOM_CLIENT_SECRET');
    console.error('[Zoom] Missing env vars:', missing.join(', '));
    return res.status(500).json({
      success: false,
      message: `Missing Zoom credentials: ${missing.join(', ')}. Please set them in Vercel environment variables.`
    });
  }

  try {
    // ── 2. Get Access Token (Server-to-Server OAuth) ──────────────────────────
    const credentials = Buffer.from(`${zoomClientId}:${zoomClientSecret}`).toString('base64');
    const tokenUrl    = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(zoomAccountId)}`;

    console.log('[Zoom] Requesting token from:', tokenUrl.replace(zoomAccountId, '***'));

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokenText = await tokenResponse.text();
    console.log('[Zoom] Token response status:', tokenResponse.status);
    console.log('[Zoom] Token response body:', tokenText);

    if (!tokenResponse.ok) {
      let errDetail = tokenText;
      try { errDetail = JSON.parse(tokenText)?.reason || JSON.parse(tokenText)?.message || tokenText; } catch {}
      throw new Error(`Zoom OAuth failed (${tokenResponse.status}): ${errDetail}`);
    }

    const tokenData   = JSON.parse(tokenText);
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error(`No access_token in Zoom response: ${tokenText}`);
    }

    // ── 3. Fetch Recordings for "me" ──────────────────────────────────────────
    // In Server-to-Server OAuth, "me" refers to the account owner.
    const hostUserId = 'me';

    console.log('[Zoom] Fetching recordings for user:', hostUserId);

    // Zoom allows max 1 month per request. We'll make 2 requests: last month + month before.
    const today    = new Date();
    const oneMonth = new Date(); oneMonth.setMonth(today.getMonth() - 1);
    const twoMonth = new Date(); twoMonth.setMonth(today.getMonth() - 2);

    const fmt = (d) => d.toISOString().split('T')[0];

    const [recResp1, recResp2, liveResp] = await Promise.all([
      fetch(`https://api.zoom.us/v2/users/${hostUserId}/recordings?from=${fmt(oneMonth)}&to=${fmt(today)}&page_size=100`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }),
      fetch(`https://api.zoom.us/v2/users/${hostUserId}/recordings?from=${fmt(twoMonth)}&to=${fmt(oneMonth)}&page_size=100`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }),
      // Live-class.js reads active_meeting_url for the "Join Live" button —
      // which never worked because this field was never returned.
      fetch(`https://api.zoom.us/v2/users/${hostUserId}/meetings?type=live&page_size=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }),
    ]);

    let activeMeetingUrl = null;
    try {
      if (liveResp.ok) {
        const live = await liveResp.json();
        activeMeetingUrl = live?.meetings?.[0]?.join_url || null;
        if (activeMeetingUrl) console.log('[Zoom] Live meeting in progress.');
      }
    } catch (e) {
      console.warn('[Zoom] Live meeting lookup failed:', e.message);
    }

    const [recText1, recText2] = await Promise.all([recResp1.text(), recResp2.text()]);
    console.log('[Zoom] Recordings (recent) status:', recResp1.status);
    console.log('[Zoom] Recordings (older) status:', recResp2.status);

    let allMeetings = [];

    if (recResp1.ok) {
      const d = JSON.parse(recText1);
      if (d.meetings) allMeetings = allMeetings.concat(d.meetings);
    } else {
      console.warn('[Zoom] Recent recordings failed:', recText1);
    }

    if (recResp2.ok) {
      const d = JSON.parse(recText2);
      if (d.meetings) allMeetings = allMeetings.concat(d.meetings);
    } else {
      console.warn('[Zoom] Older recordings failed:', recText2);
    }

    console.log('[Zoom] Total meetings found:', allMeetings.length);

    if (allMeetings.length === 0) {
      return res.status(200).json({
        success: true,
        recordings: [],
        active_meeting_url: activeMeetingUrl,
        message: 'No recordings found in the last 2 months.'
      });
    }

    // ── 5. Process & Return ───────────────────────────────────────────────────
    const cleanRecordings = allMeetings
      .filter(m => m.share_url) // Only meetings that have a shareable URL
      .map(meeting => ({
        id:            meeting.uuid,
        topic:         meeting.topic || 'SpeakLab Session',
        start_time:    meeting.start_time,
        duration:      meeting.duration,
        play_url:      meeting.share_url,
        thumbnail_url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?q=80&w=600&auto=format&fit=crop',
      }));

    // Newest first
    cleanRecordings.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

    console.log('[Zoom] Returning', cleanRecordings.length, 'recordings.');

    return res.status(200).json({ success: true, recordings: cleanRecordings, active_meeting_url: activeMeetingUrl });

  } catch (error) {
    console.error('[Zoom] Fatal error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
