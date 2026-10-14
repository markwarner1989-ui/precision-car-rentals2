import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import agreementRoutes from './routes/agreement.js';
import { paymentMode } from './lib/payments.js';
import { AGREEMENTS_DIR } from './lib/agreement.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/agreements', express.static(AGREEMENTS_DIR));

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agreement', agreementRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, paymentMode, time: new Date().toISOString() }));

// Serve built frontend (single-service deploy, e.g. Render)
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/agreements')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n✅ Precision Car Rentals API on http://localhost:${PORT}`);
  console.log(`   Payment mode: ${paymentMode.toUpperCase()}`);
});
