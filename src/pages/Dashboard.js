import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
import VoipPaymentCard from '../components/VoipPaymentCard';
import styles from './Dashboard.module.css';

const TABS = ['Overview', 'Referral', 'VOIP', 'Reseller Portal'];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [corpWallet, setCorpWallet] = useState(null);
  const [corpName, setCorpName] = useState('');
  const [tab, setTab] = useState('Overview');
  const [referralStats, setReferralStats] = useState(null);
  const [resellerData, setResellerData] = useState(null);
  const [isReseller, setIsReseller] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [copied, setCopied] = useState('');
  const navigate = useNavigate();
  const { lang, t } = useLang();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login'); return; }
      setUser(session.user);
      fetchProfile(session.user.id, session.access_token);
      fetchReferral(session.access_token);
      checkReseller(session.user.id, session.access_token);
    });
  }, []);

  async function fetchProfile(userId, accessToken) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data);
    if (data?.is_corporate) {
      const backend = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${backend}/corporate/wallet-balance`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const corpData = await res.json();
      if (res.ok) {
        setCorpWallet(corpData.wallet_balance);
        setCorpName(corpData.company_name || '');
      }
    }
  }

  async function fetchReferral(token) {
    const backend = process.env.REACT_APP_BACKEND_URL;
    const res = await fetch(`${backend}/referral/my-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data) setReferralStats(data);
  }

  async function checkReseller(userId, token) {
    const { data } = await supabase.from('resellers').select('*').eq('id', userId).single();
    if (data) {
      setIsReseller(true);
      fetchResellerData(data, token);
    }
  }

  async function fetchResellerData(reseller, token) {
    const backend = process.env.REACT_APP_BACKEND_URL;
    const res = await fetch(`${backend}/reseller/my-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setResellerData({ ...reseller, ...data });
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  if (!profile) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
      </div>
    );
  }

  // Filter by name rather than TABS.slice(0, 2). The old positional
  // slice hid everything past index 1 from non-resellers, so any tab
  // appended to TABS would have been invisible to most users.
  const tabs = TABS.filter((tb) => tb !== 'Reseller Portal' || isReseller);

  return (
    <div className={styles.page}>
      <main className={styles.main}>

        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.eyebrow}>My Account</div>
            <h1 className={styles.h1}>
              {profile.full_name || profile.nickname
                ? `Hi, ${profile.nickname || profile.full_name.split(' ')[0].charAt(0).toUpperCase() + profile.full_name.split(' ')[0].slice(1).toLowerCase()}.`
                : 'Dashboard'}
            </h1>
          </div>
          <div className={styles.headerRight}>
            {profile.is_corporate ? (
              <div className={styles.walletBadge}>
                <span className={styles.walletIcon}>🏢</span>
                <div>
                  <div className={styles.walletLabel}>{corpName || 'Corporate'} wallet</div>
                  <div className={styles.walletAmount}>SGD {parseFloat(corpWallet || 0).toFixed(2)}</div>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.walletBadge}>
                  <span className={styles.walletIcon}>💳</span>
                  <div>
                    <div className={styles.walletLabel}>Wallet balance</div>
                    <div className={styles.walletAmount}>SGD {parseFloat(profile.wallet_balance || 0).toFixed(2)}</div>
                  </div>
                </div>
                <button className={styles.btnTopUp} onClick={() => navigate('/wallet')}>Top up →</button>
              </>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          {tabs.map((tb) => (
            <button
              key={tb}
              className={`${styles.tabBtn} ${tab === tb ? styles.tabBtnActive : ''}`}
              onClick={() => setTab(tb)}
            >
              {tb}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === 'Overview' && (
          <div className={styles.tabContent}>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>{profile.is_corporate ? 'Corporate Wallet' : 'Wallet'}</div>
                <div className={styles.statValue}>
                  SGD {parseFloat(profile.is_corporate ? corpWallet || 0 : profile.wallet_balance || 0).toFixed(2)}
                </div>
                {!profile.is_corporate && (
                  <button className={styles.btnLink} onClick={() => navigate('/wallet')}>Top up</button>
                )}
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Purchases</div>
                <div className={styles.statValue}>View history</div>
                <button className={styles.btnLink} onClick={() => navigate('/purchases')}>See all →</button>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Saved trips</div>
                <div className={styles.statValue}>My itineraries</div>
                <button className={styles.btnLink} onClick={() => navigate('/saved-itineraries')}>View →</button>
              </div>
            </div>

            {/* Account info */}
            <div className={styles.infoCard}>
              <h3 className={styles.infoH3}>Account details</h3>
              <div className={styles.infoRows}>
                <div className={styles.infoRow}><span className={styles.infoKey}>Email</span><span className={styles.infoVal}>{user?.email}</span></div>
                <div className={styles.infoRow}><span className={styles.infoKey}>Name</span><span className={styles.infoVal}>{profile.full_name || '—'}</span></div>
                <div className={styles.infoRow}><span className={styles.infoKey}>Phone</span><span className={styles.infoVal}>{profile.phone || '—'}</span></div>
              </div>
            </div>

            <button className={styles.btnLogout} onClick={handleLogout}>Sign out</button>
          </div>
        )}

        {/* ── Referral tab ── */}
        {tab === 'Referral' && (
          <div className={styles.tabContent}>
            <div className={styles.referralHero}>
              <div className={styles.eyebrow} style={{ marginBottom: 12 }}>Your referral code</div>
              <div className={styles.referralCode}>{profile.referral_code || 'USR-LOADING'}</div>
              <p className={styles.referralDesc}>Share your link and earn SGD 2.00 wallet credit for every friend who makes their first purchase.</p>
              <div className={styles.referralLinkRow}>
                <input
                  readOnly
                  value={`https://juzgo.world?ref=${profile.referral_code}`}
                  className={styles.referralInput}
                />
                <button
                  className={styles.btnCopy}
                  onClick={() => copyText(`https://juzgo.world?ref=${profile.referral_code}`, 'link')}
                >
                  {copied === 'link' ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </div>

            {referralStats && (
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Friends referred</div>
                  <div className={styles.statValue}>{referralStats.total_referred || 0}</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Credits earned</div>
                  <div className={styles.statValue}>SGD {parseFloat(referralStats.total_credit_earned || 0).toFixed(2)}</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>First purchases</div>
                  <div className={styles.statValue}>{referralStats.converted || 0}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VOIP tab ── */}
        {tab === 'VOIP' && (
          <div className={styles.tabContent}>
            <VoipPaymentCard />
          </div>
        )}

        {/* ── Reseller Portal tab ── */}
        {tab === 'Reseller Portal' && resellerData && (
          <div className={styles.tabContent}>
            <div className={styles.resellerHeader}>
              <div>
                <div className={styles.eyebrow} style={{ marginBottom: 8 }}>Reseller portal</div>
                <h2 className={styles.resellerName}>{resellerData.name}</h2>
                <div className={styles.resellerCode}>{resellerData.code}</div>
              </div>
            </div>

            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Orders attributed</div>
                <div className={styles.statValue}>{resellerData.total_orders || 0}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Commission earned</div>
                <div className={styles.statValue}>SGD {parseFloat(resellerData.commission_earned || 0).toFixed(2)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Discount given</div>
                <div className={styles.statValue}>SGD {parseFloat(resellerData.total_discount || 0).toFixed(2)}</div>
              </div>
            </div>

            <div className={styles.infoCard}>
              <h3 className={styles.infoH3}>Your referral link</h3>
              <div className={styles.referralLinkRow}>
                <input
                  readOnly
                  value={`https://juzgo.world?ref=${resellerData.code}`}
                  className={styles.referralInput}
                />
                <button
                  className={styles.btnCopy}
                  onClick={() => copyText(`https://juzgo.world?ref=${resellerData.code}`, 'reseller')}
                >
                  {copied === 'reseller' ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </div>

            {resellerData.orders?.length > 0 && (
              <div className={styles.ordersCard}>
                <h3 className={styles.infoH3}>Recent attributed orders</h3>
                <div className={styles.ordersTable}>
                  {resellerData.orders.map((o) => (
                    <div key={o.id} className={styles.orderRow}>
                      <span className={styles.orderCode}>{o.order_code}</span>
                      <span className={styles.orderCustomer}>{o.customer_name?.split(' ')[0]}…</span>
                      <span className={styles.orderAmt}>SGD {parseFloat(o.price_sgd).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
