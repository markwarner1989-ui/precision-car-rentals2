import db from './db.js';
import { nanoid } from 'nanoid';

// Seed ONLY tables that are empty. Previously every restart deleted and re-created these
// tables with brand-new random IDs, which wiped price/fleet/add-on edits and orphaned bookings.
const isEmpty = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n === 0;
const needCats = isEmpty('categories');
const needIns = isEmpty('insurance_options');
const needAddons = isEmpty('addons');
if (needCats) db.prepare('DELETE FROM cars').run(); // cars without categories would be orphans

// ── Categories (with FIXED deposits) ──
const categories = [
  { name: 'Economical', example: 'Nissan Versa, Kia Rio or similar', description: 'Fuel-efficient and budget-friendly.', image_url: '/images/economical.svg', daily_rate: 39, deposit: 150, sort_order: 1 },
  { name: 'Sedan', example: 'Toyota Camry, Honda Accord or similar', description: 'Comfortable mid-size sedans.', image_url: '/images/sedan.svg', daily_rate: 55, deposit: 200, sort_order: 2 },
  { name: 'SUV', example: 'Chevrolet Tahoe or similar', description: 'Full-size SUVs with room for everyone.', image_url: '/images/suv.svg', daily_rate: 89, deposit: 300, sort_order: 3 },
  { name: 'Performance', example: 'Dodge Charger, Challenger or similar', description: 'Bold styling and power.', image_url: '/images/performance.svg', daily_rate: 99, deposit: 400, sort_order: 4 },
  { name: 'Luxury', example: 'BMW 5 Series, Mercedes E-Class or similar', description: 'Premium comfort and refinement.', image_url: '/images/luxury.svg', daily_rate: 129, deposit: 500, sort_order: 5 },
];
const catIns = db.prepare(`INSERT INTO categories (id,name,example,description,image_url,daily_rate,deposit,sort_order,active) VALUES (@id,@name,@example,@description,@image_url,@daily_rate,@deposit,@sort_order,1)`);
const catIds = {};
if (needCats) for (const c of categories) { const id = nanoid(10); catIds[c.name] = id; catIns.run({ id, ...c }); }

// ── Cars (each with VIN + plate; a category can even be a single specific car) ──
const cars = [
  { cat: 'Economical', year: '2021', make: 'Nissan', model: 'Versa', color: 'Silver', vin: '3N1CN8EV5ML000111', plate: 'PCR-1001' },
  { cat: 'Economical', year: '2020', make: 'Kia', model: 'Rio', color: 'White', vin: '3KPA24AD6LE000222', plate: 'PCR-1002' },
  { cat: 'Sedan', year: '2022', make: 'Toyota', model: 'Camry', color: 'Gray', vin: '4T1C11AK4NU000333', plate: 'PCR-2001' },
  { cat: 'Sedan', year: '2021', make: 'Honda', model: 'Accord', color: 'Black', vin: '1HGCV1F1XMA000444', plate: 'PCR-2002' },
  { cat: 'SUV', year: '2023', make: 'Chevrolet', model: 'Tahoe', color: 'Black', vin: '1GNSKPKD2PR000555', plate: 'PCR-3001' },
  { cat: 'SUV', year: '2022', make: 'Ford', model: 'Explorer', color: 'Blue', vin: '1FMSK8DH5NG000666', plate: 'PCR-3002' },
  { cat: 'Performance', year: '2022', make: 'Dodge', model: 'Charger', color: 'Red', vin: '2C3CDXBG7NH000777', plate: 'PCR-4001' },
  { cat: 'Performance', year: '2021', make: 'Dodge', model: 'Challenger', color: 'Orange', vin: '2C3CDZAG9MH000888', plate: 'PCR-4002' },
  { cat: 'Luxury', year: '2023', make: 'BMW', model: '540i', color: 'White', vin: 'WBA53BJ00PW000999', plate: 'PCR-5001' },
];
const carIns = db.prepare(`INSERT INTO cars (id,category_id,year,make,model,color,vin,license_plate,image_url,status,active) VALUES (@id,@category_id,@year,@make,@model,@color,@vin,@license_plate,@image_url,'available',1)`);
if (needCats) for (const c of cars) {
  carIns.run({ id: nanoid(10), category_id: catIds[c.cat], year: c.year, make: c.make, model: c.model, color: c.color, vin: c.vin, license_plate: c.plate, image_url: null });
}

// ── Insurance options ──
// Flow: first "Do you have your own insurance?" (Yes/No).
//  - Yes  → "What kind?" → Full Coverage or Liability (own policy, must be in their name).
//  - No   → our insurance package ($45/day, added to the deposit / due now).
const insurance = [
  {
    code: 'full', label: 'Full Coverage', has_own: 1,
    surcharge_daily: 0, surcharge_target: 'pickup',
    requires_docs: JSON.stringify(['license', 'insurance_card', 'declaration_page']),
    followup_text: 'Great — since your policy already carries full coverage in your name, you don\u2019t need to purchase anything extra from us. Please upload your license, insurance card, and your policy declaration page.',
    allowed: 1, sort_order: 1,
  },
  {
    code: 'liability', label: 'Liability Only', has_own: 1,
    surcharge_daily: 25, surcharge_target: 'pickup',
    requires_docs: JSON.stringify(['license', 'insurance_card']),
    followup_text: 'Since your policy is liability-only, you\u2019ll need to purchase collision coverage from us for $25/day, added to your pickup balance. Please upload your license and insurance card.',
    allowed: 1, sort_order: 2,
  },
  {
    code: 'our_package', label: 'Precision insurance package', has_own: 0,
    surcharge_daily: 45, surcharge_target: 'deposit',
    requires_docs: JSON.stringify(['license', 'payment_card']),
    followup_text: 'No problem — our insurance package fully covers you for $45/day, added to your deposit. Please upload your license and a photo of the payment card you\u2019ll use.',
    allowed: 1, sort_order: 3,
  },
];
const insIns = db.prepare(`INSERT INTO insurance_options (id,code,label,has_own,surcharge_daily,surcharge_target,requires_docs,followup_text,allowed,sort_order) VALUES (@id,@code,@label,@has_own,@surcharge_daily,@surcharge_target,@requires_docs,@followup_text,@allowed,@sort_order)`);
if (needIns) for (const i of insurance) insIns.run({ id: nanoid(10), ...i });

// ── Add-ons (10 defaults; admin can add/edit/remove) ──
const addons = [
  { code: 'prepaid_fuel', label: 'Prepaid Fuel', description: 'Return the car at any fuel level — no refueling worries.', price: 75, per: 'rental' },
  { code: 'child_seat', label: 'Child Safety Seat', description: 'Rear-facing or forward-facing seat for infants and toddlers.', price: 12, per: 'day' },
  { code: 'booster_seat', label: 'Booster Seat', description: 'For older children who have outgrown a car seat.', price: 8, per: 'day' },
  { code: 'additional_driver', label: 'Additional Driver', description: 'Add a second authorized driver to the rental.', price: 10, per: 'day' },
  { code: 'gps', label: 'GPS Navigation', description: 'Portable GPS unit with the latest maps.', price: 9, per: 'day' },
  { code: 'toll_pass', label: 'Toll Pass', description: 'Electronic toll transponder — drive through all toll lanes.', price: 6, per: 'day' },
  { code: 'roadside', label: 'Premium Roadside Assistance', description: '24/7 roadside help: lockout, jump-start, tire, fuel delivery.', price: 7, per: 'day' },
  { code: 'unlimited_miles', label: 'Unlimited Mileage', description: 'No mileage cap for the entire rental.', price: 15, per: 'day' },
  { code: 'ski_rack', label: 'Ski / Snowboard Rack', description: 'Roof rack for winter gear.', price: 11, per: 'day' },
  { code: 'wifi', label: 'Mobile Wi-Fi Hotspot', description: 'Stay connected on the road with a portable hotspot.', price: 10, per: 'day' },
];
const addIns = db.prepare(`INSERT INTO addons (id,code,label,description,price,per,active,sort_order) VALUES (?,?,?,?,?,?,1,?)`);
if (needAddons) addons.forEach((a, i) => addIns.run(nanoid(10), a.code, a.label, a.description, a.price, a.per, i + 1));

console.log(`Seed check — categories+cars: ${needCats ? 'seeded' : 'kept'}, insurance: ${needIns ? 'seeded' : 'kept'}, add-ons: ${needAddons ? 'seeded' : 'kept'}.`);
