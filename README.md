# Precision Car Rentals — Online Booking & Rental-Agreement Platform

A complete booking system: customers reserve a **vehicle class**, tell you the insurance
they already carry, pay a fixed deposit, upload their documents, and (once you approve and
assign a specific car) sign a rental agreement that auto-fills that car's VIN and plate.

## What's included

**Customer booking flow**
- Dates + pickup location — **Charlotte Airport**, **Gastonia**, or **delivery to their address**
- Vehicle **class** selection (not a specific car) with representative photos and live availability
- **"What insurance do you currently have?"** — asks about the customer's *own* policy (must be in
  their name); options are Liability, Full Coverage, or None
- Two-stage insurance: a follow-up screen tells them what (if anything) they must buy —
  liability holders buy collision at a daily surcharge added to the pickup balance; full-coverage
  holders buy nothing; uninsured drivers are politely blocked
- Document upload that changes by coverage (license / insurance card / declaration page)
- First name, last name, date of birth, contact details
- Deposit payment with billing name, address, and card captured for pickup matching & disputes

**Admin panel** (`/admin`)
- Review bookings; see each customer's **billing name, address, and card last-4** for pickup match
- Approve → **assign a specific available car** → system emails the customer an agreement link
- Decline with notes
- **Vehicle inventory** — every car with its VIN and license plate
- **Availability** — block an entire class *or* a specific car (e.g. out on Turo, in the shop)
- Live stats: totals, pending, approved, signed, deposits collected

**Rental agreement e-signing** (`/sign/:token`)
- Auto-populates the assigned car's VIN, plate, and details
- Customer initials each clause (clean return, no smoking, fuel, authorized driver) and signs
- Generates a PDF, emails a copy to the customer, and stores it for you to print

**Notifications**
- Instant SMS + email to the business when a deposit is paid
- Confirmation tells the customer they can call **or text**

## Tech
React + Vite (frontend) · Node + Express + SQLite (backend) · PDFKit (agreements) ·
Cardknox/Sola (payments) · Twilio (SMS) · SendGrid (email). One service serves both the API
and the built frontend.

## Run locally
```bash
cd server && cp .env.example .env && npm install && npm run seed
cd ../client && npm install && npm run build
cd ../server && npm start          # serves API + site at http://localhost:4000
# or, for development with hot reload, run the client separately:
cd client && npm run dev           # http://localhost:5173
```
Admin: `/admin` — `admin@precisioncarrentals.us` / `changeme123` (change these).

## Modes
Everything ships in **mock mode** so you can demo without real charges, texts, or emails:
- `PAYMENT_MODE=mock` — simulates approved deposits (card containing "decline" fails)
- `SMS_MODE=mock` / `EMAIL_MODE=mock` — log to the server console instead of sending

Flip each to `live` and add the matching keys (`CARDKNOX_API_KEY`, Twilio, `SENDGRID_API_KEY`)
when you're ready. In production set **`PUBLIC_URL`** to your live URL so the emailed
agreement links resolve.

## Deploy
See `DEPLOY-RENDER.md` for one-click Render deployment.

## Going to production
- Swap SQLite for Postgres and move uploads/agreements to cloud storage (files reset on
  redeploy on Render's free tier).
- Point payments/SMS/email to live keys.
- Change the admin password and `JWT_SECRET`.
