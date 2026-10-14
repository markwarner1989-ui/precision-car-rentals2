import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import db from '../lib/db.js';
import { signAdmin, requireAdmin } from '../lib/auth.js';
import { availableCarsInCategory } from '../lib/pricing.js';
import { sendEmail } from '../lib/email.js';

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
  };
}
function safe(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }

export default router;
