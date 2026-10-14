import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGREEMENTS_DIR = path.join(__dirname, '..', 'agreements');
fs.mkdirSync(AGREEMENTS_DIR, { recursive: true });

const NAVY = '#0d3b40';
const AMBER = '#e08a2b';

// The clauses the customer must initial.
export const INITIAL_CLAUSES = [
  { key: 'clean', text: 'I will return the vehicle clean. If it is returned dirty, I agree to be charged a cleaning fee.' },
  { key: 'smoke', text: 'I understand smoking is strictly prohibited in the vehicle and will result in a cleaning/damage fee.' },
  { key: 'fuel', text: 'I will return the vehicle with the same fuel level, or agree to a refueling charge.' },
  { key: 'authorized', text: 'I am the only authorized driver and hold insurance listed in my own name.' },
];

/**
 * Generate the signed rental agreement PDF.
 * booking: the booking row; car: the assigned car row; signature: { initials:{key:val}, fullName, signedAt }
 * Returns the saved filename.
 */
export function generateAgreementPDF(booking, car, signature) {
  const filename = `agreement-${booking.reference}.pdf`;
  const filepath = path.join(AGREEMENTS_DIR, filename);
  const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  const businessName = process.env.BUSINESS_NAME || 'Precision Car Rentals';
  const businessPhone = process.env.BUSINESS_PHONE || '';

  // Header
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22).text(businessName, 54, 30);
  doc.fillColor(AMBER).font('Helvetica').fontSize(11).text('Vehicle Rental Agreement', 54, 60);
  doc.fillColor('#fff').fontSize(10).text(`Ref: ${booking.reference}`, 0, 34, { align: 'right', width: doc.page.width - 54 });
  doc.moveDown(3);
  doc.fillColor('#111').y = 110;

  const line = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text(label, { continued: true });
    doc.font('Helvetica').fillColor('#111').text('  ' + (value || '—'));
  };

  // Renter
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Renter');
  doc.moveDown(0.3);
  line('Name:', `${booking.first_name} ${booking.last_name}`);
  line('Date of birth:', booking.dob);
  line('Address:', booking.address);
  line('Phone:', booking.cell_phone);
  line('Email:', booking.email);
  doc.moveDown(0.6);

  // Vehicle (auto-populated from the assigned car)
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Vehicle');
  doc.moveDown(0.3);
  line('Vehicle:', car ? `${car.year || ''} ${car.make || ''} ${car.model || ''} (${car.color || ''})`.trim() : '—');
  line('VIN:', car?.vin);
  line('License plate:', car?.license_plate);
  line('Class:', booking.category_name);
  doc.moveDown(0.6);

  // Rental terms
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Rental Terms');
  doc.moveDown(0.3);
  const locLabel = booking.pickup_location === 'delivery'
    ? `Delivery to ${booking.delivery_address || 'renter address'}`
    : (booking.pickup_location === 'charlotte_airport' ? 'Charlotte Airport' : 'Gastonia');
  line('Pickup:', `${booking.pickup_at.replace('T', ' ')} — ${locLabel}`);
  line('Return:', booking.return_at.replace('T', ' '));
  line('Coverage on file:', booking.coverage_label);
  line('Deposit paid:', `$${booking.deposit.toFixed(2)}`);
  line('Balance due at pickup:', `$${booking.due_at_pickup.toFixed(2)}`);
  doc.moveDown(0.8);

  // Initialed clauses
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Acknowledged Terms (initialed by renter)');
  doc.moveDown(0.4);
  for (const c of INITIAL_CLAUSES) {
    const initials = (signature.initials && signature.initials[c.key]) || '';
    const y = doc.y;
    doc.roundedRect(54, y, 46, 24, 4).stroke(AMBER);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(initials.toUpperCase(), 54, y + 7, { width: 46, align: 'center' });
    doc.font('Helvetica').fontSize(9.5).fillColor('#222').text(c.text, 110, y + 3, { width: doc.page.width - 110 - 54 });
    doc.y = Math.max(doc.y, y + 30);
  }
  doc.moveDown(0.8);

  // Signature
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Signature');
  doc.moveDown(0.4);
  doc.font('Helvetica-Oblique').fontSize(20).fillColor('#111').text(signature.fullName || '', { width: 300 });
  doc.moveTo(54, doc.y + 2).lineTo(354, doc.y + 2).stroke('#999');
  doc.font('Helvetica').fontSize(9).fillColor('#555').text(`Signed electronically on ${signature.signedAt}`, 54, doc.y + 6);
  doc.text(`${businessName}${businessPhone ? ' · ' + businessPhone : ''}`, { align: 'left' });

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}

export { AGREEMENTS_DIR };
