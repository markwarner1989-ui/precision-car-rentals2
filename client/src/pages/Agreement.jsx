import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, money } from '../lib/api.js';

export default function Agreement() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [initials, setInitials] = useState({});
  const [fullName, setFullName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { api.getAgreement(token).then(setData).catch((e) => setError(e.message)); }, [token]);

  if (error) return <Shell><div className="note note-error">{error}</div></Shell>;
  if (!data) return <Shell><p>Loading…</p></Shell>;
  if (done || data.status === 'signed') return (
    <Shell>
      <div className="panel confirm">
        <div className="check">✓</div>
        <h2>Agreement signed</h2>
        <p className="msg">Thank you! A copy has been emailed to you. Please bring your license and a card in your name at pickup.</p>
      </div>
    </Shell>
  );

  const allInitialed = data.clauses.every((c) => (initials[c.key] || '').trim());
  async function sign() {
    setBusy(true); setError('');
    try { await api.signAgreement(token, { fullName, initials, termsAccepted: agreed }); setDone(true); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Shell>
      <div className="panel panel-pad">
        <h2 className="section-title">Rental Agreement</h2>
        <p className="section-sub">Reference {data.reference} — please review, initial each term, and sign.</p>

        <h3 style={{ fontFamily: 'var(--display)', color: 'var(--teal)' }}>Vehicle</h3>
        {data.vehicle ? (
          <dl className="kv">
            <dt>Vehicle</dt><dd>{data.vehicle.desc}</dd>
            <dt>VIN</dt><dd>{data.vehicle.vin}</dd>
            <dt>License plate</dt><dd>{data.vehicle.plate}</dd>
          </dl>
        ) : <p>Vehicle will be listed here.</p>}

        <h3 style={{ fontFamily: 'var(--display)', color: 'var(--teal)' }}>Terms</h3>
        <dl className="kv">
          <dt>Renter</dt><dd>{data.renter.name}</dd>
          <dt>Pickup</dt><dd>{data.terms.pickup_at.replace('T', ' ')}</dd>
          <dt>Return</dt><dd>{data.terms.return_at.replace('T', ' ')}</dd>
          <dt>Coverage</dt><dd>{data.terms.coverage}</dd>
          <dt>Deposit paid</dt><dd>{money(data.terms.deposit)}</dd>
          <dt>Due at pickup</dt><dd>{money(data.terms.due_at_pickup)}</dd>
          {data.terms.odo_start != null && <><dt>Starting odometer</dt><dd>{Number(data.terms.odo_start).toLocaleString()} miles</dd></>}
          {data.terms.miles_allowed != null && <><dt>Mileage included</dt><dd>{Number(data.terms.miles_allowed).toLocaleString()} miles</dd></>}
        </dl>

        <h3 style={{ fontFamily: 'var(--display)', color: 'var(--teal)' }}>Initial each term</h3>
        {data.clauses.map((c) => (
          <div className="clause" key={c.key}>
            <input className="input" maxLength={4} placeholder="Init." value={initials[c.key] || ''} onChange={(e) => setInitials({ ...initials, [c.key]: e.target.value })} />
            <p>{c.text}</p>
          </div>
        ))}

        {/* Full Terms & Conditions — the customer sees everything */}
        <h3 style={{ fontFamily: 'var(--display)', color: 'var(--teal)' }}>Terms &amp; Conditions</h3>
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px', background: '#fbfaf6', fontSize: 13.5, lineHeight: 1.5 }}>
          {(data.termsAndConditions || []).map((t, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <strong style={{ color: 'var(--teal)' }}>{i + 1}. {t.title}</strong>
              <p style={{ margin: '4px 0 0' }}>{t.body}</p>
            </div>
          ))}
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
          <span>I have read and agree to the Terms &amp; Conditions above, and I consent to signing this agreement electronically.</span>
        </label>

        <div className="sign-box" style={{ marginTop: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Signature — type your full legal name</label>
          <input className="input" style={{ fontFamily: 'var(--display)', fontSize: 22, marginTop: 8 }} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
        </div>

        {error && <div className="note note-error" style={{ marginTop: 14 }}>{error}</div>}
        <button className="btn btn-teal btn-block" style={{ marginTop: 18 }} disabled={busy || !allInitialed || !fullName.trim() || !agreed} onClick={sign}>
          {busy ? 'Signing…' : 'Sign agreement'}
        </button>
        {!agreed && <p className="section-sub" style={{ marginTop: 10 }}>Please read and accept the Terms &amp; Conditions to continue.</p>}
        {agreed && !allInitialed && <p className="section-sub" style={{ marginTop: 10 }}>Please initial every term to continue.</p>}
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <>
      <nav className="nav"><div className="container nav-inner">
        <a className="brand" href="/"><div className="brand-mark">P</div><div className="brand-name">Precision Car Rentals<span>Rental Agreement</span></div></a>
        <a className="nav-phone" href="tel:+17046481760">(704) 648-1760</a>
      </div></nav>
      <div className="agreement-wrap">{children}</div>
    </>
  );
}
