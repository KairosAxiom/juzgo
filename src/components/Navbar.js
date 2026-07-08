import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import LanguageToggle from './LanguageToggle';
import GlobeLogo from './GlobeLogo';
import styles from './Navbar.module.css';

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCorpUser, setIsCorpUser] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [corpDropdownOpen, setCorpDropdownOpen] = useState(false);
  const corpDropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, t } = useLang();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdmin(session.user.email);
        checkCorpUser(session.user.id);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdmin(session.user.email);
        checkCorpUser(session.user.id);
      } else {
        setIsAdmin(false);
        setIsCorpUser(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Close the Corporate dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (corpDropdownRef.current && !corpDropdownRef.current.contains(e.target)) {
        setCorpDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function checkAdmin(email) {
    const adminEmail = process.env.REACT_APP_ADMIN_EMAIL;
    setIsAdmin(email === adminEmail);
  }

  async function checkCorpUser(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('is_corporate')
      .eq('id', userId)
      .maybeSingle();
    setIsCorpUser(!!data?.is_corporate);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  const isActive = (path) => location.pathname === path;
  const isCorpPath = location.pathname.startsWith('/corporate');

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        {/* Logo */}
        <Link to="/" className={styles.logo} onClick={() => setMenuOpen(false)}>
          <div className={styles.globeWrap}>
            <GlobeLogo size={66} />
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
              {isCorpUser && (
                <Link to="/corporate/dashboard" className={`${styles.link} ${isActive('/corporate/dashboard') ? styles.linkActive : ''}`}>
                  🏢 Corp Portal
                </Link>
              )}
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
              {/* Corporate dropdown — Login / Register for business accounts.
                  NOTE: generic wiring only (Session 20). Does NOT yet reflect
                  the org unification / tour agency model — see
                  ORG-UNIFICATION-SPEC.md in Project Knowledge. Revisit once
                  that's built (e.g. split Corporate vs Tour Agency here). */}
              <div className={styles.corpDropdownWrap} ref={corpDropdownRef}>
                <button
                  className={`${styles.link} ${styles.corpDropdownTrigger} ${isCorpPath ? styles.linkActive : ''}`}
                  onClick={() => setCorpDropdownOpen((o) => !o)}
                  type="button"
                >
                  Corporate <span className={styles.corpCaret}>{corpDropdownOpen ? '▴' : '▾'}</span>
                </button>
                {corpDropdownOpen && (
                  <div className={styles.corpDropdownMenu}>
                    <Link
                      to="/corporate/register"
                      className={styles.corpDropdownItem}
                      onClick={() => setCorpDropdownOpen(false)}
                    >
                      Register
                    </Link>
                    <Link
                      to="/login"
                      className={styles.corpDropdownItem}
                      onClick={() => setCorpDropdownOpen(false)}
                    >
                      Login
                    </Link>
                  </div>
                )}
              </div>

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
              {isCorpUser && (
                <Link to="/corporate/dashboard" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>🏢 Corp Portal</Link>
              )}
              {isAdmin && <Link to="/admin" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>⚙️ Admin</Link>}
              <button onClick={() => { handleLogout(); setMenuOpen(false); }} className={styles.drawerBtn}>{t('nav_logout', lang)}</button>
            </>
          ) : (
            <>
              <Link to="/register" className={`${styles.drawerLink} ${styles.drawerLinkGreen}`} onClick={() => setMenuOpen(false)}>{t('nav_register', lang)}</Link>
              <Link to="/login" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>{t('nav_login', lang)}</Link>
              <div className={styles.drawerCorpSection}>
                <div className={styles.drawerCorpLabel}>Corporate</div>
                <Link to="/corporate/register" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>Register</Link>
                <Link to="/login" className={styles.drawerLink} onClick={() => setMenuOpen(false)}>Login</Link>
              </div>
            </>
          )}
          <div className={styles.drawerLang}><LanguageToggle /></div>
        </div>
      )}
    </nav>
  );
}
