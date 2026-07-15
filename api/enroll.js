const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL === 'onboarding@resend.dev' ? 'info@speaklabbyshayan.com' : (process.env.RESEND_SENDER_EMAIL || 'info@speaklabbyshayan.com');
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'info@speaklabbyshayan.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { name, whatsapp, email, city, source, batch_preference } = req.body;

    const BATCH_LABELS = {
      weekday: 'Weekday Batch (Mon–Fri), 5:00–6:45 PM',
      weekend: 'Weekend Batch (Sat–Sun), 5:00–6:45 PM',
      flexible: 'Either batch works for them',
    };
    const batchLabel = BATCH_LABELS[batch_preference] || 'Not specified';

    // Email 1: To Owner
    const { error: ownerError } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: OWNER_EMAIL,
      subject: `New Enrollment: ${name} — ${batchLabel.split(',')[0]}`,
      html: `
        <h2>New Enrollment Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>WhatsApp:</strong> ${whatsapp}</p>
        <p><strong>City:</strong> ${city}</p>
        <p><strong>Preferred batch:</strong> ${batchLabel}</p>
        <p><strong>Source:</strong> ${source}</p>
      `
    });

    if (ownerError) {
      throw new Error(`Owner Email Error: ${ownerError.message}`);
    }

    // Email 2: To Student
    const { error: studentError } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: 'Enrollment Confirmed | SpeakLab',
      html: `
        <h2>Hi ${name},</h2>
        <p>Thank you for enrolling in SpeakLab!</p>
        <p>We have successfully received your details. Our team will contact you very soon on your WhatsApp number (<strong>${whatsapp}</strong>) to share the <strong>payment details</strong> and confirm your seat for the batch.</p>
        ${batch_preference ? `<p><strong>Your preferred batch:</strong> ${batchLabel}. We will confirm your final schedule on WhatsApp.</p>` : ''}
        <br/>
        <p>Best regards,<br/>The SpeakLab Team</p>
      `
    });

    if (studentError) {
      console.warn(`Student Email Error: ${studentError.message}`);
      return res.status(200).json({ 
        status: 'partial_success', 
        message: 'Admin email sent, but student email failed',
        student_error: studentError.message,
        sender_used: SENDER_EMAIL
      });
    }

    res.status(200).json({ status: 'success', message: 'Emails sent successfully', sender_used: SENDER_EMAIL });
  } catch (error) {
    console.error('Resend Error (Enroll):', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
}
