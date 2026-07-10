import React, { useState } from 'react';
import styles from './PlacePicker.module.css';

const TRUST_BADGES = {
  michelin:    { label: 'Michelin',           icon: '🌟', cls: 'badgeMichelin' },
  unesco:      { label: 'UNESCO',             icon: '🏛️', cls: 'badgeUnesco' },
  tourism:     { label: 'Tourism Board',      icon: '🗺️', cls: 'badgeTourism' },
  tripadvisor: { label: "Travellers' Choice", icon: '⭐', cls: 'badgeTripadvisor' },
  gem:         { label: 'Local Gem',          icon: '💎', cls: 'badgeGem' },
  ai:          { label: 'AI Recommended',     icon: '🤖', cls: 'badgeAi' },
};

export default function PlacePicker({ destination, places, onConfirm, onBack, loading }) {
  // Core places (what the traveller actually asked for) are pre-selected.
  // Optional places (Stage 3's overproduced "bonus" suggestions) are shown
  // but start unchecked — the traveller opts into extras rather than having
  // to notice and untick things they never asked for. Anything without a
  // tier field (older data, or a fallback add) is treated as core.
  const corePlaces = places.filter((p) => p.tier !== 'optional');
  const optionalPlaces = places.filter((p) => p.tier === 'optional');

  const [selected, setSelected] = useState(() => new Set(corePlaces.map((p) => p.id)));
  const [customPlace, setCustomPlace] = useState('');
  const [customPlaces, setCustomPlaces] = useState([]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === places.length + customPlaces.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set([...places.map((p) => p.id), ...customPlaces.map((p) => p.id)]));
    }
  }

  function addCustomPlace() {
    const name = customPlace.trim();
    if (!name) return;
    const id = `custom-${Date.now()}`;
    const place = { id, name, type: 'Your pick', description: 'Added by you', trust: null, lat: null, lng: null, day: null, isCustom: true };
    setCustomPlaces((prev) => [...prev, place]);
    setSelected((prev) => new Set(prev).add(id));
    setCustomPlace('');
  }

  function removeCustom(id) {
    setCustomPlaces((prev) => prev.filter((p) => p.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleConfirm() {
    const allPlaces = [...places, ...customPlaces];
    const chosen = allPlaces.filter((p) => selected.has(p.id));
    onConfirm(chosen);
  }

  const allItems = [...places, ...customPlaces];
  const allChecked = allItems.length > 0 && selected.size === allItems.length;

  // Small inline badges for fields PlacePicker.module.css doesn't have
  // classes for yet — kept visually consistent with trustBadge sizing.
  const inlineBadgeStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
    padding: '3px 8px', borderRadius: 999, marginLeft: 6,
  };

  function renderPlaceCard(place) {
    const badge = place.trust ? TRUST_BADGES[place.trust] : TRUST_BADGES.ai;
    const checked = selected.has(place.id);
    const isUserSpecified = place.source === 'user_specified';
    return (
      <div
        key={place.id}
        className={`${styles.card} ${checked ? styles.cardChecked : ''}`}
        onClick={() => toggle(place.id)}
      >
        <div className={`${styles.checkboxBig} ${checked ? styles.checkboxBigActive : ''}`}>
          {checked ? '✓' : ''}
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardTop}>
            <span className={styles.cardType}>{place.type}</span>
            {place.day && <span className={styles.dayTag}>Day {place.day}</span>}
          </div>
          <div className={styles.cardName}>{place.name}</div>
          <p className={styles.cardDesc}>{place.description}</p>
          <span className={`${styles.trustBadge} ${styles[badge.cls]}`}>
            {badge.icon} {badge.label}
          </span>
          {isUserSpecified && (
            <span style={{ ...inlineBadgeStyle, background: '#EAF2FF', color: '#2A6FDB' }}>
              📌 Your request
            </span>
          )}
          {place.dateUncertain && (
            <span style={{ ...inlineBadgeStyle, background: '#FFF3E0', color: '#B26A00' }}>
              📅 Dates TBC
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.btnBack} onClick={onBack}>← Back</button>

      <div className={styles.eyebrow} style={{ marginTop: 20 }}>Recommended for {destination}</div>
      <h1 className={styles.h1}>Pick what you'd like to see</h1>
      <p className={styles.sub}>
        We've researched {corePlaces.length} places to match your pace{optionalPlaces.length > 0 ? `, plus ${optionalPlaces.length} extra suggestions below if you'd like a fuller trip` : ''}. Untick anything that doesn't interest you, or add your own.
      </p>

      <div className={styles.toolbar}>
        <label className={styles.selectAllRow}>
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className={styles.checkbox}
          />
          <span>{allChecked ? 'Deselect all' : 'Select all'}</span>
        </label>
        <div className={styles.countBadge}>{selected.size} of {allItems.length} selected</div>
      </div>

      <div className={styles.grid}>
        {corePlaces.map(renderPlaceCard)}

        {customPlaces.map((place) => {
          const checked = selected.has(place.id);
          return (
            <div
              key={place.id}
              className={`${styles.card} ${styles.cardCustom} ${checked ? styles.cardChecked : ''}`}
            >
              <div
                className={`${styles.checkboxBig} ${checked ? styles.checkboxBigActive : ''}`}
                onClick={() => toggle(place.id)}
              >
                {checked ? '✓' : ''}
              </div>
              <div className={styles.cardBody} onClick={() => toggle(place.id)}>
                <div className={styles.cardTop}>
                  <span className={styles.cardType}>Your pick</span>
                </div>
                <div className={styles.cardName}>{place.name}</div>
                <p className={styles.cardDesc}>Added by you — we'll fit this into your itinerary.</p>
              </div>
              <button
                className={styles.removeBtn}
                onClick={(e) => { e.stopPropagation(); removeCustom(place.id); }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {optionalPlaces.length > 0 && (
        <>
          <div style={{ marginTop: 32, marginBottom: 8 }}>
            <div className={styles.eyebrow}>Want a fuller trip?</div>
            <p className={styles.sub} style={{ marginTop: 4 }}>
              {optionalPlaces.length} more places we found — add any that catch your eye.
            </p>
          </div>
          <div className={styles.grid}>
            {optionalPlaces.map(renderPlaceCard)}
          </div>
        </>
      )}

      {/* Add your own place */}
      <div className={styles.addCard}>
        <div className={styles.addLabel}>Know somewhere we missed?</div>
        <div className={styles.addRow}>
          <input
            type="text"
            placeholder="e.g. Tian Tian Hainanese Chicken Rice"
            value={customPlace}
            onChange={(e) => setCustomPlace(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomPlace()}
            className={styles.addInput}
          />
          <button className={styles.addBtn} onClick={addCustomPlace}>Add</button>
        </div>
      </div>

      <button
        className={styles.btnConfirm}
        onClick={handleConfirm}
        disabled={selected.size === 0 || loading}
      >
        {loading ? 'Building your itinerary…' : `Build itinerary with ${selected.size} places →`}
      </button>
    </div>
  );
}
