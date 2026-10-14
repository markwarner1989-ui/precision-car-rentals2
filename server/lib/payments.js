const MODE = process.env.PAYMENT_MODE || 'mock';
const API_URL = process.env.CARDKNOX_API_URL || 'https://x1.cardknox.com/gatewayjson';
const API_KEY = process.env.CARDKNOX_API_KEY || '';

/**
 * Charge the fixed deposit. Captures billing name/address + last4 so the business
 * can match the card at pickup (Cardknox itself doesn't surface the name).
 */
export async function chargeDeposit({ amount, token, exp, name, street, zip, reference }) {
  if (MODE === 'mock') {
    if (token && String(token).toLowerCase().includes('decline'))
      return { ok: false, mode: 'mock', error: 'Card declined (mock)' };
    const last4 = (String(token).replace(/\D/g, '').slice(-4)) || '4242';
    return { ok: true, mode: 'mock', ref: 'MOCK-' + Math.random().toString(36).slice(2, 10).toUpperCase(), last4 };
  }

  if (!API_KEY) return { ok: false, mode: 'live', error: 'CARDKNOX_API_KEY not configured' };

  const payload = {
    xKey: API_KEY, xVersion: '5.0.0', xSoftwareName: 'PrecisionCarRentals', xSoftwareVersion: '2.0',
    xCommand: 'cc:sale', xAmount: Number(amount).toFixed(2),
    xCardNum: token, xExp: exp || '', xName: name || '',
    xStreet: street || '', xZip: zip || '', xInvoice: reference || '',
    xDescription: 'Car rental deposit',
  };
  try {
    const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.xResult === 'A')
      return { ok: true, mode: 'live', ref: data.xRefNum, last4: data.xMaskedCardNumber ? data.xMaskedCardNumber.slice(-4) : '', raw: data };
    return { ok: false, mode: 'live', error: data.xError || `Payment ${data.xResult}`, raw: data };
  } catch (err) {
    return { ok: false, mode: 'live', error: err.message };
  }
}

export const paymentMode = MODE;
