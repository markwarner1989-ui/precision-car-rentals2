import express from 'express';
import path from 'path';
import fs from 'fs';
import db from '../lib/db.js';
import { generateAgreementPDF, INITIAL_CLAUSES, AGREEMENTS_DIR } from '../lib/agreement.js';
import { sendEmail } from '../lib/email.js';

const router = express.Router();

// Customer opens their agreement via a tokenized link (no login).
router.get('/:token', (req, res) => {
  const b = db.prepare(`SELECT * FROM bookings WHERE agreement_token = ?`).get(req.params.token);
  if (!b) return res.status(404).json({ error: 'Agreement not found' });
  const car = b.assigned_car_id ? db.prepare(`SELECT * FROM cars WHERE id = ?`).get(b.assigned_car_id) : null;
  res.json({
    reference: b.reference,
    status: b.agreement_status,
    renter: { name: `${b.first_name} ${b.last_name}`, dob: b.dob, address: b.address, phone: b.cell_phone, email: b.email },
    vehicle: car ? { desc: `${car.year} ${car.make} ${car.model} (${car.color})`, vin: car.vin, plate: car.license_plate } : null,
    terms: {
      pickup_at: b.pickup_at, return_at: b.return_at, pickup_location: b.pickup_location,
      delivery_address: b.delivery_address, coverage: b.coverage_label,
      deposit: b.deposit, due_at_pickup: b.due_at_pickup, category: b.category_name,
    },
    clauses: INITIAL_CLAUSES,
    signed_at: b.agreement_signed_at,
  });
});

// Customer submits initials + signature.
router.post('/:token/sign', async (req, res) => {
  const b = db.prepare(`SELECT * FROM bookings WHERE agreement_token = ?`).get(req.params.token);
  if (!b) return res.status(404).json({ error: 'Agreement not found' });
  if (b.agreement_status === 'signed') return res.status(409).json({ error: 'Already signed' });

  const { initials, fullName } = req.body;
  if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'Signature (full name) is required' });
  for (const c of INITIAL_CLAUSES) {
    if (!initials?.[c.key]?.trim()) return res.status(400).json({ error: `Please initial: ${c.text}` });
  }

  const car = b.assigned_car_id ? db.prepare(`SELECT * FROM cars WHERE id = ?`).get(b.assigned_car_id) : null;
  const signedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const filename = await generateAgreementPDF(b, car, { initials, fullName, signedAt });

  db.prepare(`UPDATE bookings SET agreement_status='signed', agreement_signed_at=?, agreement_file=? WHERE id=?`)
    .run(signedAt, filename, b.id);

  // Email the signed copy to the customer.
  try {
    const pdf = fs.readFileSync(path.join(AGREEMENTS_DIR, filename)).toString('base64');
    await sendEmail({
      to: b.email,
      subject: `Signed rental agreement — ${b.reference}`,
      text: `Attached is your signed rental agreement for ${b.reference}. Thank you!`,
      attachments: [{ filename, content: pdf, type: 'application/pdf' }],
    });
  } catch (e) { console.error('agreement email failed', e.message); }

  res.json({ ok: true, message: 'Agreement signed. A copy has been emailed to you.' });
});

export default router;
