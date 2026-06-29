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
        <span className={styles.globe}>🌐</span>
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
