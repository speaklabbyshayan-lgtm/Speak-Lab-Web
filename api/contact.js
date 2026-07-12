const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'info@speaklabbyshayan.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { name, email, whatsapp, message } = req.body;

    // Email 1: To Owner
    await resend.emails.send({
      from: SENDER_EMAIL,
      to: OWNER_EMAIL,
      subject: `New Contact from ${name}`,
      html: `
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>WhatsApp:</strong> ${whatsapp}</p>
        <p><strong>Message:</strong><br/>${message}</p>
      `
    });

    // Email 2: To Student
    await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: 'We received your message! | SpeakLab',
      html: `
        <h2>Hi ${name},</h2>
        <p>Thank you for reaching out to SpeakLab!</p>
        <p>We have received your message and will get back to you shortly on WhatsApp or Email.</p>
        <br/>
        <p>Best regards,<br/>The SpeakLab Team</p>
      `
    });

    res.status(200).json({ status: 'success', message: 'Emails sent successfully' });
  } catch (error) {
    console.error('Resend Error (Contact):', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
}
