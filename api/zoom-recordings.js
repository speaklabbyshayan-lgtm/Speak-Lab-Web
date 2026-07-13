export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
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

    console.log('[Zoom] Token obtained. Token type:', tokenData.token_type, 'Expires in:', tokenData.expires_in);

    // ── 3. Get Host User ID ───────────────────────────────────────────────────
    // Strategy: try /users first; if 401/403, fall back to /users/me
    let hostUserId = null;
    let hostEmail  = null;

    // Attempt A: List users (requires user:read:admin scope)
    const usersResponse = await fetch('https://api.zoom.us/v2/users?status=active&page_size=5', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const usersText = await usersResponse.text();
    console.log('[Zoom] Users API status:', usersResponse.status);
    console.log('[Zoom] Users API body:', usersText);

    if (usersResponse.ok) {
      const usersData = JSON.parse(usersText);
      if (usersData.users && usersData.users.length > 0) {
        hostUserId = usersData.users[0].id;
        hostEmail  = usersData.users[0].email;
        console.log('[Zoom] Host user found via /users:', hostEmail, '| ID:', hostUserId);
      }
    } else {
      // Attempt B: Use /users/me (requires user:read scope only)
      console.log('[Zoom] /users failed, trying /users/me fallback...');
      const meResponse = await fetch('https://api.zoom.us/v2/users/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      const meText = await meResponse.text();
      console.log('[Zoom] /users/me status:', meResponse.status);
      console.log('[Zoom] /users/me body:', meText);

      if (meResponse.ok) {
        const meData = JSON.parse(meText);
        hostUserId = meData.id;
        hostEmail  = meData.email;
        console.log('[Zoom] Host user found via /users/me:', hostEmail, '| ID:', hostUserId);
      } else {
        let errDetail = meText;
        try { errDetail = JSON.parse(meText)?.message || meText; } catch {}
        throw new Error(
          `Cannot fetch Zoom user (${meResponse.status}): ${errDetail}. ` +
          `Make sure your Server-to-Server OAuth app has "user:read" or "user:read:admin" scope and is ACTIVATED.`
        );
      }
    }

    if (!hostUserId) {
      return res.status(200).json({
        success: true,
        recordings: [],
        message: 'No active users found on this Zoom account.'
      });
    }

    // ── 4. Fetch Recordings ───────────────────────────────────────────────────
    // Zoom allows max 1 month per request. We'll make 2 requests: last month + month before.
    const today    = new Date();
    const oneMonth = new Date(); oneMonth.setMonth(today.getMonth() - 1);
    const twoMonth = new Date(); twoMonth.setMonth(today.getMonth() - 2);

    const fmt = (d) => d.toISOString().split('T')[0];

    console.log('[Zoom] Fetching recordings for user:', hostUserId);

    const [recResp1, recResp2] = await Promise.all([
      fetch(`https://api.zoom.us/v2/users/${hostUserId}/recordings?from=${fmt(oneMonth)}&to=${fmt(today)}&page_size=100`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }),
      fetch(`https://api.zoom.us/v2/users/${hostUserId}/recordings?from=${fmt(twoMonth)}&to=${fmt(oneMonth)}&page_size=100`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }),
    ]);

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

    return res.status(200).json({ success: true, recordings: cleanRecordings });

  } catch (error) {
    console.error('[Zoom] Fatal error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
