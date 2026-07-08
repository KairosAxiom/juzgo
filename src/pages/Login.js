import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import styles from './Auth.module.css';
import GlobeLogo from '../components/GlobeLogo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { lang, t } = useLang();

  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data: signInData, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setLoading(false); setError(err.message); return; }

    // Admin-created staff accounts (Session 20) carry a temporary password
    // and must set a new one before doing anything else.
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', signInData.user.id)
      .maybeSingle();
    setLoading(false);

    if (profile?.must_change_password) {
      navigate('/force-password-change');
      return;
    }

    const redirect = searchParams.get('redirect');
    navigate(redirect === 'itinerary' ? '/itinerary' : '/dashboard');
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setResetError('');
    if (!email.trim()) { setResetError('Enter your email above first, then click Forgot password again.'); return; }
    setResetLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (err) { setResetError(err.message); return; }
    setResetSent(true);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Left panel — brand */}
        <div className={styles.brandPanel}>
          <div className={styles.brandLogo}>
            <GlobeLogo size={40} />
            <span className={styles.brandName}>Juzgo</span>
          </div>
          <blockquote className={styles.brandQuote}>
            "Your next twelve trips start here."
          </blockquote>
          <div className={styles.brandTag}>Juzgo · members</div>
        </div>

        {/* Right panel — form */}
        <div className={styles.formPanel}>
          {/* Tab switcher */}
          <div className={styles.tabs}>
            <span className={`${styles.tab} ${styles.tabActive}`}>Log in</span>
            <Link to="/register" className={styles.tab}>Register</Link>
          </div>

          <h2 className={styles.formH2}>Welcome back.</h2>
          <p className={styles.formSub}>Sign in to your Juzgo account.</p>

          <form onSubmit={handleLogin} className={styles.form}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              required
            />

            <label className={styles.label}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
            />

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Signing in…' : 'Log in →'}
            </button>
          </form>

          <div className={styles.forgotWrap}>
            {resetSent ? (
              <span className={styles.forgot} style={{ color: '#1E8E5E', cursor: 'default' }}>
                ✓ Reset link sent — check your email
              </span>
            ) : (
              <span className={styles.forgot} onClick={handleForgotPassword} style={{ opacity: resetLoading ? 0.6 : 1 }}>
                {resetLoading ? 'Sending…' : 'Forgot password?'}
              </span>
            )}
          </div>
          {resetError && <div className={styles.error}>{resetError}</div>}

          <p className={styles.switchText}>
            No account? <Link to="/register" className={styles.switchLink}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
