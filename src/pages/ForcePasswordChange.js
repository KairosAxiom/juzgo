import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import styles from './Auth.module.css';
import GlobeLogo from '../components/GlobeLogo';

// Shown when profiles.must_change_password = true — set on accounts
// created directly by a corp admin with a system-generated temporary
// password (Session 20). Blocks the rest of the app until a new password
// is set.
export default function ForcePasswordChange() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', user.id)
        .maybeSingle();
      // If the flag isn't actually set, this page has nothing to do —
      // send them on to the dashboard rather than blocking unnecessarily.
      if (!profile?.must_change_password) { navigate('/dashboard'); return; }
      setChecking(false);
    })();
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id);
      if (profErr) throw profErr;

      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  if (checking) return null;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
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

        <div className={styles.formPanel}>
          <h2 className={styles.formH2}>Set a new password.</h2>
          <p className={styles.formSub}>
            Your account was created with a temporary password. Choose a new one to continue.
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>New password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
            />

            <label className={styles.label}>Confirm new password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              required
            />

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Saving…' : 'Set password →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
