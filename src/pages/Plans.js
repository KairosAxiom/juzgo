import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang, t } from '../lib/i18n';
import Footer from '../components/Footer';
import styles from './Plans.module.css';

const AFFILIATES = ['Tiqets', 'Booking.com', 'Klook', 'Expedia'];

export default function Plans() {
  const [countries, setCountries] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { lang } = useLang();

  useEffect(() => {
    fetchCountries();
  }, []);

  useEffect(() => {
    if (selectedCountry) fetchPlans(selectedCountry.id);
  }, [selectedCountry]);

  async function fetchCountries() {
    const { data } = await supabase.from('countries').select('*').order('name');
    if (data?.length) {
      setCountries(data);
      setSelectedCountry(data[0]);
    }
    setLoading(false);
  }

  async function fetchPlans(countryId) {
    setLoading(true);
    const { data } = await supabase
      .from('esim_plans')
      .select('*')
      .eq('country_id', countryId)
      .eq('is_active', true)
      .order('price_sgd');
    setPlans(data || []);
    setLoading(false);
  }

  function handleBuy(plan) {
    navigate('/checkout', { state: { plan, country: selectedCountry } });
  }

  const isUnlimited = (p) => p.plan_name?.toLowerCase().includes('unlimited') || p.data_gb >= 100;

  return (
    <div className={styles.page}>
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.eyebrow}>eSIM Plans</div>
          <h1 className={styles.h1}>Data that travels<br />with you.</h1>
          <p className={styles.sub}>Instant eSIM plans for 190+ countries. No SIM swaps, no roaming surprises.</p>
        </div>

        {/* Country selector */}
        <div className={styles.selectorWrap}>
          <div className={styles.selectorBox}>
            <select
              value={selectedCountry?.id || ''}
              onChange={(e) => {
                const c = countries.find((c) => String(c.id) === e.target.value);
                setSelectedCountry(c);
              }}
              className={styles.select}
            >
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flag_emoji} {c.name}
                </option>
              ))}
            </select>
            <span className={styles.selectArrow}>▼</span>
          </div>
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

        {/* Plan grid */}
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        ) : plans.length === 0 ? (
          <div className={styles.empty}>
            <p>No plans available for this destination yet. <br />Check back soon or <a href="mailto:hello@juzgo.world">contact us</a>.</p>
          </div>
        ) : (
          <div className={styles.planGrid}>
            {plans.map((plan, i) => {
              const unlimited = isUnlimited(plan);
              const popular = !unlimited && i === 1;
              return (
                <div
                  key={plan.id}
                  className={`${styles.planCard} ${popular ? styles.planCardPopular : ''} ${unlimited ? styles.planCardUnlimited : ''}`}
                >
                  {popular && <span className={`${styles.badge}`}>Most popular</span>}
                  {unlimited && <span className={`${styles.badge} ${styles.badgeBlue}`}>Unlimited</span>}

                  <div className={styles.planCountry}>
                    <span className={styles.planFlag}>{selectedCountry?.flag_emoji}</span>
                    <span className={styles.planCountryName}>{selectedCountry?.name}</span>
                  </div>

                  <div className={styles.planData}>
                    {unlimited ? 'Unlimited' : `${plan.data_gb} GB`}
                  </div>
                  <div className={styles.planDays}>{plan.validity_days} days · local 5G network</div>

                  <hr className={styles.divider} />

                  <div className={styles.planPrice}>
                    <span className={styles.planCurrency}>SGD</span>
                    <span className={styles.planAmount}>{parseFloat(plan.price_sgd).toFixed(2)}</span>
                  </div>

                  <button
                    className={unlimited ? styles.btnBlue : styles.btnGreen}
                    onClick={() => handleBuy(plan)}
                  >
                    Buy now →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
