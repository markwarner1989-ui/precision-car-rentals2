import db from './db.js';
import { getSetting } from './db.js';

// Discount tiers: % off the rental subtotal when days >= min_days. Highest match wins.
export function discountForDays(days) {
  let tiers = [];
  try { tiers = JSON.parse(getSetting('discount_tiers', '[]')); } catch { tiers = []; }
  const match = tiers
    .filter((t) => days >= Number(t.min_days))
    .sort((a, b) => Number(b.min_days) - Number(a.min_days))[0];
  return match ? { minDays: Number(match.min_days), percent: Number(match.percent) } : null;
}

export function milesPolicy() {
  return {
    perDay: Number(getSetting('miles_per_day', '150')),
    overagePerMile: Number(getSetting('overage_per_mile', '0.58')),
  };
}

export const PICKUP_LOCATIONS = {
  charlotte_airport: 'Charlotte Airport',
  gastonia: 'Gastonia',
  delivery: 'Delivery to my address',
};

export function rentalDays(pickupAt, returnAt) {
  const ms = new Date(returnAt) - new Date(pickupAt);
  if (isNaN(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}

function overlaps(s1, e1, s2, e2) {
  return new Date(s1) <= new Date(e2) && new Date(s2) <= new Date(e1);
}

// Cars in a category that are NOT blocked and NOT out of service for the dates.
export function availableCarsInCategory(categoryId, pickupAt, returnAt) {
  const p = pickupAt.slice(0, 10), r = returnAt.slice(0, 10);
  const cars = db.prepare(`SELECT * FROM cars WHERE category_id = ? AND active = 1 AND status = 'available'`).all(categoryId);
  const carBlocks = db.prepare(`SELECT * FROM car_blocks WHERE car_id = ?`);
  return cars.filter((car) => {
    const blocks = carBlocks.all(car.id);
    return !blocks.some((b) => overlaps(p, r, b.start_date, b.end_date));
  });
}

// A category is available if it has no category-block overlap AND at least one free car.
export function isCategoryAvailable(categoryId, pickupAt, returnAt) {
  const p = pickupAt.slice(0, 10), r = returnAt.slice(0, 10);
  const catBlocks = db.prepare(`SELECT * FROM category_blocks WHERE category_id = ?`).all(categoryId);
  if (catBlocks.some((b) => overlaps(p, r, b.start_date, b.end_date))) return false;
  return availableCarsInCategory(categoryId, pickupAt, returnAt).length > 0;
}

export function getInsurance(code) {
  return db.prepare(`SELECT * FROM insurance_options WHERE code = ?`).get(code);
}

/**
 * Quote. Deposit is the category's FIXED deposit. The insurance surcharge is what they
 * buy from us: for liability holders it's collision (added to the pickup balance); for
 * customers with no own insurance it's our package (added to the deposit / due now).
 * `surcharge_target` decides which bucket it lands in.
 */
export function quote(category, pickupAt, returnAt, coverageCode) {
  const days = rentalDays(pickupAt, returnAt);
  const ins = getInsurance(coverageCode);
  if (!ins) throw new Error('Invalid insurance selection');

  // Keep cents throughout — never round to a whole dollar.
  const grossRental = +(category.daily_rate * days).toFixed(2);
  const disc = discountForDays(days);
  const discountAmount = disc ? +(grossRental * disc.percent / 100).toFixed(2) : 0;
  const rentalSubtotal = +(grossRental - discountAmount).toFixed(2);

  const surchargeSubtotal = +(ins.surcharge_daily * days).toFixed(2);
  const target = ins.surcharge_target || 'pickup';

  const baseDeposit = +Number(category.deposit).toFixed(2);
  const deposit = +(baseDeposit + (target === 'deposit' ? surchargeSubtotal : 0)).toFixed(2);
  const dueAtPickup = +(rentalSubtotal + (target === 'pickup' ? surchargeSubtotal : 0)).toFixed(2);

  const policy = milesPolicy();
  const milesAllowed = policy.perDay * days;

  return {
    days,
    dailyRate: category.daily_rate,
    coverageCode: ins.code,
    coverageLabel: ins.label,
    hasOwn: !!ins.has_own,
    surchargeDaily: ins.surcharge_daily,
    surchargeTarget: target,
    surchargeSubtotal,
    baseDeposit,
    requiresDocs: JSON.parse(ins.requires_docs || '[]'),
    followupText: ins.followup_text,
    allowed: !!ins.allowed,
    grossRental,
    discountPercent: disc ? disc.percent : 0,
    discountAmount,
    rentalSubtotal,
    deposit,
    dueAtPickup,
    milesPerDay: policy.perDay,
    milesAllowed,
    overagePerMile: policy.overagePerMile,
  };
}

export const DOC_LABELS = {
  license: 'Driver\u2019s license',
  insurance_card: 'Insurance card',
  declaration_page: 'Policy declaration page',
  payment_slip: 'Proof of recent insurance payment',
  payment_card: 'Payment card photo',
};
