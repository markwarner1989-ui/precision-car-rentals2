import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGREEMENTS_DIR = path.join(__dirname, '..', 'agreements');
fs.mkdirSync(AGREEMENTS_DIR, { recursive: true });
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'client', 'public', 'images');

const NAVY = '#0d3b40';
const AMBER = '#e08a2b';
const INK = '#1b1b1b';
const SOFT = '#555';

export const INITIAL_CLAUSES = [
  { key: 'clean', text: 'I will return the vehicle clean. If it is returned dirty or requires extra attention, I agree to pay a cleaning fee of up to $250.' },
  { key: 'smoke', text: 'I understand the vehicle is 100% smoke-free. Any smoking results in a deodorization/damage fee of up to $350.' },
  { key: 'fuel', text: 'I will return the vehicle with the same fuel level, or agree to a refueling charge.' },
  { key: 'authorized', text: 'I am an authorized driver, at least 21 years old, with a valid license and insurance in my own name.' },
];

// Full Terms & Conditions, adapted from the standard rental agreement. {company} is substituted.
const TERMS = [
  ['Nature of this Agreement',
    'This Agreement is between you (the Renter) and {company} (the Licensee). {company} rents to you the vehicle identified on this Rental Record subject to these Terms and Conditions. You and Authorized Drivers are not agents of {company}, may not transfer the vehicle or any rights under this Agreement, and may not service or repair the vehicle without {company}’s prior approval. {company} MAKES NO EXPRESS OR IMPLIED WARRANTIES, INCLUDING ANY WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.'],
  ['Who May Drive the Vehicle',
    'Only you, and with your permission your spouse, employer and coworkers incidental to their business with you, and persons listed as Additional Drivers may drive the vehicle. All Authorized Drivers must be at least 21 years old (unless otherwise required by law) and hold a valid driver’s license. {company} may impose an additional fee for Authorized Drivers other than you.'],
  ['Vehicle Returns',
    'You must return the vehicle in the same condition as when received (except ordinary wear) to the location and by the date and time specified. Returning the vehicle more than three (3) hours late without notifying us may result in a cleaning charge, drop charge, and/or late charge. Late returns disrupt future bookings; if your delay affects the next customer, you may be charged for their entire rental cost.'],
  ['Responsibility for Loss or Damage',
    'You are responsible for all damage to, loss of, or theft of the vehicle during the Rental Period, including damage caused by collision, weather, terrain, acts of God, and vandalism. If the vehicle is a total loss, you owe the fair market value less salvage; if repairable, the cost of repair plus Diminished Value and Loss of Use, measured by the daily rental rate for the days the vehicle is out of service, plus an administrative fee of up to $350, plus towing, storage, and impound charges.'],
  ['Collision Damage Waiver (CDW)',
    'You are not required to purchase a Collision Damage Waiver, optional insurance, or other optional goods from us. You may purchase collision coverage through us as shown on your Rental Record. Unless purchased, YOU ARE NOT COVERED by a CDW under this Agreement.'],
  ['Supplemental Liability Insurance (SLI)',
    'Supplemental Liability Insurance protects you against claims by a third party for bodily injury and/or property damage sustained as a result of an accident while operating a rental vehicle. SLI is not included in this contract unless purchased. Unless purchased, YOU ARE NOT COVERED.'],
  ['No Smoking',
    'The vehicle is 100% smoke-free. No smoking is permitted. By accepting these terms you take full responsibility for keeping the vehicle smoke-free for yourself and all passengers. Any violation incurs a fee of up to $350 to cover deodorization and depreciation of the vehicle’s value.'],
  ['Prohibited Uses',
    'The vehicle may not be driven: by anyone other than an Authorized Driver; outside the United States without written permission; off-road or to tow or push anything; for driver training; to transport persons or property for compensation; in any speed test or contest; in connection with any crime or felony; in a willful, wanton or reckless manner; to transport hazardous or explosive substances; while overloaded or improperly loaded; without using seat-belts or required child restraints; while leaving the vehicle unattended without removing the keys and locking it; or while under the influence of alcohol, drugs or intoxicants. Prohibited use voids insurance coverage and makes you fully responsible for all resulting damages.'],
  ['Payment of Charges',
    'If you direct charges to a credit or debit card, you warrant you are authorized to do so and AUTHORIZE {company} TO RESERVE CREDIT AND PROCESS AN APPROPRIATE VOUCHER WITH THE CARD ISSUER for all estimated charges, additional charges, and corrected charges upon audit. You will pay on demand all amounts incurred, including time and mileage charges, taxes, permits, service and equipment, excessive wear and tear, lost keys, refueling charges, fines, penalties, forfeitures, attorney fees and court costs, and all charges related to loss of or damage to the vehicle.'],
  ['Accidents, Theft, Vandalism & Claim Reporting',
    'You must immediately report any accident, theft, or vandalism of the vehicle to {company} and to the police in the jurisdiction where the incident occurred, and deliver to {company} any related papers. You must call the police to the scene of any accident and make a written report no later than 24 hours after the occurrence. FAILURE TO COOPERATE MAY VOID ANY LIABILITY INSURANCE COVERAGE. Any breach of this agreement may void any insurance coverage.'],
  ['Liability Insurance & Indemnity',
    'Any contingent liability coverage provided applies only if the driver has no other available insurance, is excess or contingent, and only up to the minimum financial responsibility limits required by the state where the loss occurred. Coverage applies only in the United States. Where permitted by law, {company} has elected not to carry uninsured/underinsured motorist coverage. You agree to indemnify, defend and hold {company} harmless from all claims arising from your use of the vehicle.'],
  ['Telematics Notice',
    'The vehicle may be equipped with GPS and/or event data recorder (EDR) technology. You acknowledge and authorize that your use of the vehicle may be remotely monitored, including collection of location, odometer, fuel level, tire pressure, battery state, diagnostic codes and other data. Where permitted by law, {company} may disable the vehicle when necessary, including if you breach this Agreement. You agree to inform all drivers and passengers of the terms of this section.'],
  ['Deposit',
    'We may use your deposit to pay any amounts owed to us under this Agreement.'],
  ['Cancellation Policy',
    'If you cancel your reservation within 24 hours of booking, a cancellation fee equal to the deposit will be charged and automatically deducted from the deposit provided. For cancellations made after the 24-hour window, standard cancellation terms and fees as outlined in this agreement apply.'],
  ['Governing Law & Arbitration',
    'Any dispute arising out of or relating to this Agreement shall be determined by arbitration in the city and state where {company} is located, before one arbitrator, administered by a major arbitration service provider. If arbitration is unavailable or waived, any legal action shall be instituted exclusively in the courts of the city and state where {company} is located. This Agreement is governed by the laws of that state. If any part of this Agreement is held void or unenforceable, the remaining parts are not affected.'],
];

function drawHeader(doc, booking) {
  doc.rect(0, 0, doc.page.width, 92).fill(NAVY);
  try {
    const logo = path.join(ASSETS_DIR, 'logo.png');
    if (fs.existsSync(logo)) doc.image(logo, 44, 22, { height: 48 });
    else throw new Error('no logo');
  } catch {
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(20).text(process.env.BUSINESS_NAME || 'Precision Car Rentals', 44, 30);
  }
  doc.fillColor(AMBER).font('Helvetica-Bold').fontSize(11).text('VEHICLE RENTAL AGREEMENT', 0, 34, { align: 'right', width: doc.page.width - 44 });
  doc.fillColor('#cfe0dd').font('Helvetica').fontSize(9).text(`Ref: ${booking.reference}`, 0, 52, { align: 'right', width: doc.page.width - 44 });
  doc.fillColor(INK).y = 110;
}

function carPhotoPath(car) {
  if (car?.image_url) {
    // stored as /uploads/<file>
    const f = car.image_url.replace(/^\/uploads\//, '');
    const p = path.join(UPLOADS_DIR, f);
    if (fs.existsSync(p)) return p;
  }
  // fallback: class illustration
  const map = { Economical: 'economical.svg', Sedan: 'sedan.svg', SUV: 'suv.svg', Performance: 'performance.svg', Luxury: 'luxury.svg' };
  const png = path.join(IMAGES_DIR, (map[car?.category_name] || '').replace('.svg', '.png'));
  if (fs.existsSync(png)) return png;
  return null;
}

export function generateAgreementPDF(booking, car, signature) {
  const filename = `agreement-${booking.reference}.pdf`;
  const filepath = path.join(AGREEMENTS_DIR, filename);
  const doc = new PDFDocument({ size: 'LETTER', margin: 48, bufferPages: true });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  const company = process.env.BUSINESS_NAME || 'Precision Car Rentals';
  const phone = process.env.BUSINESS_PHONE || '';
  const W = doc.page.width, L = 48, R = W - 48;

  drawHeader(doc, booking);

  const field = (label, value, x = L, w = 240) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(label, x, doc.y, { width: w, continued: false });
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(value || '—', x, doc.y, { width: w });
    doc.moveDown(0.3);
  };
  const sectionTitle = (t) => { doc.moveDown(0.5); doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(t); doc.moveTo(L, doc.y + 1).lineTo(R, doc.y + 1).stroke('#e2ddd1'); doc.moveDown(0.4); };

  // Host line
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`Brought to you by ${company}`, L, 104);
  if (phone) doc.font('Helvetica').fontSize(9).fillColor(SOFT).text(`Phone: ${phone}  ·  Charlotte Airport & Gastonia, NC`, L);
  doc.moveDown(0.3);

  // Two columns: Renter | Vehicle (+photo)
  const topY = doc.y;
  // Renter (left)
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Renter', L, topY);
  doc.moveDown(0.3);
  field('Name', `${booking.first_name} ${booking.last_name}`);
  field('Date of birth', booking.dob);
  field('Phone', booking.cell_phone);
  field('Email', booking.email);
  field('Address', booking.address);
  const leftEnd = doc.y;

  // Vehicle (right)
  const rx = 310;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Vehicle', rx, topY);
  let ry = topY + 18;
  const photo = carPhotoPath(car);
  if (photo) {
    try { doc.image(photo, rx, ry, { fit: [238, 120], align: 'center' }); ry += 128; } catch { /* ignore */ }
  }
  doc.y = ry;
  const rfield = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(label, rx, doc.y, { width: 238 });
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(value || '—', rx, doc.y, { width: 238 });
    doc.moveDown(0.25);
  };
  rfield('Vehicle', car ? `${car.year || ''} ${car.make || ''} ${car.model || ''} (${car.color || ''})`.trim() : '—');
  rfield('VIN', car?.vin);
  rfield('License plate', car?.license_plate);
  rfield('Class', booking.category_name);

  doc.y = Math.max(leftEnd, doc.y) + 6;

  // Rental terms
  sectionTitle('Rental Terms');
  const locLabel = booking.pickup_location === 'delivery'
    ? `Delivery to ${booking.delivery_address || 'renter address'}`
    : (booking.pickup_location === 'charlotte_airport' ? 'Charlotte Airport' : 'Gastonia');
  const colY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('Pickup', L, colY);
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(`${booking.pickup_at.replace('T', ' ')} — ${locLabel}`, L, doc.y, { width: 250 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('Return', 310, colY);
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(booking.return_at.replace('T', ' '), 310, colY + 12, { width: 238 });
  doc.moveDown(0.5);
  const payY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('Coverage on file', L, payY);
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(booking.coverage_label, L, doc.y, { width: 250 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('Deposit paid', 310, payY);
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(`$${booking.deposit.toFixed(2)}`, 310, payY + 12);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('Balance due at pickup', 430, payY);
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(`$${booking.due_at_pickup.toFixed(2)}`, 430, payY + 12);
  doc.moveDown(0.8);

  // Initialed acknowledgements
  sectionTitle('Acknowledged Terms (initialed by renter)');
  for (const c of INITIAL_CLAUSES) {
    const ini = (signature.initials && signature.initials[c.key]) || '';
    const y = doc.y;
    doc.roundedRect(L, y, 44, 22, 4).stroke(AMBER);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(ini.toUpperCase(), L, y + 6, { width: 44, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#222').text(c.text, L + 54, y + 2, { width: R - (L + 54) });
    doc.y = Math.max(doc.y, y + 28);
  }

  // ── Full Terms & Conditions (new page) ──
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY).text('Rental Agreement Terms & Conditions');
  doc.moveTo(L, doc.y + 2).lineTo(R, doc.y + 2).stroke(AMBER);
  doc.moveDown(0.6);
  TERMS.forEach(([title, body], i) => {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY).text(`${i + 1}. ${title}`);
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(9).fillColor('#222').text(body.replace(/\{company\}/g, company), { align: 'justify', lineGap: 1.5 });
    doc.moveDown(0.5);
  });

  // ── Signature block ──
  if (doc.y > doc.page.height - 170) doc.addPage();
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Signature');
  doc.font('Helvetica').fontSize(9).fillColor('#222').text('By signing below, I acknowledge that I have read and agree to all terms and conditions in this agreement.');
  doc.moveDown(1.2);
  doc.font('Helvetica-Oblique').fontSize(22).fillColor('#111').text(signature.fullName || '', L, doc.y, { width: 320 });
  doc.moveTo(L, doc.y + 2).lineTo(L + 320, doc.y + 2).stroke('#999');
  doc.font('Helvetica').fontSize(9).fillColor(SOFT).text(`Signed electronically on ${signature.signedAt}`, L, doc.y + 6);
  doc.text(`${company}${phone ? ' · ' + phone : ''}`, L);

  // Footer page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(8).fillColor('#999')
      .text(`${company}  ·  Rental Agreement ${booking.reference}  ·  Page ${i + 1} of ${range.count}`,
        L, doc.page.height - 34, { align: 'center', width: R - L });
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}

export { AGREEMENTS_DIR };
