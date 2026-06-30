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
            <svg className={styles.globeSvg} width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="#2A6FDB" strokeWidth="1.4" fill="rgba(42,111,219,0.08)" />
              <ellipse cx="16" cy="16" rx="5.5" ry="14" stroke="#2A6FDB" strokeWidth="1" strokeDasharray="2 2" className={styles.globeLon} />
              <ellipse cx="16" cy="16" rx="14" ry="5.5" stroke="#2A6FDB" strokeWidth="1" strokeDasharray="2 2" className={styles.globeLat} />
              <line x1="2" y1="16" x2="30" y2="16" stroke="#2A6FDB" strokeWidth="1" opacity="0.5" />
            </svg>
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
              <Link to="/dashboard" className={`${styles.link} ${isActive('/dashboard') ? styles.linkActive : ''}`}>
                {t('nav_dashboard', lang)}
              </Link>
              <Link to="/purchases" className={`${styles.link} ${isActive('/purchases') ? styles.linkActive : ''}`}>
                {t('nav_purchases', lang)}
              </Link>
              <Link to="/saved-itineraries" className={`${styles.link} ${isActive('/saved-itineraries') ? styles.linkActive : ''}`}>
                {t('nav_saved', lang)}
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
              <Link to="/saved-itineraries" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>{t('nav_saved', lang)}</Link>
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
