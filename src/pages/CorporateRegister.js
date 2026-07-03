import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabase';
import styles from './CorporateRegister.module.css';

const FREE_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'protonmail.com'];

export default function CorporateRegister() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    company_name: '',
    company_country: '',
    uen: '',
    contact_email: '',
    full_name: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function passwordStrength() {
    const p = form.password;
    if (!p) return null;
    if (p.length < 6) return 'weak';
    if (p.length < 10 || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) return 'fair';
    return 'strong';
  }

  const strength = passwordStrength();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validate no free email domains
    const domain = form.contact_email.split('@')[1]?.toLowerCase();
    if (FREE_DOMAINS.includes(domain)) {
      setError('Please use a work email address. Free email providers are not accepted for corporate accounts.');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      // Create the Supabase auth account first. This step was previously
      // missing entirely — the form collected a password but never signed
      // anyone up, so /corporate/register never received a user_id and
      // silently could not upgrade any profile to corp admin.
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.contact_email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      });
      if (signUpError) throw new Error(signUpError.message);

      const user_id = signUpData?.user?.id;
      if (!user_id) throw new Error('Could not create your account. Please try again.');

      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/corporate/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.successWrap}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.successH1}>Application submitted.</h1>
            <p className={styles.successSub}>
              Your corporate account application is under review. We'll email <strong>{form.contact_email}</strong> within 1–2 business days.
            </p>
            <button className={styles.btnPrimary} onClick={() => navigate('/')}>
              Back to Juzgo →
            </button>
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
          <div className={styles.eyebrow}>Business</div>
          <h1 className={styles.h1}>Corporate Account</h1>
          <p className={styles.sub}>
            Manage eSIM plans for your entire team. Shared wallet, centralised billing, and volume discounts.
          </p>
        </div>

        <div className={styles.layout}>

          {/* Form card */}
          <div className={styles.formCard}>
            <h2 className={styles.formH2}>Register your company</h2>
            <p className={styles.formNote}>All corporate applications are reviewed by our team before activation.</p>

            <form onSubmit={handleSubmit} className={styles.form}>

              <div className={styles.section}>
                <div className={styles.sectionLabel}>Company details</div>

                <label className={styles.label}>Company name</label>
                <input
                  type="text"
                  placeholder="Acme Pte. Ltd."
                  value={form.company_name}
                  onChange={(e) => update('company_name', e.target.value)}
                  className={styles.input}
                  required
                />

                <div className={styles.twoCol}>
                  <div>
                    <label className={styles.label}>Country of registration</label>
                    <input
                      type="text"
                      placeholder="Singapore"
                      value={form.company_country}
                      onChange={(e) => update('company_country', e.target.value)}
                      className={styles.input}
                      required
                    />
                  </div>
                  <div>
                    <label className={styles.label}>UEN / Reg. number <span className={styles.optional}>(optional)</span></label>
                    <input
                      type="text"
                      placeholder="202300001A"
                      value={form.uen}
                      onChange={(e) => update('uen', e.target.value)}
                      className={styles.input}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionLabel}>Admin account</div>

                <label className={styles.label}>Your full name</label>
                <input
                  type="text"
                  placeholder="John Smith"
                  value={form.full_name}
                  onChange={(e) => update('full_name', e.target.value)}
                  className={styles.input}
                  required
                />

                <label className={styles.label}>Work email</label>
                <input
                  type="email"
                  placeholder="john@acmecorp.com"
                  value={form.contact_email}
                  onChange={(e) => update('contact_email', e.target.value)}
                  className={styles.input}
                  required
                />

                <label className={styles.label}>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  className={styles.input}
                  required
                />
                {strength && (
                  <div className={styles.strengthWrap}>
                    <div className={`${styles.strengthBar} ${styles[`strength_${strength}`]}`} />
                    <span className={styles.strengthText}>{strength.charAt(0).toUpperCase() + strength.slice(1)}</span>
                  </div>
                )}
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <button type="submit" className={styles.btnSubmit} disabled={loading}>
                {loading ? 'Submitting application…' : 'Submit application →'}
              </button>

              <p className={styles.loginNote}>
                Already have an account? <Link to="/login" className={styles.loginLink}>Log in</Link>
              </p>
            </form>
          </div>

          {/* Info panel */}
          <div className={styles.infoPanel}>
            <h2 className={styles.infoPanelH2}>
              Built for<br /><em className={styles.infoPanelEm}>teams on the move.</em>
            </h2>

            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <span className={styles.check}>✓</span>
                <div>
                  <div className={styles.featureTitle}>Shared corporate wallet</div>
                  <div className={styles.featureDesc}>Top up once, your whole team draws from it.</div>
                </div>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.check}>✓</span>
                <div>
                  <div className={styles.featureTitle}>Invite team members</div>
                  <div className={styles.featureDesc}>Send email invites, set roles as admin or member.</div>
                </div>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.check}>✓</span>
                <div>
                  <div className={styles.featureTitle}>Centralised billing</div>
                  <div className={styles.featureDesc}>One invoice, full purchase history for your finance team.</div>
                </div>
              </li>
              <li className={styles.featureItem}>
                <span className={styles.check}>✓</span>
                <div>
                  <div className={styles.featureTitle}>Volume discounts</div>
                  <div className={styles.featureDesc}>Better rates as your team's usage grows.</div>
                </div>
              </li>
            </ul>

            <div className={styles.contactNote}>
              Questions? Email us at{' '}
              <a href="mailto:hello@juzgo.world" className={styles.contactLink}>hello@juzgo.world</a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
