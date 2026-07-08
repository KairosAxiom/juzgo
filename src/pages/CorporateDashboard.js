import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import styles from './CorporateDashboard.module.css';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// ── Stripe top-up inner form ────────────────────────────────────────────────
function TopUpForm({ corpId, userId, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const PRESETS = [50, 100, 200, 500];

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    const amountSgd = parseFloat(amount);
    if (!amountSgd || amountSgd < 5) {
      setError('Minimum top-up is SGD 5.00');
      return;
    }
    if (!stripe || !elements) return;
    setLoading(true);
    try {
      // 1. Create PaymentIntent on backend
      const res = await fetch(`${BACKEND}/corporate/wallet/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corp_id: corpId, user_id: userId, amount_sgd: amountSgd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 2. Confirm card payment
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        data.clientSecret,
        { payment_method: { card: elements.getElement(CardElement) } }
      );
      if (stripeError) throw new Error(stripeError.message);
      if (paymentIntent.status === 'succeeded') {
        setSuccess(`SGD ${amountSgd.toFixed(2)} added to your corporate wallet!`);
        setAmount('');
        elements.getElement(CardElement).clear();
        setTimeout(() => { setSuccess(''); onSuccess(); }, 2500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.topUpForm}>
      <div className={styles.presetRow}>
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            className={`${styles.presetBtn} ${parseFloat(amount) === p ? styles.presetActive : ''}`}
            onClick={() => setAmount(String(p))}
          >
            SGD {p}
          </button>
        ))}
      </div>
      <div className={styles.amountRow}>
        <span className={styles.currencyLabel}>SGD</span>
        <input
          className={styles.amountInput}
          type="number"
          min="5"
          step="1"
          placeholder="Other amount"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </div>
      <div className={styles.cardWrap}>
        <CardElement options={{
          style: {
            base: { fontSize: '15px', color: '#1e293b', fontFamily: '-apple-system, sans-serif',
                    '::placeholder': { color: '#94a3b8' } },
            invalid: { color: '#dc2626' },
          },
        }} />
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
      {success && <p className={styles.successMsg}>✅ {success}</p>}
      <button
        type="submit"
        className={styles.primaryBtn}
        disabled={loading || !stripe}
        style={{ width: '100%', marginTop: '4px', padding: '13px' }}
      >
        {loading ? 'Processing…' : `Top Up${amount ? ` SGD ${parseFloat(amount || 0).toFixed(2)}` : ''}`}
      </button>
      <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', margin: '8px 0 0' }}>
        🔒 Secured by Stripe · SGD only · Credited instantly on payment
      </p>
    </form>
  );
}

export default function CorporateDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');

  // Auth + profile state
  const [userId, setUserId] = useState(null);
  const [corpId, setCorpId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dashboard data
  const [corp, setCorp] = useState(null);
  const [staff, setStaff] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [orders, setOrders] = useState([]);
  const [totalSpend, setTotalSpend] = useState('0.00');

  // Create staff account form
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');

  // ── Load user + profile ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate('/login');
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('corp_id, corp_role, is_corporate')
        .eq('id', user.id)
        .single();

      if (!profile?.is_corporate || !profile?.corp_id || profile?.corp_role !== 'admin') {
        navigate('/dashboard');
        return;
      }
      setCorpId(profile.corp_id);
    })();
  }, [navigate]);

  // ── Fetch dashboard data ──────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    if (!corpId || !userId) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/corporate/dashboard?corp_id=${corpId}&user_id=${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCorp(data.corp);
      setStaff(data.staff || []);
      setPendingInvites(data.pending_invites || []);
      setOrders(data.orders || []);
      setTotalSpend(data.total_spend || '0.00');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [corpId, userId]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // ── Create staff account ────────────────────────────────────────
  async function handleCreateStaff(e) {
    e.preventDefault();
    setInviteMsg(''); setInviteError('');
    if (!staffName.trim() || !staffEmail.trim()) return;
    setInviteLoading(true);
    try {
      const res = await fetch(`${BACKEND}/corporate/staff/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corp_id: corpId,
          full_name: staffName.trim(),
          email: staffEmail.trim(),
          created_by_user_id: userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInviteMsg(`Account created for ${staffEmail} — login details sent by email.`);
      setStaffName('');
      setStaffEmail('');
      fetchDashboard();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteLoading(false);
    }
  }

  // ── CSV export ────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Order Code', 'Staff Name', 'Country', 'Plan', 'Amount (SGD)', 'Status', 'Date'],
      ...orders.map(o => [
        o.order_code,
        o.customer_name || '—',
        o.country_name || '—',
        o.package_title || '—',
        o.price_sgd,
        o.status,
        new Date(o.created_at).toLocaleDateString('en-SG'),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corp-orders-${corp?.company_name?.replace(/\s/g, '-') || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !corp) return <div className={styles.loading}>Loading…</div>;
  if (error) return <div className={styles.errorPage}>{error}</div>;
  if (!corp) return null;

  const isPending = corp.approval_status === 'pending';

  const completedOrders = orders.filter(o => o.status === 'completed');

  return (
    <div className={styles.page}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.corpName}>{corp.company_name}</div>
          <div className={styles.corpMeta}>Corporate Portal</div>
        </div>

        <nav className={styles.nav}>
          {[
            ['overview',  '📊', 'Overview'],
            ['staff',     '👥', 'Staff'],
            ['orders',    '📦', 'Orders'],
            ['wallet',    '💳', 'Wallet'],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={`${styles.navBtn} ${tab === id ? styles.navActive : ''}`}
              onClick={() => setTab(id)}
            >
              <span className={styles.navIcon}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>
          ← Back to My Account
        </button>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main className={styles.main}>

        {/* ── Pending approval banner ─────────────────────────────── */}
        {isPending && (
          <div style={{
            background: '#fffbeb', border: '1.5px solid #f59e0b',
            borderRadius: '14px', padding: '18px 24px',
            marginBottom: '28px', display: 'flex', gap: '14px', alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>⏳</span>
            <div>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.95rem', marginBottom: '4px' }}>
                Account Pending Approval
              </div>
              <div style={{ fontSize: '0.85rem', color: '#78350f', lineHeight: 1.5 }}>
                Your corporate account is currently under review. We aim to approve all applications
                within <strong>48 hours</strong>. You will receive an email confirmation once approved.
                You will not be able to top up the wallet or place orders until your account is approved.
              </div>
            </div>
          </div>
        )}

        {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Overview</h2>

            <div className={styles.statsGrid}>
              {[
                { label: 'Corporate Wallet', value: `SGD ${parseFloat(corp.wallet_balance || 0).toFixed(2)}`, accent: true },
                { label: 'Total Staff', value: staff.length },
                { label: 'Total Orders', value: completedOrders.length },
                { label: 'Total Spend', value: `SGD ${totalSpend}` },
              ].map(({ label, value, accent }) => (
                <div key={label} className={`${styles.statCard} ${accent ? styles.accentCard : ''}`}>
                  <div className={styles.statValue}>{value}</div>
                  <div className={styles.statLabel}>{label}</div>
                </div>
              ))}
            </div>

            {/* Quick create staff account */}
            <div className={styles.quickInvite}>
              <h3 className={styles.subTitle}>Create a Staff Account</h3>
              <p className={styles.formNote} style={{ margin: '0 0 12px' }}>
                Staff email must use your company's domain{corp?.email_domain ? ` (@${corp.email_domain})` : ''}.
                A temporary password is generated and emailed to them automatically.
              </p>
              <form onSubmit={handleCreateStaff} className={styles.inviteRow}>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Jane Smith"
                  value={staffName}
                  onChange={e => setStaffName(e.target.value)}
                  required
                />
                <input
                  className={styles.input}
                  type="email"
                  placeholder={corp?.email_domain ? `jane@${corp.email_domain}` : 'staff@company.com'}
                  value={staffEmail}
                  onChange={e => setStaffEmail(e.target.value)}
                  required
                />
                <button type="submit" className={styles.primaryBtn} disabled={inviteLoading}>
                  {inviteLoading ? 'Creating…' : 'Create Account'}
                </button>
              </form>
              {inviteMsg && <p className={styles.successMsg}>{inviteMsg}</p>}
              {inviteError && <p className={styles.errorMsg}>{inviteError}</p>}
            </div>

            {/* Pending invites — legacy, will always be empty under the
                new admin-created flow; left in place harmlessly */}
            {pendingInvites.length > 0 && (
              <div className={styles.pendingBox}>
                <h3 className={styles.subTitle}>Pending Invites ({pendingInvites.length})</h3>
                <div className={styles.pendingList}>
                  {pendingInvites.map(inv => (
                    <div key={inv.id} className={styles.pendingRow}>
                      <span className={styles.pendingEmail}>{inv.email}</span>
                      <span className={styles.pendingDate}>
                        Sent {new Date(inv.created_at).toLocaleDateString('en-SG')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ STAFF ════════════════════════════════════════════════ */}
        {tab === 'staff' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Staff Members</h2>
              <button className={styles.primaryBtn} onClick={() => setTab('overview')}>
                + Create Staff Account
              </button>
            </div>

            {staff.length === 0 ? (
              <div className={styles.emptyState}>No staff members yet. Invite your first team member.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(s => (
                      <tr key={s.id}>
                        <td>
                          <div className={styles.staffName}>{s.full_name || '—'}</div>
                        </td>
                        <td>
                          <span className={`${styles.roleBadge} ${s.corp_role === 'admin' ? styles.adminBadge : ''}`}>
                            {s.corp_role}
                          </span>
                        </td>
                        <td>{new Date(s.created_at).toLocaleDateString('en-SG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ ORDERS ═══════════════════════════════════════════════ */}
        {tab === 'orders' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Staff Orders</h2>
              {orders.length > 0 && (
                <button className={styles.outlineBtn} onClick={exportCSV}>
                  ↓ Export CSV
                </button>
              )}
            </div>

            {orders.length === 0 ? (
              <div className={styles.emptyState}>No orders yet.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Staff</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td className={styles.mono}>{o.order_code}</td>
                        <td>{o.customer_name || '—'}</td>
                        <td>
                          <div className={styles.planCell}>
                            <span className={styles.planName}>{o.package_title}</span>
                            <span className={styles.planCountry}>{o.country_name}</span>
                          </div>
                        </td>
                        <td className={styles.amount}>SGD {parseFloat(o.price_sgd).toFixed(2)}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[o.status]}`}>{o.status}</span>
                        </td>
                        <td>{new Date(o.created_at).toLocaleDateString('en-SG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ WALLET ═══════════════════════════════════════════════ */}
        {tab === 'wallet' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Corporate Wallet</h2>
            <div className={styles.walletCard}>
              <div className={styles.walletLabel}>Available Balance</div>
              <div className={styles.walletBalance}>
                SGD {parseFloat(corp.wallet_balance || 0).toFixed(2)}
              </div>
              <p className={styles.walletNote}>
                Staff purchases are automatically deducted from this balance.
                Top up below using a card — credited instantly.
              </p>
            </div>

            <div className={styles.walletStats}>
              <div className={styles.wStat}>
                <span className={styles.wStatVal}>SGD {totalSpend}</span>
                <span className={styles.wStatLabel}>Total Spent</span>
              </div>
              <div className={styles.wStat}>
                <span className={styles.wStatVal}>{completedOrders.length}</span>
                <span className={styles.wStatLabel}>Completed Orders</span>
              </div>
            </div>

            {isPending ? (
              <div className={styles.emptyState} style={{ marginTop: '20px' }}>
                ⏳ Top-up is unavailable until your account is approved.
              </div>
            ) : (
              <div className={styles.topUpCard}>
                <h3 className={styles.subTitle} style={{ marginBottom: '20px' }}>Top Up Wallet</h3>
                <Elements stripe={stripePromise}>
                  <TopUpForm
                    corpId={corpId}
                    userId={userId}
                    onSuccess={fetchDashboard}
                  />
                </Elements>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
