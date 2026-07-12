const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'info@speaklabbyshayan.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { name, whatsapp, email, city, source } = req.body;

    // Email 1: To Owner
    await resend.emails.send({
      from: SENDER_EMAIL,
      to: OWNER_EMAIL,
      subject: `New Enrollment Request from ${name}`,
      html: `
        <h2>New Enrollment Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>WhatsApp:</strong> ${whatsapp}</p>
        <p><strong>City:</strong> ${city}</p>
        <p><strong>Source:</strong> ${source}</p>
      `
    });

    // Email 2: To Student
    await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: 'Enrollment Confirmed | SpeakLab',
      html: `
        <h2>Hi ${name},</h2>
        <p>Thank you for enrolling in SpeakLab!</p>
        <p>We have successfully received your details. Our team will contact you very soon on your WhatsApp number (<strong>${whatsapp}</strong>) to share the <strong>payment details</strong> and confirm your seat for the batch.</p>
        <br/>
        <p>Best regards,<br/>The SpeakLab Team</p>
      `
    });

    res.status(200).json({ status: 'success', message: 'Emails sent successfully' });
  } catch (error) {
    console.error('Resend Error (Enroll):', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
}
