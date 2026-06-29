import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang, t } from '../lib/i18n';
import styles from './Auth.module.css';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { lang } = useLang();

  const passwordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 6) return 'weak';
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return 'fair';
    return 'strong';
  };

  const strength = passwordStrength();

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone } },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    navigate('/login-success');
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Left panel */}
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
            "Five free itinerary searches when you join."
          </blockquote>
          <div className={styles.brandTag}>Juzgo · new members</div>
        </div>

        {/* Right panel — form */}
        <div className={styles.formPanel}>
          <div className={styles.tabs}>
            <Link to="/login" className={styles.tab}>Log in</Link>
            <span className={`${styles.tab} ${styles.tabActive}`}>Register</span>
          </div>

          <h2 className={styles.formH2}>Create your account.</h2>
          <p className={styles.formSub}>Start exploring 190+ destinations today.</p>

          <form onSubmit={handleRegister} className={styles.form}>
            <label className={styles.label}>Full name</label>
            <input
              type="text"
              placeholder="John Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={styles.input}
              required
            />

            <label className={styles.label}>Email</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              required
            />

            <label className={styles.label}>Phone <span className={styles.optional}>(optional)</span></label>
            <input
              type="tel"
              placeholder="+65 9000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={styles.input}
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
            {strength && (
              <div className={styles.strengthWrap}>
                <div className={`${styles.strengthBar} ${styles[`strength_${strength}`]}`} />
                <span className={styles.strengthText}>{strength.charAt(0).toUpperCase() + strength.slice(1)}</span>
              </div>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Creating account…' : 'Create account →'}
            </button>
          </form>

          <p className={styles.switchText}>
            Already have an account? <Link to="/login" className={styles.switchLink}>Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
