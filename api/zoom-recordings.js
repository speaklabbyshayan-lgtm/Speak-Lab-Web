const { requirePaidStudent } = require('../lib/supabase-auth.js');
const { getZoomAccessToken } = require('../lib/zoom-auth.js');

// Zoom caps a recordings query at one month, so "the course so far" takes two.
const MONTHS_BACK = 2;

/**
 * The class recordings feed for live-class.html.
 *
 * Recordings are paid course content, so the caller must present a valid
 * Supabase session *and* have an enrollment that is paid or partially paid.
 * Verified server-side — the page gate alone would be decoration, since anyone
 * could call this endpoint directly.
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const gate = await requirePaidStudent(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ success: false, message: gate.message });
  }

  try {
    const accessToken = await getZoomAccessToken();

    // In Server-to-Server OAuth, "me" is the account owner — the teacher whose
    // account hosts every SpeakLab class.
    const today = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];

    const windows = [];
    for (let i = 0; i < MONTHS_BACK; i++) {
      const to   = new Date(today); to.setMonth(today.getMonth() - i);
      const from = new Date(today); from.setMonth(today.getMonth() - (i + 1));
      windows.push([fmt(from), fmt(to)]);
    }

    const responses = await Promise.all(
      windows.map(([from, to]) =>
        fetch(`https://api.zoom.us/v2/users/me/recordings?from=${from}&to=${to}&page_size=100`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      )
    );

    let allMeetings = [];
    for (const r of responses) {
      if (!r.ok) {
        console.warn('[Zoom] Recordings window failed:', r.status);
        continue;
      }
      const data = await r.json();
      if (data.meetings) allMeetings = allMeetings.concat(data.meetings);
    }

    const recordings = allMeetings
      .filter((m) => m.share_url) // Only meetings that have a shareable URL
      .map((meeting) => ({
        id:            meeting.uuid,
        topic:         meeting.topic || 'SpeakLab Session',
        start_time:    meeting.start_time,
        duration:      meeting.duration,
        play_url:      meeting.share_url,
      }))
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

    return res.status(200).json({ success: true, recordings });
  } catch (error) {
    console.error('[Zoom] Recordings failed:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}
