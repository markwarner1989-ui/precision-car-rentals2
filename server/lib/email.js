const MODE = process.env.EMAIL_MODE || 'mock';
const KEY = process.env.SENDGRID_API_KEY || '';
const FROM = process.env.EMAIL_FROM || 'reservations@precisioncarrentals.us';

/**
 * Send an email. attachments: [{ filename, content(base64), type }]
 */
export async function sendEmail({ to, subject, text, html, attachments = [] }) {
  if (MODE === 'mock' || !KEY) {
    console.log(`\n📧 [EMAIL → ${to}]\n   Subject: ${subject}\n   ${text || ''}${attachments.length ? `\n   (+${attachments.length} attachment)` : ''}\n`);
    return { ok: true, mode: 'mock' };
  }
  try {
    const body = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM },
      subject,
      content: [{ type: 'text/plain', value: text || '' }, ...(html ? [{ type: 'text/html', value: html }] : [])],
      ...(attachments.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, type: a.type || 'application/pdf', disposition: 'attachment' })) } : {}),
    };
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok ? { ok: true, mode: 'live' } : { ok: false, error: `SendGrid ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export const emailMode = MODE;
