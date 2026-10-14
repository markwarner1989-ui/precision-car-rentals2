const BASE = '/api';
async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export const api = {
  meta: () => fetch(`${BASE}/meta`).then(json),
  categories: (pickup, ret) => fetch(`${BASE}/categories${pickup && ret ? `?pickup=${encodeURIComponent(pickup)}&return=${encodeURIComponent(ret)}` : ''}`).then(json),
  insuranceFollowup: (body) => fetch(`${BASE}/insurance-followup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json),
  quote: (body) => fetch(`${BASE}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json),
  createBooking: (fd) => fetch(`${BASE}/bookings`, { method: 'POST', body: fd }).then(json),
  // agreement
  getAgreement: (token) => fetch(`${BASE}/agreement/${token}`).then(json),
  signAgreement: (token, body) => fetch(`${BASE}/agreement/${token}/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json),
  // admin
  login: (email, password) => fetch(`${BASE}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(json),
  adminGet: (path, token) => fetch(`${BASE}/admin${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(json),
  adminPost: (path, token, body) => fetch(`${BASE}/admin${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}) }).then(json),
  adminPut: (path, token, body) => fetch(`${BASE}/admin${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}) }).then(json),
  adminPatch: (path, token, body) => fetch(`${BASE}/admin${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}) }).then(json),
  adminDelete: (path, token) => fetch(`${BASE}/admin${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).then(json),
};
export const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
