import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
import styles from './Plans.module.css';

const AFFILIATES = ['Tiqets', 'Booking.com', 'Klook', 'Expedia'];
const PAGE_SIZE = 24;
const SEARCH_BATCH_SIZE = 60; // larger single fetch when searching, so scope-grouping has enough to work with

const SCOPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'country', label: 'Country' },
  { value: 'region', label: 'Region' },
  { value: 'global', label: 'Global' },
];

/* ─────────────────── country list modal ─────────────────── */
function CountryListModal({ packageId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const backend = process.env.REACT_APP_BACKEND_URL;
        const res = await fetch(`${backend}/catalog/${encodeURIComponent(packageId)}/countries`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to load country list.');
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [packageId]);

  const countries = (data?.countries || []).filter((c) =>
    !search.trim() || c.country_name?.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <h3 className={styles.modalTitle}>{data?.country_region || 'Countries covered'}</h3>
        <p className={styles.modalSub}>
          {loading ? 'Loading…' : `${countries.length} of ${data?.countries?.length || 0} countries`}
        </p>

        {(data?.countries?.length || 0) > 8 && (
          <input
            type="text"
            placeholder="Search countries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.modalSearch}
          />
        )}

        {error && <div className={styles.modalError}>{error}</div>}

        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /></div>
        ) : (
          <div className={styles.modalCountryList}>
            {countries.map((c) => (
              <div key={c.country_code} className={styles.modalCountryRow}>
                {c.country_name}
              </div>
            ))}
            {countries.length === 0 && <div className={styles.modalEmptyNote}>No countries match "{search}".</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── main page ─────────────────── */
export default function Plans() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [countryModalId, setCountryModalId] = useState(null);
  const navigate = useNavigate();
  const { t } = useLang();
  const searchDebounce = useRef(null);

  const fetchPlans = useCallback(async (targetPage, append) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const backend = process.env.REACT_APP_BACKEND_URL;
      const isSearching = !!search;
      const limit = isSearching ? SEARCH_BATCH_SIZE : PAGE_SIZE;
      const params = new URLSearchParams({ page: targetPage, limit });
      if (scope) params.set('scope', scope);
      if (search) params.set('search', search);

      const res = await fetch(`${backend}/catalog/browse?${params}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to load plans.');

      setRows((prev) => (append ? [...prev, ...result.rows] : result.rows));
      setTotal(result.total);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [scope, search]);

  useEffect(() => {
    setPage(1);
    fetchPlans(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, search]);

  function onSearchChange(v) {
    setSearchInput(v);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setSearch(v.trim()), 400);
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    fetchPlans(next, true);
  }

  function handleBuy(row) {
    const plan = {
      id: row.package_id,
      package_id: row.package_id,
      plan_name: `${row.data_amount || 'Data'} · ${row.validity_days || '?'} Days`,
      data_amount: row.data_amount,
      validity_days: row.validity_days,
      price_sgd: row.price_sgd,
      scope: row.scope,
      type: row.type,
    };
    const country = { name: row.country_region };
    navigate('/checkout', { state: { plan, country } });
  }

  const isUnlimited = (r) => r.data_amount?.toLowerCase() === 'unlimited';
  const canLoadMore = !search && rows.length < total;

  // When searching with no scope filter, group results narrowest-to-broadest
  // per the agreed search UX (DECISIONS.md) rather than mixing scopes in one
  // flat list — makes it clear which results are exact-country plans vs.
  // bundles that merely happen to cover the searched place.
  const grouped = search && !scope
    ? {
        country: rows.filter((r) => r.scope === 'country'),
        region: rows.filter((r) => r.scope === 'region'),
        global: rows.filter((r) => r.scope === 'global'),
      }
    : null;

  function renderCard(row) {
    const unlimited = isUnlimited(row);
    return (
      <div
        key={row.package_id}
        className={`${styles.planCard} ${unlimited ? styles.planCardUnlimited : ''}`}
      >
        {unlimited && <span className={`${styles.badge} ${styles.badgeBlue}`}>Unlimited</span>}

        <div className={styles.planCountry}>
          <span className={styles.planCountryName}>{row.country_region}</span>
        </div>

        <div className={styles.planData}>{row.data_amount}</div>
        <div className={styles.planDays}>{row.validity_days} days{row.rechargeable ? ' · rechargeable' : ''}</div>

        {row.scope !== 'country' && (
          <button
            type="button"
            className={styles.coversLink}
            onClick={() => setCountryModalId(row.package_id)}
          >
            Covers {row.coverage_count || 'multiple'} countries — view list →
          </button>
        )}

        <hr className={styles.divider} />

        <div className={styles.planPrice}>
          <span className={styles.planCurrency}>SGD</span>
          <span className={styles.planAmount}>{parseFloat(row.price_sgd).toFixed(2)}</span>
        </div>

        <button
          className={unlimited ? styles.btnBlue : styles.btnGreen}
          onClick={() => handleBuy(row)}
        >
          Buy now →
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.eyebrow}>eSIM Plans</div>
          <h1 className={styles.h1}>Data that travels<br />with you.</h1>
          <p className={styles.sub}>Instant eSIM plans for 190+ destinations — single countries, regional, or global.</p>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          <div className={styles.filterPillGroup}>
            {SCOPE_FILTERS.map((f) => (
              <button
                key={f.value}
                className={`${styles.filterPill} ${scope === f.value ? styles.filterPillActive : ''}`}
                onClick={() => setScope(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search by country — e.g. Japan, Thailand…"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Affiliate bar */}
        <div className={styles.affiliateBar}>
          <span className={styles.affiliateLabel}>Complete your trip — book hotels, flights &amp; activities:</span>
          <div className={styles.affiliatePills}>
            {AFFILIATES.map((a) => (
              <span key={a} className={styles.affiliatePill}>{a}</span>
            ))}
          </div>
        </div>

        {error && <div className={styles.errorNote}>{error}</div>}

        {/* Plan grid */}
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            <p>No plans match your search yet. <br />Try a different destination or <a href="mailto:hello@juzgo.world">contact us</a>.</p>
          </div>
        ) : grouped ? (
          <>
            {grouped.country.length > 0 && (
              <>
                <div className={styles.groupHeader}>Country plans</div>
                <div className={styles.planGrid}>{grouped.country.map(renderCard)}</div>
              </>
            )}
            {grouped.region.length > 0 && (
              <>
                <div className={styles.groupHeader}>Regional bundles covering this destination</div>
                <div className={styles.planGrid}>{grouped.region.map(renderCard)}</div>
              </>
            )}
            {grouped.global.length > 0 && (
              <>
                <div className={styles.groupHeader}>Global bundles covering this destination</div>
                <div className={styles.planGrid}>{grouped.global.map(renderCard)}</div>
              </>
            )}
          </>
        ) : (
          <>
            <div className={styles.planGrid}>{rows.map(renderCard)}</div>
            {canLoadMore && (
              <div className={styles.loadMoreWrap}>
                <button className={styles.btnLoadMore} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : `Load more (${rows.length} of ${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {countryModalId && (
        <CountryListModal packageId={countryModalId} onClose={() => setCountryModalId(null)} />
      )}

      <Footer />
    </div>
  );
}
