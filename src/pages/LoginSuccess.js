import React from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';
import styles from './Pages.module.css';

export default function LoginSuccess() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.successCenter}>
          <div className={styles.successIcon}>✓</div>
          <h1 className={styles.successH1}>Account created!</h1>
          <p className={styles.successSub}>
            Welcome to Juzgo. We've sent a confirmation link to your email — please verify your address to unlock all features.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className={styles.btnPrimary} onClick={() => navigate('/plans')}>
              Browse plans →
            </button>
            <button className={styles.btnOutline} onClick={() => navigate('/login')}>
              Log in
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
