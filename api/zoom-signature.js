const { requirePaidStudent, supabaseRest } = require('../lib/supabase-auth.js');
const { meetingSdkSignature } = require('../lib/zoom-auth.js');
const { rateLimited, clientIp } = require('../lib/api-utils.js');

// How far either side of a class the join door is open. Early enough that
// students can settle in before the teacher starts, late enough that someone
// whose internet dropped mid-class can get back in.
const EARLY_JOIN_MINUTES = 15;
const LATE_JOIN_MINUTES  = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hands a student the credentials to join one specific live class inside
 * live-class.html, via the Zoom Meeting SDK.
 *
 * Everything here has to be server-side: the SDK secret signs the JWT, and the
 * checks around it (paid, right batch, right time) are the only thing standing
 * between a meeting number and the open internet. The page's own countdown is
 * cosmetic — this endpoint is the gate.
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // A signature is a meeting credential. Cheap to mint, so cap it rather than
  // let one account hand out seats in bulk.
  if (rateLimited(`zoom-signature:${clientIp(req)}`, { max: 20 })) {
    return res.status(429).json({ success: false, message: 'Too many join attempts. Please wait a minute.' });
  }

  const gate = await requirePaidStudent(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ success: false, message: gate.message });
  }
  const { user } = gate;

  const classId = String(req.body?.classId || '').trim();
  if (!UUID_RE.test(classId)) {
    return res.status(400).json({ success: false, message: 'No class selected.' });
  }

  try {
    // Read the class as the student. live_classes_select_paid then enforces the
    // batch rule for us — a weekday student asking for a weekend class id gets
    // zero rows back, which is indistinguishable from the class not existing.
    const lookup = await supabaseRest(
      `live_classes?id=eq.${classId}&select=id,topic,starts_at,duration_minutes,status,zoom_meeting_number,zoom_passcode`,
      { token: user.token }
    );

    if (!lookup.ok) {
      console.error('[Zoom] Class lookup failed:', lookup.status, await lookup.text());
      return res.status(503).json({ success: false, message: 'Could not load this class. Please try again.' });
    }

    const [liveClass] = await lookup.json();
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'This class is not available for your batch.' });
    }
    if (liveClass.status === 'cancelled') {
      return res.status(409).json({ success: false, message: 'This class has been cancelled.' });
    }

    // ── Join window ────────────────────────────────────────────────────────
    const startsAt = new Date(liveClass.starts_at).getTime();
    const opensAt  = startsAt - EARLY_JOIN_MINUTES * 60_000;
    const closesAt = startsAt + (Number(liveClass.duration_minutes) || 90) * 60_000 + LATE_JOIN_MINUTES * 60_000;
    const now      = Date.now();

    if (now < opensAt) {
      return res.status(409).json({
        success: false,
        code: 'too_early',
        message: `This class opens ${EARLY_JOIN_MINUTES} minutes before it starts.`,
        opens_at: new Date(opensAt).toISOString(),
      });
    }
    if (now > closesAt) {
      return res.status(409).json({
        success: false,
        code: 'ended',
        message: 'This class has ended. The recording will appear below once Zoom has processed it.',
      });
    }

    // ── Signature ──────────────────────────────────────────────────────────
    const { signature, sdkKey } = meetingSdkSignature({
      meetingNumber: String(liveClass.zoom_meeting_number).replace(/\D/g, ''),
    });

    // ── Attendance ─────────────────────────────────────────────────────────
    // Best-effort and deliberately after the signature: attendance is a
    // reporting nicety, and a database hiccup must never keep a student who
    // paid out of their class. The unique index makes the repeat presses that
    // a dropped call produces collapse into one row.
    try {
      const mark = await supabaseRest('class_attendance?on_conflict=class_id,student_id', {
        token: user.token,
        method: 'POST',
        body: { class_id: classId, student_id: user.id },
        prefer: 'resolution=ignore-duplicates,return=minimal',
      });
      if (!mark.ok) console.warn('[Zoom] Attendance not recorded:', mark.status, await mark.text());
    } catch (e) {
      console.warn('[Zoom] Attendance not recorded:', e.message);
    }

    return res.status(200).json({
      success:       true,
      signature,
      sdkKey,
      meetingNumber: String(liveClass.zoom_meeting_number).replace(/\D/g, ''),
      passcode:      liveClass.zoom_passcode || '',
      topic:         liveClass.topic,
      userName:      user.name || (user.email || 'Student').split('@')[0],
      userEmail:     user.email,
    });
  } catch (error) {
    console.error('[Zoom] Signature failed:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}
