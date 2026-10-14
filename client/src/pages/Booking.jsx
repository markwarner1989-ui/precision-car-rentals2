import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../lib/api.js';

const STEPS = ['Dates', 'Vehicle', 'Insurance', 'Coverage', 'Details', 'Payment'];

function isoLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const now = new Date();
const dP = new Date(now.getTime() + 864e5); dP.setHours(10, 0, 0, 0);
const dR = new Date(now.getTime() + 864e5 * 4); dR.setHours(10, 0, 0, 0);

export default function Booking({ meta }) {
  const paymentMode = meta?.paymentMode || 'mock';
  const pickupLocations = meta?.pickupLocations || {};
  const insuranceOptions = meta?.insurance || [];
  const docLabels = meta?.docLabels || {};

  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState(isoLocal(dP));
  const [ret, setRet] = useState(isoLocal(dR));
  const [pickupLoc, setPickupLoc] = useState('charlotte_airport');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [cats, setCats] = useState([]);
  const [catId, setCatId] = useState(null);
  const [hasOwn, setHasOwn] = useState(null); // true = own policy, false = our package
  const [coverage, setCoverage] = useState(null);
  const [followup, setFollowup] = useState(null);
  const [quote, setQuote] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', dob: '', address: '', cellPhone: '', email: '' });
  const [docs, setDocs] = useState({}); // key -> File[]
  const [billing, setBilling] = useState({ billingName: '', billingAddress: '', billingZip: '' });
  const [cardToken, setCardToken] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const selectedCat = useMemo(() => cats.find((c) => c.id === catId), [cats, catId]);
  const requiredDocs = followup?.requiresDocs || [];

  useEffect(() => {
    setError('');
    api.categories(pickup.slice(0, 10), ret.slice(0, 10)).then((d) => setCats(d.categories)).catch((e) => setError(e.message));
  }, [pickup, ret]);

  // fetch follow-up + quote when coverage chosen
  useEffect(() => {
    if (!catId || !coverage) return;
    api.insuranceFollowup({ categoryId: catId, pickup, return: ret, coverageCode: coverage })
      .then((d) => { setFollowup(d); setQuote(d.quote); })
      .catch((e) => setError(e.message));
  }, [catId, coverage, pickup, ret]);

  const canNext = () => {
    if (step === 0) return new Date(ret) > new Date(pickup) && (pickupLoc !== 'delivery' || deliveryAddress.trim());
    if (step === 1) return !!selectedCat && selectedCat.available;
    if (step === 2) return !!coverage;
    if (step === 3) return !!followup && followup.allowed;
    if (step === 4)
      return form.firstName && form.lastName && form.dob && form.address && form.cellPhone && form.email &&
        requiredDocs.every((d) => (docs[d]?.length || 0) >= 1);
    return true;
  };

  async function submit() {
    setSubmitting(true); setError('');
    try {
      const fd = new FormData();
      fd.append('categoryId', catId);
      fd.append('pickup', pickup); fd.append('return', ret);
      fd.append('pickupLocation', pickupLoc);
      if (pickupLoc === 'delivery') fd.append('deliveryAddress', deliveryAddress);
      fd.append('coverageCode', coverage);
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      Object.entries(billing).forEach(([k, v]) => fd.append(k, v));
      fd.append('paymentToken', cardToken || 'tok_mock');
      fd.append('cardExp', cardExp);
      requiredDocs.forEach((key) => (docs[key] || []).forEach((f) => fd.append(key, f)));
      const res = await api.createBooking(fd);
      setConfirmation(res);
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  }

  if (confirmation) return <Confirmation data={confirmation} />;

  return (
    <>
      {paymentMode === 'mock' && (
        <div className="mode-banner">DEMO MODE — no real card is charged. Use 4111 1111 1111 1111 (or include “decline” to test a failure).</div>
      )}
      <Nav />
      <Hero />
      <div className="container" style={{ paddingBottom: 40 }}>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={`step-pill ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}><b>{i < step ? '✓' : i + 1}</b>{s}</li>
          ))}
        </ol>
        {error && <div className="note note-error">{error}</div>}
        <div className="split">
          <div className="panel panel-pad">
            {step === 0 && <DatesStep {...{ pickup, setPickup, ret, setRet, pickupLoc, setPickupLoc, deliveryAddress, setDeliveryAddress, pickupLocations }} />}
            {step === 1 && <VehicleStep {...{ cats, catId, setCatId }} />}
            {step === 2 && <InsuranceStep {...{ insuranceOptions, coverage, setCoverage, hasOwn, setHasOwn }} />}
            {step === 3 && <CoverageFollowupStep {...{ followup, selectedCat }} />}
            {step === 4 && <DetailsStep {...{ form, setForm, docs, setDocs, requiredDocs, docLabels, followup }} />}
            {step === 5 && <PaymentStep {...{ quote, selectedCat, billing, setBilling, cardToken, setCardToken, cardExp, setCardExp, paymentMode, form }} />}

            <div className="row-between">
              {step > 0 ? <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>← Back</button> : <span />}
              {step < 5 ? (
                <button className="btn btn-primary" disabled={!canNext()} onClick={() => setStep(step + 1)}>Continue →</button>
              ) : (
                <button className="btn btn-teal" disabled={submitting} onClick={submit}>
                  {submitting ? <><span className="spinner" /> Processing…</> : `Pay deposit ${quote ? money(quote.deposit) : ''}`}
                </button>
              )}
            </div>
          </div>
          <aside className="summary">
            <SummaryCard {...{ selectedCat, quote, pickup, ret, pickupLoc, pickupLocations, coverage, followup }} />
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function DatesStep({ pickup, setPickup, ret, setRet, pickupLoc, setPickupLoc, deliveryAddress, setDeliveryAddress, pickupLocations }) {
  return (
    <div>
      <h2 className="section-title">When & where?</h2>
      <p className="section-sub">Choose your dates, times, and where you’d like the vehicle.</p>
      <div className="grid-2">
        <div className="field"><label>Pickup date & time</label><input className="input" type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} /></div>
        <div className="field"><label>Return date & time</label><input className="input" type="datetime-local" value={ret} onChange={(e) => setRet(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Pickup location</label>
        <div className="loc-grid">
          {Object.entries(pickupLocations).map(([key, label]) => (
            <button key={key} className={`loc ${pickupLoc === key ? 'selected' : ''}`} onClick={() => setPickupLoc(key)}>
              {label}
              {key === 'delivery' && <small>We bring it to you</small>}
              {key === 'charlotte_airport' && <small>CLT terminal pickup</small>}
              {key === 'gastonia' && <small>Our Gastonia lot</small>}
            </button>
          ))}
        </div>
      </div>
      {pickupLoc === 'delivery' && (
        <div className="field"><label>Delivery address</label><input className="input" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street, City, State ZIP" /></div>
      )}
      {new Date(ret) <= new Date(pickup) && <div className="note note-warn">Return must be after pickup.</div>}
    </div>
  );
}

function VehicleStep({ cats, catId, setCatId }) {
  return (
    <div>
      <h2 className="section-title">Choose a vehicle class</h2>
      <p className="section-sub">You’re booking a class, not a specific car — we assign the best available vehicle in your class at approval, like Enterprise or Hertz.</p>
      <div className="cat-grid">
        {cats.map((c) => (
          <button key={c.id} className={`cat ${catId === c.id ? 'selected' : ''} ${!c.available ? 'blocked' : ''}`} disabled={!c.available} onClick={() => setCatId(c.id)}>
            {!c.available && <span className="blocked-tag">Unavailable</span>}
            <img className="cat-img" src={c.image_url} alt={c.name}
                 onError={(e) => { e.target.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='250'><rect fill='%23c9d6d3' width='400' height='250'/><text x='50%25' y='50%25' font-family='sans-serif' font-size='20' fill='%230d3b40' text-anchor='middle' dominant-baseline='middle'>${c.name}</text></svg>`; }} />
            <div className="cat-body">
              <div className="cat-name">{c.name}</div>
              <div className="cat-eg">{c.example}</div>
              {c.available && c.availableCount != null && <div className="cat-avail">{c.availableCount} available for your dates</div>}
              <div className="cat-meta">
                <div className="cat-rate"><b>{money(c.daily_rate)}</b><span> /day</span></div>
                <div className="cat-dep">deposit<b>{money(c.deposit)}</b></div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function InsuranceStep({ insuranceOptions, coverage, setCoverage, hasOwn, setHasOwn }) {
  const ownOptions = insuranceOptions.filter((o) => o.has_own);
  const packageOption = insuranceOptions.find((o) => !o.has_own);

  function chooseHasOwn(val) {
    setHasOwn(val);
    if (val === false) setCoverage(packageOption?.code || null); // No → our package
    else setCoverage(null); // Yes → make them pick a kind
  }

  return (
    <div>
      <h2 className="section-title">Do you have your own insurance?</h2>
      <p className="section-sub">Tell us whether you carry your own auto insurance — the policy must list <strong>your name as the policyholder</strong>.</p>
      <div className="coverage" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button className={`cov ${hasOwn === true ? 'selected' : ''}`} onClick={() => chooseHasOwn(true)}>
          <h4>Yes</h4><p>I have my own policy in my name</p>
        </button>
        <button className={`cov ${hasOwn === false ? 'selected' : ''}`} onClick={() => chooseHasOwn(false)}>
          <h4>No</h4><p>I’ll use your insurance package</p>
        </button>
      </div>

      {hasOwn === true && (
        <div style={{ marginTop: 22 }}>
          <h3 className="section-title" style={{ fontSize: 19 }}>What kind of insurance do you have?</h3>
          <p className="section-sub">This is what’s on your own policy — not something you’re buying from us.</p>
          <div className="coverage">
            {ownOptions.map((o) => (
              <button key={o.code} className={`cov ${coverage === o.code ? 'selected' : ''}`} onClick={() => setCoverage(o.code)}>
                <h4>{o.label}</h4>
                <p>{o.code === 'full' ? 'Full coverage in my name' : 'Liability only in my name'}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasOwn === false && packageOption && (
        <div className="note note-info" style={{ marginTop: 22, fontSize: 15 }}>
          Our <strong>Precision insurance package</strong> fully covers you for <strong>{money(packageOption.surcharge_daily)}/day</strong>, added to your deposit. You’ll upload your license and a photo of your payment card on the next steps.
        </div>
      )}
    </div>
  );
}

function CoverageFollowupStep({ followup, selectedCat }) {
  if (!followup) return null;
  const q = followup.quote || {};
  const toDeposit = q.surchargeTarget === 'deposit';
  const isPackage = q.hasOwn === false;
  return (
    <div>
      <h2 className="section-title">{isPackage ? 'Your insurance package' : 'Your coverage'}</h2>
      <div className="note note-info" style={{ fontSize: 15 }}>{followup.followupText}</div>
      {q.surchargeDaily > 0 && (
        <div className="note note-warn">
          {isPackage ? 'Insurance package' : 'Collision coverage'}: {money(q.surchargeDaily)}/day × {q.days} day{q.days > 1 ? 's' : ''} = {money(q.surchargeSubtotal)}, added to your {toDeposit ? 'deposit (due now)' : 'pickup balance'}.
        </div>
      )}
    </div>
  );
}

function Uploader({ label, hint, files, onFiles, multiple }) {
  return (
    <label className={`uploader ${files.length ? 'filled' : ''}`}>
      <input type="file" accept="image/*,application/pdf" multiple={multiple} style={{ display: 'none' }} onChange={(e) => onFiles(Array.from(e.target.files))} />
      {files.length ? <span className="file-tag">✓ {files.map((f) => f.name).join(', ')}</span> : <><strong>{label}</strong><small>{hint}</small></>}
    </label>
  );
}

function DetailsStep({ form, setForm, docs, setDocs, requiredDocs, docLabels, followup }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setDoc = (key) => (files) => setDocs({ ...docs, [key]: files });
  return (
    <div>
      <h2 className="section-title">Your details & documents</h2>
      <p className="section-sub">We verify these before approval. A license and a card in your own name are required at pickup.</p>
      <div className="grid-2">
        <div className="field"><label>First name</label><input className="input" value={form.firstName} onChange={set('firstName')} placeholder="Jordan" /></div>
        <div className="field"><label>Last name</label><input className="input" value={form.lastName} onChange={set('lastName')} placeholder="Ellis" /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label>Date of birth</label><input className="input" type="date" value={form.dob} onChange={set('dob')} /></div>
        <div className="field"><label>Cell phone</label><input className="input" value={form.cellPhone} onChange={set('cellPhone')} placeholder="(704) 555-0100" /></div>
      </div>
      <div className="field"><label>Address</label><input className="input" value={form.address} onChange={set('address')} placeholder="Street, City, State ZIP" /></div>
      <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" /></div>

      <div style={{ marginTop: 6 }}>
        {requiredDocs.map((key) => (
          <div className="field" key={key}>
            <label>{docLabels[key] || key} <span className="hint">(required)</span></label>
            <Uploader
              label={`Upload ${docLabels[key] || key}`}
              hint={key === 'license' ? 'Front of your driver’s license' : key === 'declaration_page' ? 'Your policy declaration page' : 'Clear photo or PDF'}
              files={docs[key] || []} onFiles={setDoc(key)} multiple={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentStep({ quote, selectedCat, billing, setBilling, cardToken, setCardToken, cardExp, setCardExp, paymentMode, form }) {
  const setB = (k) => (e) => setBilling({ ...billing, [k]: e.target.value });
  return (
    <div>
      <h2 className="section-title">Pay your deposit</h2>
      <p className="section-sub">You’re paying the fixed <strong>{selectedCat?.name}</strong> deposit now. The rental balance is due at pickup.</p>
      <div className="note note-info">
        {paymentMode === 'mock' ? 'Demo checkout — in production this is a secure Cardknox / Sola form so card data never touches the server.' : 'Secure payment via Cardknox / Sola — encrypted end-to-end.'}
      </div>
      <div className="field"><label>Name on card</label><input className="input" value={billing.billingName} onChange={setB('billingName')} placeholder={`${form.firstName} ${form.lastName}`.trim() || 'Full name on card'} /></div>
      <div className="field"><label>Card number</label><input className="input" placeholder="4111 1111 1111 1111" value={cardToken} onChange={(e) => setCardToken(e.target.value)} /></div>
      <div className="grid-3">
        <div className="field"><label>Expiry (MMYY)</label><input className="input" placeholder="1228" value={cardExp} onChange={(e) => setCardExp(e.target.value)} /></div>
        <div className="field"><label>Billing ZIP</label><input className="input" placeholder="28202" value={billing.billingZip} onChange={setB('billingZip')} /></div>
        <div className="field"><label>Due now</label><input className="input" disabled value={quote ? money(quote.deposit) : ''} /></div>
      </div>
      <div className="field"><label>Billing address <span className="hint">(matched at pickup)</span></label><input className="input" value={billing.billingAddress} onChange={setB('billingAddress')} placeholder="Street, City, State ZIP" /></div>
      <div className="note note-warn">By paying, you agree we’ll contact you within one hour <strong>during business hours</strong> to approve your reservation. You can also call or text us.</div>
    </div>
  );
}

function SummaryCard({ selectedCat, quote, pickup, ret, pickupLoc, pickupLocations, coverage, followup }) {
  return (
    <div className="panel panel-pad">
      <h3 className="section-title" style={{ fontSize: 20 }}>Your booking</h3>
      {!selectedCat ? <p className="section-sub" style={{ marginBottom: 0 }}>Select a vehicle class to see pricing.</p> : (
        <>
          <div className="sum-pickup"><span>Class</span><strong style={{ color: 'var(--ink)' }}>{selectedCat.name}</strong></div>
          <div className="sum-pickup"><span>{selectedCat.example}</span></div>
          <div className="sum-pickup"><span>Location</span><span>{pickupLocations[pickupLoc]}</span></div>
          <div className="sum-pickup"><span>Pickup</span><span>{pickup.replace('T', ' ')}</span></div>
          <div className="sum-pickup"><span>Return</span><span>{ret.replace('T', ' ')}</span></div>
          {quote && (() => {
            const toDeposit = quote.surchargeTarget === 'deposit';
            const surLabel = quote.hasOwn === false ? 'Insurance package' : 'Collision';
            return (
              <div style={{ marginTop: 14 }}>
                <div className="sum-row"><span>Rental · {quote.days}d × {money(quote.dailyRate)}</span><span>{money(quote.rentalSubtotal)}</span></div>
                {quote.surchargeSubtotal > 0 && !toDeposit && <div className="sum-row"><span>{surLabel} · {quote.days}d</span><span>{money(quote.surchargeSubtotal)}</span></div>}
                <div className="sum-row total"><span>Due at pickup</span><strong>{money(quote.dueAtPickup)}</strong></div>
                <div className="sum-due-now">
                  <div className="lbl">Due now — deposit</div>
                  <div className="amt">{money(quote.deposit)}</div>
                  {quote.surchargeSubtotal > 0 && toDeposit && (
                    <div style={{ fontSize: 12, opacity: .85, marginTop: 4 }}>Deposit {money(quote.baseDeposit)} + {surLabel.toLowerCase()} {money(quote.surchargeSubtotal)}</div>
                  )}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function Confirmation({ data }) {
  return (
    <>
      <Nav />
      <div className="container" style={{ padding: '30px 0 60px' }}>
        <div className="panel confirm">
          <div className="check">✓</div>
          <h2>Deposit received</h2>
          <div className="ref-chip">Confirmation {data.reference}</div>
          <p className="msg">{data.message}</p>
          <div className="sum-pickup" style={{ justifyContent: 'center', gap: 30, marginTop: 20 }}>
            <span>Paid now: <strong style={{ color: 'var(--teal)' }}>{money(data.deposit)}</strong></span>
            <span>Due at pickup: <strong style={{ color: 'var(--ink)' }}>{money(data.dueAtPickup)}</strong></span>
          </div>
          <a href="/" className="btn btn-ghost" style={{ marginTop: 26 }}>Make another booking</a>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function Nav() {
  return (
    <nav className="nav"><div className="container nav-inner">
      <a className="brand" href="/"><div className="brand-mark">P</div><div className="brand-name">Precision Car Rentals<span>Charlotte Airport · Gastonia</span></div></a>
      <a className="nav-phone" href="tel:+17046481760">(704) 648-1760</a>
    </div></nav>
  );
}
function Hero() {
  return (
    <header className="hero"><div className="container">
      <span className="hero-eyebrow">● Book online · Instant deposit</span>
      <h1>Reserve your class. <em>Drive away</em> without the hassle.</h1>
      <p>Pick your dates and location, choose a vehicle class, tell us your insurance, and secure your reservation with a deposit. We confirm within the hour during business hours.</p>
    </div></header>
  );
}
function SiteFooter() {
  return (
    <footer className="site"><div className="container">
      Precision Car Rentals · Charlotte Airport & Gastonia, NC · (704) 648-1760 — A valid driver’s license and a debit/credit card showing your name are required at pickup.
    </div></footer>
  );
}
