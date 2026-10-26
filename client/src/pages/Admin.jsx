import React, { useEffect, useState } from 'react';
import { api, money } from '../lib/api.js';

export default function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem('pcr_admin') || '');
  if (!token) return <Login onLogin={(t) => { localStorage.setItem('pcr_admin', t); setToken(t); }} />;
  return <Dashboard token={token} onLogout={() => { localStorage.removeItem('pcr_admin'); setToken(''); }} />;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@precisioncarrentals.us');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() { setBusy(true); setError(''); try { const d = await api.login(email, password); onLogin(d.token); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return (
    <div className="login-wrap"><div className="login-card">
      <div className="brand" style={{ marginBottom: 20 }}><div className="brand-mark">P</div><div className="brand-name">Precision Admin<span>Booking control</span></div></div>
      {error && <div className="note note-error">{error}</div>}
      <div className="field"><label>Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label>Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>
      <button className="btn btn-teal btn-block" disabled={busy} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </div></div>
  );
}

function Dashboard({ token, onLogout }) {
  const [stats, setStats] = useState(null);
  const [view, setView] = useState('dashboard');
  const [tab, setTab] = useState('pending');
  const [bookings, setBookings] = useState([]);
  const [active, setActive] = useState(null);

  const loadStats = () => api.adminGet('/stats', token).then((d) => setStats(d.stats)).catch(() => {});
  const loadBookings = () => api.adminGet(`/bookings${tab === 'all' ? '' : `?status=${tab}`}`, token).then((d) => setBookings(d.bookings)).catch(() => {});
  useEffect(() => { loadStats(); }, []);
  useEffect(() => { if (view === 'bookings') loadBookings(); }, [tab, view]);
  const refresh = () => { loadStats(); loadBookings(); };

  return (
    <div className="admin-shell">
      <div className="admin-top"><div className="container">
        <div className="brand"><div className="brand-mark">P</div><div className="brand-name" style={{ color: '#fff' }}>Precision Admin<span style={{ color: '#bfe0dc' }}>Booking control</span></div></div>
        <button className="btn btn-ghost" onClick={onLogout}>Sign out</button>
      </div></div>
      <div className="container">
        {stats && (
          <div className="stat-grid">
            <Stat n={stats.total} l="Total" /><Stat n={stats.pending} l="Pending" /><Stat n={stats.approved} l="Approved" />
            <Stat n={stats.signed} l="Signed" /><Stat n={money(stats.deposits_collected)} l="Deposits" />
          </div>
        )}
        <div className="tabs">
          {['dashboard', 'bookings', 'rentals', 'customers', 'cars', 'pricing', 'addons', 'availability', 'calendar'].map((v) => (
            <button key={v} className={`tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        {view === 'bookings' && (
          <>
            <div className="tabs">
              {['pending', 'approved', 'declined', 'all'].map((t) => (
                <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            <BookingsTable bookings={bookings} onOpen={setActive} />
          </>
        )}
        {view === 'cars' && <CarsManager token={token} />}
        {view === 'dashboard' && <DashboardView token={token} />}
        {view === 'rentals' && <RentalsView token={token} onOpen={setActive} />}
        {view === 'customers' && <CustomersView token={token} />}
        {view === 'pricing' && <PricingManager token={token} />}
        {view === 'addons' && <AddonsManager token={token} />}
        {view === 'calendar' && <CalendarView token={token} />}
        {view === 'availability' && <Availability token={token} />}
      </div>
      {active && <BookingModal booking={active} token={token} onClose={() => setActive(null)} onChanged={() => { setActive(null); refresh(); }} />}
    </div>
  );
}

const Stat = ({ n, l }) => <div className="stat"><div className="n">{n}</div><div className="l">{l}</div></div>;

function BookingsTable({ bookings, onOpen }) {
  if (!bookings.length) return <div className="panel panel-pad">No bookings here yet.</div>;
  return (
    <table className="bk-table">
      <thead><tr><th>Ref</th><th>Customer</th><th>Class</th><th>Dates</th><th>Deposit</th><th>Status</th><th>Agreement</th></tr></thead>
      <tbody>
        {bookings.map((b) => (
          <tr key={b.id} className="clickable" onClick={() => onOpen(b)}>
            <td><strong>{b.reference}</strong></td>
            <td>{b.first_name} {b.last_name}</td>
            <td>{b.category_name}</td>
            <td>{b.pickup_at.slice(0, 10)} → {b.return_at.slice(0, 10)}</td>
            <td>{money(b.deposit)}</td>
            <td><span className={`badge ${b.status}`}>{b.status}</span></td>
            <td>{b.agreement_status !== 'none' ? <span className={`badge ${b.agreement_status}`}>{b.agreement_status}</span> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BookingModal({ booking: b, token, onClose, onChanged }) {
  const [cars, setCars] = useState([]);
  const [carId, setCarId] = useState(b.assigned_car_id || '');
  const [notes, setNotes] = useState(b.admin_notes || '');
  const [busy, setBusy] = useState(false);
  const [signUrl, setSignUrl] = useState('');

  useEffect(() => {
    if (b.status === 'pending') api.adminGet(`/bookings/${b.id}/available-cars`, token).then((d) => setCars(d.cars)).catch(() => {});
  }, []);

  async function approve() {
    if (!carId) { alert('Assign a specific vehicle first.'); return; }
    setBusy(true);
    try { await api.adminPost(`/bookings/${b.id}/approve`, token, { assignedCarId: carId, notes }); alert('Reservation confirmed. The customer gets a confirmation email now — the rental agreement is sent on pickup day once you record the starting odometer.'); onChanged(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function decline() { setBusy(true); try { await api.adminPost(`/bookings/${b.id}/decline`, token, { notes }); onChanged(); } catch (e) { alert(e.message); } finally { setBusy(false); } }

  // edit / lifecycle / refund state
  const [editP, setEditP] = useState(b.pickup_at); const [editR, setEditR] = useState(b.return_at); const [editDue, setEditDue] = useState(b.due_at_pickup);
  const [refundAmt, setRefundAmt] = useState('');
  async function saveEdit() { setBusy(true); try { await api.adminPatch(`/bookings/${b.id}`, token, { pickup_at: editP, return_at: editR, due_at_pickup: Number(editDue) }); onChanged(); } catch (e) { alert(e.message); } finally { setBusy(false); } }
  async function startRental() { setBusy(true); try { await api.adminPost(`/bookings/${b.id}/start`, token, {}); onChanged(); } catch (e) { alert(e.message); } finally { setBusy(false); } }
  async function completeRental() { setBusy(true); try { await api.adminPost(`/bookings/${b.id}/complete`, token, {}); onChanged(); } catch (e) { alert(e.message); } finally { setBusy(false); } }
  async function cancelBooking() { if (!confirm('Cancel this booking?')) return; setBusy(true); try { await api.adminPost(`/bookings/${b.id}/cancel`, token, { reason: notes }); onChanged(); } catch (e) { alert(e.message); } finally { setBusy(false); } }
  async function doRefund() {
    const amt = Number(refundAmt); if (!amt) { alert('Enter a refund amount'); return; }
    setBusy(true);
    try { const r = await api.adminPost(`/bookings/${b.id}/refund`, token, { amount: amt }); alert(`Refund processed: $${amt} (ref ${r.ref})`); onChanged(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  // odometer workflow (numbers only — no photos)
  const [odoStart, setOdoStart] = useState(b.odo_start ?? '');
  const [odoEnd, setOdoEnd] = useState(b.odo_end ?? '');
  async function startOdometer() {
    if (odoStart === '') { alert('Enter the starting odometer reading.'); return; }
    setBusy(true);
    try {
      const r = await api.adminPost(`/bookings/${b.id}/odometer/start`, token, { odoStart: Number(odoStart) });
      alert(`Starting odometer recorded (${Number(odoStart).toLocaleString()} mi). Agreement sent to the customer. Mileage included: ${r.milesAllowed.toLocaleString()} mi.`);
      onChanged();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function endOdometer() {
    if (odoEnd === '') { alert('Enter the ending odometer reading.'); return; }
    setBusy(true);
    try {
      const r = await api.adminPost(`/bookings/${b.id}/odometer/end`, token, { odoEnd: Number(odoEnd) });
      const over = r.overMiles > 0 ? `\nOver the ${r.milesAllowed.toLocaleString()}-mile allowance by ${r.overMiles.toLocaleString()} mi → overage charge $${r.overageCharge.toFixed(2)} ($${r.overagePerMile}/mi).` : `\nWithin the ${r.milesAllowed.toLocaleString()}-mile allowance — no overage.`;
      alert(`Rental completed. Miles driven: ${r.milesDriven.toLocaleString()}.${over}`);
      onChanged();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  const loc = b.pickup_location === 'delivery' ? `Delivery — ${b.delivery_address || ''}` : b.pickup_location === 'charlotte_airport' ? 'Charlotte Airport' : 'Gastonia';
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel-pad" onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginTop: 0 }}>
          <h2 className="section-title" style={{ margin: 0 }}>{b.reference}</h2>
          <span className={`badge ${b.status}`}>{b.status}</span>
        </div>
        <dl className="kv">
          <dt>Customer</dt><dd>{b.first_name} {b.last_name}</dd>
          <dt>Date of birth</dt><dd>{b.dob}</dd>
          <dt>Phone</dt><dd>{b.cell_phone}</dd>
          <dt>Email</dt><dd>{b.email}</dd>
          <dt>Address</dt><dd>{b.address}</dd>
          <dt>Class</dt><dd>{b.category_name}</dd>
          <dt>Pickup</dt><dd>{b.pickup_at.replace('T', ' ')} — {loc}</dd>
          <dt>Return</dt><dd>{b.return_at.replace('T', ' ')}</dd>
          <dt>Coverage</dt><dd>{b.coverage_label}</dd>
          <dt>Deposit paid</dt><dd>{money(b.deposit)} · {b.payment_status} ({b.payment_mode})</dd>
          <dt>Due at pickup</dt><dd>{money(b.due_at_pickup)}</dd>
        </dl>

        <div className="note note-info" style={{ marginBottom: 14 }}>
          <strong>Card match (for pickup):</strong> {b.billing_name || '—'} · {b.billing_address || '—'} · card ending <strong>{b.card_last4 || '—'}</strong>
        </div>

        <div className="field">
          <label>Documents</label>
          <div className="doc-thumbs">
            {b.license_url && <a href={b.license_url} target="_blank" rel="noreferrer">License ↗</a>}
            {b.insurance_urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer">Insurance {i + 1} ↗</a>)}
            {b.agreement_url && <a href={b.agreement_url} target="_blank" rel="noreferrer">Signed agreement ↗</a>}
          </div>
        </div>

        {b.status === 'pending' && (
          <>
            <div className="field"><label>Assign specific vehicle (VIN auto-fills the agreement)</label>
              <select className="select" value={carId} onChange={(e) => setCarId(e.target.value)}>
                <option value="">Select an available car…</option>
                {cars.map((c) => <option key={c.id} value={c.id}>{c.year} {c.make} {c.model} ({c.color}) — {c.license_plate} — VIN {c.vin}</option>)}
              </select>
              {!cars.length && <div className="note note-warn" style={{ marginTop: 10 }}>No cars free for these dates. Add cars or clear a block first.</div>}
            </div>
            <div className="field"><label>Notes</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Verification notes" /></div>
            <div className="note note-info" style={{ fontSize: 13 }}>Approving confirms the reservation and emails the customer. The rental agreement is sent on <strong>pickup day</strong>, after you record the starting odometer below.</div>
            <div className="row-between">
              <button className="btn btn-ghost" disabled={busy} onClick={decline}>Decline</button>
              <button className="btn btn-teal" disabled={busy} onClick={approve}>Approve & confirm</button>
            </div>
          </>
        )}
        {b.status !== 'pending' && (
          <>
            {b.assigned_car && <p><strong>Assigned:</strong> {b.assigned_car.desc} · VIN {b.assigned_car.vin} · {b.assigned_car.plate}</p>}
            {b.admin_notes && <p><strong>Notes:</strong> {b.admin_notes}</p>}
            {b.sign_path && (
              <div className="note note-info">
                {b.agreement_status === 'signed' ? 'Signed. ' : 'Awaiting signature. '}
                Customer sign link:<br />
                <a href={b.sign_path} target="_blank" rel="noreferrer">{window.location.origin}{b.sign_path}</a>
              </div>
            )}

            {b.status === 'approved' && b.lifecycle !== 'cancelled' && (
              <>
                {/* Pickup-day & return odometer workflow — drives the whole rental */}
                <div className="field" style={{ marginTop: 14 }}>
                  <label><strong>Rental workflow</strong></label>

                  {b.lifecycle === 'booking' && (
                    <div className="note note-info" style={{ marginTop: 6 }}>
                      <strong>On pickup day:</strong> enter the vehicle's starting odometer. This sends the rental agreement to the customer (with the starting mileage) and starts the rental.
                      <div className="grid-2" style={{ marginTop: 10 }}>
                        <div className="field" style={{ margin: 0 }}><label>Starting odometer (miles)</label><input className="input" type="number" min="0" value={odoStart} onChange={(e) => setOdoStart(e.target.value)} placeholder="e.g. 50000" /></div>
                        <div className="field" style={{ margin: 0, alignSelf: 'end' }}><button className="btn btn-teal" disabled={busy} onClick={startOdometer}>Record start & send agreement</button></div>
                      </div>
                    </div>
                  )}

                  {b.lifecycle === 'active' && (
                    <div className="note note-info" style={{ marginTop: 6 }}>
                      {b.agreement_status !== 'signed' && <div className="note note-warn" style={{ marginBottom: 8 }}>Agreement not signed yet — the sign link was emailed to the customer.</div>}
                      <div>Started at <strong>{Number(b.odo_start).toLocaleString()} mi</strong> · {b.miles_allowed?.toLocaleString()} mi included.</div>
                      <strong>On return:</strong> enter the ending odometer to close the rental and calculate any mileage overage.
                      <div className="grid-2" style={{ marginTop: 10 }}>
                        <div className="field" style={{ margin: 0 }}><label>Ending odometer (miles)</label><input className="input" type="number" min="0" value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} placeholder="e.g. 50600" /></div>
                        <div className="field" style={{ margin: 0, alignSelf: 'end' }}><button className="btn btn-teal" disabled={busy} onClick={endOdometer}>Record return & complete</button></div>
                      </div>
                    </div>
                  )}

                  {b.lifecycle === 'completed' && b.mileage && (
                    <div className="note note-info" style={{ marginTop: 6 }}>
                      <strong>Completed.</strong> {Number(b.mileage.start).toLocaleString()} → {Number(b.mileage.end).toLocaleString()} mi · drove <strong>{Number(b.mileage.driven).toLocaleString()} mi</strong> of {Number(b.mileage.allowed).toLocaleString()} allowed.
                      {b.mileage.overMiles > 0
                        ? <div style={{ marginTop: 4, color: '#9a3412' }}><strong>{b.mileage.overMiles.toLocaleString()} mi over → ${b.mileage.overageCharge.toFixed(2)} overage</strong> (${b.mileage.overagePerMile}/mi).</div>
                        : <div style={{ marginTop: 4, color: 'var(--teal)' }}>Within allowance — no overage.</div>}
                    </div>
                  )}

                  <div className="tabs" style={{ marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={cancelBooking}>Cancel booking</button>
                  </div>
                </div>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Edit reservation (extend / change price)</summary>
                  <div className="grid-2" style={{ marginTop: 10 }}>
                    <div className="field"><label>Pickup</label><input className="input" type="datetime-local" value={(editP || '').slice(0, 16)} onChange={(e) => setEditP(e.target.value)} /></div>
                    <div className="field"><label>Return</label><input className="input" type="datetime-local" value={(editR || '').slice(0, 16)} onChange={(e) => setEditR(e.target.value)} /></div>
                  </div>
                  <div className="field"><label>Balance due at pickup ($)</label><input className="input" type="number" min="0" value={editDue} onChange={(e) => setEditDue(e.target.value)} /></div>
                  <button className="btn btn-teal btn-sm" disabled={busy} onClick={saveEdit}>Save changes</button>
                </details>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Refund deposit {b.refunded_total > 0 && <span style={{ color: 'var(--ink-soft)' }}>(already refunded {money(b.refunded_total)})</span>}</summary>
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Refund amount ($) — deposit paid {money(b.deposit)}</label>
                    <input className="input" type="number" min="0" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} placeholder="Full or partial amount" />
                  </div>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={doRefund}>Process refund</button>
                  {(b.refunds_list || []).length > 0 && (
                    <div className="note note-info" style={{ marginTop: 10, fontSize: 13 }}>
                      {b.refunds_list.map((r, i) => <div key={i}>{r.type} refund {money(r.amount)} · {r.at}</div>)}
                    </div>
                  )}
                </details>

              </>
            )}

            <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}

function RentalsView({ token, onOpen }) {
  const [tab, setTab] = useState('active');
  const [rows, setRows] = useState([]);
  const load = () => api.adminGet(`/rentals?lifecycle=${tab}`, token).then((d) => setRows(d.bookings)).catch(() => {});
  useEffect(() => { load(); }, [tab]);
  const labels = { booking: 'Upcoming bookings', active: 'Active rentals', completed: 'Completed rentals', cancelled: 'Cancelled' };
  return (
    <div>
      <p className="section-sub"><strong>Bookings</strong> are reservations not yet started. <strong>Rentals</strong> are cars currently out (active) or returned (completed).</p>
      <div className="tabs">
        {['booking', 'active', 'completed', 'cancelled'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{labels[t]}</button>
        ))}
      </div>
      {!rows.length ? <div className="panel panel-pad">Nothing here yet.</div> : (
        <table className="bk-table">
          <thead><tr><th>Ref</th><th>Customer</th><th>Class</th><th>Dates</th><th>Vehicle</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="clickable" onClick={() => onOpen(b)}>
                <td><strong>{b.reference}</strong></td>
                <td>{b.first_name} {b.last_name}</td>
                <td>{b.category_name}</td>
                <td>{b.pickup_at.slice(0, 10)} → {b.return_at.slice(0, 10)}</td>
                <td>{b.assigned_car ? b.assigned_car.plate : '—'}</td>
                <td><span className={`badge ${b.status}`}>{b.lifecycle}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CustomersView({ token }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.adminGet('/customers', token).then((d) => setRows(d.customers)).catch(() => {}); }, []);
  return (
    <div>
      <h2 className="section-title" style={{ fontSize: 20 }}>Customers</h2>
      <p className="section-sub">Everyone who has booked, with their totals.</p>
      {!rows.length ? <div className="panel panel-pad">No customers yet.</div> : (
        <table className="bk-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Bookings</th><th>Total deposits</th><th>Last booking</th></tr></thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={i}>
                <td><strong>{c.first_name} {c.last_name}</strong></td>
                <td>{c.email}</td>
                <td>{c.cell_phone}</td>
                <td>{c.bookings}</td>
                <td>{money(c.total_deposits)}</td>
                <td>{(c.last_booking || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DashboardView({ token }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = () => { setErr(''); api.adminGet('/dashboard', token).then(setD).catch((e) => setErr(e.message || 'Could not reach the server')); };
  useEffect(() => { load(); }, []);
  if (err) return <div className="panel panel-pad"><div className="note note-error">Couldn’t load the dashboard: {err}</div><button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>;
  if (!d) return <div className="panel panel-pad">Loading dashboard…</div>;
  const t = d.totals;
  const maxTrend = Math.max(1, ...d.trend.map((x) => x.count));
  const maxClass = Math.max(1, ...d.byClass.map((x) => x.count));
  const palette = ['#0d3b40', '#e08a2b', '#1e7a46', '#2456a6', '#9a5a12'];
  return (
    <div>
      <div className="stat-grid">
        <Stat n={t.total} l="Total bookings" /><Stat n={t.active} l="Active rentals" /><Stat n={t.completed} l="Completed" />
        <Stat n={money(t.deposits)} l="Deposits collected" /><Stat n={money(t.pickup_revenue)} l="Pickup revenue" /><Stat n={money(t.addon_revenue)} l="Add-on revenue" />
      </div>
      <div className="split" style={{ marginTop: 8 }}>
        <div className="panel panel-pad">
          <h3 className="section-title" style={{ fontSize: 18 }}>Bookings — last 14 days</h3>
          {d.trend.length === 0 ? <p className="section-sub">No bookings yet.</p> : (
            <svg viewBox="0 0 520 180" style={{ width: '100%', height: 'auto' }}>
              {d.trend.map((x, i) => {
                const bw = 520 / d.trend.length;
                const h = (x.count / maxTrend) * 130;
                return <g key={i}>
                  <rect x={i * bw + 6} y={150 - h} width={bw - 12} height={h} rx="3" fill="#0d3b40" />
                  <text x={i * bw + bw / 2} y={168} fontSize="8" fill="#888" textAnchor="middle">{x.day.slice(5)}</text>
                  {x.count > 0 && <text x={i * bw + bw / 2} y={145 - h} fontSize="9" fill="#0d3b40" textAnchor="middle" fontWeight="bold">{x.count}</text>}
                </g>;
              })}
            </svg>
          )}
        </div>
        <div className="panel panel-pad">
          <h3 className="section-title" style={{ fontSize: 18 }}>Bookings by vehicle class</h3>
          {d.byClass.length === 0 ? <p className="section-sub">No bookings yet.</p> : (
            <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
              {d.byClass.map((c, i) => (
                <div key={c.category_name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                    <strong>{c.category_name}</strong><span>{c.count} · {money(c.deposits)}</span>
                  </div>
                  <div style={{ background: '#eee', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                    <div style={{ width: `${(c.count / maxClass) * 100}%`, height: '100%', background: palette[i % palette.length], borderRadius: 6 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarView({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);
  const load = () => { setErr(''); api.adminGet('/calendar', token).then(setData).catch((e) => setErr(e.message || 'Could not reach the server')); };
  useEffect(() => { load(); }, []);
  if (err) return <div className="panel panel-pad"><div className="note note-error">Couldn’t load the calendar: {err}</div><button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>;
  if (!data) return <div className="panel panel-pad">Loading calendar…</div>;

  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = base.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const inRange = (b, day) => {
    const d = new Date(year, month, day);
    const s = new Date(b.pickup_at.slice(0, 10)); const e = new Date(b.return_at.slice(0, 10));
    return d >= new Date(s.toDateString()) && d <= new Date(e.toDateString());
  };
  const carBlocked = (carId, day) => {
    const d = new Date(year, month, day);
    return data.carBlocks.some((bl) => bl.car_id === carId && d >= new Date(bl.start_date) && d <= new Date(bl.end_date));
  };

  // group cars by class
  const byClass = {};
  data.cars.forEach((c) => { (byClass[c.category_name] ||= []).push(c); });

  return (
    <div className="panel panel-pad">
      <div className="row-between" style={{ marginTop: 0 }}>
        <h2 className="section-title" style={{ fontSize: 20, margin: 0 }}>Fleet calendar — {monthLabel}</h2>
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonthOffset(monthOffset - 1)}>← Prev</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => setMonthOffset(0)}>Today</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => setMonthOffset(monthOffset + 1)}>Next →</button>
        </div>
      </div>
      <p className="section-sub">Each row is one car, grouped by class. Amber = booked, grey = blocked (Turo/shop), empty = free.</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', position: 'sticky', left: 0, background: '#fff', minWidth: 180 }}>Vehicle</th>
              {days.map((d) => <th key={d} style={{ width: 22, padding: 2, color: '#888', fontWeight: 500 }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(byClass).map(([cls, cars]) => (
              <React.Fragment key={cls}>
                <tr><td colSpan={daysInMonth + 1} style={{ background: '#f2efe6', fontWeight: 700, color: 'var(--teal)', padding: '4px 8px' }}>{cls}</td></tr>
                {cars.map((car) => (
                  <tr key={car.id}>
                    <td style={{ padding: '3px 8px', position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>
                      {car.year} {car.make} {car.model} <span style={{ color: '#999' }}>{car.license_plate}</span>
                    </td>
                    {days.map((day) => {
                      const booking = data.bookings.find((b) => b.assigned_car_id === car.id && inRange(b, day));
                      const blocked = carBlocked(car.id, day);
                      const bg = booking ? '#e08a2b' : blocked ? '#c9ccce' : 'transparent';
                      return <td key={day} title={booking ? `${booking.reference} — ${booking.first_name} ${booking.last_name}` : blocked ? 'Blocked' : ''}
                        style={{ width: 22, height: 20, background: bg, border: '1px solid #f0ece3' }} />;
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddonsManager({ token }) {
  const [addons, setAddons] = useState([]);
  const [nf, setNf] = useState({ label: '', description: '', price: '', per: 'rental' });
  const [saving, setSaving] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api.adminGet('/addons', token).then((d) => setAddons(d.addons)).catch(() => {});
  useEffect(() => { load(); }, []);

  const setVal = (id, field, val) => setAddons(addons.map((a) => a.id === id ? { ...a, [field]: val } : a));
  async function save(a) {
    setSaving(a.id); setMsg('');
    try { await api.adminPatch(`/addons/${a.id}`, token, { label: a.label, description: a.description, price: Number(a.price), per: a.per }); setMsg(`Saved ${a.label}`); }
    catch (e) { setMsg(e.message); } finally { setSaving(''); }
  }
  async function remove(id) { if (confirm('Remove this add-on?')) { await api.adminDelete(`/addons/${id}`, token); load(); } }
  async function add() {
    if (!nf.label.trim() || nf.price === '') return;
    setSaving('new'); setMsg('');
    try { await api.adminPost('/addons', token, { ...nf, price: Number(nf.price) }); setNf({ label: '', description: '', price: '', per: 'rental' }); load(); setMsg('Add-on added'); }
    catch (e) { setMsg(e.message); } finally { setSaving(''); }
  }

  return (
    <div className="split">
      <div className="panel panel-pad">
        <h2 className="section-title" style={{ fontSize: 20 }}>Reservation add-ons</h2>
        <p className="section-sub">Extras customers can add during booking. “Per day” multiplies by rental length; “Per rental” is a flat fee.</p>
        {msg && <div className="note note-info">{msg}</div>}
        <table className="bk-table">
          <thead><tr><th>Name</th><th>Price ($)</th><th>Per</th><th></th></tr></thead>
          <tbody>
            {addons.map((a) => (
              <tr key={a.id}>
                <td style={{ minWidth: 180 }}>
                  <input className="input" value={a.label} onChange={(e) => setVal(a.id, 'label', e.target.value)} />
                  <input className="input" style={{ marginTop: 4, fontSize: 12 }} value={a.description || ''} onChange={(e) => setVal(a.id, 'description', e.target.value)} placeholder="Description" />
                </td>
                <td><input className="input" type="number" min="0" step="1" value={a.price} onChange={(e) => setVal(a.id, 'price', e.target.value)} style={{ maxWidth: 90 }} /></td>
                <td>
                  <select className="select" value={a.per} onChange={(e) => setVal(a.id, 'per', e.target.value)} style={{ maxWidth: 110 }}>
                    <option value="rental">per rental</option><option value="day">per day</option>
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-teal btn-sm" style={{ marginRight: 6 }} disabled={saving === a.id} onClick={() => save(a)}>{saving === a.id ? '…' : 'Save'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(a.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel panel-pad">
        <h3 className="section-title" style={{ fontSize: 18 }}>Add a new add-on</h3>
        <div className="field"><label>Name</label><input className="input" value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} placeholder="e.g. Pet Fee" /></div>
        <div className="field"><label>Description</label><input className="input" value={nf.description} onChange={(e) => setNf({ ...nf, description: e.target.value })} placeholder="Short description" /></div>
        <div className="grid-2">
          <div className="field"><label>Price ($)</label><input className="input" type="number" min="0" value={nf.price} onChange={(e) => setNf({ ...nf, price: e.target.value })} /></div>
          <div className="field"><label>Charged</label><select className="select" value={nf.per} onChange={(e) => setNf({ ...nf, per: e.target.value })}><option value="rental">Per rental</option><option value="day">Per day</option></select></div>
        </div>
        <button className="btn btn-teal btn-block" disabled={saving === 'new'} onClick={add}>{saving === 'new' ? 'Adding…' : 'Add add-on'}</button>
      </div>
    </div>
  );
}

function PricingManager({ token }) {
  const [cats, setCats] = useState([]);
  const [ins, setIns] = useState([]);
  const [saving, setSaving] = useState('');
  const [msg, setMsg] = useState('');
  const [settings, setSettings] = useState(null);

  const load = () => {
    api.adminGet('/categories', token).then((d) => setCats(d.categories)).catch(() => {});
    api.adminGet('/insurance', token).then((d) => setIns(d.insurance)).catch(() => {});
    api.adminGet('/settings', token).then((d) => setSettings({ milesPerDay: d.milesPerDay, overagePerMile: d.overagePerMile, discountTiers: d.discountTiers || [] })).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const setTier = (i, field, val) => setSettings({ ...settings, discountTiers: settings.discountTiers.map((t, j) => j === i ? { ...t, [field]: val } : t) });
  const addTier = () => setSettings({ ...settings, discountTiers: [...settings.discountTiers, { min_days: '', percent: '' }] });
  const removeTier = (i) => setSettings({ ...settings, discountTiers: settings.discountTiers.filter((_, j) => j !== i) });
  async function saveSettings() {
    setSaving('settings'); setMsg('');
    try {
      await api.adminPatch('/settings', token, {
        milesPerDay: Number(settings.milesPerDay),
        overagePerMile: Number(settings.overagePerMile),
        discountTiers: settings.discountTiers.filter((t) => t.min_days !== '' && t.percent !== '').map((t) => ({ min_days: Number(t.min_days), percent: Number(t.percent) })),
      });
      setMsg('Mileage & discount settings saved'); load();
    } catch (e) { setMsg(e.message); } finally { setSaving(''); }
  }

  const setCat = (id, field, val) => setCats(cats.map((c) => c.id === id ? { ...c, [field]: val } : c));
  const setInsVal = (code, val) => setIns(ins.map((i) => i.code === code ? { ...i, surcharge_daily: val } : i));

  async function saveCat(c) {
    setSaving(c.id); setMsg('');
    try { await api.adminPatch(`/categories/${c.id}/pricing`, token, { daily_rate: Number(c.daily_rate), deposit: Number(c.deposit) }); setMsg(`Saved ${c.name}`); }
    catch (e) { setMsg(e.message); } finally { setSaving(''); }
  }
  async function saveIns(i) {
    setSaving(i.code); setMsg('');
    try { await api.adminPatch(`/insurance/${i.code}`, token, { surcharge_daily: Number(i.surcharge_daily) }); setMsg(`Saved ${i.label}`); }
    catch (e) { setMsg(e.message); } finally { setSaving(''); }
  }

  return (
    <div>
      {msg && <div className="note note-info">{msg}</div>}
      <div className="panel panel-pad" style={{ marginBottom: 24 }}>
        <h2 className="section-title" style={{ fontSize: 20 }}>Vehicle class pricing</h2>
        <p className="section-sub">Set each class's daily rate and the fixed deposit customers pay now. Cents are allowed (e.g. 67.11). Changes take effect immediately on the booking site.</p>
        <table className="bk-table">
          <thead><tr><th>Class</th><th>Daily rate ($)</th><th>Deposit ($)</th><th></th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td><input className="input" type="number" min="0" step="0.01" value={c.daily_rate} onChange={(e) => setCat(c.id, 'daily_rate', e.target.value)} style={{ maxWidth: 120 }} /></td>
                <td><input className="input" type="number" min="0" step="0.01" value={c.deposit} onChange={(e) => setCat(c.id, 'deposit', e.target.value)} style={{ maxWidth: 120 }} /></td>
                <td><button className="btn btn-teal btn-sm" disabled={saving === c.id} onClick={() => saveCat(c)}>{saving === c.id ? 'Saving…' : 'Save'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel panel-pad">
        <h2 className="section-title" style={{ fontSize: 20 }}>Insurance pricing</h2>
        <p className="section-sub">What customers pay us per day based on their coverage. Collision is added to the pickup balance; the Precision package is added to the deposit.</p>
        <table className="bk-table">
          <thead><tr><th>Option</th><th>Price per day ($)</th><th></th></tr></thead>
          <tbody>
            {ins.map((i) => (
              <tr key={i.code}>
                <td><strong>{i.label}</strong> {i.code === 'full' && <span style={{ color: 'var(--ink-soft)' }}>(no charge)</span>}</td>
                <td><input className="input" type="number" min="0" step="0.01" value={i.surcharge_daily} onChange={(e) => setInsVal(i.code, e.target.value)} style={{ maxWidth: 120 }} /></td>
                <td><button className="btn btn-teal btn-sm" disabled={saving === i.code} onClick={() => saveIns(i)}>{saving === i.code ? 'Saving…' : 'Save'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel panel-pad" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ fontSize: 20 }}>Mileage & multi-day discounts</h2>
        <p className="section-sub">Mileage allowance and overage rate print on every rental agreement. Discount tiers apply a % off the rental subtotal once a booking reaches the given number of days (the highest matching tier wins).</p>
        {!settings ? <p className="section-sub">Loading…</p> : (
          <>
            <div className="grid-2">
              <div className="field"><label>Miles included per day</label><input className="input" type="number" min="1" step="1" value={settings.milesPerDay} onChange={(e) => setSettings({ ...settings, milesPerDay: e.target.value })} /></div>
              <div className="field"><label>Overage charge per mile ($)</label><input className="input" type="number" min="0" step="0.01" value={settings.overagePerMile} onChange={(e) => setSettings({ ...settings, overagePerMile: e.target.value })} /></div>
            </div>
            <label style={{ fontWeight: 600, fontSize: 14, display: 'block', margin: '8px 0' }}>Discount tiers</label>
            <table className="bk-table">
              <thead><tr><th>If rental is at least (days)</th><th>Discount (%)</th><th></th></tr></thead>
              <tbody>
                {settings.discountTiers.map((t, i) => (
                  <tr key={i}>
                    <td><input className="input" type="number" min="1" step="1" value={t.min_days} onChange={(e) => setTier(i, 'min_days', e.target.value)} style={{ maxWidth: 140 }} /></td>
                    <td><input className="input" type="number" min="0" max="100" step="1" value={t.percent} onChange={(e) => setTier(i, 'percent', e.target.value)} style={{ maxWidth: 120 }} /></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => removeTier(i)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-ghost btn-sm" style={{ marginRight: 8 }} onClick={addTier}>+ Add tier</button>
            <button className="btn btn-teal btn-sm" disabled={saving === 'settings'} onClick={saveSettings}>{saving === 'settings' ? 'Saving…' : 'Save mileage & discounts'}</button>
          </>
        )}
      </div>
    </div>
  );
}

function CarsManager({ token }) {
  const [cars, setCars] = useState([]);
  const [cats, setCats] = useState([]);
  const [f, setF] = useState({ categoryId: '', year: '', make: '', model: '', color: '', vin: '', licensePlate: '' });
  const [newPhoto, setNewPhoto] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => {
    api.adminGet('/cars', token).then((d) => setCars(d.cars)).catch(() => {});
    api.adminGet('/categories', token).then((d) => setCats(d.categories)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  async function add() {
    if (!f.categoryId || !f.make) return;
    setAdding(true);
    try {
      const res = await api.adminPost('/cars', token, f);
      if (newPhoto && res.id) {
        const fd = new FormData(); fd.append('photo', newPhoto);
        try { await api.adminUpload(`/cars/${res.id}/photo`, token, fd); } catch (e) { /* car still created */ }
      }
      setF({ categoryId: '', year: '', make: '', model: '', color: '', vin: '', licensePlate: '' });
      setNewPhoto(null);
      load();
    } catch (e) { alert(e.message); } finally { setAdding(false); }
  }
  async function remove(id) { if (confirm('Remove this car?')) { await api.adminDelete(`/cars/${id}`, token); load(); } }
  async function uploadPhoto(id, file) {
    const fd = new FormData(); fd.append('photo', file);
    try { await api.adminUpload(`/cars/${id}/photo`, token, fd); load(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="split">
      <div className="panel panel-pad">
        <h2 className="section-title" style={{ fontSize: 20 }}>Vehicle inventory</h2>
        <p className="section-sub">Each car carries its VIN and plate — these auto-fill the rental agreement when you assign it.</p>
        <p className="section-sub" style={{ marginTop: -8 }}>Add a photo per car — it appears on that car's rental agreement. No photo? The class illustration is used.</p>
        <table className="bk-table">
          <thead><tr><th>Photo</th><th>Class</th><th>Vehicle</th><th>Plate</th><th>VIN</th><th></th></tr></thead>
          <tbody>
            {cars.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.image_url
                    ? <img src={c.image_url} alt="" style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
                    : <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>—</span>}
                </td>
                <td>{c.category_name}</td>
                <td>{c.year} {c.make} {c.model} <span style={{ color: 'var(--ink-soft)' }}>({c.color})</span></td>
                <td>{c.license_plate}</td>
                <td style={{ fontSize: 12 }}>{c.vin}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', marginRight: 6 }}>
                    {c.image_url ? 'Change' : 'Add photo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && uploadPhoto(c.id, e.target.files[0])} />
                  </label>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(c.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel panel-pad">
        <h3 className="section-title" style={{ fontSize: 18 }}>Add a vehicle</h3>
        <div className="field"><label>Class</label>
          <select className="select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">Select…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid-2">
          <div className="field"><label>Year</label><input className="input" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} /></div>
          <div className="field"><label>Color</label><input className="input" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Make</label><input className="input" value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} /></div>
          <div className="field"><label>Model</label><input className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></div>
        </div>
        <div className="field"><label>VIN</label><input className="input" value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value })} /></div>
        <div className="field"><label>License plate</label><input className="input" value={f.licensePlate} onChange={(e) => setF({ ...f, licensePlate: e.target.value })} /></div>
        <div className="field">
          <label>Car photo <span className="hint">(appears on the rental agreement)</span></label>
          <label className={`uploader ${newPhoto ? 'filled' : ''}`} style={{ display: 'block' }}>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setNewPhoto(e.target.files[0] || null)} />
            {newPhoto ? <span className="file-tag">✓ {newPhoto.name}</span> : <><strong>Upload a photo of this car</strong><small>JPG or PNG — optional</small></>}
          </label>
        </div>
        <button className="btn btn-teal btn-block" disabled={adding} onClick={add}>{adding ? 'Adding…' : 'Add vehicle'}</button>
      </div>
    </div>
  );
}

function Availability({ token }) {
  const [cats, setCats] = useState([]);
  const [cars, setCars] = useState([]);
  const [catBlocks, setCatBlocks] = useState([]);
  const [carBlocks, setCarBlocks] = useState([]);
  const [cf, setCf] = useState({ categoryId: '', startDate: '', endDate: '', reason: '' });
  const [rf, setRf] = useState({ carId: '', startDate: '', endDate: '', reason: '' });
  const [af, setAf] = useState({ startDate: '', endDate: '', reason: 'Business closed' });
  const [allMsg, setAllMsg] = useState('');

  const load = () => {
    api.adminGet('/categories', token).then((d) => setCats(d.categories)).catch(() => {});
    api.adminGet('/cars', token).then((d) => setCars(d.cars)).catch(() => {});
    api.adminGet('/blocks', token).then((d) => setCatBlocks(d.blocks)).catch(() => {});
    api.adminGet('/car-blocks', token).then((d) => setCarBlocks(d.blocks)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function addCat() { if (!cf.categoryId || !cf.startDate || !cf.endDate) return; await api.adminPost('/blocks', token, cf); setCf({ categoryId: '', startDate: '', endDate: '', reason: '' }); load(); }
  async function blockAll() {
    if (!af.startDate || !af.endDate) { setAllMsg('Pick a start and end date.'); return; }
    try { const r = await api.adminPost('/blocks/all', token, af); setAllMsg(`Blocked all ${r.blocked} classes for ${af.startDate}${af.endDate !== af.startDate ? ' → ' + af.endDate : ''}.`); setAf({ startDate: '', endDate: '', reason: 'Business closed' }); load(); }
    catch (e) { setAllMsg(e.message); }
  }
  async function addCar() { if (!rf.carId || !rf.startDate || !rf.endDate) return; await api.adminPost('/car-blocks', token, rf); setRf({ carId: '', startDate: '', endDate: '', reason: '' }); load(); }
  async function delCat(id) { await api.adminDelete(`/blocks/${id}`, token); load(); }
  async function delCar(id) { await api.adminDelete(`/car-blocks/${id}`, token); load(); }

  return (
    <>
      <div className="panel panel-pad" style={{ marginBottom: 24, borderTop: '3px solid var(--amber, #e08a2b)' }}>
        <h2 className="section-title" style={{ fontSize: 20 }}>Business closed (block everything)</h2>
        <p className="section-sub">Close the whole business for a date range — e.g. a holiday like Christmas. No one can book or pick up online on those days (blocks every class at once).</p>
        {allMsg && <div className="note note-info">{allMsg}</div>}
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="field"><label>From</label><input className="input" type="date" value={af.startDate} onChange={(e) => setAf({ ...af, startDate: e.target.value, endDate: af.endDate || e.target.value })} /></div>
          <div className="field"><label>To</label><input className="input" type="date" value={af.endDate} onChange={(e) => setAf({ ...af, endDate: e.target.value })} /></div>
          <div className="field"><label>Reason</label><input className="input" value={af.reason} onChange={(e) => setAf({ ...af, reason: e.target.value })} /></div>
        </div>
        <button className="btn btn-teal" onClick={blockAll}>Close business for these dates</button>
      </div>
      <div className="split">
        <div className="panel panel-pad">
          <h2 className="section-title" style={{ fontSize: 20 }}>Block a whole class</h2>
          <p className="section-sub">Blocked classes can’t be booked for the dates shown.</p>
          {!catBlocks.length && <p className="section-sub">No class blocks.</p>}
          <table className="bk-table"><tbody>
            {catBlocks.map((b) => (
              <tr key={b.id}><td><strong>{b.category_name}</strong></td><td>{b.start_date} → {b.end_date}</td><td>{b.reason || '—'}</td><td><button className="btn btn-ghost btn-sm" onClick={() => delCat(b.id)}>Remove</button></td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="panel panel-pad">
          <h3 className="section-title" style={{ fontSize: 18 }}>New class block</h3>
          <div className="field"><label>Class</label><select className="select" value={cf.categoryId} onChange={(e) => setCf({ ...cf, categoryId: e.target.value })}><option value="">Select…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>From</label><input className="input" type="date" value={cf.startDate} onChange={(e) => setCf({ ...cf, startDate: e.target.value })} /></div>
          <div className="field"><label>To</label><input className="input" type="date" value={cf.endDate} onChange={(e) => setCf({ ...cf, endDate: e.target.value })} /></div>
          <div className="field"><label>Reason</label><input className="input" value={cf.reason} onChange={(e) => setCf({ ...cf, reason: e.target.value })} /></div>
          <button className="btn btn-teal btn-block" onClick={addCat}>Add class block</button>
        </div>
      </div>

      <div className="split" style={{ marginTop: 24 }}>
        <div className="panel panel-pad">
          <h2 className="section-title" style={{ fontSize: 20 }}>Block a specific car</h2>
          <p className="section-sub">Use this when a car is booked on Turo or in the shop — it won’t be assignable for those dates.</p>
          {!carBlocks.length && <p className="section-sub">No car blocks.</p>}
          <table className="bk-table"><tbody>
            {carBlocks.map((b) => (
              <tr key={b.id}><td><strong>{b.year} {b.make} {b.model}</strong> <span style={{ color: 'var(--ink-soft)' }}>{b.license_plate}</span></td><td>{b.start_date} → {b.end_date}</td><td>{b.reason || '—'}</td><td><button className="btn btn-ghost btn-sm" onClick={() => delCar(b.id)}>Remove</button></td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="panel panel-pad">
          <h3 className="section-title" style={{ fontSize: 18 }}>New car block</h3>
          <div className="field"><label>Vehicle</label><select className="select" value={rf.carId} onChange={(e) => setRf({ ...rf, carId: e.target.value })}><option value="">Select…</option>{cars.map((c) => <option key={c.id} value={c.id}>{c.year} {c.make} {c.model} — {c.license_plate}</option>)}</select></div>
          <div className="field"><label>From</label><input className="input" type="date" value={rf.startDate} onChange={(e) => setRf({ ...rf, startDate: e.target.value })} /></div>
          <div className="field"><label>To</label><input className="input" type="date" value={rf.endDate} onChange={(e) => setRf({ ...rf, endDate: e.target.value })} /></div>
          <div className="field"><label>Reason</label><input className="input" value={rf.reason} onChange={(e) => setRf({ ...rf, reason: e.target.value })} placeholder="Booked on Turo / in shop" /></div>
          <button className="btn btn-teal btn-block" onClick={addCar}>Add car block</button>
        </div>
      </div>
    </>
  );
}
