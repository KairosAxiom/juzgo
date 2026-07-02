import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import LanguageToggle from './LanguageToggle';
import styles from './Navbar.module.css';

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, t } = useLang();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) checkAdmin(session.user.email);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) checkAdmin(session.user.email);
      else setIsAdmin(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function checkAdmin(email) {
    const adminEmail = process.env.REACT_APP_ADMIN_EMAIL;
    setIsAdmin(email === adminEmail);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  const isActive = (path) => location.pathname === path;

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        {/* Logo */}
        <Link to="/" className={styles.logo} onClick={() => setMenuOpen(false)}>
          <div className={styles.globeWrap}>
            <svg className={styles.globeSvg} width="44" height="44" viewBox="0 0 44 44">
              <defs>
                <clipPath id="globeClip">
                  <circle cx="22" cy="22" r="19" />
                </clipPath>
                <radialGradient id="oceanGrad" cx="38%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#5BA4E5" />
                  <stop offset="100%" stopColor="#1A5FAB" />
                </radialGradient>
              </defs>
              <circle cx="22" cy="22" r="19" fill="url(#oceanGrad)" />
              <g clipPath="url(#globeClip)">
                <ellipse cx="22" cy="22" rx="6" ry="19" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.9" className={styles.globeLon} />
                <ellipse cx="22" cy="22" rx="13" ry="19" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" className={styles.globeLon2} />
                <ellipse cx="22" cy="15" rx="17" ry="4.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                <ellipse cx="22" cy="22" rx="19" ry="5.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                <ellipse cx="22" cy="29" rx="17" ry="4.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
              </g>
              <ellipse cx="16" cy="14" rx="7" ry="5" fill="rgba(255,255,255,0.15)" />
              <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(42,111,219,0.5)" strokeWidth="1.2" />
            </svg>

            {/* Orbiting green dot */}
            <div className={styles.globeOrbit}>
              <div className={styles.globeDot} />
            </div>
          </div>
          <span className={styles.logoText}>Juzgo</span>
        </Link>

        {/* Desktop links */}
        <div className={styles.links}>
          <Link to="/itinerary" className={`${styles.link} ${isActive('/itinerary') ? styles.linkActive : ''}`}>
            {t('nav_itinerary', lang)}
          </Link>
          <Link to="/plans" className={`${styles.link} ${isActive('/plans') ? styles.linkActive : ''}`}>
            {t('nav_plans', lang)}
          </Link>
          <Link to="/terms" className={`${styles.link} ${isActive('/terms') ? styles.linkActive : ''}`}>
            Terms &amp; Conditions
          </Link>

          {user ? (
            <>
              <Link to="/purchases" className={`${styles.link} ${isActive('/purchases') ? styles.linkActive : ''}`}>
                {t('nav_purchases', lang)}
              </Link>
              <Link to="/saved-itineraries" className={`${styles.link} ${isActive('/saved-itineraries') ? styles.linkActive : ''}`}>
                Saved Itinerary
              </Link>
              <Link to="/dashboard" className={`${styles.link} ${isActive('/dashboard') ? styles.linkActive : ''}`}>
                {t('nav_dashboard', lang)}
              </Link>
              {isAdmin && (
                <Link to="/admin" className={`${styles.link} ${styles.linkAdmin} ${isActive('/admin') ? styles.linkActive : ''}`}>
                  ⚙️ Admin
                </Link>
              )}
              <button onClick={handleLogout} className={styles.btnOutline}>
                {t('nav_logout', lang)}
              </button>
            </>
          ) : (
            <>
              <Link to="/register" className={styles.btnPrimary}>
                {t('nav_register', lang)}
              </Link>
              <Link to="/login" className={styles.btnGhost}>
                {t('nav_login', lang)}
              </Link>
            </>
          )}

          <LanguageToggle />
        </div>

        {/* Mobile hamburger */}
        <button
          className={styles.hamburger}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen1 : ''}`} />
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen2 : ''}`} />
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen3 : ''}`} />
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className={styles.drawer}>
          <Link to="/itinerary" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>{t('nav_itinerary', lang)}</Link>
          <Link to="/plans" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>{t('nav_plans', lang)}</Link>
          <Link to="/terms" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>Terms &amp; Conditions</Link>
          {user ? (
            <>
              <Link to="/dashboard" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>{t('nav_dashboard', lang)}</Link>
              <Link to="/purchases" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>{t('nav_purchases', lang)}</Link>
              <Link to="/saved-itineraries" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>Saved Itinerary</Link>
              {isAdmin && <Link to="/admin" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>⚙️ Admin</Link>}
              <button onClick={() => { handleLogout(); setMenuOpen(false); }} className={styles.drawerBtn}>{t('nav_logout', lang)}</button>
            </>
          ) : (
            <>
              <Link to="/register" className={`${styles.drawerLink} ${styles.drawerLinkGreen}`} onClick={() => setMenuOpen(false)}>{t('nav_register', lang)}</Link>
              <Link to="/login" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>{t('nav_login', lang)}</Link>
            </>
          )}
          <div className={styles.drawerLang}><LanguageToggle /></div>
        </div>
      )}
    </nav>
  );
}
