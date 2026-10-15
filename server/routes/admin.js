import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import db from '../lib/db.js';
import { signAdmin, requireAdmin } from '../lib/auth.js';
import { availableCarsInCategory, rentalDays } from '../lib/pricing.js';
import { sendEmail } from '../lib/email.js';
import { refund } from '../lib/payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
const carPhoto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { try { fs.mkdirSync(uploadsDir, { recursive: true }); cb(null, uploadsDir); } catch (e) { cb(e); } },
    filename: (req, file, cb) => cb(null, `car-${Date.now()}-${nanoid(6)}-${(file.originalname || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, (file.mimetype || '').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(file.originalname || '')),
});

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD)
    return res.json({ token: signAdmin(email), email });
  res.status(401).json({ error: 'Invalid credentials' });
});

router.use(requireAdmin);

/* ── bookings ── */
router.get('/bookings', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare(`SELECT * FROM bookings WHERE status = ? ORDER BY created_at DESC`).all(status)
    : db.prepare(`SELECT * FROM bookings ORDER BY created_at DESC`).all();
  res.json({ bookings: rows.map(shape) });
});

router.get('/bookings/:id', (req, res) => {
  const b = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json({ booking: shape(b) });
});

// Which specific cars are free for this booking's dates (to assign at approval).
router.get('/bookings/:id/available-cars', (req, res) => {
  const b = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json({ cars: availableCarsInCategory(b.category_id, b.pickup_at, b.return_at) });
});

// Approve: assign a specific car, generate agreement token, email the sign link.
router.post('/bookings/:id/approve', async (req, res) => {
  const { assignedCarId, notes } = req.body;
  const b = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  if (!assignedCarId) return res.status(400).json({ error: 'Please assign a specific vehicle before approving.' });
  const car = db.prepare(`SELECT * FROM cars WHERE id = ?`).get(assignedCarId);
  if (!car) return res.status(404).json({ error: 'Car not found' });

  const token = nanoid(24);
  db.prepare(`UPDATE bookings SET status='approved', assigned_car_id=?, admin_notes=?, agreement_status='sent', agreement_token=? WHERE id=?`)
    .run(assignedCarId, notes || null, token, b.id);

  const base = process.env.PUBLIC_URL || 'http://localhost:4000';
  const signUrl = `${base}/sign/${token}`;
  await sendEmail({
    to: b.email,
    subject: `Reservation approved — please sign your rental agreement (${b.reference})`,
    text: `Good news! Your reservation ${b.reference} is approved.\n\nYour vehicle: ${car.year} ${car.make} ${car.model} (${car.color})\n\nPlease review and sign your rental agreement here:\n${signUrl}\n\nA copy will be emailed to you once signed.`,
  });

  res.json({ ok: true, signUrl });
});

router.post('/bookings/:id/decline', (req, res) => {
  const info = db.prepare(`UPDATE bookings SET status='declined', admin_notes=? WHERE id=?`).run(req.body.notes || null, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

/* ── categories ── */
router.get('/categories', (req, res) => res.json({ categories: db.prepare(`SELECT * FROM categories ORDER BY sort_order`).all() }));
router.put('/categories/:id', (req, res) => {
  const { name, example, description, image_url, daily_rate, deposit, sort_order, active } = req.body;
  db.prepare(`UPDATE categories SET name=?,example=?,description=?,image_url=?,daily_rate=?,deposit=?,sort_order=?,active=? WHERE id=?`)
    .run(name, example, description, image_url, daily_rate, deposit, sort_order || 0, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
// Lightweight pricing update — only the daily rate and deposit for a class.
router.patch('/categories/:id/pricing', (req, res) => {
  const daily = Number(req.body.daily_rate);
  const dep = Number(req.body.deposit);
  if (!Number.isFinite(daily) || !Number.isFinite(dep) || daily < 0 || dep < 0)
    return res.status(400).json({ error: 'Daily rate and deposit must be positive numbers' });
  const info = db.prepare(`UPDATE categories SET daily_rate=?, deposit=? WHERE id=?`).run(daily, dep, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Class not found' });
  res.json({ ok: true });
});

/* ── insurance pricing ── */
router.get('/insurance', (req, res) => {
  res.json({ insurance: db.prepare(`SELECT code,label,surcharge_daily FROM insurance_options ORDER BY sort_order`).all() });
});
router.patch('/insurance/:code', (req, res) => {
  const amt = Number(req.body.surcharge_daily);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'Price must be a positive number' });
  const info = db.prepare(`UPDATE insurance_options SET surcharge_daily=? WHERE code=?`).run(amt, req.params.code);
  if (!info.changes) return res.status(404).json({ error: 'Insurance option not found' });
  res.json({ ok: true });
});

/* ── add-ons (prepaid fuel, child seat, etc.) ── */
router.get('/addons', (req, res) => {
  res.json({ addons: db.prepare(`SELECT * FROM addons WHERE active=1 ORDER BY sort_order`).all() });
});
router.post('/addons', (req, res) => {
  const { label, description, price, per } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Name is required' });
  const amt = Number(price);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'Price must be a positive number' });
  const code = (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'addon') + '_' + nanoid(4).toLowerCase();
  const max = db.prepare(`SELECT COALESCE(MAX(sort_order),0) m FROM addons`).get().m;
  db.prepare(`INSERT INTO addons (id,code,label,description,price,per,active,sort_order) VALUES (?,?,?,?,?,?,1,?)`)
    .run(nanoid(10), code, label.trim(), description || '', amt, per === 'day' ? 'day' : 'rental', max + 1);
  res.json({ ok: true });
});
router.patch('/addons/:id', (req, res) => {
  const { label, description, price, per } = req.body;
  const amt = Number(price);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'Price must be a positive number' });
  const info = db.prepare(`UPDATE addons SET label=?,description=?,price=?,per=? WHERE id=?`)
    .run(label, description || '', amt, per === 'day' ? 'day' : 'rental', req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Add-on not found' });
  res.json({ ok: true });
});
router.delete('/addons/:id', (req, res) => {
  db.prepare(`UPDATE addons SET active=0 WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

/* ── cars (full inventory with VIN + plate) ── */
router.get('/cars', (req, res) => {
  const rows = db.prepare(`SELECT c.*, cat.name AS category_name FROM cars c JOIN categories cat ON cat.id=c.category_id WHERE c.active=1 ORDER BY cat.sort_order, c.make`).all();
  res.json({ cars: rows });
});
router.post('/cars', (req, res) => {
  const { categoryId, year, make, model, color, vin, licensePlate } = req.body;
  if (!categoryId) return res.status(400).json({ error: 'Category required' });
  const id = nanoid(10);
  db.prepare(`INSERT INTO cars (id,category_id,year,make,model,color,vin,license_plate,status,active) VALUES (?,?,?,?,?,?,?,?,'available',1)`)
    .run(id, categoryId, year, make, model, color, vin, licensePlate);
  res.json({ ok: true, id });
});
router.put('/cars/:id', (req, res) => {
  const { categoryId, year, make, model, color, vin, licensePlate, status } = req.body;
  db.prepare(`UPDATE cars SET category_id=?,year=?,make=?,model=?,color=?,vin=?,license_plate=?,status=? WHERE id=?`)
    .run(categoryId, year, make, model, color, vin, licensePlate, status || 'available', req.params.id);
  res.json({ ok: true });
});
router.delete('/cars/:id', (req, res) => {
  db.prepare(`UPDATE cars SET active=0 WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});
// Upload a photo for a specific car (shown on the rental agreement).
router.post('/cars/:id/photo', carPhoto.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose an image file' });
  const url = `/uploads/${req.file.filename}`;
  const info = db.prepare(`UPDATE cars SET image_url=? WHERE id=?`).run(url, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Car not found' });
  res.json({ ok: true, image_url: url });
});

/* ── category blocks ── */
router.get('/blocks', (req, res) => {
  res.json({ blocks: db.prepare(`SELECT b.*, c.name AS category_name FROM category_blocks b JOIN categories c ON c.id=b.category_id ORDER BY b.start_date`).all() });
});
router.post('/blocks', (req, res) => {
  const { categoryId, startDate, endDate, reason } = req.body;
  db.prepare(`INSERT INTO category_blocks (id,category_id,start_date,end_date,reason) VALUES (?,?,?,?,?)`).run(nanoid(10), categoryId, startDate, endDate, reason || null);
  res.json({ ok: true });
});
router.delete('/blocks/:id', (req, res) => { db.prepare(`DELETE FROM category_blocks WHERE id=?`).run(req.params.id); res.json({ ok: true }); });

/* ── per-car blocks (Turo bookings, shop, etc.) ── */
router.get('/car-blocks', (req, res) => {
  res.json({ blocks: db.prepare(`SELECT b.*, c.year,c.make,c.model,c.license_plate FROM car_blocks b JOIN cars c ON c.id=b.car_id ORDER BY b.start_date`).all() });
});
router.post('/car-blocks', (req, res) => {
  const { carId, startDate, endDate, reason } = req.body;
  db.prepare(`INSERT INTO car_blocks (id,car_id,start_date,end_date,reason) VALUES (?,?,?,?,?)`).run(nanoid(10), carId, startDate, endDate, reason || null);
  res.json({ ok: true });
});
router.delete('/car-blocks/:id', (req, res) => { db.prepare(`DELETE FROM car_blocks WHERE id=?`).run(req.params.id); res.json({ ok: true }); });

/* ── stats ── */
router.get('/stats', (req, res) => {
  const row = db.prepare(`SELECT COUNT(*) total, SUM(status='pending') pending, SUM(status='approved') approved, SUM(status='declined') declined,
    SUM(agreement_status='signed') signed, COALESCE(SUM(CASE WHEN payment_status='paid' THEN deposit END),0) deposits_collected FROM bookings`).get();
  res.json({ stats: row });
});

/* ── rentals (by lifecycle) — booking (upcoming) | active | completed | cancelled ── */
router.get('/rentals', (req, res) => {
  const { lifecycle } = req.query;
  const rows = lifecycle
    ? db.prepare(`SELECT * FROM bookings WHERE lifecycle = ? ORDER BY pickup_at DESC`).all(lifecycle)
    : db.prepare(`SELECT * FROM bookings ORDER BY pickup_at DESC`).all();
  res.json({ bookings: rows.map(shape) });
});

/* ── customers (aggregated from bookings) ── */
router.get('/customers', (req, res) => {
  const rows = db.prepare(`SELECT email,
    MAX(first_name) first_name, MAX(last_name) last_name, MAX(cell_phone) cell_phone, MAX(address) address,
    COUNT(*) bookings, COALESCE(SUM(deposit),0) total_deposits, MAX(created_at) last_booking
    FROM bookings WHERE email IS NOT NULL AND email != '' GROUP BY lower(email) ORDER BY last_booking DESC`).all();
  res.json({ customers: rows });
});

/* ── lifecycle transitions ── */
router.post('/bookings/:id/start', (req, res) => {
  const info = db.prepare(`UPDATE bookings SET lifecycle='active' WHERE id=?`).run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
router.post('/bookings/:id/complete', (req, res) => {
  const info = db.prepare(`UPDATE bookings SET lifecycle='completed' WHERE id=?`).run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

/* ── edit reservation (extend dates / change price) ── */
router.patch('/bookings/:id', (req, res) => {
  const b = db.prepare(`SELECT * FROM bookings WHERE id=?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const { pickup_at, return_at, due_at_pickup, admin_notes } = req.body;
  const newPickup = pickup_at || b.pickup_at;
  const newReturn = return_at || b.return_at;
  const days = rentalDays(newPickup, newReturn);
  if (days === 0) return res.status(400).json({ error: 'Return must be after pickup' });
  const newDue = due_at_pickup != null && Number.isFinite(Number(due_at_pickup)) ? Number(due_at_pickup) : b.due_at_pickup;
  db.prepare(`UPDATE bookings SET pickup_at=?, return_at=?, days=?, due_at_pickup=?, admin_notes=? WHERE id=?`)
    .run(newPickup, newReturn, days, newDue, admin_notes != null ? admin_notes : b.admin_notes, b.id);
  res.json({ ok: true });
});

/* ── cancel a booking ── */
router.post('/bookings/:id/cancel', (req, res) => {
  const b = db.prepare(`SELECT * FROM bookings WHERE id=?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE bookings SET status='declined', lifecycle='cancelled', admin_notes=? WHERE id=?`)
    .run(req.body.reason || b.admin_notes || 'Cancelled', b.id);
  res.json({ ok: true });
});

/* ── refund (full or partial) ── */
router.post('/bookings/:id/refund', async (req, res) => {
  const b = db.prepare(`SELECT * FROM bookings WHERE id=?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const amt = Number(req.body.amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Enter a refund amount greater than 0' });
  const maxRefundable = +(b.deposit - (b.refunded_total || 0)).toFixed(2);
  if (amt > maxRefundable) return res.status(400).json({ error: `Max refundable is $${maxRefundable.toFixed(2)}` });

  const result = await refund({ amount: amt, originalRef: b.payment_ref, reference: b.reference });
  if (!result.ok) return res.status(402).json({ error: 'Refund failed: ' + result.error });

  const refunds = (() => { try { return JSON.parse(b.refunds || '[]'); } catch { return []; } })();
  refunds.push({ amount: amt, type: amt >= maxRefundable ? 'full' : 'partial', ref: result.ref, mode: result.mode, at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  const refundedTotal = +((b.refunded_total || 0) + amt).toFixed(2);
  db.prepare(`UPDATE bookings SET refunds=?, refunded_total=? WHERE id=?`).run(JSON.stringify(refunds), refundedTotal, b.id);

  try {
    await sendEmail({ to: b.email, subject: `Refund processed — ${b.reference}`, text: `A refund of $${amt.toFixed(2)} has been processed for your reservation ${b.reference}. Reference: ${result.ref}.` });
  } catch { /* ignore */ }

  res.json({ ok: true, refundedTotal, ref: result.ref });
});

/* ── check-in / check-out (photos + odometer miles + fuel) ── */
function handleInspection(kind) {
  return (req, res) => {
    const b = db.prepare(`SELECT * FROM bookings WHERE id=?`).get(req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    const miles = req.body.miles != null && req.body.miles !== '' ? Number(req.body.miles) : null;
    const fuel = req.body.fuel != null ? req.body.fuel : null; // e.g. "Full", "3/4", "1/2"
    const photos = (req.files || []).map((f) => `/uploads/${f.filename}`);
    // merge with any existing photos for this inspection
    let existing = {};
    try { existing = JSON.parse((kind === 'checkin' ? b.checkin : b.checkout) || '{}') || {}; } catch { existing = {}; }
    const data = {
      miles: miles != null ? miles : existing.miles ?? null,
      fuel: fuel != null ? fuel : existing.fuel ?? null,
      photos: [...(existing.photos || []), ...photos],
      at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    const col = kind === 'checkin' ? 'checkin' : 'checkout';
    db.prepare(`UPDATE bookings SET ${col}=? WHERE id=?`).run(JSON.stringify(data), b.id);
    // auto-advance lifecycle: check-in starts the rental, check-out completes it
    if (kind === 'checkin' && b.lifecycle === 'booking') db.prepare(`UPDATE bookings SET lifecycle='active' WHERE id=?`).run(b.id);
    if (kind === 'checkout' && b.lifecycle === 'active') db.prepare(`UPDATE bookings SET lifecycle='completed' WHERE id=?`).run(b.id);

    // compute miles driven if both present
    let milesDriven = null;
    const ci = kind === 'checkin' ? data : (() => { try { return JSON.parse(b.checkin || '{}'); } catch { return {}; } })();
    const co = kind === 'checkout' ? data : (() => { try { return JSON.parse(b.checkout || '{}'); } catch { return {}; } })();
    if (ci?.miles != null && co?.miles != null) milesDriven = co.miles - ci.miles;

    res.json({ ok: true, data, milesDriven });
  };
}
router.post('/bookings/:id/checkin', carPhoto.array('photos', 12), handleInspection('checkin'));
router.post('/bookings/:id/checkout', carPhoto.array('photos', 12), handleInspection('checkout'));

// Rich dashboard data: totals, revenue, by class, 14-day trend.
router.get('/dashboard', (req, res) => {
  const totals = db.prepare(`SELECT COUNT(*) total,
    SUM(status='pending') pending, SUM(status='approved') approved, SUM(status='declined') declined,
    SUM(lifecycle='active') active, SUM(lifecycle='completed') completed, SUM(lifecycle='cancelled') cancelled,
    COALESCE(SUM(CASE WHEN payment_status='paid' THEN deposit END),0) deposits,
    COALESCE(SUM(CASE WHEN payment_status='paid' THEN due_at_pickup END),0) pickup_revenue,
    COALESCE(SUM(addons_total),0) addon_revenue,
    COALESCE(SUM(refunded_total),0) refunded
    FROM bookings`).get();
  const byClass = db.prepare(`SELECT category_name, COUNT(*) count, COALESCE(SUM(deposit),0) deposits FROM bookings GROUP BY category_name ORDER BY count DESC`).all();
  // 14-day booking trend
  const trend = db.prepare(`SELECT substr(created_at,1,10) day, COUNT(*) count, COALESCE(SUM(deposit),0) revenue
    FROM bookings WHERE created_at >= date('now','-14 days') GROUP BY day ORDER BY day`).all();
  res.json({ totals, byClass, trend });
});

// Calendar feed: every car with its booked date-ranges (for per-car / per-class calendar).
router.get('/calendar', (req, res) => {
  const cars = db.prepare(`SELECT c.id, c.year, c.make, c.model, c.color, c.license_plate, cat.name AS category_name
    FROM cars c JOIN categories cat ON cat.id=c.category_id WHERE c.active=1 ORDER BY cat.sort_order, c.make`).all();
  const bookings = db.prepare(`SELECT id, reference, assigned_car_id, category_name, first_name, last_name, pickup_at, return_at, status, lifecycle
    FROM bookings WHERE status != 'declined' AND lifecycle != 'cancelled' ORDER BY pickup_at`).all();
  const carBlocks = db.prepare(`SELECT car_id, start_date, end_date, reason FROM car_blocks`).all();
  res.json({ cars, bookings, carBlocks });
});

function shape(b) {
  const car = b.assigned_car_id ? db.prepare(`SELECT * FROM cars WHERE id=?`).get(b.assigned_car_id) : null;
  return {
    ...b,
    insurance_files: safe(b.insurance_files),
    license_url: b.license_file ? `/uploads/${b.license_file}` : null,
    insurance_urls: safe(b.insurance_files).map((f) => `/uploads/${f}`),
    assigned_car: car ? { desc: `${car.year} ${car.make} ${car.model} (${car.color})`, vin: car.vin, plate: car.license_plate } : null,
    agreement_url: b.agreement_file ? `/agreements/${b.agreement_file}` : null,
    sign_path: b.agreement_token ? `/sign/${b.agreement_token}` : null,
    addons_list: safe(b.addons),
    checkin_data: b.checkin ? safeObj(b.checkin) : null,
    checkout_data: b.checkout ? safeObj(b.checkout) : null,
    refunds_list: safe(b.refunds),
  };
}
function safeObj(s) { try { return JSON.parse(s); } catch { return null; } }
function safe(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }

export default router;
