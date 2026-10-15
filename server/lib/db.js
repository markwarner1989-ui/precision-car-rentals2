import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'precision.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    example       TEXT,
    description   TEXT,
    image_url     TEXT,
    daily_rate    REAL NOT NULL,
    deposit       REAL NOT NULL,       -- FIXED deposit for this category
    sort_order    INTEGER DEFAULT 0,
    active        INTEGER DEFAULT 1
  );

  -- Individual vehicles. Each belongs to a category and carries VIN + plate,
  -- which auto-populate the rental agreement when assigned.
  CREATE TABLE IF NOT EXISTS cars (
    id            TEXT PRIMARY KEY,
    category_id   TEXT NOT NULL,
    year          TEXT,
    make          TEXT,
    model         TEXT,
    color         TEXT,
    vin           TEXT,
    license_plate TEXT,
    image_url     TEXT,
    status        TEXT DEFAULT 'available',  -- available | out_of_service
    active        INTEGER DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  -- Block an ENTIRE category for a date range.
  CREATE TABLE IF NOT EXISTS category_blocks (
    id           TEXT PRIMARY KEY,
    category_id  TEXT NOT NULL,
    start_date   TEXT NOT NULL,
    end_date     TEXT NOT NULL,
    reason       TEXT
  );

  -- Block a SPECIFIC car for a date range (e.g. booked on Turo, in the shop).
  CREATE TABLE IF NOT EXISTS car_blocks (
    id           TEXT PRIMARY KEY,
    car_id       TEXT NOT NULL,
    start_date   TEXT NOT NULL,
    end_date     TEXT NOT NULL,
    reason       TEXT,
    FOREIGN KEY (car_id) REFERENCES cars(id)
  );

  -- Insurance options. surcharge_daily is what THEY must buy from us based on
  -- the coverage they already have (e.g. liability holders buy collision).
  CREATE TABLE IF NOT EXISTS insurance_options (
    id             TEXT PRIMARY KEY,
    code           TEXT UNIQUE NOT NULL,   -- liability | full | our_package
    label          TEXT NOT NULL,
    has_own         INTEGER DEFAULT 1,     -- 1 = customer's own policy; 0 = our package (no own insurance)
    surcharge_daily REAL NOT NULL DEFAULT 0,
    surcharge_target TEXT DEFAULT 'pickup',-- 'pickup' = due at pickup; 'deposit' = due now
    requires_docs  TEXT,                   -- JSON array of required doc keys
    followup_text  TEXT,                   -- shown on the 2nd insurance screen
    allowed         INTEGER DEFAULT 1,
    sort_order     INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id                 TEXT PRIMARY KEY,
    reference          TEXT UNIQUE NOT NULL,
    category_id        TEXT NOT NULL,
    category_name      TEXT NOT NULL,

    pickup_location    TEXT NOT NULL,      -- charlotte_airport | gastonia | delivery
    delivery_address   TEXT,
    pickup_at          TEXT NOT NULL,
    return_at          TEXT NOT NULL,
    days               INTEGER NOT NULL,

    first_name         TEXT NOT NULL,
    last_name          TEXT NOT NULL,
    dob                TEXT NOT NULL,
    address            TEXT NOT NULL,
    cell_phone         TEXT NOT NULL,
    email              TEXT NOT NULL,

    coverage_code      TEXT NOT NULL,
    coverage_label     TEXT NOT NULL,
    surcharge_daily    REAL NOT NULL DEFAULT 0,

    daily_rate         REAL NOT NULL,
    rental_subtotal    REAL NOT NULL,
    surcharge_subtotal REAL NOT NULL,
    deposit            REAL NOT NULL,      -- fixed, due now
    due_at_pickup      REAL NOT NULL,

    license_file       TEXT,
    insurance_files    TEXT,               -- JSON array

    -- billing / card (for pickup match + disputes)
    billing_name       TEXT,
    billing_address    TEXT,
    card_last4         TEXT,

    payment_status     TEXT DEFAULT 'unpaid',
    payment_ref        TEXT,
    payment_mode       TEXT,

    status             TEXT DEFAULT 'pending',  -- pending|approved|declined
    assigned_car_id    TEXT,
    admin_notes        TEXT,

    -- rental agreement
    agreement_status   TEXT DEFAULT 'none',     -- none|sent|signed
    agreement_token    TEXT,
    agreement_signed_at TEXT,
    agreement_file     TEXT,

    -- e-signature audit trail (chargeback / dispute defense)
    sign_ip            TEXT,
    sign_user_agent    TEXT,
    terms_accepted     INTEGER DEFAULT 0,

    -- add-ons chosen (JSON array of {code,label,price,qty})
    addons             TEXT,
    addons_total       REAL DEFAULT 0,

    -- lifecycle: booking (upcoming) -> rental (active) -> completed; or cancelled
    lifecycle          TEXT DEFAULT 'booking',  -- booking|active|completed|cancelled

    -- check-in / check-out (JSON: {miles,fuel,photos:[],at})
    checkin            TEXT,
    checkout           TEXT,

    -- refunds (JSON array of {amount,type,ref,at})
    refunds            TEXT,
    refunded_total     REAL DEFAULT 0,

    created_at         TEXT DEFAULT (datetime('now'))
  );

  -- Add-on catalog (prepaid fuel, child seat, etc.)
  CREATE TABLE IF NOT EXISTS addons (
    id          TEXT PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,
    label       TEXT NOT NULL,
    description TEXT,
    price       REAL NOT NULL DEFAULT 0,
    per         TEXT DEFAULT 'rental',   -- rental | day
    active      INTEGER DEFAULT 1,
    sort_order  INTEGER DEFAULT 0
  );
`);

// ── Safe migrations (for any persisted DB that predates new columns) ──
function ensureColumn(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}
for (const [c, d] of [
  ['sign_ip', 'TEXT'], ['sign_user_agent', 'TEXT'], ['terms_accepted', 'INTEGER DEFAULT 0'],
  ['addons', 'TEXT'], ['addons_total', 'REAL DEFAULT 0'], ['lifecycle', "TEXT DEFAULT 'booking'"],
  ['checkin', 'TEXT'], ['checkout', 'TEXT'], ['refunds', 'TEXT'], ['refunded_total', 'REAL DEFAULT 0'],
]) ensureColumn('bookings', c, d);

export default db;
