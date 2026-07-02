import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import styles from './Auth.module.css';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase embeds the recovery token in the URL hash as #access_token=...&type=recovery
    // Calling getSession() after page load picks it up automatically
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true);
    });

    // Also listen for the PASSWORD_RECOVERY event fired by Supabase
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setValidSession(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const passwordStrength = () => {
    if (!password) return null;
    if (password.length < 6) return 'weak';
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return 'fair';
    return 'strong';
  };
  const strength = passwordStrength();

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => navigate('/dashboard'), 2500);
  }

  if (!validSession) {
    return (
      <div className={styles.page}>
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>🔑</div>
            <h2 style={{ fontFamily: "'Newsreader', serif", fontSize: 28, marginBottom: 12, color: '#16271E' }}>
              Invalid or expired link
            </h2>
            <p style={{ color: '#5B6B62', marginBottom: 28 }}>
              This password reset link has expired or already been used. Request a new one from the login page.
            </p>
            <button
              className={styles.btnPrimary}
              onClick={() => navigate('/login')}
            >
              Back to login →
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.page}>
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ width: 64, height: 64, background: '#1E8E5E', color: '#fff', borderRadius: '50%', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>✓</div>
            <h2 style={{ fontFamily: "'Newsreader', serif", fontSize: 28, marginBottom: 12, color: '#16271E' }}>
              Password updated!
            </h2>
            <p style={{ color: '#5B6B62' }}>Redirecting you to your dashboard…</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Left brand panel */}
        <div className={styles.brandPanel}>
          <div className={styles.brandLogo}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4">
              <circle cx="12" cy="12" r="9.5" />
              <ellipse cx="12" cy="12" rx="4" ry="9.5" />
              <line x1="2.5" y1="12" x2="21.5" y2="12" />
            </svg>
            <span className={styles.brandName}>Juzgo</span>
          </div>
          <blockquote className={styles.brandQuote}>
            "Set a strong password and travel worry-free."
          </blockquote>
          <div className={styles.brandTag}>Juzgo · account security</div>
        </div>

        {/* Right form panel */}
        <div className={styles.formPanel}>
          <h2 className={styles.formH2}>Set new password.</h2>
          <p className={styles.formSub}>Choose a strong password for your Juzgo account.</p>

          <form onSubmit={handleReset} className={styles.form}>
            <label className={styles.label}>New password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
            />
            {strength && (
              <div className={styles.strengthWrap}>
                <div className={`${styles.strengthBar} ${styles[`strength_${strength}`]}`} />
                <span className={styles.strengthText}>{strength.charAt(0).toUpperCase() + strength.slice(1)}</span>
              </div>
            )}

            <label className={styles.label}>Confirm password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={styles.input}
              required
            />

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Updating…' : 'Update password →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
