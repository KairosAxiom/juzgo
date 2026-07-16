import React, { useRef, useState, useEffect } from 'react';
import { useLang } from '../lib/i18n';
import styles from './LanguageToggle.module.css';

const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'zh', label: '中文', name: '简体中文' },
  { code: 'ja', label: '日本語', name: '日本語' },
  { code: 'ko', label: '한국어', name: '한국어' },
];

export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-label="Select language"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="9.5" />
            <ellipse cx="12" cy="12" rx="4" ry="9.5" />
            <line x1="2.5" y1="12" x2="21.5" y2="12" />
          </svg>
        <span className={styles.label}>{current.label}</span>
        <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>▾</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              className={`${styles.option} ${l.code === lang ? styles.optionActive : ''}`}
              onClick={() => { setLang(l.code); setOpen(false); }}
            >
              <span className={styles.optionLabel}>{l.label}</span>
              <span className={styles.optionName}>{l.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
