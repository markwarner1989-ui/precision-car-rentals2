import { useEffect, useState } from 'react';
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
  const [view, setView] = useState('bookings');
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
          {['bookings', 'cars', 'pricing', 'availability'].map((v) => (
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
        {view === 'pricing' && <PricingManager token={token} />}
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
    try { const r = await api.adminPost(`/bookings/${b.id}/approve`, token, { assignedCarId: carId, notes }); setSignUrl(r.signUrl); setTimeout(onChanged, 1500); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function decline() { setBusy(true); try { await api.adminPost(`/bookings/${b.id}/decline`, token, { notes }); onChanged(); } catch (e) { alert(e.message); } finally { setBusy(false); } }

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
            {signUrl && <div className="note note-info">Approved! Agreement link sent to customer: <br /><a href={signUrl} target="_blank" rel="noreferrer">{signUrl}</a></div>}
            <div className="row-between">
              <button className="btn btn-ghost" disabled={busy} onClick={decline}>Decline</button>
              <button className="btn btn-teal" disabled={busy} onClick={approve}>Approve & send agreement</button>
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
            <button className="btn btn-ghost btn-block" onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}

function PricingManager({ token }) {
  const [cats, setCats] = useState([]);
  const [ins, setIns] = useState([]);
  const [saving, setSaving] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    api.adminGet('/categories', token).then((d) => setCats(d.categories)).catch(() => {});
    api.adminGet('/insurance', token).then((d) => setIns(d.insurance)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

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
        <p className="section-sub">Set each class's daily rate and the fixed deposit customers pay now. Changes take effect immediately on the booking site.</p>
        <table className="bk-table">
          <thead><tr><th>Class</th><th>Daily rate ($)</th><th>Deposit ($)</th><th></th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td><input className="input" type="number" min="0" step="1" value={c.daily_rate} onChange={(e) => setCat(c.id, 'daily_rate', e.target.value)} style={{ maxWidth: 120 }} /></td>
                <td><input className="input" type="number" min="0" step="1" value={c.deposit} onChange={(e) => setCat(c.id, 'deposit', e.target.value)} style={{ maxWidth: 120 }} /></td>
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
                <td><input className="input" type="number" min="0" step="1" value={i.surcharge_daily} onChange={(e) => setInsVal(i.code, e.target.value)} style={{ maxWidth: 120 }} /></td>
                <td><button className="btn btn-teal btn-sm" disabled={saving === i.code} onClick={() => saveIns(i)}>{saving === i.code ? 'Saving…' : 'Save'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const load = () => {
    api.adminGet('/categories', token).then((d) => setCats(d.categories)).catch(() => {});
    api.adminGet('/cars', token).then((d) => setCars(d.cars)).catch(() => {});
    api.adminGet('/blocks', token).then((d) => setCatBlocks(d.blocks)).catch(() => {});
    api.adminGet('/car-blocks', token).then((d) => setCarBlocks(d.blocks)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function addCat() { if (!cf.categoryId || !cf.startDate || !cf.endDate) return; await api.adminPost('/blocks', token, cf); setCf({ categoryId: '', startDate: '', endDate: '', reason: '' }); load(); }
  async function addCar() { if (!rf.carId || !rf.startDate || !rf.endDate) return; await api.adminPost('/car-blocks', token, rf); setRf({ carId: '', startDate: '', endDate: '', reason: '' }); load(); }
  async function delCat(id) { await api.adminDelete(`/blocks/${id}`, token); load(); }
  async function delCar(id) { await api.adminDelete(`/car-blocks/${id}`, token); load(); }

  return (
    <>
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
