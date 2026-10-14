const MODE = process.env.SMS_MODE || 'mock';
const TO = process.env.BUSINESS_SMS_TO || '';
const SID = process.env.TWILIO_ACCOUNT_SID || '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const FROM = process.env.TWILIO_FROM || '';

export async function sendSms(to, text) {
  if (MODE === 'mock' || !SID) {
    console.log(`\n📲 [SMS → ${to}]\n   ${text}\n`);
    return { ok: true, mode: 'mock' };
  }
  try {
    const body = new URLSearchParams({ To: to, From: FROM, Body: text });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json();
    return res.ok ? { ok: true, mode: 'live', sid: data.sid } : { ok: false, error: data.message };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export const notifyBusiness = (text) => sendSms(TO, text);
