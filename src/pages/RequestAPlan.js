import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
import styles from './RequestAPlan.module.css';

// Session 24 — "Request a Plan" (Special Request channel). A second purchase
// path alongside the normal /plans storefront: ticks are built live from
// whatever data amounts / durations / regions actually exist among catalog
// packages David hasn't (yet) turned on for sale. Matching is a plain
// structured filter server-side (POST /special-request/match) — nothing here
// is free text. Results reuse the exact same /checkout flow as a normal
// purchase; the only difference is plan.orderSource travels along so the
// backend knows to skip the is_active gate and charge the catalog floor
// price instead of a curated your_price.
export default function RequestAPlan() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [user, setUser] = useState(null);

  const [options, setOptions] = useState({ data_amounts: [], durations: [], regions: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');

  const [dataAmount, setDataAmount] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [countryRegion, setCountryRegion] = useState('');

  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState([]);
  const [specialRequestLogId, setSpecialRequestLogId] = useState(null);
  const [noMatchMessage, setNoMatchMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      setOptionsLoading(true);
      setOptionsError('');
      try {
        const backend = process.env.REACT_APP_BACKEND_URL;
        const res = await fetch(`${backend}/special-request/options`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load options.');
        if (!cancelled) setOptions(data);
      } catch (err) {
        if (!cancelled) setOptionsError(err.message);
      }
      if (!cancelled) setOptionsLoading(false);
    }
    loadOptions();
    return () => { cancelled = true; };
  }, []);

  async function handleSearch() {
    setSearching(true);
    setSearched(false);
    setError('');
    setNoMatchMessage('');
    setResults([]);
    try {
      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/special-request/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataAmount: dataAmount || null,
          validityDays: validityDays ? parseInt(validityDays, 10) : null,
          countryRegion: countryRegion || null,
          customerEmail: user?.email || null,
          userId: user?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');

      setSpecialRequestLogId(data.specialRequestLogId || null);
      if (data.matched) {
        setResults(data.results);
      } else {
        setNoMatchMessage(data.message);
      }
    } catch (err) {
      setError(err.message);
    }
    setSearching(false);
    setSearched(true);
  }

  function handleOrder(row) {
    const plan = {
      id: row.package_id,
      package_id: row.package_id,
      plan_name: `${row.data_amount || 'Data'} · ${row.validity_days || '?'} Days`,
      data_amount: row.data_amount,
      validity_days: row.validity_days,
      price_sgd: row.price_sgd,
      scope: row.scope,
      orderSource: 'special_request',
      specialRequestLogId,
    };
    const country = { name: row.country_region };
    navigate('/checkout', { state: { plan, country } });
  }

  const isUnlimited = (r) => r.data_amount?.toLowerCase() === 'unlimited';

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>{t?.('req_eyebrow') || 'Can\'t find your plan?'}</div>
          <h1 className={styles.h1}>Request a Plan</h1>
          <p className={styles.sub}>
            Tell us what you need and we'll check for a match among plans we haven't
            listed yet. If we find one, you can order it right away.
          </p>
        </div>

        {optionsError && <div className={styles.errorNote}>{optionsError}</div>}

        <div className={styles.formCard}>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Data amount</div>
            <div className={styles.pillGroup}>
              <button
                type="button"
                className={`${styles.pill} ${dataAmount === '' ? styles.pillActive : ''}`}
                onClick={() => setDataAmount('')}
              >
                Any
              </button>
              {options.data_amounts.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.pill} ${dataAmount === d ? styles.pillActive : ''}`}
                  onClick={() => setDataAmount(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.fieldLabel}>Duration</div>
            <div className={styles.pillGroup}>
              <button
                type="button"
                className={`${styles.pill} ${validityDays === '' ? styles.pillActive : ''}`}
                onClick={() => setValidityDays('')}
              >
                Any
              </button>
              {options.durations.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.pill} ${String(validityDays) === String(d) ? styles.pillActive : ''}`}
                  onClick={() => setValidityDays(String(d))}
                >
                  {d} {d === 1 ? 'Day' : 'Days'}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.fieldLabel}>Country / Region</div>
            <div className={styles.pillGroup}>
              <button
                type="button"
                className={`${styles.pill} ${countryRegion === '' ? styles.pillActive : ''}`}
                onClick={() => setCountryRegion('')}
              >
                Any
              </button>
              {options.regions.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${styles.pill} ${countryRegion === r ? styles.pillActive : ''}`}
                  onClick={() => setCountryRegion(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {optionsLoading && <div className={styles.hint}>Loading current options…</div>}

          <button
            type="button"
            className={styles.btnSearch}
            onClick={handleSearch}
            disabled={searching || optionsLoading}
          >
            {searching ? 'Searching…' : 'Find a Plan'}
          </button>
        </div>

        {error && <div className={styles.errorNote}>{error}</div>}

        {searched && !error && (
          <div className={styles.resultsWrap}>
            {noMatchMessage && (
              <div className={styles.noMatchCard}>
                <p>{noMatchMessage}</p>
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className={styles.groupHeader}>
                  {results.length === 1 ? 'We found a match' : `We found ${results.length} matches`}
                </div>
                <div className={styles.resultsGrid}>
                  {results.map((row) => (
                    <div key={row.package_id} className={styles.resultCard}>
                      <div className={styles.resultRegion}>{row.country_region}</div>
                      <div className={styles.resultData}>
                        {isUnlimited(row) ? 'Unlimited Data' : row.data_amount}
                      </div>
                      <div className={styles.resultMeta}>{row.validity_days} Days</div>
                      <div className={styles.resultPrice}>SGD {parseFloat(row.price_sgd).toFixed(2)}</div>
                      <button
                        type="button"
                        className={styles.btnOrder}
                        onClick={() => handleOrder(row)}
                      >
                        Would you like to order this?
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
