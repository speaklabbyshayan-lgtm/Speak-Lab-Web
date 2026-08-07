const { Resend } = require('resend');
const { rateLimited, clientIp, escapeHtml, isEmail, cleanText } = require('../lib/api-utils.js');

/**
 * SpeakLab Saturdays — application intake.
 *
 * Deliberately separate from /api/contact: a Saturdays application has no
 * required email address (the whole funnel runs on WhatsApp), so folding it
 * into the contact handler would mean loosening that endpoint's validation
 * for every other form that shares it.
 */

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL === 'onboarding@resend.dev'
  ? 'info@speaklabbyshayan.com'
  : (process.env.RESEND_SENDER_EMAIL || 'info@speaklabbyshayan.com');
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'info@speaklabbyshayan.com';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gwyowayzhdnmueferjpn.supabase.co';
// Same anon key the browser already downloads in supabase-config.js. RLS
// limits it to inserting contact_submissions — same as the public site does.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eW93YXl6aGRubXVlZmVyanBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjg1OTEsImV4cCI6MjA5ODc0NDU5MX0.mnGOG4aINIEToivKCcNWXlSlKaI9WzaOQBBBukNc5E0';

/**
 * Land the application in contact_submissions so it appears in the admin
 * panel's messages list. Best-effort: a database hiccup must not cost the
 * applicant their submission, so failures are logged and the email still
 * goes out.
 */
async function saveSubmission({ name, email, whatsapp, message }) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/contact_submissions`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ full_name: name, email, whatsapp, message }),
    });
    if (!r.ok) console.warn('saturday application insert failed:', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.warn('saturday application insert failed:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Unauthenticated endpoint that sends mail — without a cap it doubles as a
  // spam relay wearing SpeakLab's sender domain.
  if (rateLimited(`saturday:${clientIp(req)}`, { max: 5 })) {
    return res.status(429).json({ status: 'error', message: 'Too many applications from this connection. Please wait a minute and try again.' });
  }

  try {
    const body = req.body || {};

    // Every value below is interpolated into email HTML, so escape them all.
    const name = escapeHtml(cleanText(body.full_name, 100));
    const age = escapeHtml(cleanText(body.age, 20));
    const whatsapp = escapeHtml(cleanText(body.whatsapp, 30));
    const instagram = escapeHtml(cleanText(body.instagram, 60));
    const occupation = escapeHtml(cleanText(body.occupation, 120));
    const institute = escapeHtml(cleanText(body.institute, 120));
    const describesYou = escapeHtml(cleanText(body.describes_you, 60));
    const why = escapeHtml(cleanText(body.why, 1200));
    const soundsLike = escapeHtml(cleanText(body.sounds_like, 120));
    const anythingElse = escapeHtml(cleanText(body.anything_else, 1200));
    const session = escapeHtml(cleanText(body.session, 120));
    const source = escapeHtml(cleanText(body.source, 60));

    // Not escaped: this one goes in a mail header and a database column, not
    // into HTML, and it has to stay a valid address.
    const rawEmail = cleanText(body.email, 200).toLowerCase();
    const email = isEmail(rawEmail) ? rawEmail : '';

    // Phone is the only channel that always exists, so it is the only hard
    // requirement besides a name.
    const digits = whatsapp.replace(/[^0-9]/g, '');
    if (!name || digits.length < 10) {
      return res.status(400).json({ status: 'error', message: 'Please give us your name and a WhatsApp number we can reach you on.' });
    }
    if (!why) {
      return res.status(400).json({ status: 'error', message: 'Please tell us briefly why you want to join.' });
    }
    if (rawEmail && !email) {
      return res.status(400).json({ status: 'error', message: 'That email address does not look right.' });
    }

    const sessionLabel = session || 'Next Saturday';

    await saveSubmission({
      name,
      email,
      whatsapp,
      message: [
        `SATURDAYS APPLICATION — ${sessionLabel}`,
        `Age: ${age || 'not given'} · ${describesYou || 'category not given'}`,
        `Occupation: ${occupation || 'not given'}${institute ? ` @ ${institute}` : ''}`,
        instagram ? `Instagram: ${instagram}` : '',
        `Why: ${why}`,
        soundsLike ? `Sounds like: ${soundsLike}` : '',
        anythingElse ? `Also: ${anythingElse}` : '',
        `Source: ${source || 'saturdays-page'}`,
      ].filter(Boolean).join(' | '),
    });

    // ── Owner notification ────────────────────────────────────────────
    // Reviewing applications is a scanning job done on a phone, so the
    // decision-relevant answers come first and the contact details follow.
    const { error: ownerError } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: OWNER_EMAIL,
      subject: `Saturdays application: ${name} — ${sessionLabel}`,
      html: `
        <h2>New SpeakLab Saturdays application</h2>
        <p><strong>Session:</strong> ${sessionLabel}</p>
        <hr/>
        <p><strong>Why they want to join</strong><br/>${why.replace(/\n/g, '<br/>')}</p>
        <p><strong>Sounds most like them:</strong> ${soundsLike || 'Not answered'}</p>
        ${anythingElse ? `<p><strong>Anything else</strong><br/>${anythingElse.replace(/\n/g, '<br/>')}</p>` : ''}
        <hr/>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Age:</strong> ${age || 'Not given'}</p>
        <p><strong>WhatsApp:</strong> ${whatsapp}</p>
        <p><strong>Email:</strong> ${email ? escapeHtml(email) : 'Not given'}</p>
        <p><strong>Instagram:</strong> ${instagram || 'Not given'}</p>
        <p><strong>Occupation:</strong> ${occupation || 'Not given'}</p>
        <p><strong>University / Company:</strong> ${institute || 'Not given'}</p>
        <p><strong>Describes themselves as:</strong> ${describesYou || 'Not answered'}</p>
        <p><strong>Source:</strong> ${source || 'saturdays-page'}</p>
      `,
    });

    if (ownerError) {
      throw new Error(`Owner Email Error: ${ownerError.message}`);
    }

    // ── Applicant confirmation ────────────────────────────────────────
    // Optional, because email is optional on the form. A failure here must
    // not fail the request — the application is already recorded and the
    // real confirmation happens on WhatsApp.
    if (email) {
      try {
        await resend.emails.send({
          from: SENDER_EMAIL,
          to: email,
          subject: 'Application received | SpeakLab Saturdays',
          html: `
            <h2>Hi ${name},</h2>
            <p>Your application for <strong>SpeakLab Saturdays</strong> has been received.</p>
            <p>Our experiences are intentionally kept small, so not everyone who applies is confirmed. We'll review your application and contact you on WhatsApp shortly if you're selected.</p>
            <p><strong>What happens next</strong></p>
            <ol>
              <li>We read your answers — every application is reviewed individually.</li>
              <li>Selected applicants get a WhatsApp message with the venue and exact timing.</li>
              <li>Payment comes last, only once you're accepted.</li>
            </ol>
            <p>Keep your phone with you — seats fill quickly once a session is announced.</p>
            <br/>
            <p>— Team SpeakLab<br/>Think. Speak. Connect.</p>
          `,
        });
      } catch (e) {
        console.warn('applicant confirmation email failed:', e.message);
      }
    }

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('saturday-apply error:', error);
    return res.status(500).json({ status: 'error', message: 'Something went wrong on our side. Please try again, or message us on WhatsApp.' });
  }
}
