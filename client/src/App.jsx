import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Booking from './pages/Booking.jsx';
import Admin from './pages/Admin.jsx';
import Agreement from './pages/Agreement.jsx';
import { api } from './lib/api.js';

function BookingRoute() {
  const [meta, setMeta] = useState(null);
  useEffect(() => { api.meta().then(setMeta).catch(() => setMeta({})); }, []);
  if (!meta) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;
  return <Booking meta={meta} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookingRoute />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/sign/:token" element={<Agreement />} />
      </Routes>
    </BrowserRouter>
  );
}
