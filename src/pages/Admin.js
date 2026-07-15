import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import styles from './Admin.module.css';

const TABS = ['Orders', 'Users', 'Wallet', 'Logs', 'Resellers', 'Corporate', 'Catalog', 'Sales', 'Analytics'];

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
      } else if (tabName === 'Corporate') {
        const res = await fetch(`${backend}/admin/corporates`, { headers });
        result = { corporates: await res.json() };
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

        {/* ── Corporate ── */}
        {tab === 'Corporate' && (
          <div className={styles.tabContent}>
            <h2 className={styles.tabH2}>Corporate Accounts</h2>
            <CorporateManager data={d} />
          </div>
        )}

        {/* ── Catalog ── */}
        {tab === 'Catalog' && (
          <div className={styles.tabContent}>
            <h2 className={styles.tabH2}>Catalog &amp; Pricing</h2>
            <CatalogManager />
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

/* ── Corporate manager sub-component ── */
function CorporateManager({ data }) {
  const [corps, setCorps] = useState(data.corporates || []);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setCorps(data.corporates || []); }, [data.corporates]);

  const pending = corps.filter((c) => c.approval_status === 'pending');
  const approved = corps.filter((c) => c.approval_status === 'approved');

  async function approve(id) {
    setError('');
    setBusyId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/admin/corporates/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Approval failed.');
      setCorps((prev) => prev.map((c) => (c.id === id ? { ...c, ...result.corp } : c)));
    } catch (err) {
      setError(err.message);
    }
    setBusyId(null);
  }

  async function toggleActive(id, nextActive) {
    setError('');
    setBusyId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/admin/corporates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Update failed.');
      setCorps((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: nextActive } : c)));
    } catch (err) {
      setError(err.message);
    }
    setBusyId(null);
  }

  return (
    <div>
      {error && <div className={styles.lookupErr} style={{ marginBottom: 16 }}>{error}</div>}

      {/* Pending */}
      <div className={styles.subH3}>⏳ Awaiting Approval{pending.length > 0 ? ` (${pending.length})` : ''}</div>
      {pending.length === 0 ? (
        <EmptyState icon="✅" text="No pending corporate applications." />
      ) : (
        <div className={styles.table} style={{ marginBottom: 28 }}>
          <div className={`${styles.tableRow} ${styles.tableHead}`}>
            <span>Company</span><span>Country</span><span>Contact</span><span>Domain</span><span>Applied</span><span>Action</span>
          </div>
          {pending.map((c) => (
            <div key={c.id} className={styles.tableRow}>
              <span>{c.company_name}</span>
              <span>{c.company_country || '—'}</span>
              <span>{c.contact_email}</span>
              <span className={styles.mono}>{c.email_domain || '—'}</span>
              <span className={styles.date}>{new Date(c.created_at).toLocaleDateString('en-SG')}</span>
              <span>
                <button className={styles.btnApprove} onClick={() => approve(c.id)} disabled={busyId === c.id}>
                  {busyId === c.id ? 'Approving…' : '✓ Approve'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Approved */}
      <div className={styles.subH3}>Approved Accounts{approved.length > 0 ? ` (${approved.length})` : ''}</div>
      {approved.length === 0 ? (
        <EmptyState icon="🏢" text="No approved corporate accounts yet." />
      ) : (
        <div className={styles.table}>
          <div className={`${styles.tableRow} ${styles.tableHead}`}>
            <span>Company</span><span>Country</span><span>Domain</span><span>Wallet</span><span>Staff</span><span>Status</span><span>Action</span>
          </div>
          {approved.map((c) => (
            <div key={c.id} className={styles.tableRow}>
              <span>{c.company_name}</span>
              <span>{c.company_country || '—'}</span>
              <span className={styles.mono}>{c.email_domain || '—'}</span>
              <span>SGD {parseFloat(c.wallet_balance || 0).toFixed(2)}</span>
              <span>{c.staff_count || 0}</span>
              <span>
                <span className={`${styles.badge} ${c.is_active ? styles.badge_completed : styles.badge_failed}`}>
                  {c.is_active ? 'Active' : 'Suspended'}
                </span>
              </span>
              <span>
                {c.is_active ? (
                  <button className={styles.btnSuspend} onClick={() => toggleActive(c.id, false)} disabled={busyId === c.id}>
                    {busyId === c.id ? '…' : 'Suspend'}
                  </button>
                ) : (
                  <button className={styles.btnCreate} onClick={() => toggleActive(c.id, true)} disabled={busyId === c.id}>
                    {busyId === c.id ? '…' : 'Reactivate'}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Catalog & Pricing manager sub-component ── */
const SCOPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'country', label: 'Country' },
  { value: 'region', label: 'Region' },
  { value: 'global', label: 'Global' },
];
const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'sim', label: 'Sim' },
  { value: 'topup', label: 'Topup' },
];
const PAGE_SIZE = 50;

function CatalogManager() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState('');
  const [type, setType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  // Draft price text per package_id, so typing doesn't fight server data —
  // seeded from the existing selection's your_price, or the floor as a
  // sensible starting point once "Sell?" is first ticked.
  const [priceDrafts, setPriceDrafts] = useState({});

  const searchDebounce = React.useRef(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const backend = process.env.REACT_APP_BACKEND_URL;
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (scope) params.set('scope', scope);
      if (type) params.set('type', type);
      if (search) params.set('search', search);

      const res = await fetch(`${backend}/admin/catalog?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to load catalog.');

      setRows(result.rows);
      setTotal(result.total);
      setPriceDrafts((prev) => {
        const next = { ...prev };
        result.rows.forEach((r) => {
          if (next[r.package_id] === undefined) {
            next[r.package_id] = r.selection?.your_price ?? r.minimum_selling_price_sgd;
          }
        });
        return next;
      });
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [page, scope, type, search]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  function onSearchChange(v) {
    setSearchInput(v);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(1);
      setSearch(v.trim());
    }, 400);
  }

  function onScopeChange(v) { setScope(v); setPage(1); }
  function onTypeChange(v) { setType(v); setPage(1); }

  async function saveSelection(row, { is_active, your_price }) {
    setSavingId(row.package_id);
    setRowErrors((prev) => ({ ...prev, [row.package_id]: '' }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/admin/catalog/${encodeURIComponent(row.package_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ is_active, your_price }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Save failed.');

      setRows((prev) => prev.map((r) => (r.package_id === row.package_id ? { ...r, selection: result } : r)));
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [row.package_id]: err.message }));
    }
    setSavingId(null);
  }

  function toggleSell(row) {
    const currentlyActive = row.selection?.is_active || false;
    const price = parseFloat(priceDrafts[row.package_id]);
    const safePrice = Number.isFinite(price) ? price : row.minimum_selling_price_sgd;
    saveSelection(row, { is_active: !currentlyActive, your_price: safePrice });
  }

  function onPriceBlur(row) {
    const draft = parseFloat(priceDrafts[row.package_id]);
    if (!Number.isFinite(draft)) return;
    const currentSaved = row.selection?.your_price;
    if (currentSaved !== undefined && draft === currentSaved) return; // unchanged
    saveSelection(row, { is_active: row.selection?.is_active || false, your_price: draft });
  }

  return (
    <div>
      {/* Filters */}
      <div className={styles.catalogFilterBar}>
        <div className={styles.filterPillGroup}>
          {SCOPE_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`${styles.filterPill} ${scope === f.value ? styles.filterPillActive : ''}`}
              onClick={() => onScopeChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className={styles.filterPillGroup}>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`${styles.filterPill} ${type === f.value ? styles.filterPillActive : ''}`}
              onClick={() => onTypeChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search country, region, or package id…"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.catalogSearchInput}
        />
      </div>

      {error && <div className={styles.lookupErr} style={{ marginBottom: 14 }}>{error}</div>}

      <div className={styles.catalogSummaryRow}>
        {total.toLocaleString()} package{total === 1 ? '' : 's'} match{loading ? ' — loading…' : ''}
      </div>

      {/* Table */}
      <div className={styles.table}>
        <div className={`${styles.tableRow} ${styles.tableHead} ${styles.catalogRow}`}>
          <span>Sell?</span>
          <span>Country/Region</span>
          <span>Package Id</span>
          <span>Type</span>
          <span>Data</span>
          <span>Validity</span>
          <span>My Cost (SGD)</span>
          <span>Airalo Min. (SGD)</span>
          <span>Retail Price (SGD)</span>
          <span>Margin</span>
        </div>

        {!loading && rows.length === 0 ? (
          <EmptyState icon="📶" text="No packages match these filters." />
        ) : (
          rows.map((r) => {
            const isActive = r.selection?.is_active || false;
            const draftPrice = priceDrafts[r.package_id] ?? '';
            const priceNum = parseFloat(draftPrice);
            const margin = Number.isFinite(priceNum) ? priceNum - r.net_price_sgd : null;
            const marginPct = margin !== null && priceNum > 0 ? (margin / priceNum) * 100 : null;
            const rowErr = rowErrors[r.package_id];

            return (
              <div key={r.package_id} className={`${styles.tableRow} ${styles.catalogRow}`}>
                <span>
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={savingId === r.package_id}
                    onChange={() => toggleSell(r)}
                    className={styles.catalogCheckbox}
                  />
                </span>
                <span>{r.country_region}</span>
                <span className={styles.mono}>{r.package_id}</span>
                <span className={styles.mono}>{r.type}</span>
                <span>{r.data_amount || '—'}</span>
                <span>{r.validity_days ? `${r.validity_days}d` : '—'}</span>
                <span>{r.net_price_sgd != null ? r.net_price_sgd.toFixed(2) : '—'}</span>
                <span>{r.minimum_selling_price_sgd != null ? r.minimum_selling_price_sgd.toFixed(2) : '—'}</span>
                <span>
                  <input
                    type="number"
                    step="0.01"
                    value={draftPrice}
                    disabled={savingId === r.package_id}
                    onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [r.package_id]: e.target.value }))}
                    onBlur={() => onPriceBlur(r)}
                    className={styles.catalogPriceInput}
                  />
                  {rowErr && <div className={styles.catalogRowErr}>{rowErr}</div>}
                </span>
                <span className={margin === null ? '' : margin >= 0 ? styles.amtPos : styles.amtNeg}>
                  {margin === null ? '—' : `${margin.toFixed(2)} (${marginPct.toFixed(0)}%)`}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className={styles.catalogPagination}>
        <button
          className={styles.btnLookup}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
        >
          ← Prev
        </button>
        <span className={styles.mono}>Page {page} of {totalPages}</span>
        <button
          className={styles.btnLookup}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
