# Deploying to Render

This app is one web service that serves both the API and the website.

## Option A — Blueprint (easiest)

1. Push this folder to a GitHub repo.
2. In Render, click **New → Blueprint** and pick the repo. Render reads `render.yaml`.
3. Name the service and click **Apply**. First build takes a few minutes (it installs the
   server, installs and builds the client, then starts).
4. When it's live you'll get a URL like `https://precision-car-rentals.onrender.com`.
   - Booking site: `/`
   - Admin: `/admin`
   - Agreement signing: `/sign/:token` (opened from the email link)

## Option B — Manual

New → **Web Service** → connect the repo, then:
- **Root Directory:** `server`
- **Build Command:** `npm install && cd ../client && npm install && npm run build`
- **Start Command:** `npm start`
- Add the environment variables listed in `server/.env.example`.

## Important environment variables

| Variable | Set to |
|---|---|
| `PUBLIC_URL` | your live Render URL (so emailed agreement links work) |
| `ADMIN_PASSWORD`, `JWT_SECRET` | change from the defaults |
| `PAYMENT_MODE` | `mock` to demo, `live` + `CARDKNOX_API_KEY` for real deposits |
| `SMS_MODE` | `mock`, or `live` + Twilio keys |
| `EMAIL_MODE` | `mock`, or `live` + `SENDGRID_API_KEY` |

## Free-tier notes
- The service **sleeps after ~15 min idle**; the first request then takes ~30–60s to wake.
- **Data and uploaded files reset on redeploy/restart** (SQLite + local disk). Fine for a demo.
  For real bookings, add a Render Postgres database and cloud file storage, and set
  `PAYMENT_MODE=live`.
- In mock mode, SMS/email "sends" appear in the Render **Logs** tab.
