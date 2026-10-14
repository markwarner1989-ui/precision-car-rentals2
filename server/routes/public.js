import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import db from '../lib/db.js';
import { quote, isCategoryAvailable, availableCarsInCategory, rentalDays, getInsurance, PICKUP_LOCATIONS, DOC_LABELS } from '../lib/pricing.js';
import { chargeDeposit, paymentMode } from '../lib/payments.js';
import { notifyBusiness } from '../lib/sms.js';
import { sendEmail } from '../lib/email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${nanoid(6)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
});
const upload = multer({
  storage, limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpe?g|png|webp|heic)|application\/pdf/.test(file.mimetype);
    cb(ok ? null : new Error('Only images or PDF allowed'), ok);
  },
});

const catActive = db.prepare(`SELECT * FROM categories WHERE active = 1 ORDER BY sort_order`);
const catById = db.prepare(`SELECT * FROM categories WHERE id = ? AND active = 1`);

router.get('/meta', (req, res) => {
  const insurance = db.prepare(`SELECT code,label,has_own,surcharge_daily,surcharge_target,requires_docs,followup_text,allowed FROM insurance_options ORDER BY sort_order`).all()
    .map((i) => ({ ...i, requires_docs: JSON.parse(i.requires_docs || '[]'), allowed: !!i.allowed, has_own: !!i.has_own }));
  res.json({ paymentMode, pickupLocations: PICKUP_LOCATIONS, insurance, docLabels: DOC_LABELS });
});

// Categories with availability + representative car photos/examples for the dates.
router.get('/categories', (req, res) => {
  const { pickup, return: ret } = req.query;
  const cats = catActive.all().map((c) => {
    let available = true, availableCount = null;
    let sampleCars = db.prepare(`SELECT year,make,model,color,image_url FROM cars WHERE category_id = ? AND active = 1 LIMIT 6`).all(c.id);
    if (pickup && ret) {
      available = isCategoryAvailable(c.id, pickup, ret);
      availableCount = availableCarsInCategory(c.id, pickup, ret).length;
    }
    return {
      id: c.id, name: c.name, example: c.example, description: c.description,
      image_url: c.image_url, daily_rate: c.daily_rate, deposit: c.deposit,
      available, availableCount, sampleCars,
    };
  });
  res.json({ categories: cats });
});

// Two-stage insurance: returns the follow-up text + required docs for a coverage choice.
router.post('/insurance-followup', (req, res) => {
  const { categoryId, pickup, return: ret, coverageCode } = req.body;
  const cat = catById.get(categoryId);
  const ins = getInsurance(coverageCode);
  if (!cat || !ins) return res.status(404).json({ error: 'Not found' });
  const q = quote(cat, pickup, ret, coverageCode);
  res.json({
    allowed: !!ins.allowed,
    followupText: ins.followup_text,
    requiresDocs: JSON.parse(ins.requires_docs || '[]'),
    docLabels: DOC_LABELS,
    quote: q,
  });
});

router.post('/quote', (req, res) => {
  const { categoryId, pickup, return: ret, coverageCode } = req.body;
  const cat = catById.get(categoryId);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  if (rentalDays(pickup, ret) === 0) return res.status(400).json({ error: 'Return must be after pickup' });
  if (!isCategoryAvailable(cat.id, pickup, ret)) return res.status(409).json({ error: 'This category is not available for those dates' });
  try {
    res.json({ category: { id: cat.id, name: cat.name, example: cat.example }, quote: quote(cat, pickup, ret, coverageCode) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/bookings', upload.any(), async (req, res) => {
  try {
    const b = req.body;
    const cat = catById.get(b.categoryId);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    if (!isCategoryAvailable(cat.id, b.pickup, b.return))
      return res.status(409).json({ error: 'This category just became unavailable for those dates' });

    const ins = getInsurance(b.coverageCode);
    if (!ins) return res.status(400).json({ error: 'Invalid insurance selection' });
    if (!ins.allowed) return res.status(400).json({ error: 'That insurance option is not available. Please choose another.' });

    // Validate pickup location
    if (!PICKUP_LOCATIONS[b.pickupLocation]) return res.status(400).json({ error: 'Invalid pickup location' });
    if (b.pickupLocation === 'delivery' && !b.deliveryAddress) return res.status(400).json({ error: 'Delivery address required' });

    // Dynamic doc validation based on coverage
    const requiredDocs = JSON.parse(ins.requires_docs || '[]');
    const files = req.files || [];
    const byField = {};
    for (const f of files) { (byField[f.fieldname] ||= []).push(f); }
    for (const d of requiredDocs) {
      if (!byField[d]?.length) return res.status(400).json({ error: `${DOC_LABELS[d] || d} is required` });
    }

    const q = quote(cat, b.pickup, b.return, b.coverageCode);
    const reference = 'PCR-' + nanoid(8).replace(/-/g, '0').toUpperCase();

    const pay = await chargeDeposit({
      amount: q.deposit, token: b.paymentToken, exp: b.cardExp,
      name: b.billingName || `${b.firstName} ${b.lastName}`, street: b.billingAddress, zip: b.billingZip, reference,
    });
    if (!pay.ok) return res.status(402).json({ error: 'Deposit payment failed: ' + pay.error });

    const id = nanoid(12);
    const licenseFile = byField.license?.[0]?.filename || null;
    const insuranceFiles = requiredDocs.filter((d) => d !== 'license').flatMap((d) => (byField[d] || []).map((f) => f.filename));

    db.prepare(`INSERT INTO bookings (
      id, reference, category_id, category_name, pickup_location, delivery_address, pickup_at, return_at, days,
      first_name, last_name, dob, address, cell_phone, email,
      coverage_code, coverage_label, surcharge_daily,
      daily_rate, rental_subtotal, surcharge_subtotal, deposit, due_at_pickup,
      license_file, insurance_files, billing_name, billing_address, card_last4,
      payment_status, payment_ref, payment_mode, status
    ) VALUES (
      @id,@reference,@category_id,@category_name,@pickup_location,@delivery_address,@pickup_at,@return_at,@days,
      @first_name,@last_name,@dob,@address,@cell_phone,@email,
      @coverage_code,@coverage_label,@surcharge_daily,
      @daily_rate,@rental_subtotal,@surcharge_subtotal,@deposit,@due_at_pickup,
      @license_file,@insurance_files,@billing_name,@billing_address,@card_last4,
      'paid',@payment_ref,@payment_mode,'pending'
    )`).run({
      id, reference, category_id: cat.id, category_name: cat.name,
      pickup_location: b.pickupLocation, delivery_address: b.deliveryAddress || null,
      pickup_at: b.pickup, return_at: b.return, days: q.days,
      first_name: b.firstName, last_name: b.lastName, dob: b.dob, address: b.address, cell_phone: b.cellPhone, email: b.email,
      coverage_code: ins.code, coverage_label: ins.label, surcharge_daily: ins.surcharge_daily,
      daily_rate: cat.daily_rate, rental_subtotal: q.rentalSubtotal, surcharge_subtotal: q.surchargeSubtotal,
      deposit: q.deposit, due_at_pickup: q.dueAtPickup,
      license_file: licenseFile, insurance_files: JSON.stringify(insuranceFiles),
      billing_name: b.billingName || `${b.firstName} ${b.lastName}`, billing_address: b.billingAddress || b.address, card_last4: pay.last4 || '',
      payment_ref: pay.ref, payment_mode: pay.mode,
    });

    const loc = PICKUP_LOCATIONS[b.pickupLocation];
    await notifyBusiness(`New paid booking ${reference} — ${cat.name}, ${b.pickup.slice(0, 10)}→${b.return.slice(0, 10)}, ${b.firstName} ${b.lastName}. Deposit $${q.deposit} paid. Pickup: ${loc}. Card •${pay.last4}. Review in admin.`);
    await sendEmail({
      to: b.email,
      subject: `Reservation received — ${reference}`,
      text: `Thank you for reserving with Precision Car Rentals!\n\nReference: ${reference}\nClass: ${cat.name}\nPickup: ${b.pickup.replace('T',' ')} (${loc})\nReturn: ${b.return.replace('T',' ')}\n\nDeposit paid now: $${q.deposit}\nDue at pickup: $${q.dueAtPickup}\n\nWe will contact you within one hour during business hours to approve your reservation. You can also call or text us at ${process.env.BUSINESS_PHONE || ''}.\n\nA valid driver's license and a debit/credit card showing your name are required at pickup.`,
    });

    res.json({
      ok: true, reference, deposit: q.deposit, dueAtPickup: q.dueAtPickup,
      message: 'Thank you! We will contact you within one hour during business hours to approve your reservation. You can also call or text us. A valid driver\u2019s license and a debit/credit card showing your name are required at pickup.',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Booking failed' });
  }
});

export default router;
