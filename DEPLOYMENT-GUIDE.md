# Precision Car Rentals — Deployment Guide

This guide covers deploying the full app (front end + back end) with all the
features from the client call. It's one app: the Node back end also serves the
built React front end, so you deploy a **single service** on Render.

---

## 1. What you're deploying (final feature set)

**Customer booking flow**
- Dates + pickup location: **Charlotte Airport**, **Gastonia**, or **delivery to address**
- Vehicle **class** selection (not a specific car) with photos + live availability
- Insurance — two-question flow:
  1. **"Do you have your own insurance?"** → Yes / No
  2. **Yes** → "What kind?" → Full Coverage (buy nothing) or Liability (buy collision $25/day → pickup balance)
  3. **No** → **Precision insurance package $45/day → added to the deposit (due now)**
- Documents change by answer: Full = license + card + declaration page · Liability = license + card · Package = license + payment card photo
- First name, last name, date of birth, contact details
- Deposit paid now; billing name + address + card last-4 captured for pickup matching & Cardknox disputes

**Admin panel** (`/admin`)
- Review bookings; see billing name/address/card last-4
- Approve → assign a specific available car → emails the customer an agreement link
- Full vehicle inventory (each car with VIN + plate)
- Block a whole class **or** a specific car (Turo / shop)
- Live stats

**Rental agreement** (`/sign/:token`)
- Auto-fills the assigned car's VIN + plate
- Customer initials each clause + signs → PDF generated, emailed, stored for printing

**Notifications** — instant SMS + email to the business on each paid booking; confirmation says "call or text us."

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Front end | React + Vite |
| Back end | Node + Express |
| Database | SQLite (file-based) |
| Agreements | PDFKit |
| Payments | Cardknox / Sola |
| SMS | Twilio |
| Email | SendGrid |

The front end is built into static files that the back end serves, so there is **one** service to deploy.

---

## 3. Run locally first (to test)

```bash
# Back end
cd server
cp .env.example .env
npm install
npm run seed            # loads categories, cars, insurance options

# Front end (build it so the back end can serve it)
cd ../client
npm install
npm run build

# Start everything
cd ../server
npm start               # http://localhost:4000
```

Open:
- `http://localhost:4000` — customer booking site
- `http://localhost:4000/admin` — admin (login `admin@precisioncarrentals.us` / `changeme123`)

Everything runs in **mock mode** by default — no real charges, texts, or emails. Mock card: `4111 1111 1111 1111` (include the word "decline" to test a failure).

---

## 4. Deploy on Render (recommended — free tier works)

### Step 1 — Put the code on GitHub
Create a new repo and push this whole folder (the `.gitignore` already excludes `node_modules`, `.env`, and the database).

### Step 2 — Create the service from the blueprint
1. Log in at **render.com** → **New → Blueprint**
2. Connect your GitHub repo. Render reads `render.yaml` automatically.
3. Click **Apply**. First build takes a few minutes (installs back end, installs + builds front end, starts).
4. You get a URL like `https://precision-car-rentals.onrender.com`.

### Step 3 — Set the live URL
In the service's **Environment** tab, set:
- **`PUBLIC_URL`** = your live Render URL (e.g. `https://precision-car-rentals.onrender.com`)

This is required so the emailed rental-agreement links point to the right place. Save → it redeploys.

### Manual alternative (instead of the blueprint)
New → **Web Service** → connect repo, then:
- **Root Directory:** `server`
- **Build Command:** `npm install && cd ../client && npm install && npm run build`
- **Start Command:** `npm start`
- Add the env vars from `server/.env.example`.

---

## 5. Environment variables

Change these from the defaults before going live:

| Variable | What to set |
|---|---|
| `PUBLIC_URL` | your live URL (agreement email links) |
| `ADMIN_PASSWORD` | a strong password |
| `JWT_SECRET` | a long random string |
| `BUSINESS_PHONE` | the business number shown on confirmations/agreement |

Switch each service from mock to live when ready:

| Variable | Mock (default) | Live |
|---|---|---|
| `PAYMENT_MODE` | `mock` | `live` + `CARDKNOX_API_KEY` |
| `SMS_MODE` | `mock` | `live` + `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `BUSINESS_SMS_TO` |
| `EMAIL_MODE` | `mock` | `live` + `SENDGRID_API_KEY`, `EMAIL_FROM` |

In mock mode, "sent" SMS/emails appear in Render's **Logs** tab.

---

## 6. Free-tier notes (important)

- The service **sleeps after ~15 min idle**; the first request after that takes ~30–60s to wake.
- **Data and uploaded files reset on redeploy/restart** (SQLite + local disk). Fine for demos and early use.
- **For real production bookings**, upgrade to: a **Render Postgres** database (so bookings persist) + **cloud file storage** (S3 / Cloudflare R2) for uploaded documents and signed agreements. These are swap-ins; the rest of the app stays the same.

---

## 7. First things to do after deploy
1. Log into `/admin`, change the password.
2. Go to **Cars** → enter the real fleet (VIN + plate each).
3. Set category pricing + deposits if they differ from the seed defaults.
4. Send the client the link to test on their phone.
