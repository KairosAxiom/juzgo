import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Footer from '../components/Footer';
import styles from './CorporateRegister.module.css';

export default function CorporateAccept() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [form, setForm] = useState({ full_name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { navigate('/'); return; }
    fetchInvite();
  }, [token]);

  async function fetchInvite() {
    try {
      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/corporate/invite/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid invite link.');
      setInvite(data);
    } catch (err) {
      setError(err.message);
    }
    setPageLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/corporate/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, full_name: form.full_name, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept invite.');
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  if (pageLoading) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div className={styles.spinnerInline} />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.successWrap}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.successH1}>You're in!</h1>
            <p className={styles.successSub}>
              Your account has been created and linked to <strong>{invite?.company_name}</strong>. Log in to get started.
            </p>
            <button className={styles.btnPrimary} onClick={() => navigate('/login')}>
              Log in →
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.successWrap}>
            <div className={styles.successIcon} style={{ background: '#E55A5A' }}>✕</div>
            <h1 className={styles.successH1}>Invalid invite</h1>
            <p className={styles.successSub}>{error}</p>
            <button className={styles.btnPrimary} onClick={() => navigate('/')}>Go home</button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>Team invite</div>
          <h1 className={styles.h1}>Join {invite?.company_name}</h1>
          <p className={styles.sub}>
            You've been invited to join <strong>{invite?.company_name}</strong> on Juzgo. Set up your account below.
          </p>
        </div>

        <div style={{ maxWidth: 480 }}>
          <div className={styles.formCard}>
            <h2 className={styles.formH2}>Create your account</h2>
            <p className={styles.formNote}>Joining as: <strong>{invite?.email}</strong></p>

            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.label}>Your full name</label>
              <input
                type="text"
                placeholder="Jane Smith"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                className={styles.input}
                required
              />

              <label className={styles.label}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className={styles.input}
                required
              />

              {error && <div className={styles.error}>{error}</div>}

              <button type="submit" className={styles.btnSubmit} disabled={loading}>
                {loading ? 'Creating account…' : 'Create account →'}
              </button>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
