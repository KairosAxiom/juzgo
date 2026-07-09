import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import { generateReceiptPDF } from '../lib/generateReceipt';
import styles from './Purchases.module.css';

export default function Purchases() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login'); return; }
      fetchOrders(session.user.id);
    });
  }, []);

  async function fetchOrders(userId) {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  }

  const statusColor = (s) => ({
    completed: styles.statusCompleted,
    pending:   styles.statusPending,
    failed:    styles.statusFailed,
  }[s] || styles.statusPending);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.eyebrow}>Order history</div>
        <h1 className={styles.h1}>My Purchases</h1>
        <p className={styles.sub}>Your eSIM order history and QR codes.</p>

        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /></div>
        ) : orders.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📱</div>
            <h3 className={styles.emptyH3}>No orders yet</h3>
            <p className={styles.emptySub}>Your purchased eSIM plans will appear here.</p>
            <button className={styles.btnBrowse} onClick={() => navigate('/plans')}>Browse plans →</button>
          </div>
        ) : (
          <div className={styles.orderList}>
            {orders.map((order) => (
              <div key={order.id} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <div className={styles.orderMeta}>
                    <div className={styles.orderTitle}>{order.package_title || `${order.country_name} eSIM`}</div>
                    <div className={styles.orderDetails}>
                      {order.data_amount} · {order.validity_days} days · {order.country_name}
                    </div>
                  </div>
                  <div className={styles.orderRight}>
                    <span className={`${styles.status} ${statusColor(order.status)}`}>{order.status}</span>
                    <div className={styles.orderPrice}>SGD {parseFloat(order.price_sgd).toFixed(2)}</div>
                  </div>
                </div>

                <div className={styles.orderBottom}>
                  <div className={styles.orderCode}>
                    <span className={styles.orderCodeLabel}>Order</span>
                    <span className={styles.orderCodeVal}>{order.order_code}</span>
                  </div>
                  <div className={styles.orderDate}>
                    {new Date(order.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  {order.qr_url && (
                    <a href={order.qr_url} target="_blank" rel="noreferrer" className={styles.btnQR}>
                      View QR code →
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => generateReceiptPDF(order)}
                    className={styles.btnQR}
                    style={{ background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Receipt (PDF) ⬇
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
