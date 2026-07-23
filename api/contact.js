const { Resend } = require('resend');
const { rateLimited, clientIp, escapeHtml, isEmail, cleanText } = require('../lib/api-utils.js');

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'info@speaklabbyshayan.com';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gwyowayzhdnmueferjpn.supabase.co';
// Same anon key the browser already downloads in supabase-config.js. RLS
// limits it to inserting contact_submissions — same as the public site does.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eW93YXl6aGRubXVlZmVyanBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjg1OTEsImV4cCI6MjA5ODc0NDU5MX0.mnGOG4aINIEToivKCcNWXlSlKaI9WzaOQBBBukNc5E0';

/**
 * Record the submission in contact_submissions so it shows up in the admin
 * panel's messages list alongside regular contact messages. Best-effort: a
 * database hiccup must not cost the student their booking, so failures are
 * logged and the emails still go out.
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
    if (!r.ok) console.warn('contact_submissions insert failed:', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.warn('contact_submissions insert failed:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Unauthenticated endpoint that emails a caller-chosen address — without a
  // limit it doubles as a spam relay wearing SpeakLab's sender domain.
  if (rateLimited(`contact:${clientIp(req)}`, { max: 5 })) {
    return res.status(429).json({ status: 'error', message: 'Too many messages. Please wait a minute and try again.' });
  }

  try {
    const body = req.body || {};

    // Everything below lands inside email HTML, so everything gets escaped.
    const name = escapeHtml(cleanText(body.name, 100));
    const email = cleanText(body.email, 200).toLowerCase();
    const whatsapp = escapeHtml(cleanText(body.whatsapp, 30));
    const message = escapeHtml(cleanText(body.message, 2000));
    const batch = escapeHtml(cleanText(body.batch_preference, 60));

    // 'trial' marks a Free Trial Classes booking; anything else is a plain
    // contact message. Server-side branch — the subject line is never
    // caller-controlled.
    const isTrial = body.type === 'trial';

    if (!name || !isEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'A name and a valid email are required.' });
    }
    if (!isTrial && !message) {
      return res.status(400).json({ status: 'error', message: 'Please write a message.' });
    }

    // Trial bookings land in the admin panel's messages list too, not just
    // the inbox. The escaped values are stored — they render inside admin
    // HTML, so this is the safe form there as well.
    if (isTrial) {
      await saveSubmission({
        name, email, whatsapp,
        message: `FREE TRIAL CLASSES booking — preferred batch: ${batch || 'not specified'}${message ? ` — note: ${message}` : ''}`,
      });
    }

    // Email 1: To Owner
    const { error: ownerError } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: OWNER_EMAIL,
      subject: isTrial
        ? `Free Trial booking: ${name}`
        : `New Contact from ${name}`,
      html: isTrial
        ? `
        <h2>New Free Trial Classes Booking</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>WhatsApp:</strong> ${whatsapp}</p>
        <p><strong>Preferred batch:</strong> ${batch || 'Not specified'}</p>
        ${message ? `<p><strong>Note:</strong><br/>${message}</p>` : ''}
        <p>Reply on WhatsApp to schedule their 3 trial classes.</p>
      `
        : `
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>WhatsApp:</strong> ${whatsapp}</p>
        <p><strong>Message:</strong><br/>${message}</p>
      `
    });

    if (ownerError) {
      throw new Error(`Owner Email Error: ${ownerError.message}`);
    }

    // Email 2: To Student
    const { error: studentError } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: isTrial
        ? 'Your Free Trial Classes | SpeakLab'
        : 'We received your message! | SpeakLab',
      html: isTrial
        ? `
        <h2>Hi ${name},</h2>
        <p>Great decision — your <strong>Free Trial Classes</strong> request is confirmed on our side.</p>
        <p>You are welcome to attend <strong>3 full classes at no cost</strong> before deciding about the program. Our team will contact you on WhatsApp (<strong>${whatsapp || 'the number you provided'}</strong>) within 24 hours to schedule your first class.</p>
        <p>Venue: Punjab Tianjin University of Technology, Lahore &middot; 7:00&ndash;8:30 PM</p>
        <br/>
        <p>Best regards,<br/>The SpeakLab Team</p>
      `
        : `
        <h2>Hi ${name},</h2>
        <p>Thank you for reaching out to SpeakLab!</p>
        <p>We have received your message and will get back to you shortly on WhatsApp or Email.</p>
        <br/>
        <p>Best regards,<br/>The SpeakLab Team</p>
      `
    });

    if (studentError) {
      console.warn(`Student Email Error: ${studentError.message}`);
    }

    res.status(200).json({ status: 'success', message: 'Emails sent successfully' });
  } catch (error) {
    console.error('Resend Error (Contact):', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
}
