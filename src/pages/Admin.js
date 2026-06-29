import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import styles from './Admin.module.css';

const TABS = ['Orders', 'Users', 'Wallet', 'Logs', 'Resellers', 'Sales', 'Analytics'];

/* ─────────────────── helpers ─────────────────── */
function Spinner() { return <div className={styles.spinner} />; }

function EmptyState({ icon, text }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>{icon}</span>
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

/* ─────────────────── main component ─────────────────── */
export default function Admin() {
  const [tab, setTab] = useState('Orders');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({});
  const navigate = useNavigate();

  // Auth guard — admin only
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login'); return; }
      if (session.user.email !== process.env.REACT_APP_ADMIN_EMAIL) { navigate('/'); return; }
      loadTab('Orders', session.access_token);
    });
  }, []);

  const loadTab = useCallback(async (tabName, token) => {
    if (data[tabName]) return; // already loaded
    setLoading(true);
    try {
      const backend = process.env.REACT_APP_BACKEND_URL;
      const headers = { Authorization: `Bearer ${token}` };
      let result = {};

      if (tabName === 'Orders') {
        const res = await fetch(`${backend}/admin/orders`, { headers });
        result = { orders: await res.json() };
      } else if (tabName === 'Users') {
        const res = await fetch(`${backend}/admin/users`, { headers });
        result = { users: await res.json() };
      } else if (tabName === 'Wallet') {
        const res = await fetch(`${backend}/admin/wallet-log`, { headers });
        result = { walletLog: await res.json() };
      } else if (tabName === 'Logs') {
        const res = await fetch(`${backend}/admin/logs`, { headers });
        result = { logs: await res.json() };
      } else if (tabName === 'Resellers') {
        const res = await fetch(`${backend}/admin/resellers`, { headers });
        result = { resellers: await res.json() };
      } else if (tabName === 'Sales') {
        const [salesRes, refRes] = await Promise.all([
          fetch(`${backend}/admin/sales`, { headers }),
          fetch(`${backend}/admin/referral-stats`, { headers }),
        ]);
        result = { sales: await salesRes.json(), referralStats: await refRes.json() };
      } else if (tabName === 'Analytics') {
        const res = await fetch(`${backend}/admin/analytics`, { headers });
        result = { analytics: await res.json() };
      }

      setData((prev) => ({ ...prev, [tabName]: result }));
    } catch {}
    setLoading(false);
  }, [data]);

  async function switchTab(tabName) {
    setTab(tabName);
    const { data: { session } } = await supabase.auth.getSession();
    loadTab(tabName, session?.access_token);
  }

  function exportCSV(rows, filename) {
    if (!rows?.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  }

  /* ── tabs ── */
  const d = data[tab] || {};

  return (
    <div className={styles.page}>
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.eyebrow}>Admin panel</div>
            <h1 className={styles.h1}>Juzgo Admin</h1>
          </div>
        </div>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t}
              className={`${styles.tabBtn} ${tab === t ? styles.tabBtnActive : ''}`}
              onClick={() => switchTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {loading && <div className={styles.loadingBar}><Spinner /></div>}

        {/* ── Orders ── */}
        {tab === 'Orders' && (
          <div className={styles.tabContent}>
            <div className={styles.tabTopRow}>
              <h2 className={styles.tabH2}>All Orders</h2>
              <button className={styles.btnExport} onClick={() => exportCSV(d.orders, 'orders.csv')}>Export CSV</button>
            </div>
            {!d.orders ? null : d.orders.length === 0 ? <EmptyState icon="📦" text="No orders yet." /> : (
              <div className={styles.table}>
                <div className={`${styles.tableRow} ${styles.tableHead}`}>
                  <span>Order</span><span>Customer</span><span>Plan</span><span>Amount</span><span>Method</span><span>Status</span><span>Date</span>
                </div>
                {d.orders.map((o) => (
                  <div key={o.id} className={styles.tableRow}>
                    <span className={styles.mono}>{o.order_code}</span>
                    <span>{o.customer_email}</span>
                    <span>{o.package_title || o.country_name}</span>
                    <span>SGD {parseFloat(o.price_sgd).toFixed(2)}</span>
                    <span className={styles.mono}>{o.payment_method || 'card'}</span>
                    <span><span className={`${styles.badge} ${styles['badge_' + o.status]}`}>{o.status}</span></span>
                    <span className={styles.date}>{new Date(o.created_at).toLocaleDateString('en-SG')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Users ── */}
        {tab === 'Users' && (
          <div className={styles.tabContent}>
            <div className={styles.tabTopRow}>
              <h2 className={styles.tabH2}>All Users</h2>
              <button className={styles.btnExport} onClick={() => exportCSV(d.users, 'users.csv')}>Export CSV</button>
            </div>
            {!d.users ? null : d.users.length === 0 ? <EmptyState icon="👤" text="No users yet." /> : (
              <div className={styles.table}>
                <div className={`${styles.tableRow} ${styles.tableHead}`}>
                  <span>Name</span><span>Email</span><span>Wallet</span><span>Referral code</span><span>Joined</span>
                </div>
                {d.users.map((u) => (
                  <div key={u.id} className={styles.tableRow}>
                    <span>{u.full_name || '—'}</span>
                    <span>{u.email}</span>
                    <span>SGD {parseFloat(u.wallet_balance || 0).toFixed(2)}</span>
                    <span className={styles.mono}>{u.referral_code || '—'}</span>
                    <span className={styles.date}>{new Date(u.created_at).toLocaleDateString('en-SG')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Wallet ── */}
        {tab === 'Wallet' && (
          <div className={styles.tabContent}>
            <div className={styles.tabTopRow}>
              <h2 className={styles.tabH2}>Wallet Transactions</h2>
              <button className={styles.btnExport} onClick={() => exportCSV(d.walletLog, 'wallet.csv')}>Export CSV</button>
            </div>
            {!d.walletLog ? null : d.walletLog.length === 0 ? <EmptyState icon="💳" text="No wallet activity yet." /> : (
              <div className={styles.table}>
                <div className={`${styles.tableRow} ${styles.tableHead}`}>
                  <span>User</span><span>Type</span><span>Amount</span><span>Note</span><span>Date</span>
                </div>
                {d.walletLog.map((w, i) => (
                  <div key={i} className={styles.tableRow}>
                    <span>{w.user_email || w.user_id}</span>
                    <span className={styles.mono}>{w.type}</span>
                    <span className={w.amount > 0 ? styles.amtPos : styles.amtNeg}>
                      {w.amount > 0 ? '+' : ''}SGD {parseFloat(w.amount).toFixed(2)}
                    </span>
                    <span>{w.note || '—'}</span>
                    <span className={styles.date}>{new Date(w.created_at).toLocaleDateString('en-SG')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Logs ── */}
        {tab === 'Logs' && (
          <div className={styles.tabContent}>
            <h2 className={styles.tabH2}>System Logs</h2>
            {!d.logs ? null : d.logs.length === 0 ? <EmptyState icon="📋" text="No logs." /> : (
              <div className={styles.logList}>
                {d.logs.map((l, i) => (
                  <div key={i} className={`${styles.logRow} ${styles['log_' + (l.level || 'info')]}`}>
                    <span className={styles.logTime}>{new Date(l.created_at).toLocaleString('en-SG')}</span>
                    <span className={`${styles.logLevel} ${styles['logLevel_' + (l.level || 'info')]}`}>{(l.level || 'info').toUpperCase()}</span>
                    <span className={styles.logMsg}>{l.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Resellers ── */}
        {tab === 'Resellers' && (
          <div className={styles.tabContent}>
            <h2 className={styles.tabH2}>Resellers</h2>
            <ResellerManager data={d} />
          </div>
        )}

        {/* ── Sales ── */}
        {tab === 'Sales' && (
          <div className={styles.tabContent}>
            <h2 className={styles.tabH2}>Sales &amp; Referrals</h2>
            {d.sales && (
              <div className={styles.statsGrid}>
                <StatCard label="Total revenue" value={`SGD ${parseFloat(d.sales.total_revenue || 0).toFixed(2)}`} />
                <StatCard label="Orders" value={d.sales.total_orders || 0} />
                <StatCard label="Referral credits issued" value={`SGD ${parseFloat(d.sales.referral_credits || 0).toFixed(2)}`} />
                <StatCard label="Reseller commissions" value={`SGD ${parseFloat(d.sales.reseller_commission || 0).toFixed(2)}`} />
              </div>
            )}
            {d.referralStats?.length > 0 && (
              <>
                <div className={styles.subH3}>USR- Referral performance</div>
                <div className={styles.table}>
                  <div className={`${styles.tableRow} ${styles.tableHead}`}>
                    <span>Code</span><span>User</span><span>Referred</span><span>Converted</span><span>Credits earned</span>
                  </div>
                  {d.referralStats.map((r, i) => (
                    <div key={i} className={styles.tableRow}>
                      <span className={styles.mono}>{r.referral_code}</span>
                      <span>{r.user_name || r.email}</span>
                      <span>{r.total_referred || 0}</span>
                      <span>{r.converted || 0}</span>
                      <span>SGD {parseFloat(r.total_credit_earned || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Analytics ── */}
        {tab === 'Analytics' && (
          <div className={styles.tabContent}>
            <h2 className={styles.tabH2}>Analytics</h2>
            {d.analytics && (
              <>
                <div className={styles.statsGrid}>
                  <StatCard label="Revenue YTD" value={`SGD ${parseFloat(d.analytics.revenue_ytd || 0).toFixed(2)}`} />
                  <StatCard label="Orders YTD" value={d.analytics.orders_ytd || 0} />
                  <StatCard label="Avg. order value" value={`SGD ${parseFloat(d.analytics.avg_order || 0).toFixed(2)}`} />
                  <StatCard label="Wallet top-ups YTD" value={`SGD ${parseFloat(d.analytics.wallet_topups_ytd || 0).toFixed(2)}`} />
                </div>

                {d.analytics.top_countries?.length > 0 && (
                  <>
                    <div className={styles.subH3}>Top destinations</div>
                    <div className={styles.table}>
                      <div className={`${styles.tableRow} ${styles.tableHead}`}>
                        <span>Country</span><span>Orders</span><span>Revenue</span>
                      </div>
                      {d.analytics.top_countries.map((c, i) => (
                        <div key={i} className={styles.tableRow}>
                          <span>{c.country_name}</span>
                          <span>{c.order_count}</span>
                          <span>SGD {parseFloat(c.revenue).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {d.analytics.payment_split && (
                  <>
                    <div className={styles.subH3}>Payment method split</div>
                    <div className={styles.statsGrid}>
                      <StatCard label="Card payments" value={`${d.analytics.payment_split.card || 0}%`} />
                      <StatCard label="Wallet payments" value={`${d.analytics.payment_split.wallet || 0}%`} />
                    </div>
                  </>
                )}

                <button
                  className={styles.btnExport}
                  style={{ marginTop: 24 }}
                  onClick={() => exportCSV(d.analytics.daily_revenue, 'daily-revenue.csv')}
                >
                  Export daily revenue CSV
                </button>
              </>
            )}
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}

/* ── Reseller manager sub-component ── */
function ResellerManager({ data }) {
  const [resellers, setResellers] = useState(data.resellers || []);
  const [form, setForm] = useState({ email: '', name: '', discount_value: '', commission_pct: '' });
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupErr, setLookupErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setResellers(data.resellers || []); }, [data.resellers]);

  async function lookupUser() {
    setLookupErr(''); setLookupResult(null);
    const { data: profile, error } = await supabase.from('profiles').select('id, full_name').eq('email', lookupEmail.trim()).single();
    if (error || !profile) { setLookupErr('No user found with that email.'); return; }
    setLookupResult(profile);
    setForm((f) => ({ ...f, email: lookupEmail.trim() }));
  }

  async function createReseller(e) {
    e.preventDefault();
    setError('');
    if (!lookupResult) { setError('Look up a user email first.'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/admin/resellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          user_id: lookupResult.id,
          name: form.name || lookupResult.full_name,
          discount_value: parseFloat(form.discount_value),
          commission_pct: parseFloat(form.commission_pct),
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error || 'Failed to create reseller.');
      setResellers((prev) => [created, ...prev]);
      setForm({ email: '', name: '', discount_value: '', commission_pct: '' });
      setLookupResult(null); setLookupEmail('');
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <div>
      {/* Create reseller */}
      <div className={styles.resellerCreate}>
        <div className={styles.subH3}>Create reseller</div>

        <div className={styles.lookupRow}>
          <input
            type="email"
            placeholder="User email"
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
            className={styles.tableInput}
          />
          <button className={styles.btnLookup} type="button" onClick={lookupUser}>Look up</button>
        </div>
        {lookupErr && <div className={styles.lookupErr}>{lookupErr}</div>}
        {lookupResult && (
          <div className={styles.lookupFound}>
            Found: <strong>{lookupResult.full_name}</strong> <span className={styles.mono}>(ID: {lookupResult.id.slice(0, 8)}…)</span>
          </div>
        )}

        <form onSubmit={createReseller} className={styles.resellerForm}>
          <input
            type="text"
            placeholder="Display name (optional)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={styles.tableInput}
          />
          <input
            type="number"
            placeholder="Discount SGD (e.g. 2)"
            value={form.discount_value}
            onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
            className={styles.tableInput}
            required
            step="0.01"
          />
          <input
            type="number"
            placeholder="Commission % (e.g. 10)"
            value={form.commission_pct}
            onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))}
            className={styles.tableInput}
            required
            step="0.1"
          />
          {error && <div className={styles.lookupErr}>{error}</div>}
          <button type="submit" className={styles.btnCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create reseller'}
          </button>
        </form>
      </div>

      {/* Reseller list */}
      {resellers.length > 0 && (
        <div className={styles.table} style={{ marginTop: 28 }}>
          <div className={`${styles.tableRow} ${styles.tableHead}`}>
            <span>Code</span><span>Name</span><span>Discount</span><span>Commission</span><span>Orders</span><span>Active</span>
          </div>
          {resellers.map((r) => (
            <div key={r.id} className={styles.tableRow}>
              <span className={styles.mono}>{r.code}</span>
              <span>{r.name}</span>
              <span>SGD {parseFloat(r.discount_value || 0).toFixed(2)}</span>
              <span>{r.commission_pct || 0}%</span>
              <span>{r.total_orders || 0}</span>
              <span><span className={`${styles.badge} ${r.is_active ? styles.badge_completed : styles.badge_failed}`}>{r.is_active ? 'Active' : 'Off'}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
