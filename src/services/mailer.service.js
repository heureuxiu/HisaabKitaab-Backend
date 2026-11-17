// Sends the password-reset code. With RESEND_API_KEY set it emails through Resend (resend.com, free tier).
// Without it the code is printed in the server console, which is enough for local testing.
const { config } = require('../config');

async function sendMail({ to, subject, text }) {
  if (!config.resendApiKey) {
    console.log(`[mail not configured] To: ${to} | ${subject} | ${text}`);
    return { sent: false };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Mail provider said ${res.status}`);
  return { sent: true };
}

module.exports = { sendMail };
