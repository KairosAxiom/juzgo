import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import styles from './Pages.module.css';

export default function SavedItineraries() {
  const [itineraries, setItineraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login'); return; }
      fetchItineraries(session.user.id);
    });
  }, []);

  async function fetchItineraries(userId) {
    const { data } = await supabase
      .from('saved_itineraries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setItineraries(data || []);
    setLoading(false);
  }

  async function deleteItinerary(id) {
    if (!window.confirm('Delete this itinerary?')) return;
    await supabase.from('saved_itineraries').delete().eq('id', id);
    setItineraries((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.eyebrow}>My trips</div>
        <h1 className={styles.h1}>Saved Itineraries</h1>
        <p className={styles.sub}>Your AI-generated travel plans, saved for easy reference.</p>

        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /></div>
        ) : itineraries.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🗺️</div>
            <h3 className={styles.emptyH3}>No saved itineraries</h3>
            <p className={styles.emptySub}>Generate a trip plan and save it to see it here.</p>
            <button className={styles.btnPrimary} onClick={() => navigate('/itinerary')}>
              Plan a trip →
            </button>
          </div>
        ) : (
          <div className={styles.itinGrid}>
            {itineraries.map((itin) => (
              <div key={itin.id} className={styles.itinCard}>
                <div className={styles.itinTop}>
                  <div>
                    <h3 className={styles.itinTitle}>{itin.destination}</h3>
                    <div className={styles.itinDate}>
                      {new Date(itin.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <div className={styles.itinActions}>
                    <button
                      className={styles.btnView}
                      onClick={() => setExpanded(expanded === itin.id ? null : itin.id)}
                    >
                      {expanded === itin.id ? 'Collapse' : 'View'}
                    </button>
                    <button className={styles.btnDelete} onClick={() => deleteItinerary(itin.id)}>Delete</button>
                  </div>
                </div>
                {expanded === itin.id && (
                  <div className={styles.itinContent}>{itin.content}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
