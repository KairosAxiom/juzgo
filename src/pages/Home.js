import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
import styles from './Home.module.css';

const STATS = [
  { num: '190+', label: 'Countries' },
  { num: '60s',  label: 'Activation' },
  { num: 'SGD 6+', label: 'From' },
  { num: '24/7', label: 'Support' },
];

const HOW_STEPS = [
  { n: '01', title: 'Pick your destination', body: '190+ countries. Choose where you\'re headed and the data you need.' },
  { n: '02', title: 'Activate in 60 seconds', body: 'Scan one QR code. No SIM swap, no roaming-bill surprises.' },
  { n: '03', title: 'Let the AI plan it', body: 'Verified places, real addresses, optimised routes — built around you.' },
];

const DESTINATIONS = [
  { country: 'Japan',       from: '6.40', emoji: '🇯🇵' },
  { country: 'Indonesia',   from: '5.90', emoji: '🇮🇩' },
  { country: 'France',      from: '8.10', emoji: '🇫🇷' },
  { country: 'South Korea', from: '7.20', emoji: '🇰🇷' },
];

const ITIN_POINTS = [
  'Verified places and real addresses — never an AI hallucination.',
  'Routes optimised so you spend less time in transit, more time exploring.',
  'A day-by-day plan tuned to your pace, budget and interests.',
];

const AFFILIATES = [
  { name: 'Tiqets',      url: 'https://www.tiqets.com' },
  { name: 'Booking.com', url: 'https://www.booking.com' },
  { name: 'Klook',       url: 'https://affiliate.klook.com/redirect?aid=127608&aff_adid=1341474&k_site=https%3A%2F%2Fwww.klook.com%2F' },
  { name: 'Expedia',     url: 'https://www.expedia.com' },
];

export default function Home() {
  const navigate = useNavigate();
  const { lang, t } = useLang();

  return (
    <div className={styles.page}>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <div className={styles.eyebrow}>Instant eSIM · 190+ Countries</div>
            <h1 className={styles.heroH1}>
              The world,<br />
              <em className={styles.heroEm}>always connected.</em>
            </h1>
            <p className={styles.heroSub}>
              Affordable eSIM data, an AI trip planner — one app, activated in 60 seconds.
              No SIM swaps, no roaming-bill surprises.
            </p>
            <div className={styles.heroCtas}>
              <button className={styles.btnOutline} onClick={() => navigate('/itinerary')}>
                Plan my trip
              </button>
              <button className={styles.btnPrimary} onClick={() => navigate('/plans')}>
                Browse plans →
              </button>
            </div>
            <div className={styles.stats}>
              {STATS.map((s) => (
                <div key={s.label} className={styles.stat}>
                  <span className={styles.statNum}>{s.num}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hero visual placeholder */}
          <div className={styles.heroVisual}>
            <img
              src="/images/hero.png"
              alt="Stay connected everywhere you travel"
              className={styles.heroImg}
            />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className={styles.howSection}>
        <div className={styles.sectionWrap}>
          <div className={styles.eyebrow} style={{ marginBottom: 16 }}>How it works</div>
          <h2 className={styles.sectionH2} style={{ marginBottom: 56 }}>Sorted before you land.</h2>
          <div className={styles.howGrid}>
            {HOW_STEPS.map((step) => (
              <div key={step.n} className={styles.howCard}>
                <div className={styles.howN}>{step.n}</div>
                <h3 className={styles.howTitle}>{step.title}</h3>
                <p className={styles.howBody}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Destinations ── */}
      <section className={styles.destSection}>
        <div className={styles.sectionWrap}>
          <div className={styles.destHeader}>
            <div>
              <div className={styles.eyebrow} style={{ marginBottom: 16 }}>Popular right now</div>
              <h2 className={styles.sectionH2}>Where to next?</h2>
            </div>
            <button className={styles.seeAll} onClick={() => navigate('/plans')}>
              See all destinations →
            </button>
          </div>
          <div className={styles.destGrid}>
            {DESTINATIONS.map((d) => (
              <div key={d.country} className={styles.destCard} onClick={() => navigate('/plans')}>
                <div className={styles.destOverlay} />
                <div className={styles.destEmoji}>{d.emoji}</div>
                <div className={styles.destInfo}>
                  <div className={styles.destCity}>{d.country}</div>
                  <div className={styles.destMeta}>FROM SGD {d.from}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Itinerary teaser ── */}
      <section className={styles.aiSection}>
        <div className={styles.aiInner}>
          <div className={styles.aiText}>
            <div className={styles.eyebrow} style={{ marginBottom: 18 }}>AI itinerary</div>
            <h2 className={styles.aiH2}>
              Tell us where.<br />
              <em className={styles.aiEm}>We'll map the rest.</em>
            </h2>
            <p className={styles.aiSub}>
              Verified places, real addresses, optimised routes — a day-by-day plan built
              around how you like to travel.
            </p>
            <ul className={styles.aiPoints}>
              {ITIN_POINTS.map((pt) => (
                <li key={pt} className={styles.aiPoint}>
                  <span className={styles.aiCheck}>✓</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
            <button className={styles.btnPrimary} onClick={() => navigate('/itinerary')}>
              Plan my itinerary →
            </button>
          </div>
          <div className={styles.aiVisual}>
            <div className={styles.aiImgPlaceholder}>
              <span className={styles.heroPlaceholderText}>🗺️</span>
              <span className={styles.heroPlaceholderSub}>App / map screenshot</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Affiliate bar ── */}
      <div className={styles.affiliateBar}>
        <div className={styles.affiliateInner}>
          <span className={styles.affiliateLabel}>Complete your trip — book hotels, flights &amp; activities:</span>
          <div className={styles.affiliatePills}>
            {AFFILIATES.map((a) => (
              <a key={a.name} href={a.url} target="_blank" rel="noopener noreferrer" className={styles.affiliatePill}>{a.name}</a>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
